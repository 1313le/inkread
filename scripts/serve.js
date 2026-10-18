/* ============================================================
   serve.js · 墨读 InkRead 本地静态服务器
   —— 桌面端（electron/main.js）与开发（npm run serve）共用。
   —— 为什么不用 file:// 打开：应用大量依赖 localStorage 与跨域 fetch
      （用户自填的模型接口），file:// 下 origin 为 opaque，fetch 必被拦。
      跑在 http://127.0.0.1:PORT 上才是正常网页环境。
   —— 静态服务只用 Node 内置 http / fs / path；
      /api/tts 走可选的 node-edge-tts（缺包时该路由降级报错，静态服务不受影响）。
   ============================================================ */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..", "ink-reader");

/* Mossland 音色库不开放跨域，页面直连必被浏览器拦下 ——
   由本地服务代取一次再回给页面。只读、只允许白名单路径。 */
const MOSS_HOST = "mossland.studio";
const MOSS_ALLOW = /^\/api\/v1\/(voices|voices\/featured|library-collections|voice-tags)(\?|$)/;

/* 页面请求 /api/moss/voices?limit=80 → 上游 https://mossland.studio/api/v1/voices?limit=80 */
function proxyMoss(req, res) {
  const u = req.url || "";
  const q = u.indexOf("?");
  const p = "/api/v1" + u.slice("/api/moss".length, q >= 0 ? q : u.length);
  const search = q >= 0 ? u.slice(q) : "";
  if (!MOSS_ALLOW.test(p + search)) {
    return send(res, 403, JSON.stringify({ code: 403, message: "path not allowed" }), { "Content-Type": "application/json; charset=utf-8" });
  }
  const opts = {
    host: MOSS_HOST, port: 443, path: p + search, method: "GET",
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 InkRead", "Accept-Language": "zh-CN,zh;q=0.9" }
  };
  const up = https.request(opts, (r) => {
    let buf = "";
    r.setEncoding("utf8");
    r.on("data", (c) => { buf += c; if (buf.length > 4e6) { up.destroy(); } });
    r.on("end", () => {
      send(res, r.statusCode === 200 ? 200 : r.statusCode, buf, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=600"
      });
    });
  });
  up.on("error", (e) => send(res, 502, JSON.stringify({ code: 502, message: "上游不可达 · " + e.message }), { "Content-Type": "application/json; charset=utf-8" }));
  up.setTimeout(9000, () => { up.destroy(); send(res, 504, JSON.stringify({ code: 504, message: "上游超时" }), { "Content-Type": "application/json; charset=utf-8" }); });
  up.end();
}

/* ------------------------------------------------------------
   /api/tts · Edge 神经语音合成（本地代取 + 磁盘缓存）
   —— 浏览器的 Web Speech 在 Windows 上只有两三条系统声线，且是 SAPI 机械音，
      这就是「名字不同听着一样、全是冰冷机器音」的病根。改由 Node 侧走
      Microsoft Edge「大声朗读」的神经语音（wss 直连微软公开端点），
      返回真·神经语音 MP3 —— 同一款音色「朗读」与「试听」完全同源。
   —— 磁盘缓存：同一 (音色, 语速, 音高, 文本) 只合成一次，二次朗读秒开。
   —— 浏览器 WebSocket 无法直连该端点（握手头与 GEC 令牌），故必须由本机服务代取。
   ------------------------------------------------------------ */
/* 缓存目录必须在「可写」处：打包成 asar 后 __dirname 是只读归档，往里写必失败，
   而失败就意味着每一款音色都悄悄退回本机 SAPI 机械音 —— 正是「全是冰冷机器音」的病根。
   桌面端由 electron/main.js 用 INKREAD_CACHE 指到 userData；开发态仍落在 .work。 */
function ttsCacheDir() {
  return process.env.INKREAD_CACHE
    ? path.resolve(process.env.INKREAD_CACHE)
    : path.resolve(__dirname, "..", ".work", "tts-cache");
}
/* 只放行 Edge 神经音色短名（zh-CN-XiaoxiaoNeural / en-GB-SoniaNeural …），挡掉任意串注入 */
const TTS_VOICE_RE = /^[a-z]{2,3}-[A-Z]{2}(-[A-Za-z0-9]+)?-[A-Za-z0-9]+Neural$/;
const TTS_MAX = 900;              /* 单次合成上限（超长正文由前端分段） */
const TTS_RATE_RE = /^(default|[+-]?\d{1,3}%)$/;
const TTS_PITCH_RE = /^(default|[+-]?\d{1,3}Hz)$/;

let _EdgeTTS = null, _edgeTried = false;
function EdgeTTS() {
  if (!_edgeTried) {
    _edgeTried = true;
    try { _EdgeTTS = require("node-edge-tts").EdgeTTS; } catch (e) { _EdgeTTS = null; }
  }
  return _EdgeTTS;
}
function ttsKey(voice, rate, pitch, text) {
  return crypto.createHash("sha1").update([voice, rate, pitch, text].join("\u0001")).digest("hex");
}
/* ------------------------------------------------------------
   瞬态失败原地重试：微软端点会零星回 429（probe 实测：28 次冷合成里 2 次
   「Unexpected server response: 429」，成功耗时稳定在 0.9~1.5s，紧邻的下一次
   请求通常就成功）。旧版一次不成就 502，前端一次失败就整本退到机械音 ——
   一次上游抖动毁掉一整晚的听书。重试基调 400/900/1800ms（±25% 抖动）。
   只重试瞬态错；「空音频」是这款音色念不出这段文字的确定性结果，不重试。
   ------------------------------------------------------------ */
const TTS_TRIES = 4;
const TTS_BACKOFF = [400, 900, 1800];
const TTS_RETRYABLE = /\b(408|429|5\d\d)\b|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket hang up|Timed out/;
function isTransientTtsErr(e) {
  const m = String((e && e.message) || e || "");
  return TTS_RETRYABLE.test(m);
}
async function ttsWithRetry(once) {
  let last;
  for (let i = 0; i < TTS_TRIES; i++) {
    try { return await once(); }
    catch (e) {
      last = e;
      if (e && e.empty) throw e;
      if (i === TTS_TRIES - 1 || !isTransientTtsErr(e)) throw e;
      await new Promise((r) => setTimeout(r, Math.round(TTS_BACKOFF[i] * (0.75 + Math.random() * 0.5))));
    }
  }
  throw last;
}
let _ttsRetries = 0;              /* 运行计数：真跑过几次重试，供验收闸取正证 */
const _ttsBusy = new Map();       /* 同键并发只合成一次，其余请求等这一份 */
function synthTo(voice, rate, pitch, text, file) {
  if (fs.existsSync(file)) return Promise.resolve(file);
  const key = ttsKey(voice, rate, pitch, text);
  const busy = _ttsBusy.get(key);
  if (busy) return busy.then(() => file);
  const T = EdgeTTS();
  if (!T) return Promise.reject(new Error("node-edge-tts 未安装"));
  const job = (async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + "." + process.pid + ".part";
    let attempt = 0;
    await ttsWithRetry(async () => {
      if (attempt++) _ttsRetries++;
      /* 上一次尝试可能留下半截 .part：不先删，重试若在「连上之前」就失败，
         renameSync 会把这份残骸当成品收下（旧版没有重试所以碰不到，加了重试就必须删）。 */
      try { fs.unlinkSync(tmp); } catch (e) {}
      const t = new T({ voice, rate: rate || "default", pitch: pitch || "default", timeout: 25000 });
      await t.ttsPromise(text, tmp);
      if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 512) {
        try { fs.unlinkSync(tmp); } catch (e) {}
        /* 服务端「成功」但一个字节都没给：实测是这款音色念不出这段文字
           （英文音色 + 纯中文正文必现）。标 empty，让前端把原因说成「念不出」而不是「没响应」。 */
        const err = new Error("该音色念不出这段文本（返回空音频）");
        err.empty = true;
        throw err;
      }
    });
    fs.renameSync(tmp, file);
  })();
  _ttsBusy.set(key, job);
  job.catch(() => {}).then(() => _ttsBusy.delete(key));
  return job.then(() => file);
}
function serveTTS(req, res) {
  const q = new URL(req.url || "/", "http://127.0.0.1").searchParams;
  const voice = (q.get("voice") || "").trim();
  const rate = (q.get("rate") || "default").trim();
  const pitch = (q.get("pitch") || "default").trim();
  let text = (q.get("text") || "").trim();
  const bad = (m) => send(res, 400, JSON.stringify({ code: 400, message: m }), { "Content-Type": "application/json; charset=utf-8" });
  if (!TTS_VOICE_RE.test(voice)) return bad("voice 不合法");
  if (!TTS_RATE_RE.test(rate)) return bad("rate 不合法");
  if (!TTS_PITCH_RE.test(pitch)) return bad("pitch 不合法");
  if (!text) return bad("text 为空");
  if (text.length > TTS_MAX) text = text.slice(0, TTS_MAX);

  const file = path.join(ttsCacheDir(), ttsKey(voice, rate, pitch, text) + ".mp3");
  synthTo(voice, rate, pitch, text, file).then((f) => {
    fs.readFile(f, (err, buf) => {
      if (err) return send(res, 500, JSON.stringify({ code: 500, message: "读取失败" }), { "Content-Type": "application/json; charset=utf-8" });
      send(res, 200, req.method === "HEAD" ? "" : buf, {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=604800",
        "Access-Control-Allow-Origin": "*"
      });
    });
  }).catch((e) => {
    /* 状态码沿用 502（前端 fetchClip 只认 ok与否，不因此改变行为）；
       body 里带 empty 标志，把「这款音色念不出」与「服务没响应」区分开 —— 两者的处置完全不同。 */
    const empty = !!(e && e.empty);
    send(res, 502, JSON.stringify({
      code: 502, empty: empty,
      message: empty ? String((e && e.message) || "返回空音频") : "合成失败 · " + ((e && e.message) || e)
    }), { "Content-Type": "application/json; charset=utf-8" });
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ "Cache-Control": "no-cache" }, headers || {}));
  res.end(body);
}

/* ------------------------------------------------------------
   v2.0 静态资源管线：gzip + ETag 协商缓存
   —— 本地服务虽快，但 styles.css/正文 JSON 动辄几百 KB，gzip 后首屏
      与翻页请求的传输量降一个数量级；ETag 命中直接 304，连正文都不回传。
   —— 压缩结果按 (路径 + mtime) 缓存，文件没变就不再重复压缩。
   ------------------------------------------------------------ */
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".svg", ".txt", ".md"]);
const gzCache = new Map();          /* key: abs + mtimeMs → { etag, gz } */
function serveStatic(req, res, abs, buf) {
  const type = MIME[path.extname(abs).toLowerCase()] || "application/octet-stream";
  const mtime = fs.statSync(abs).mtimeMs;
  const etag = `"${buf.length.toString(16)}-${Math.floor(mtime).toString(16)}"`;
  if (req.headers["if-none-match"] === etag) {
    return send(res, 304, "", { ETag: etag });
  }
  const headers = { "Content-Type": type, ETag: etag };
  const ext = path.extname(abs).toLowerCase();
  if (!COMPRESSIBLE.has(ext) || !String(req.headers["accept-encoding"] || "").includes("gzip")) {
    return send(res, 200, req.method === "HEAD" ? "" : buf, headers);
  }
  const key = abs + ":" + mtime;
  let gz = gzCache.get(key);
  if (!gz) {
    gz = { etag: etag, gz: zlib.gzipSync(buf, { level: 6 }) };
    if (gzCache.size > 60) gzCache.delete(gzCache.keys().next().value);
    gzCache.set(key, gz);
  }
  send(res, 200, req.method === "HEAD" ? "" : gz.gz, Object.assign(headers, {
    "Content-Encoding": "gzip", Vary: "Accept-Encoding"
  }));
}

function resolveSafe(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  if (p === "/" || p === "") p = "/index.html";
  const abs = path.resolve(ROOT, "." + p);
  /* 目录穿越防护：解析后的绝对路径必须仍在 ROOT 之内 */
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

/* ------------------------------------------------------------
   /api/store · 双端数据快照（v2.3 真·同步的权威副本）
   —— 页面把 inkread.* 键的时间戳信封推上来，这里落盘；任何一台设备
      （桌面本机 / 局域网里的手机浏览器）访问同一服务都读写这一份 —— 真同步。
   —— 合并规则：每键 last-write-wins（t 大者胜），并发推送不互相抹掉。
   —— 位置：INKREAD_SYNC（桌面端主进程指向 userData），开发态 .work/。
   ------------------------------------------------------------ */
const SYNC_MAX = 4 * 1024 * 1024;
/* 设备本地配置，含明文 API Key，一律不进同步快照。
   /api/store 对局域网开放是「双端同步」的物理前提，不能因此收回到本机；
   所以改由这里把密钥挡在快照之外 —— GET 不回传、POST 落盘前剔除，
   历史快照里已存进去的密钥也会在第一次写入时被洗掉。 */
const SYNC_REDACT = ["inkread.ai.model.v1", "inkread.tts.v1"];
function redactSnapshot(o) {
  if (o && o.data && typeof o.data === "object") SYNC_REDACT.forEach((k) => { delete o.data[k]; });
  return o;
}
function mayContainSecret(s) {
  return SYNC_REDACT.some((k) => s.indexOf(k) >= 0);
}
function syncFile() {
  return process.env.INKREAD_SYNC || path.resolve(__dirname, "..", ".work", "sync-store.json");
}
function serveStore(req, res) {
  const file = syncFile();
  const jh = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  if (req.method === "GET" || req.method === "HEAD") {
    let body = '{"data":{},"client":null,"updatedAt":0}';
    try {
      if (fs.existsSync(file)) {
        body = fs.readFileSync(file, "utf8");
        if (mayContainSecret(body)) { try { body = JSON.stringify(redactSnapshot(JSON.parse(body))); } catch (e) {} }
      }
    } catch (e) {}
    return send(res, 200, req.method === "HEAD" ? "" : body, jh);
  }
  if (req.method === "POST") {
    let raw = "";
    let dead = false;
    req.setEncoding("utf8");
    /* 超限不再掐断连接（req.destroy 只会让客户端拿到 ECONNRESET：既不知道大到哪里，
       也没机会处理这批数据）。改为继续排空、如实回 413，与 readBody 同一套做法。 */
    req.on("data", (c) => { if (dead) return; raw += c; if (raw.length > SYNC_MAX) dead = true; });
    req.on("end", () => {
      if (dead) return send(res, 413, '{"code":413,"message":"请求体过大","oversize":true}', jh);
      let incoming = null;
      try { incoming = JSON.parse(raw); } catch (e) {}
      if (!incoming || typeof incoming.data !== "object" || incoming.data === null) {
        return send(res, 400, '{"code":400,"message":"bad payload"}', jh);
      }
      let cur = { data: {}, client: null, updatedAt: 0 };
      try { if (fs.existsSync(file)) cur = JSON.parse(fs.readFileSync(file, "utf8")) || cur; } catch (e) {}
      const merged = Object.assign({}, cur.data);
      let applied = 0;
      Object.keys(incoming.data).forEach((k) => {
        const a = incoming.data[k];
        const b = merged[k];
        if (!a || typeof a.t !== "number") return;
        if (!b || a.t >= (b.t || 0)) { merged[k] = a; applied++; }
      });
      const out = { data: redactSnapshot({ data: merged }).data, client: incoming.client || cur.client || null, updatedAt: Date.now() };
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = file + "." + process.pid + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(out));
        fs.renameSync(tmp, file);
      } catch (e) {
        return send(res, 500, '{"code":500,"message":"write failed"}', jh);
      }
      send(res, 200, JSON.stringify({ code: 0, applied, updatedAt: out.updatedAt }), jh);
    });
    return;
  }
  send(res, 405, '{"code":405,"message":"method not allowed"}', jh);
}

/* ------------------------------------------------------------
   通用小件：读请求体（带上限）
   ------------------------------------------------------------ */
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, dead = false;
    req.on("data", (c) => {
      if (dead) return;   /* 超限后继续排空而不是掐断：连接活着，413 才送得到客户端 */
      size += c.length;
      if (size > max) { dead = true; return; }
      chunks.push(c);
    });
    req.on("end", () => { if (dead) reject(new Error("body too large")); else resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

/* ------------------------------------------------------------
   /api/geo · IP 城市级定位兜底（v2.13）
   —— 桌面端 navigator.geolocation 依赖 Google 网络定位服务，应用不带
      API Key 必失败（electron#1376）。IP 定位只有城市级精度，但推算
      日出日落绰绰有余（几百公里内日出只差几分钟）。
   —— 双上游互备：ipwho.is（HTTPS 免 Key）→ ip-api.com（免 Key，免费档仅
      HTTP——由本机服务代取，浏览器侧不涉混合内容）。结果内存缓存 10 分钟。
   ------------------------------------------------------------ */
let _geoCache = { at: 0, data: null };
function httpGetText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const mod = url.indexOf("https:") === 0 ? https : http;
    const r = mod.get(url, { headers: { "User-Agent": "Mozilla/5.0 InkRead", Accept: "application/json" } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { buf += c; if (buf.length > 1e6) r.destroy(); });
      res.on("end", () => resolve(buf));
    });
    r.on("error", reject);
    r.setTimeout(timeoutMs, () => { r.destroy(); reject(new Error("timeout")); });
  });
}
function serveGeo(req, res) {
  const jh = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  const now = Date.now();
  if (_geoCache.data && now - _geoCache.at < 600000) {
    return send(res, 200, JSON.stringify({ code: 0, data: _geoCache.data }), jh);
  }
  const pick = (lat, lon, city) => {
    lat = Number(lat); lon = Number(lon);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return { lat: +lat.toFixed(4), lon: +lon.toFixed(4), city: String(city || ""), source: "ip" };
  };
  (async () => {
    try {
      const j = JSON.parse(await httpGetText("https://ipwho.is/", 6000));
      const d = pick(j.latitude, j.longitude, j.city);
      if (d) return d;
    } catch (e) {}
    try {
      const j = JSON.parse(await httpGetText("http://ip-api.com/json/?fields=status,city,lat,lon", 6000));
      if (j.status === "success") { const d = pick(j.lat, j.lon, j.city); if (d) return d; }
    } catch (e) {}
    return null;
  })().then((d) => {
    if (!d) return send(res, 200, JSON.stringify({ code: 1, message: "IP 定位不可用" }), jh);
    _geoCache = { at: now, data: d };
    send(res, 200, JSON.stringify({ code: 0, data: d }), jh);
  });
}

