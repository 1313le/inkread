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
    const t = new T({ voice, rate: rate || "default", pitch: pitch || "default", timeout: 25000 });
    await t.ttsPromise(text, tmp);
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 512) {
      try { fs.unlinkSync(tmp); } catch (e) {}
      throw new Error("合成结果为空");
    }
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
  }).catch((e) => send(res, 502, JSON.stringify({ code: 502, message: "合成失败 · " + ((e && e.message) || e) }), { "Content-Type": "application/json; charset=utf-8" }));
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

  const flush = () => {
    const t = squeeze(para);
    const tp = pend || "p";
    const pid = pendId;
    para = ""; pend = ""; pendId = "";
    if (!t) return;
    const b = { type: tp, x: t };
    /* 标题挂锚点 id，读侧大纲 / 起读锚定要用；EPUB 优先保留作者自己的 id。
       pid 必须在清 pendId 之前取，否则作者锚点全丢，目录点了只会跳本章第一个标题。 */
    if (/^h[1-3]$/.test(tp)) b.id = (EP && pid) ? "x-" + pid : "h-" + (++hn);
    blocks.push(b);
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
    else blocks.push(block);
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
    /* 作者 CSS / 脚本一律丢弃：不应用、也不让样式表里的字混进正文。
       配对标签缺失时这里仍然兜得住（head 已被 cleanXhtml 剥掉）。 */
    if (EP && (tag === "style" || tag === "script")) { if (!selfClose) skipText = !close; continue; }
    if (svgDepth && tag !== "svg" && tag !== "image") continue;   /* SVG 子节点不取文本 */
    if (EP && tag === "svg") {
      if (close) {
        if (--svgDepth <= 0) {
          svgDepth = 0;
          /* 内部若已抽出可服务的 <image>，就不再补占位，免得一句话两行字 */
          if (!svgGotImg) blocks.push({ type: "p", x: "（此处有一幅内联矢量插图，墨读未导入）" });
          svgGotImg = false;
        }
      } else if (!selfClose) svgDepth++;
      continue;
    }
    if (tag === "img" || (EP && tag === "image")) {
      imgs++;
      if (EP && o.img && !close) {
        const r = o.img(a || {});
        if (r && r.src) { flush(); blocks.push({ type: "img", src: r.src, alt: r.alt || "", w: r.w || 0, h: r.h || 0 }); if (svgDepth) svgGotImg = true; }
      }
      continue;
    }
    if (tag === "br") { if (preBuf != null) preBuf += "\n"; else text(" "); continue; }
    if (EP && preBuf != null) {
      if (tag === "pre" && close) {
        const x = preBuf.replace(/^\s*\n+/, "").replace(/\s+$/, "");
        preBuf = null;
        if (x) blocks.push({ type: "code", x });
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
          if (table.head.length || table.rows.length) blocks.push({ type: "table", head: table.head, rows: table.rows });
          table = null;
        }
      } else table = { head: [], rows: [] };
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      if (close) closeList();
      else { lists.push({ ordered: tag === "ol", items: [] }); item = null; }
      continue;
    }
    if (tag === "li") {
      if (!close && lists.length) { item = { x: "", sub: [] }; lists[lists.length - 1].items.push(item); }
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
        else { flush(); pend = EP && tag === "blockquote" ? "quote" : "p"; }
      }
      continue;
    }
    if (EP && (tag === "div" || tag === "section" || tag === "article") && noteBuf == null) {
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
    blocks.push(b);
  }
  flush();
  if (noteBuf != null) closeNote();                       /* 作者漏写闭合标签：注块就地收尾 */
  return { blocks, imgs };
}

async function docxToBlocks(buf) {
  const mammoth = lazyMammoth();
  if (!mammoth) throw new Error("解析组件未安装");
  const r = await mammoth.convertToHtml({ buffer: buf });
  return htmlToBlocks(r.value);
}

/* PDF：按 y 坐标把碎片归行（容差半行高），行内按 x 排序、间隙成空格；
   行距超中位数 1.7 倍断段，英文行尾连字符去拼、词尾加空格，中文直拼。 */
