/* 校验 voices-data.js 目录：音色短名 / locale / er / ep 是否都符合 /api/tts 的入参规则 */
const path = require("path");
global.window = {};
require(path.join(__dirname, "..", "ink-reader", "voices-data.js"));
const d = window.INK_VOICE_DATA || [];
const VRE = /^[a-z]{2,3}-[A-Z]{2}(-[A-Za-z0-9]+)?-[A-Za-z0-9]+Neural$/;
const RRE = /^(default|[+-]?\d{1,3}%)$/;
const PRE = /^(default|[+-]?\d{1,3}Hz)$/;
console.log("count", d.length);
const bad = [], ids = {};
d.forEach((x) => {
  if (!VRE.test(x.id)) bad.push(x.id + " voice");
  if (!x.locale) bad.push(x.id + " no-locale");
  if (!RRE.test(x.er || "default")) bad.push(x.id + " er=" + x.er);
  if (!PRE.test(x.ep || "default")) bad.push(x.id + " ep=" + x.ep);
  if (ids[x.id]) bad.push(x.id + " DUP");
  ids[x.id] = 1;
  if (!x.name || !x.gender || !x.lang) bad.push(x.id + " meta");
});
console.log("bad:", bad.length ? bad.join(" | ") : "none");
const g = {}, L = {};
d.forEach((x) => {
  g[x.lang + "/" + x.gender] = (g[x.lang + "/" + x.gender] || 0) + 1;
  L[x.locale] = (L[x.locale] || 0) + 1;
});
console.log("lang/gender:", JSON.stringify(g));
console.log("locales:", JSON.stringify(L));
console.log("ids:", d.map((x) => x.id).join("\n  "));