/* ------------------------------------------------------------
   /api/llm · OpenAI 兼容端点的本机透传（v2.23）
   —— 成品里 main.js 会给所有响应补 Access-Control-Allow-Origin，浏览器没有这层：
      直连 api.openai.com 这类服务时请求发得出去、响应读不回来，界面却把它说成
      「连通失败」。开发态与静态托管因此和成品不一致，这里由本机代取一次对齐行为。
   —— 三条硬约束：
      ① 只接受本机回环发起的请求 —— /api/store 对局域网开放是双端同步的物理前提，
         透传不能跟着开放，否则这台机器就成了任意内网请求的跳板；
      ② Key 只随请求体进来、只写进上游的 Authorization 头：不落盘、不打日志、不缓存；
      ③ 上游状态码与字节原样回吐（含 SSE 流），本路由零本地状态 ——
         既写不进快照，也进不了同步。
   ------------------------------------------------------------ */
function llmPeerLocal(req) {
  const a = String((req.socket && req.socket.remoteAddress) || "").replace(/^::ffff:/, "");
  return a === "127.0.0.1" || a === "::1" || /^127\./.test(a);
}
function llmTarget(cfg) {
  let base;
  try { base = new URL(String(cfg.baseUrl || "")); } catch (e) { return null; }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  if (!base.hostname || base.username || base.password) return null;
  const sub = String(cfg.path || "");
  /* 白名单死守三个端点：透传不是通用代理，路径由不得前端随意给 */
  if (!/^\/(models|chat\/completions|embeddings)$/.test(sub)) return null;
  return {
    mod: base.protocol === "https:" ? https : http,
    host: base.hostname,
    port: base.port || (base.protocol === "https:" ? 443 : 80),
    path: base.pathname.replace(/\/+$/, "") + sub
  };
}
function serveLlm(req, res) {
  const jh = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  const bad = (code, msg) => send(res, code, JSON.stringify({ code, message: msg }), jh);
  if (!llmPeerLocal(req)) return bad(403, "llm 透传只对本机开放");
  if (req.method === "GET" || req.method === "HEAD") {
    return send(res, 200, JSON.stringify({ code: 0, data: { ok: true, via: "api/llm" } }), jh);
  }
  if (req.method !== "POST") return bad(405, "method not allowed");
  readBody(req, 8 * 1024 * 1024).then((buf) => {
    let cfg;
    try { cfg = JSON.parse(buf.toString("utf8")) || {}; } catch (e) { return bad(400, "JSON 不合法"); }
    const t = llmTarget(cfg);
    if (!t) return bad(400, "接口地址或路径不合法（只代取 /models、/chat/completions、/embeddings）");
    const payload = cfg.body ? JSON.stringify(cfg.body) : null;
    const heads = {
      Authorization: "Bearer " + String(cfg.key || ""),
      Accept: "*/*", "User-Agent": "Mozilla/5.0 InkRead"
    };
    if (payload) { heads["Content-Type"] = "application/json"; heads["Content-Length"] = Buffer.byteLength(payload); }
    const method = String(cfg.method || (payload ? "POST" : "GET")).toUpperCase();
    const up = t.mod.request({ host: t.host, port: t.port, path: t.path, method, headers: heads, timeout: 120000 }, (r) => {
      const out = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
      if (r.headers["content-type"]) out["Content-Type"] = r.headers["content-type"];
      res.writeHead(r.statusCode, out);
      r.pipe(res);
    });
    up.on("error", () => {
      if (res.headersSent) return res.end();
      bad(502, "上游不可达（地址、端口或网络问题）");
    });
    up.setTimeout(120000, () => up.destroy(new Error("llm upstream timeout")));
    if (payload) up.write(payload);
    up.end();
  }).catch(() => bad(413, "请求体过大"));
}

/* ------------------------------------------------------------
   /api/mossapi · 用户自配 Moss 云音色代理（v2.13）
   —— api.mosi.cn 这类 TTS 端点不对浏览器开放 CORS（官方只保证服务端调用；
      mossland.studio 当年同病，/api/moss 代理即先例）。拉取音色与云端合成
      一律由本机代取：Key 只随请求体在本机回环流转，不落盘、不进日志。
   —— 合成响应归一为音频字节：上游若回「JSON 带 URL」（delivery_method:url），
      由代理代取该 URL 再回字节流，浏览器不再二次跨域。
   ------------------------------------------------------------ */
function mossTarget(cfg, sub) {
  let base;
  try { base = new URL(String(cfg.baseUrl || "")); } catch (e) { return null; }
  if (base.protocol !== "https:" || !base.hostname) return null;
  return { host: base.hostname, port: base.port || 443, path: base.pathname.replace(/\/+$/, "") + sub };
}
function serveMossApi(req, res) {
  const jh = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  if (req.method !== "POST") return send(res, 405, JSON.stringify({ code: 405, message: "method not allowed" }), jh);
  readBody(req, 256 * 1024).then((buf) => {
    let cfg;
    try { cfg = JSON.parse(buf.toString("utf8")) || {}; } catch (e) { return send(res, 400, JSON.stringify({ code: 400, message: "JSON 不合法" }), jh); }
    const key = String(cfg.key || "");
    if (!key) return send(res, 400, JSON.stringify({ code: 400, message: "缺少 Moss API Key" }), jh);
    const isSpeech = req.url.indexOf("/api/mossapi/speech") === 0;
    const t = mossTarget(cfg, isSpeech ? "/audio/speech" : "/audio/voices");
    if (!t) return send(res, 400, JSON.stringify({ code: 400, message: "接口地址需为 https:// 开头的合法 URL" }), jh);
    const fail = (code, msg) => { try { send(res, code, JSON.stringify({ code, message: msg }), jh); } catch (e) {} };
    if (isSpeech) {
      const payload = JSON.stringify({
        model: String(cfg.model || "moss-tts-1.5-flash"),
        input: String(cfg.input || "").slice(0, 4096),
        voice_id: String(cfg.voice_id || ""),
        response_format: "mp3", delivery_method: "url"
      });
      const up = https.request({
        host: t.host, port: t.port, path: t.path, method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key, "Content-Length": Buffer.byteLength(payload), Accept: "*/*", "User-Agent": "Mozilla/5.0 InkRead" }
      }, (r) => {
        if (r.statusCode !== 200) {
          let msg = ""; r.setEncoding("utf8");
          r.on("data", (c) => { msg += c; if (msg.length > 4096) r.destroy(); });
          return r.on("end", () => fail(502, "上游 " + r.statusCode + " · " + msg.slice(0, 200)));
        }
        const ct = String(r.headers["content-type"] || "");
        if (ct.indexOf("audio/") === 0) {
          res.writeHead(200, { "Content-Type": ct, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
          r.pipe(res);
          return;
        }
        /* JSON 带 URL：代理代取音频字节，浏览器侧零二次跨域 */
        let out = ""; r.setEncoding("utf8");
        r.on("data", (c) => { out += c; if (out.length > 1e6) up.destroy(); });
        r.on("end", () => {
          let audioUrl = "";
          try {
            const j = JSON.parse(out);
            audioUrl = j.url || (j.data && j.data.url) || j.audio_url || "";
          } catch (e) {}
          if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) return fail(502, "上游未返回音频");
          const mod = audioUrl.indexOf("https:") === 0 ? https : http;
          const dl = mod.get(audioUrl, { headers: { "User-Agent": "Mozilla/5.0 InkRead" } }, (r2) => {
            if (r2.statusCode !== 200) { r2.resume(); return fail(502, "音频下载 HTTP " + r2.statusCode); }
            res.writeHead(200, { "Content-Type": r2.headers["content-type"] || "audio/mpeg", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
            r2.pipe(res);
          });
          dl.on("error", () => fail(502, "音频下载失败"));
          dl.setTimeout(30000, () => { dl.destroy(); fail(504, "音频下载超时"); });
        });
      });
      up.on("error", (e) => fail(502, "上游不可达 · " + e.message));
      up.setTimeout(60000, () => { up.destroy(); fail(504, "合成超时"); });
      up.end(payload);
    } else {
      const up = https.request({
        host: t.host, port: t.port, path: t.path, method: "GET",
        headers: { "Authorization": "Bearer " + key, Accept: "application/json", "User-Agent": "Mozilla/5.0 InkRead" }
      }, (r) => {
        let out = ""; r.setEncoding("utf8");
        r.on("data", (c) => { out += c; if (out.length > 4e6) up.destroy(); });
        r.on("end", () => {
          if (r.statusCode !== 200) return fail(502, "上游 " + r.statusCode + " · " + out.slice(0, 200));
          send(res, 200, out, jh);
        });
      });
      up.on("error", (e) => fail(502, "上游不可达 · " + e.message));
      up.setTimeout(12000, () => { up.destroy(); fail(504, "拉取超时"); });
      up.end();
    }
  }).catch((e) => send(res, 413, JSON.stringify({ code: 413, message: e && e.message === "body too large" ? "请求体过大" : String(e && e.message || e) }), { "Content-Type": "application/json; charset=utf-8" }));
}

/* ------------------------------------------------------------
   /api/parse · 智能格式解析（v2.13）
   —— DOCX / PPTX / PDF 从「只归档」升级为「解析出正文块」。POST 原始
      字节，格式由内容（魔数）说了算，不信任扩展名与 URL 子路径：
      %PDF-→pdf；PK..+包内 xl/ →xlsx、word/ →docx、ppt/→pptx；D0CF..→老版 OLE
      （明确劝退另存，不假装能解）；图片魔数→image；UTF-8 可解→text。
   —— 解析组件按需加载（mammoth / pdfjs-dist / jszip），装没装都不影响
      服务启动；没装或解析失败如实回 code 1，前端降级为只归档。
   ------------------------------------------------------------ */
const PARSE_MAX = 25 * 1024 * 1024;
let _mammoth = null, _mammothTried = false;
let _jszip = null, _jszipTried = false;
let _pdfjs = null, _pdfjsTried = false;
function lazyMammoth() {
  if (!_mammothTried) { _mammothTried = true; try { _mammoth = require("mammoth"); } catch (e) { _mammoth = null; } }
  return _mammoth;
}
function lazyJszip() {
  if (!_jszipTried) { _jszipTried = true; try { _jszip = require("jszip"); } catch (e) { _jszip = null; } }
  return _jszip;
}
async function lazyPdfjs() {
  if (!_pdfjsTried) {
    _pdfjsTried = true;
    try { _pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); }
    catch (e) { try { _pdfjs = await import("pdfjs-dist/build/pdf.mjs"); } catch (e2) { _pdfjs = null; } }
  }
  const mod = _pdfjs && (_pdfjs.getDocument ? _pdfjs : _pdfjs.default);
  return mod && mod.getDocument ? mod : null;
}

/* ------------------------------------------------------------
   zip 与解析的三道安全闸（v2.21 E1 · EPUB 与 docx/pptx/xlsx 共用）
   —— jszip 不净化条目名：实测 "../../evil.xhtml"、"/abs.xhtml" 照单收下，
      所以落盘前必须由这里夹住，违规条目跳过并计数、如实上报。
   —— 解压前就能算出炸弹体积：中央目录里的 uncompressedSize 不用真的解压
      （实测 200KB 的文件声明 200MB / 1020 倍），先拒再解。
   —— 解压是整段进内存的活儿：同一时刻只放一个解析进来，其余回「正忙」。
   ------------------------------------------------------------ */
const ZIP_MAX_ABS = 256 * 1024 * 1024;      /* 解压后总体积硬顶 */
const ZIP_MAX_FLOOR = 64 * 1024 * 1024;     /* 压缩比再低也至少给这么多正文 */
const ZIP_MAX_RATIO = 20;                   /* 压缩后 → 解压后的允许倍率 */
const MB = (n) => (n / 1048576).toFixed(1) + "MB";

function entryBad(name) {
  const s = String(name == null ? "" : name);
  if (!s) return "空条目名";
  if (s.indexOf("\u0000") >= 0) return "含 NUL";
  if (/^[a-zA-Z]:[\\/]/.test(s)) return "带盘符";
  if (s[0] === "/" || s[0] === "\\") return "绝对路径";
  return s.split(/[\\/]+/).some((p) => p === "..") ? "目录穿越" : "";
}

async function loadZipSafe(buf) {
  const JSZip = lazyJszip();
  if (!JSZip) throw new Error("解析组件未安装");
  const zip = await JSZip.loadAsync(buf);
  let rejected = 0, inflated = 0;
  for (const n of Object.keys(zip.files)) {
    if (entryBad(n)) { delete zip.files[n]; rejected++; continue; }
    const f = zip.files[n];
    if (f.dir) continue;
    const u = f._data && f._data.uncompressedSize;
    if (typeof u === "number" && isFinite(u) && u >= 0) inflated += u;
  }
  const cap = Math.min(ZIP_MAX_ABS, Math.max(ZIP_MAX_FLOOR, buf.length * ZIP_MAX_RATIO));
  if (inflated > cap) {
    const e = new Error("压缩包异常（解压后约 " + MB(inflated) + "，是文件本身 " +
      (buf.length / 1024).toFixed(0) + "KB 的 " + Math.round(inflated / Math.max(1, buf.length)) +
      " 倍），已按原样退回");
    e.zipBomb = true;
    throw e;
  }
  return { zip, rejected, inflated };
}

let _parsing = false;
function parseGate() { if (_parsing) return false; _parsing = true; return true; }
function parseRelease() { _parsing = false; }

/* EPUB 嗅探：先按规范读首个本地文件头（名字长度 @26、extra 长度 @28、名字从 @30 起），
   名字 = "mimetype" 且内容以 application/epub+zip 开头即认。实测样例落在这条上
   （偏移 38 处正是该串）。个别打包器把 mimetype 挪了位置或加了 extra field，
   再用 META-INF/container.xml 兜一次 —— OPC（docx/pptx/xlsx）不带这个文件。 */
function isEpub(buf) {
  if (buf.length < 46) return false;
  try {
    const nameLen = buf.readUInt16LE(26), extraLen = buf.readUInt16LE(28);
    const name = buf.toString("latin1", 30, 30 + nameLen);
    if (name === "mimetype" &&
      buf.toString("latin1", 30 + nameLen + extraLen, 30 + nameLen + extraLen + 20).indexOf("application/epub+zip") === 0) return true;
  } catch (e) {}
  return buf.toString("latin1").indexOf("META-INF/container.xml") >= 0;
}

function sniffKind(buf) {
  const n = Math.min(buf.length, 4096);
  const head = buf.toString("latin1", 0, n);
  if (head.slice(0, 5) === "%PDF-") return "pdf";
  if (head.slice(0, 4) === "PK\u0003\u0004") {
    /* EPUB 先判，按规范读首个本地头：条目名必须是 mimetype（stored、无 extra field），
       内容紧跟其后 = application/epub+zip。个别打包器加了 extra field 或改了顺序，
       退一步用 META-INF/container.xml 作证（OPC 的 docx/pptx 用的是 _rels/.rels，不冲突）。 */
    if (isEpub(buf)) return "epub";
    /* zip 中央目录在尾部明文列出包路径：整段扫 word/ 与 ppt/ */
    const hay = buf.toString("latin1");
    if (hay.indexOf("xl/") >= 0) return "xlsx";
    if (hay.indexOf("word/") >= 0) return "docx";
    if (hay.indexOf("ppt/") >= 0) return "pptx";
    return "zip";
  }
  if (buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return "ole";
  if (head.slice(0, 4) === "\u0089PNG") return "image";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image";
  if (head.slice(0, 4) === "RIFF" && head.slice(8, 12) === "WEBP") return "image";
  /* UTF-16（记事本「Unicode」另存）正文里成串 NUL，先于二进制判定认下来 */
  if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) return "text";
  if (looksBinary(head)) return "unknown";
  /* 文本判定要认 GBK / Big5：国内网站下载的 .txt 有相当比例是 GBK，
     只认 UTF-8 会把整本书判成「无法识别的格式」。真正的定码交给 decodeText。 */
  const seg = buf.subarray(0, n);
  if (decodesSampled("utf-8", seg) || decodesSampled("gbk", seg) || decodesSampled("big5", seg)) return "text";
  return "unknown";
}
/* 采样只取头 4KB，切口大概率落在半个汉字上（中文一字三字节）：
   严格解码被这半个字符绊倒，整本中文 txt 就会被判成「无法识别的文件格式」。
   退掉尾部最多 3 字节再判，真·定码仍交给 decodeText 对整份字节流做。 */
function decodesSampled(enc, buf) {
  for (let cut = 0; cut <= 3; cut++) {
    if (decodes(enc, buf.subarray(0, Math.max(0, buf.length - cut)))) return true;
  }
  return false;
}
function decodes(enc, buf) {
  try { new TextDecoder(enc, { fatal: true }).decode(buf); return true; } catch (e) { return false; }
}
/* NUL 或成串的不可打印字节 = 二进制，别当文本硬解 */
function looksBinary(head) {
  let ctrl = 0;
  for (let i = 0; i < head.length; i++) {
    const c = head.charCodeAt(i);
    if (c === 0) return true;
    if (c < 32 && c !== 9 && c !== 10 && c !== 12 && c !== 13) ctrl++;
  }
  return ctrl > head.length * 0.02;
}
/* 正文解码：先整体严格 UTF-8；不是，则按 GBK / Big5 严格解（混合编码的
   ASCII 头 + GBK 尾正好落在这一档）。只有「开头确为含中文的 UTF-8」才在
   个别坏字节处退回宽松解，避免把真 UTF-8 文件误判成 GBK 而满屏乱码。
   返回 {text, encoding}；encoding 如实回给界面标注。全都不通返回 null。 */
function decodeText(buf) {
  const body = buf.length >= 2 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe)
    return { text: new TextDecoder("utf-16le").decode(buf.subarray(2)), encoding: "utf-16" };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff)
    return { text: new TextDecoder("utf-16be").decode(buf.subarray(2)), encoding: "utf-16" };
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8" }; } catch (e) {}
  const n = Math.min(buf.length, 4096);
  let headUtf8WithCjk = false;
  try {
    const h = new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(0, n));
    headUtf8WithCjk = /[^\x00-\x7f]/.test(h);
  } catch (e) {}
  if (headUtf8WithCjk) return { text: new TextDecoder("utf-8").decode(body), encoding: "utf-8（个别字节损坏）" };
  const strict = (enc) => { try { return new TextDecoder(enc, { fatal: true }).decode(body); } catch (e) { return null; } };
  const gbk = strict("gbk"), big5 = strict("big5");
  /* GBK 的字节空间包住 Big5：Big5 正文能被 GBK「严格」解成一堆不相干的简体字，反之
     简中正文也常能整本落进 Big5 的取值区间。解得开不等于解得对 —— 两边都解得开时
     按常用字占比定夺：解错了就是在全 CJK 字符表里随机走（占比 ~1%），解对了是过半。
     拿不准（差距不到 1.2 倍）时默认 GBK —— 大陆来源的 txt 是绝大多数。 */
  if (gbk && big5) {
    const pick = freqScore(big5) > freqScore(gbk) * 1.2 ? { text: big5, encoding: "big5" } : { text: gbk, encoding: "gbk" };
    return pick;
  }
  if (gbk) return { text: gbk, encoding: "gbk" };
  if (big5) return { text: big5, encoding: "big5" };
  /* 走到这里整本已解不干净：宽松解 + 替换符计数，坏字节极少才采信，
     否则宁可如实报错，也不要塞给用户一本乱码书。 */
  const bad = (s) => (s.match(/\uFFFD/g) || []).length;
  const gb = new TextDecoder("gbk").decode(body);
  if (bad(gb) <= Math.max(1, gb.length * 0.0002)) return { text: gb, encoding: "gbk" };
  const bi = new TextDecoder("big5").decode(body);
  if (bad(bi) <= Math.max(1, bi.length * 0.0002)) return { text: bi, encoding: "big5" };
  return null;
}
/* 常用字表（繁简并收，覆盖现代汉语书面高频字）：用于判定一串解码结果像不像中文 */
const FREQ = new Set(("的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里然没日去光总头目条问手见明话体己研计划复习背词完成核心每套真题点上午错" +
  "這為國們於會說種後學電裡別氣字體術語文讀計學習實現經濟國家時間產品問題對於應該東西那個因已經關係際简单單繁體與關圖書頁欄目錄聲響點劃線").split(""));