async function pdfToBlocks(buf) {
  const pdfjsLib = await lazyPdfjs();
  if (!pdfjsLib) throw new Error("解析组件未安装");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const tr = it.transform;
      const h = Math.abs(tr[3]) || it.height || 10;
      const tol = Math.max(2, h * 0.5);
      const key = Math.round(tr[5] / tol);
      if (!rows.has(key)) rows.set(key, { y: tr[5], h, parts: [] });
      rows.get(key).parts.push({ x: tr[4], w: it.width || 0, s: it.str });
    }
    const pageLines = [...rows.values()].sort((a, b) => b.y - a.y).map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let s = "", lx = null, lw = 0;
      for (const pt of r.parts) {
        if (!pt.s) continue;
        if (s && lx != null && pt.x - (lx + lw) > Math.max(1.2, r.h * 0.22)) s += " ";
        s += pt.s;
        lx = pt.x; lw = pt.w;
      }
      return { y: r.y, s: squeeze(s) };
    }).filter((l) => l.s);
    if (lines.length && pageLines.length) lines.push({ y: NaN, s: "" });
    lines.push(...pageLines);
    page.cleanup && page.cleanup();
  }
  const gaps = [];
  for (let i = 1; i < lines.length; i++) {
    if (Number.isNaN(lines[i].y) || Number.isNaN(lines[i - 1].y)) continue;
    const g = lines[i - 1].y - lines[i].y;
    if (g > 0) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const joinLine = (cur, s) => {
    if (/[A-Za-z]-$/.test(cur)) return cur.slice(0, -1) + s;
    if (/[A-Za-z0-9,.;:!?)]$/.test(cur) && /^[A-Za-z0-9("'[]/.test(s)) return cur + " " + s;
    return cur + s;
  };
  const paras = [];
  let cur = "";
  let prevY = NaN;
  for (const l of lines) {
    if (!l.s) { if (cur) { paras.push(cur); cur = ""; } prevY = NaN; continue; }
    if (!cur) { cur = l.s; prevY = l.y; continue; }
    const g = Number.isNaN(prevY) ? Infinity : prevY - l.y;
    if (g > median * 1.7 && !(/[A-Za-z]-$/.test(cur) || (/[[A-Za-z0-9,(]$/.test(cur) && /^[a-z]/.test(l.s)))) {
      paras.push(cur); cur = l.s;
    } else cur = joinLine(cur, l.s);
    prevY = l.y;
  }
  if (cur) paras.push(cur);
  const blocks = [];
  let hn = 0;
  paras.forEach((x, i) => {
    if (i === 0 && x.length <= 80) blocks.push({ type: "h1", x, id: "h-" + (++hn) });
    else blocks.push({ type: "p", x });
  });
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
      }
    });
    if (!r.blocks.length) continue;
    if (!cover) { const im = r.blocks.find((b) => b.type === "img"); if (im) cover = im.src; }
    docs.push({ path: sp.path, title: tm ? decodeEntities(squeeze(tm[1])) : stemOf(sp.path), blocks: r.blocks, imgs: r.imgs });
  }
  if (!docs.length) throw new Error("EPUB 里没有解析出正文（可能是纯图片书或全文在 spine 之外）");

  /* ---- 锚点 id 全书唯一：各章各自计数时 "h-1" 会撞在一起，目录只会跳到第一个 ---- */
  let an = 0;
  docs.forEach((d, c) => {
    const seen = {};
    d.anchorMap = {};
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
    docs.forEach((d) => { if (d.pending && d.pending.length) d.blocks.unshift(...d.pending.reverse()); });
  } else {
    docs.forEach((d, c) => {
      if (d.blocks.some((b) => /^h[1-3]$/.test(b.type))) return;
      d.blocks.unshift({ type: "h1", x: d.title || stemOf(d.path) || "第 " + (c + 1) + " 节", id: "x" + c + "-t" + (++an) });
    });
    tocSrc = "headings";
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

  return {
    kind: "epub",
    bookId,
    blocks,
    cover,
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
      return ok("epub", r.blocks, r.meta.imgs, { meta: r.meta, warnings: r.warnings, rejected: r.meta.rejected });
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
        code: 0, data: { bookId, kind: "epub", blocks: null, words: head.words || 0, cover: head.cover, meta: head.meta, warnings: head.warnings || [], existed: true }
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
    if (fs.existsSync(dir)) rmrf(dir);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.renameSync(tmp, dir);
    return send(res, 200, JSON.stringify({
      code: 0, data: { bookId, kind: "epub", blocks: lite ? null : r.blocks, words, cover: r.cover, meta: r.meta, warnings: r.warnings, existed: false }
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

module.exports = { start, createServer, ROOT };

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
