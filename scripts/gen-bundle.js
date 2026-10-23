/* ============================================================
   gen-bundle.js · 生成《墨读-源码与开发资料汇编.md》
   —— 把全部源码与开发资料拼进一份带位置索引的汇编文档，方便后续开发。
   —— 重新生成：node scripts/gen-bundle.js（源码或资料变更后重跑即可）
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "墨读-源码与开发资料汇编.md");
const VERIFY_DIR = "C:\\Users\\Public\\inkread-verify";

/* ---------- 文件清单（相对 ROOT；extras 为外部资料） ---------- */
const DOCS = [
  "改进说明-README.md",
  "v2.1设计改造方案.md",
  "v2.5批注体系改造方案.md",
  "v2.6工具包与闪卡方案.md",
  "v2.7统计与激励方案.md",
  "v2.10闪卡画板与停靠浮窗方案.md",
  "v2.11-QA修复方案.md",
  "v2.12-方案.md",
  "体验排查与改造方案.md",
  "听书方案-调研与设计.md"
];
const EXTRAS = [
  { abs: "c:\\Users\\张展洲\\CodeBuddy\\20261007190606\\v2.10-方案与验收报告.md", label: "v2.10-方案与验收报告（存于 CodeBuddy 工作目录）" }
];
const CODE = (() => {
  /* 源码清单改成扫盘现取（跟下面引画素材同一款规矩）。原先这里手抄 21 个名字，
     而盘上有 32 个：v1.4 的 ink-loop.js / cast.js 连同 reader-app.js、ink-agent.js
     等 11 件共 795KB 从来没进过汇编——本文档头注写的却是「全部源码」。
     清单一旦手抄就必然过期，让它跟着盘走，顺手挡掉 *.bak-* / *.base-* 这类刀痕件。 */
  const dir = path.join(ROOT, "ink-reader");
  return fs.readdirSync(dir)
    .filter((f) => /\.(js|css|html)$/.test(f))
    .filter((f) => !/\.(bak|base)[.-]/.test(f))
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .sort()
    .map((f) => "ink-reader/" + f);
})();
const INFRA = [
  "scripts/serve.js", "electron/main.js", "electron/preload.js",
  "package.json", "android/capacitor.config.json", "android/package.json"
];
/* 引画素材改成扫盘现取。原先这里写死两幅（富春 / 清明），而 v2.19 之后盘上有九幅，
   且清明上河图重切过一轮 —— 索引里那行 1390.4KB 对应的是早就不存在的文件。
   清单一旦手抄就必然过期，让它跟着 assets 走。 */
const SCENE_IMGS = fs.existsSync(path.join(ROOT, "ink-reader/assets"))
  ? fs.readdirSync(path.join(ROOT, "ink-reader/assets"))
      .filter(f => /^scene-.*\.jpg$/.test(f))
      .map(f => "ink-reader/assets/" + f)
  : [];
const SKIP_CODE = SCENE_IMGS; // 图片不内联，索引中标注

/* 文件名 → 画名：读 art-credits.json，读不到就退回文件名，不写死第二份表。
   file 字段本身就是 ink-reader 相对路径（assets/scene-xxx.jpg），直接对 rel。 */
