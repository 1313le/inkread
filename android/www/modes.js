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
  function openPanel(k) {
    panelKey = k;
    var host = qs("#modePanel");
    if (!host) return;
    if (k === "card") { S().fcDone = 0; S().cardIdx = 0; if (!cardsReady) loadCards(); }   /* 每次打开闪卡都从「第一张到期卡」起算 */
    host.dataset.open = "on";
    host.setAttribute("aria-hidden", "false");
    renderPanel();
    var b = qsa("[data-tool]").find(function (x) { return x.dataset.tool === k; });
    if (b) { b.classList.add("on"); b.setAttribute("aria-pressed", "true"); }
    var chip = qs("#modePanelClose");
    if (chip) chip.focus();
  }
  function closePanel() {
    panelKey = null;
    var host = qs("#modePanel");
    if (host) { host.dataset.open = "off"; host.dataset.wide = "off"; host.setAttribute("aria-hidden", "true"); }
    if (S().padRO) { S().padRO.disconnect(); S().padRO = null; }
    qsa("[data-tool]").forEach(function (x) {
      var t = (TOOLS[resolve()] || []).find(function (y) { return y.k === x.dataset.tool; });
      if (t && t.kind === "panel") { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); }
    });
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
      sub: "随手画、随手写；存下来就是一条笔记",
      render: renderPad
    },
    card: {
      title: "闪卡", icon: "layers",
      sub: "把高亮挖空成问答卡，读到这里就复习",
      render: renderCard
    }
  };

  function renderPanel() {
    var host = qs("#modePanel");
    if (!host || !panelKey) return;
    var p = PANEL[panelKey];
    if (!p) return;
    host.innerHTML =
      '<div class="mpd-grip" aria-hidden="true"></div>' +
      '<header class="mpd-head">' +
        '<span class="mpd-title">' + icon(p.icon, 15) + esc(p.title) + '</span>' +
        '<span class="spacer"></span>' +
        (panelKey === "pad"
          ? '<button class="mpd-ic" id="mpdWide" aria-pressed="' + (host.dataset.wide === "on" ? "true" : "false") +
            '" aria-label="全屏使用草稿纸">' + icon(host.dataset.wide === "on" ? "minimize" : "maximize-2", 15) + '</button>'
          : "") +
        '<button class="mpd-x" id="modePanelClose" aria-label="收起">' + icon("x", 16) + '</button>' +
      '</header>' +
      '<p class="mpd-sub">' + esc(p.sub) + '</p>' +
      '<div class="mpd-body" id="mpdBody"></div>';
    qs("#modePanelClose").addEventListener("click", closePanel);
    var wb = qs("#mpdWide");
    if (wb) wb.addEventListener("click", function () {
      var on = host.dataset.wide !== "on";
      host.dataset.wide = on ? "on" : "off";
      wb.setAttribute("aria-pressed", on ? "true" : "false");
      wb.innerHTML = icon(on ? "minimize" : "maximize-2", 15);
    });
    bindGrip(host);
    p.render(qs("#mpdBody"));
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

  /* ---------- 5.4 草稿纸：自由笔迹，存下来即一条笔记 ---------- */
  function renderPad(box) {
    box.innerHTML =
      '<div class="pad-wrap">' +
        '<canvas class="pad-canvas" id="padCv"></canvas>' +
        '<div class="pad-tools">' +
          '<div class="seg seg-xs" id="padPen">' +
            '<button class="seg-btn on" data-pen="2">细</button>' +
            '<button class="seg-btn" data-pen="4">中</button>' +
            '<button class="seg-btn" data-pen="7">粗</button>' +
          '</div>' +
          '<span class="spacer"></span>' +
          '<button class="mpd-mini" id="padUndo">' + icon("undo-2", 12) + '撤销</button>' +
          '<button class="mpd-mini danger" id="padClear">' + icon("trash-2", 12) + '清空</button>' +
        '</div>' +
      '</div>' +
      '<input class="field" id="padCap" placeholder="给这张草稿起个名字（可留空）">' +
      '<div class="mpd-foot">' +
        '<button class="btn btn-accent btn-sm" id="padSave">' + icon("circle-check", 13) + '存为笔记</button>' +
        '<span class="card-note">草稿只落在本机，不上传</span>' +
      '</div>';

    var cv = qs("#padCv");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = 0, H = 0, g = null;
    var strokes = [], cur = null;

    /* 画布尺寸只由 CSS 决定（含「全屏」档），这里只同步位图后备尺寸。
       若像以前那样写行内 height，会盖掉 .mode-drawer[data-wide="on"] 的加高规则。 */
    function setup() {
      W = cv.clientWidth || 300;
      H = cv.clientHeight || 230;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.lineCap = "round"; g.lineJoin = "round";
      g.strokeStyle = cssVar("--ink");
      g.lineWidth = 2;
      redraw();
    }
    function redraw() {
      if (!g) return;
      g.clearRect(0, 0, W, H);
      strokes.forEach(function (s) {
        g.lineWidth = s.w;
        g.beginPath();
        s.pts.forEach(function (p, i) { i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
        g.stroke();
      });
    }
    function pos(e) {
      var r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    cv.addEventListener("pointerdown", function (e) {
      cv.setPointerCapture(e.pointerId);
      cur = { w: S().penW || 2, pts: [pos(e)] };
      strokes.push(cur);
    });
    cv.addEventListener("pointermove", function (e) {
      if (!cur) return;
      cur.pts.push(pos(e));
      g.lineWidth = cur.w;
      g.beginPath();
      var n = cur.pts.length;
      g.moveTo(cur.pts[n - 2][0], cur.pts[n - 2][1]);
      g.lineTo(cur.pts[n - 1][0], cur.pts[n - 1][1]);
      g.stroke();
    });
    function endStroke() { cur = null; }
    cv.addEventListener("pointerup", endStroke);
    cv.addEventListener("pointercancel", endStroke);
    cv.addEventListener("pointerleave", endStroke);

    setup();
    /* 切「全屏」、窗口缩放、抽屉宽度变化都自动重排画布，笔迹按原坐标重绘 */
    if (typeof ResizeObserver === "function") {
      S().padRO = new ResizeObserver(function () { setup(); });
      S().padRO.observe(cv);
    }

    qsa("[data-pen]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        qsa("[data-pen]", box).forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        S().penW = +b.dataset.pen;
      });
    });
    qs("#padUndo").addEventListener("click", function () { strokes.pop(); redraw(); });
    qs("#padClear").addEventListener("click", function () { strokes.length = 0; redraw(); });
    qs("#padSave").addEventListener("click", async function () {
      if (!strokes.length) { ctx.toast("草稿纸还是空的", "info"); return; }
      var cap = qs("#padCap").value.trim() || "手写草稿";
      var png = cv.toDataURL("image/png");
      await ctx.addNote({
        docId: ctx.doc.id, kind: "note", ntype: "md", color: "ink",
        title: cap,
        text: cap,
        body: "> " + cap + "\n\n（手写草稿 · 共 " + strokes.length + " 笔，在阅读页「草稿纸」里可继续查看）",
        anchor: ctx.currentAnchor(), page: ctx.state.cur + 1,
        sketch: { png: png, strokes: strokes.length }
      });
      ctx.toast("草稿已存为笔记", "circle-check");
      strokes.length = 0; redraw();
      qs("#padCap").value = "";
    });
  }

  /* ---------- 5.5 闪卡：高亮挖空 → 间隔重复复习（SM-2） ---------- */
  /* 复习状态与 api.js 的 inkread.cards.v1 同源，按笔记 id 索引：
     {ef 难度系数, ivl 当前间隔(天), reps 连续答对次数, due 下次到期日, last 上次复习日} */
  var cards = {};
  var cardsReady = false;

  function ymd(d) {
    var x = d || new Date();
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  }
  function poolAll() {
    return ctx.notes().filter(function (n) {
      return (n.kind === "highlight" || n.kind === "margin") && (n.text || "").length >= 8;
    });
  }
  /* 到期判定：从未复习过，或到期日不晚于今天 */
  function isDue(id) {
    var st = cards[id];
    return !st || !st.due || st.due <= ymd();
  }
  /* 待复习张数：模式条徽标与闪卡面板共用同一口径，避免两处算出不同的数 */
  function dueCount() {
    if (!cardsReady) return 0;
    return poolAll().filter(function (n) { return !isSuspended(n.id) && isDue(n.id); }).length;
  }
  /* 挂起：Anki 式「这张卡先放一放」—— 挂起卡不进复习队列、不计到期数，
     状态随 inkread.cards.v1 一并落库（suspended 字段），卡组视图里可随时恢复 */
  function isSuspended(id) { return !!(cards[id] && cards[id].suspended); }
  function loadCards() {
    return API.fetchCards().then(function (r) {
      cards = (r && r.data) || {};
      cardsReady = true;
      renderStrip();
      if (panelKey === "card") renderPanel();
    }).catch(function () { cardsReady = true; });
  }

  /* SM-2 简化实现：quality 0–5（<3 判为遗忘，间隔归零重来）。
     答对后间隔按 1 → 6 → ivl×EF 递增，EF 随评分微调、下限 1.3 ——
     与 Anki 默认曲线同源，只保留必要参数，原型里不堆整套调度器。 */
  function sm2Update(quality, st) {
    var q = Math.max(0, Math.min(5, Math.round(quality)));
    var s = st || {};
    var ef = s.ef || 2.5, ivl = s.ivl || 0, reps = s.reps || 0;
    if (q < 3) {
      reps = 0;
      ivl = 1;
    } else {
      reps += 1;
      if (reps === 1) ivl = 1;
      else if (reps === 2) ivl = 6;
      else ivl = Math.max(1, Math.round(ivl * ef));
      ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    }
    var due = new Date();
    due.setDate(due.getDate() + ivl);
    return { ef: Math.round(ef * 100) / 100, ivl: ivl, reps: reps, due: ymd(due), last: ymd() };
  }

  /* 四档评分对应 SM-2 的 0 / 3 / 4 / 5：比让人记「0–5 该打几分」直观 */
  var RATE = [
    ["0", "忘记", "重来"],
    ["3", "模糊", "明天"],
    ["4", "记得", "按曲线"],
    ["5", "熟练", "拉长"]
  ];

  function renderCard(box) {
    if (!cardsReady) {
      box.innerHTML = '<div class="empty">' + icon("loader-circle", 24) + '<p>正在读取复习进度…</p></div>';
      loadCards();
      return;
    }
    var all = poolAll();
    if (!all.length) {
      box.innerHTML = '<div class="empty">' + icon("layers", 24) +
        '<p>还没有可做卡的内容<br>先高亮几句话，闪卡会自动生成</p></div>';
      return;
    }
    /* 复习 / 卡组 两视图：卡组列出全部卡（含挂起），可随时挂起 / 恢复（Anki 式） */
    var view = S().fcView === "deck" ? "deck" : "review";
    var head = '<div class="fc-tabs" role="tablist">' +
      '<button class="fc-tab' + (view === "review" ? " on" : "") + '" data-fcview="review">复习</button>' +
      '<button class="fc-tab' + (view === "deck" ? " on" : "") + '" data-fcview="deck">卡组</button>' +
      '</div>';
    if (view === "deck") { renderDeck(box, head, all); return; }
    var active = all.filter(function (n) { return !isSuspended(n.id); });
    if (!active.length) {
      box.innerHTML = head + '<div class="empty">' + icon("layers", 24) +
        '<p>卡片都在挂起中<br>到「卡组」里恢复需要复习的卡</p></div>';
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
    var cloze = makeCloze(n.text, n.id);

    box.innerHTML = head +
      '<div class="fc-due">' +
        (due.length
          ? icon("calendar-days", 12) + ' 到期 <b>' + due.length + '</b> 张 · 共 ' + all.length + ' 张'
          : icon("circle-check", 12) + ' 今天已复习完 · 可提前复习 ' + all.length + ' 张') +
        (st && st.last ? '<span class="spacer"></span>上次 ' + esc(st.last) + ' · 间隔 ' + esc(st.ivl) + ' 天' : "") +
      '</div>' +
      '<div class="fc-meta"><span>' + esc(anchorLabel(n.anchor)) + ' · P' + esc(n.page || 1) + '</span>' +
        '<span class="spacer"></span><b>' + (idx + 1) + " / " + list.length + '</b></div>' +
      '<div class="fc-card" id="fcCard" data-flip="off" role="button" tabindex="0" aria-label="点击卡片看答案">' +
        '<div class="fc-side fc-front">' +
          '<span class="fc-tag">挖空</span>' +
          '<p>' + cloze.front + '</p>' +
          '<span class="fc-tip">点击卡片看答案</span>' +
        '</div>' +
        '<div class="fc-side fc-back">' +
          '<span class="fc-tag">原文</span>' +
          '<p>' + esc(n.text) + '</p>' +
          '<span class="fc-tip">' + (n.body && n.body !== n.text ? esc(String(n.body).slice(0, 120)) : "出自 " + esc(anchorLabel(n.anchor))) + '</span>' +
        '</div>' +
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
      '<p class="mpd-note">翻面后按「忘记 / 模糊 / 记得 / 熟练」评分，间隔按遗忘曲线自动排期（SM-2）。</p>';

    bindViewSeg(box);
    var card = qs("#fcCard");
    var rate = qs("#fcRate");
    function flip() {
      var toOn = card.dataset.flip !== "on";
      card.dataset.flip = toOn ? "on" : "off";
      rate.hidden = !toOn;   /* 只有翻到答案面，评分才有意义 */
    }
    card.addEventListener("click", flip);
    card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });

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
  /* 卡组视图：全部卡片（含挂起）一览 —— 状态 / 间隔 / 连对，逐张挂起或恢复 */
  function renderDeck(box, head, all) {
    var rows = all.map(function (n) {
      var st = cards[n.id] || {};
      var susp = isSuspended(n.id);
      var status = susp ? "已挂起"
        : (isDue(n.id) ? '<b class="fc-due-mark">待复习</b>' : "排期 " + esc(st.due || ""));
      return '<div class="fc-row' + (susp ? " off" : "") + '">' +
        '<div class="fc-row-main">' +
          '<p>' + esc(String(n.text).slice(0, 64)) + (String(n.text).length > 64 ? "…" : "") + '</p>' +
          '<span class="card-note">' + esc(anchorLabel(n.anchor)) + ' · P' + esc(n.page || 1) +
            (st.reps ? " · 连对 " + st.reps : " · 新卡") + (st.ivl ? " · 间隔 " + st.ivl + " 天" : "") + '</span>' +
        '</div>' +
        '<span class="fc-row-status">' + status + '</span>' +
        '<button class="tool-btn" data-susp="' + esc(n.id) + '">' + (susp ? "恢复" : "挂起") + '</button>' +
        '</div>';
    }).join("");
    box.innerHTML = head +
      '<div class="fc-deck">' + rows + '</div>' +
      '<p class="mpd-note">卡由高亮自动生成；挂起的卡不进复习队列，随时可恢复。</p>';
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
  }

  /* 挖空：取句子中段的一小段（按 id 哈希定长，同一张卡每次挖同一处，不闪跳） */
  function makeCloze(text, seed) {
    var s = String(text);
    var h = 0;
    for (var i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) >>> 0;
    var len = Math.max(2, Math.min(6, Math.round(s.length * 0.18)));
    var at = Math.floor((h % 1000) / 1000 * Math.max(0, s.length - len - 2)) + 1;
    var hole = s.slice(at, at + len);
    /* 挖到空白或标点就往前挪，避免挖出「，」这种没意义的空 */
    while (/[\s，。、；：！？,.!?;:]/.test(hole) && at > 0) { at--; hole = s.slice(at, at + len); }
    return {
      front: esc(s.slice(0, at)) + '<mark class="fc-hole">' + esc(hole) + '</mark>' + esc(s.slice(at + len))
    };
  }

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

  /* 划词：在选中工具条点「译」后调用 */
  async function translateSelection(text, x, y) {
    var pop = qs("#trPop");
    if (!pop) return;
    var seq = ++trSeq;
    trCur = text;
    pop.dataset.kind = "word";
    pop.hidden = false;
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
    pop.style.left = Math.max(10, Math.min(window.innerWidth - w - 10, (x || window.innerWidth / 2) - w / 2)) + "px";
    pop.style.top = Math.max(10, (y || 120)) + "px";
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
