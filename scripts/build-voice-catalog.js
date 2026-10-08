/* ============================================================
   build-voice-catalog.js · 从 Mossland 公开音色库生成内置音色目录
   —— 数据来源：https://mossland.studio/api/v1/voices（公开元数据，无需登录）
   —— 产物：ink-reader/voices-data.js（window.INK_VOICE_DATA）
   —— 为什么内置一份：桌面端/移动端离线时也要有完整音色表；
      联网时由 /api/moss 代理再拉一次，刷新试听音频的临时链接。
   用法：node scripts/build-voice-catalog.js [条数]
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");

const API = "https://mossland.studio/api/v1";
const OUT = path.resolve(__dirname, "..", "ink-reader", "voices-data.js");
const LIMIT = Number(process.argv[2] || 60);

const AGE = {
  juvenile: "少年", teen: "少年", child: "少年",
  adult: "青年", young: "青年",
  middle_aged: "中年", middle: "中年",
  senior: "老年", old: "老年"
};

function normLang(x) {
  const s = String(x || "").toLowerCase();
  if (s.indexOf("ja") === 0) return "ja";
  if (s.indexOf("en") === 0) return "en";
  return "zh";
}
function normGender(x) {
  return /male|男/i.test(x || "") && !/female|女/i.test(x || "") ? "m" : "f";
}
function sceneOf(v) {
  const t = (v.voice_tags || []).filter((x) => x.taxonomy_key === "scene");
  return t.length ? (t[0].label_zh || t[0].label || "") : "";
}
function scenesOf(v) {
  return (v.voice_tags || []).filter((x) => x.taxonomy_key === "scene")
    .map((x) => x.label_zh || x.label).filter(Boolean);
}

async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
  return r.json();
}

async function main() {
  const seen = new Map();
  const pages = [
    API + "/voices?offset=0&limit=" + LIMIT + "&order_by=usage_count&order_desc=true",
    API + "/voices/featured?limit=20"
  ];
  for (const u of pages) {
    let j;
    try { j = await getJSON(u); } catch (e) { console.error("跳过 " + u + " · " + e.message); continue; }
    const arr = (j && j.data && (j.data.voices || j.data.items)) || [];
    arr.forEach((v) => { if (v && v.voice_id && !seen.has(v.voice_id)) seen.set(v.voice_id, v); });
  }

  const list = [...seen.values()]
    .filter((v) => v.voice_name && (v.status ? v.status === "active" : true))
    .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));

  const rows = list.map((v) => {
    const sample = v.preview_audio_url || v.audio_sample_url || "";
    const prompt = v.preview_text || v.custom_audio_prompt || v.audio_prompt || "";
    return {
      id: v.voice_id,
      name: v.voice_name,
      d: String(v.description || "").trim(),
      lang: normLang(v.language),
      gender: normGender(v.gender),
      age: AGE[String(v.age_range || "").toLowerCase()] || "青年",
      accent: v.accent || "",
      scene: sceneOf(v),
      scenes: scenesOf(v),
      tags: Array.isArray(v.tags) ? v.tags.slice(0, 4) : [],
      sample: sample,
      prompt: String(prompt).slice(0, 120),
      use: v.usage_count || 0
    };
  });

  const head = "/* 由 scripts/build-voice-catalog.js 生成，请勿手改。\n"
    + "   数据来源：Mossland Studio 公开音色库 https://mossland.studio/voice/library\n"
    + "   生成时间：" + new Date().toISOString() + " · 共 " + rows.length + " 款\n"
    + "   sample 为带签名的临时试听地址，联网时由 /api/moss 代理刷新。 */\n";
  const body = "window.INK_VOICE_DATA = " + JSON.stringify(rows, null, 1) + ";\n";
  fs.writeFileSync(OUT, head + body, "utf8");

  const byLang = {};
  rows.forEach((r) => { byLang[r.lang] = (byLang[r.lang] || 0) + 1; });
  console.log("已写入 " + OUT);
  console.log("音色 " + rows.length + " 款 · 语言分布 " + JSON.stringify(byLang));
  console.log("含试听音频 " + rows.filter((r) => r.sample).length + " 款");
  console.log("样例：" + rows.slice(0, 5).map((r) => r.name + "(" + r.lang + "/" + r.gender + "/" + r.age + ")").join("、"));
}

main().catch((e) => { console.error("生成失败：" + e.message); process.exit(1); });
