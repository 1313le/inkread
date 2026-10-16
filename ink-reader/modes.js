/* ============================================================
   modes.js · 墨读 InkRead 内容类别阅读模式（v9）
   ------------------------------------------------------------
   职责分三块，互不重叠：

   ① 模式注册表 —— 四类内容（书籍 / 文献 / 学习 / 漫画）的元数据与
      「独有工具」清单。公共功能（高亮 · 批注 · 书签 · 笔记 · 目录 ·
      检索 · 翻译 · 任务 · 排版 · 主题 · 朗读）一律留在 reader.html，
      本文件只提供「特定模式才有」的东西 —— 同一功能绝不出现两套实现。

   ② 识别与改判 —— 主脑读 doc + blocks 给推荐（走 API.suggestMode），
      用户可在模式条一键改判。最终以用户的 read.modeCat 为准。

   ③ 共享的翻译服务 —— 划词翻译浮层 + 段落对照。翻译是四类内容都要用的
      公共能力，故不挂在任何单一模式下。

   设计约束（沿用 design-contract v9）：
   · 零常驻动画：所有过渡都是「加 class → transition 到位 → 摘 class」。
   · 减少动效 / prefers-reduced-motion 下全部直切。
   · 不新增色值：一律走 styles.css 的三层 token。
   · 面板非模态、无遮罩 —— 正文在背后可继续阅读。
   ============================================================ */