function freqScore(s) {
  if (!s.length) return 0;
  let n = 0;
  for (const ch of s) if (FREQ.has(ch)) n++;
  return n / s.length;
}

/* EPUB 里的 XHTML 是 XML 序列化（规范只认 5 个预定义实体 + 数字引用），
   但真实书里满篇 &mdash; &copy;——不认就把字面量印到正文上。
   必须在 &amp;→& 之前跑：这样 &amp;mdash; 只会被解成字面 "&mdash;"，不会二次解码。 */
const HTML_ENT = {
  mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®", trade: "™",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", sbquo: "‚", bdquo: "„",
  middot: "·", bull: "•", dagger: "†", Dagger: "‡", permil: "‰",
  ensp: " ", emsp: " ", thinsp: " ", nbsp: " ", shy: "",
  times: "×", divide: "÷", plusmn: "±", ne: "≠", le: "≤", ge: "≥",
  laquo: "«", raquo: "»", lsaquo: "‹", rsaquo: "›",
  sect: "§", para: "¶", deg: "°", prime: "′", Prime: "″",
  sup2: "²", sup3: "³", sup1: "¹", frac12: "½", frac14: "¼",
  euro: "€", pound: "£", yen: "¥", cent: "¢", curren: "¤",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", pi: "π", sigma: "σ",
  omega: "ω", mu: "μ", infin: "∞", sum: "∑", radic: "√", permill: ""
};
function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:#39|apos);/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(+d); } catch (e) { return ""; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ""; } })
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,9});/g, (all, n) => (HTML_ENT[n] != null ? HTML_ENT[n] : all))
    .replace(/&amp;/g, "&");
}
function squeeze(s) { return String(s).replace(/\s+/g, " ").trim(); }

/* 标签属性串 → 对象：正则步进拿到的是 m[2]（含命名空间冒号的原样属性），
   这里统一小写键名并解实体，供 img@src / epub:type / id 取值。 */
const ATTR_RE = /([^\s=/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
function attrsOf(blob) {
  const out = {};
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(String(blob || "")))) {
    const k = m[1].toLowerCase();
    if (out[k] == null) out[k] = decodeEntities(m[2] != null ? m[2] : m[3]);
  }
  return out;
}
/* 只取一个属性时不必建整张表；键名大小写不敏感，拿不到给空串 */
function attrOf(blob, name) {
  const v = attrsOf(blob)[String(name).toLowerCase()];
  return v == null ? "" : v;
}

/* mammoth / EPUB 的扁平 XHTML → 正文块。正则步进的状态机：
   列表用栈（嵌套 ul/ol 挂到上一条目的 sub），表格首行当表头，
   单元格/条目/段落三处文本各回各的缓冲。存原文（读侧 MD.inline 再转义）。
   opts.epub 为真时按 EPUB 扩九处：img 成块、pre 转代码、div/section 断块、
   ruby 剥注音、aside 转注块、MathML 线性化、内联 svg 占位、标题保留作者锚点 id、
   blockquote 归引用块。不开 opts 时与原来逐字节一致（docx 走的就是这条）。 */
