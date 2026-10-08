/* 逐条打 /api/tts，确认 32 款音色都能真的合成出 MP3（而不是哑火） */
const path = require("path");
global.window = {};
require(path.join(__dirname, "..", "ink-reader", "voices-data.js"));
const d = window.INK_VOICE_DATA || [];
const BASE = "http://127.0.0.1:8765/api/tts";

(async () => {
  let ok = 0, fail = 0;
  for (const v of d) {
    const text = v.demo || "墨读，让每一页都值得慢慢读。";
    const u = BASE + "?voice=" + encodeURIComponent(v.id) +
      "&rate=" + encodeURIComponent(v.er || "default") +
      "&pitch=" + encodeURIComponent(v.ep || "default") +
      "&text=" + encodeURIComponent(text);
    const t0 = Date.now();
    try {
      const r = await fetch(u);
      const b = Buffer.from(await r.arrayBuffer());
      const head = b.subarray(0, 3).toString("hex");
      const good = r.ok && b.length > 1024 && (head === "fff364" || head.startsWith("fff") || head === "494433");
      if (good) ok++; else fail++;
      console.log((good ? "OK  " : "FAIL"), v.id.padEnd(32), r.status, String(b.length).padStart(6) + "B", (Date.now() - t0) + "ms");
    } catch (e) {
      fail++;
      console.log("ERR ", v.id.padEnd(32), String(e.message).slice(0, 90));
    }
  }
  console.log("\n=== ok=" + ok + " fail=" + fail + " / " + d.length + " ===");
})();
