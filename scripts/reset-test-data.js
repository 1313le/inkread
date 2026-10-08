/* ============================================================
   reset-test-data.js · 测试数据初始化（v2.11 起的固定规矩）
   —— 功能测试结束后跑一次：node scripts/reset-test-data.js
   —— 清理对象：
      1) .work/sync-store.json      同步服务器快照（测试推送的残留数据）
      2) .work/tts-cache/           听书 TTS 合成缓存
      3) 浏览器 localStorage        验收脚本的 Playwright 临时 profile 已随进程消散；
                                    若曾用真实浏览器测过，请在应用「设置 → 清空全部数据」
                                    （会广播同步墓碑并写清空哨兵，演示数据不再回流）。
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let removed = 0;

function rm(p) {
  if (!fs.existsSync(p)) return;
  const stat = fs.statSync(p);
  if (stat.isDirectory()) { fs.rmSync(p, { recursive: true, force: true }); }
  else fs.rmSync(p, { force: true });
  console.log("已清除 " + path.relative(ROOT, p));
  removed++;
}

rm(path.join(ROOT, ".work", "sync-store.json"));
rm(path.join(ROOT, ".work", "tts-cache"));

console.log(removed ? "测试数据初始化完成（" + removed + " 项）" : "没有需要清理的测试数据");