function htmlToBlocks(html, opts) {
  const o = opts || {};
  const EP = !!o.epub;
  const blocks = [];
  const re = /<!--[\s\S]*?-->|<\/?\s*([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g;
  const lists = [];
  let item = null;
  let para = "";
  let pend = "";
  let pendId = "";
  let table = null, row = null, cell = null;
  let imgs = 0;
  let hn = 0;
  let preBuf = null, noteBuf = null, noteId = "", noteDepth = 0, rubySkip = false;
  let mathBuf = null, svgDepth = 0, svgGotImg = false, skipText = false;
  /* 正文内链（EPUB 的书内自带目录页、脚注引用、章间互链）：opts.link 判收，
     落地时随所属块一起记下 {bi, cs, len, x, href}。这里只记「哪一段字是个链接」，
     href 指向哪个块由调用方解析 —— 解析要跨文件，得等全书的块与锚点都齐了才认得。
     块的字节形状不动（§九 不动清单），这份侧表单独走 toc.json。 */
  const links = [];
  let pendLinks = [];
  let linkAt = -1, linkHref = "";
  /* 作者锚点 → 块号。标题与注块本来就把 id 挂在块上（读侧大纲要用），其余容器
     （<p id="fn1"> 的脚注、<div id="ch3"> 的章界）落块时 id 就散了 —— 而那些正是
     正文内链最常指的地方。这里另记一份侧表，块的字节形状照旧不动。
     认领规则：开标签记下 id，紧随其后的那个块落地时认领（段落 / 列表项 / 表格 /
     容器边界都是落地点）；下一个开标签先作废旧 id，绝不隔元素误认领。 */
  const idAt = Object.create(null);
  let anchorId = "";
  const markAnchor = () => { if (anchorId && idAt[anchorId] == null) idAt[anchorId] = blocks.length; anchorId = ""; };

  /* 当前正在攒着的那份文本：单元格 / 列表项 / 注块 / 段落四选一，
     与下面 text() 的分流顺序保持一致 —— cs 是相对这份文本量的，
     调用方拿它当「同一个块里出现两次同样的字时该认哪一处」的提示。 */
  const curText = () => (noteBuf != null ? noteBuf : cell != null ? cell : (lists.length && item ? item.x : para));

  /* 块落地：记下块号，把这一段攒下的内链一并带走。
     嵌套列表并进父项 sub 时不走这里（它还不是顶层块），那些链等顶层列表落地时再收 ——
     链的字面就在顶层块的渲染文本里，读侧按字面找得到，块号也就不用细分到子项。 */
  const emit = (b) => {
    const bi = blocks.length;
    blocks.push(b);
    if (pendLinks.length) {
      for (const l of pendLinks) links.push(Object.assign({ bi }, l));
      pendLinks = [];
    }
  };

  const flush = () => {
    markAnchor();
    const t = squeeze(para);
    const tp = pend || "p";
    const pid = pendId;
    para = ""; pend = ""; pendId = "";
    if (!t) return;
    const b = { type: tp, x: t };
    /* 标题挂锚点 id，读侧大纲 / 起读锚定要用；EPUB 优先保留作者自己的 id。
       pid 必须在清 pendId 之前取，否则作者锚点全丢，目录点了只会跳本章第一个标题。 */
    if (/^h[1-3]$/.test(tp)) b.id = (EP && pid) ? "x-" + pid : "h-" + (++hn);
    emit(b);
  };
  const closeCell = () => {
    if (cell == null) return;
    if (!row) row = [];
    row.push(squeeze(cell));
    cell = null;
  };
  const closeRow = () => {
    closeCell();
    if (!row) return;
    if (table) {
      if (!table.head.length) table.head = row; else table.rows.push(row);
    }
    row = null;
  };
  const closeList = () => {
    const fr = lists.pop();
    item = lists.length ? lists[lists.length - 1].items[lists[lists.length - 1].items.length - 1] || null : null;
    if (!fr) return;
    const items = [];
    for (const it of fr.items) {
      const x = squeeze(it.x);
      if (!x && !it.sub.length) continue;
      items.push({ x, sub: it.sub });
    }
    const block = { type: fr.ordered ? "olist" : "list", items };
    const parent = lists[lists.length - 1];
    if (parent && parent.items.length) parent.items[parent.items.length - 1].sub.push(block);
    else emit(block);
  };
  const text = (s) => {
    if (rubySkip) return;
    if (mathBuf != null) { mathBuf += s; return; }
    const t = squeeze(s);
    if (!t) return;
    if (noteBuf != null) { noteBuf += (noteBuf ? " " : "") + t; return; }
    if (cell != null) cell += (cell ? " " : "") + t;
    else if (lists.length && item) item.x += (item.x ? " " : "") + t;
    else para += (para ? " " : "") + t;
  };

  let m;
  while ((m = re.exec(html))) {
    if (m[3] != null) {
      if (skipText || rubySkip) continue;
      if (preBuf != null) { preBuf += decodeEntities(m[3]); continue; }
      if (svgDepth) continue;
      const t = decodeEntities(m[3]);
      if (t.trim()) text(t);
      continue;
    }
    const tag = m[1].toLowerCase();
    const close = m[0][1] === "/";
    const a = EP && !close ? attrsOf(m[2]) : null;
    const selfClose = EP && /\/\s*$/.test(m[2] || "");
    /* 开标签带着作者 id 就把 id 记下来，交给下一个「块起点」（见 markAnchor）；
       闭标签与不带 id 的开标签都作废，免得隔了两个元素的旧 id 认领错块。 */
    if (EP) anchorId = (!close && a && a.id) ? String(a.id) : "";
    /* 作者 CSS / 脚本一律丢弃：不应用、也不让样式表里的字混进正文。
       配对标签缺失时这里仍然兜得住（head 已被 cleanXhtml 剥掉）。 */
    if (EP && (tag === "style" || tag === "script")) { if (!selfClose) skipText = !close; continue; }
    if (svgDepth && tag !== "svg" && tag !== "image") continue;   /* SVG 子节点不取文本 */
    if (EP && tag === "svg") {
      if (close) {
        if (--svgDepth <= 0) {
          svgDepth = 0;
          /* 内部若已抽出可服务的 <image>，就不再补占位，免得一句话两行字 */
          if (!svgGotImg) emit({ type: "p", x: "（此处有一幅内联矢量插图，墨读未导入）" });
          svgGotImg = false;
        }
      } else if (!selfClose) svgDepth++;
      continue;
    }
    if (tag === "img" || (EP && tag === "image")) {
      imgs++;
      if (EP && o.img && !close) {
        const r = o.img(a || {});
        if (r && r.src) { flush(); emit({ type: "img", src: r.src, alt: r.alt || "", w: r.w || 0, h: r.h || 0 }); if (svgDepth) svgGotImg = true; }
      }
      continue;
    }
    if (tag === "br") { if (preBuf != null) preBuf += "\n"; else text(" "); continue; }
    /* EPUB 内链（书中自带的目录页 / 脚注引用 / 章间互链）：开标签记住「链内文字从哪个字起」，
       闭标签时把那段原文取出来交给 o.link 判定收不收、并把块号留给上层解析目标。
       这里只认字面不认目标 —— href 指向哪一章哪一块，要等全书锚点齐了才解得出（见 linkTarget）。
       <pre> 里的引用不算链接（代码块没有目录语义），跨块的悬空 <a> 取到空字面自然丢弃。 */
    if (EP && tag === "a") {
      if (close) {
        if (linkAt >= 0 && preBuf == null && o.link) {
          const raw = curText().slice(linkAt);
          const label = squeeze(raw);
          const keep = label ? o.link(linkHref, label) : null;
          if (keep) {
            const lead = raw.length - raw.replace(/^ +/, "").length;
            pendLinks.push(Object.assign({ cs: linkAt + lead, len: label.length, x: label }, keep));
          }
        }
        linkAt = -1; linkHref = "";
      } else if (!selfClose) {
        linkAt = preBuf == null ? curText().length : -1;
        linkHref = (a && a.href) || "";
      }
      continue;
    }
    if (EP && preBuf != null) {
      if (tag === "pre" && close) {
        const x = preBuf.replace(/^\s*\n+/, "").replace(/\s+$/, "");
        preBuf = null;
        if (x) emit({ type: "code", x });
      }
      continue;
    }
    if (EP && tag === "pre") { if (!close && !selfClose) { flush(); preBuf = ""; } continue; }
    if (EP && (tag === "rt" || tag === "rp")) { rubySkip = !close; continue; }
    if (EP && tag === "math") {
      if (close) {
        const lin = squeeze(mathBuf || "");
        mathBuf = null;
        if (lin) text(" " + lin + " （公式已降级为文本） ");
      } else if (!selfClose) mathBuf = "";                /* 行内公式并进所在句，不切断段落 */
      continue;
    }
    if (EP && /^aside$/.test(tag)) {
      if (close) { if (noteDepth > 0 && --noteDepth === 0) closeNote(); }
      else if (!selfClose) openNote(a);
      continue;
    }
    if (EP && !noteBuf && (tag === "div" || tag === "section" || tag === "article" || tag === "footer") &&
      /\b(note|endnote|footnote)s?\b/.test((a && a["epub:type"]) || "")) {
      if (close) { if (noteDepth > 0 && --noteDepth === 0) closeNote(); }
      else openNote(a);
      continue;
    }
    if (table && (tag === "td" || tag === "th")) { if (close) closeCell(); else { closeCell(); cell = ""; } continue; }
    if (tag === "tr") { if (close) closeRow(); else { closeRow(); row = []; } continue; }
    if (tag === "table") {
      if (close) {
        closeRow();
        if (table) {
          if (!table.head.length && table.rows.length) table.head = table.rows.shift();
          if (table.head.length || table.rows.length) emit({ type: "table", head: table.head, rows: table.rows });
          table = null;
        }
      } else { markAnchor(); table = { head: [], rows: [] }; }
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      if (close) closeList();
      else { lists.push({ ordered: tag === "ol", items: [] }); item = null; }
      continue;
    }
    if (tag === "li") {
      if (!close && lists.length) { markAnchor(); item = { x: "", sub: [] }; lists[lists.length - 1].items.push(item); }
      continue;
    }
    if (/^h[1-6]$/.test(tag)) {
      if (noteBuf != null) continue;
      flush();
      if (!close) { pend = "h" + Math.min(+tag[1], 3); pendId = EP ? String((a && a.id) || "") : ""; }
      continue;
    }
    if (tag === "p" || tag === "blockquote") {
      if (noteBuf != null) continue;                       /* 注内段落并进注块，不另起 */
      if (!lists.length && cell == null) {
        if (close) flush();
        else { markAnchor(); flush(); pend = EP && tag === "blockquote" ? "quote" : "p"; }
      }
      continue;
    }
    if (EP && (tag === "div" || tag === "section" || tag === "article") && noteBuf == null) {
      markAnchor();
      flush();                                            /* 规范不强制 <p>：容器边界即段落边界 */
      continue;
    }
  }
  function openNote(a) { flush(); noteBuf = ""; noteId = (a && a.id) || ""; noteDepth++; }
  function closeNote() {
    const t = squeeze(noteBuf || "");
    noteBuf = null;
    if (!t) return;
    const b = { type: "note", text: t };
    if (noteId) b.id = "x-" + noteId;
    emit(b);
  }
  flush();
  if (noteBuf != null) closeNote();                       /* 作者漏写闭合标签：注块就地收尾 */
  return { blocks, imgs, links, idAt };
}

async function docxToBlocks(buf) {
  const mammoth = lazyMammoth();
  if (!mammoth) throw new Error("解析组件未安装");
  const r = await mammoth.convertToHtml({ buffer: buf });
  return htmlToBlocks(r.value);
}

/* PDF：按 y 坐标把碎片归行（容差半行高），行内按 x 排序、间隙成空格；
   断段与标题都按字号判（见下），英文行尾连字符去拼、词尾加空格，中文直拼。
   —— v1.0.2 起 pdfjs 的行字号不再是"用完即弃"的容差参数：读者报「从 section 开始朗读
      不识别」，根因是整份 PDF 塌成一个 p 块 —— 朗读只有一个单元（点哪都从头念）、
      目录零项、「读完本章」找不到章界。旧判据两条都站不住：
      ① 断段用「全局行距中位数 ×1.7」：一份每段只有一两行的短文档里，段间距本身就是
         中位数，行内距反而是少数派，阈值永远够不着（canvas-probe.pdf 实测超阈值行数 0）。
      ② 标题只认「第一段且 ≤80 字」：pdfjs 明写 24pt/18pt 对正文 12pt 的证据被丢掉。 */
const PDF_HEAD_RATIO = 1.15;   /* 行字号 ≥ 正文×此倍数 → 标题候选 */
const PDF_HEAD_MAX = 40;       /* 标题行长度上限（超了是"整段都放大"，不是标题） */
const PDF_LEAD_MUL = 1.6;      /* 行距 > 该字号常规行距 ×此倍数 → 断段 */
const PDF_FORM_RUN = 3;        /* 同字号同起点连续 ≥此数行 = 封面信息表 / 目录点线行，不是标题 */
const PDF_GRID_TOL = 2;        /* E5 格线聚类容差（pt）：同一条格线的线段落差不大于此 */
const PDF_GRID_MIN = 3;        /* E5 横、竖格线各至少的条数（3H×3V = 2×2 表起） */
const PDF_COL_SIDE = 3;        /* E3 书脊两侧各需的最少文本行数（少于这个就不是「栏」，是残行） */
const PDF_COL_FREE = 0.2;      /* E3 允许压住书脊的行占比：通栏标题正是那一成，全空才判反而认不出带题头的双栏 */
const PDF_COL_ROWS = 8;        /* E3 少于此行数不判分栏：两三行的页面谈「栏」没有意义 */
const PDF_HF_PAGE = 5;         /* E1 总页数少于此整条关闭（§四6 原文：短文档没统计可言，误删正文） */
const PDF_HF_RATIO = 0.2;      /* E1 页边带占比（§四6 原文 ST_HEADER_RATIO=0.2）：上下各取页高这么多 */
const PDF_HF_BODY = 0.5;       /* E1 正文特征行：行宽 > 页宽×此比。页眉页脚通常是短行，长行落在带里就说明带子是正文 */
const PDF_HF_LEAD = 2;         /* E1 正文上下界各外扩的行距倍数：宁可少剔，把临界行留给正文 */
const PDF_HF_RATE = 0.2;       /* E1 判据②：带内有正文特征行的页占比上限（≥3 页有行才统计） */
const PDF_HF_SIGN = 0.6;       /* E1 判据①：同一签名覆盖的页占比（与 3 页取大者） */
const PDF_HF_YTOL = 0.02;      /* E1 判据①：跨页同带允许的 y 漂移（页高中位数之比） */
const PDF_HF_MAXROW = 3;       /* E1 单页剔除行数上限，超了本页放弃 —— 第三道误杀保险 */
const PDF_HF_BANDPAGE = 3;     /* E1 判据②：带内至少要出现这么多页，否则样本太薄不判 */
const PDF_TOC_MIN = 3;         /* E2 连续 ≥此数行「主体+点线+页码」才判目录（§四3 原文：命中 ≥3 行才生效） */
/* E2 目录点线行：行尾是「≥2 个引导点线字符 + 页码」。阿拉伯数字 1~4 位或小写罗马数字（§三 原文口径）。 */
const PDF_TOC_RUN = /[·•⋅．.。…~\-—]{2,}\s*([0-9]{1,4}|[ivxIVX]{1,6})\s*$/;

/* E3 双栏：x 投影找书脊。行内先并区间再计数（同一行两个词压同一格只算一次），
   得到「多少行盖住了这个 x」；盖住行数 ≤PDF_COL_FREE 的连续 x 段就是空谷。
   谷宽 ≥2×正文字号、谷中心落在页宽 25%~75%（左右页边天然空，靠这条挡掉）、两侧各 ≥PDF_COL_SIDE 行 —— 三条同时成立才判双栏。
   正文字号取本页字符加权众数，不用全局 body：全局要等归行之后才算得出，而分栏必须在归行之前定。 */
function pdfSplitCols(items, pageW) {
  if (!(pageW > 0) || items.length < PDF_COL_SIDE * 2) return null;
  const srt = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const rws = [];
  for (const pt of srt) {
    const r = rws[rws.length - 1];
    if (r && r.y - pt.y <= Math.max(2, Math.min(pt.h, r.hMin) * 0.5)) { r.pts.push(pt); if (pt.h < r.hMin) r.hMin = pt.h; }
    else rws.push({ y: pt.y, hMin: pt.h, pts: [pt] });
  }
  if (rws.length < PDF_COL_ROWS) return null;
  const w = new Map();
  for (const pt of items) for (const ch of pt.s) if (ch !== " ") w.set(pt.h, (w.get(pt.h) || 0) + 1);
  let psize = 10, best = -1;
  w.forEach((n, sz) => { if (n > best) { best = n; psize = sz; } });
  const nb = Math.ceil(pageW) + 2;
  const bins = new Int32Array(nb);
  for (const r of rws) {
    const iv = [];
    for (const pt of r.pts) {
      const a = Math.max(0, Math.floor(pt.x)), b = Math.min(pageW, Math.ceil(pt.x + pt.w));
      if (b > a) iv.push([a, b]);
    }
    iv.sort((a, b) => a[0] - b[0]);
    const mg = [];
    for (const q of iv) {
      const m = mg[mg.length - 1];
      if (m && q[0] <= m[1]) m[1] = Math.max(m[1], q[1]);
      else mg.push([q[0], q[1]]);
    }
    for (const q of mg) for (let k = q[0]; k < q[1] && k < nb; k++) bins[k]++;
  }
  const cap = Math.floor(rws.length * PDF_COL_FREE);
  const minW = Math.max(6, psize * 2);
  let gut = null;
  for (let k = 1; k < nb; k++) {
    if (bins[k] > cap || bins[k - 1] <= cap) continue;
    let e = k;
    while (e + 1 < nb && bins[e + 1] <= cap) e++;
    const wid = e - k, c = (k + e) / 2;
    if (wid >= minW && c >= pageW * 0.25 && c <= pageW * 0.75 && (!gut || wid > gut[2])) gut = [k, e, wid];
    k = e;
  }
  if (!gut) return null;
  const L = gut[0], R = gut[1];
  const rowsL = rws.filter((r) => r.pts.some((pt) => pt.x + pt.w <= L + 0.5)).length;
  const rowsR = rws.filter((r) => r.pts.some((pt) => pt.x >= R - 0.5)).length;
  if (rowsL < PDF_COL_SIDE || rowsR < PDF_COL_SIDE) return null;
  const left = [], right = [], full = [];
  for (const pt of items) {
    if (pt.x + pt.w <= L + 0.5) left.push(pt);
    else if (pt.x >= R - 0.5) right.push(pt);
    else full.push(pt);
  }
  return { left, right, full, gut: [L, R] };
}

/* E1 三判据剔页眉/页脚/页码。插在归行之后、断段之前；只用「页边位置 + 跨页重复」两种信号，不用字号规则
   （§9.5 原文：字号规则会把封面大字认成标题，同理页眉小字也不配用字号判）。
   候选带 = 页高上下各 20%（§四6 原文 ST_HEADER_RATIO=0.2）：顶带 y ≥ 0.8h，底带 y ≤ 0.2h。
   ① 重复签名：同带同位（y 差 ≤2% 页高）在 ≥max(3, 60%×页数) 个页出现的行 → 剔。
      页码逐页文本不同，先把「3」「- 3 -」「第 4 页」这类模式行的数字归一成 # 再比。
   ② 区域出现率：带内「有正文特征行（宽 >50% 页宽）」的页占比 <20%（且带内 ≥3 页）→ 该带判页眉/页脚带；
   ③ 继承：②成立则全篇该带一并剔，但带内的正文特征行仍然豁免 —— 除非它自己命中①（整版重复的横幅）。
   防护（全部硬性）：首页永不剔（封面字段是真内容）、总页 <5 整条关闭、单页剔 >3 行则本页放弃。 */
function pdfHeaderFoot(lines, geo, npages) {
  const drop = new Set();
  if (npages < PDF_HF_PAGE) return drop;
  const phOf = (l) => { const g = geo.get(l.page); return g && g.h > 0 ? g.h : 0; };
  const wide = (l) => { const g = geo.get(l.page); return !!g && g.w > 0 && (l.xe - l.x0) > g.w * PDF_HF_BODY; };
  const inTop = (l) => { const h = phOf(l); return h > 0 && l.y >= h * (1 - PDF_HF_RATIO); };
  const inBot = (l) => { const h = phOf(l); return h > 0 && l.y <= h * PDF_HF_RATIO; };
  /* 页码模式行的签名：数字先归一，其余照文本比 */
  const PN1 = /^[-·—.\s]*\d{1,4}[-·—.\s]*$/;
  const PN2 = /^第\s*\d+\s*页(共\s*\d+\s*页)?$/;
  const sigOf = (s) => (PN1.test(s) || PN2.test(s)) ? s.replace(/\d/g, "#") : s;

  const band = { top: [], bottom: [] };
  for (const l of lines) {
    if (Number.isNaN(l.y) || l.table || l.page === 1) continue;   /* 首页整页豁免 */
    if (inTop(l)) band.top.push(l);
    else if (inBot(l)) band.bottom.push(l);
  }
  const hs = [];
  geo.forEach((g) => { if (g.h > 0) hs.push(g.h); });
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
  const ph = hs.length ? med(hs) : 0;
  const need = Math.max(3, Math.ceil(npages * PDF_HF_SIGN));
  const hit = new Set();
  for (const key of ["top", "bottom"]) {
    const arr = band[key];
    if (arr.length) {
      /* ②③ 整带继承（长行豁免） */
      const pages = new Map();
      for (const l of arr) pages.set(l.page, (pages.get(l.page) || false) || wide(l));
      let withBody = 0;
      pages.forEach((v) => { if (v) withBody++; });
      if (pages.size >= PDF_HF_BANDPAGE && withBody / pages.size < PDF_HF_RATE) {
        for (const l of arr) if (!wide(l)) hit.add(l);
      }
      /* ① 带内重复签名 */
      const sigs = new Map();
      for (const l of arr) {
        const k = sigOf(l.s);
        if (!sigs.has(k)) sigs.set(k, []);
        sigs.get(k).push(l);
      }
      sigs.forEach((ls) => {
        if (new Set(ls.map((l) => l.page)).size < need) return;
        if (!ph) return;
        const ys = ls.map((l) => l.y);
        if (Math.max(...ys) - Math.min(...ys) > ph * PDF_HF_YTOL) return;
        ls.forEach((l) => hit.add(l));
      });
    }
  }
  /* 单页剔除上限：超了就整页放弃（第三道误杀保险，两带合并计数） */
  const perPage = new Map();
  hit.forEach((l) => perPage.set(l.page, (perPage.get(l.page) || 0) + 1));
  hit.forEach((l) => { if (perPage.get(l.page) <= PDF_HF_MAXROW) drop.add(l); });
  return drop;
}

/* E2 目录：一行「主体 + 点线 + 页码」是目录条目的形状，正文段落不是。
   判成目录的行整组收编成一条伪行（toc=[items]）——断段那一步按行距拼字，四行点线会被粘成一坨
   （v102 CN fixture 实测「一、系统方案 .. 3二、理…」成一个 p 段），所以必须在断段之前把它们从行流里摘出来。
   点线是排版噪音、剥掉；页码是原书页码、留着当参照。 */
function tocItemOf(l) {
  if (!l.s || Number.isNaN(l.y) || l.table) return "";
  const m = PDF_TOC_RUN.exec(l.s);
  if (!m) return "";
  const subj = l.s.slice(0, m.index).replace(/[\s·•⋅．.。…~\-—]+$/, "");
  return subj ? subj + " · " + m[1] : "";
}
function pdfToc(lines) {
  for (let i = 0; i < lines.length; i++) {
    const first = tocItemOf(lines[i]);
    if (!first) continue;
    let j = i;
    const items = [first];
    while (j + 1 < lines.length && lines[j + 1].page === lines[i].page) {
      const nx = tocItemOf(lines[j + 1]);
      if (!nx) break;
      items.push(nx); j++;
    }
    if (items.length >= PDF_TOC_MIN) {
      lines[i].toc = items;
      lines.splice(i + 1, items.length - 1);
    } else i = j;
  }
}

/* E5 有线表格：pdfjs operator list 里取「真画出来」的线段 —— 描边线 + 细填充矩形 ——
   按 x/y 聚类成格线，横竖各 ≥PDF_GRID_MIN 条才算表，格内文本按基线/中点落位归格，首行作表头（同 docx）。
   只认有线表格：无线表、跨页续表、扫描件一律不做。路径坐标在流空间，须乘 CTM
   （transform 累乘 + save/restore 栈）才与正文同系 —— Chromium 的 PDF 里 CTM 是 y 翻转，
   不乘的话格线全部落在页面下半截，一个格都对不上。 */
function pdfTables(ol, OPS, parts) {
  try {
    const raw = [];   /* 候选线段 [x1,y1,x2,y2]，已变换到正文坐标系 */
    const mul = (m, n) => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
    ];
    /* constructPath args = [收尾算子, [DrawOPS…], minMax]；DrawOPS: moveTo=0 lineTo=1 curveTo=2 quadTo=3 closePath=4
       （与 pdfjs 自家 makePathFromDrawOPS 同源；描边/填充不落在 fnArray，就收在这第 0 个参数里） */
    const walk = (arr, m) => {
      let i = 0, cx = 0, cy = 0, sx = 0, sy = 0;
      const T = (k) => [m[0] * arr[k] + m[2] * arr[k + 1] + m[4], m[1] * arr[k] + m[3] * arr[k + 1] + m[5]];
      while (i < arr.length) {
        const op = arr[i++];
        if (op === 0) { const q = T(i); sx = cx = q[0]; sy = cy = q[1]; i += 2; }
        else if (op === 1) { const q = T(i); raw.push([cx, cy, q[0], q[1]]); cx = q[0]; cy = q[1]; i += 2; }
        else if (op === 2) { const q = T(i + 4); cx = q[0]; cy = q[1]; i += 6; }   /* 曲线不是格线，只续当前点 */
        else if (op === 3) { const q = T(i + 2); cx = q[0]; cy = q[1]; i += 4; }
        else if (op === 4) { raw.push([cx, cy, sx, sy]); cx = sx; cy = sy; }
        else return false;   /* 未知算子：该路径整条放弃，防坐标错位 */
      }
      return true;
    };
    const STROKE = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
    const FILL = new Set([OPS.fill, OPS.eoFill]);
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || ctm;
      else if (fn === OPS.transform) ctm = mul(ctm, a);
      else if (fn === OPS.constructPath) {
        const arr = Array.isArray(a[1]) ? a[1][0] : null;
        if (!arr || !arr.length) continue;
        /* 收尾算子不是描边/填充 = 这条路径根本没画出来（endPath 的页底白矩形、W n 的裁剪路径）：
           它的边一条都不是格线。这扇门不关，全页 bbox 一撑开，表外的标题全被吸进表里。 */
        if (!STROKE.has(a[0]) && !FILL.has(a[0])) continue;
        const mark = raw.length;
        if (!walk(arr, ctm)) { raw.length = mark; continue; }
        if (FILL.has(a[0])) {
          /* 填充只认细长矩形（表格线的画法）；成块的色不是格线，整条回退 */
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (let k = mark; k < raw.length; k++) {
            x0 = Math.min(x0, raw[k][0], raw[k][2]); x1 = Math.max(x1, raw[k][0], raw[k][2]);
            y0 = Math.min(y0, raw[k][1], raw[k][3]); y1 = Math.max(y1, raw[k][1], raw[k][3]);
          }
          if (!((x1 - x0) <= 2.5 || (y1 - y0) <= 2.5)) raw.length = mark;
        }
      }
    }
    const h = [], v = [];
    for (const [x1, y1, x2, y2] of raw) {
      if (Math.abs(y1 - y2) <= 0.6 && Math.abs(x2 - x1) > 2) h.push({ k: (y1 + y2) / 2, a: Math.min(x1, x2), b: Math.max(x1, x2) });
      else if (Math.abs(x1 - x2) <= 0.6 && Math.abs(y2 - y1) > 2) v.push({ k: (x1 + x2) / 2, a: Math.min(y1, y2), b: Math.max(y1, y2) });
    }
    if (h.length < PDF_GRID_MIN || v.length < PDF_GRID_MIN) return [];
    const cl = (arr, key, tol) => {
      arr.sort((p, q) => p[key] - q[key]);
      const out = [];
      for (const s of arr) {
        const g = out[out.length - 1];
        if (g && s[key] - g.k <= tol) { g.segs.push(s); g.k = g.segs.reduce((u, t) => u + t[key], 0) / g.segs.length; }
        else out.push({ k: s[key], segs: [s] });
      }
      return out.map((g) => g.k);
    };
    const ys = cl(h, "k", PDF_GRID_TOL).sort((a, b) => b - a);
    const xs = cl(v, "k", PDF_GRID_TOL).sort((a, b) => a - b);
    if (ys.length < PDF_GRID_MIN || xs.length < PDF_GRID_MIN) return [];
    const cells = [];
    for (let i = 0; i < ys.length - 1; i++) cells.push(new Array(Math.max(0, xs.length - 1)).fill(0).map(() => []));
    const used = [];
    for (const pt of parts) {
      let ri = -1, cj = -1;
      for (let i = 0; i < ys.length - 1; i++) if (pt.y <= ys[i] && pt.y >= ys[i + 1]) { ri = i; break; }
      if (ri < 0) continue;
      const mx = pt.x + pt.w / 2;
      for (let j = 0; j < xs.length - 1; j++) if (mx >= xs[j] && mx <= xs[j + 1]) { cj = j; break; }
      if (cj < 0) continue;
      cells[ri][cj].push(pt);
      used.push(pt);
    }
    const cellText = (arr) => {
      if (!arr.length) return "";
      arr.sort((p, q) => q.y - p.y || p.x - q.x);
      let s = "", lx = null, lw = 0;
      for (const pt of arr) {
        if (s && pt.x - (lx + lw) > Math.max(1.2, pt.h * 0.22)) s += " ";
        s += pt.s; lx = pt.x; lw = pt.w;
      }
      return squeeze(s);
    };
    const trs = [];
    for (const row of cells) {
      const t = row.map(cellText);
      if (t.some((x) => x)) trs.push(t);   /* 全空行（隔行）不进表 */
    }
    if (trs.length < 2) return [];         /* 连表头带数据不足两行，当普通版式走 */
    return [{ top: ys[0], left: xs[0], right: xs[xs.length - 1], head: trs[0], rows: trs.slice(1), items: used }];
  } catch (e) { return []; }
}

