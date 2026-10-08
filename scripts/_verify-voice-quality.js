/* ① 缓存里的 MP3 是否两两不同（治「名字不同听着一样」）
   ② voices-data.js 的 gender 是否与微软官方音色表一致（治「男声出女声」） */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

global.window = {};
require(path.join(__dirname, "..", "ink-reader", "voices-data.js"));
const d = window.INK_VOICE_DATA || [];

/* ① 音频唯一性 */
const CACHE = path.join(__dirname, "..", ".work", "tts-cache");
const seen = new Map();
if (fs.existsSync(CACHE)) {
  fs.readdirSync(CACHE).filter((f) => f.endsWith(".mp3")).forEach((f) => {
    const h = crypto.createHash("sha1").update(fs.readFileSync(path.join(CACHE, f))).digest("hex");
    if (!seen.has(h)) seen.set(h, []);
    seen.get(h).push(f.slice(0, 8));
  });
  const total = fs.readdirSync(CACHE).filter((f) => f.endsWith(".mp3")).length;
  console.log("缓存文件数 " + total + " · 不同音频内容 " + seen.size);
  const dup = [...seen.values()].filter((a) => a.length > 1);
  console.log("内容重复组：" + (dup.length ? JSON.stringify(dup) : "无"));
} else {
  console.log("缓存目录不存在（先跑 _verify-all-tts.js）");
}

/* ② 性别核对：拉微软官方音色表 */
function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (r) => {
      let b = "";
      r.setEncoding("utf8");
      r.on("data", (c) => (b += c));
      r.on("end", () => res(b));
    }).on("error", rej);
  });
}
(async () => {
  const LIST = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  try {
    const arr = JSON.parse(await get(LIST));
    const m = {};
    arr.forEach((v) => { m[v.ShortName] = v; });
    console.log("\n官方音色表 " + arr.length + " 条");
    const bad = [];
    d.forEach((x) => {
      const o = m[x.id];
      if (!o) { bad.push(x.id + " 官方表里没有"); return; }
      const g = String(o.Gender || "").toLowerCase();
      const want = x.gender === "m" ? "male" : "female";
      if (g !== want) bad.push(x.id + " 我们=" + x.gender + " 官方=" + o.Gender);
    });
    console.log("性别不符：" + (bad.length ? bad.join(" | ") : "无（32/32 一致）"));
  } catch (e) {
    console.log("拉官方表失败：" + e.message);
  }
})();
