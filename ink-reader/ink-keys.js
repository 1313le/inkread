/* 墨读 InkRead · ink-keys.js — v2.22 S5/S6：快捷键注册表 + 命令面板 + `?` 总览
   设计口径见桌面《墨读InkRead-v2.22-三态首启与命令面板方案.md》§四.D。

   加载要求：必须是七页（print.html 除外）的**首个脚本**（fonts.js 之前）——
   ① IME 捕获守卫要抢在 modes.js / dock.js 的 window 捕获监听之前注册，
     组字期间整体截断（stopImmediatePropagation，不 preventDefault：原生输入法照常）；
   ② theme.js 的 `A` 键迁移在 theme.js 求值时即引用 window.InkKeys。

   三条主链：守卫（window/document 捕获段）→ 调度器（document 冒泡段，先到先得）
   → 注册项（on/off/run/list）。浮层局部 Escape 链不迁移（防两层同收），
   仅由守卫统一覆盖 IME；命令面板/总览打开时，调度器拦截顶层按键并屏蔽局部链。 */
(function () {
  "use strict";
  if (window.InkKeys) return;

  var MAC = /Mac|iP(hone|od|ad)/.test(String(navigator.platform || navigator.userAgent || ""));

  /* ================= IME 三重守卫 ================= */
  var composing = false, compEndAt = 0;
  window.addEventListener("compositionstart", function () { composing = true; }, true);
  window.addEventListener("compositionend", function () { composing = false; compEndAt = Date.now(); }, true);
  function ime(e) {
    if (composing) return true;                       /* 组合进行中 */
    if (Date.now() - compEndAt < 50) return true;     /* 组合刚提交的 50ms 冷却（确认键回波） */
    if (!e) return false;
    return !!(e.isComposing || e.keyCode === 229);    /* 事件自带标记 / 旧式 229 */
  }
  function guard(e) { if (ime(e)) e.stopImmediatePropagation(); }
  window.addEventListener("keydown", guard, true);
  document.addEventListener("keydown", guard, true);

  /* ================= 注册表 ================= */
  var regs = [], seq = 0;

  var NAMED = { spacebar: "space", esc: "escape", return: "enter", pgdn: "pagedown", pgup: "pageup", del: "delete" };
  function normKey(k) {
    if (k === " ") return "space";
    k = String(k || "").toLowerCase();
    return NAMED[k] || k;
  }

  var KEY_PRETTY = {
    space: "Space", pagedown: "PgDn", pageup: "PgUp",
    arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→",
    escape: "Esc", enter: "Enter", tab: "Tab", delete: "Del", backspace: "⌫"
  };
  function prettySpec(p) {
    var ps = [];
    if (p.ctrl) ps.push(MAC ? "⌃" : "Ctrl");
    if (p.meta) ps.push(MAC ? "⌘" : "Meta");
    if (p.alt) ps.push(MAC ? "⌥" : "Alt");
    if (p.shift) ps.push("Shift");
    var k = KEY_PRETTY[p.key] || (p.key.length === 1 ? p.key.toUpperCase() : p.key.charAt(0).toUpperCase() + p.key.slice(1));
    ps.push(k);
    return ps.join(MAC ? "" : "+");
  }

  function parseSpec(spec) {
    var o = { key: "", ctrl: false, meta: false, alt: false, shift: false };
    spec = String(spec).trim();
    if (spec === "+") { o.key = "+"; return o; }
    var parts = spec.split("+");
    o.key = normKey(parts.pop());
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].toLowerCase();
      if (t === "mod") { if (MAC) o.meta = true; else o.ctrl = true; }
      else if (t === "ctrl" || t === "control") o.ctrl = true;
      else if (t === "meta" || t === "cmd" || t === "command" || t === "super" || t === "⌘") o.meta = true;
      else if (t === "alt" || t === "option" || t === "⌥") o.alt = true;
      else if (t === "shift") o.shift = true;
    }
    return o;
  }

  /* 带修饰键的规格要求修饰键精确匹配；裸键忽略 Shift（B 与 b 同键，与原实现一致） */
  function matches(p, e) {
    if (normKey(e.key) !== p.key) return false;
    if (!!e.ctrlKey !== p.ctrl || !!e.metaKey !== p.meta || !!e.altKey !== p.alt) return false;
    if ((p.ctrl || p.meta || p.alt) && !!e.shiftKey !== p.shift) return false;
    return true;
  }

  /* 输入域默认放行（INPUT/TEXTAREA/contenteditable，口径同方案 §四.D）；inInput:true 例外 */
  function inField(t) {
    if (!t) return false;
    var tag = (t.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || t.isContentEditable === true;
  }

  function on(spec, fn, opts) {
    opts = opts || {};
    var reg = {
      id: opts.id || ("k" + (++seq)),
      specs: String(spec).split(",").map(parseSpec).filter(function (p) { return !!p.key; }),
      fn: fn,
      when: typeof opts.when === "function" ? opts.when : null,
      inInput: !!opts.inInput,
      prevent: opts.prevent !== false,
      title: opts.title || "",
      group: opts.group || "其他",
      /* 声明「这条动作只属于哪一页」（如全局脚本里注册的阅读页快捷键）。
         when 只负责拦触发，不负责拦列表 —— 不标注就会在别的页的总览里
         列出一条按不动的键。留空表示各页都成立。 */
      page: opts.page || "",
      hidden: !!opts.hidden
    };
    for (var i = 0; i < regs.length; i++) {
      if (regs[i].id === reg.id) { regs[i] = reg; return reg.id; }
    }
    regs.push(reg);
    return reg.id;
  }
  function off(id) {
    for (var i = 0; i < regs.length; i++) if (regs[i].id === id) { regs.splice(i, 1); return; }
  }
  function find(id) {
    for (var i = 0; i < regs.length; i++) if (regs[i].id === id) return regs[i];
    return null;
  }
  var NOEV = { preventDefault: function () {}, stopPropagation: function () {}, stopImmediatePropagation: function () {} };
  function run(id) {
    var r = find(id);
    if (!r || (r.when && !r.when())) return false;
    r.fn(NOEV);
    return true;
  }
  function list() {
    return regs.map(function (r) {
      return {
        id: r.id, title: r.title, group: r.group, hidden: r.hidden, page: r.page,
        specs: r.specs.map(prettySpec)
      };
    });
  }

  /* ================= 命令面板 / 总览 状态 ================= */
  var palEl = null, palInput = null, palList = null;
  var palOpen = false, palCmds = [], palRows = [], palSel = 0, palRestore = null;
  var helpEl = null, helpBody = null, helpShown = false, helpRestore = null;

  function isOpen() { return palOpen || helpShown; }
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function buildPalette() {
    palEl = document.createElement("div");
    palEl.className = "ikp-mask";
    palEl.id = "ikKeysPalette";
    palEl.hidden = true;
    palEl.innerHTML =
      '<div class="ikp" role="dialog" aria-modal="true" aria-label="命令面板">' +
        '<div class="ikp-head">' +
          /* v2.23 §W3 第五步收编：原来这里手写一枚 search，与主表同形却走不到契约
             （stroke-width 2、不进唯一性闸）。面板是全局浮层，app.js 必然已就位。 */
          window.icon("search", 16, "ikp-glyph") +
          '<input class="ikp-input" id="ikpInput" type="text" role="combobox" aria-expanded="true" aria-controls="ikpList" aria-autocomplete="list" aria-label="搜索命令" placeholder="搜索命令 · 输入名称筛选" autocomplete="off" spellcheck="false">' +
          '<kbd class="ikp-esc">Esc</kbd>' +
        '</div>' +
        '<div class="ikp-list" id="ikpList" role="listbox" aria-label="命令列表"></div>' +
        '<div class="ikp-foot">↑↓ 选择 · Enter 执行 · Esc 关闭</div>' +
      '</div>';
    document.body.appendChild(palEl);
    palInput = palEl.querySelector(".ikp-input");
    palList = palEl.querySelector(".ikp-list");
    palInput.addEventListener("input", palRender);
    palEl.addEventListener("mousedown", function (e) {
      if (e.target === palEl) { e.preventDefault(); closePalette(); }
    });
    palList.addEventListener("mousedown", function (e) {
      if (e.target.closest && e.target.closest(".ikp-item")) e.preventDefault();  /* 保住输入框焦点 */
    });
    palList.addEventListener("click", function (e) {
      var it = e.target.closest && e.target.closest(".ikp-item");
      if (!it) return;
      palSel = +it.dataset.i;
      palRun();
    });
  }

  function cmd(id, group, title, fn, keys) { return { id: id, group: group, title: title, fn: fn, keys: keys }; }

  /* 行尾芯片回答的是「这条命令有没有键」，键位只有一个真源：注册表。palette 打开时按注册标题
     反查一次，对不上就留空 —— 宁可空着，也不在面板里写死一份会和注册表漂移的第二套键位。
     所以各命令的 keys 传的是**注册标题**（不是键名字符串）。 */
  function keyMap() {
    var m = {};
    list().forEach(function (r) {
      if (r.hidden || !r.title || !r.specs.length) return;
      if (!m[r.title]) m[r.title] = r.specs[0];
    });
    return m;
  }

  function navGo(href) {
    try { sessionStorage.setItem("inkread.nav.v1", "1"); } catch (e) {}   /* 与 app.js 导航拦截同约定 */
    location.href = href;
  }

  /* 命令源（每次打开现场采集）：页面导航 / 打开书 / 章节目录 / 主题 / 工具动作 / 全局 */
  function buildCommands() {
    var out = [];
    var cur = location.pathname.split("/").pop() || "index.html";

    document.querySelectorAll(".nav-link[data-nav]").forEach(function (a) {
      var href = a.getAttribute("href") || (a.dataset.nav + ".html");
      var name = (a.getAttribute("aria-label") || a.textContent || a.dataset.nav).trim();
      out.push(cmd("nav:" + a.dataset.nav, "页面导航", name + (href === cur ? "（当前）" : ""), function () {
        if (href !== cur) navGo(href);
      }));
    });
    out.push(cmd("nav:themes", "页面导航", "主题" + (cur === "themes.html" ? "（当前）" : ""), function () {
      if (cur !== "themes.html") navGo("themes.html");
    }));

    try {
      var shelf = (window.shelfList ? window.shelfList() : []) || [];
      shelf.slice(0, 8).forEach(function (d) {
        if (!d || !d.id) return;
        out.push(cmd("book:" + d.id, "打开书", "《" + (d.title || d.id) + "》", function () {
          try { sessionStorage.setItem("inkread.nav.v1", "1"); } catch (e) {}
          location.href = "reader.html?doc=" + encodeURIComponent(d.id);
        }));
      });
    } catch (e) {}

    document.querySelectorAll("#tocList .toc-item[data-bi]").forEach(function (el, i) {
      var t = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (!t) return;
      out.push(cmd("toc:" + i, "章节目录", t.length > 40 ? t.slice(0, 40) + "…" : t, function () { el.click(); }));
    });

    try {
      var T = window.InkTheme;
      if (T && T.available) {
        var curTheme = "";
        try { curTheme = ((T.read && T.read()) || {}).theme || ""; } catch (e2) {}
        T.available().forEach(function (t) {
          var k = (t && (t.k || t.id)) || t;
          if (!k) return;
          var meta = null;
          try { meta = T.metaOf ? T.metaOf(k) : null; } catch (e3) {}
          var name = (meta && meta.name) || (t && t.name) || String(k);
          out.push(cmd("theme:" + k, "主题", name + (k === curTheme ? " · 当前" : ""), function () {
            T.commit({ theme: k });
            if (window.toast) window.toast("已切换主题：「" + name + "」", "circle-check");
          }));
        });
      }
    } catch (e) {}

    var page = (document.body && document.body.dataset && document.body.dataset.page) || "";
    var ACT = {
      library: [["#btnImport", "导入文档"], ["#btnSync", "同步"], ["#btnManage", "管理"]],
      reader: [
        ["#tDir2", "目录 · 检索 · 跳转", ["目录"]], ["#tAa2", "Aa 排版", ["Aa 排版面板"]], ["#tNotes2", "批注"],
        ["#tSpeak2", "朗读"], ["#tExport", "导出 PDF"], ["#tPrint", "打印"],
        ["#tAuto", "自动翻页", ["自动翻页"]], ["#tBookmark", "书签与高亮", ["书签 / 高亮"]],
        ["#tFull", "全屏沉浸阅读", ["全屏沉浸"]],
        ["#pgPrev", "上一页", ["上一页"]], ["#pgNext", "下一页", ["下一页", "→ 向右翻页"]]
      ],
      notes: [["#btnNew", "新建笔记"], ["#btnExport", "导出 Markdown"], ["#btnImm", "沉浸写作", ["沉浸写作"]]],
      tasks: [["#btnBatch", "批量分配"]],
      cards: [["#q", "检索闪卡"], ["#saveQ", "保存检索"]],
      themes: [["#btnImport", "导入主题"], ["#btnNew", "新建主题"]],
      ai: [["#btnSync", "立即同步"], ["#btnModel", "模型设置"], ["#memBtn", "记忆"]]
    };
    (ACT[page] || []).forEach(function (a) {
      var el = document.querySelector(a[0]);
      if (!el || el.disabled) return;
      out.push(cmd("act:" + page + ":" + a[0], "工具", a[1], function () { el.click(); }, a[2]));
    });
    if (page === "cards") {
      var rv = document.querySelector("[data-review]:not([disabled])");
      if (rv) out.push(cmd("act:review", "工具", "开始复习", function () { rv.click(); }));
    }

    out.push(cmd("g:appearance", "全局", "外观设置", function () {
      if (window.InkTheme && InkTheme.open) InkTheme.open();
    }));
    out.push(cmd("g:data", "全局", "本机数据 · 备份与恢复", function () {
      var b = document.getElementById("inkDataBtn");
      if (b) b.click();
    }));
    out.push(cmd("g:help", "全局", "快捷键总览", function () { openHelp(); }, ["快捷键总览"]));
    out.push(cmd("g:palette", "全局", "命令面板", function () { openPalette(); }, ["命令面板"]));

    var KM = keyMap();
    out.forEach(function (c) {
      c.hint = "";
      for (var i = 0; c.keys && i < c.keys.length; i++) {
        if (KM[c.keys[i]]) { c.hint = KM[c.keys[i]]; break; }
      }
    });
    return out;
  }

  function palRender() {
    var q = (palInput.value || "").trim().toLowerCase();
    palRows = [];
    var html = "", lastG = "";
    palCmds.forEach(function (c) {
      if (q && (c.title + " " + c.group).toLowerCase().indexOf(q) < 0) return;
      if (c.group !== lastG) { html += '<div class="ikp-grp">' + escHtml(c.group) + "</div>"; lastG = c.group; }
      var idx = palRows.length;
      palRows.push(c);
      var on = idx === palSel ? " on" : "";
      html += '<div class="ikp-item' + on + '" role="option" id="ikpIt' + idx + '" data-i="' + idx + '" aria-selected="' + (idx === palSel) + '">' +
        '<span class="ikp-t">' + escHtml(c.title) + "</span>" +
        (c.hint ? '<kbd class="ikp-k">' + escHtml(c.hint) + "</kbd>" : "") + "</div>";
    });
    if (!palRows.length) html = '<div class="ikp-empty">没找到匹配的命令</div>';
    palList.innerHTML = html;
    if (palRows.length) palInput.setAttribute("aria-activedescendant", "ikpIt" + palSel);
    else palInput.removeAttribute("aria-activedescendant");
    var sel = palList.querySelector(".ikp-item.on");
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
  }

  function palMove(d) {
    if (!palRows.length) return;
    palSel = (palSel + d + palRows.length) % palRows.length;
    var its = palList.querySelectorAll(".ikp-item");
    for (var i = 0; i < its.length; i++) {
      var on = i === palSel;
      its[i].classList.toggle("on", on);
      its[i].setAttribute("aria-selected", on ? "true" : "false");
    }
    palInput.setAttribute("aria-activedescendant", "ikpIt" + palSel);
    if (its[palSel] && its[palSel].scrollIntoView) its[palSel].scrollIntoView({ block: "nearest" });
  }

  function palRun() {
    var c = palRows[palSel];
    if (!c) return;
    closePalette();
    setTimeout(function () {                       /* 先关再执行：动作里的弹层不被本层压住 */
      try { c.fn(); } catch (err) { console.error("[InkKeys] palette", c.id, err); }
    }, 0);
  }

  function grabFocus() { return document.activeElement; }
  function giveFocus(el) {
    /* 关层瞬间浏览器可能还没把焦点从已隐藏的输入上收走（微探针实测：0ms
       时 1/3 概率仍在 #ikpInput，50ms 内自愈）。这个窗口里按下的键会被
       inField 守卫当成「输入中」吃掉——先显式 blur 幽灵焦点再还原。 */
    var a0 = document.activeElement;
    if (a0 && ((palEl && palEl.contains(a0)) || (helpEl && helpEl.contains(a0)))) {
      try { a0.blur(); } catch (e) {}
    }
    if (el && el.focus && document.contains(el)) { try { el.focus(); } catch (e) {} }
    var a = document.activeElement;
    if (!a || (palEl && palEl.contains(a)) || (helpEl && helpEl.contains(a))) {
      try { (document.body || document.documentElement).focus(); } catch (e) {}
    }
  }

  function openPalette() {
    if (palOpen || !document.body) return;
    if (helpShown) closeHelp();
    if (!palEl) buildPalette();
    palRestore = grabFocus();
    palCmds = buildCommands();
    palSel = 0;
    palInput.value = "";
    palOpen = true;
    palEl.hidden = false;
    palRender();
    palInput.focus();
  }
  function closePalette() {
    if (!palOpen) return;
    palOpen = false;
    if (palEl) palEl.hidden = true;
    var r = palRestore; palRestore = null;
    giveFocus(r);
  }

  function buildHelp() {
    helpEl = document.createElement("div");
    helpEl.className = "ikp-mask";
    helpEl.id = "ikKeysHelp";
    helpEl.hidden = true;
    helpEl.innerHTML =
      '<div class="ikp ikp-wide" role="dialog" aria-modal="true" aria-label="快捷键总览" tabindex="-1">' +
        '<div class="ikp-head"><span class="ikh-title">快捷键总览</span><kbd class="ikp-esc">Esc</kbd></div>' +
        '<div class="ikh-body"></div>' +
        '<div class="ikp-foot">' + prettySpec(parseSpec("mod+k")) + " 命令面板 · 按 ? 或 Esc 关闭</div>" +
      '</div>';
    document.body.appendChild(helpEl);
    helpBody = helpEl.querySelector(".ikh-body");
    helpEl.addEventListener("mousedown", function (e) {
      if (e.target === helpEl) { e.preventDefault(); closeHelp(); }
    });
  }
  function helpPaint() {
    var page = (document.body && document.body.dataset.page) || "";
    var order = [], map = {}, n = 0;
    list().forEach(function (r) {
      if (r.hidden || !r.title || !r.specs.length) return;
      if (r.page && r.page !== page) return;
      n++;
      if (!map[r.group]) { map[r.group] = []; order.push(r.group); }
      map[r.group].push(r);
    });
    var html = "";
    order.forEach(function (g) {
      html += '<div class="ikh-grp">' + escHtml(g) + "</div>";
      map[g].forEach(function (r) {
        html += '<div class="ikh-row"><span class="ikh-k"><kbd>' +
          escHtml(r.specs.slice(0, 2).join("</kbd> <kbd>")) +
          "</kbd></span><span>" + escHtml(r.title) + "</span></div>";
      });
    });
    helpBody.innerHTML = html || '<div class="ikp-empty">本页暂无已注册快捷键</div>';
    /* 页脚如实说明「这是本页的键位」并指向跨页入口 —— 总览按页过滤，
       跳页类命令只在命令面板里。 */
    var foot = helpEl && helpEl.querySelector(".ikp-foot");
    if (foot) foot.innerHTML = "本页 " + n + " 条 · 跳页与其他命令见 " +
      prettySpec(parseSpec("mod+k")) + " 命令面板 · 按 ? 或 Esc 关闭";
  }
  function openHelp() {
    if (helpShown || !document.body) return;
    if (palOpen) closePalette();
    if (!helpEl) buildHelp();
    helpRestore = grabFocus();
    helpPaint();
    helpShown = true;
    helpEl.hidden = false;
    var d = helpEl.querySelector(".ikp");
    if (d && d.focus) { try { d.focus(); } catch (e) {} }
  }
  function closeHelp() {
    if (!helpShown) return;
    helpShown = false;
    if (helpEl) helpEl.hidden = true;
    var r = helpRestore; helpRestore = null;
    giveFocus(r);
  }

  /* ================= 调度器（document 冒泡段，先到先得） ================= */
  function overlayKey(e) {
    var k = normKey(e.key);
    if (palOpen) {
      if (k === "escape") { e.preventDefault(); e.stopImmediatePropagation(); closePalette(); return; }
      if (k === "arrowdown" || k === "pagedown") { e.preventDefault(); e.stopImmediatePropagation(); palMove(1); return; }
      if (k === "arrowup" || k === "pageup") { e.preventDefault(); e.stopImmediatePropagation(); palMove(-1); return; }
      if (k === "enter") { e.preventDefault(); e.stopImmediatePropagation(); palRun(); return; }
      if (k === "tab") { e.preventDefault(); e.stopImmediatePropagation(); return; }   /* 焦点陷阱 */
      if (k === "k" && (MAC ? e.metaKey : e.ctrlKey)) { e.preventDefault(); e.stopImmediatePropagation(); closePalette(); return; }
      return;   /* 其余键交给输入框（即时过滤） */
    }
    /* 总览：模态冻结页面按键（Esc / ? 关，mod+K 切命令面板） */
    e.stopImmediatePropagation();
    if (k === "escape" || e.key === "?") { e.preventDefault(); closeHelp(); return; }
    if (k === "k" && (MAC ? e.metaKey : e.ctrlKey)) { e.preventDefault(); closeHelp(); openPalette(); }
  }

  document.addEventListener("keydown", function (e) {
    if (ime(e)) return;                       /* 捕获守卫已截；此处兜底（合成事件路径） */
    if (palOpen || helpShown) { overlayKey(e); return; }
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      if (!r.inInput && inField(e.target)) continue;
      var hit = false;
      for (var j = 0; j < r.specs.length; j++) {
        if (matches(r.specs[j], e)) { hit = true; break; }
      }
      if (!hit) continue;
      if (r.when && !r.when()) continue;
      if (r.prevent) e.preventDefault();
      e.stopImmediatePropagation();           /* 命中即消费：等价原「单链 else-if」语义 */
      try { r.fn(e); } catch (err) { console.error("[InkKeys]", r.id, err); }
      return;
    }
  });

  /* 核心注册项：命令面板与总览（§四.D 冲突已核实：Ctrl/Cmd+K、? 无既有占用） */
  on("mod+k", function () { openPalette(); }, { inInput: true, title: "命令面板", group: "全局" });
  on("?", function () { openHelp(); }, { title: "快捷键总览", group: "全局" });

  window.InkKeys = {
    on: on, off: off, run: run, list: list, ime: ime,
    openPalette: openPalette, closePalette: closePalette,
    openHelp: openHelp, closeHelp: closeHelp,
    isOpen: isOpen,
    /* 带转场约定的换页：命令面板与工具层（ink-agent.js）走同一条 —— 
       各处自己写 location.href 会漏掉 inkread.nav.v1，新页首启动画就与这次导航打架。 */
    navGo: navGo
  };

  /* 层栈让路（方案 §W2.4）：命令面板与快捷键总览是盖在窗上面的模态，
     Esc 先归它们 —— 否则一次按键会连身后的窗一起收掉。
     本脚本在 dock.js 之前加载，所以登记排在 DOMContentLoaded。 */
  document.addEventListener("DOMContentLoaded", function () {
    if (window.InkWin) InkWin.yieldTo("keys", isOpen);
  });
})();