async function pdfToBlocks(buf) {
  const pdfjsLib = await lazyPdfjs();
  if (!pdfjsLib) throw new Error("解析组件未安装");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  const lines = [];
  const geo = new Map();        /* E1 用：页号 → { w, h }，页边带与正文特征行都要按各自页的版面量 */
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    /* 行 = 把 item 按 y 从高到低排好后贪心归并，容差取「待入行字号与本行最小字号里较小的那个」的一半。
       旧写法 key = Math.round(y / tol) 的 tol 来自每个 item 自己，不同字号的 key 根本不可比：
       电赛报告实测 13.99pt 标题（y=755.9，tol=7）和 12pt 正文（y=645.6，tol=6）算出同一个 key=108，
       相隔 110pt 的两行拼成一行，行字号又被字数众数算成正文 → 标题当场消失、正文串字。 */
    const parts = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const tr = it.transform;
      parts.push({ x: tr[4], w: it.width || 0, s: it.str, y: tr[5], h: Math.abs(tr[3]) || it.height || 10 });
    }
    /* E5 线上表格：格内文本归表块，其余照常归行；网格提取任何失败都按无表走 */
    let tables = [];
    if (parts.length) {
      try {
        const ol = await page.getOperatorList();
        tables = pdfTables(ol, pdfjsLib.OPS, parts);
      } catch (e) { tables = []; }
    }
    let flow = parts;
    if (tables.length) {
      const used = new Set();
      tables.forEach((t) => t.items.forEach((it) => used.add(it)));
      if (used.size) flow = parts.filter((pt) => !used.has(pt));
    }
    /* 归行 + 拼字：同一套容差与字号判据，整页走一遍、单栏也走一遍（E3 分栏后每栏各调一次） */
    const mkLines = (list, col) => {
      const sorted = list.slice().sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = [];
      for (const pt of sorted) {
        const r = rows[rows.length - 1];
        if (r && r.y - pt.y <= Math.max(2, Math.min(pt.h, r.hMin) * 0.5)) {
          r.parts.push(pt);
          if (pt.h < r.hMin) r.hMin = pt.h;
        } else rows.push({ y: pt.y, hMin: pt.h, parts: [pt] });
      }
      return rows.map((rr) => {
        rr.parts.sort((a, b) => a.x - b.x);
        /* 行字号按字符数加权取众数：一行里夹几个不同字号的 run 时，占字多的那个才算这行的字号 */
        const sizes = new Map();
        for (const pt of rr.parts) for (const ch of pt.s) if (ch !== " ") sizes.set(pt.h, (sizes.get(pt.h) || 0) + 1);
        let size = rr.hMin, n = -1;
        sizes.forEach((c, sz) => { if (c > n) { n = c; size = sz; } });
        let s = "", lx = null, lw = 0, xe = -Infinity;
        for (const pt of rr.parts) {
          if (s && lx != null && pt.x - (lx + lw) > Math.max(1.2, size * 0.22)) s += " ";
          s += pt.s;
          lx = pt.x; lw = pt.w;
          if (pt.x + pt.w > xe) xe = pt.x + pt.w;
        }
        return { y: rr.y, page: p, size, s: squeeze(s), x0: rr.parts[0].x, xe: Math.max(rr.parts[0].x, xe), col };
      }).filter((l) => l.s);
    };
    /* 表格块按位置插进所属栏的行流（bbox 顶线即它的 y），保持与正文行的阅读顺序 */
    const withTables = (list, col, tset) => {
      const out = mkLines(list, col);
      for (const t of tset) {
        const e = { y: t.top, page: p, size: 0, s: "", x0: t.left, col, table: t };
        let k = 0;
        while (k < out.length && out[k].y > t.top) k++;
        out.splice(k, 0, e);
      }
      return out;
    };
    /* E3：认得出书脊就按「通栏行 → 左栏 → 右栏」出块（横排读序，定案 §四 偏差登记），
       每栏各自归行 → 左栏行尾拼右栏行首这类跨栏串行结构性不可能再发生；认不出就整页归行（原行为）。 */
    const vp1 = page.getViewport({ scale: 1 }) || {};
    const pageW = vp1.width || 0;
    geo.set(p, { w: pageW, h: vp1.height || 0 });
    const split = pdfSplitCols(flow, pageW);
    const tOf = (c) => tables.filter((t) => (!split ? 0 : t.left >= split.gut[1] ? 2 : t.right <= split.gut[0] ? 1 : 0) === c);
    const pageLines = split
      ? mkLines(split.full, 0).concat(withTables(split.left, 1, tOf(1)), withTables(split.right, 2, tOf(2)))
      : withTables(flow, 0, tables);
    if (lines.length && pageLines.length) lines.push({ y: NaN, page: p, size: 0, s: "", x0: 0 });
    lines.push(...pageLines);
    page.cleanup && page.cleanup();
  }
  if (!lines.length) return { blocks: [], pages: doc.numPages };

  /* 正文字号 = 全篇按字符数加权的众数（四份真 PDF 实测全部命中真实正文字号）；表格条目不带字，不参选 */
  const weight = new Map();
  lines.forEach((l) => { if (!Number.isNaN(l.y) && l.s) weight.set(l.size, (weight.get(l.size) || 0) + l.s.length); });
  let body = 0, best = -1;
  weight.forEach((n, sz) => { if (n > best) { best = n; body = sz; } });
  if (!(body > 0)) body = 12;

  lines.forEach((l) => {
    l.head = !Number.isNaN(l.y) && l.size >= body * PDF_HEAD_RATIO && l.s.length <= PDF_HEAD_MAX;
  });
  /* 成组的同字号同起点行是"表"不是"标题"：封面一列字段、目录里的点线条目都长这样 */
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].head) continue;
    let j = i;
    while (j + 1 < lines.length && lines[j + 1].head
      && lines[j + 1].page === lines[j].page
      && Math.abs(lines[j + 1].size - lines[i].size) < 0.5
      && Math.abs(lines[j + 1].x0 - lines[i].x0) < 3) j++;
    if (j - i + 1 >= PDF_FORM_RUN) for (let k = i; k <= j; k++) lines[k].head = false;
    i = j;
  }
  /* 每个字号自己的常规行距 = 同字号相邻行行距的偏低中位数。
     标题行通常只有一两行、拿不到自身样本，退回正文字号的行距。 */
  const gapBySize = new Map();
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1], b = lines[i];
    if (Number.isNaN(a.y) || Number.isNaN(b.y) || a.page !== b.page || a.col !== b.col || !a.s || !b.s) continue;
    if (Math.abs(a.size - b.size) > 0.5) continue;
    const g = a.y - b.y;
    if (g <= 0) continue;
    const k = a.size.toFixed(1);
    if (!gapBySize.has(k)) gapBySize.set(k, []);
    gapBySize.get(k).push(g);
  }
  const leadBySize = new Map();
  gapBySize.forEach((arr, k) => {
    arr.sort((x, y) => x - y);
    /* 偶数样本取「靠下」那个：样本里混着段内距和段间距，取偏小的才是段内常规行距。
       取偏大的等于把段间距当成常规，阈值就永远够不着（canvas-probe 实测塌块的第二个原因）。 */
    leadBySize.set(k, arr[Math.floor((arr.length - 1) / 2)]);
  });
  const leadOf = (size) => {
    const k = size.toFixed(1);
    if (leadBySize.has(k)) return leadBySize.get(k);
    const kb = body.toFixed(1);
    return leadBySize.has(kb) ? leadBySize.get(kb) : 0;
  };
  /* E1：归行之后、断段之前。行距统计（leadBySize）已按含页眉的全量行算好，剔完再断段 ——
     顺序反过来会让「剔不剔」去改「常规行距基线」，两道判据互相挂钩就再也说不清是谁的锅。 */
  const hfDrop = pdfHeaderFoot(lines, geo, doc.numPages);
  if (hfDrop.size) {
    const keep = lines.filter((l) => !hfDrop.has(l));
    lines.length = 0; lines.push(...keep);
  }
  /* E2：目录点线行 → 成组伪行。同样放在断段之前，且放在 E1 之后 ——
     页眉里的「第 x 页」不该被当成目录页码，先剔完再收目录。 */
  pdfToc(lines);
  const joinLine = (cur, s) => {
    if (/[A-Za-z]-$/.test(cur)) return cur.slice(0, -1) + s;
    if (/[A-Za-z0-9,.;:!?)]$/.test(cur) && /^[A-Za-z0-9("'[]/.test(s)) return cur + " " + s;
    return cur + s;
  };
  const paras = [];
  let cur = null, prev = null;
  for (const l of lines) {
    if (l.toc) { if (cur) { paras.push(cur); cur = null; } paras.push({ toc: l.toc }); prev = null; continue; }
    if (l.table) { if (cur) { paras.push(cur); cur = null; } paras.push({ table: l.table }); prev = null; continue; }
    if (!l.s) { if (cur) { paras.push(cur); cur = null; } prev = null; continue; }
    if (!cur) { cur = { text: l.s, head: l.head, size: l.size }; prev = l; continue; }
    let brk = false;
    if (l.head !== prev.head || l.col !== prev.col) brk = true;      /* 标题 ↔ 正文必断；跨栏必断（右栏首行绝不接在左栏末行后面） */
    else if (l.head && Math.abs(l.size - prev.size) > 0.5) brk = true;  /* 不同层级的标题之间 */
    else {
      const g = (Number.isNaN(prev.y) || Number.isNaN(l.y) || prev.page !== l.page)
        ? Infinity : prev.y - l.y;
      const lead = leadOf(prev.size);
      /* 行尾连字符 / 英文词被拆到下一行开头时不断段（沿用旧判据） */
      if (lead && g > lead * PDF_LEAD_MUL
        && !(/[A-Za-z]-$/.test(cur.text) || (/[[A-Za-z0-9,(]$/.test(cur.text) && /^[a-z]/.test(l.s)))) brk = true;
    }
    if (brk) { paras.push(cur); cur = { text: l.s, head: l.head, size: l.size }; }
    else cur.text = joinLine(cur.text, l.s);
    prev = l;
  }
  if (cur) paras.push(cur);

  const blocks = [];
  let hn = 0, sawHead = false;
  paras.forEach((pp) => {
    if (pp.toc) { blocks.push({ type: "list", items: pp.toc }); return; }
    if (pp.table) { blocks.push({ type: "table", head: pp.table.head, rows: pp.table.rows }); return; }
    if (!pp.head) { blocks.push({ type: "p", x: pp.text }); return; }
    const ratio = pp.size / body;
    blocks.push({ type: ratio >= 1.6 ? "h1" : ratio >= 1.3 ? "h2" : "h3", x: pp.text, id: "h-" + (++hn) });
    sawHead = true;
  });
  /* 一篇都没认出标题时，退回旧行为（首段 ≤80 字当 h1）—— 保证任何文档都不比改前差 */
  if (!sawHead && blocks.length && blocks[0].type === "p" && blocks[0].x.length <= 80) {
    blocks[0] = { type: "h1", x: blocks[0].x, id: "h-" + (++hn) };
  }
  return { blocks, pages: doc.numPages };
}

async function pptxToBlocks(buf) {
  const { zip, rejected } = await loadZipSafe(buf);
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0));
  const blocks = [];
  let hn = 0;
  for (const n of names) {
    const xml = await zip.files[n].async("string");
    const sps = xml.match(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g) || [];
    const bullets = [];
    let title = "";
    for (const sp of sps) {
      const isTitle = /p:ph[^>]*type="(title|ctrTitle)"/.test(sp);
      /* run 按段落归位：先切 <a:p>，段内 run 才相连 —— 直接全局拼会把整页要点粘成一串 */
      const paras = sp.match(/<a:p\b[\s\S]*?<\/a:p>/g) || [];
      const lines = paras
        .map((pp) => decodeEntities(squeeze((pp.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [])
          .map((r) => r.replace(/<\/?a:t>/g, "")).join(""))))
        .filter(Boolean);
      if (!lines.length) continue;
      if (!title && isTitle) { title = lines[0]; lines.shift(); }
      bullets.push(...lines);
    }
    if (!title && bullets.length) title = bullets.shift();
    if (title) blocks.push(blocks.length ? { type: "h2", x: title, id: "h-" + (++hn) } : { type: "h1", x: title, id: "h-" + (++hn) });
    if (bullets.length) blocks.push({ type: "list", items: bullets });
  }
  return { blocks, rejected };
}

/* ------------------------------------------------------------
   XLSX → blocks
   —— 只依赖已装的 jszip：workbook.xml 取名与顺序，rels 找 sheetN.xml，
      sharedStrings.xml 解共享字符串。日期序列号不换算（要读 styles.xml
      的 numFmt，收益不抵复杂度），如实显示原数字。
   —— 每表上限 400 行 / 40 列：超出则截断并在文末说明，避免把阅读器压垮。
   ------------------------------------------------------------ */
const XLSX_MAX_ROWS = 400, XLSX_MAX_COLS = 40;

function colIndex(ref) {
  const m = /^([A-Z]+)\d+$/.exec(String(ref || ""));
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function xlsxToBlocks(buf) {
  const { zip, rejected } = await loadZipSafe(buf);
  const read = async (n) => (zip.files[n] ? zip.files[n].async("string") : "");

  /* 共享字符串：一个 <si> 可能拆成多个 <t>（富文本），逐个拼回 */
  const sst = [];
  const ssXml = await read("xl/sharedStrings.xml");
  (ssXml.match(/<si>[\s\S]*?<\/si>/g) || []).forEach((si) => {
    sst.push(decodeEntities((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, "")).join("")));
  });

  /* sheet 顺序按 workbook.xml，文件路径按 rels 的 r:id 映射 */
  const wbXml = await read("xl/workbook.xml");
  if (!wbXml) throw new Error("不是有效的 XLSX（缺 workbook.xml）");
  const relXml = await read("xl/_rels/workbook.xml.rels");
  const rels = {};
  (relXml.match(/<Relationship\b[^>]*\/>/g) || []).forEach((r) => {
    const id = /Id="([^"]+)"/.exec(r);
    const target = /Target="([^"]+)"/.exec(r);
    if (id && target) rels[id[1]] = target[1].replace(/^\/?xl\//, "").replace(/^\//, "");
  });
  const blocks = [];
  let hn = 0, sheetN = 0, clipped = false;

  for (const sh of wbXml.match(/<sheet\b[^>]*\/>/g) || []) {
    const name = decodeEntities((/name="([^"]*)"/.exec(sh) || [])[1] || "");
    const rid = (/r:id="([^"]*)"/.exec(sh) || [])[1] || "";
    let path = rels[rid];
    if (!path) {
      sheetN++;
      path = "worksheets/sheet" + sheetN + ".xml";
    } else if (path.indexOf("worksheets/") < 0) {
      sheetN++;
    }
    const xml = await read("xl/" + path);
    if (!xml) continue;
    if (blocks.length) blocks.push({ type: "h2", x: name || "工作表", id: "h-" + (++hn) });
    else blocks.push({ type: "h1", x: name || "工作表", id: "h-" + (++hn) });

    const rows = [];
    for (const rw of xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || []) {
      const cells = [];
      for (const c of rw.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
        const idx = colIndex((/r="([^"]+)"/.exec(c) || [])[1]);
        if (idx < 0 || idx >= XLSX_MAX_COLS) continue;
        const type = (/t="([^"]+)"/.exec(c) || [])[1] || "n";
        const vTag = /<v>([\s\S]*?)<\/v>/.exec(c);
        const isTag = /<is>[\s\S]*?<\/is>/.exec(c);
        let val = "";
        if (type === "s" && vTag) val = sst[Number(vTag[1])] || "";
        else if (type === "inlineStr" && isTag) {
          val = decodeEntities((isTag[0].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
            .map((t) => t.replace(/<[^>]+>/g, "")).join(""));
        } else if (vTag) val = decodeEntities(vTag[1]);
        cells[idx] = squeeze(val);
      }
      const arr = [];
      for (let i = 0; i < XLSX_MAX_COLS; i++) arr.push(cells[i] === undefined ? "" : cells[i]);
      while (arr.length && arr[arr.length - 1] === "") arr.pop();
      if (arr.length) rows.push(arr);
      if (rows.length >= XLSX_MAX_ROWS) { clipped = true; break; }
    }
    if (!rows.length) { blocks.push({ type: "p", x: "（此表无内容）" }); continue; }
    const wide = rows.reduce((w, r) => Math.max(w, r.length), 1);
    const pad = (r) => { const o = r.slice(); while (o.length < wide) o.push(""); return o; };
    const head = pad(rows[0]);
    const body = rows.slice(1).map(pad);
    blocks.push({ type: "table", head, rows: body, align: head.map(() => "left") });
  }
  if (clipped) blocks.push({ type: "p", x: "（内容较长，已截断至每表 " + XLSX_MAX_ROWS + " 行）" });
  return { blocks, rejected };
}

