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
    req.on("data", (c) => { raw += c; if (raw.length > SYNC_MAX && !dead) { dead = true; req.destroy(); } });
    req.on("end", () => {
      if (dead) return;
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

function sniffKind(buf) {
  const n = Math.min(buf.length, 4096);
  const head = buf.toString("latin1", 0, n);
  if (head.slice(0, 5) === "%PDF-") return "pdf";
  if (head.slice(0, 4) === "PK\u0003\u0004") {
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
  if (decodes("utf-8", seg) || decodes("gbk", seg) || decodes("big5", seg)) return "text";
  return "unknown";
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

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:#39|apos);/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(+d); } catch (e) { return ""; } })
    .replace(/&amp;/g, "&");
}
function squeeze(s) { return String(s).replace(/\s+/g, " ").trim(); }

/* mammoth 产出的扁平 XHTML → 正文块。正则步进的状态机：
   列表用栈（嵌套 ul/ol 挂到上一条目的 sub），表格首行当表头，
   单元格/条目/段落三处文本各回各的缓冲。存原文（读侧 MD.inline 再转义）。 */
function htmlToBlocks(html) {
  const blocks = [];
  const re = /<!--[\s\S]*?-->|<\/?\s*([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g;
  const lists = [];
  let item = null;
  let para = "";
  let pend = "";
  let table = null, row = null, cell = null;
  let imgs = 0;
  let hn = 0;

  const flush = () => {
    const t = squeeze(para);
    const tp = pend || "p";
    para = ""; pend = "";
    if (!t) return;
    const b = { type: tp, x: t };
    if (tp !== "p") b.id = "h-" + (++hn);   /* 标题挂锚点 id，读侧大纲 / 起读锚定要用 */
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
    const t = squeeze(s);
    if (!t) return;
    if (cell != null) cell += (cell ? " " : "") + t;
    else if (lists.length && item) item.x += (item.x ? " " : "") + t;
    else para += (para ? " " : "") + t;
  };

  let m;
  while ((m = re.exec(html))) {
    if (m[3] != null) {
      const t = decodeEntities(m[3]);
      if (t.trim()) text(t);
      continue;
    }
    const tag = m[1].toLowerCase();
    const close = m[0][1] === "/";
    if (tag === "img") { imgs++; continue; }
    if (tag === "br") { text(" "); continue; }
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
      flush();
      if (!close) pend = "h" + Math.min(+tag[1], 3);
      continue;
    }
    if (tag === "p" || tag === "blockquote") {
      if (!lists.length && cell == null) { if (close) flush(); else { flush(); pend = "p"; } }
      continue;
    }
  }
  flush();
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
  const JSZip = lazyJszip();
  if (!JSZip) throw new Error("解析组件未安装");
  const zip = await JSZip.loadAsync(buf);
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
  return blocks;
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
  const JSZip = lazyJszip();
  if (!JSZip) throw new Error("解析组件未安装");
  const zip = await JSZip.loadAsync(buf);
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
  return { blocks };
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
  const kind = sniffKind(buf);
  const ok = (k, blocks, imgs) => send(res, 200, JSON.stringify({
    code: 0, data: { kind: k, blocks, text: blocks ? blocksText(blocks) : "", imgs: imgs || 0 }
  }), jh);
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
      const blocks = await pptxToBlocks(buf);
      if (!blocks.length) return send(res, 200, JSON.stringify({ code: 1, message: "PPTX 中未找到文本内容" }), jh);
      return ok("pptx", blocks, 0);
    }
    if (kind === "xlsx") {
      const r = await xlsxToBlocks(buf);
      if (!r.blocks.length) return send(res, 200, JSON.stringify({ code: 1, message: "XLSX 中未找到单元格内容" }), jh);
      return ok("xlsx", r.blocks, 0);
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
    return send(res, 200, JSON.stringify({ code: 1, message: "解析失败 · " + (e && e.message || e) }), jh);
  }
}

function createServer() {
  return http.createServer((req, res) => {
    const u = req.url || "/";
    /* 数据快照端点先于 method 守卫（POST 也合法） */
    if (u.indexOf("/api/store") === 0) {
      return serveStore(req, res);
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