(function () {
  "use strict";

  /* ------------------------------------------------------------
     0. 单一事实源：闪卡调度纯函数（srs.js → window.InkSRS）
     —— ymd / sm2Update / RATE / makeCloze 原先在本文件里各自实现过一份，
        与 cards.html 逐字重复（原注释写着「改一处需两处同步」）。v2.11 抽到
        srs.js，两个页面共用一份；此处保留同名局部别名，调用点一行不改。
     —— 加载顺序由 HTML 负责：reader.html 在 modes.js **之前**引入 srs.js（唯一加载方），
        cards.html 同样自带一份。所以这里不再做 document.write 兜底 ——
        两套补载机制并存只会掩盖「谁负责加载」这一个事实。
     ------------------------------------------------------------ */
  var ymd = window.InkSRS.ymd;
  var sm2Update = window.InkSRS.sm2Update;
  var RATE = window.InkSRS.RATE;
  var makeCloze = window.InkSRS.makeCloze;
  /* v2.19.6 · 闪卡出题逻辑（详见桌面《闪卡出题逻辑完善方案》）：
     挖空位置不再由 id 哈希决定，改为 srs.js 里的结构化候选打分（L0）；
     本文件只消费 clozeFor / snapHole / poolOf 三个入口，规则不散落两份。 */
  var clozeFor = window.InkSRS.clozeFor;
  var nextCloze = window.InkSRS.nextCloze;
  var snapHole = window.InkSRS.snapHole;
  var poolOf = window.InkSRS.poolOf;

  /* ------------------------------------------------------------
     1. 注册表
     ------------------------------------------------------------ */
  var META = {
    book:  { name: "书籍", icon: "book-open",      desc: "长文连续读，页边留随笔" },
    paper: { name: "文献", icon: "graduation-cap", desc: "抓引用、理双向链接" },
    study: { name: "学习", icon: "list-checks",    desc: "边读边批注、打草稿、做闪卡" },
    comic: { name: "漫画", icon: "image",          desc: "图版连续读，可分格引导" }
  };
  var LIST = ["book", "paper", "study", "comic"];

  /* 独有工具：kind = toggle（布尔开关）/ seg（多选一，点开小气泡选值）/ panel（抽屉面板）
     seg 必须带 key（写回 read 的哪个字段）与 opts（[值, 标签] 列表）——
     方向 / 间距这类「选一个值」的控件共用一套渲染与落库，不再各写一份。 */
  var TOOLS = {
    book: [
      { k: "marg", label: "随笔", icon: "pen-line", kind: "panel", hint: "在页边留一句话" }
    ],
    paper: [
      { k: "cite", label: "引用摘录", icon: "quote", kind: "panel", hint: "抽参考文献，导出 BibTeX / RIS" },
      { k: "back", label: "双向链接", icon: "link-2", kind: "panel", hint: "看哪些笔记指向同一处" }
    ],
    study: [
      { k: "pad", label: "草稿纸", icon: "pen-line", kind: "panel", hint: "随手画、随手写，落纸成笔记" },
      { k: "card", label: "闪卡", icon: "layers", kind: "panel", hint: "高亮挖空成问答卡，按遗忘曲线排期复习" },
      { k: "learn", label: "任务出处", icon: "list-checks", kind: "toggle", hint: "在正文里标出任务来源" }
    ],
    comic: [
      { k: "dir", label: "方向", icon: "rotate-ccw", kind: "seg", key: "comicDir",
        opts: [["ltr", "左→右"], ["rtl", "右→左"]], hint: "日式漫画从右到左（仅横向翻页时生效）" },
      { k: "gap", label: "间距", icon: "grip-vertical", kind: "seg", key: "comicGap",
        opts: [["seam", "无缝"], ["mid", "常规"], ["wide", "疏朗"]], hint: "条漫分格间距：无缝 = 同一场景的连续分镜" },
      { k: "guide", label: "分格引导", icon: "scan-text", kind: "toggle", hint: "一次一格，自动放大" }
    ]
  };

  var ctx = null;
  var detected = null;      /* {mode,conf,why,scores} —— 主脑给的建议，缓存一次 */
  var detecting = false;
  var panelKey = null;      /* 当前打开的工具面板 */

  function R() { return ctx.read(); }
  /* reader.html 的 state 是 IIFE 内的局部变量，此处只能经 ctx 取；面板里的
     临时态（勾了哪条引用 / 笔粗 / 第几张卡）挂在它上面，不落库。 */
  function S() { return ctx.state; }

  /* 用户设定优先；auto 时才用主脑建议；建议未回来时按文档类型兜底，避免空白 */
  function fallbackMode() {
    var d = ctx.doc || {};
    if (d.type === "paper") return "paper";
    if (d.type === "plan") return "study";
    if (d.type === "comic") return "comic";
    return "book";
  }
  function resolve() {
    var c = R().modeCat;
    if (c && c !== "auto") return c;
    return (detected && detected.mode) || fallbackMode();
  }
  function isAuto() { return R().modeCat === "auto"; }

  /* ------------------------------------------------------------
     2. 模式条：模式胶囊 + 该模式的独有工具
     ------------------------------------------------------------ */
  var stripSig = "";
  function renderStrip() {
    var host = qs("#modeStrip");
    if (!host) return;
    var m = resolve();
    var meta = META[m] || META.book;
    var tools = TOOLS[m] || [];

    /* 翻页会频繁触发 sync()；签名不变就不重建，避免闪动与横向滚动位置丢失。
       seg 的当前值、闪卡到期数都要进签名，否则改了值 / 复习完到期数变了却不刷新。 */
    var sig = m + "|" + (isAuto() ? "a" : "m") + "|" + (detected ? detected.conf + (detected.ambiguous ? "?" : "") : "-") + "|" +
      tools.map(function (t) {
        return t.k + (t.kind === "seg" ? ":" + R()[t.key] : toolOn(t) ? "1" : "0");
      }).join(",") + "|due" + dueCount();
    if (sig === stripSig && host.childElementCount) { paintHint(); return; }
    stripSig = sig;

    var head =
      '<button class="ms-chip" id="msChip" aria-haspopup="dialog" aria-expanded="false">' +
        icon(meta.icon, 14) + '<b>' + esc(meta.name) + '</b>' +
        (isAuto() ? '<i class="ms-auto">主脑</i>' : '<i class="ms-manual">手动</i>') +
        icon("chevron-down", 12) +
      '</button>' +
      '<span class="ms-sep"></span>';

    var body = tools.map(function (t) {
      var on = toolOn(t);
      var extra = "";
      if (t.kind === "seg") extra = '<i class="ms-val">' + esc(segLabel(t)) + '</i>';
      else if (t.k === "card") { var d = dueCount(); if (d) extra = '<i class="ms-due">' + d + '</i>'; }
      var aria = t.kind === "toggle"
        ? ' aria-pressed="' + (on ? "true" : "false") + '"'
        : ' aria-haspopup="dialog"';
      return '<button class="ms-tool' + (on ? " on" : "") + '" data-tool="' + t.k + '" title="' + esc(t.hint) + '"' + aria + '>' +
        icon(t.icon, 13) + '<span>' + esc(t.label) + '</span>' + extra + '</button>';
    }).join("");

    host.innerHTML = head + '<div class="ms-tools">' + body + '</div>' +
      '<span class="spacer"></span><span class="ms-hint" id="msHint"></span>';

    paintHint();
    qs("#msChip").addEventListener("click", togglePicker);
    qsa("[data-tool]", host).forEach(function (b) {
      b.addEventListener("click", function () { hitTool(b.dataset.tool); });
    });
  }

  function paintHint() {
    var el = qs("#msHint");
    if (!el) return;
    var m = resolve();
    if (detected && detected.ambiguous && isAuto()) {
      el.innerHTML = icon("alert-triangle", 12) + " 主脑不太确定，可手动改判";
      return;
    }
    el.textContent = (META[m] || {}).desc || "";
  }

  /* 工具当前态：toggle 读布尔；seg 用值徽标表达当前态（不占 on 态）；panel 看面板是否开着 */
  function toolOn(t) {
    if (t.kind === "toggle") return !!R()[t.k];
    if (t.kind === "seg") return false;
    return panelKey === t.k;
  }
  /* seg 当前值的标签（如「无缝」「右→左」），找不到就取第一项兜底 */
  function segLabel(t) {
    var v = R()[t.key];
    for (var i = 0; i < t.opts.length; i++) if (t.opts[i][0] === v) return t.opts[i][1];
    return t.opts[0][1];
  }

  /* ------------------------------------------------------------
     3. 模式选择弹层：把「主脑建议」与「用户改判」放在同一处
     ------------------------------------------------------------ */
  function togglePicker() {
    var pop = qs("#modePop");
    if (!pop) return;
    if (pop.hidden) openPicker(); else closePicker();
  }
  function closePicker() {
    var pop = qs("#modePop");
    if (pop) pop.hidden = true;
    var c = qs("#msChip");
    if (c) c.setAttribute("aria-expanded", "false");
  }
  function openPicker() {
    var pop = qs("#modePop");
    if (!pop) return;
    pop.dataset.kind = "mode";
    var cur = resolve();
    var auto = isAuto();

    var why = "";
    if (detected) {
      why = '<div class="mp-why">' +
        '<div class="mp-why-h">' + icon("sparkles", 13) + '主脑识别依据 <b>' + detected.conf + '%</b></div>' +
        '<ul>' + (detected.why.length ? detected.why.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("")
          : "<li>依据书架分类与正文结构综合判断</li>") + '</ul>' +
        '</div>';
    } else if (detecting) {
      why = '<div class="mp-why"><div class="mp-why-h">' + icon("loader-circle", 13) + '主脑正在识别…</div></div>';
    }

    /* 全屏（沉浸）下模式条是收起的 —— 把本模式的工具一并搬进弹层，
       否则草稿纸 / 闪卡这类入口在全屏里根本够不着。 */
    var quick = "";
    if (document.body.classList.contains("immersive")) {
      var qt = TOOLS[cur] || [];
      if (qt.length) {
        quick = '<div class="mp-quick"><div class="mp-quick-h">' + icon("wand-2", 12) + '本模式工具</div>' +
          '<div class="mp-quick-row">' +
          qt.map(function (t) {
            var on = t.kind === "toggle" ? !!R()[t.k] : t.kind === "panel" ? panelKey === t.k : false;
            var val = t.kind === "seg" ? '<i class="ms-val">' + esc(segLabel(t)) + '</i>' : "";
            return '<button class="ms-tool' + (on ? " on" : "") + '" data-qtool="' + t.k + '" title="' + esc(t.hint) + '">' +
              icon(t.icon, 13) + '<span>' + esc(t.label) + '</span>' + val + '</button>';
          }).join("") + '</div></div>';
      }
    }

    pop.innerHTML =
      '<header class="mp-head"><b>' + icon("wand-2", 14) + '阅读模式</b>' +
        '<button class="mp-x" id="mpClose" aria-label="收起">' + icon("x", 15) + '</button></header>' +
      '<div class="mp-body">' +
        '<button class="mp-item' + (auto ? " on" : "") + '" data-mode="auto">' +
          '<span class="mp-ic">' + icon("sparkles", 15) + '</span>' +
          '<span class="mp-tx"><b>自动（主脑识别）</b><i>' +
            (detected ? '当前识别为「' + esc((META[detected.mode] || {}).name || "") + '」' : "随内容自动切换") +
          '</i></span>' +
          (auto ? '<span class="mp-ck">' + icon("check", 14) + '</span>' : "") +
        '</button>' +
        LIST.map(function (k) {
          var on = !auto && k === cur;
          return '<button class="mp-item' + (on ? " on" : "") + '" data-mode="' + k + '">' +
            '<span class="mp-ic">' + icon(META[k].icon, 15) + '</span>' +
            '<span class="mp-tx"><b>' + esc(META[k].name) + '</b><i>' + esc(META[k].desc) + '</i></span>' +
            (on ? '<span class="mp-ck">' + icon("check", 14) + '</span>' : "") +
          '</button>';
        }).join("") +
        quick +
        why +
      '</div>' +
      '<p class="mp-foot">模式只改变「用哪些工具」，不改变你的排版与主题。最终决定权在你。</p>';

    pop.hidden = false;
    var chip = qs("#msChip");
    if (chip) chip.setAttribute("aria-expanded", "true");
    qs("#mpClose").addEventListener("click", closePicker);
    qsa("[data-mode]", pop).forEach(function (b) {
      b.addEventListener("click", function () { pickMode(b.dataset.mode); });
    });
    qsa("[data-qtool]", pop).forEach(function (b) {
      b.addEventListener("click", function () { closePicker(); hitTool(b.dataset.qtool); });
    });
  }

  function pickMode(k) {
    closePicker();
    if (k === "auto") {
      ctx.patch({ modeCat: "auto" }, "已交回主脑：随内容自动切换模式", "sparkles");
      return;
    }
    var patch = { modeCat: k };
    /* 漫画的默认读法就是竖向滑动 —— 帮用户迈出这一步，但仍可一键改回 */
    if (k === "comic" && R().mode === "paged") patch.mode = "scroll";
    ctx.patch(patch, "阅读模式：" + META[k].name + (patch.mode === "scroll" ? " · 已切到竖向滑动" : ""), META[k].icon);
    if (k === "comic") ctx.toast("日式漫画可在「方向」里改成从右到左", "rotate-ccw");
  }

  /* ------------------------------------------------------------
     4. 工具分发
     ------------------------------------------------------------ */
  function hitTool(k) {
    var t = (TOOLS[resolve()] || []).find(function (x) { return x.k === k; });
    if (!t) return;
    if (t.kind === "toggle") {
      ctx.patch(one(k, !R()[k]), (R()[k] ? "已关闭 " : "已开启 ") + t.label, t.icon);
      return;
    }
    if (t.kind === "seg") {
      openSegPop(t);
      return;
    }
    if (panelKey === k) closePanel(); else openPanel(k);
  }

  function one(k, v) { var o = {}; o[k] = v; return o; }

  /* 分段值：方向 / 间距共用一个小气泡（点同一个按钮即收起） */
  function openSegPop(t) {
    var pop = qs("#modePop");
    if (!pop) return;
    if (!pop.hidden && pop.dataset.kind === t.k) { closePicker(); return; }
    pop.dataset.kind = t.k;
    var cur = R()[t.key];
    pop.innerHTML =
      '<header class="mp-head"><b>' + icon(t.icon, 14) + esc(t.label) + '</b>' +
        '<button class="mp-x" id="mpClose" aria-label="收起">' + icon("x", 15) + '</button></header>' +
      '<div class="mp-body">' +
        '<p class="mp-note">' + esc(t.hint) + '</p>' +
        '<div class="seg mp-seg">' +
          t.opts.map(function (o) {
            return '<button class="seg-btn' + (o[0] === cur ? " on" : "") + '" data-seg="' + esc(o[0]) + '">' + esc(o[1]) + '</button>';
          }).join("") +
        '</div>' +
        (t.k === "gap"
          ? '<p class="mp-note">间距按场景节奏而定：同一场景的连续分镜用「无缝」拼成一幅长画；场景转换处留白越疏朗，停顿越久。</p>'
          : '<p class="mp-note">日式与部分韩系漫画自右向左排版；条漫（竖向滑动）不受此项影响。</p>') +
      '</div>';
    pop.hidden = false;
    qs("#mpClose").addEventListener("click", closePicker);
    qsa("[data-seg]", pop).forEach(function (b) {
      b.addEventListener("click", function () {
        var p = one(t.key, b.dataset.seg);
        ctx.patch(p, t.label + "：" + b.textContent, t.icon);
        closePicker();
      });
    });
  }

  /* ------------------------------------------------------------
     5. 工具面板（非模态抽屉，与任务抽屉同一套响应式规则）
     ------------------------------------------------------------ */
  /* 工具条上的「当前工具」高亮：抽屉面板与草稿纸浮窗（v2.10）两条路共用 */
  function markToolOn(k) {
    var b = qsa("[data-tool]").find(function (x) { return x.dataset.tool === k; });
    if (b) { b.classList.add("on"); b.setAttribute("aria-pressed", "true"); }
  }
  function clearToolOn() {
    qsa("[data-tool]").forEach(function (x) {
      var t = (TOOLS[resolve()] || []).find(function (y) { return y.k === x.dataset.tool; });
      if (t && t.kind === "panel") { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); }
    });
  }
  function openPanel(k) {
    panelKey = k;
    /* 草稿纸（v2.10）：走独立「可停靠浮窗」（reader.html 6.5.2 的 InkDock 实例），
       不再寄生在右侧抽屉里 —— 那里画布只有 230px 高、底部留白、且不能全屏。 */
    if (k === "pad" && window.InkPadWin) {
      InkPadWin.open();
      var pbody = qs("#padBody");
      if (pbody) { pbody.innerHTML = ""; PANEL.pad.render(pbody); }
      markToolOn(k);
      return;
    }
    var host = qs("#modePanel");
    if (!host) return;
    if (k === "card") { S().fcDone = 0; S().cardIdx = 0; if (!cardsReady) loadCards(); }   /* 每次打开闪卡都从「第一张到期卡」起算 */
    host.dataset.open = "on";
    host.setAttribute("aria-hidden", "false");
    renderPanel();
    /* 开合后重算落位：记忆里可能是上次浮窗的坐标，窗口/沉浸态一变就可能越界 */
    var d = ensureDock();
    if (d) mpApply(d);
    markToolOn(k);
    var chip = qs("#modePanelClose");
    if (chip) chip.focus();
  }
  function closePanel() {
    panelKey = null;
    var host = qs("#modePanel");
    if (host) { host.dataset.open = "off"; host.dataset.wide = "off"; host.setAttribute("aria-hidden", "true"); }
    if (mpDock) mpApply(mpDock);
    if (S().padRO) { S().padRO.disconnect(); S().padRO = null; }
    if (S().padKey) { document.removeEventListener("keydown", S().padKey); S().padKey = null; }   /* 画板快捷键随面板收起解绑 */
    /* 选段态是临时编辑态：面板一收就丢弃，不留下「半个洞」下次进来还在 */
    if (S().fcKey) { document.removeEventListener("keydown", S().fcKey); S().fcKey = null; }
    S().fcPick = false;
    savePadDraft();                     /* 收起草稿先落库：草稿不丢 */
    if (window.InkPadWin && InkPadWin.isOpen()) InkPadWin.close();
    clearToolOn();
    if (guideOn()) exitGuide();
  }
  function isPanelOpen(k) { return panelKey === k; }

  /* 把「当前模式」写到纸页上，供 styles.css 按类别微调版面（漫画放大图版、
     文献给摘要加引线等）。主脑建议回来前后都要写一次，否则首屏会用兜底类别。 */
  function applyDoc() {
    var docEl = qs("#doc");
    if (!docEl) return;
    docEl.setAttribute("data-cat", resolve());
    /* 漫画方向：日式 / 韩系从右到左。只在漫画模式下有意义，其余模式忽略 */
    docEl.setAttribute("data-dir", R().comicDir === "rtl" ? "rtl" : "ltr");
    /* 条漫分格间距：seam 无缝拼接 / mid 常规 / wide 疏朗，交 styles.css 落成 --panel-gap */
    docEl.setAttribute("data-gap", R().comicGap || "mid");
  }

  var PANEL = {
    marg: {
      title: "随笔", icon: "pen-line",
      sub: "写在页边的一句话，只属于这一页",
      render: renderMarg
    },
    cite: {
      title: "引用摘录", icon: "quote",
      sub: "从参考文献里勾选，导出标准引用格式",
      render: renderCite
    },
    back: {
      title: "双向链接", icon: "link-2",
      sub: "同一处原文被哪些笔记引用过",
      render: renderBack
    },
    pad: {
      title: "草稿纸", icon: "pen-line",
      sub: "画板：笔 / 橡皮 / 荧光笔 · 存下来就是一条笔记",
      render: renderPad
    },
    card: {
      title: "闪卡", icon: "layers",
      sub: "把高亮挖空成问答卡，读到这里就复习",
      render: renderCard
    }
  };

  /* ---------- 4.6 抽屉 ⇄ 浮窗（v2.19.6） ----------
     随笔 / 引用摘录 / 双向链接 / 闪卡 四个工具原先钉死在右侧，拖不出去也合不回来，
     而同页的批注与草稿纸早已能「拖到边缘吸附成侧栏、拖出去成浮窗」。
     四个面板共用同一个 #modePanel 元素，所以挂**一个** InkDock 实例四个一起获得，
     而不是各写一份（各写一份还要处理互相抢边）。
     刻意不给浮窗能力的：Aa 排版 sheet / 「更多」sheet / 模式选择弹层 / 目录预览 ——
     那些是钉在触发钮上、点外面就收的一次性弹层，浮起来只会挡住正文，
     Material 3 supporting pane 的判据也是「常驻且主内容可重排」才停靠。
     （v2.19.6 这条豁免原本还写着「目录 / 书签」：v2.23 W2 判据改成「常驻侧栏一律可拆
     可合」，目录 / 任务清单 / 书签侧栏三块已入 InkWin，见 reader.html 的 panelWin。） */
  var mpDock = null, mpReady = false;
  function mpNarrow() { return window.innerWidth <= 700; }
  /* 最大化上界＝正文台顶（与批注浮窗同一口径，别盖住顶栏） */
  function mpMaxTop() {
    var book = qs("#book"), bar = qs(".reader-bar");
    return (book && book.offsetTop) || (bar ? bar.offsetHeight : 0);
  }
  function ensureDock() {
    if (mpDock || !window.InkDock) return mpDock;
    var el = qs("#modePanel");
    if (!el || !qs("#reader", document)) return null;
    /* InkDock 的出厂态是 float，而这个抽屉的出厂语义是「钉在右侧」。
       只在用户从没动过它时补一次 docked，之后一律尊重记忆值。 */
    var firstTime = !InkDock.read()["modepanel"];
    mpDock = InkDock.create(el, {
      id: "modepanel", host: "#reader", handle: ".mpd-head",
      /* W2 头部统一：形态钮插进这条 .mpd-head（标题 + 空档 + 关闭），
         ✕ 复用宿主已有的 #modePanelClose，不造第二只。 */
      bar: ".mpd-head", x: "#modePanelClose",
      min: { w: 300, h: 320 }, dock: { min: 280, max: 560, width: 344 }, snap: 24,
      maxTop: mpMaxTop, narrow: mpNarrow,
      onState: function (l) {
        /* 建实例时为「出厂钉右侧」补的那一次 setState 不算用户动作，别弹「已合并回侧栏」 */
        if (!mpReady) return;
        if (l.state === "docked") ctx.toast("已合并回" + (l.side === "right" ? "右" : "左") + "侧栏 · 拖标题栏可再拆出", "panel-right");
        else if (l.state === "max") ctx.toast("已铺满正文区", "maximize-2");
      }
    });
    if (firstTime) mpDock.setState("docked", { side: "right" });
    mpReady = true;
    return mpDock;
  }
  /* InkDock 靠**计算样式里的 visibility** 判断面板还在不在（不在就不能占停靠边）。
     而抽屉的开合带 .34s 的 visibility 过渡，过渡期间读到的还是旧值，两头都会错：
     刚打开时以为面板隐藏 → 不去 claim 那条边，正文不让位；
     刚收起时以为面板还在 → 不撤 claim，正文右边留下一条关不掉的 344px 空栏。
     所以开、收两处都在过渡结束后补一次 apply()。（实测：收起后 --dock-w-right 仍为 344px） */
  var MP_TRANS = 380;
  function mpApply(d) {
    d.apply();
    clearTimeout(mpApply.t);
    mpApply.t = setTimeout(function () { if (mpDock) mpDock.apply(); }, MP_TRANS);
  }

  /* 抽屉骨架只建一次：InkDock 会把八条缩放手柄与停靠调宽条挂在 #modePanel 上，
     原先每次切面板都整体重写 innerHTML，会把那些节点连同监听一起抹掉。
     现在换面板只改标题/副标题/正文三处。 */
  function ensureShell(host) {
    if (qs(".mpd-head", host)) return;
    host.innerHTML =
      '<div class="mpd-grip" aria-hidden="true"></div>' +
      '<header class="mpd-head">' +
        '<span class="mpd-title" id="mpdTitle"></span>' +
        '<span class="spacer"></span>' +
        '<button class="mpd-x" id="modePanelClose" aria-label="收起">' + icon("x", 16) + '</button>' +
      '</header>' +
      '<p class="mpd-sub" id="mpdSub"></p>' +
      '<div class="mpd-body" id="mpdBody"></div>';
    qs("#modePanelClose", host).addEventListener("click", closePanel);
    bindGrip(host);
  }

  function renderPanel() {
    var host = qs("#modePanel");
    if (!host || !panelKey) return;
    /* 草稿纸（v2.10）已迁到独立浮窗：抽屉不能再画一份 ——
       否则页面里会同时存在两套 pad 工具条（DOM 重复 + 重复监听）。 */
    if (panelKey === "pad") return;
    var p = PANEL[panelKey];
    if (!p) return;
    ensureShell(host);
    qs("#mpdTitle", host).innerHTML = icon(p.icon, 15) + esc(p.title);
    qs("#mpdSub", host).textContent = p.sub;
    p.render(qs("#mpdBody", host));
  }

  function bindGrip(host) {
    var grip = qs(".mpd-grip", host);
    if (!grip) return;
    var y0 = null;
    grip.addEventListener("pointerdown", function (e) { y0 = e.clientY; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener("pointerup", function (e) {
      if (y0 !== null && e.clientY - y0 > 46) closePanel();
      y0 = null;
    });
  }

  /* ---------- 5.1 随笔：页边留一句话 ---------- */
  function renderMarg(box) {
    var list = margNotes();
    var anchor = ctx.currentAnchor();
    box.innerHTML =
      '<div class="mpd-field">' +
        '<label class="mpd-lb">当前位置</label>' +
        '<div class="mpd-anchor">' + icon("text-cursor", 12) + esc(anchorLabel(anchor)) + '</div>' +
        '<textarea class="field" id="margInput" rows="3" placeholder="例如：这段与第三章的结论呼应…"></textarea>' +
        '<button class="btn btn-accent btn-sm" id="margSave">' + icon("pen-line", 13) + '留一句</button>' +
      '</div>' +
      '<div class="mpd-list-h">本文随笔 <b>' + list.length + '</b></div>' +
      (list.length ? '<div class="mpd-list">' + list.map(margRow).join("") + '</div>'
        : '<div class="empty">' + icon("pen-line", 24) + '<p>还没有随笔<br>选中一段话，或在这里写一句</p></div>');

    qs("#margSave").addEventListener("click", async function () {
      var v = qs("#margInput").value.trim();
      if (!v) { ctx.toast("先写点什么吧", "info"); return; }
      await ctx.addNote({ docId: ctx.doc.id, kind: "margin", color: "accent", text: v, body: v, anchor: anchor, page: ctx.state.cur + 1 });
      qs("#margInput").value = "";
      renderPanel();
      ctx.toast("已留在页边", "pen-line");
    });
    qsa("[data-marg-del]", box).forEach(function (b) {
      b.addEventListener("click", async function () {
        await API.deleteNote(b.dataset.margDel);
        ctx.dropNote(b.dataset.margDel);
        renderPanel(); ctx.rerender();
        ctx.toast("已删除该条随笔", "trash-2");
      });
    });
    qsa("[data-marg-go]", box).forEach(function (b) {
      b.addEventListener("click", function () { ctx.gotoAnchor(b.dataset.margGo); });
    });
  }
  function margNotes() { return ctx.notes().filter(function (n) { return n.kind === "margin"; }); }
  function margRow(n) {
    return '<div class="mpd-item">' +
      '<div class="mpd-item-tx">' + esc(n.text) + '</div>' +
      '<div class="mpd-item-mt"><span>' + esc(anchorLabel(n.anchor)) + ' · P' + esc(n.page || 1) + '</span>' +
        '<button class="mpd-mini" data-marg-go="' + esc(n.anchor) + '">定位 ›</button>' +
        '<button class="mpd-mini danger" data-marg-del="' + esc(n.id) + '">删除</button>' +
      '</div></div>';
  }
  function anchorLabel(id) {
    var b = (ctx.blocks || []).find(function (x) { return x.id === id; });
    return (b && (b.x || "").slice(0, 18)) || "本页";
  }

  /* ---------- 5.2 引用摘录：勾选 → 导出 BibTeX / RIS（复制 + 下载文件） ---------- */
  function refItems() {
    var out = [];
    (ctx.blocks || []).forEach(function (b, i) {
      if (b.type === "refs" && b.items) {
        b.items.forEach(function (t, j) { out.push({ i: i, j: j, text: t }); });
      }
    });
    return out;
  }
  function refFmt() { return S().citeFmt || (S().citeFmt = "bib"); }
  function refFmtName(f) { return f === "bib" ? "BibTeX" : f === "ris" ? "RIS" : "纯文本"; }
  function refFmtExt(f) { return f === "bib" ? "bib" : f === "ris" ? "ris" : "txt"; }

  function renderCite(box) {
    var refs = refItems();
    if (!refs.length) {
      box.innerHTML = '<div class="empty">' + icon("quote", 24) +
        '<p>本文没有参考文献表<br>文献模式会在含「参考文献」的文档里抽取条目</p></div>';
      return;
    }
    var picked = S().cite || (S().cite = {});
    var fmt = refFmt();
    box.innerHTML =
      '<div class="mpd-tools">' +
        '<button class="chip chip-btn" id="citeAll">全选</button>' +
        '<button class="chip chip-btn" id="citeNone">清空</button>' +
        '<span class="spacer"></span><span class="card-note" id="citeN"></span>' +
      '</div>' +
      '<div class="mpd-list">' + refs.map(function (r) {
        var k = r.i + "-" + r.j;
        return '<label class="cite-item' + (picked[k] ? " on" : "") + '">' +
          '<input type="checkbox" data-cite="' + k + '"' + (picked[k] ? " checked" : "") + '>' +
          '<span class="cite-n">[' + (r.j + 1) + ']</span>' +
          '<span class="cite-tx">' + esc(r.text) + '</span>' +
        '</label>';
      }).join("") + '</div>' +
      '<div class="mpd-foot cite-foot">' +
        '<div class="seg seg-xs" id="citeFmt" role="group" aria-label="导出格式">' +
          ["bib", "ris", "txt"].map(function (f) {
            return '<button class="seg-btn' + (f === fmt ? " on" : "") + '" data-fmt="' + f + '">' + refFmtName(f) + '</button>';
          }).join("") +
        '</div>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn-ghost btn-sm" id="citeCopy">' + icon("copy", 13) + '复制</button>' +
        '<button class="btn btn-accent btn-sm" id="citeDl">' + icon("download", 13) + '下载</button>' +
      '</div>' +
      '<p class="mpd-note">BibTeX 交给 LaTeX / Overleaf，RIS 交给 Zotero / EndNote —— 下载后可直接导入。</p>';
    paintCiteN();
    qs("#citeAll").addEventListener("click", function () { refs.forEach(function (r) { picked[r.i + "-" + r.j] = 1; }); renderPanel(); });
    qs("#citeNone").addEventListener("click", function () { S().cite = {}; renderPanel(); });
    qsa("[data-cite]", box).forEach(function (c) {
      c.addEventListener("change", function () { picked[c.dataset.cite] = c.checked ? 1 : 0; paintCiteN(); });
    });
    qsa("[data-fmt]", box).forEach(function (b) {
      b.addEventListener("click", function () { S().citeFmt = b.dataset.fmt; renderPanel(); });
    });
    qs("#citeCopy").addEventListener("click", function () { copyRefs(refFmt()); });
    qs("#citeDl").addEventListener("click", function () { downloadRefs(refFmt()); });
  }
  function paintCiteN() {
    var el = qs("#citeN");
    if (!el) return;
    var n = Object.keys(S().cite || {}).filter(function (k) { return S().cite[k]; }).length;
    el.textContent = n ? "已选 " + n + " 条" : "勾选要引用的条目";
  }
  function pickedRefs() {
    var picked = S().cite || {};
    return refItems().filter(function (r) { return picked[r.i + "-" + r.j]; });
  }
  function refsText(fmt) {
    var list = pickedRefs();
    if (!list.length) return null;
    return list.map(function (r) {
      return fmt === "bib" ? toBib(r) : fmt === "ris" ? toRis(r) : r.text;
    }).join(fmt === "txt" ? "\n" : "\n\n");
  }
  function copyRefs(fmt) {
    var txt = refsText(fmt);
    if (!txt) { ctx.toast("先勾选要引用的条目", "info"); return; }
    /* 剪贴板可能因权限被拒；预览卡才是真正的交付物，拒绝时静默即可，不留未处理的 rejection */
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
    ctx.toast(pickedRefs().length + " 条引用已复制（" + refFmtName(fmt) + "）", "copy");
    preview("引用导出 · " + refFmtName(fmt), txt);
  }
  /* 真下载：Blob + <a download>，不依赖剪贴板权限；失败则退回复制，不让读者白点一次 */
  function downloadRefs(fmt) {
    var txt = refsText(fmt);
    if (!txt) { ctx.toast("先勾选要引用的条目", "info"); return; }
    var base = (ctx.doc && ctx.doc.id) ? ctx.doc.id : "inkread";
    var name = base + "-refs." + refFmtExt(fmt);
    try {
      var blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      ctx.toast("已下载 " + name + "（" + pickedRefs().length + " 条）", "download");
    } catch (e) {
      ctx.toast("下载不可用，已改为复制到剪贴板", "alert-triangle");
      if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
    }
  }
  /* 从「作者. 题名. 刊名, 年.」这类条目里尽力拆字段；拆不出的退回整条，绝不编造。
     作者按「、/ , / ; / and」切成多人 —— BibTeX 用 and 连接，RIS 每人一条 AU。 */
  function refParts(t) {
    var s = String(t || "").trim();
    var m = s.match(/^(.+?)[\.。]\s*(.+?)[\.。]\s*(.+?)[,，]\s*(\d{4})/);
    var author = "", title = s, site = "", year = "";
    if (m) { author = m[1].trim(); title = m[2].trim(); site = m[3].trim(); year = m[4]; }
    var authors = author ? author.split(/\s*(?:、|,|;|；|\band\b)\s*/).filter(Boolean) : [];
    return { author: author, authors: authors, title: title, site: site, year: year };
  }
  /* LaTeX 保留字符转义：{ } \ $ & # ^ _ % ~ 不转义会让 BibTeX 编译直接报错 */
  function texEsc(s) {
    return String(s || "").replace(/[\\{}$&#^_%~]/g, function (c) {
      if (c === "\\") return "\\textbackslash{}";
      if (c === "~") return "\\textasciitilde{}";
      if (c === "^") return "\\textasciicircum{}";
      return "\\" + c;
    });
  }
  function toBib(r) {
    var p = refParts(r.text);
    var first = (p.authors[0] || "ref").split(/[\s,、]/)[0] || "ref";
    var key = first + (p.year || "") + "-" + (r.j + 1);
    return "@article{" + key + ",\n" +
      (p.authors.length ? "  author  = {" + p.authors.map(texEsc).join(" and ") + "},\n" : "") +
      "  title   = {" + texEsc(p.title) + "},\n" +
      (p.site ? "  journal = {" + texEsc(p.site) + "},\n" : "") +
      "  year    = {" + (p.year || "") + "}\n}";
  }
  function toRis(r) {
    var p = refParts(r.text);
    return "TY  - JOUR\n" +
      (p.authors.length ? p.authors.map(function (a) { return "AU  - " + a + "\n"; }).join("") : "") +
      "TI  - " + p.title + "\n" +
      (p.site ? "JO  - " + p.site + "\n" : "") +
      (p.year ? "PY  - " + p.year + "\n" : "") +
      "ER  - ";
  }

  /* ---------- 5.3 双向链接：同一处原文被谁引用 ---------- */
  function renderBack(box) {
    var notes = ctx.notes().filter(function (n) { return n.kind !== "margin"; });
    var byAnchor = {};
    notes.forEach(function (n) {
      var a = n.anchor || "doc-top";
      (byAnchor[a] = byAnchor[a] || []).push(n);
    });
    var anchors = Object.keys(byAnchor).filter(function (a) { return byAnchor[a].length >= 1; });
    var cur = ctx.currentAnchor();
    if (!anchors.length) {
      box.innerHTML = '<div class="empty">' + icon("link-2", 24) + '<p>还没有可链接的笔记<br>先高亮或写一条笔记</p></div>';
      return;
    }
    /* 当前所在处的笔记置顶，一眼看到「我在这里做过什么」 */
    anchors.sort(function (a, b) { return (b === cur) - (a === cur); });
    box.innerHTML = anchors.map(function (a) {
      var arr = byAnchor[a];
      var here = a === cur;
      return '<div class="back-grp' + (here ? " here" : "") + '">' +
        '<div class="back-h"><span class="back-ic">' + icon("target", 12) + '</span>' +
          '<span class="back-t">' + esc(anchorLabel(a)) + '</span>' +
          (here ? '<span class="back-now">当前</span>' : '') +
          '<span class="spacer"></span><b>' + arr.length + '</b>' +
          '<button class="mpd-mini" data-back-go="' + esc(a) + '">定位 ›</button>' +
        '</div>' +
        '<div class="back-list">' + arr.map(function (n) {
          var kind = n.kind === "highlight" ? "高亮" : n.kind === "bookmark" ? "书签" : "笔记";
          return '<button class="back-item" data-back-note="' + esc(n.id) + '">' +
            '<i class="back-k">' + kind + '</i><span>' + esc((n.text || n.title || "").slice(0, 46)) + '</span>' +
          '</button>';
        }).join("") + '</div></div>';
    }).join("");
    qsa("[data-back-go]", box).forEach(function (b) {
      b.addEventListener("click", function () { ctx.gotoAnchor(b.dataset.backGo); });
    });
    qsa("[data-back-note]", box).forEach(function (b) {
      b.addEventListener("click", function () { ctx.focusNote(b.dataset.backNote); });
    });
  }

  /* ---------- 5.4 草稿纸 → 画板（v2.10） ----------
     调研依据（Microsoft Learn「Pen interactions and Windows Ink」，2026-03-04）：
       ① 工具顺序按使用频率：笔 → 橡皮 → 荧光笔 → 撤销/重做；
       ② 粗细用离散档位（三档），不做连续滑块；调色板 6–12 色、取主题色为首；
          色块命中区 ≥40px、间距 ≥8px（防误触）；
       ③ 笔与荧光笔**各自独立**的颜色与粗细（用户不认为它们共用一套设置）；
       ④ 撤销以「一次用户操作」为单元，另给 Ctrl+Z / Ctrl+Y；
       ⑤ 「清空」这类破坏性操作**必须可撤销**（比二次确认更轻，且不打断手感）；
       ⑥ 橡皮默认**整笔擦除**（不是局部擦像素），并有独立尺寸档；
       ⑦ 工具栏放在画布外相邻位置，全屏后仍常驻（不遮挡、不挡掌托）。
     载体（v2.10 用户反馈）：草稿纸不再是右侧抽屉里的窄条，改为独立可停靠浮窗
     （reader.html 6.5.2 / InkDock），所以画布高度跟随窗口 —— 底边不再留空。
     数据：笔迹以**相对坐标（0..1）**存 inkread.pad.v1 —— 浮窗宽度随时在变，
     只有相对坐标才能在任意窗宽下原样重绘；PNG 仅在「存为笔记」时生成缩略图。 */
  var PAD_KEY = "inkread.pad.v1";
  var PAD_TOOLS = [
    { k: "pen", icon: "pen-line",    n: "笔" },
    { k: "er",  icon: "eraser",      n: "橡皮" },
    { k: "hl",  icon: "highlighter", n: "荧光笔" }
  ];
  /* 调色板：全部走主题 token（29 套主题自动同调），深色主题下也不会出现白底黑字的突兀感 */
  var PAD_COLORS = [
    { t: "--ink", n: "墨" }, { t: "--accent", n: "朱砂" }, { t: "--amber", n: "赭石" }, { t: "--green", n: "松绿" },
    { t: "--blue", n: "黛青" }, { t: "--accent-2", n: "青绿" }, { t: "--ink-3", n: "淡墨" }, { t: "--paper", n: "纸白" }
  ];
  var PAD_SIZES = [{ v: 2, n: "细" }, { v: 4, n: "中" }, { v: 7, n: "粗" }];
  var PAD_HL_SIZES = [{ v: 10, n: "细" }, { v: 16, n: "中" }, { v: 24, n: "粗" }];
  var PAD_ER_SIZES = [{ v: 12, n: "细" }, { v: 22, n: "中" }, { v: 36, n: "粗" }];
  var padApi = null;                      /* 当前打开的草稿纸接口（供收起时落库） */

  function padStore() {
    try {
      var v = JSON.parse(localStorage.getItem(PAD_KEY));
      return v && typeof v === "object" && v.docs && typeof v.docs === "object" ? v : { docs: {} };
    } catch (e) { return { docs: {} }; }
  }
  function padWrite(m) {
    try { localStorage.setItem(PAD_KEY, JSON.stringify(m)); } catch (e) {}
    /* 同步引擎按 inkread.* 前缀自动纳入，无需额外登记 */
  }
  function savePadDraft() { if (padApi) padApi.save(); }

  function renderPad(box) {
    box.innerHTML =
      '<div class="pad-wrap">' +
        '<div class="pad-toolbar">' +
          '<span class="seg seg-xs" id="padTool" role="group" aria-label="工具">' +
            PAD_TOOLS.map(function (t, i) {
              return '<button class="seg-btn' + (i === 0 ? " on" : "") + '" data-ptool="' + t.k + '" title="' + t.n + '" aria-label="' + t.n + '">' +
                     icon(t.icon, 13) + '</button>';
            }).join("") +
          '</span>' +
          '<span class="pad-colors" id="padColors" role="group" aria-label="颜色">' +
            PAD_COLORS.map(function (c, i) {
              return '<button class="pad-sw' + (i === 0 ? " on" : "") + '" data-pcolor="' + c.t + '" title="' + c.n + '" aria-label="' + c.n + '" style="--sw:var(' + c.t + ')"></button>';
            }).join("") +
          '</span>' +
          '<span class="seg seg-xs" id="padSize" role="group" aria-label="粗细">' +
            PAD_SIZES.map(function (s, i) {
              return '<button class="seg-btn' + (i === 0 ? " on" : "") + '" data-psize="' + s.v + '">' + s.n + '</button>';
            }).join("") +
          '</span>' +
          '<span class="spacer"></span>' +
          '<button class="mpd-mini" id="padUndo" title="撤销一步（Ctrl+Z）">' + icon("undo-2", 12) + '</button>' +
          '<button class="mpd-mini" id="padRedo" title="重做（Ctrl+Y）">' + icon("redo-2", 12) + '</button>' +
          '<button class="mpd-mini danger" id="padClear" title="清空（可撤销）">' + icon("trash-2", 12) + '</button>' +
        '</div>' +
        '<canvas class="pad-canvas" id="padCv" tabindex="0" aria-label="草稿纸画布"></canvas>' +
        '<div class="pad-foot">' +
          '<input class="field" id="padCap" placeholder="给这张草稿起个名字（可留空）" autocomplete="off">' +
          '<button class="btn btn-accent btn-sm" id="padSave">' + icon("circle-check", 13) + '存为笔记</button>' +
          '<span class="card-note" id="padNote">草稿只落在本机 · 收起不丢</span>' +
        '</div>' +
      '</div>';

    var cv = qs("#padCv");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = 0, H = 0, g = null;
    var strokes = [], cur = null, erasing = null, ring = null;
    var undoStack = [], redoStack = [], saveTimer = null;

    /* ---------- 工具状态：笔与荧光笔各自独立记「颜色 + 粗细」 ---------- */
    var tool = "pen";
    var P = { pen: { c: cssVar("--ink"), w: 2 }, hl: { c: cssVar("--amber"), w: 16 }, er: { w: 22 } };

    function loadDraft() {
      var st = padStore().docs[ctx.doc.id];
      if (!st || !st.strokes || !st.strokes.length) return false;
      strokes = st.strokes;
      /* v2.11：重开草稿时撤销栈是空的（新实例 / 收起重开），首撤必然落空。
         逐笔回放入栈，重建「一步一笔」的跨会话撤销：栈里只放「每笔之前」的前缀态
         （栈顶 = 少最后一笔），undo 一次少一笔，redo 可加回。 */
      undoStack = [];
      for (var i = 0; i < strokes.length; i++) undoStack.push(JSON.stringify(strokes.slice(0, i)));
      if (undoStack.length > 40) undoStack = undoStack.slice(-40);
      redoStack = [];
      qs("#padCap").value = st.cap || "";
      qs("#padNote").textContent = "已恢复上次未保存的草稿 · " + strokes.length + " 笔";
      return true;
    }
    function save() {
      var m = padStore();
      if (!strokes.length) { delete m.docs[ctx.doc.id]; }
      else {
        m.docs[ctx.doc.id] = { at: Date.now(), cap: qs("#padCap") ? qs("#padCap").value.trim() : "",
                               size: [Math.round(W), Math.round(H)], strokes: strokes };
      }
      padWrite(m);
    }
    function saveSoon() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { saveTimer = null; save(); }, 900);
    }

    /* ---------- 画布 ---------- */
    function setup() {
      W = cv.clientWidth || 300;
      H = cv.clientHeight || 230;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.lineCap = "round"; g.lineJoin = "round";
      redraw();
    }
    function paint(s) {
      g.globalAlpha = s.t === "hl" ? 0.34 : 1;
      g.globalCompositeOperation = s.t === "hl" ? "multiply" : "source-over";
      g.strokeStyle = s.c;
      g.lineWidth = s.w;
      g.beginPath();
      s.p.forEach(function (p, i) {
        var x = p[0] * W, y = p[1] * H;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      if (s.p.length === 1) { g.lineTo(s.p[0][0] * W + .01, s.p[0][1] * H); }   /* 单点＝一个圆点 */
      g.stroke();
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
    function redraw() {
      if (!g) return;
      g.clearRect(0, 0, W, H);
      strokes.forEach(paint);
      if (ring) {                       /* 橡皮尺寸预览（指南：橡皮要有自己的尺寸提示） */
        g.strokeStyle = cssVar("--ink-3");
        g.lineWidth = 1;
        g.beginPath();
        g.arc(ring[0] * W, ring[1] * H, P.er.w, 0, Math.PI * 2);
        g.stroke();
      }
    }
    function pos(e) {
      var r = cv.getBoundingClientRect();
      return [Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))),
              Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1)))];
    }

    /* ---------- 撤销栈：一次用户操作＝一个快照（一笔 / 一次擦除 / 一次清空） ---------- */
    function snapshot() {
      undoStack.push(JSON.stringify(strokes));
      if (undoStack.length > 40) undoStack.shift();
      redoStack.length = 0;
    }
    function undo() {
      if (!undoStack.length) { ctx.toast("没有可撤销的操作", "info"); return; }
      redoStack.push(JSON.stringify(strokes));
      strokes = JSON.parse(undoStack.pop());
      redraw(); saveSoon();
    }
    function redo() {
      if (!redoStack.length) { ctx.toast("没有可重做的操作", "info"); return; }
      undoStack.push(JSON.stringify(strokes));
      strokes = JSON.parse(redoStack.pop());
      redraw(); saveSoon();
    }

    /* ---------- 落笔 ---------- */
    cv.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      cv.setPointerCapture(e.pointerId);
      cv.focus();
      snapshot();
      if (tool === "er") { erasing = { id: e.pointerId, hit: 0 }; ring = pos(e); eraseAt(ring); redraw(); return; }
      cur = { t: tool, c: tool === "hl" ? P.hl.c : P.pen.c, w: tool === "hl" ? P.hl.w : P.pen.w, p: [pos(e)] };
      strokes.push(cur);
      redraw();
    });
    cv.addEventListener("pointermove", function (e) {
      if (erasing && e.pointerId === erasing.id) { ring = pos(e); eraseAt(ring); redraw(); return; }
      if (!cur) return;
      cur.p.push(pos(e));
      paint(cur);                       /* 增量绘制：整笔重绘只在 setup / 撤销时发生 */
    });
    /* 整笔擦除：命中即整条拿掉（与系统墨迹的默认橡皮一致），一次手势记一步撤销 */
    function eraseAt(p) {
      var r = P.er.w / Math.max(1, W);
      var keep = [];
      for (var i = 0; i < strokes.length; i++) {
        var s = strokes[i], hit = false;
        for (var j = 0; j < s.p.length && !hit; j++) {
          var q = s.p[j];
          if (j > 0) {                  /* 点到线段的距离（用相对坐标近似，半径按宽度归一） */
            var a = s.p[j - 1];
            var vx = q[0] - a[0], vy = q[1] - a[1];
            var t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1);
            t = Math.max(0, Math.min(1, t));
            if (Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy)) <= r + (s.w / 2) / W) hit = true;
          } else if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= r + (s.w / 2) / W) hit = true;
        }
        if (hit) { if (erasing) erasing.hit++; } else { keep.push(s); }
      }
      if (keep.length !== strokes.length) strokes = keep;
    }
    function endStroke(e) {
      if (erasing && (!e || e.pointerId === erasing.id)) {
        erasing = null; ring = null; redraw();
        saveSoon();
        return;
      }
      if (cur) { cur = null; saveSoon(); }
    }
    cv.addEventListener("pointerup", endStroke);
    cv.addEventListener("pointercancel", endStroke);
    cv.addEventListener("pointerleave", function (e) { if (erasing) { erasing = null; ring = null; redraw(); } });

    /* ---------- 工具条 / 调色板 / 粗细 ---------- */
    function sizeSet() { return tool === "hl" ? PAD_HL_SIZES : (tool === "er" ? PAD_ER_SIZES : PAD_SIZES); }
    function curSize() { return tool === "er" ? P.er.w : (tool === "hl" ? P.hl.w : P.pen.w); }
    function paintSizeSeg() {
      var list = sizeSet(), curV = curSize();
      qs("#padSize").innerHTML = list.map(function (s) {
        return '<button class="seg-btn' + (s.v === curV ? " on" : "") + '" data-psize="' + s.v + '">' + s.n + '</button>';
      }).join("");
      qsa("[data-psize]", box).forEach(function (b) {
        b.addEventListener("click", function () { setSize(+b.dataset.psize); });
      });
    }
    function paintColorRow() {
      /* 颜色只对笔 / 荧光笔有意义；橡皮选中时整行淡化但仍可预选 */
      qs("#padColors").setAttribute("data-off", tool === "er" ? "1" : "0");
      qsa("[data-pcolor]", box).forEach(function (b) {
        var c = cssVar(b.dataset.pcolor) || cssVar("--ink");
        var on = (tool === "hl" ? P.hl.c : P.pen.c) === c;
        b.classList.toggle("on", !!on && tool !== "er");
      });
    }
    function setTool(k) {
      tool = k;
      qsa("[data-ptool]", box).forEach(function (b) { b.classList.toggle("on", b.dataset.ptool === k); });
      cv.style.cursor = k === "er" ? "cell" : "crosshair";
      paintSizeSeg(); paintColorRow();
      var names = { pen: "笔", er: "橡皮", hl: "荧光笔" };
      var sizes = { pen: P.pen.w, er: P.er.w, hl: P.hl.w };
      ctx.toast(names[k] + " · 粗细 " + sizes[k] + "px" + (k === "hl" ? " · 半透明叠加" : (k === "er" ? " · 整笔擦除" : "")), PAD_TOOLS.filter(function (t) { return t.k === k; })[0].icon);
    }
    function setColor(tok) {
      var v = cssVar(tok) || cssVar("--ink");
      if (tool === "hl") P.hl.c = v; else P.pen.c = v;
      paintColorRow();
    }
    function setSize(v) {
      if (tool === "er") P.er.w = v; else if (tool === "hl") P.hl.w = v; else P.pen.w = v;
      paintSizeSeg();
      if (tool === "er") { ring = null; }
    }
    qsa("[data-ptool]", box).forEach(function (b) { b.addEventListener("click", function () { setTool(b.dataset.ptool); }); });
    qsa("[data-pcolor]", box).forEach(function (b) { b.addEventListener("click", function () { setColor(b.dataset.pcolor); }); });
    paintSizeSeg(); paintColorRow();

    qs("#padUndo").addEventListener("click", undo);
    qs("#padRedo").addEventListener("click", redo);
    qs("#padClear").addEventListener("click", function () {
      if (!strokes.length) { ctx.toast("草稿纸还是空的", "info"); return; }
      snapshot();
      strokes = [];
      redraw(); saveSoon();
      ctx.toast("已清空 · Ctrl+Z 可撤销", "trash-2");
    });

    /* 快捷键：Ctrl+Z / Ctrl+Y（只在焦点落在画板里时接管，不抢正文的撤销） */
    function keydown(e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      var a = document.activeElement;
      var inside = a && (box.contains(a) || a === document.body);
      if (!inside) return;
      var k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    }
    if (S().padKey) document.removeEventListener("keydown", S().padKey);   /* 重开面板不叠加监听 */
    document.addEventListener("keydown", keydown);
    S().padKey = keydown;

    /* ---------- 存为笔记：矢量笔迹随笔记一起落库（PNG 只作缩略图） ---------- */
    qs("#padSave").addEventListener("click", async function () {
      if (!strokes.length) { ctx.toast("草稿纸还是空的", "info"); return; }
      var cap = qs("#padCap").value.trim() || "手写草稿";
      var png = cv.toDataURL("image/png");
      await ctx.addNote({
        docId: ctx.doc.id, kind: "note", ntype: "md", color: "ink",
        title: cap,
        text: cap,
        body: "> " + cap + "\n\n（画板草稿 · 共 " + strokes.length + " 笔，矢量笔迹随笔记保存）",
        anchor: ctx.currentAnchor(), page: ctx.state.cur + 1,
        sketch: { png: png, strokes: strokes.length, vec: strokes, size: [Math.round(W), Math.round(H)] }
      });
      ctx.toast("草稿已存为笔记", "circle-check");
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }   /* 别让防抖把刚清掉的草稿又写回去 */
      undoStack.length = 0; redoStack.length = 0;
      strokes = [];
      redraw();
      qs("#padCap").value = "";
      qs("#padNote").textContent = "草稿只落在本机 · 收起不丢";
      save();
    });

    /* ---------- 启动 ---------- */
    setup();
    var restored = loadDraft();
    if (restored) redraw();             /* setup 里已 redraw 过一次，恢复后再来一次 */
    if (!restored) ctx.toast("画板：笔 / 橡皮 / 荧光笔，Ctrl+Z 撤销；拖标题栏可吸附成侧栏", "pen-line");
    /* 浮窗尺寸变化 / 全屏 / 停靠：位图后备尺寸跟着重算，笔迹按相对坐标原样重绘 */
    if (typeof ResizeObserver === "function") {
      if (S().padRO) S().padRO.disconnect();
      S().padRO = new ResizeObserver(function () { setup(); });
      S().padRO.observe(cv);
    }
    padApi = { save: save, undo: undo, redo: redo, count: function () { return strokes.length; },
               strokes: function () { return strokes; }, redraw: redraw };
  }

  /* ---------- 5.5 闪卡：高亮挖空 → 间隔重复复习（SM-2） ---------- */
  /* 复习状态与 api.js 的 inkread.cards.v1 同源，按笔记 id 索引：
     {ef 难度系数, ivl 当前间隔(天), reps 连续答对次数, due 下次到期日, last 上次复习日} */
  var cards = {};
  var cardsReady = false;

  /* ymd 见文件顶部别名（srs.js 单一事实源） */
  /* 卡源口径交给 srs.js 的 poolOf（≥8 字 + kind 过滤 + **同文去重**都在那一份里）。
     poolDup 记最近一次被并掉的同文条数，卡组底部如实告知，不假装没发生。 */
  var poolDup = 0;
  function poolAll() {
    var p = poolOf(ctx.notes());
    poolDup = p.dup;
    return p.list;
  }
  /* 到期判定：从未复习过，或到期日不晚于今天 */
  function isDue(id) {
    var st = cards[id];
    return !st || !st.due || st.due <= ymd();
  }
  /* 待复习张数：模式条徽标与闪卡面板共用同一口径，避免两处算出不同的数。
     排除（excluded）与挂起（suspended）都不计 —— 挂起是「这轮先放着」，
     排除是「这条本来就不该成卡」，两者都不该出现在徽标数字里。 */
  function dueCount() {
    if (!cardsReady) return 0;
    return poolAll().filter(function (n) { return !isSuspended(n.id) && !isExcluded(n.id) && isDue(n.id); }).length;
  }
  /* 挂起：Anki 式「这张卡先放一放」—— 挂起卡不进复习队列、不计到期数，
     状态随 inkread.cards.v1 一并落库（suspended 字段），卡组视图里可随时恢复 */
  function isSuspended(id) { return !!(cards[id] && cards[id].suspended); }
  /* 排除：墨墨「标示熟知 / 删除」在墨读里的等价物 —— 这条高亮不该成卡。
     与挂起的差别只在语义：排除不进卡组计数（共 N 张），但**在卡组里始终可见可撤回**，
     不做不可逆删除（删高亮是删用户的读书笔记，两回事）。 */
  function isExcluded(id) { return !!(cards[id] && cards[id].excluded); }
  function loadCards() {
    return API.fetchCards().then(function (r) {
      cards = (r && r.data) || {};
      cardsReady = true;
      renderStrip();
      if (panelKey === "card") renderPanel();
    }).catch(function () { cardsReady = true; });
  }

  /* sm2Update / RATE 见文件顶部别名（srs.js 单一事实源） */

  function renderCard(box) {
    if (!cardsReady) {
      box.innerHTML = '<div class="empty">' + icon("loader-circle", 24) + '<p>正在读取复习进度…</p></div>';
      loadCards();
      return;
    }
    var all = poolAll();
    if (!all.length) {
      box.innerHTML = '<div class="empty">' + icon("layers", 24) +
        '<p>还没有可做卡的内容<br>先在书里高亮几句话，闪卡会从这里生成</p>' +
        '<p class="empty-sub">成卡条件：≥ 8 字的高亮或页边随笔，且同文只留一张。<br>' +
        '挖空取句中的术语、数字或定义后半句；挑不出考点的句子不会硬出卡，<br>' +
        '可以在卡片上自己点选要背的那一段。</p></div>';
      return;
    }
    /* 复习 / 卡组 两视图：卡组列出全部卡（含挂起、已排除），可随时改（Anki 式） */
    var view = S().fcView === "deck" ? "deck" : "review";
    var head = '<div class="fc-tabs" role="tablist">' +
      '<button class="fc-tab' + (view === "review" ? " on" : "") + '" data-fcview="review">复习</button>' +
      '<button class="fc-tab' + (view === "deck" ? " on" : "") + '" data-fcview="deck">卡组</button>' +
      '</div>';
    if (view === "deck") { renderDeck(box, head, all); return; }
    var active = all.filter(function (n) { return !isSuspended(n.id) && !isExcluded(n.id); });
    if (!active.length) {
      box.innerHTML = head + '<div class="empty">' + icon("layers", 24) +
        '<p>卡片都不在复习中<br>到「卡组」里恢复或撤回排除</p></div>';
      bindViewSeg(box);
      return;
    }
    var due = active.filter(function (n) { return isDue(n.id); });
    /* 到期优先；今天全清则转「提前复习」，不把面板留空 */
    var list = due.length ? due : active;
    var idx = Math.min(S().cardIdx || 0, list.length - 1);
    S().cardIdx = idx;
    var n = list[idx];
    var st = cards[n.id];
    /* 出题权在人（Anki/RemNote 的一致做法）：机器只给默认值（L0），
       人改过的洞存在 cards.v1 的 cloze 字段里，优先级最高。 */
    var pick = S().fcPick === true;
    var plan = pick ? { at: S().fcAt | 0, len: Math.max(1, S().fcLen | 0), why: "选段" } : clozeFor(n, st);
    if (plan) {
      var tlen = String(n.text || "").length;
      if (plan.at + plan.len > tlen) { plan = { at: 0, len: Math.min(4, tlen), why: plan.why }; }
    }
    var noCand = !plan;
    var cloze = makeCloze(n.text, n.id, st);

    /* 正面：选段态逐字可点（预览用 .fc-pc.on 标出当前洞），普通态用挖空 HTML */
    var frontHTML;
    if (pick) {
      var chars = [], txt = String(n.text || "");
      for (var ci = 0; ci < txt.length; ci++) {
        chars.push('<b class="fc-pc' + (ci >= plan.at && ci < plan.at + plan.len ? " on" : "") +
          '" data-pat="' + ci + '">' + esc(txt.charAt(ci)) + '</b>');
      }
      frontHTML = '<p class="fc-pickline' + (ci > 60 ? " dense" : "") + '">' + chars.join("") + '</p>';
    } else {
      frontHTML = '<p' + (noCand ? ' class="fc-nocand"' : "") + '>' + (noCand ? esc(String(n.text || "")) : cloze.front) + '</p>';
    }

    box.innerHTML = head +
      '<div class="fc-due">' +
        (due.length
          ? icon("calendar-days", 12) + ' 到期 <b>' + due.length + '</b> 张 · 共 ' + all.filter(function (x) { return !isExcluded(x.id); }).length + ' 张'
          : icon("circle-check", 12) + ' 今天已复习完 · 可提前复习 ' + active.length + ' 张') +
        (st && st.last ? '<span class="spacer"></span>上次 ' + esc(st.last) + ' · 间隔 ' + esc(st.ivl) + ' 天' : "") +
      '</div>' +
      '<div class="fc-meta"><span>' + esc(anchorLabel(n.anchor)) + ' · P' + esc(n.page || 1) + '</span>' +
        (noCand ? '<span class="fc-why">挑不出考点</span>' : '<span class="fc-why">' + esc(plan.why) + '</span>') +
        '<span class="spacer"></span><b>' + (idx + 1) + " / " + list.length + '</b></div>' +
      '<div class="fc-card" id="fcCard" data-flip="' + (pick ? "off" : "off") + '" data-pick="' + (pick ? "on" : "off") + '"' +
        ' role="button" tabindex="0" aria-label="' + (pick ? "点字选择要背的那一段" : "点击卡片看答案") + '">' +
        '<div class="fc-side fc-front">' +
          '<span class="fc-tag">' + (pick ? "选段" : "挖空") + '</span>' +
          frontHTML +
          '<span class="fc-tip">' + (pick ? "点一个字定起点 · ← → 移动 · Shift+← → 改长度 · Enter 确定 · Esc 取消"
            : (noCand ? "这句挑不出考点，可以自己选一段，或排掉它" : "点击卡片看答案")) + '</span>' +
        '</div>' +
        '<div class="fc-side fc-back">' +
          '<span class="fc-tag">原文</span>' +
          '<p>' + esc(n.text) + '</p>' +
          '<span class="fc-tip">' + (n.body && n.body !== n.text ? esc(String(n.body).slice(0, 120)) : "出自 " + esc(anchorLabel(n.anchor))) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="fc-edit">' +
        (pick
          ? '<button class="btn btn-accent btn-sm" id="fcPickOk">' + icon("check", 13) + '确定这个空</button>' +
            '<button class="btn btn-ghost btn-sm" id="fcPickNo">取消</button>' +
            (st && st.cloze ? '<button class="btn btn-ghost btn-sm" id="fcPickAuto">恢复自动</button>' : "")
          : '<button class="btn btn-ghost btn-sm" id="fcPick">' + icon("text-cursor", 13) + '改挖这里</button>' +
            '<button class="btn btn-ghost btn-sm" id="fcShift"' + (noCand ? " disabled" : "") + '>' + icon("shuffle", 13) + '换个空</button>' +
            '<button class="btn btn-ghost btn-sm" id="fcExcl">' + icon("eye-off", 13) + '不再出卡</button>') +
      '</div>' +
      '<div class="fc-rate" id="fcRate" hidden>' +
        RATE.map(function (r) {
          return '<button class="fc-rate-btn" data-q="' + r[0] + '">' + esc(r[1]) + '<em>' + esc(r[2]) + '</em></button>';
        }).join("") +
      '</div>' +
      '<div class="mpd-foot">' +
        '<button class="btn btn-ghost btn-sm" id="fcPrev">' + icon("chevron-left", 13) + '上一张</button>' +
        '<button class="btn btn-ghost btn-sm" id="fcAgain">' + icon("rotate-ccw", 13) + '随机</button>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn-ghost btn-sm" id="fcSkip">跳过' + icon("chevron-right", 13) + '</button>' +
      '</div>' +
      '<p class="mpd-note">' + (pick
        ? "自己选的那一段会记住（存在复习进度里），下次打开还是这一处；「恢复自动」交回机器判断。"
        : "翻面后按「忘记 / 模糊 / 记得 / 熟练」评分。挖得不满意就点「改挖这里」—— 出题权在你。") + '</p>';

    bindViewSeg(box);
    var card = qs("#fcCard");
    var rate = qs("#fcRate");
    function flip() {
      if (pick) return;                 /* 选段态点字是选位，不是翻面 */
      var toOn = card.dataset.flip !== "on";
      card.dataset.flip = toOn ? "on" : "off";
      rate.hidden = !toOn;   /* 只有翻到答案面，评分才有意义 */
    }
    card.addEventListener("click", flip);
    card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });

    /* ---------- L1 选段态：点字定起点，方向键微调，Enter 落库 ---------- */
    function setPick(on) {
      S().fcPick = !!on;
      if (on) { var g0 = plan || clozeFor(n, st) || { at: 0, len: 4 }; S().fcAt = g0.at; S().fcLen = g0.len; }
      renderPanel();
    }
    function commitPick() {
      var cur = cards[n.id] || {};
      /* 方向键能把起点推到句尾：落库前按整句长度夹一次，
         否则写进一个越界的 cloze，下次渲染会被兜底逻辑挪回句首——空悄悄换了位置。 */
      var L = String(n.text || "").length;
      var a = Math.max(0, Math.min(S().fcAt | 0, Math.max(0, L - 1)));
      var ln = Math.max(1, Math.min(S().fcLen | 0, L - a));
      cur.cloze = { at: a, len: ln };
      cards[n.id] = cur;
      API.saveCard(n.id, cur);
      S().fcPick = false;
      renderPanel();
      ctx.toast("已记住你选的那一段", "check");
    }
    if (S().fcKey) { document.removeEventListener("keydown", S().fcKey); S().fcKey = null; }
    if (pick) {
      qsa("[data-pat]", box).forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          var g = snapHole(n.text, +b.dataset.pat);
          if (!g) return;
          S().fcAt = g.at; S().fcLen = g.len;
          renderPanel();
        });
      });
      var key = function (e) {
        if (window.InkKeys && InkKeys.isOpen()) return;   /* 命令面板 / 总览置顶：按键先归它们 */
        if (panelKey !== "card" || S().fcPick !== true) return;
        var L = String(n.text || "").length, hit = true;
        if (e.key === "ArrowLeft") { S().fcAt = Math.max(0, (S().fcAt | 0) - 1); }
        else if (e.key === "ArrowRight") { S().fcAt = Math.min(L - 1, (S().fcAt | 0) + 1); }
        else if (e.key === "ArrowUp") { S().fcLen = Math.min(L - (S().fcAt | 0), Math.max(1, (S().fcLen | 0) + (e.shiftKey ? 2 : 1))); }
        else if (e.key === "ArrowDown") { S().fcLen = Math.max(1, (S().fcLen | 0) - (e.shiftKey ? 2 : 1)); }
        else if (e.key === "Enter") { commitPick(); }
        else if (e.key === "Escape") { S().fcPick = false; renderPanel(); }
        else hit = false;
        if (hit) { e.preventDefault(); e.stopPropagation(); renderPanel(); }
      };
      document.addEventListener("keydown", key, true);
      S().fcKey = key;
      /* 层栈让路（§W2.4）：「改挖这里」的选空态是抽屉窗**里面**的一层，
         Esc 该先取消选空、窗留着 —— 不登记时实测一次 Esc 把窗整个收掉。
         按 key 登记，每次 render 换一次谓词闭包，不堆旧闭包。 */
      if (window.InkWin) InkWin.yieldTo("fc-pick", function () {
        return panelKey === "card" && S().fcPick === true;
      });
      var okBtn = qs("#fcPickOk"), noBtn = qs("#fcPickNo"), auBtn = qs("#fcPickAuto");
      if (okBtn) okBtn.addEventListener("click", commitPick);
      if (noBtn) noBtn.addEventListener("click", function () { S().fcPick = false; renderPanel(); });
      if (auBtn) auBtn.addEventListener("click", function () {
        var cur = cards[n.id] || {}; delete cur.cloze; cards[n.id] = cur;
        API.saveCard(n.id, cur); S().fcPick = false; renderPanel();
        ctx.toast("已交回机器判断", "rotate-ccw");
      });
    }

    var btnPick = qs("#fcPick"), btnShift = qs("#fcShift"), btnExcl = qs("#fcExcl");
    if (btnPick) btnPick.addEventListener("click", function () { setPick(true); });
    if (btnShift) btnShift.addEventListener("click", function () {
      var nx = nextCloze(n.text, plan);
      if (!nx) { ctx.toast("这一句只有这一处可挖", "info"); return; }
      var cur = cards[n.id] || {}; cur.cloze = { at: nx.at, len: nx.len, why: nx.why }; cards[n.id] = cur;
      API.saveCard(n.id, cur); renderPanel();
    });
    /* L2 排除：这条高亮本来就不该成卡（不等于删掉笔记） */
    if (btnExcl) btnExcl.addEventListener("click", async function () {
      var cur = cards[n.id] || {};
      cur.excluded = true;
      cards[n.id] = cur;
      await API.saveCard(n.id, cur);
      S().cardIdx = 0; S().fcPick = false;
      renderPanel(); renderStrip();
      ctx.toast("已排掉这张卡 · 到「卡组」可撤回", "eye-off");
    });

    qsa("[data-q]", box).forEach(function (b) {
      b.addEventListener("click", async function () {
        var next = sm2Update(+b.dataset.q, st);
        cards[n.id] = next;
        await API.saveCard(n.id, next);
        S().cardIdx = 0;   /* 评完自动切到下一张到期卡 */
        renderPanel(); renderStrip();
        ctx.toast("已排期：" + next.due + "（间隔 " + next.ivl + " 天）", "calendar-days");
      });
    });
    qs("#fcSkip").addEventListener("click", function () { S().cardIdx = (idx + 1) % list.length; renderPanel(); });
    qs("#fcPrev").addEventListener("click", function () { S().cardIdx = (idx - 1 + list.length) % list.length; renderPanel(); });
    qs("#fcAgain").addEventListener("click", function () { S().cardIdx = Math.floor(Math.random() * list.length); renderPanel(); });
  }

  /* 视图切换（复习 ⇄ 卡组）：S().fcView 挂在模式面板会话状态上 */
  function bindViewSeg(box) {
    qsa("[data-fcview]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        S().fcView = b.dataset.fcview;
        S().cardIdx = 0;
        renderPanel();
      });
    });
  }
  /* 卡组视图：全部卡片（含挂起、已排除）一览 —— 状态 / 间隔 / 连对，逐张挂起或撤回排除 */
  function renderDeck(box, head, all) {
    var rows = all.map(function (n) {
      var st = cards[n.id] || {};
      var susp = isSuspended(n.id);
      var excl = isExcluded(n.id);
      var due = !excl && !susp && isDue(n.id);
      /* 状态徽标只说一件事：排期没日期就是「新卡」，不写「排期 」空尾巴。 */
      var status = excl ? "已排除"
        : susp ? "已挂起"
        : (due ? "待复习" : (st.due ? "排期 " + esc(st.due) : "新卡"));
      var noteTxt = esc(anchorLabel(n.anchor)) + ' · P' + esc(n.page || 1) +
        (st.reps ? " · 连对 " + st.reps : "") + (st.ivl ? " · 间隔 " + st.ivl + " 天" : "");
      return '<div class="fc-row' + (susp || excl ? " off" : "") + '">' +
        '<div class="fc-row-main">' +
          '<p title="' + esc(String(n.text)) + '">' + esc(String(n.text).slice(0, 64)) + (String(n.text).length > 64 ? "…" : "") + '</p>' +
          '<span class="fc-row-status' + (due ? " due" : "") + '">' + status + '</span>' +
        '</div>' +
        '<div class="fc-row-foot">' +
          '<span class="card-note" title="' + noteTxt + '">' + noteTxt + '</span>' +
          '<span class="fc-row-acts">' +
            '<button class="tool-btn" data-susp="' + esc(n.id) + '">' + (susp ? "恢复" : "挂起") + '</button>' +
            '<button class="tool-btn" data-excl="' + esc(n.id) + '">' + (excl ? "撤回排除" : "排除") + '</button>' +
          '</span>' +
        '</div>' +
        '</div>';
    }).join("");
    var excludedN = all.filter(function (n) { return isExcluded(n.id); }).length;
    box.innerHTML = head +
      '<div class="fc-deck">' + rows + '</div>' +
      '<p class="mpd-note">挂起＝这轮先放着，仍算一张卡；排除＝这条高亮不该成卡，不进复习队列但随时可撤回。' +
        (excludedN ? "当前已排除 <b>" + excludedN + "</b> 张。" : "") +
        (poolDup ? '<br>另有 <b>' + poolDup + '</b> 条与已有卡片文字相同，已自动并入不重复出卡。' : "") + '</p>';
    bindViewSeg(box);
    qsa("[data-susp]", box).forEach(function (b) {
      b.addEventListener("click", async function () {
        var id = b.dataset.susp;
        var cur = cards[id] || {};
        if (cur.suspended) { delete cur.suspended; } else { cur.suspended = true; }
        cards[id] = cur;
        await API.saveCard(id, cur);
        renderStrip();
        renderPanel();
        ctx.toast(cur.suspended ? "已挂起，复习队列跳过这张卡" : "已恢复进入复习队列", "layers");
      });
    });
    qsa("[data-excl]", box).forEach(function (b) {
      b.addEventListener("click", async function () {
        var id = b.dataset.excl;
        var cur = cards[id] || {};
        if (cur.excluded) { delete cur.excluded; } else { cur.excluded = true; }
        cards[id] = cur;
        await API.saveCard(id, cur);
        S().cardIdx = 0;
        renderStrip();
        renderPanel();
        ctx.toast(cur.excluded ? "已排掉这张卡" : "已撤回排除，重新进队列", "eye-off");
      });
    });
  }

  /* makeCloze 见文件顶部别名（srs.js 单一事实源） */

  /* ------------------------------------------------------------
     6. 漫画：分格引导阅读（一次一格）
     ------------------------------------------------------------ */
  var guideIdx = 0;
  function panels() { return (ctx.blocks || []).filter(function (b) { return b.type === "fig"; }); }
  function guideOn() { return R().guide && resolve() === "comic" && panels().length > 0; }

  function renderGuide() {
    var host = qs("#guideStage");
    if (!host) return;
    if (!guideOn()) { host.hidden = true; host.innerHTML = ""; return; }
    var list = panels();
    guideIdx = Math.max(0, Math.min(guideIdx, list.length - 1));
    var p = list[guideIdx];
    host.hidden = false;
    host.innerHTML =
      '<div class="gd-box">' +
        '<div class="gd-panel">' + gdFig(p) + '</div>' +
        '<div class="gd-cap"><b>' + (guideIdx + 1) + " / " + list.length + '</b><span>' + esc(p.cap || "") + '</span></div>' +
      '</div>' +
      '<div class="gd-bar">' +
        '<button class="tool-btn" id="gdPrev" title="上一格">' + icon("chevron-left", 16) + '</button>' +
        '<button class="tool-btn wide" id="gdExit">' + icon("scan-text", 14) + '退出分格</button>' +
        '<button class="tool-btn" id="gdNext" title="下一格">' + icon("chevron-right", 16) + '</button>' +
      '</div>';
    qs("#gdPrev").addEventListener("click", function () { guideIdx = (guideIdx - 1 + list.length) % list.length; renderGuide(); });
    qs("#gdNext").addEventListener("click", function () { guideIdx = (guideIdx + 1) % list.length; renderGuide(); });
    qs("#gdExit").addEventListener("click", function () { ctx.patch({ guide: false }, "已退出分格引导", "scan-text"); });
  }
  /* 复用正文同一套图版画法，避免两处各画一份 */
  function gdFig(b) {
    var art = ctx.figFor ? ctx.figFor(b) : ctx.figSVG;
    return '<div class="doc-fig gd-fig"><div class="fig-box">' + art + '</div>' +
      (b.note ? '<div class="fig-note">' + esc(b.note) + '</div>' : "") + '</div>';
  }
  function enterGuide() { guideIdx = 0; renderGuide(); }
  function exitGuide() { var h = qs("#guideStage"); if (h) { h.hidden = true; h.innerHTML = ""; } }

  /* ------------------------------------------------------------
     7. 翻译（共享服务）：划词翻译浮层 + 段落对照
     调研结论（Google 翻译 / DeepL / 微信读书）：划词浮层必须能当场改语向 ——
     ① 顶部一条「源 ⇄ 目标」语言栏，改任一端立即重译，不必重划；
     ② 源端默认「自动检测」（读者不该被迫先判断原文是什么语）；
     ③ 目标端默认「AI 智能」—— 由主脑按原文判断该译成什么语言，
        中文书里的英文引文默认译回中文，省掉一次「该选什么语」的犹豫；
     ④ 互换：源端为「自动检测」时，用上一轮实际译出的语种顶上，不空转；
     ⑤ 语向记在 read.trFrom / read.trTo，下次划词不必重挑。
     ------------------------------------------------------------ */
  var trSeq = 0;
  var LANGS = null;               /* 语言表只取一次 */
  var trLast = null;              /* 上一轮结果：互换时回填「实际译出的语种」 */
  var trCur = null;               /* 当前浮层对应的原文，改语向时就地重译 */

  function langList() {
    if (LANGS) return Promise.resolve(LANGS);
    return API.fetchLangs().then(function (r) { LANGS = r.data; return LANGS; });
  }
  function inList(list, k) {
    for (var i = 0; i < list.length; i++) if (list[i].k === k) return true;
    return false;
  }
  /* 语向取自 read；表里没有的（语言表变过 / 脏数据）一律回落到默认端 */
  function trPair() {
    var L = LANGS || { src: [], dst: [], defSrc: "auto", defDst: "ai" };
    var r = R();
    return {
      from: inList(L.src, r.trFrom) ? r.trFrom : (L.defSrc || "auto"),
      to: inList(L.dst, r.trTo) ? r.trTo : (L.defDst || "ai")
    };
  }
  function trLangBar(p) {
    var L = LANGS;
    function opts(list, cur) {
      return list.map(function (l) {
        return '<option value="' + esc(l.k) + '"' + (l.k === cur ? " selected" : "") + ">" + esc(l.n) + "</option>";
      }).join("");
    }
    return '<div class="tr-langs">' +
      '<select class="tr-lang" id="trFrom" aria-label="原文语言">' + opts(L.src, p.from) + "</select>" +
      '<button class="tr-swap" id="trSwap" title="互换语言" aria-label="互换语言">' + icon("arrow-left-right", 13) + "</button>" +
      '<select class="tr-lang" id="trTo" aria-label="译文语言">' + opts(L.dst, p.to) + "</select>" +
      '<button class="tr-x" id="trClose" aria-label="收起">' + icon("x", 14) + "</button>" +
    "</div>";
  }

  /* 译完就地换内容：语言栏保持原样，只有译文区在动 —— 改语向不该让浮层跳位置 */
  function trPaintBody(pop, d, p) {
    var body = qs("#trBody", pop);
    if (!body) return;
    body.innerHTML =
      '<div class="tr-src">' + esc(d.src.slice(0, 60)) + "</div>" +
      '<div class="tr-dst">' + esc(d.dst) + "</div>" +
      (d.terms.length ? '<div class="tr-terms">' + d.terms.map(function (t) {
        return '<span class="tr-term"><b>' + esc(t.w) + "</b><i>" + esc(t.pos) + "</i>" + esc(t.mean) + "</span>";
      }).join("") + "</div>" : "") +
      '<div class="tr-foot"><span class="card-note">' + esc(d.toName || "") + (d.engine ? " · " + esc(d.engine) : "") + (d.cached ? " · 取自缓存" : "") + "</span>" +
        '<button class="mpd-mini" id="trSave">' + icon("notebook-pen", 12) + "存为生词</button></div>" +
      (d.note ? '<p class="tr-note">' + icon("info", 12) + esc(d.note) + "</p>" : "");
    var save = qs("#trSave", pop);
    if (save) save.addEventListener("click", async function () {
      await ctx.addNote({ docId: ctx.doc.id, kind: "note", ntype: "md", color: "blue", title: d.src.slice(0, 24),
        text: d.src, body: "**" + d.src + "**\n\n" + d.dst + (d.terms.length ? "\n\n" + d.terms.map(function (t) { return "- " + t.w + "（" + t.pos + "）" + t.mean; }).join("\n") : ""),
        anchor: ctx.currentAnchor(), page: ctx.state.cur + 1 });
      ctx.toast("已存为生词笔记", "notebook-pen");
      pop.hidden = true;
    });
  }

  /* 重译：seq 防串（连点语言栏时，只有最后一次的结果能落到浮层上）；
     流式 —— 首字一到就先落进浮层，读者不必干等整段译文。
     先摆好「原文 + 译文」骨架，增量往 #trDst 里追加，末了再由 trPaintBody 补齐术语与脚注。 */
  async function trRun(pop, text, p) {
    var seq = ++trSeq;
    var body = qs("#trBody", pop);
    if (body) body.innerHTML = '<div class="tr-load">' + icon("loader-circle", 14) + "翻译中…</div>";
    var r = await API.translate(text, { mode: "word", from: p.from, to: p.to }, function (piece) {
      if (seq !== trSeq || !body) return;
      var dst = qs("#trDst", body);
      if (!dst) {
        body.innerHTML = '<div class="tr-src">' + esc(String(text).slice(0, 60)) + '</div><div class="tr-dst" id="trDst"></div>';
        dst = qs("#trDst", body);
      }
      dst.textContent += piece;
    });
    if (seq !== trSeq) return;
    trLast = r.data;
    trPaintBody(pop, r.data, p);
  }

  /* v2.23 W2 · 翻译浮层入 InkWin：可拖、可停靠（正文让位）、可铺满，位置尺寸记忆。
     原先每次划词都按鼠标重摆、尺寸写死 320 —— 连着查五六个词时，浮层一直在
     「跳到鼠标下面 → 挡住下一段要读的字」之间循环，也没法把它常驻在手边。
     把手用 InkWin 自造的细栏：语言栏那一行是控件不是标题，四枚形态钮挤不进去。 */
  var trWin = null;
  function ensureTrWin(pop) {
    if (trWin || !window.InkWin) return trWin;
    trWin = InkWin.create(pop, {
      id: "tr", host: "viewport", claim: "#reader", autoH: true,
      handle: ".inkw-bar", x: "#trClose", title: "翻译",
      f: { w: 320, h: 260 }, min: { w: 272, h: 160 },
      dock: { min: 272, max: 520, width: 320 }, snap: 20,
      dockTop: window.InkTopBand,        /* 同上：停靠态让出顶栏那一条 */
      shown: function () { return !pop.hidden; },
      onClose: function () { pop.hidden = true; }
    });
    return trWin;
  }

  /* 划词：在选中工具条点「译」后调用 */
  async function translateSelection(text, x, y) {
    var pop = qs("#trPop");
    if (!pop) return;
    var seq = ++trSeq;
    trCur = text;
    pop.dataset.kind = "word";
    pop.hidden = false;
    ensureTrWin(pop);
    pop.innerHTML = '<div class="tr-load">' + icon("loader-circle", 14) + "翻译中…</div>";
    place(pop, x, y);

    var L = await langList();
    if (seq !== trSeq) return;
    var p = trPair();
    pop.innerHTML = trLangBar(p) + '<div class="tr-body" id="trBody"></div>';
    place(pop, x, y);

    qs("#trClose", pop).addEventListener("click", function () { pop.hidden = true; });
    qs("#trFrom", pop).addEventListener("change", function () {
      var q = { from: this.value, to: qs("#trTo", pop).value };
      ctx.patch({ trFrom: q.from, trTo: q.to });
      trRun(pop, trCur, q);
    });
    qs("#trTo", pop).addEventListener("change", function () {
      var q = { from: qs("#trFrom", pop).value, to: this.value };
      ctx.patch({ trFrom: q.from, trTo: q.to });
      trRun(pop, trCur, q);
    });
    qs("#trSwap", pop).addEventListener("click", function () {
      var cur = { from: qs("#trFrom", pop).value, to: qs("#trTo", pop).value };
      /* 目标端是「AI 智能」时，拿上一轮实际译出的语种当新源端 —— 否则互换无从落地 */
      var realTo = (cur.to === "ai" && trLast && trLast.to) ? trLast.to : cur.to;
      var next = { from: realTo, to: cur.from === "auto" ? "zh" : cur.from };
      if (next.from === next.to || !inList(L.src, next.from) || !inList(L.dst, next.to)) return;
      qs("#trFrom", pop).value = next.from;
      qs("#trTo", pop).value = next.to;
      ctx.patch({ trFrom: next.from, trTo: next.to });
      trRun(pop, trCur, next);
    });

    await trRun(pop, text, p);
  }

  /* 段落对照：给每个正文段落挂一条译文（并发限流，避免一次性打满） */
  var paraBusy = false;
  async function syncPara() {
    var on = R().trans === "para";
    var docEl = qs("#doc");
    if (!docEl) return;
    qsa(".tr-para", docEl).forEach(function (el) { el.remove(); });
    docEl.classList.toggle("tr-on", on);
    if (!on || paraBusy) return;
    paraBusy = true;
    try {
      /* 只翻译当前屏内的文本块：一次翻全文既慢又浪费。
         除 <p> 外也覆盖引文与论文摘要 —— 文献首页常整屏是题名 / 摘要，
         只认 <p> 会一段都译不出，用户会以为功能坏了。 */
      var ps = qsa(".doc > p, .doc > blockquote, .doc > .doc-abstract", docEl)
        .filter(function (p) { return p.textContent.trim().length > 18; });
      var view = ps.slice(0, 6);
      if (!view.length) { ctx.toast("这一屏没有可对照的段落，翻页后会接着译", "info"); return; }
      await langList();
      var tp = trPair();
      for (var i = 0; i < view.length; i++) {
        var p = view[i];
        var r = await API.translate(p.textContent.trim(), { mode: "para", from: tp.from, to: tp.to });
        if (!R() || R().trans !== "para") break;
        var el = document.createElement("div");
        el.className = "tr-para";
        el.innerHTML = '<span class="tr-para-tx">' + esc(r.data.dst) + '</span>';
        p.insertAdjacentElement("afterend", el);
      }
    } finally { paraBusy = false; }
  }

  function place(pop, x, y) {
    var w = 320;
    if (!trWin) {                              /* dock.js 没在：按老写法贴鼠标 */
      pop.style.left = Math.max(10, Math.min(window.innerWidth - w - 10, (x || window.innerWidth / 2) - w / 2)) + "px";
      pop.style.top = Math.max(10, (y || 120)) + "px";
      return;
    }
    trWin.open();
    /* 本机第一次用它：贴着点词的位置放一次；之后位置归读者拖出来的那个。
       「改语向不该让浮层跳位置」这条老规矩在这里同样成立 —— 重译只动 #trBody，不走这里。 */
    if (!InkWin.read()["tr"]) {
      var left = Math.max(10, Math.min(window.innerWidth - w - 10, (x || window.innerWidth / 2) - w / 2));
      trWin.place(left, Math.max(10, y || 120), w);
    }
  }

  /* 悬停译：指针停在段落上就地浮出译文，移开即撤 —— 「按需一瞥」而非常驻对照。
     译文按原文缓存，同一段再悬停不再打接口；一次只译一段，滑过整页也不会打满请求。 */
  var trCache = {};
  var hoverBound = false;
  var hoverSeq = 0;
  var HOVER_SEL = ".doc > p, .doc > blockquote, .doc > .doc-abstract";

  function hoverBlock(e) {
    var t = e.target;
    return (t && t.closest) ? t.closest(HOVER_SEL) : null;
  }
  function hasHover(el) {
    var d = el.nextElementSibling;
    return !!(d && d.classList && d.classList.contains("tr-hover-para"));
  }
  function putHover(el, dst) {
    if (!dst) return;
    var d = document.createElement("div");
    d.className = "tr-hover-para";
    d.textContent = dst;
    el.insertAdjacentElement("afterend", d);
  }
  function syncHover() {
    var docEl = qs("#doc");
    if (!docEl) return;
    var on = R().trans === "hover";
    if (on === hoverBound) return;
    hoverBound = on;
    if (on) {
      docEl.addEventListener("pointerover", onHoverIn);
      docEl.addEventListener("pointerout", onHoverOut);
    } else {
      docEl.removeEventListener("pointerover", onHoverIn);
      docEl.removeEventListener("pointerout", onHoverOut);
      qsa(".tr-hover-para", docEl).forEach(function (el) { el.remove(); });
    }
  }
  function onHoverIn(e) {
    if (!R() || R().trans !== "hover") return;
    var el = hoverBlock(e);
    if (!el || hasHover(el)) return;
    var key = el.textContent.trim();
    if (key.length < 4) return;
    if (el.dataset.trBusy) return;
    el.dataset.trBusy = "1";
    var seq = ++hoverSeq;
    langList().then(function () {
      var p = trPair();
      var ck = p.from + ">" + p.to + "|" + key;
      if (trCache[ck]) { delete el.dataset.trBusy; putHover(el, trCache[ck]); return; }
      return API.translate(key, { mode: "hover", from: p.from, to: p.to }).then(function (r) {
        delete el.dataset.trBusy;
        if (seq !== hoverSeq || !R() || R().trans !== "hover") return;
        trCache[ck] = r.data.dst;
        if (el.isConnected && !hasHover(el)) putHover(el, r.data.dst);
      });
    }).catch(function () { delete el.dataset.trBusy; });
  }
  function onHoverOut(e) {
    var t = e.target;
    /* 指针从译文上移开：撤掉译文本身 */
    if (t && t.classList && t.classList.contains("tr-hover-para")) {
      var nx0 = e.relatedTarget;
      if (!nx0 || !t.contains(nx0)) t.remove();
      return;
    }
    var el = hoverBlock(e);
    if (!el) return;
    var nx = e.relatedTarget;
    /* 仍在段内、或正移向它的译文，都不撤 */
    if (nx && (el.contains(nx) || (nx.classList && nx.classList.contains("tr-hover-para")))) return;
    var d = el.nextElementSibling;
    if (d && d.classList && d.classList.contains("tr-hover-para")) d.remove();
  }

  /* 三种译法共用一处入口：关闭 / 段落对照（当前屏并列）/ 悬停译（按需一瞥）。
     划词翻译不走开关，随时可用 —— 那是公共能力，不属于任何一种模式。 */
  var TRANS = [["off", "关闭"], ["para", "段落对照"], ["hover", "悬停译"]];
  function transLabel() {
    var v = R().trans || "off";
    for (var i = 0; i < TRANS.length; i++) if (TRANS[i][0] === v) return TRANS[i][1];
    return "关闭";
  }
  function setTrans(v) {
    if (["off", "para", "hover"].indexOf(v) < 0) v = "off";
    if (R().trans === v) return;
    var msg = v === "off" ? "已关闭翻译"
      : v === "para" ? "段落对照：当前屏原文与译文并列"
      : "悬停译：指针停在段落上出译文";
    ctx.patch({ trans: v }, msg, "languages");
  }

  /* ------------------------------------------------------------
     8. 对外接口
     ------------------------------------------------------------ */
  window.InkModes = {
    META: META, LIST: LIST, TOOLS: TOOLS,
    savePadDraft: savePadDraft,   /* v2.10：草稿纸浮窗收起前落库 */
    padStats: function () { return padApi ? { n: padApi.count(), strokes: padApi.strokes() } : null; },   /* 实时笔迹（不等防抖落库） */
    init: function (c) {
      ctx = c;
      renderStrip();
      applyDoc();
      loadCards();   /* 闪卡到期数要尽早拿到，模式条上的徽标才有意义 */
      if (ctx.doc && ctx.blocks) {
        detecting = true;
        API.suggestMode(ctx.doc, ctx.blocks).then(function (r) {
          detecting = false;
          detected = r.data;
          renderStrip();
          applyDoc();
        }).catch(function () { detecting = false; });
      }
    },
    resolve: resolve,
    isAuto: isAuto,
    detected: function () { return detected; },
    /* 阅读设置或笔记变化后重画：模式条 + 面板 + 分格引导 */
    sync: function () {
      renderStrip();
      if (panelKey) renderPanel();
      if (guideOn()) renderGuide(); else exitGuide();
      syncPara();
      syncHover();
      applyDoc();
    },
    renderStrip: renderStrip,
    openPanel: openPanel,
    closePanel: closePanel,
    openPicker: openPicker,
    closePop: closePicker,
    panelKey: function () { return panelKey; },
    guideOn: guideOn,
    setTrans: setTrans,
    transLabel: transLabel,
    dueCount: dueCount,
    togglePara: function () { setTrans(R().trans === "para" ? "off" : "para"); },
    translateSelection: translateSelection,
    syncPara: syncPara
  };
})();