/* ------------------------------------------------------------
   EPUB → 书仓（v2.21 E3）
   —— 全程只用正则，与 docx/pptx/xlsx 同一套风格，零新依赖：
      container.xml → OPF（metadata / manifest / spine）→ 逐章 XHTML
      复用 htmlToBlocks(…, {epub:true}) → 拼成一份 blocks[]。
   —— 目录四级兜底：EPUB3 nav → EPUB2 ncx → 章内标题 → 文件名。
      阅读器大纲是「扫标题块派生」的，所以兜底产物统一写成标题块，
      nav 层级映射为 h1/h2/h3；条目在正文里找不到锚点就地补一条 ——
      点不动的目录比没有目录更糟。
   —— DRM 只判定不解密：encryption.xml 里的算法 URI 除「字体混淆」
      外一律视为受保护，明确拒解且不归档（业界一致做法，见方案 §3.2）。
   ------------------------------------------------------------ */
const EPUB_FONT_URI = "http://www.idpf.org/2008/embedding";   /* 字体混淆：不是 DRM */
const ASSET_MAX_ONE = 10 * 1024 * 1024;      /* 单张插图上限 */
const ASSET_MAX_ALL = 64 * 1024 * 1024;      /* 一本书的图片总量上限 */
const ASSET_MAX_N = 800;
const IMG_EXT = /\.(png|jpe?g|gif|svgz?|webp|avif|bmp)$/i;

/* 插图尺寸：分页是按高度切页的，而图的高度要等解码才知道 —— 量出来是 0，
   页底就凭空多一条空白，后面的整段被挤到下一页。所以解包时直接读文件头，
   把宽高写进 img 块，读侧用 aspect-ratio 预先占位（零布局位移）。
   认不出来返回 null，由读侧「图加载完重测一次」兜住。 */
