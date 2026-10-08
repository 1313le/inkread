/* 试探：Read Aloud 端点是否也接受未列入 Edge 清单的 Azure 神经语音 */
const fs = require("fs");
const path = require("path");
const { EdgeTTS } = require(path.join(__dirname, "..", "node_modules", "node-edge-tts"));
const out = path.join(__dirname, "..", ".work", "tts-test");
fs.mkdirSync(out, { recursive: true });

const cands = [
  ["zh-CN-XiaomoNeural", "你看，江上起了雾，山就活了。"],
  ["zh-CN-XiaoxuanNeural", "你看，江上起了雾，山就活了。"],
  ["zh-CN-YunzeNeural", "你看，江上起了雾，山就活了。"],
  ["zh-CN-XiaohanNeural", "你看，江上起了雾，山就活了。"],
  ["zh-CN-XiaoruiNeural", "你看，江上起了雾，山就活了。"],
  ["en-US-NancyNeural", "The mist rose off the river, and the hills came alive."],
  ["en-US-TonyNeural", "The mist rose off the river, and the hills came alive."],
  ["ja-JP-AoiNeural", "霧が立ちのぼり、山が息を吹き返した。"]
];

(async function () {
  for (const [voice, text] of cands) {
    const f = path.join(out, voice + ".mp3");
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
    try {
      await new EdgeTTS({ voice: voice, timeout: 15000 }).ttsPromise(text, f);
      const st = fs.statSync(f);
      console.log(voice.padEnd(30), "OK", st.size + "B");
    } catch (e) {
      console.log(voice.padEnd(30), "FAIL", String((e && e.message) || e).slice(0, 90));
    }
  }
})();