function artLabel(rel) {
  const f = rel.split("/").pop();
  try {
    const c = JSON.parse(read(path.join(ROOT, "ink-reader/assets/art-credits.json")));
    const hit = Object.keys(c.art || {}).find(k => c.art[k].file === rel.replace(/^ink-reader\//, ""));
    if (hit) return c.art[hit].name + (c.art[hit].retired ? "（已退役，文件仍随包）" : "");
  } catch (e) { /* 退回文件名 */ }
  return f.replace(/^scene-/, "").replace(/\.jpg$/, "");
}

/* ---------- 位置索引的用途说明 ---------- */
const PURPOSE = {
  "ink-reader/index.html": "书架主页：封面网格、统计条、导入弹窗、分组、备份恢复",
  "ink-reader/reader.html": "阅读器：分页/滚动、划选批注、工具包与模式环、画板草稿、悬浮球",
  "ink-reader/notes.html": "笔记工作台：大纲/脑图/Markdown 三视图、脑图重排撤销、沉浸写作",
  "ink-reader/cards.html": "闪卡复习：调度、正面/背面、编辑",
  "ink-reader/tasks.html": "任务页：清单与完成态",
  "ink-reader/themes.html": "主题商店：纸色/文体主题",
  "ink-reader/ai.html": "主脑页：AI 对话、记忆、引画、电量/网络顶栏",
  "ink-reader/app.js": "应用核心：InkStore 存储、演示播种与清空哨兵、InkSync 同步引擎、toast/弹窗基建",
  "ink-reader/api.js": "页面业务层：统计 flush、导入解析、备份导出、任务/闪卡/批注 API、deleteNote",
  "ink-reader/brain.js": "主脑记忆与信号（播种查清空哨兵）",
  "ink-reader/theme.js": "排版主题引擎：文体自适应与用户覆盖（AUTO_OFF_KEYS）、字号行距落库",
  "ink-reader/modes.js": "阅读工具包：模式环、画板、草稿（loadDraft 重建撤销栈）、沉浸模式",
  "ink-reader/dock.js": "停靠浮窗：笔记/闪卡窗格拖靠与开合",
  "ink-reader/mock.js": "演示数据 DB（first-run 播种源，清空哨兵下不再播种书架/主脑）",
  "ink-reader/md.js": "Markdown 解析/序列化（大纲树 ⇄ MD）",
  "ink-reader/scene.js": "场景引画：古画渲染（富春山居/清明上河图）",
  "ink-reader/srs.js": "间隔重复调度算法",
  "ink-reader/voices.js": "听书 TTS 引擎（/api/tts 客户端、缓存）",
  "ink-reader/voices-data.js": "音色目录数据（build-voice-catalog.js 生成）",
  "ink-reader/voices-local.js": "读者自导入的本地音色清单与本地 TTS 两形状适配（openai/gsv），键 `inkread.voices.local.v1` 且 `sync:false`（本机地址与本机音色，换机必失效）",
  "ink-reader/reader-app.js": "阅读页主控（近万行）：分页/滚动引擎、划词批注、朗读条与 @Voice 点段起读、任务清单抽屉、模式环与悬浮球、原文定位",
  "ink-reader/reader-extra.css": "阅读页页面级样式：起点式播放条、轮盘标签、悬浮球、触屏 44px 热区补丁（ID 选择器需与 @media(pointer:coarse) 同等专一性）",
  "ink-reader/cast.js": "多角色朗读引擎（阅读模式读小说）：说话人归组与配音、旧账惰性归一（ver 2 只在读到时改写）、分配落库走 api.js 的 cast.assign / cast.voices",
  "ink-reader/ink-agent.js": "主脑工具层：工具注册表 `define(\"x.y\", …)`，2026-10-23 实测在册 26 枚（v1.4 前为 9 枚，S4 加 `artifact.write/list/read`）；主脑页与阅读页共用",
  "ink-reader/ink-loop.js": "主脑自主多轮 tool-calling 回合编排器（v1.4-S2）：预算 DEF_BUDGET={rounds:6,calls:24,ms:180000}、进度与「卡住」判定、诚实化收敛",
  "ink-reader/ink-keys.js": "快捷键注册表 + 命令面板 + `?` 总览（v2.22 S5/S6）",
  "ink-reader/layout.js": "智能排版引擎（v1.1-S5d）：一键排版，所有排版量走「唯一出口十位」",
  "ink-reader/paper-spec.js": "出纸规格算法唯一真源（v2.21 E9）：print.html 以 <script> 载入，服务端 /api/export/<id>.html 用 new Function 跑同一份",
  "ink-reader/paper.css": "一张纸的排法（v2.21 E7/E9）：纸面视图与 PDF 导出管线共用",
  "ink-reader/print.html": "打印 / PDF 导出页：纸面预览 → 浏览器打印管线",
  "ink-reader/tokens.css": "尺寸刻度 token（v1.1-S6-G1）：只做等值替换 + ≤1px 邻近归并，取值由 .work/g1-plan.json 定，不是新设计的间距系统",
  "ink-reader/fonts.js": "字体加载与回退",
  "ink-reader/styles.css": "全站样式（CSS 滚动链：min-height:0 / minmax(0,1fr)；.work-card 定高上界）",
  "scripts/serve.js": "本地服务器：静态服务 + /api/tts（node-edge-tts）+ /api/store 同步快照 + Moss 音色代理；端口 8791；必须非沙箱启动（要写 .work/sync-store.json）",
  "electron/main.js": "桌面壳：窗口、启动本地服务",
  "electron/preload.js": "渲染进程桥接（白名单 API）",
  "package.json": "根工程依赖与脚本（npm run serve）",
  "android/capacitor.config.json": "Capacitor 移动壳配置（appId/server 指向本地服务）",
  "android/package.json": "Android 壳依赖（@capacitor/*）"
};
const VERIFY = {
  "verify-smoke.js": "冒烟测试（12/12）",
  "verify-r-shelf.js": "书架页全量（51/51，含 B1 tone 兜底、B2 清空不回流）",
  "verify-r-reader.js": "阅读页全量（66/66，含 B4/B5、批注纯度、草稿纸跨会话撤销）",
  "verify-n-notes.js": "笔记页全量（48/48，2 SKIP：重排撤销已由 verify-v211 行为兜底；自由文本搜索已随 v2.12 落地，由 verify-v212 兜底）",
  "verify-n-tasks.js": "任务页",
  "verify-cards.js": "闪卡（39/39）",
  "verify-a-theme.js": "主题/排版（50/50，含 B4 区域）",
  "verify-a-ai.js": "主脑页（23/23，含偏差 C 电池隐藏）",
  "verify-a-sync.js": "同步引擎（15/15，含 wipeRemote 墓碑 / pull 空删修复）",
  "verify-a-lib.js": "资料库/引画",
  "verify-dock.js": "停靠浮窗",
  "verify-pad.js": "画板",
  "verify-e-shell.js": "Electron 壳",
  "verify-focus.js": "专注模式",
  "verify-packaged.js": "打包产物",
  "verify-r-probe.js": "阅读页探针",
  "verify-v211.js": "v2.11 定向回归（6/6：Bug2 重排生效/一键撤销/落库/往返一致，行为级）",
  "verify-v212.js": "v2.12 定向验收（38/38：A 笔记自由文本搜索 18 项 Anki 语法/防抖/导出范围 + B 天幕主题页入口 19 项 + 全程零 pageerror）",
  "probe-wipe.js": "诊断：清空回流时间线",
  "probe-wipe2.js": "诊断：时间线+直 POST",
  "probe-wipe3.js": "诊断：墓碑循环+设备 B 删除",
  "probe-wipe4.js": "诊断：setItem 陷阱抓写入者（定位 statsFlush 残渣）"
};

/* ---------- 工具 ---------- */
function read(p) { return fs.readFileSync(p, "utf8"); }
function lines(s) { return s.split("\n").length; }
function kb(p) { return (fs.statSync(p).size / 1024).toFixed(1); }
const FENCE = "````";
function langOf(p) {
  if (p.endsWith(".html")) return "html";
  if (p.endsWith(".css")) return "css";
  if (p.endsWith(".json")) return "json";
  if (p.endsWith(".js")) return "javascript";
  return "markdown";
}

/* ---------- 汇编构建 ---------- */
const now = new Date();
const stamp = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0") +
  " " + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");

const out = [];
out.push("# 墨读 InkRead · 源码与开发资料汇编");
out.push("");
/* 版本行改成现读 package.json：原先手抄的是「v2.11.0（已出包）+ v2.12 候选…」，
   此后三十多版从没同步过，而快照抬头讲的却是当前事实。一处真源，重跑就不说谎。 */
let PKG_VER = "(读不到 package.json)";
try { PKG_VER = JSON.parse(read(path.join(ROOT, "package.json"))).version; } catch (e) { /* 保持上面的实话 */ }
out.push("> 生成时间：" + stamp + " · 项目版本：**" + PKG_VER + "**（版本号取自 `package.json`，不在这里手抄）");
out.push("> 项目根：`C:\\Users\\张展洲\\.zcode\\workspace\\default\\InkRead`");
out.push("> 用途：后续开发的单一入口——先查「位置索引」定位真实文件（**编辑一律改真实文件**，本汇编只是快照），再按需读对应章节全文。");
out.push("> 重新生成：`node scripts/gen-bundle.js`（源码/资料变更后重跑，保持快照新鲜）。");
out.push("");

/* ===== 第〇部分：位置索引 ===== */
out.push("---");
out.push("");
out.push("## 第〇部分 · 位置索引（先看这里）");
out.push("");
out.push("### 0.1 运行与验收");
out.push("");
out.push("| 事项 | 位置 / 命令 |");
out.push("|---|---|");
out.push("| 本地运行 | `node scripts/serve.js` → http://127.0.0.1:8791 （必须非沙箱启动，否则 /api/store 写 `.work/sync-store.json` 失败） |");
out.push("| 验收脚本目录 | `" + VERIFY_DIR + "`（Playwright，channel: msedge；`node verify-xxx.js`） |");
out.push("| v2.11 验收记录 | 本汇编第一部分《v2.11-QA修复方案.md》第六/七节 |");
out.push("");
out.push("### 0.2 开发资料（第一部分全文收录）");
out.push("");
out.push("| 位置 | KB | 内容 |");
out.push("|---|---|---|");
DOCS.forEach(d => {
  const p = path.join(ROOT, d);
  out.push("| `" + d + "` | " + kb(p) + " | " + (PURPOSE[d] || firstHeading(p)) + " |");
});
EXTRAS.forEach(e => out.push("| `" + e.abs + "` | " + kb(e.abs) + " | " + e.label + " |"));
out.push("");
out.push("### 0.3 前端源码（第二部分全文收录，`ink-reader/`）");
out.push("");
out.push("| 位置 | 行数 | KB | 用途 |");
out.push("|---|---|---|---|");
CODE.forEach(rel => {
  const p = path.join(ROOT, rel);
  out.push("| `" + rel + "` | " + lines(read(p)) + " | " + kb(p) + " | " + (PURPOSE[rel] || "") + " |");
});
SCENE_IMGS.forEach(rel => {
  const p = path.join(ROOT, rel);
  out.push("| `" + rel + "` | — | " + kb(p) + " | 引画素材：" + artLabel(rel) + "（图片不内联） |");
});
out.push("");
out.push("### 0.4 运行时基础设施（第三部分全文收录）");
out.push("");
out.push("| 位置 | 行数 | KB | 用途 |");
out.push("|---|---|---|---|");
INFRA.forEach(rel => {
  const p = path.join(ROOT, rel);
  out.push("| `" + rel + "` | " + lines(read(p)) + " | " + kb(p) + " | " + (PURPOSE[rel] || "") + " |");
});
out.push("");
out.push("### 0.5 验收与诊断脚本（第四部分仅列位置与覆盖，全文在 " + VERIFY_DIR + "）");
out.push("");
out.push("| 位置 | 覆盖 |");
out.push("|---|---|");
Object.keys(VERIFY).forEach(f => out.push("| `" + f + "` | " + VERIFY[f] + " |"));
out.push("");
out.push("> 未收录的工程产物：`build/`、`dist/`（打包输出）、`node_modules/`、`android/android/`（Gradle 工程，配置见 capacitor.config.json）、`.work/`（运行产物：同步快照 sync-store.json、TTS 缓存、历史探针）。");
out.push("");

/* ===== 第一部分：开发资料全文 ===== */
out.push("---");
out.push("");
out.push("## 第一部分 · 开发资料全文");
out.push("");
DOCS.forEach(d => {
  const p = path.join(ROOT, d);
  out.push("### ◆ 位置：`" + d + "`（" + lines(read(p)) + " 行 / " + kb(p) + " KB）");
  out.push("");
  out.push(FENCE + "markdown");
  out.push(read(p).trimEnd());
  out.push(FENCE);
  out.push("");
});
EXTRAS.forEach(e => {
  out.push("### ◆ 位置：`" + e.abs + "`（" + e.label + "）");
  out.push("");
  out.push(FENCE + "markdown");
  out.push(read(e.abs).trimEnd());
  out.push(FENCE);
  out.push("");
});

/* ===== 第二部分：前端源码全文 ===== */
out.push("---");
out.push("");
out.push("## 第二部分 · 前端源码全文（ink-reader/）");
out.push("");
CODE.forEach(rel => {
  const p = path.join(ROOT, rel);
  out.push("### ◆ 位置：`" + rel + "`（" + lines(read(p)) + " 行 / " + kb(p) + " KB）— " + (PURPOSE[rel] || ""));
  out.push("");
  out.push(FENCE + langOf(rel));
  out.push(read(p).trimEnd());
  out.push(FENCE);
  out.push("");
});

/* ===== 第三部分：基础设施全文 ===== */
out.push("---");
out.push("");
out.push("## 第三部分 · 运行时基础设施全文");
out.push("");
INFRA.forEach(rel => {
  const p = path.join(ROOT, rel);
  out.push("### ◆ 位置：`" + rel + "`（" + lines(read(p)) + " 行 / " + kb(p) + " KB）— " + (PURPOSE[rel] || ""));
  out.push("");
  out.push(FENCE + langOf(rel));
  out.push(read(p).trimEnd());
  out.push(FENCE);
  out.push("");
});

/* ===== 第四部分：验收体系说明 ===== */
out.push("---");
out.push("");
out.push("## 第四部分 · 验收体系说明");
out.push("");
out.push("脚本全文保存在 `" + VERIFY_DIR + "`（与项目分离，见 0.5 节清单）。运行方式：");
out.push("");
out.push("```bash");
out.push("cd C:\\Users\\Public\\inkread-verify");
out.push("node scripts/serve.js  # 先在项目根启动服务器（非沙箱）");
out.push("node verify-r-shelf.js # 任一套件；输出 PASS/FAIL 与 ==== n/m 通过 ====");
out.push("```");
out.push("");
out.push("要点：");
out.push("");
out.push("- 全部套件基于 Playwright（`channel: \"msedge\"`），BASE=`http://127.0.0.1:8791`；");
out.push("- v2.11 验收合计 **310/310 通过**（smoke 12、shelf 51、notes 48、theme 50、reader 66、cards 39、sync 15、ai 23、v211 定向 6）；");
out.push("- v2.12 候选功能验收 **38/38 通过**（verify-v212：A 搜索 18 + B 天幕 19 + 零 pageerror），并复跑回归：smoke 12/12、notes 48/48、theme 50/50、v211 6/6；");
out.push("- **测试结束后必须初始化应用数据**（固定规矩）：跑 `node scripts/reset-test-data.js` 一键清除 `.work/sync-store.json` 同步快照与 `.work/tts-cache/`；Playwright 临时 profile 随进程消散无需处理；若曾用真实浏览器测试，请在应用「设置 → 清空全部数据」（广播墓碑 + 写清空哨兵，演示数据不再回流）。");
out.push("");

fs.writeFileSync(OUT, out.join("\n"), "utf8");
console.log("生成完成：" + OUT);
console.log("大小 " + (fs.statSync(OUT).size / 1024 / 1024).toFixed(2) + " MB，总行数 " + lines(out.join("\n")));

function firstHeading(p) {
  const m = read(p).match(/^#\s+(.+)$/m);
  return m ? m[1] : "";
}