function imgDims(name, buf) {
  const s = String(name || "").toLowerCase();
  const sig = buf.length > 4 ? buf.toString("latin1", 0, 16) : "";
  try {
    if (/\.png$/.test(s) || (buf[0] === 0x89 && sig.slice(1, 4) === "PNG")) {
      if (buf.length > 24 && sig.slice(12, 16) === "IHDR") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (/\.gif$/.test(s) || sig.slice(0, 3) === "GIF") {
      if (buf.length > 10) return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    }
    if (/\.bmp$/.test(s) || (buf[0] === 0x42 && buf[1] === 0x4d)) {
      if (buf.length > 26) return { w: buf.readInt32LE(18), h: Math.abs(buf.readInt32LE(22)) };
    }
    if (/^\.jpe?g$/.test(s) || (buf[0] === 0xff && buf[1] === 0xd8)) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m >= 0xd0 && m <= 0xd7) { i += 2; continue; }              /* 无长度字的独占标记 */
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          const h = buf.readUInt16BE(i + 5), w = buf.readUInt16BE(i + 7);
          if (w && h) return { w, h };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (/\.webp$/.test(s) || sig.slice(8, 12) === "WEBP") {
      const f = sig.slice(12, 16);
      if (f === "VP8X" && buf.length > 30) {
        return { w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
      }
      if (f === "VP8 " && buf.length > 30) return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (f === "VP8L" && buf.length > 25) {
        const bits = buf.readUInt32LE(21);
        return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
      }
    }
    if (/\.svgz?$/.test(s)) {
      const t = /\.svgz$/.test(s) ? zlib.gunzipSync(buf).toString("latin1") : buf.toString("latin1", 0, Math.min(buf.length, 4096));
      const num = (x) => {
        const v = String(x == null ? "" : x);
        if (v.indexOf("%") >= 0) return 0;                              /* 百分比宽度推不出比例 */
        const n = parseFloat(v);
        return isFinite(n) && n > 0 ? Math.round(n) : 0;
      };
      const tag = /<svg\b[^>]*>/i.exec(t);
      const pick = (a) => { const m = new RegExp("\\b" + a + "\\s*=\\s*\"([^\"]*)\"", "i").exec(tag ? tag[0] : ""); return m ? m[1] : ""; };
      const w = num(pick("width")), h = num(pick("height"));
      if (w && h) return { w, h };
      const vb = pick("viewBox").replace(/,/g, " ").trim().split(/\s+/).map(num);
      if (vb.length === 4 && vb[2] && vb[3]) return { w: vb[2], h: vb[3] };
    }
  } catch (e) {}
  return null;
}

function dirOf(p) { const i = String(p || "").lastIndexOf("/"); return i < 0 ? "" : String(p).slice(0, i); }
function stemOf(p) {
  const s = String(p || "").split("/").pop() || "";
  return decodeEntities(squeeze(s.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ")));
}
function fragOf(ref) {
  const s = String(ref || "");
  const i = s.indexOf("#");
  if (i < 0) return "";
  let f = s.slice(i + 1).split("?")[0];
  try { f = decodeURIComponent(f); } catch (e) {}
  return f;
}
/* 容器内相对路径归一：解百分号、丢锚点与查询、消 . 与 ..、容忍前导斜杠。
   结果永远不含 .. 段，可直接与 bookDir/assets 拼接。 */
function resolvePath(baseDir, ref) {
  let r = String(ref || "").split("#")[0].split("?")[0];
  try { r = decodeURIComponent(r); } catch (e) {}
  r = r.replace(/\\/g, "/");
  const out = [];
  for (const p of (baseDir ? baseDir.split("/") : []).concat(r.split("/"))) {
    if (!p || p === ".") continue;
    if (p === "..") { out.pop(); continue; }
    out.push(p);
  }
  return out.join("/");
}
function cleanXhtml(html) {
  return String(html || "")
    .replace(/<\?[\s\S]*?\?>/g, " ")
    .replace(/<!DOCTYPE[^>\[]*(?:\[[\s\S]*?\])?[^>]*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ");
}
/* EPUB3 nav：取第一个 nav[epub:type="toc"]，按 ol 嵌套算层级 */
function parseNavToc(html) {
  let seg = /<nav\b[^>]*epub:type="[^"]*\btoc\b[^"]*"[\s\S]*?<\/nav>/i.exec(html);
  if (!seg) seg = /<nav\b[^>]*>[\s\S]*?<\/nav>/i.exec(html);
  if (!seg) return null;
  const out = [];
  /* 通用标签分支必须排在文本分支之前：nav 里除 ol/li/a 外还有 span、epub:type、
     收尾的 </nav> —— 少了这一条，</nav> 会被当成文本「/nav>」并进目录标题（实测漏进过章标题）。 */
  const re = /<ol\b[^>]*>|<\/ol>|<li\b[^>]*>|<\/li>|<a\b([^>]*)>|<\/a>|<[^>]+>|([^<]+)/g;
  let m, level = 0, cur = null;
  while ((m = re.exec(seg[0]))) {
    const t = m[0];
    if (/^<ol\b/i.test(t)) { level++; continue; }
    if (/^<\/ol/i.test(t)) { level = Math.max(0, level - 1); continue; }
    if (/^<li\b/i.test(t)) { cur = { x: "", href: "", level: level || 1 }; out.push(cur); continue; }
    if (/^<a\b/i.test(t)) { if (cur && !cur.href) cur.href = attrOf(m[1], "href"); continue; }
    if (/^<\/a/i.test(t)) continue;
    if (cur && m[2] != null) { const s = squeeze(decodeEntities(m[2])); if (s) cur.x += (cur.x ? " " : "") + s; }
  }
  const items = out.filter((i) => i.x || i.href);
  return items.length ? items : null;
}
/* EPUB2 NCX：navPoint > navLabel/text + content@src，嵌套即层级 */
function parseNcxToc(xml) {
  const re = /<navPoint\b[^>]*>|<\/navPoint>|<text>([\s\S]*?)<\/text>|<content\b([^>]*)>/gi;
  const out = [];
  let m, depth = 0, cur = null;
  while ((m = re.exec(xml))) {
    const t = m[0];
    if (t.toLowerCase().indexOf("<navpoint") === 0) {
      cur = { x: "", href: "", level: depth + 1 };
      out.push(cur);
      depth++;
    } else if (t.toLowerCase().indexOf("</navpoint") === 0) {
      depth = Math.max(0, depth - 1);
      cur = null;
    } else if (m[1] != null) {
      if (cur && !cur.x) cur.x = squeeze(decodeEntities(m[1].replace(/<[^>]+>/g, " ")));
    } else if (m[2] != null) {
      if (cur && !cur.href) cur.href = attrOf(m[2], "src");
    }
  }
  const items = out.filter((i) => i.x || i.href);
  return items.length ? items : null;
}
/* DRM 判定：只认「加密声明」。字体混淆 URI 放行（正文本就是明文，混淆只作用于
   字体文件，而我们不装作者字体）；其余任何 URI、Adobe rights.xml、LCP 许可证
   都判为受保护。注意不要拿 DigestMethod 当证据 —— 那是签名用的摘要算法。 */
function epubDrmReason(encXml, has) {
  if (has("META-INF/rights.xml")) return "Adobe ADEPT 授权文件";
  if (has("license.lcpl") || has("META-INF/license.lcpl")) return "LCP 许可证";
  const re = /(?:[\w-]+:)?Encryption(?:Method)?\b[^>]*?Algorithm\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(String(encXml || "")))) {
    if (m[1] !== EPUB_FONT_URI) return "加密声明 " + m[1];
  }
  return "";
}

async function epubToBook(buf, o) {
  const opt = o || {};
  const dir = opt.dir || null;               /* null = 不落盘（前端降级为 localStorage 时） */
  const bookId = opt.bookId || "";
  const { zip, rejected } = await loadZipSafe(buf);
  const has = (n) => !!zip.files[n];
  const rd = async (n) => (zip.files[n] ? zip.files[n].async("string") : "");

  const drm = epubDrmReason(await rd("META-INF/encryption.xml"), has);
  if (drm) {
    const e = new Error("这本书带 DRM 授权保护（" + drm + "），墨读不解密，也不会给你一本空书。请改用无 DRM 的文件。");
    e.epubDrm = true;
    e.reason = drm;
    throw e;
  }

  const container = await rd("META-INF/container.xml");
  const rf = /<rootfile\b[^>]*>/i.exec(container);
  const rootPath = rf ? resolvePath("", attrOf(rf[0], "full-path")) : "";
  if (!rootPath || !zip.files[rootPath]) throw new Error("不是有效的 EPUB（container.xml 里找不到包文件）");
  const opf = await rd(rootPath);
  const base = dirOf(rootPath);

  const items = {};
  for (const t of opf.match(/<item\b[^>]*>/g) || []) {
    const id = attrOf(t, "id"), href = attrOf(t, "href");
    if (!id || !href || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;      /* 外链资源不收：离线可读优先 */
    items[id] = { href, type: attrOf(t, "media-type") || "", props: attrOf(t, "properties") || "", path: resolvePath(base, href) };
  }
  const spineTag = /<spine\b([^>]*)>/i.exec(opf);
  const spineAttrs = spineTag ? spineTag[1] : "";
  const direction = attrOf(spineAttrs, "page-progression-direction").toLowerCase();
  const ncxId = attrOf(spineAttrs, "toc");
  const sIdx = opf.search(/<spine\b/i);
  const spine = [];
  let nonLinear = 0;
  for (const t of (sIdx < 0 ? "" : opf.slice(sIdx)).match(/<itemref\b[^>]*>/gi) || []) {
    const it = items[attrOf(t, "idref")];
    if (!it) continue;
    if (/^no$/i.test(attrOf(t, "linear"))) { nonLinear++; continue; }     /* 非正读顺序：不并进正文 */
    spine.push(it);
  }
  if (!spine.length) throw new Error("EPUB 的 spine 里没有可读的正文文件");

  const one = (tag) => {
    const m = new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "i").exec(opf);
    return m ? decodeEntities(squeeze(m[1].replace(/<[^>]+>/g, " "))) : "";
  };
  const many = (tag) => (opf.match(new RegExp("<" + tag + "\\b[^>]*>[\\s\\S]*?</" + tag + ">", "gi")) || [])
    .map((s) => decodeEntities(squeeze(s.replace(/<[^>]+>/g, " "))))
    .filter(Boolean);
  const layM = /<meta\b[^>]*(?:property|name)="rendition:layout"[^>]*>([\s\S]*?)<\/meta>/i.exec(opf);
  const layC = /<meta\b[^>]*(?:property|name)="rendition:layout"[^>]*content="([^"]*)"/i.exec(opf);
  const layout = (layM ? squeeze(layM[1]) : "") || (layC ? layC[1] : "");

  let navPath = "", ncxPath = "";
  for (const k in items) {
    if (/\bnav\b/.test(items[k].props)) navPath = items[k].path;
    if ((k === ncxId || /ncx$/i.test(items[k].type)) && !ncxPath) ncxPath = items[k].path;
  }
  let coverPath = "";
  const cm = /<meta\b[^>]*name="cover"[^>]*>/i.exec(opf);
  if (cm && items[attrOf(cm[0], "content")]) coverPath = items[attrOf(cm[0], "content")].path;
  if (!coverPath) for (const k in items) if (/\bcover-image\b/.test(items[k].props)) { coverPath = items[k].path; break; }

  /* ---- 图片解包：只解 manifest 里 image/* 与带图片扩展名的条目 ---- */
  const typeByPath = {};
  for (const k in items) typeByPath[items[k].path] = items[k].type;
  const assetSet = new Set();
  const dimByPath = {};
  const assetRoot = dir ? path.resolve(dir, "assets") : "";
  let wrote = 0, bytes = 0, assetsSkipped = 0;
  for (const n of Object.keys(zip.files)) {
    const f = zip.files[n];
    if (f.dir) continue;
    if (!/^image\//i.test(typeByPath[n] || "") && !IMG_EXT.test(n)) continue;
    const est = (f._data && f._data.uncompressedSize) || 0;
    if (est > ASSET_MAX_ONE || bytes + est > ASSET_MAX_ALL || wrote >= ASSET_MAX_N) { assetsSkipped++; continue; }
    const content = await f.async("nodebuffer");
    if (dir) {
      const target = path.resolve(dir, "assets", ...n.split("/"));
      if (target !== assetRoot && !target.startsWith(assetRoot + path.sep)) { assetsSkipped++; continue; }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    const dim = imgDims(n, content);
    if (dim && dim.w > 0 && dim.h > 0 && dim.w < 20000 && dim.h < 20000) dimByPath[n] = dim;
    assetSet.add(n);
    wrote++; bytes += content.length;
  }
  const urlOf = (rel) => "/e/" + bookId + "/" + rel.split("/").map(encodeURIComponent).join("/");
  let cover = coverPath && assetSet.has(coverPath) ? urlOf(coverPath) : "";

  /* ---- 逐章正文 ---- */
  const docs = [];
  for (const sp of spine) {
    const f = zip.files[sp.path];
    if (!f) continue;
    if (sp.type && !/xhtml|htm/i.test(sp.type) && !/x?html$/i.test(sp.path)) continue;
    const raw = await f.async("string");
    const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
    const cdir = dirOf(sp.path);
    const r = htmlToBlocks(cleanXhtml(raw), {
      epub: true,
      img: (a) => {
        const src = a.src || a.href || a["xlink:href"];
        if (!src || !bookId || /^(?:data|https?):/i.test(src)) return null;
        const rel = resolvePath(cdir, src);
        if (!assetSet.has(rel)) return null;
        const dim = dimByPath[rel];
        return { src: urlOf(rel), alt: a.alt || a["aria-label"] || "", w: dim ? dim.w : 0, h: dim ? dim.h : 0 };
      },
      /* 书内自带的目录页靠 <a> 跳章，所以正文里的链接字面必须留下（目标稍后统一解）。
         只收书内的相对引用：外链（http / mailto / javascript / 协议相对 //）阅读页开不了新窗口，
         收进来只会得到一枚「点了没反应」的假链接 —— 不如维持纯文本。
         返回 {href} = 收下了但目标还没解，linkTarget 认不出时整条丢弃。 */
      link: (href) => {
        const h = String(href || "").trim();
        if (!h) return null;
        if (h[0] === "#") return { href: h };
        if (/^\/\//.test(h) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(h)) return null;
        return { href: h };
      }
    });
    if (!r.blocks.length) continue;
    if (!cover) { const im = r.blocks.find((b) => b.type === "img"); if (im) cover = im.src; }
    docs.push({ path: sp.path, title: tm ? decodeEntities(squeeze(tm[1])) : stemOf(sp.path), blocks: r.blocks, imgs: r.imgs, links: r.links, idAt: r.idAt });
  }
  if (!docs.length) throw new Error("EPUB 里没有解析出正文（可能是纯图片书或全文在 spine 之外）");

  /* ---- 锚点 id 全书唯一：各章各自计数时 "h-1" 会撞在一起，目录只会跳到第一个 ---- */
  let an = 0;
  docs.forEach((d, c) => {
    const seen = {};
    d.anchorMap = Object.create(null);
    for (const b of d.blocks) {
      if (typeof b.id !== "string") continue;
      const a = b.id.indexOf("x-") === 0 ? b.id.slice(2) : b.id;
      seen[a] = (seen[a] || 0) + 1;
      b.id = "x" + c + "-" + a + (seen[a] > 1 ? "-" + seen[a] : "");
      if (!d.anchorMap[a]) d.anchorMap[a] = b.id;
    }
  });

  /* ---- 目录：nav → ncx →（没有就）按章补标题 ---- */
  let toc = null, tocBase = "", tocSrc = "";
  if (navPath && zip.files[navPath]) { toc = parseNavToc(cleanXhtml(await rd(navPath))); tocBase = dirOf(navPath); tocSrc = "nav"; }
  if (!toc && ncxPath && zip.files[ncxPath]) { toc = parseNcxToc(await rd(ncxPath)); tocBase = dirOf(ncxPath); tocSrc = "ncx"; }
  if (toc && !toc.length) { toc = null; tocSrc = ""; }
  const byPath = {};
  docs.forEach((d, c) => { if (!byPath[d.path]) byPath[d.path] = { d, c }; });
  const adopted = new Set();
  let entries = [];
  if (toc) {
    for (const e of toc) {
      const slot = byPath[resolvePath(tocBase, e.href || "")];
      if (!slot) continue;                       /* 指向正文里没有的文件：丢掉，不造死链 */
      entries.push({ label: squeeze(e.x) || "（无题）", level: Math.min(Math.max(e.level || 1, 1), 3), slot, frag: fragOf(e.href) });
    }
    for (const en of entries) {
      const d = en.slot.d, c = en.slot.c;
      /* 找现成标题：先认锚点 id，再认目录文字（作者常给标题挂 id 而不写进 nav 的 frag，
         或反过来 nav 里的 frag 是拼错的 —— 这时按同名标题认领，好过在章首补一条重复目录） */
      let target = en.frag && d.anchorMap[en.frag] ? d.blocks.find((b) => b.id === d.anchorMap[en.frag]) : null;
      if (!target && en.frag) {
        target = d.blocks.find((b) => /^h[1-3]$/.test(b.type) && !adopted.has(b) && squeeze(b.x) === en.label);
      }
      if (!target && !en.frag) {
        const first = d.blocks[0];
        if (first && /^h[1-3]$/.test(first.type) && !adopted.has(first)) target = first;
      }
      if (target) {
        adopted.add(target);
        /* 认领现成标题时不改它的级别：作者自己的 h1/h2 已经是正文里的层级 */
        en.anchor = target.id || (target.id = "x" + c + "-t" + (++an));
        continue;
      }
      const b = { type: "h" + en.level, x: en.label === "（无题）" ? (d.title || stemOf(d.path) || "第 " + (c + 1) + " 节") : en.label, id: "x" + c + "-t" + (++an) };
      d.pending = d.pending || [];
      d.pending.push(b);
      en.anchor = b.id;
    }
    docs.forEach((d) => { if (d.pending && d.pending.length) { d.pad = d.pending.length; d.blocks.unshift(...d.pending.reverse()); } });
  } else {
    docs.forEach((d, c) => {
      if (d.blocks.some((b) => /^h[1-3]$/.test(b.type))) return;
      d.blocks.unshift({ type: "h1", x: d.title || stemOf(d.path) || "第 " + (c + 1) + " 节", id: "x" + c + "-t" + (++an) });
      d.pad = (d.pad || 0) + 1;
    });
    tocSrc = "headings";
  }

  /* ---- 正文内链 → 目标块（定案 §3.2 路径 A：书里自带的目录页 / 脚注引用 / 章间互链） ----
     href 只有三种形状：#frag（同文件）、相对路径、相对路径#frag。
     目标优先认「挂着 id 的块」（标题 / 注块，读侧有现成的 gotoAnchor）；
     认不到再退到 idAt 的「作者 id → 块号」侧表（脚注常写成 <p id="fn1">，块上不留 id），
     这种只能按块号跳。两处都认不得 → 整条丢弃（跳到该章开头是「看着对、点着错」，比不跳更坏）；
     只指向一个文件（目录页最常见写法 <a href="text/c3.xhtml">第三章</a>）→ 认那一章的第一个标题块。
     块的字节形状不动（§九），这份侧表随 toc.json 单独落盘，读侧按字面在渲染文本里找位置。 */
  const baseOf = [];
  { let acc = 0; for (const d of docs) { baseOf.push(acc); acc += d.blocks.length; } }
  const linkTarget = (d, href) => {
    const rawRel = String(href || "").split("#")[0];
    const slot = byPath[rawRel ? resolvePath(dirOf(d.path), rawRel) : d.path];
    if (!slot) return null;
    const pad = slot.d.pad || 0;
    const frag = fragOf(href);
    if (frag) {
      const a = slot.d.anchorMap[frag];
      if (a) return { anchor: a };
      const local = slot.d.idAt[frag];
      return local == null ? null : { tbi: baseOf[slot.c] + pad + local };
    }
    const first = slot.d.blocks.find((b) => /^h[1-3]$/.test(b.type) && typeof b.id === "string");
    if (first) return { anchor: first.id };
    /* 这一章没有标题块（nav 直接指到没有 h 标签的文件）→ 跳到它第一个有内容的块 */
    const fi = slot.d.blocks.findIndex((b) => b.type === "img" || (b.x && String(b.x).trim()));
    return fi < 0 ? null : { tbi: baseOf[slot.c] + pad + fi };
  };
  const TOC_LINK_MAX = 3000;
  const links = [];
  let linkClipped = false, lbase = 0;
  for (const d of docs) {
    const pad = d.pad || 0;
    for (const l of d.links) {
      if (links.length >= TOC_LINK_MAX) { linkClipped = true; break; }
      const t = linkTarget(d, l.href);
      if (!t) continue;
      /* anchor = 目标块自己挂着 id（读侧 gotoAnchor），tbi = 只认得块号（读侧 gotoBlock） */
      links.push(Object.assign({ bi: lbase + pad + l.bi, cs: l.cs, len: l.len, x: l.x }, t));
    }
    lbase += d.blocks.length;
  }

  const blocks = [];
  let imgs = 0;
  docs.forEach((d) => { blocks.push(...d.blocks); imgs += d.imgs; });

  const warnings = [];
  if (/^pre-paginated$/i.test(layout)) warnings.push("本书为固定版式，墨读按重排方式导入，版面会与原件不同");
  if (direction === "rtl") warnings.push("本书为右起（RTL）排版，墨读暂按左起呈现");
  if (rejected) warnings.push(rejected + " 个非法路径条目被拒绝（压缩包内容不完全可信）");
  if (assetsSkipped) warnings.push(assetsSkipped + " 张插图超出单本限额，未导出");
  if (tocSrc === "headings") warnings.push("本书没有目录文件，墨读按各章标题生成大纲");
  if (nonLinear) warnings.push(nonLinear + " 个非正读顺序文件未并入正文");
  if (linkClipped) warnings.push("正文内链多于 " + TOC_LINK_MAX + " 条，只保留了前面这些");

  return {
    kind: "epub",
    bookId,
    blocks,
    cover,
    /* 目录侧表（定案 §3.1）：entries = nav/ncx 解析出的层级条目，links = 正文里可跳的内链字面。
       两者都不进 blocks —— 正文字节形状是 §九 的不动清单，目录是叠加在正文之上的另一份数据。 */
    toc: { src: tocSrc, entries: entries.map((e) => ({ lv: e.level, x: e.label, anchor: e.anchor })), links },
    meta: {
      title: one("dc:title") || stemOf(rootPath),
      author: many("dc:creator").join(" / "),
      lang: one("dc:language"),
      publisher: one("dc:publisher"),
      pubDate: one("dc:date"),
      identifier: one("dc:identifier"),
      chapters: docs.length,
      entries: entries.length,
      imgs,
      assets: wrote,
      assetBytes: bytes,
      excerpt: bookExcerpt(blocks),
      rejected,
      nonLinear,
      fxl: /^pre-paginated$/i.test(layout),
      rtl: direction === "rtl",
      tocSrc
    },
    warnings
  };
}

/* 书首摘录：只扫到够长就停。导入弹窗要拿它喂类别识别，
   而 blocksText 会把整本书拼成一条几 MB 的字符串 —— 为一句摘要不值得。 */
function bookExcerpt(blocks) {
  const out = [];
  let n = 0;
  for (const b of blocks) {
    if (!/^(?:h[1-6]|p|quote|li)$/.test(b.type)) continue;
    const s = String(b.x || "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    out.push(s);
    n += s.length;
    if (n >= 180) break;
  }
  return out.join(" ").slice(0, 180);
}

function blocksText(blocks) {
  const itemFlat = (it) => {
    if (typeof it === "string") return it;
    let s = it.x || it.td || "";
    if (it.sub && it.sub.length) s += " " + it.sub.map((b) => b.items.map(itemFlat).join(" ")).join(" ");
    return s;
  };
  const out = [];
  for (const b of blocks) {
    if (typeof b.x === "string") out.push(b.x);
    if (typeof b.text === "string") out.push(b.text);        /* note 块：注脚文字也是正文的一部分 */
    if (b.head) out.push(b.head.join(" "));
    if (b.rows) out.push(b.rows.map((r) => r.join(" ")).join(" "));
    if (b.items) out.push(b.items.map(itemFlat).join(" "));
  }
  return out.join("\n");
}

async function serveParse(req, res) {
  const jh = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  if (req.method !== "POST") return send(res, 405, JSON.stringify({ code: 405, message: "method not allowed" }), jh);
  let buf;
  try { buf = await readBody(req, PARSE_MAX); }
  catch (e) {
    const big = e && e.message === "body too large";
    return send(res, big ? 413 : 400, JSON.stringify({ code: big ? 413 : 400, message: big ? "文件过大（上限 25MB）" : "读取失败" }), jh);
  }
  let name = "";
  try { name = decodeURIComponent(String(req.headers["x-file-name"] || "")); } catch (e) {}
  /* 并发闸：解压是内存峰值动作，同时只放行 1 个解析请求 */
  if (!parseGate()) {
    return send(res, 200, JSON.stringify({ code: 1, message: "解析器正忙，请稍候再试" }), jh);
  }
  try {
    await parseOne(req, res, buf, name, jh);
  } finally {
    parseRelease();
  }
}

async function parseOne(req, res, buf, name, jh) {
  const kind = sniffKind(buf);
  const ok = (k, blocks, imgs, extra) => send(res, 200, JSON.stringify(Object.assign({
    code: 0, data: { kind: k, blocks, text: blocks ? blocksText(blocks) : "", imgs: imgs || 0 }
  }, extra || {})), jh);
  try {
    if (kind === "text") {
      if (!buf.length) return send(res, 200, JSON.stringify({ code: 1, message: "文件是空的（0 字节）" }), jh);
      const t = decodeText(buf);
      if (!t) return send(res, 200, JSON.stringify({ code: 1, message: "无法识别的文本编码（UTF-8 / GBK / Big5 都不匹配）" }), jh);
      if (!t.text.replace(/\s+/g, "")) return send(res, 200, JSON.stringify({ code: 1, message: "文件里没有正文内容" }), jh);
      return send(res, 200, JSON.stringify({ code: 0, data: { kind: "text", blocks: null, text: t.text, imgs: 0, encoding: t.encoding } }), jh);
    }
    if (kind === "docx") {
      const r = await docxToBlocks(buf);
      if (!r.blocks.length) return send(res, 200, JSON.stringify({ code: 1, message: "DOCX 中未找到文本内容" }), jh);
      return ok("docx", r.blocks, r.imgs);
    }
    if (kind === "pptx") {
      const r = await pptxToBlocks(buf);
      if (!r.blocks.length) return send(res, 200, JSON.stringify({ code: 1, message: "PPTX 中未找到文本内容" }), jh);
      return ok("pptx", r.blocks, 0, r.rejected ? { rejected: r.rejected } : null);
    }
    if (kind === "xlsx") {
      const r = await xlsxToBlocks(buf);
      if (!r.blocks.length) return send(res, 200, JSON.stringify({ code: 1, message: "XLSX 中未找到单元格内容" }), jh);
      return ok("xlsx", r.blocks, 0, r.rejected ? { rejected: r.rejected } : null);
    }
    if (kind === "epub") {
      /* /api/parse 走「不落盘」降级：正文照常返回，插图只计数（书仓端点 POST /api/book 才解资源） */
      const r = await epubToBook(buf, {});
      return ok("epub", r.blocks, r.meta.imgs, { meta: r.meta, warnings: r.warnings, rejected: r.meta.rejected, toc: r.toc });
    }
    if (kind === "pdf") {
      const r = await pdfToBlocks(buf);
      if (!r.blocks.length) return send(res, 200, JSON.stringify({ code: 1, message: "PDF 无文本层（可能是扫描版），暂只归档" }), jh);
      return ok("pdf", r.blocks, 0);
    }
    if (kind === "image") return ok("image", null, 0);
    if (kind === "ole") return send(res, 200, JSON.stringify({ code: 2, message: "老版 Office 格式（.doc/.ppt/.xls）暂不支持解析，请先另存为 .docx/.pptx/.xlsx/.pdf 再导入" }), jh);
    return send(res, 200, JSON.stringify({ code: 1, message: kind === "zip" ? "无法识别的文件内容（zip 容器）" : "无法识别的文件格式" }), jh);
  } catch (e) {
    if (e && e.epubDrm) {
      return send(res, 200, JSON.stringify({ code: 2, drm: true, message: e.message }), jh);
    }
    if (e && e.zipBomb) return send(res, 200, JSON.stringify({ code: 1, message: e.message }), jh);
    return send(res, 200, JSON.stringify({ code: 1, message: "解析失败 · " + (e && e.message || e) }), jh);
  }
}

/* ------------------------------------------------------------
   /api/book · 书仓（v2.21 E2）
   —— EPUB 正文动辄几 MB，插图几十 MB，塞进 localStorage 一定撞 4MB 快照墙，
      所以整本落盘：ebooks/<bookId>/{book.json, blocks.json, assets/…}。
   —— bookId = 内容 sha1 前 12 位：同一本书重复导入直接命中旧目录，不复制第二份；
      编号是内容哈希，所以文件和插图都可以标 immutable 长期缓存。
   —— 写入走「<id>.tmp → rename」：中途失败只留一个临时目录，
      不会留下一本没有正文的空书。
   ------------------------------------------------------------ */
const BOOK_MAX = 200 * 1024 * 1024;
const BOOK_ID_RE = /^b-[0-9a-f]{12}$/;
function ebooksDir() {
  return process.env.INKREAD_EBOOKS || path.resolve(__dirname, "..", ".work", "ebooks");
}
function bookDirOf(id) {
  if (!BOOK_ID_RE.test(String(id || ""))) return null;
  const root = path.resolve(ebooksDir());
  const dir = path.resolve(root, id);
  return dir.startsWith(root + path.sep) ? dir : null;
}
function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }
function readBookHead(id) {
  const dir = bookDirOf(id);
  if (!dir) return null;
  try {
    const head = JSON.parse(fs.readFileSync(path.resolve(dir, "book.json"), "utf8"));
    return head && typeof head === "object" ? head : null;
  } catch (e) { return null; }
}
/* 目录侧表（v1.1-S5b）：与正文分家，正写字节不动。
   v2.21 导入的书没有这一份，读侧拿不到就照旧「按标题生成大纲」—— 不是错，是如实降级。 */
function readBookToc(id) {
  const dir = bookDirOf(id);
  if (!dir) return null;
  try {
    const t = JSON.parse(fs.readFileSync(path.resolve(dir, "toc.json"), "utf8"));
    return t && typeof t === "object" ? t : null;
  } catch (e) { return null; }
}

async function serveBook(req, res) {
  const jh = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  const seg = String(req.url || "/").split("?")[0].split("/").filter(Boolean);
  const id = seg[2] || "";
  /* ?lite=1：只回书目不回正文。整本书的块有几 MB，导入弹窗只要封面和统计，
     正文留给阅读页按需 GET —— 用户在弹窗里点「取消」时不必先传一趟全书。 */
  const lite = /[?&]lite=1(?:&|$)/.test(String(req.url || ""));

  if (req.method === "DELETE") {
    const dir = bookDirOf(id);
    if (!dir) return send(res, 400, JSON.stringify({ code: 400, message: "书编号不合法" }), jh);
    const had = fs.existsSync(path.resolve(dir, "blocks.json"));
    rmrf(dir);
    return send(res, 200, JSON.stringify({ code: 0, removed: had }), jh);
  }

  if (req.method === "GET" || req.method === "HEAD") {
    const dir = bookDirOf(id);
    if (!dir) return send(res, 404, JSON.stringify({ code: 404, message: "书编号不合法" }), jh);
    let raw = null;
    try { raw = fs.readFileSync(path.resolve(dir, "blocks.json")); } catch (e) {}
    if (!raw) return send(res, 404, JSON.stringify({ code: 404, message: "书仓里没有这本书（正文文件缺失）" }), jh);
    return send(res, 200, req.method === "HEAD" ? "" : raw, {
      "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=31536000, immutable"
    });
  }

  if (req.method !== "POST") return send(res, 405, JSON.stringify({ code: 405, message: "method not allowed" }), jh);

  let buf;
  try { buf = await readBody(req, BOOK_MAX); }
  catch (e) {
    const big = e && e.message === "body too large";
    return send(res, big ? 413 : 400, JSON.stringify({ code: big ? 413 : 400, message: big ? "文件过大（书仓上限 200MB）" : "读取失败" }), jh);
  }
  if (!buf.length) return send(res, 200, JSON.stringify({ code: 1, message: "文件是空的（0 字节）" }), jh);
  const kind = sniffKind(buf);
  if (kind !== "epub") {
    return send(res, 200, JSON.stringify({ code: 1, message: kind === "zip" ? "压缩包里没有 EPUB 的签名，按普通文件导入即可" : "书仓只收 EPUB，其它格式请直接走导入（本机存档）" }), jh);
  }
  if (!parseGate()) return send(res, 200, JSON.stringify({ code: 1, message: "解析器正忙，请稍候再试" }), jh);

  const bookId = "b-" + crypto.createHash("sha1").update(buf).digest("hex").slice(0, 12);
  const dir = bookDirOf(bookId);
  try {
    const head = readBookHead(bookId);
    if (head) {
      return send(res, 200, JSON.stringify({
        code: 0, data: { bookId, kind: "epub", blocks: null, words: head.words || 0, cover: head.cover, meta: head.meta, warnings: head.warnings || [], toc: readBookToc(bookId), existed: true }
      }), jh);
    }
    const tmp = dir + ".tmp";
    rmrf(tmp);
    fs.mkdirSync(tmp, { recursive: true });
    const r = await epubToBook(buf, { dir: tmp, bookId });
    const words = blocksText(r.blocks).replace(/\s+/g, "").length;
    const bookHead = { bookId, kind: "epub", at: Date.now(), cover: r.cover, words, meta: r.meta, warnings: r.warnings };
    fs.writeFileSync(path.resolve(tmp, "book.json"), JSON.stringify(bookHead));
    fs.writeFileSync(path.resolve(tmp, "blocks.json"), JSON.stringify(r.blocks));
    fs.writeFileSync(path.resolve(tmp, "toc.json"), JSON.stringify(r.toc));
    if (fs.existsSync(dir)) rmrf(dir);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.renameSync(tmp, dir);
    return send(res, 200, JSON.stringify({
      code: 0, data: { bookId, kind: "epub", blocks: lite ? null : r.blocks, words, cover: r.cover, meta: r.meta, warnings: r.warnings, toc: r.toc, existed: false }
    }), jh);
  } catch (e) {
    rmrf(dir + ".tmp");
    if (e && e.epubDrm) return send(res, 200, JSON.stringify({ code: 2, drm: true, message: e.message }), jh);
    if (e && e.zipBomb) return send(res, 200, JSON.stringify({ code: 1, message: e.message }), jh);
    return send(res, 200, JSON.stringify({ code: 1, message: "导入失败 · " + (e && e.message || e) }), jh);
  } finally {
    parseRelease();
  }
}

/* /e/<bookId>/<容器内相对路径> —— 只夹取在该书 assets 目录内 */
function serveEbookAsset(req, res) {
  const notFound = { "Content-Type": "text/plain; charset=utf-8" };
  const tail = decodeURIComponent(String(req.url || "/").split("?")[0].slice(3));
  const slash = tail.indexOf("/");
  const id = slash < 0 ? tail : tail.slice(0, slash);
  const rel = slash < 0 ? "" : tail.slice(slash + 1);
  const dir = bookDirOf(id);
  if (!dir || !rel) return send(res, 404, "Not Found", notFound);
  const root = path.resolve(dir, "assets");
  const abs = path.resolve(root, rel.replace(/^\/+/, ""));
  if (abs !== root && !abs.startsWith(root + path.sep)) return send(res, 403, "Forbidden", notFound);
  fs.readFile(abs, (err, buf) => {
    if (err) return send(res, 404, "Not Found: " + req.url, notFound);
    serveStatic(req, res, abs, buf);
  });
}

/* ------------------------------------------------------------
   /api/export/<docId>.html · 把一本书存成离线可读的 HTML（v2.21 E9）
   —— 桌面 App 有 printToPDF，浏览器与局域网里的手机没有。那边的「存成文件」
      只能由服务端出一份自包含 HTML（插图转 data URI）。不用 Blob + a[download]：
      跨源与 iOS Safari 的下载行为都没有官方保证，同源附件是最稳的一条路。
   —— 正文来源与阅读页同源：?book=b-xxx 走书仓，否则读同步快照里的
      inkread.contents.v1；两处都没有就如实 404，不给一份空文件。
   —— 排印样式内联 paper.css：与纸面视图同一份，导出的文件和打出来的纸不会两个样。
   —— 解锁改过的正文（inkread.docs.edit.v1）同样盖上去，与 print.html 同规则。
   ------------------------------------------------------------ */
const EXPORT_IMG_MAX = 4 * 1024 * 1024;       /* 单张图超过这个数就不内联，留 /e/ 链接 */
const EXPORT_INLINE_MAX = 24 * 1024 * 1024;   /* 整本内联图的总量上限 */
const IMG_MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };
let _mdEngine = null;
function mdEngine() {
  if (_mdEngine) return _mdEngine;
  /* md.js 是浏览器脚本（末行 window.MD = …），这里给一个只有 window 的空壳跑它：
     它自己的 document 监听整段有 typeof document 守卫，navigator 只在复制按钮里用到。 */
  const src = fs.readFileSync(path.resolve(ROOT, "md.js"), "utf8");
  const win = {};
  new Function("window", "document", "navigator", src)(win, undefined, { clipboard: null });
  if (!win.MD || !win.MD.blocksHtml) throw new Error("排版引擎载入失败");
  _mdEngine = win.MD;
  return _mdEngine;
}
let _paperSpec = null;
/* 出纸规格的算法与 print.html 共用同一个文件：纸面视图上选了 A5 横版，
   「存成文件」的那份 HTML 也必须出 A5 横版 —— 两处各抄一张尺寸表，迟早分叉成
   同一本书两个版式。下载端点读不到浏览器里的偏好，规格由页面写进链接参数。 */
function paperSpec() {
  if (_paperSpec) return _paperSpec;
  const src = fs.readFileSync(path.resolve(ROOT, "paper-spec.js"), "utf8");
  const win = {};
  new Function("window", src)(win);
  if (!win.PaperSpec || !win.PaperSpec.spec) throw new Error("出纸规格载入失败");
  _paperSpec = win.PaperSpec;
  return _paperSpec;
}
function snapValue(data, key) {
  const e = data && data[key];
  if (!e || !("v" in e)) return null;
  if (typeof e.v === "string") { try { return JSON.parse(e.v); } catch (err) { return null; } }
  return e.v;
}
function exportEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function exportName(title) {
  return String(title || "墨读导出").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "墨读导出";
}
function contentDisposition(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(name);
}
/* /e/<bookId>/<rel> → data URI。只夹该书 assets 内的文件，越界与超限都不内联。
   成功与否都给出原因码：几种「没带上图」对用户是不同的事 ——
   太大（本机有图，只是不塞进文件）、本机没有、外链（本就不该由服务端去抓）、
   位置不合法（压缩包里的路径越界，属数据异常）。揉成一句「过大」等于把后三种也说成是体积问题。 */
const INL_BIG = 1, INL_GONE = 2, INL_REFUSED = 3, INL_EXT = 4;
function inlineImg(src, inlined) {
  const m = /^\/e\/([^/]+)\/(.+)$/.exec(String(src || ""));
  if (!m) return /^\.{0,2}\/|^\//.test(String(src || "")) ? INL_REFUSED : INL_EXT;
  const dir = bookDirOf(decodeURIComponent(m[1]));
  if (!dir) return INL_REFUSED;
  const root = path.resolve(dir, "assets");
  const abs = path.resolve(root, decodeURIComponent(m[2]).replace(/^\/+/, ""));
  if (abs !== root && !abs.startsWith(root + path.sep)) return INL_REFUSED;
  let st = null;
  try { st = fs.statSync(abs); } catch (e) { return INL_GONE; }
  if (!st.isFile() || st.size > EXPORT_IMG_MAX || inlined.bytes + st.size > EXPORT_INLINE_MAX) return INL_BIG;
  const mime = IMG_MIME[path.extname(abs).toLowerCase()] || "application/octet-stream";
  try {
    const buf = fs.readFileSync(abs);
    inlined.bytes += buf.length;
    return { uri: "data:" + mime + ";base64," + buf.toString("base64") };
  } catch (e) { return INL_GONE; }
}
function serveExport(req, res) {
  const jh = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "<!DOCTYPE html><meta charset=utf-8><p>导出只读，不支持这个请求方法。</p>", jh);
  }
  const u = String(req.url || "/");
  const qIdx = u.indexOf("?");
  const tail = decodeURIComponent((qIdx < 0 ? u : u.slice(0, qIdx)).slice("/api/export/".length));
  const docId = tail.replace(/\.html$/, "");
  const qs = new URLSearchParams(qIdx < 0 ? "" : u.slice(qIdx + 1));
  const fail = (code, msg) => send(res, code,
    "<!DOCTYPE html><html lang=zh-CN><meta charset=utf-8><title>无法导出</title>" +
    "<body style=\"font:15px/1.8 system-ui;margin:14vh auto;max-width:34em;padding:0 20px\">" +
    "<h2 style=\"font-size:19px;margin:0 0 .5em\">无法导出</h2><p style=\"margin:0\">" + exportEsc(msg) + "</p>", jh);

  let snap = null;
  try {
    const f = syncFile();
    if (fs.existsSync(f)) snap = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {}
  const data = (snap && snap.data) || {};

  /* 正文：书仓优先（EPUB 整本在盘上），其次同步快照的本机正文 */
  let blocks = null, head = null;
  const bookId = qs.get("book") || "";
  if (bookId) {
    const dir = bookDirOf(bookId);
    if (dir) {
      head = readBookHead(bookId);
      try { blocks = JSON.parse(fs.readFileSync(path.resolve(dir, "blocks.json"), "utf8")); } catch (e) {}
    }
  }
  if (!blocks || !blocks.length) {
    const all = snapValue(data, "inkread.contents.v1");
    if (all && Array.isArray(all[docId])) blocks = all[docId];
  }
  if (!blocks || !blocks.length) {
    return fail(404, "本机同步快照里没有《" + (docId || "这本书") + "》的正文" +
      (bookId ? "" : "，这本书也不在书仓里") + "。先在能读到这本书的设备上同步一次，或重新导入原文件。");
  }
  const shelf = snapValue(data, "inkread.shelf.v1");
  const entry = Array.isArray(shelf) ? shelf.filter((d) => d && d.id === docId)[0] : null;
  const edits = (snapValue(data, "inkread.docs.edit.v1") || {})[docId] || {};
  blocks = blocks.map((b, i) => (edits[i] != null && b && typeof b.x === "string") ? Object.assign({}, b, { x: edits[i] }) : b);

  const inlined = { bytes: 0, big: 0, gone: 0, refused: 0, ext: 0 };
  blocks = blocks.map((b) => {
    if (!b || b.type !== "img" || !b.src) return b;
    if (/^data:/i.test(String(b.src))) return b;   /* 导入时就内联的图：本来就带在身上，不算缺 */
    const r = inlineImg(b.src, inlined);
    if (r && r.uri) return Object.assign({}, b, { src: r.uri });
    if (r === INL_BIG) inlined.big++;
    else if (r === INL_REFUSED) inlined.refused++;
    else if (r === INL_EXT) inlined.ext++;
    else inlined.gone++;
    return b;
  });

  const title0 = exportName((entry && entry.title) || (head && head.meta && head.meta.title) || docId || "墨读导出");
  let css = "";
  try { css = fs.readFileSync(path.resolve(ROOT, "paper.css"), "utf8"); }
  catch (e) { return fail(500, "排印样式 paper.css 读不到，导出的文件会没有版式。"); }
  /* 纸型/横版/章首分页跟着请求参数走：这份文件的用途是「和打出来的纸一样」，
     参数缺席就是 paper.css 的默认（A4 竖版、章首另起页），与纸面视图同一条规则。 */
  let spec = null;
  try { spec = paperSpec().spec({ paper: qs.get("paper"), land: qs.get("land") === "1" }); }
  catch (e) { return fail(500, "出纸规格 paper-spec.js 读不到，导出的文件会没有版式。"); }
  const chapBreak = qs.get("chap") !== "0";
  const MD = mdEngine();
  /* 与 print.html 同一条规则：正文自带的一级标题就是书名，提到标题页，正文里不重复印。
     文件名也跟着纸上的字走 —— 同一本书导出两次（一次 PDF 一次 HTML）不该顶两个名字。 */
  let fixed = MD.fixTables ? MD.fixTables(blocks) : blocks;
  let title = title0;
  if (fixed.length && fixed[0] && fixed[0].type === "h1") {
    const own = MD.plain ? MD.plain(String(fixed[0].x || "")).trim() : "";
    if (own) { fixed = fixed.slice(1); title = exportName(own); }
  }
  const chars = blocksText(fixed).replace(/\s+/g, "").length;
  const nWords = (entry && +entry.words > 0) ? +entry.words : chars;
  const by = [entry && entry.author && entry.author !== "本地导入" ? entry.author : "",
              nWords ? nWords.toLocaleString("zh-CN") + " 字" : "",
              "墨读 InkRead 导出 · " + new Date().toLocaleDateString("zh-CN")].filter(Boolean).join("　·　");
  const html = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
    "<link rel=\"icon\" href=\"data:,\">\n<title>" + exportEsc(title) + "</title>\n" +
    "<style>\n" + css + "\n/* 出纸规格覆盖：与 print.html 的 <style id=\"pageSize\"> 同一份算法（paper-spec.js） */\n" + spec.css + "\n</style>\n</head>\n<body>\n<main class=\"sheet\">\n" +
    "<header class=\"p-head\"><h1 class=\"p-title\">" + exportEsc(title) + "</h1>" +
    "<div class=\"byline\">" + exportEsc(by) + "</div></header>\n" +
    "<article id=\"doc\">\n" + MD.blocksHtml(fixed, { chapterBreak: chapBreak }) + "\n</article>\n</main>\n" +
    (inlined.big || inlined.gone || inlined.ext || inlined.refused
      ? "<p class=\"p-meta\">" + [
          inlined.big ? inlined.big + " 张插图过大，未内联进文件" : "",
          inlined.gone ? inlined.gone + " 张插图本机没有，无法内联" : "",
          inlined.ext ? inlined.ext + " 张网络插图未内联（离线打开时不显示）" : "",
          inlined.refused ? inlined.refused + " 张插图的路径不在本书内，出于安全未取用" : ""
        ].filter(Boolean).join("；") + "。</p>\n"
      : "") +
    "</body>\n</html>\n";
  const buf = Buffer.from(html, "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": buf.length,
    "Content-Disposition": contentDisposition(title + ".html"),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(req.method === "HEAD" ? "" : buf);
}

function createServer() {
  return http.createServer((req, res) => {
    const u = req.url || "/";
    /* 数据快照端点先于 method 守卫（POST 也合法） */
    if (u.indexOf("/api/store") === 0) {
      return serveStore(req, res);
    }
    /* 书仓端点同样先于 method 守卫（POST 导入 / DELETE 清理） */
    if (u.indexOf("/api/book") === 0) {
      return serveBook(req, res);
    }
    if (u.indexOf("/e/") === 0) {
      return serveEbookAsset(req, res);
    }
    /* 导出端点自己判方法（只读），放在守卫之前 */
    if (u.indexOf("/api/export/") === 0) {
      return serveExport(req, res);
    }
    if (u.indexOf("/api/mossapi/") === 0) {
      return serveMossApi(req, res);
    }
    /* LLM 透传自带方法判断（GET 探测 / POST 代取），放在守卫之前 */
    if (u.indexOf("/api/llm") === 0) {
      return serveLlm(req, res);
    }
    if (u.indexOf("/api/parse/") === 0) {
      return serveParse(req, res);
    }
    if (u.indexOf("/api/geo") === 0) {
      return serveGeo(req, res);
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, "Method Not Allowed", { "Content-Type": "text/plain; charset=utf-8" });
    }
    if (u.indexOf("/api/moss/") === 0) {
      return proxyMoss(req, res);
    }
    if (u.indexOf("/api/tts") === 0) {
      return serveTTS(req, res);
    }
    const abs = resolveSafe(u);
    if (!abs) return send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });

    fs.readFile(abs, (err, buf) => {
      if (err) {
        return send(res, 404, "Not Found: " + req.url, { "Content-Type": "text/plain; charset=utf-8" });
      }
      serveStatic(req, res, abs, buf);
    });
  });
}

