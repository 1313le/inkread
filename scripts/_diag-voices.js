/* 诊断：内置音色目录的试听样音是否真的一音一档、且能取到内容 */
const https = require("https");
const crypto = require("crypto");
const path = require("path");
global.window = {};
require(path.join(__dirname, "..", "ink-reader", "voices-data.js"));
const d = window.INK_VOICE_DATA || [];

console.log("总音色:", d.length);
const urls = d.map((v) => v.sample || "");
console.log("有样音:", urls.filter(Boolean).length);
console.log("样音 URL 去重后:", new Set(urls.filter(Boolean)).size);

/* 按路径主体（去掉签名查询串）看是否真的各不相同 */
const bases = urls.filter(Boolean).map((u) => u.split("?")[0]);
console.log("样音路径去重后:", new Set(bases).size);

function get(u) {
  return new Promise((res) => {
    const r = https.get(u, { timeout: 20000 }, (x) => {
      const bufs = [];
      x.on("data", (c) => bufs.push(c));
      x.on("end", () => {
        const b = Buffer.concat(bufs);
        res({ code: x.statusCode, type: x.headers["content-type"], len: b.length, md5: crypto.createHash("md5").update(b).digest("hex").slice(0, 12) });
      });
    });
    r.on("error", (e) => res({ code: "ERR", msg: e.message }));
    r.on("timeout", () => { r.destroy(); res({ code: "TIMEOUT" }); });
  });
}
(async function () {
  const pick = ["可爱搞笑女", "冷静理性温柔帅哥", "哄睡daddy", "品牌广告女声", "优雅英国女士", "华强"];
  for (const n of pick) {
    const v = d.find((x) => x.name === n);
    if (!v) { console.log(n, "MISSING"); continue; }
    const r = await get(v.sample);
    console.log(String(n).padEnd(20), v.gender, v.lang, "→", r.code, r.type || r.msg || "", r.len || "", r.md5 || "");
  }
})();
