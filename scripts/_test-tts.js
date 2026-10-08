/* 可行性验证：node-edge-tts 能否在本机合成出可用的中文/英文语音 */
const fs = require("fs");
const path = require("path");
const { EdgeTTS } = require(path.join(__dirname, "..", "node_modules", "node-edge-tts"));

const out = path.join(__dirname, "..", ".work", "tts-test");
fs.mkdirSync(out, { recursive: true });

async function run(name, opts, text) {
  const file = path.join(out, name + ".mp3");
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (e) {}
  const t0 = Date.now();
  try {
    const tts = new EdgeTTS(Object.assign({ timeout: 20000 }, opts));
    await tts.ttsPromise(text, file);
    const st = fs.statSync(file);
    const head = fs.readFileSync(file).subarray(0, 3).toString("hex");
    console.log(name.padEnd(22), "OK", (Date.now() - t0) + "ms", st.size + "B", "head=" + head, head === "494433" || head.startsWith("fff") || head === "4944" ? "(id3/mp3)" : "(?)");
  } catch (e) {
    console.log(name.padEnd(22), "FAIL", String(e && e.message || e).slice(0, 140));
  }
}

(async function () {
  await run("zh-Xiaoxiao", { voice: "zh-CN-XiaoxiaoNeural" }, "墨读，让每一页都值得慢慢读。");
  await run("zh-Yunxi", { voice: "zh-CN-YunxiNeural" }, "墨读，让每一页都值得慢慢读。");
  await run("zh-Yunjian", { voice: "zh-CN-YunjianNeural" }, "大江东去，浪淘尽，千古风流人物。");
  await run("en-Aria", { voice: "en-US-AriaNeural" }, "InkRead — make every page worth reading slowly.");
  await run("en-Guy", { voice: "en-US-GuyNeural" }, "InkRead — make every page worth reading slowly.");
  await run("ja-Nanami", { voice: "ja-JP-NanamiNeural" }, "墨読、すべてのページをゆっくり読む価値があります。");
})();