/* 返回 { server, port, url }；port 传 0 表示由系统挑一个空闲端口。
   host 默认 0.0.0.0：局域网里的手机浏览器访问 http://<本机IP>:<port> 即可接入
   —— 这是「真·双端同步」（/api/store 快照两端共用一份）的物理前提。
   同网段可读写本应用数据，家庭 / 个人网络适用。 */
function start(port, host) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port == null ? 0 : port, host || "0.0.0.0", () => {
      const p = server.address().port;
      resolve({ server, port: p, url: "http://127.0.0.1:" + p + "/" });
    });
  });
}

/* ttsInternals：重试策略是纯逻辑，验收闸直接调它做确定性断言
   （真网络只能做统计性抽查：28 次里约 2 次 429，靠跑批碰运气不算证据）。 */
module.exports = { start, createServer, ROOT, ttsInternals: { ttsWithRetry, isTransientTtsErr, retries: () => _ttsRetries } };

if (require.main === module) {
  const wanted = process.argv[2] ? Number(process.argv[2]) : 8765;
  start(wanted)
    .then(({ url }) => {
      console.log("墨读 InkRead 已启动：" + url);
      console.log("根目录：" + ROOT);
      console.log("按 Ctrl+C 停止。");
    })
    .catch((e) => {
      console.error("启动失败：" + e.message);
      process.exit(1);
    });
}
