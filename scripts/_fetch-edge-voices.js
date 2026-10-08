/* 拉取 Edge TTS 官方语音清单，筛出中/英/日三语种，落盘供人工挑选 */
const https = require("https");
const fs = require("fs");
const path = require("path");
const URLV = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";

https.get(URLV, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0" } }, (r) => {
  let b = "";
  r.setEncoding("utf8");
  r.on("data", (c) => (b += c));
  r.on("end", () => {
    let arr;
    try { arr = JSON.parse(b); } catch (e) { return console.log("parse fail", b.slice(0, 300)); }
    const keep = arr.filter((v) => /^(zh-CN|en-US|en-GB|ja-JP)-/.test(v.ShortName));
    console.log("全部:", arr.length, "| 中英日:", keep.length);
    const rows = keep.map((v) => ({
      name: v.ShortName,
      gender: v.Gender,
      locale: v.Locale,
      cats: (v.VoiceTag && v.VoiceTag.ContentCategories) || [],
      pers: (v.VoiceTag && v.VoiceTag.VoicePersonalities) || [],
      styles: v.VoiceTag && v.VoiceTag.StyleList ? v.VoiceTag.StyleList.length : 0
    }));
    fs.writeFileSync(path.join(__dirname, "..", ".work", "edge-voices.json"), JSON.stringify(rows, null, 1), "utf8");
    rows.filter((x) => x.locale === "zh-CN").forEach((x) => console.log("  zh", x.gender, x.name, "| styles=" + x.styles, "| " + x.cats.join("/")));
    console.log("--- en-US 抽样 ---");
    rows.filter((x) => x.locale === "en-US").slice(0, 18).forEach((x) => console.log("  en", x.gender, x.name, "| styles=" + x.styles, "| " + x.cats.join("/")));
  });
}).on("error", (e) => console.log("ERR", e.message));
