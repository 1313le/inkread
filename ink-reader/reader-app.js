(async function () {
  /* ---------- 图标填充（页壳，与读哪一本书无关） ----------
     这一段必须排在「查不到书就 renderNoDoc() + return」之前：底栏六钮、顶栏书签/全屏、
     翻页箭头、批注浮窗的三颗钮都是静态 HTML 里的空 <span>，图标靠这里落。
     曾经它排在早退之后，于是 ?doc= 指向已删掉的书时整页图标一个都不画，只剩一排空白圆角框
     —— 而 verify-nodoc.js 只量文字与空态，看不见这个，闸是绿的、屏幕是坏的。 */
  var IC = {
    icBack: "arrow-left", icAa: "type", icAaSide: "type", icStore: "grid-2x2",
    icDir: "toc", icDirH: "toc", icTpX: "x",
    icMark: "highlighter",
    icSpeak: "volume-2", icNotes: "notebook-pen", icPrev: "chevron-left", icNext: "chevron-right",
    icVol: "volume-2", icStop: "x", icBold: "bold", icItalic: "italic", icH: "heading",
    icList: "list", icQuote: "quote", icCode: "code", icSigma: "sigma", icEye: "eye",
    icSave: "circle-check", icSelNote: "pen-line", icSelMark: "bookmark", icSelCopy: "copy",
    icTasks: "list-checks", immIcTasks: "list-checks", icTdTitle: "list-checks", icTdX: "x",
    icPalette: "palette", icAppearance: "palette",
    icFull: "maximize", immIcMark: "highlighter", immIcNotes: "notebook-pen", immIcExit: "minimize",
    immIcAppearance: "palette", immIcAa: "type",
    /* v2.24.1：沉浸底栏补两枚 —— 全屏里也要能开听书、能开自动翻页 */
    immIcSpeak: "volume-2", immIcAuto: "chevrons-right",
    immIcPrev: "chevron-left", immIcNext: "chevron-right",
    /* v9 新增：更多菜单 / 翻译 / 模式 / 全屏目录 */
    icMore: "ellipsis", icMoreMode: "wand-2", icMoreTrans: "languages", icStore2: "grid-2x2",
    icSelTrans: "languages", immIcToc: "toc", immIcMode: "wand-2",
    /* v12 新增：书签与设置覆盖侧栏 */
    icSide: "panel-left",
    /* v13 新增：辅助阅读（解析 / 溯源） */
    icSelExplain: "scan-text", icSelTrace: "trace-back", icAuxX: "x",
    /* v2.23 W1e：划词「问 AI」—— 选中即问，和解析/溯源同一族，故同排 */
    icSelAsk: "brain",
    /* v2.14 新增：顶栏书签钮 + 阅读底栏六钮 */
    icBm2: "bookmark", icDir2: "toc", icAa2: "type",
    icNotes2: "notebook-pen", icSpeak2: "volume-2", icMore2: "ellipsis",
    /* v14 新增：文档修改（修改条上的图标；工具栏锁按钮由 paintEditBar 整段重写） */
    icEditOn: "lock-open", icRestore: "rotate-ccw", icDone: "circle-check",
    /* v2.20 新增：自动翻页（更多入口 / 控制条；播放位由 autoPaint 随态改写） */
    icAuto: "chevrons-right", icAutoPlay: "pause", icAutoDown: "minus", icAutoUp: "plus", icAutoStop: "x",
    /* v2.21 新增：出纸两个入口（文案随能力改写，图标不用改 —— 打印机就是打印机） */
    icExport: "download", icPrint: "printer",
    /* v2.24.2：多角色角色表 */
    icCastX: "x",
    /* v2.25.1：阅读设置（方案 B）—— 更多项 / 沉浸底栏 / 面板收起与版式转发 */
    immIcSet: "settings", icReadSet: "settings", icSetX: "x", icRsAa: "type"
  };
  Object.keys(IC).forEach(function (id) {
    var el = qs("#" + id); if (el) el.innerHTML = icon(IC[id], 16);
  });

  var params = new URLSearchParams(location.search);
  /* 深链的 ?doc= 一律精确查书，不走 byId 的「查不到就取首本」：
     清空本机数据后书架为空，byId 返回 undefined，boot 里一句 doc.title 就抛异常、整页空白；
     而在另一台设备导入过的书，拿旧 id 进来则会静默打开完全不相干的第一本。
     两种都如实说出来，并给出回书架的出口。 */
  var wantId = params.get("doc");
  var shelf0 = shelfList();
  var doc = wantId ? InkStore.getDoc(wantId) : (shelf0[0] || null);
  var docId = doc ? doc.id : (wantId || "");
  if (!doc) { renderNoDoc(wantId); return; }
  /* 正文来源：先查导入文档的本机正文（inkread.contents.v1，经 API.localContent），
     拿不到再回 mock 的 DB.contents —— 导入的文档不再是空书。
     且一律取私有副本：修改模式会就地改文字，绝不碰原始数据，
     这样「恢复原文」只需丢掉覆盖记录。 */
  function sourceBlocks() {
    if (window.API && API.localContent) {
      var c = API.localContent(docId);
      if (c && c.length) return c;
    }
    return DB.contents[docId] || [];
  }
  /* 书仓书（EPUB）：正文与插图落在本机 ebooks，书架条目里只有指针。
     开书前先把正文取进内存（API.diskContent），之后 sourceBlocks 走的仍是同步路径。
     取不到就如实停下：在别的设备导入的书本机没有正文，硬开等于给用户一本空书。 */
  /* 取正文骨架（v2.22）：大书的磁盘读要等一拍，空白纸面会让人以为卡住。
     用缩微正文两道灰条（与翻页样机同一画法），落进 #doc —— 首笔正文渲染或
     任一空态（renderNoDoc / renderEmptyDoc）都会整段换掉它，无需另行拆卸。 */
  function diskSkeleton() {
    var el = qs("#doc");
    if (!el || document.body.hasAttribute("data-nodoc")) return;
    el.innerHTML = '<div class="disk-sk" role="status" aria-busy="true">' +
      '<span class="fp-t"></span>' +
      '<span class="fp-l" style="width:97%"></span><span class="fp-l" style="width:92%"></span>' +
      '<span class="fp-l" style="width:95%"></span><span class="fp-l" style="width:86%"></span>' +
      '<span class="fp-l sk-gap" style="width:94%"></span><span class="fp-l" style="width:96%"></span>' +
      '<span class="fp-l" style="width:89%"></span><span class="fp-l" style="width:63%"></span>' +
      '<span class="fp-l sk-gap" style="width:95%"></span><span class="fp-l" style="width:91%"></span>' +
      '<span class="fp-l" style="width:93%"></span><span class="fp-l" style="width:74%"></span>' +
      '<p class="disk-sk-cap">正在从本机书仓取回正文…</p></div>';
  }
  if (doc.src === "disk") {
    /* 骨架屏原则：300ms 以内的窗口不设骨架 —— 秒开的书闪一下灰条比空白更扰人 */
    var skTimer = setTimeout(diskSkeleton, 300);
    try {
      if (window.API && API.diskContent) await API.diskContent(doc);
    } catch (e) {
      clearTimeout(skTimer);
      renderNoDoc(wantId, "《" + esc(doc.title || "这本书") + "》的正文不在本机书仓<br>" +
        esc(String((e && e.message) || "读取失败")) + " · 换设备阅读请重新导入原文件");
      return;
    }
    clearTimeout(skTimer);
  }
  var blocks = sourceBlocks().map(function (b) { return Object.assign({}, b); });
  var read = InkTheme.read();

  /* 告诉主脑「现在在读哪一本」—— 此后翻译 / 溯源 / 解析 / 检索的系统前言都会带上它，
     主脑在任何入口都认识这本书，而不只在对话框里。 */
  if (window.Brain) Brain.setDoc(docId);

  /* 文档修改（v14）：把用户改过的块文字盖到副本上 */
  (function () {
    var ed = InkStore.getDocEdits(docId);
    if (!Object.keys(ed).length) return;
    blocks = blocks.map(function (b, i) {
      return (ed[i] != null && typeof b.x === "string") ? Object.assign({}, b, { x: ed[i] }) : b;
    });
  })();

  /* 存量文档救活：解析器升级不会自动重算已导入的 blocks。这里用「索引保持」的
     方式把当年被拆成一段段的表格重组回来 —— 块数与块序一个都不动，
     书签 / 朗读 / 编辑覆盖 / 高亮锚点全部照旧。 */
  blocks = MD.fixTables(blocks);

  var state = {
    pages: [], pageIdx: [], cur: 0, notes: [], filter: "all", tfilter: "todo",
    scroll: false, ttsTimer: null, sel: null
  };

  /* ---------- 图标填充：见本 IIFE 开头（页壳图标，必须先于无书早退执行） ---------- */

  /* ---------- 主题：由 theme.js 统一提供，此处只做摘要展示 ---------- */
  function themeName(k) {
    var m = window.InkTheme && InkTheme.metaOf(k);
    return m ? m.name : k;
  }
  function paintSummary() {
    var el = qs("#setSummary");
    if (!el) return;
    var cur = InkTheme.resolve(read);
    el.textContent = "当前「" + themeName(cur) + "」· " + read.fs + "px · 行高 " + read.lh +
      (read.twoCol ? " · 双栏" : "");
  }

  /* ============================================================
     1. 内容渲染（block → HTML）
     ============================================================ */
  /* 图版画法：块里带 art 就用它（漫画每一格各不相同），否则用通用示意图。
     两种画法共用同一 viewBox 与外层描边，故正文与分格引导里是同一张图。 */
  var FIG_ART = '<rect x="8" y="6" width="60" height="74" rx="3" opacity=".5"/>' +
    '<rect x="82" y="6" width="60" height="74" rx="3" opacity=".5"/>' +
    '<circle cx="30" cy="30" r="13" fill="currentColor" opacity=".18" stroke="none"/>' +
    '<circle cx="46" cy="52" r="9" fill="currentColor" opacity=".12" stroke="none"/>' +
    '<circle cx="104" cy="24" r="8" fill="currentColor" opacity=".1" stroke="none"/>' +
    '<circle cx="112" cy="48" r="15" fill="currentColor" opacity=".14" stroke="none"/>' +
    '<path d="M8 76h60M82 76h60" opacity=".4"/>';
  function figSVG(b) {
    return '<svg width="150" height="86" viewBox="0 0 150 86" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">' +
      ((b && b.art) || FIG_ART) + "</svg>";
  }
  var FIG = figSVG(null);

  /* 列表项四形态：string（MD 行内文本）/ {x,sub}（嵌套）/ {td,on,sub}（任务清单）/
     {id,x}（书架任务引用，带打卡按钮）。sub 是 md.js listObj 产出的子列表块。 */
  function olStart(b) {
    return b && b.start && b.start !== 1 ? ' start="' + (Number(b.start) || 1) + '"' : "";
  }
  function subHTML(sb) {
    var tag = sb.type === "olist" ? "ol" : "ul";
    return "<" + tag + olStart(sb) + ' class="md-list md-sub">' + sb.items.map(function (it) { return "<li" + liCls(it) + ">" + listItem(it) + "</li>"; }).join("") + "</" + tag + ">";
  }
  function liCls(it) { return it && typeof it === "object" && it.td != null ? ' class="md-task' + (it.on ? " on" : "") + '"' : ""; }
  function listItem(it) {
    if (typeof it === "string") return MD.inline(it);
    var tail = (it.sub || []).map(subHTML).join("");
    if (it.td != null) return '<span class="md-box">' + (it.on ? "✓" : "") + "</span>" + MD.inline(it.td);
    if (it.id) {
      var on = DB.tasks.some(function (t) { return t.id === it.id && InkStore.getCheckins()[t.id]; });
      return '<span class="task-src" id="' + it.id + '">' + esc(it.x) + '</span>' +
        '<button class="task-flag" data-task="' + it.id + '">' + icon("list-checks", 11) + (on ? "已打卡" : "任务") + "</button>";
    }
    return MD.inline(it.x) + tail;
  }

  function renderBlock(b) {
    if (b.mdx) return "";   /* 存量表格救活后留下的占位块：不产 DOM，但仍占一个块序号 */
    switch (b.type) {
      case "h1": return '<h1 id="' + (b.id || "doc-top") + '">' + MD.inline(String(b.x || "")) + "</h1>";
      case "meta": return '<div class="doc-meta">' + esc(b.x) + "</div>";
      case "h2": return '<h2 id="' + (b.id || "") + '">' + MD.inline(String(b.x || "")) + "</h2>";
      case "h3": return '<h3 id="' + (b.id || "") + '">' + MD.inline(String(b.x || "")) + "</h3>";
      case "p": return "<p>" + MD.inline(String(b.x || "")).replace(/\n/g, "<br>") + "</p>";
      /* 引用：交给 MD.render 内层递归，引文里的列表 / 表格同样是真部件，
         而不是把 Markdown 源码原样印出来。 */
      case "quote": return "<blockquote>" + MD.render(String(b.x || ""), true) + "</blockquote>";
      case "list": return '<ul class="md-list">' + b.items.map(function (it) { return "<li" + liCls(it) + ">" + listItem(it) + "</li>"; }).join("") + "</ul>";
      case "olist": return '<ol class="md-list"' + olStart(b) + ">" + b.items.map(function (it) { return "<li" + liCls(it) + ">" + listItem(it) + "</li>"; }).join("") + "</ol>";
      case "table": return MD.table(b.head || [], b.rows || [], b.align || []);
      case "fig":
        return '<div class="doc-fig"><div class="fig-box">' + figSVG(b) + "</div><figcaption>" + esc(b.cap) + "</figcaption>" +
          (b.note ? '<div class="fig-note">' + esc(b.note) + "</div>" : "") + "</div>";
      case "formula": return '<div class="math-block">' + MD.tex(b.x) + "</div>";
      case "code": return MD.code(b.x, b.lang);
      case "abstract": return '<div class="doc-abstract"><b>' + esc(b.label) + "　</b>" + esc(b.x) + "</div>";
      case "kw": return '<div class="doc-kw"><b>关键词：</b>' + b.items.map(esc).join("　·　") + "</div>";
      case "refs": return '<div class="doc-refs"><ol>' + b.items.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ol></div>";
      /* EPUB 插图：src 由书仓资源端点给出（/e/<bookId>/…），离线随书一起落盘。
         宽高已知就把「版位高度」在图片落地前钉死：宽度取 min(容器, 原始像素, 由页高上限反推)，
         量具与实况都只认宽度算高度，加载前后同一尺寸。若只给 aspect-ratio 不限高，
         一张 1:1.5 的书封会把整页吃满，页底挤出一条页内滚动。
         页高上限走 --ink-img-h（paginate 每次量完再写），88px 是图注 + 块前后距的预留 ——
         只限图不限注，页底仍会多出几十像素。图注只在作者写了 alt 时出现。 */
      case "img":
        var dim = (+b.w > 0 && +b.h > 0)
          ? ' style="width:min(100%,' + b.w + "px,calc(" + (Math.round(b.w * 1000 / b.h) / 1000) +
            " * (var(--ink-img-h,56vh) - 88px)));aspect-ratio:" + (Math.round(b.w * 1000 / b.h) / 1000) + '"'
          : "";
        return '<figure class="doc-img"><img src="' + esc(b.src || "") + '" alt="' + esc(b.alt || "") + '"' + dim +
          ' loading="lazy" decoding="async">' +
          (b.alt ? "<figcaption>" + esc(b.alt) + "</figcaption>" : "") + "</figure>";
      /* EPUB 脚注：独立成块，压在所属章末。行内链接会把注脚混进正文，读起来是串味的。 */
      case "note":
        return '<aside class="doc-note"' + (b.id ? ' id="' + esc(b.id) + '"' : "") +
          '><span class="note-mark">注</span><span class="note-txt">' + esc(String(b.text || "")) + "</span></aside>";
      default: return "<p>" + esc(b.x || "") + "</p>";
    }
  }

  /* 给块的首个开标签注入 data-bi：点段起读、朗读跟读都靠它把 DOM 元素锚回块号。
     分页 / 滚动两种模式下 #doc 里都带这个属性，一份数据两处通用。 */
  function biAttr(html, i) {
    return String(html).replace(/^(\s*<\w+)/, '$1 data-bi="' + i + '"');
  }
  /* 占位块（mdx，存量表格救活留下的）不产 DOM，所以 #doc 的子元素数 **小于** 块数。
     块号 ↔ 元素一律走 data-bi：用子元素下标会让表格之后的块整体错位 ——
     分页错位即整页空白，改字错位即点 A 段存进 B 段。fb 是调用方给的回退值。 */
  function biOf(el, fb) {
    var v = el && el.getAttribute ? el.getAttribute("data-bi") : null;
    return v == null ? fb : Number(v);
  }
  function biEl(bi) { return qs('#doc [data-bi="' + bi + '"]'); }
  var BLOCK_HTML = blocks.map(function (b, i) { return biAttr(renderBlock(b), i); });
  var DOC_CLASS = "doc" + (doc.theme === "academic" ? " academic" : "");

  /* 块的纯文本：字符偏移、检索、预览共用同一份口径，免得三处各算一遍对不上 */
  function blockText(b) {
    var s = "";
    if (typeof b.x === "string") s += b.x;
    if (typeof b.text === "string") s += b.text;   /* note 块：注脚文字同样进检索与偏移口径 */
    if (b.cap) s += b.cap;
    if (b.alt) s += b.alt;
    if (b.label) s += b.label;
    if (b.head) s += b.head.join(" ");
    if (b.rows) s += b.rows.map(function (r) { return r.join(" "); }).join(" ");
    if (b.items) s += b.items.map(itemText).join(" ");
    return s;
  }
  function itemText(it) {
    if (typeof it === "string") return it;
    var s = it.x || it.td || "";
    if (it.sub) s += " " + it.sub.map(function (sb) { return sb.items.map(itemText).join(" "); }).join(" ");
    return s;
  }
  var BLOCK_TEXT = blocks.map(blockText);

  /* 字符偏移表：blocks[i] 的起始全局偏移。
     横向翻页 / 竖向浏览靠它互相锚定位置——切换模式不回到章首（调研强调的关键陷阱）。 */
  var BLOCK_OFF = (function () {
    var acc = 0, arr = [];
    BLOCK_TEXT.forEach(function (s) { arr.push(acc); acc += Math.max(1, s.length); });
    return arr;
  })();

  /* 当前正文容器类：双栏在两种模式下各有一套实现
     scroll → .two-col（通栏平衡分栏，连续下读）
     paged  → .pg-cols（每页定高两栏，column-fill:auto 自动填满第一栏再填第二栏） */
  function docClass() {
    if (!read.twoCol) return DOC_CLASS;
    return DOC_CLASS + (state.scroll ? " two-col" : " pg-cols");
  }

  /* 全局偏移 → 所在块序号 */
  function blockAt(off) {
    var i = 0;
    for (var k = 0; k < BLOCK_OFF.length; k++) { if (BLOCK_OFF[k] <= off) i = k; else break; }
    return i;
  }

  /* ============================================================
     2. 真实分页（按纸页高度测量）
     ============================================================ */
  /* 排版变量统一由 theme.js 落地（字号/行高/字重/字距/段距/缩进/对齐/栏宽） */
  function applyVars() {
    InkTheme.paint(read);
  }

  /* 全文汉字数：用于「剩余时间」估算（按中文 300 字/分） */
  var DOC_CHARS = (function () {
    var s = "";
    blocks.forEach(function (b) {
      if (typeof b.x === "string") s += b.x;
      if (b.items) s += b.items.join("");
    });
    return s.length || 1;
  })();

  /* 滚动进度 0–1：横向翻页按页号，竖向浏览按 scrollTop */
  function scrollRatio() {
    var sheet = qs("#sheet");
    var max = sheet.scrollHeight - sheet.clientHeight;
    return max > 0 ? Math.max(0, Math.min(1, sheet.scrollTop / max)) : 1;
  }

  /* 进度显示三态：页码 / 百分比 / 剩余时间 */
  function paintProg() {
    var el = qs("#pageInd");
    if (!el) return;
    var total = state.pages.length || 1;
    var ratio = state.scroll ? scrollRatio() : (state.cur + 1) / total;
    /* v2.14：底栏滑条与百分比同步（三态显示共用；拖动中值相同则不打断） */
    var pr = qs("#progRange");
    if (pr) {
      var pv = Math.round(ratio * 100);
      if (+pr.value !== pv) pr.value = pv;
      pr.style.setProperty("--fill", pv + "%");
      qs("#dockPct").textContent = pv + "%";
    }
    if (read.prog === "percent") { el.textContent = Math.round(ratio * 100) + "%"; return; }
    if (read.prog === "remain") {
      /* v2.8：用实测阅读速度估算（近 14 天 words/sec；样本不足退默认 300）。
         hover 的 title 如实说明依据来源 —— 估算就是估算，不装精确。 */
      var sp = (window.API && API.readSpeed) ? API.readSpeed(doc.type) : { wpm: 300, source: "default" };
      var wpm = Math.max(80, Math.min(1200, sp.wpm || 300));
      var min = Math.ceil((DOC_CHARS * (1 - ratio)) / wpm);
      var KIND_NM = { book: "书籍", textbook: "教材", paper: "论文", report: "报告", plan: "计划", note: "笔记", comic: "漫画", other: "其他" };
      el.textContent = min > 0 ? "约 " + min + " 分钟" : "已读完";
      el.title = sp.source === "default"
        ? "按平均速度 300 字/分估算 · 多读一会儿将自动用你的实测速度"
        : sp.source === "kind"
          ? "按你读「" + (KIND_NM[sp.kind] || sp.kind) + "」类文档的实测速度 " + wpm + " 字/分估算（越读越准）"
          : "按你的实测阅读速度 " + wpm + " 字/分估算（" + (sp.source === "recent14" ? "近 14 天" : "累计") + "数据）";
      return;
    }
    el.textContent = state.scroll ? "通栏 " + Math.round(ratio * 100) + "%" : (state.cur + 1) + " / " + total;
  }

  /* ============================================================
     2b. 分页装箱：不可分单位是「行」，不是「块」
     ------------------------------------------------------------
     旧装箱只认整块 —— 一块放不下就整块挪到下一页，于是标题孤零零占一页、
     其余全是空白（实测某页 468px / 77% 空白；26 行的表 1092px 挤进 612px
     的页，多出的 550px 被页内滚动条藏起来，读者根本看不见）。
     现在长段按行腰斩、长表按行分节（表头随行重复 + 挂「续表」题注）、
     长列表按顶层项分节（有序表用 start 续号）。笔记与书签按文字锚定
     （v2.5），拆块不动它们的位置。
     ============================================================ */
  var CAP_H = 24;   /* 「续表」题注占位：分节表每页多出一行，装箱预算必须算进去 */

  function isHeading(b) { return !!(b && (b.type === "h1" || b.type === "h2" || b.type === "h3")); }

  /* 可拆性：表格按数据行、列表按顶层项、段落按行盒；图/公式/代码/引用仍整块走 */
  function splitKindOf(b) {
    if (!b) return "";
    if (b.type === "table") return b.rows && b.rows.length > 1 ? "rows" : "";
    if (b.type === "list" || b.type === "olist") return b.items && b.items.length > 1 ? "items" : "";
    if (b.type === "p") return "lines";
    return "";
  }
  function unitBottoms(el, kind) {
    var ns = kind === "rows" ? el.querySelectorAll("tbody tr") : el.querySelectorAll(":scope > li");
    return Array.prototype.slice.call(ns).map(function (n) { return n.getBoundingClientRect().bottom; });
  }
  function theadHeight(el) {
    var t = el.querySelector("thead");
    return t ? t.getBoundingClientRect().height : 0;
  }

  /* 表格分节：让 MD 重新出 HTML（表头天然随行重复），续节加类 + 题注 */
  function tableChunk(b, a, z, cont) {
    var h = MD.table(b.head || [], (b.rows || []).slice(a, z), b.align || []);
    if (!cont) return h;
    return h.replace('<div class="md-tablebox">', '<div class="md-tablebox md-tcont">')
      .replace('<table class="md-table">', '<table class="md-table"><caption class="md-tcap">续表</caption>');
  }
  /* 列表分节：顶层项切片，有序列表用 start 接着数（序号不能从 1 重来） */
  function listChunk(b, a, z, cont) {
    var ol = b.type === "olist", st = "";
    if (ol) {
      var m = /(\d+)/.exec(olStart(b));
      st = ' start="' + ((m ? +m[1] : 1) + a) + '"';
    }
    return "<" + (ol ? "ol" : "ul") + ' class="md-list' + (cont ? " md-lcont" : "") + '"' + st + ">" +
      b.items.slice(a, z).map(function (it) { return "<li" + liCls(it) + ">" + listItem(it) + "</li>"; }).join("") +
      "</" + (ol ? "ol" : "ul") + ">";
  }

  /* ---- 段内坐标换算：行盒 ↔ 字符偏移 ---- */
  function textFlow(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n, nodes = [], acc = [], total = 0;
    while ((n = w.nextNode())) {
      var s = n.nodeValue || "";
      if (!s.length) continue;
      nodes.push(n); acc.push(total); total += s.length;
    }
    return { nodes: nodes, acc: acc, total: total };
  }
  function flowPos(flow, off) {
    var i = 0;
    while (i + 1 < flow.nodes.length && flow.acc[i + 1] <= off) i++;
    var ln = flow.nodes[i].nodeValue.length;
    return { node: flow.nodes[i], local: Math.max(0, Math.min(off - flow.acc[i], ln)) };
  }
  /* 行盒：一个 Range 的 client rects 每行（每种行内样式）一个，按顶边归并。
     Range 给的是**文字**矩形，不含行距的半空（half-leading）—— 直接拿它当行盒，
     续排的段落会比实况矮几 px，页底就顶出一条页内滚动条（实测 4px）。
     所以先按本元素行距把每行补齐成真正的 CSS 行盒。 */
  function halfLead(el) {
    var cs = getComputedStyle(el);
    var fs = parseFloat(cs.fontSize) || 16;
    var lh = parseFloat(cs.lineHeight);
    return lh === lh && lh > fs ? (lh - fs) / 2 : 0;
  }
  function lineBoxes(el) {
    var pad = halfLead(el);
    var rg = document.createRange();
    rg.selectNodeContents(el);
    var out = [];
    Array.prototype.slice.call(rg.getClientRects())
      .filter(function (b) { return b.height > 1; })
      .sort(function (x, y) { return x.top - y.top; })
      .forEach(function (b) {
        var top = b.top - pad, bot = b.bottom + pad;
        var last = out[out.length - 1];
        if (last && Math.abs(last.raw - b.top) < 2) { last.raw = b.top; last.bot = Math.max(last.bot, bot); }
        else out.push({ raw: b.top, top: top, bot: bot });
      });
    return out;
  }
  function charTop(flow, off) {
    if (!flow.total) return NaN;
    off = Math.max(0, Math.min(flow.total - 1, off));
    var p = flowPos(flow, off), ln = p.node.nodeValue.length;
    var rg = document.createRange();
    rg.setStart(p.node, Math.min(p.local, ln)); rg.setEnd(p.node, Math.min(p.local + 1, ln));
    var b = rg.getBoundingClientRect();
    if (!b.height && p.local > 0) { rg.setStart(p.node, p.local - 1); b = rg.getBoundingClientRect(); }
    return b.height ? b.top : NaN;
  }
  /* 起点落在 lineTop 这一行的第一个字符（行边界，绝不在字中间下刀） */
  function cutOffset(flow, lineTop) {
    var lo = 0, hi = flow.total - 1, res = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, t = charTop(flow, mid);
      if (t === t && t >= lineTop - 1.5) { res = mid; hi = mid - 1; } else lo = mid + 1;
    }
    while (res > 0) { var q = charTop(flow, res - 1); if (q === q && q >= lineTop - 1.5) res--; else break; }
    return res;
  }
  /* 把段落裁成 [from,to) 的一节：克隆后按同一套文本节点顺序删掉区间外的字符 */
  function paraFrag(el, from, to, cont) {
    var c = el.cloneNode(true), off = 0;
    var w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      var s = n.nodeValue || "", a = off;
      if (!s.length) continue;
      off += s.length;
      if (off <= from || a >= to) n.nodeValue = "";
      else if (a < from || off > to) n.nodeValue = s.slice(Math.max(0, from - a), Math.min(s.length, to - a));
    }
    pruneEmpty(c);
    while (c.firstChild && c.firstChild.nodeType === 1 && c.firstChild.tagName === "BR") c.removeChild(c.firstChild);
    while (c.lastChild && c.lastChild.nodeType === 1 && c.lastChild.tagName === "BR") c.removeChild(c.lastChild);
    if (cont) c.className = (c.className ? c.className + " " : "") + "p-cont";
    return c.outerHTML;
  }
  function pruneEmpty(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
      if (ch.nodeType === 3) { if (!ch.nodeValue) node.removeChild(ch); return; }
      if (ch.nodeType !== 1) { node.removeChild(ch); return; }
      pruneEmpty(ch);
      if (ch.tagName !== "BR" && !ch.textContent) node.removeChild(ch);
    });
  }

  /* 返回 {pages:[[bi…]], htmls:[[片段 HTML…]]} —— 两表逐位对齐，
     pages 里同一块号可以出现在相邻数页上（该块被拆了），现有按 bi 查找的调用方照旧可用。 */
  function packSingle(md, padTop, avail) {
    var kids = Array.prototype.slice.call(md.children);
    var pages = [], htmls = [], cur = [], curH = [];
    var fills = [], curUsed = 0;
    var limit = 0, drift = 0, prevBi = -1;

    function seal() {
      if (!cur.length) return;
      /* fills[pi] = 本页页底还剩多少（占可用页高的比例）：一键推荐档位的评分就靠它，
         再拿 DOM 量一遍整本书代价太大，而分页时这些边界本来就已经算出来了。 */
      fills.push(avail > 0 ? Math.max(0, Math.min(1, (limit - curUsed - drift) / avail)) : 1);
      pages.push(cur); htmls.push(curH);
      cur = []; curH = []; drift = 0;
    }
    /* [top,bot] 这一段（含重复表头占位 ovh）在本页放不放得下。
       anchor 是「含段前距的起点」：一页的第一块要把自己的 margin-top 也算进页高，
       否则实况排版比量具整体下移一截，页底就多出一小条页内滚动（实测差 15~21px）。
       drift 是本页已重复表头累积出来的下移量。 */
    function fits(anchor, bot, ovh) {
      return cur.length ? bot + drift + (ovh || 0) <= limit : bot + (ovh || 0) - anchor <= avail;
    }
    function put(bi, html, anchor, ovh, bot) {
      if (!cur.length) { limit = anchor + avail; drift = 0; }
      cur.push(bi); curH.push(html); drift += ovh || 0;
      curUsed = bot;
    }
    function mTop(el) { return parseFloat(getComputedStyle(el).marginTop) || 0; }

    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      var bi = biOf(k, prevBi + 1);        /* 块号取自 data-bi，不是子元素序号 */
      prevBi = bi;
      var b = blocks[bi] || {}, r = k.getBoundingClientRect();
      var kind = splitKindOf(b);

      var anch0 = r.top - mTop(k);
      if (!kind) {
        /* 标题不落单页底：后一块连最小一节都挤不进本页，标题就跟着挪过去 */
        if (isHeading(b) && cur.length && kids[i + 1]) {
          var nk = kids[i + 1], nb = blocks[biOf(nk, bi + 1)] || {}, nr = nk.getBoundingClientRect();
          var nkind = splitKindOf(nb), minBot = nr.bottom;
          if (nkind === "rows" || nkind === "items") {
            var u0 = unitBottoms(nk, nkind);
            if (u0.length) minBot = u0[0] + (nkind === "rows" ? theadHeight(nk) : 0);
          } else if (nkind === "lines") {
            var l0 = lineBoxes(nk);
            if (l0.length > 2) minBot = l0[1].bot;      /* 至少两行才算接住了标题 */
          }
          if (!fits(anch0, minBot, 0)) seal();
        }
        if (!fits(anch0, r.bottom, 0)) seal();
        put(bi, BLOCK_HTML[bi], anch0, 0, r.bottom);
        continue;
      }

      var ub = kind === "lines" ? null : unitBottoms(k, kind);
      var lb = kind === "lines" ? lineBoxes(k) : null;
      var flow = kind === "lines" ? textFlow(k) : null;
      var thead = kind === "rows" ? theadHeight(k) : 0;
      var total = kind === "rows" ? b.rows.length : kind === "items" ? b.items.length : flow.total;

      /* 结构对不上（嵌套表体 / 脏数据 / 拆出字符数为 0）：退回整块，宁可不拆也不错位 */
      var bad = (ub && ub.length !== total) || (kind === "lines" && (!lb.length || !total));
      if (bad) {
        if (!fits(anch0, r.bottom, 0)) seal();
        put(bi, BLOCK_HTML[bi], anch0, 0, r.bottom);
        continue;
      }

      function frag(from, to, cont) {
        if (from === 0 && to === total && !cont) return BLOCK_HTML[bi];
        if (kind === "rows") return biAttr(tableChunk(b, from, to, cont), bi);
        if (kind === "items") return biAttr(listChunk(b, from, to, cont), bi);
        return paraFrag(k, from, to, cont);
      }
      /* 本页尾部能吃下多少：返回头的结束边界与尾段起点；切不动返回 null */
      function headEnd(a, anch, line0, ovh0) {
        var lim = cur.length ? limit - drift : anch + avail;
        if (kind === "lines") {
          if (lb.length < 4) return null;                       /* 行太少不值得拆 */
          var li = -1;
          for (var q = line0; q < lb.length; q++) { if (lb[q].bot <= lim) li = q; else break; }
          if (li - line0 < 1 || lb.length - li - 1 < 2) return null;   /* 页首页尾都不留孤行 */
          var z = cutOffset(flow, lb[li + 1].top);
          return z > a && z < flow.total ? { z: z, top: lb[li + 1].top, line: li + 1, bot: lb[li].bot } : null;
        }
        var last = -1;
        for (var j = a; j < total - 1; j++) { if (ub[j] + ovh0 <= lim) last = j + 1; else break; }
        if (last > a) return { z: last, top: ub[last - 1], line: 0, bot: ub[last - 1] };
        return cur.length ? null : { z: a + 1, top: ub[a], line: 0, bot: ub[a] };  /* 空页至少推进一节 */
      }

      var a = 0, top0 = r.top, line0 = 0, ovh0 = 0, guard = 0;
      while (a < total && guard++ < 800) {
        /* 续节一律不带段前距（.p-cont / .md-tcont / .md-lcont 三条 CSS 已归零），
           首节要把它自己的 margin-top 算进页高。 */
        if (kind === "rows" && a > 0) ovh0 = thead + CAP_H;
        var anch = a > 0 ? top0 : anch0;
        var botAll = kind === "lines" ? r.bottom : ub[total - 1];
        if (fits(anch, botAll, ovh0)) { put(bi, frag(a, total, a > 0), anch, ovh0, botAll); a = total; break; }
        var cut = headEnd(a, anch, line0, ovh0);
        if (!cut) {
          /* 空页也切不动（整块比一页高）：整块硬放，最坏是该页内滚动 —— 仍比丢一整页空白好 */
          if (cur.length) { seal(); continue; }
          put(bi, frag(a, total, a > 0), anch, ovh0, botAll); a = total; break;
        }
        put(bi, frag(a, cut.z, a > 0), anch, ovh0, cut.bot);
        a = cut.z; top0 = cut.top; line0 = cut.line;
        seal();
      }
    }
    seal();
    if (!pages.length) { pages.push([]); htmls.push([]); }
    /* splits：被拆到跨页的结构单元数（同一 bi 出现在多页 = 拆了一刀）。
       拆得越多说明这一档越挤不住本书的整块结构，评分要计成本。 */
    var seen = {}, uniq = 0, ent = 0;
    for (var pi = 0; pi < pages.length; pi++) {
      ent += pages[pi].length;
      for (var pj = 0; pj < pages[pi].length; pj++) {
        if (!seen[pages[pi][pj]]) { seen[pages[pi][pj]] = 1; uniq++; }
      }
    }
    return { pages: pages, htmls: htmls, fills: fills, splits: ent - uniq };
  }

  /* 双栏分页（横向翻页 × 双栏）：每页定高、两栏自动填充。
     逐块试放，内容溢出两栏（scrollWidth 超宽）即回退该块并封页。 */
  function packCols(book, W, H) {
    var pages = [], cur = [], i = 0, guard = 0;
    function over(list) {
      var m = document.createElement("div");
      m.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;width:" + W + "px";
      m.innerHTML = '<div class="' + DOC_CLASS + ' pg-cols" style="height:' + H + 'px">' +
        list.map(function (n) { return BLOCK_HTML[n]; }).join("") + "</div>";
      book.appendChild(m);
      var md = m.firstChild;
      var bad = md.scrollWidth > md.clientWidth + 1;
      book.removeChild(m);
      return bad;
    }
    while (i < BLOCK_HTML.length && guard++ < 6000) {
      if (!BLOCK_HTML[i]) { i++; continue; }   /* 占位块不渲染：放进页里就是一页空白 */
      cur.push(i);
      if (over(cur)) {
        cur.pop();
        /* 放不下 ≠ 不要了：封当前页，让溢出那块从下一页重新试放（此前 i++ 直接跳过 = 正文丢块） */
        if (!cur.length) { pages.push([i]); i++; cur = []; continue; }
        pages.push(cur); cur = []; continue;
      }
      i++;
    }
    if (cur.length) pages.push(cur);
    if (!pages.length) pages.push([]);
    return pages;
  }

  function paginate() {
    var book = qs("#book");
    var W = book.clientWidth, H = book.clientHeight;
    if (!W || !H) return;

    /* 插图限高 = 这一页真正放正文的高度。用 vh 会算错：天幕带、顶栏、页脚、
       沉浸模式各吃掉一百多像素，图就会比可用页高出一截，整页撑出一条页内滚动。
       量具与实况同读 #doc 的内边距（同一套 CSS），所以两边量到的是同一个上限。 */
    var live = qs("#doc"), lcs = live && getComputedStyle(live);
    var ipad = (parseFloat(lcs && lcs.paddingTop) || 0) + (parseFloat(lcs && lcs.paddingBottom) || 0);
    book.style.setProperty("--ink-img-h", Math.max(120, H - ipad) + "px");

    var pages, htmls;
    if (read.twoCol) {
      /* 双栏靠 CSS column-fill 自动填满整栏，块级溢出由试放回退处理，另有其法 */
      pages = packCols(book, W, H);
      htmls = pages.map(function (idxs) { return idxs.map(function (i) { return BLOCK_HTML[i]; }); });
    } else {
      var meas = document.createElement("div");
      meas.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;width:" + W + "px";
      meas.innerHTML = '<div class="' + DOC_CLASS + '" id="measDoc">' + BLOCK_HTML.join("") + "</div>";
      book.appendChild(meas);
      var md = meas.querySelector("#measDoc");
      /* 量具必须带上 data-doc-theme：文体自适应的行高写在 .doc[data-doc-theme] 上，
         量具没这个属性就按用户值量、实况按文体值排，两者差一截 = 页底一条页内滚动。 */
      md.setAttribute("data-doc-theme", doc.theme || "plan");
      var cs = getComputedStyle(md);
      var padTop = parseFloat(cs.paddingTop) || 0;
      var padBottom = parseFloat(cs.paddingBottom) || 0;
      var pack = packSingle(md, padTop, H - padTop - padBottom);
      book.removeChild(meas);
      pages = pack.pages; htmls = pack.htmls;
    }

    state.pageIdx = pages;
    state.pages = htmls.map(function (hs) { return hs.join(""); });
  }

  /* ============================================================
     3. 渲染当前页 + 批注标记
     ============================================================ */
  function wrapFirst(root, needle, cls, noteId) {
    if (!needle) return false;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      if (node.parentNode && node.parentNode.classList && node.parentNode.classList.contains("hl")) continue;
      var i = node.nodeValue.indexOf(needle);
      if (i >= 0) {
        var after = node.splitText(i);
        var mid = after.splitText(needle.length);
        var span = document.createElement("span");
        span.className = cls;
        span.setAttribute("data-note", noteId || "");
        after.parentNode.replaceChild(span, after);
        span.appendChild(after);
        return true;
      }
    }
    return false;
  }

  function paintAnnotations() {
    var d = qs("#doc");
    /* 修改模式下不叠加批注装饰：正文此刻可编辑，标记 span 混在可编辑文本里会被顺手删掉，
       且「改过的文字」与「按原文定位的高亮」必然对不上 —— 退出修改后自动恢复。 */
    if (EDIT.on) return;
    state.notes.forEach(function (n) {
      if (n.kind === "highlight" || (n.kind === "note" && n.text)) {
        wrapFirst(d, n.text, "hl hl-" + (n.color || "accent"), n.id);
      }
    });
    renderNoteRefs(d);
  }

  /* 正文 → 标注：类型角标锚在「选中文本末尾之后」（v2.5 字符级锚定）。
     旧版只在锚点标题后挂一枚朱砂数字角标，说不出「是这句话的哪一处」；
     新版每条标注都按 text 在正文里定位（有 sp 时用前后文夹逼 —— 同一句重复出现也落得准），
     找不到才退到锚点元素末尾兜底。四类各有图标，同一处多条并排成组。 */
  var REF_ICON = { highlight: "highlighter", note: "notebook-pen", bookmark: "bookmark", margin: "pen-line" };

  /* 在 root 的文本里找 needle 的首次出现（跳过自己插的角标），返回 {node, i} */
  function findText(root, needle) {
    if (!needle) return null;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (w.nextNode()) {
      var nd = w.currentNode;
      if (nd.parentNode && nd.parentNode.closest && nd.parentNode.closest(".nref, .nref-group")) continue;
      var i = nd.nodeValue.indexOf(needle);
      if (i >= 0) return { node: nd, i: i };
    }
    return null;
  }

  /* node 之后（同一容器内）还有没有文字：用来判断命中点是否正好落在高亮 span 的末尾 */
  function textAfterIn(cont, node) {
    var w = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT, null), seen = false;
    while (w.nextNode()) {
      if (w.currentNode === node) { seen = true; continue; }
      if (seen && w.currentNode.nodeValue) return true;
    }
    return false;
  }

  /* 插入点在其容器纯文本中的偏移。角标是不含文字的按钮，插入后不影响既有偏移，
     故这个值可直接当「同一处」的判据：同处多条据此收进一个并排组。 */
  function insOffset(cont, before) {
    var off = 0;
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c === before) return true;
        if (c.nodeType === 3) off += c.nodeValue.length;
        else if (c.nodeType === 1 && walk(c)) return true;
      }
      return false;
    })(cont);
    return off;
  }

  function renderNoteRefs(d) {
    qsa(".nref, .nref-group, .note-ref", d).forEach(function (b) { b.remove(); });
    var groups = new Map();     /* 容器 → 偏移 → 该处已落的角标（第二枚起收编成组） */

    function drop(cont, before, btn) {
      var by = groups.get(cont);
      if (!by) { by = new Map(); groups.set(cont, by); }
      var off = insOffset(cont, before), got = by.get(off);
      /* 锚点必须仍在容器里才可作参照：同处两条时「先前那枚」会被挪进组，
         若它正好就是锚点，insertBefore 会因参照已易主而报错 —— 退化为整组收尾。 */
      var ref = function () { return before && before.parentNode === cont ? before : null; };
      if (!got) { by.set(off, { one: btn }); cont.insertBefore(btn, ref()); return; }
      if (got.one) {                      /* 同一处第二枚：建个并排组，先整组落位、再收编先前那枚 */
        var g = document.createElement("span");
        g.className = "nref-group";
        cont.insertBefore(g, ref());
        g.appendChild(got.one);
        got.group = g; got.one = null;
      }
      got.group.appendChild(btn);
    }

    state.notes.forEach(function (n) {
      if (!REF_ICON[n.kind]) return;
      var text = n.text || "";
      var sp = n.sp || {};

      /* ① 定位：sp 夹逼 → 纯文本，四档依次试，命中即停 */
      var hit = null, cut = 0, tries = [];
      if (text && sp.pre) tries.push([sp.pre + text + (sp.suf || ""), sp.pre.length]);
      if (text && sp.suf) tries.push([text + sp.suf, 0]);
      if (text && sp.pre) tries.push([sp.pre + text, sp.pre.length]);
      if (text) tries.push([text, 0]);
      for (var i = 0; i < tries.length && !hit; i++) {
        var f = findText(d, tries[i][0]);
        if (f) { hit = f; cut = f.i + tries[i][1] + text.length; }
      }

      /* ② 造角标：图标按类型，高亮描边随其颜色 */
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nref nref-" + n.kind;
      btn.dataset.note = n.id;
      if (n.kind === "highlight") btn.style.setProperty("--nref-c", COLOR_HEX[n.color] || COLOR_HEX.accent);
      /* 角标是空按钮 + 图标：读屏念不出「这是什么、点了会怎样」，名字得由 aria-label 给；
         title 只服务鼠标，留作摘录预览。 */
      btn.setAttribute("aria-label", "查看这条" + (KIND_LABEL[n.kind] || "标注"));
      btn.title = (KIND_LABEL[n.kind] || "标注") + "：" +
        (text ? text.slice(0, 30) + (text.length > 30 ? "…" : "") : "（无摘录）");
      btn.innerHTML = icon(REF_ICON[n.kind], 11);

      /* ③ 落位：找不到文本（随笔等摘录不在正文里）就挂到锚点元素末尾兜底 */
      if (!hit) {
        var host = n.anchor ? d.querySelector("#" + CSS.escape(n.anchor)) : null;
        if (host) host.appendChild(btn);
        return;
      }
      var after = hit.node.splitText(cut);          /* 文本一分为二，角标落在切点上 */
      var holder = after.parentNode;
      var span = holder && holder.closest ? holder.closest(".hl") : null;
      if (span && !textAfterIn(span, after)) drop(span.parentNode || holder, span.nextSibling, btn);
      else drop(holder, after, btn);
    });
  }

  /* 翻页五式：每种模式都是「旧页退场 → 换页 → 新页入场」三步。
     调校依据（调研 Kindle / Apple Books / 微信读书 / 掌阅 的翻页手感）：
     ① 不频闪 —— 覆盖式的旧页底衬必须留到新页完全盖住再撤；翻页全程不再叠墨屏反显
        （双脉冲式的反显叠在快翻上就是「频闪」，最伤眼）；
     ② 不顿挫 —— 退场 transition 时长由 JS 内联下发，与 setTimeout 切换时刻严格对齐，
        绝不半途截断；
     ③ 拟真 —— 退场用 ease-in（像被手推走），入场用强 ease-out（像落纸停稳）；
        覆盖式在压边留一道随行投影，卷页式绕书脊外旋并收窄。 */
  function flipPage(dir, mode, paint) {
    var book = qs("#book"), sheet = qs("#sheet");
    var next = dir > 0;
    var ghost = null;

    if (mode === "cover") {
      /* 覆盖：把旧页抄成底衬留在原位，新页自边缘盖上去。
         底衬里的 id / for 一律抹掉 —— 否则 #doc 会出现副本，qs("#doc") 抓到的是它。 */
      ghost = document.createElement("div");
      ghost.className = "page-ghost";
      ghost.innerHTML = sheet.innerHTML.replace(/\s(?:id|for)="[^"]*"/g, "");
      ghost.scrollTop = sheet.scrollTop;
      book.insertBefore(ghost, book.firstChild);
      sheet.style.transition = "none";
      sheet.style.transform = "translateX(" + (next ? "100%" : "-100%") + ")";
      void sheet.offsetWidth;
    }

    var OUT = { curl: next ? "turn-next" : "turn-prev", slide: next ? "slide-out-next" : "slide-out-prev", fade: "fade-out" };
    var IN = {
      curl: next ? "enter-next" : "enter-prev",
      slide: next ? "slide-in-next" : "slide-in-prev",
      fade: "fade-in",
      cover: next ? "cover-in-next" : "cover-in-prev"
    };
    /* 与 styles.css 的 transition / animation 时长一一对应，改一处必须改两处。
       时长取自主流阅读器实测带：单程 260–500ms，两段式合计 ≈700ms ——
       短于 300ms 会「闪」，长于 800ms 会「拖」。 */
    var outMs = { curl: 260, slide: 300, fade: 280 }[mode] || 0;
    var inMs = { curl: 480, slide: 440, fade: 400, cover: 500 }[mode] || 340;
    var outCls = OUT[mode], inCls = IN[mode];

    function enter() {
      if (outCls) sheet.classList.remove(outCls);
      /* 入场由 animation 驱动，这里禁掉过渡，免得两者叠加打架 */
      sheet.style.transition = "none";
      paint();
      sheet.classList.add(inCls);
      setTimeout(function () {
        sheet.classList.remove(inCls);
        sheet.style.transition = "";
        sheet.style.transform = "";
        /* 底衬留到这一刻才撤：早一帧撤，就会露出纸台底色 —— 那正是「频闪」的来源 */
        if (ghost) { ghost.remove(); ghost = null; }
      }, inMs);
    }

    if (outMs) {
      sheet.style.transition = "transform " + outMs + "ms cubic-bezier(.45,0,.75,.25), opacity " + outMs + "ms ease-in";
      void sheet.offsetWidth;
      sheet.classList.add(outCls);
      setTimeout(enter, outMs);
    } else enter();
  }

  function renderPage(dir, animate) {
    var sheet = qs("#sheet"), docEl = qs("#doc");
    var html = state.scroll ? BLOCK_HTML.join("") : (state.pages[state.cur] || "");
    var cls = docClass();
    /* 减少动效时一律直切；竖向浏览不做翻页过渡；其余按用户选择 */
    var mode = state.scroll ? "none" : (read.reduce ? "none" : (read.flip || "curl"));
    qs("#book").dataset.flip = mode;
    qs("#sheet").dataset.mode = state.scroll ? "scroll" : "paged";

    function paint() {
      docEl.className = cls;
      docEl.setAttribute("data-doc-theme", doc.theme || "plan");
      docEl.setAttribute("data-marks", read.marks ? "on" : "off");
      docEl.setAttribute("data-learn", read.learn ? "on" : "off");
      docEl.innerHTML = html;
      /* 页尾不留段后距：末块的 margin-bottom 会撑出页内滚动条（实测 15px），
         分页本该把多余的留白留在页底，而不是变成一条能拖动的缝。 */
      if (!state.scroll && docEl.lastElementChild) docEl.lastElementChild.classList.add("frag-last");
      paintAnnotations();
      syncTaskFlags();
      /* 模式层必须在 paint 之后重画：翻页动画会把 paint 推迟到 renderPage 尾部之后，
         而 paint 会重置 docEl 的 className 与 innerHTML，先跑的模式层会被抹掉
         （tr-on / tr-para / data-cat 一并丢失，表现为「翻页后段落对照消失」）。 */
      if (modesReady) InkModes.sync();
    }

    if (animate && dir && !state.scroll) {
      if (mode === "none") { paint(); InkFX.flash(); }
      else flipPage(dir, mode, paint);
    } else {
      paint();
    }

    paintProg();    qs("#flipHint").style.display = state.scroll ? "none" : "block";
    qs("#pgPrev").disabled = !state.scroll && state.cur === 0;
    qs("#pgNext").disabled = !state.scroll && state.cur >= state.pages.length - 1;
    var pct = state.scroll ? Math.round(scrollRatio() * 100)
      : Math.round(((state.cur + 1) / (state.pages.length || 1)) * 100);
    qs("#readBar").style.width = pct + "%";
    InkStore.setProgress(docId, pct);
    paintTocChrome();
    immSync();
    statBumpWords();     /* v2.7 统计埋点：翻页完成即量一次字数增量（只读位置，不碰渲染） */
    if (!AUTO.inTick) autoRetime();   /* v2.20：读者自己动了页就重新计时，自动翻页不退出也不暂停 */
  }

  /* 竖向浏览：按屏滚动 */
  function scrollByScreen(dir) {
    var sheet = qs("#sheet");
    sheet.scrollBy({ top: dir * Math.round(sheet.clientHeight * 0.86), behavior: "smooth" });
  }

  /* 天幕动效：只在交互那一刻播放一次（翻页 / 换章 / 进出沉浸），随后画面归位静止 */
  function scPulse(kind) { if (window.InkScene && InkScene.pulse) InkScene.pulse(kind); }

  function go(delta) {
    if (state.scroll) { scrollByScreen(delta); scPulse("flip"); return; }
    var next = state.cur + delta;
    if (next < 0 || next >= state.pages.length) { toast("已到" + (delta > 0 ? "末" : "首") + "页", "info"); return; }
    state.cur = next;
    scPulse("flip");
    renderPage(delta, true);
  }

  /* 当前阅读位置 → 全局字符偏移（跨模式锚定用） */
  function curOffset() {
    var sheet = qs("#sheet");
    if (state.scroll) {
      var kids = qs("#doc").children;
      if (!kids.length) return 0;
      var rect = sheet.getBoundingClientRect();
      /* DOM 顺序即阅读顺序：取第一个尚未滚出视口顶部的块 */
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].getBoundingClientRect().bottom > rect.top + 4) return BLOCK_OFF[biOf(kids[i], i)] || 0;
      }
      return BLOCK_OFF[BLOCK_OFF.length - 1] || 0;
    }
    var pi = (state.pageIdx[state.cur] || [])[0];
    return pi === undefined ? 0 : (BLOCK_OFF[pi] || 0);
  }

  /* 横向翻页：把偏移锚回所在页 */
  function restorePaged(off) {
    var bi = blockAt(off);
    for (var p = 0; p < state.pageIdx.length; p++) {
      if (state.pageIdx[p].indexOf(bi) >= 0) { state.cur = p; return; }
    }
  }

  /* 竖向浏览：把偏移锚回该块顶部（不回到章首） */
  function restoreScroll(off) {
    var el = biEl(blockAt(off));
    if (!el) return;
    var sheet = qs("#sheet");
    var d = el.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
    sheet.scrollTop = Math.max(0, sheet.scrollTop + d - 12);
  }

  function gotoAnchor(id) {
    scPulse("chapter");
    if (state.scroll) {
      var t = qs("#" + CSS.escape(id));
      if (t) t.scrollIntoView({ block: "start", behavior: read.reduce ? "auto" : "smooth" });
      return;
    }
    for (var i = 0; i < state.pages.length; i++) {
      if (state.pages[i].indexOf('id="' + id + '"') >= 0) { state.cur = i; renderPage(0, false); flashEl(id); return; }
    }
  }

  function flashEl(id) {
    var el = qs("#" + CSS.escape(id));
    if (el) { el.classList.add("flash"); setTimeout(function () { el.classList.remove("flash"); }, 1900); }
  }

  /* ============================================================
     4. 目录 · 检索 · 预览 · 跳转（v8 三区浮层）
     —— 上方「检索 / 跳转」，中间「章节或结果」，底部「可拖进度条」。
        预览一律先看后跳：气泡把要去的页码与首句说清楚，确认才移动。
     ============================================================ */
  var tocPanel = qs("#tocPanel"), tocPv = qs("#tocPv");
  var tocOpen = false;
  var findMode = "kw";      /* kw 关键词 / ai 模糊 */
  var findQuery = "";       /* 上次检索原文，供「更早 / 更晚」重排 */
  var findBase = [], findHits = [];
  var _measPages = null;    /* 竖向浏览下临时量出的分页（隐藏量具，不动实况 DOM） */

  /* ---------- 位置换算：两种模式都要能给出「第几页 / 百分之几」 ---------- */

  /* 竖向浏览下也要能按页码跳：临时量一次分页并缓存 */
  function measuredPages() {
    if (state.pageIdx.length) return state.pageIdx;
    if (_measPages) return _measPages;
    var book = qs("#book");
    var W = book.clientWidth, H = book.clientHeight;
    if (!W || !H) return [];
    var meas = document.createElement("div");
    meas.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;width:" + W + "px";
    meas.innerHTML = '<div class="' + DOC_CLASS + '" id="measDoc2">' + BLOCK_HTML.join("") + "</div>";
    book.appendChild(meas);
    var md = meas.querySelector("#measDoc2");
    md.setAttribute("data-doc-theme", doc.theme || "plan");   /* 与 paginate() 的量具同条件，见上 */
    var cs = getComputedStyle(md);
    var padTop = parseFloat(cs.paddingTop) || 0, padBottom = parseFloat(cs.paddingBottom) || 0;
    _measPages = packSingle(md, padTop, H - padTop - padBottom).pages;
    book.removeChild(meas);
    return _measPages;
  }

  /* ------------------------------------------------------------
     v2.19.3 C：一键推荐疏密 —— 把五档各试排一遍，按实测选档
     为什么本地实测是主角：好坏只取决于这本书在本机的真实块高、表行数与视口页高，
     而这些是可测量的；测出来的代价是「第几页剩几像素」，猜错的代价读者看得见。
     评分 cost = 页底空白率 + 0.5 × 跨页拆分率
       · 页底空白率：除末页外每页剩余高度的均值（末页空白是文章结尾，不是排版缺陷）
       · 跨页拆分率：被拆到跨页的结构单元数 / 块数（长段、长表、长列表各算一处）
     两档成本相差不到 1% 时保持读者当前档，不做「你以为你想要疏」的擅自改动。

     v2.25.1（#91）：云端判 + 本地实测双轨 —— 各自做各自最擅长的：
     本地试排出「这本书五档下的真实账」，已配模型时把账 + 内容特征一起交给主脑做文体取舍
     （严格 JSON {den, reason}，本地白名单校验）；未配 / 超时 / 非法一律静默退回本地。
     Key 仍只留本机、不进同步、不进仓库。报告写明走的哪条路 + 云端理由 + 本地账。
     ------------------------------------------------------------ */
  var DEN_TRIAL_CAP = 400;   /* 试排块数上限：长篇小说只取前 400 块，报告里明说是抽样 */

  function denTrial() {
    var book = qs("#book");
    var W = book.clientWidth, H = book.clientHeight;
    if (!W || !H || !BLOCK_HTML.length || state.scroll) return null;   /* 竖向浏览没有页底可言 */
    var html = BLOCK_HTML, n = blocks.length, sampled = 0;
    if (n > DEN_TRIAL_CAP) { html = BLOCK_HTML.slice(0, DEN_TRIAL_CAP); n = DEN_TRIAL_CAP; sampled = 1; }

    var meas = document.createElement("div");
    meas.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;width:" + W + "px";
    meas.innerHTML = '<div class="' + DOC_CLASS + '" id="measDen">' + html.join("") + "</div>";
    var md = meas.querySelector("#measDen");
    md.setAttribute("data-doc-theme", doc.theme || "plan");   /* 与 paginate() 的量具同条件 */
    book.appendChild(meas);
    var cs = getComputedStyle(md);
    var padTop = parseFloat(cs.paddingTop) || 0, padBottom = parseFloat(cs.paddingBottom) || 0;
    var avail = H - padTop - padBottom;
    /* 档位落地时会自动关掉「按内容自适应」（否则文体行高压过用户档），
       试排就在同一前提下量：临时把 data-auto 关掉，量完还原；整段同步执行，不会闪。 */
    var de = document.documentElement.dataset, autoWas = de.auto;
    de.auto = "off";
    var out = [];
    try {
      InkTheme.DEN_ORDER.forEach(function (k) {
        var p = InkTheme.DEN[k];
        md.style.setProperty("--doc-fs", p.fs + "px");
        md.style.setProperty("--doc-lh", p.lh);
        md.style.setProperty("--doc-para", p.para + "em");
        var pack = packSingle(md, padTop, avail);
        var nf = pack.fills.length, sum = 0;
        for (var q = 0; q < nf - 1; q++) sum += pack.fills[q];
        var blank = nf > 1 ? sum / (nf - 1) : (pack.fills[0] || 0);
        var rate = pack.splits / Math.max(1, n);
        out.push({ k: k, pages: nf, blank: blank, splitN: pack.splits, split: rate, cost: blank + rate * 0.5 });
      });
    } finally {
      de.auto = autoWas;
      book.removeChild(meas);
    }
    out.sampled = sampled;
    out.n = n;
    return out;
  }

  /* v2.25.1（#91）：云端那一半 —— 把五档实测表 + 内容特征交给主脑做文体取舍。
     严格 JSON + 本地白名单；未配 / 超时 / 非法一律返回 null，调用方静默退回本地。 */
  function denModelAsk(out) {
    if (!(window.API && API.hasModel && API.hasModel()) || !API.llm) return Promise.resolve(null);
    var types = {}, i, t;
    for (i = 0; i < blocks.length && i < 1500; i++) { t = blocks[i].type || "p"; types[t] = (types[t] || 0) + 1; }
    var sum = 0, cnt = 0;
    for (i = 0; i < BLOCK_TEXT.length && i < 1500; i++) { t = BLOCK_TEXT[i]; if (t) { sum += t.length; cnt++; } }
    var table = out.map(function (o) {
      return "- " + o.k + "（" + InkTheme.DEN_NAME[o.k] + "）：" + o.pages + " 页 · 页底空白率 " +
        Math.round(o.blank * 100) + "% · 跨页拆分 " + o.splitN + " 处 · 成本 " + (Math.round(o.cost * 1000) / 10);
    }).join("\n");
    var sys = "你是中文书刊的排版顾问。读者点「一键推荐疏密」时，你会拿到这本书在本机五档疏密下的实测排版表。"
      + "档位键从紧到疏：" + InkTheme.DEN_ORDER.join(" / ") + "。只可从这些键里选一个。"
      + "取舍原则：页底空白率越低越好、跨页拆分越少越好；两档成本差在 1% 内时取接近适中的一档；"
      + "再结合文体（对话密集偏紧凑、散文诗歌偏疏朗）。"
      + "严格输出一行 JSON，不要任何多余文字：{\"den\":\"档位键\",\"reason\":\"一句话中文理由（不超过 40 字）\"}";
    var usr = "《" + (doc.title || "未命名") + "》· 文体 " + (doc.type || "book") + " · 共 " + blocks.length +
      " 块（本次量了 " + out.n + (out.sampled ? "，抽样" : "") + "）· 块型分布 " + JSON.stringify(types) +
      " · 平均块长 " + (cnt ? Math.round(sum / cnt) : 0) + " 字\n实测表（成本 = 空白率 + 0.5×拆分率）：\n" + table;
    return API.llm(sys, usr, { temp: 0.2, maxTokens: 200, timeout: 15000 }).then(function (txt) {
      var m = String(txt || "").match(/\{[\s\S]*\}/);
      if (!m) return null;
      var j = null;
      try { j = JSON.parse(m[0]); } catch (e) { return null; }
      if (!j || InkTheme.DEN_ORDER.indexOf(j.den) < 0) return null;   /* 白名单：越界一律不认 */
      return { den: j.den, reason: String(j.reason || "").slice(0, 60) };
    }).catch(function () { return null; });
  }

  /* 给读者看的账：量了什么、按什么判、为什么是这一档，三句话全说清 */
  function denReportTxt(out, pick, curK, tie, path) {
    var pc = function (v) { return Math.round(v * 100) + "%"; };
    var each = out.map(function (o) { return InkTheme.DEN_NAME[o.k] + " " + pc(o.blank); }).join(" · ");
    var mode = (path && path.mode) || "local";
    var head = mode === "cloud" ? "云端建议采纳 · 理由：" + (path.reason || "—") + "。"
      : mode === "fallback" ? "云端未采纳（返回不合规或超时），按本地实测试排。"
      : "本地实测试排（未配置模型；在「主脑 · 模型配置」里填好后可让云端判）。";
    return head + (out.sampled ? "取本书前 " + out.n + " 块" : "全书 " + out.n + " 块") +
      "。页底空白率：" + each + "。" +
      "已用「" + InkTheme.DEN_NAME[pick.k] + "」：" + pick.pages + " 页 · 页底空白 " + pc(pick.blank) +
      " · 跨页拆分 " + pick.splitN + " 处" +
      (pick.k === curK ? "（与你原档一致，未改动）"
        : mode === "cloud" ? "（云端所判）"
        : tie ? "（与你的档并列，取接近适中的一档）" : "（成本最低）") +
      (mode === "cloud" && path.localBest && path.localBest !== pick.k
        ? "。本地成本最低的是「" + InkTheme.DEN_NAME[path.localBest] + "」，与云端所判不同档。" : "") +
      (mode === "cloud" ? "。档只改字号·行高·段距三值，栏宽与字体不动。"
        : "。档只改字号·行高·段距三值，栏宽与字体不动；同分 1% 以内不改你已有的设置。");
  }

  window.inkDenAI = async function () {
    var out = denTrial();
    if (!out) { toast("竖向浏览没有页底可量，切到横向翻页再试", "info"); return; }
    var curK = InkTheme.denKey(InkTheme.read());
    var min = Infinity;
    out.forEach(function (o) { if (o.cost < min) min = o.cost; });
    /* 并列（成本差 < 1%）里不选最疏的，选离「适中」最近的：几个档一样好时，
       默认档是读者最熟悉的观感，也不至于把字号悄悄推到 18px。 */
    var midI = InkTheme.DEN_ORDER.indexOf("mid"), localPick = null, pickGap = Infinity;
    out.forEach(function (o) {
      if (o.cost - min >= 0.01) return;
      var gap = Math.abs(InkTheme.DEN_ORDER.indexOf(o.k) - midI);
      if (gap < pickGap) { pickGap = gap; localPick = o; }
    });
    /* 当前档已在并列里 → 原地不动，不因一次点击就改掉读者的版面（本地路上生效） */
    var keep = null;
    out.forEach(function (o) { if (o.k === curK && o.cost - min < 0.01) keep = o; });
    if (keep) localPick = keep;

    /* 双轨：配了模型 → 云端在实测账上做文体取舍；未配 / 失败 → 本地实测（见 §文件头） */
    var hasModel = !!(window.API && API.hasModel && API.hasModel() && API.llm);
    var path = { mode: hasModel ? "fallback" : "nomodel" };
    var pick = localPick;
    if (hasModel) {
      toast("本地实测完成 · 正在请主脑判…", "sparkles");
      var cloud = await denModelAsk(out);
      var cloudPick = null;
      if (cloud) out.forEach(function (o) { if (o.k === cloud.den) cloudPick = o; });
      if (cloudPick) {
        pick = cloudPick;
        path = { mode: "cloud", reason: cloud.reason, localBest: localPick.k };
      }
    }
    if (pick.k !== curK) InkTheme.commit({ den: pick.k });
    InkTheme.setDenReport(denReportTxt(out, pick, curK, pick.cost > min + 1e-9, path));
    toast((path.mode === "cloud" ? "云端建议「" : "已按实测选「") + InkTheme.DEN_NAME[pick.k] + "」：" + pick.pages + " 页 · 页底空白 " +
      Math.round(pick.blank * 100) + "% · 拆分 " + pick.splitN + " 处", "sparkles");
  };

  /* 分页总数：竖排翻 state.pages，竖向浏览现量一次 —— 跳转与进度条都按它定位 */
  function totalPages() { return (state.pageIdx.length || measuredPages().length) || 1; }

  function pageOfBlock(bi) {
    var idx = state.pageIdx.length ? state.pageIdx : measuredPages();
    for (var p = 0; p < idx.length; p++) if (idx[p].indexOf(bi) >= 0) return p + 1;
    return null;
  }

  function pctOfBlock(bi) {
    var last = BLOCK_OFF[BLOCK_OFF.length - 1] || 1;
    return Math.max(0, Math.min(100, Math.round((BLOCK_OFF[bi] || 0) / last * 100)));
  }

  /* 位置标签：横向给页码，竖向给百分比（没有页码就不编一个出来） */
  function locLabel(bi) {
    if (state.scroll) return "通栏 " + pctOfBlock(bi) + "%";
    var p = pageOfBlock(bi);
    return p ? "第 " + p + " 页" : "通栏 " + pctOfBlock(bi) + "%";
  }

  function chapterOf(bi) {
    for (var i = Math.min(bi, blocks.length - 1); i >= 0; i--) {
      var t = blocks[i].type;
      if (t === "h1" || t === "h2" || t === "h3") return blocks[i].x || "";
    }
    return doc.title || "";
  }

  /* ---------- 检索索引：每块一条，带上所属章节与锚点 ---------- */
  var SEARCH_INDEX = (function () {
    var out = [], ch = "", chAnchor = "";
    blocks.forEach(function (b, i) {
      if (b.type === "h1" || b.type === "h2" || b.type === "h3") { ch = b.x || ""; chAnchor = b.id || "doc-top"; }
      var t = BLOCK_TEXT[i];
      if (!t) return;
      out.push({ bi: i, chapter: ch, anchor: chAnchor, text: t });
    });
    return out;
  })();

  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /* 关键词检索：整串命中，按命中次数排序 */
  function kwSearch(q) {
    var k = String(q || "").trim().toLowerCase();
    if (!k) return [];
    var out = [];
    SEARCH_INDEX.forEach(function (e) {
      var tl = e.text.toLowerCase(), from = 0, n = 0, first = -1, i;
      while ((i = tl.indexOf(k, from)) >= 0) {
        if (first < 0) first = i;
        n++; from = i + k.length;
        if (n > 80) break;
      }
      if (n) out.push({ bi: e.bi, chapter: e.chapter, anchor: e.anchor, text: e.text, at: first, term: q, hits: n, kind: "kw" });
    });
    out.sort(function (a, b) { return b.hits - a.hits || a.bi - b.bi; });
    return out;
  }

  /* 命中摘要：前后各留一段，命中词用 <mark> 高亮 */
  function snippet(text, term, at) {
    var k = String(term || "");
    var s = Math.max(0, at - 18), e = Math.min(text.length, at + k.length + 30);
    var mid = esc(text.slice(s, e));
    if (k) mid = mid.replace(new RegExp(escRe(esc(k)), "gi"), function (m) { return "<mark>" + m + "</mark>"; });
    return (s > 0 ? "…" : "") + mid + (e < text.length ? "…" : "");
  }

  /* ---------- 预览气泡 ---------- */
  var pvPin = false;

  /* 预览气泡定位：气泡一律待在目录面板「外侧」，绝不压住卡片上的预览 / 跳转按钮。
     桌面右侧面板 → 优先贴面板右侧；右侧放不下就翻到面板左侧；
     窄屏底部抽屉 → 翻到抽屉上方。垂直对齐锚点，四周各留 10px 夹在视口内。 */
  function positionPvFor(el) {
    var w = tocPv.offsetWidth || 262, h = tocPv.offsetHeight || 96;
    var pad = 10, gap = 12;
    var pr = tocPanel.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var r = el ? el.getBoundingClientRect() : null;
    var px, py;
    if (pr.left <= 2 && pr.right >= vw - 2) {            /* 底部抽屉：气泡落在抽屉上方 */
      px = r ? r.left : pad;
      py = pr.top - h - gap;
    } else {
      px = pr.right + gap;
      if (px + w > vw - pad) px = pr.left - w - gap;      /* 右侧放不下 → 翻到左侧 */
      py = r ? r.top - 4 : pad;
    }
    tocPv.style.left = Math.max(pad, Math.min(vw - w - pad, px)) + "px";
    tocPv.style.top = Math.max(pad, Math.min(vh - h - pad, py)) + "px";
  }

  function pvShow(html, el, pin) {
    pvPin = !!pin;
    tocPv.innerHTML = html;
    tocPv.dataset.on = "on";
    tocPv.setAttribute("aria-hidden", "false");
    if (el) positionPvFor(el);
  }

  function pvHide() { if (pvPin) return; tocPv.dataset.on = "off"; tocPv.setAttribute("aria-hidden", "true"); }
  function pvClear() { pvPin = false; pvHide(); }

  /* 章节标题的预览：标题 + 位置 + 紧接其后的首句 */
  function blockLead(bi) {
    for (var i = bi + 1; i < blocks.length && i < bi + 4; i++) {
      var t = blocks[i].type;
      if (t === "h1" || t === "h2" || t === "h3") break;
      if (BLOCK_TEXT[i]) return BLOCK_TEXT[i];
    }
    return BLOCK_TEXT[bi] || "";
  }

  function pvHtml(label, ch, body) {
    var cut = String(body || "").slice(0, 58);
    return '<div class="pv-pg">' + esc(label) + '</div><div class="pv-ch">' + esc(ch) + "</div>" +
      (cut ? '<p class="pv-sn">' + esc(cut) + (String(body || "").length > 58 ? "…" : "") + "</p>" : "");
  }

  function blockPreview(bi) {
    var b = blocks[bi] || {};
    var isHead = b.type === "h1" || b.type === "h2" || b.type === "h3";
    return pvHtml(locLabel(bi), isHead ? b.x : chapterOf(bi), isHead ? blockLead(bi) : BLOCK_TEXT[bi]);
  }

  /* ---------- 章节列表 ---------- */
  function renderToc() {
    var heads = [];
    blocks.forEach(function (b, i) { if (b.type === "h1" || b.type === "h2" || b.type === "h3") heads.push({ b: b, i: i }); });
    qs("#tocCount").textContent = heads.length + " 节";
    qs("#tocList").innerHTML = heads.map(function (o) {
      var lv = o.b.type === "h1" ? 1 : o.b.type === "h2" ? 2 : 3;
      var anchor = o.b.id || (o.b.type === "h1" ? "doc-top" : "");
      return '<button class="toc-item' + (lv === 3 ? " lv3" : "") + '" data-anchor="' + anchor + '" data-bi="' + o.i + '">' +
        '<span class="ti-x">' + esc(o.b.x) + '</span><em class="ti-pg" data-pg="' + o.i + '"></em></button>';
    }).join("");
    qsa("#tocList .toc-item").forEach(function (el) {
      var bi = +el.dataset.bi;
      el.addEventListener("click", function () { gotoBlock(bi); InkFX.ripple(el); });
      el.addEventListener("mouseenter", function () { pvShow(blockPreview(bi), el); });
      el.addEventListener("mouseleave", pvHide);
      el.addEventListener("focus", function () { pvShow(blockPreview(bi), el); });
      el.addEventListener("blur", pvHide);
    });
    paintTocPages();
  }

  /* 页码 / 百分比徽标：分页一变就得重刷 */
  function paintTocPages() {
    qsa("#tocList .ti-pg").forEach(function (em) {
      var bi = +em.dataset.pg;
      if (state.scroll) { em.textContent = pctOfBlock(bi) + "%"; return; }
      var p = pageOfBlock(bi);
      em.textContent = p ? "P" + p : "·";
    });
  }

  function markToc() {
    var items = qsa("#tocList .toc-item");
    if (!items.length) return;
    var sheet = qs("#sheet"), cur = null;
    if (state.scroll) {
      /* 竖向浏览：以视口上方 22% 处为基准线，取基准线之上最后一个标题为「当前章」 */
      var rect = sheet.getBoundingClientRect();
      var line = rect.top + Math.min(140, rect.height * 0.22);
      items.forEach(function (el) {
        var id = el.dataset.anchor; if (!id) return;
        var t = qs("#" + CSS.escape(id));
        if (t && t.getBoundingClientRect().top <= line) cur = el;
      });
    } else {
      items.forEach(function (el) {
        var id = el.dataset.anchor;
        if (id && sheet.querySelector("#" + CSS.escape(id))) cur = el;
      });
    }
    items.forEach(function (el) { el.classList.toggle("cur", el === cur); });
  }

  /* ---------- 底部进度条 + 跳转摘要 ---------- */
  function tocRatio() {
    if (state.scroll) return scrollRatio();
    return (state.cur + 1) / (state.pages.length || 1);
  }

  function tpPaint(r) {
    r = Math.max(0, Math.min(1, r));
    qs("#tpFill").style.width = (r * 100) + "%";
    qs("#tpKnob").style.left = (r * 100) + "%";
    qs("#tpTrack").setAttribute("aria-valuenow", String(Math.round(r * 100)));
  }

  function paintTocChrome() {
    if (!tocPanel || tocPanel.hidden) return;
    tpKb = null;                          /* 任何一次重绘都作废键盘的待定位置 */
    var r = tocRatio();
    tpPaint(r);
    var total = state.pages.length || 1;
    qs("#jumpMeta").textContent = state.scroll
      ? "竖向浏览 · 当前 " + Math.round(r * 100) + "%（也可输入页码）"
      : "共 " + total + " 页 · 当前第 " + (state.cur + 1) + " 页";
    qs("#tpLeft").textContent = state.scroll ? "通栏开始" : "第 1 页";
    qs("#tpRight").textContent = state.scroll ? "通栏结束" : "第 " + total + " 页";
    paintTocPages();
    markToc();
  }

  /* ---------- 开关 ---------- */
  function openToc() {
    if (!tocPanel || tocOpen) return;
    tocOpen = true;
    qs("#tpcDoc").textContent = doc.title || "";
    /* 先建窗再显形：落位没定就掀开，首帧会闪一下 CSS 里那条钉右的默认位 */
    panelWin("toc", { el: tocPanel, id: "toc", label: "目录", handle: ".tpc-head", bar: ".tpc-head",
      x: "#tpcClose", width: 344, wmin: 300, side: "right", shown: function () { return tocOpen; }, close: closeToc });
    tocPanel.hidden = false;
    void tocPanel.offsetWidth;            /* 强制回流，保证首帧就走过渡 */
    tocPanel.classList.add("on");
    pwApply("toc");
    tocPanel.setAttribute("aria-hidden", "false");
    qs("#tDir").setAttribute("aria-expanded", "true");
    qs("#tDir2").setAttribute("aria-expanded", "true");     /* 三入口同开合同步（v2.22 S5 修） */
    qs("#immToc").setAttribute("aria-expanded", "true");
    paintTocChrome();
    InkFX.flash();
  }

  function closeToc() {
    if (!tocPanel || !tocOpen) return;
    tocOpen = false;
    tocPanel.classList.remove("on");
    pwApply("toc");                       /* 状态位已翻：立刻撤掉这一侧的让位账 */
    tocPanel.setAttribute("aria-hidden", "true");
    qs("#tDir").setAttribute("aria-expanded", "false");
    qs("#tDir2").setAttribute("aria-expanded", "false");
    qs("#immToc").setAttribute("aria-expanded", "false");
    pvClear();
    setTimeout(function () { if (!tocOpen) tocPanel.hidden = true; }, 280);
  }

  function toggleToc() { if (tocOpen) closeToc(); else openToc(); }

  /* ---------- v2.23 W2 · 三块侧栏入窗（目录 / 任务 / 书签侧栏） ----------
     v2.19.6 曾按「看一眼就走的临时弹层」豁免这三块（理由见 modes.js:431 注释），
     本轮判据改成「所有侧栏一律可拆可合」，那道豁免作废（进方案 §W2 台账）。
     几何交 InkWin；开合仍由各自的 tocOpen / tOpen / #reader[data-side] 说话。
     shown 一律读**状态位**而不是 DOM：抽屉带 .34s 的 visibility 过渡，
     过渡中读到的计算样式还是旧值，会让停靠边的占用与释放两头都慢一拍
     （modes.js:471 那段「补一次 apply」的旧坑，这里从判据上绕开）。 */
  var PW = { toc: null, task: null, side: null };
  function panelWin(key, cfg) {
    if (!PW || !window.InkWin) return null;
    if (PW[key]) return PW[key];
    var boot = true;                      /* 补出厂停靠态那一次不算读者动作，别弹提示 */
    /* 最小宽度按「头部一行装得下 标题 + 四枚形态钮 + ✕」来定，不是拍脑袋的 232：
       目录/任务的头部是宿主自己的（既有标题又有一格说明），压到 232 就只能牺牲标题；
       书签侧栏的标题走 InkWin 自造细栏，那一条 .inkw-t 会自己省略号，232 够用。 */
    var wmin = cfg.wmin || 232;
    PW[key] = InkWin.create(cfg.el, {
      id: cfg.id, host: "#reader", handle: cfg.handle, bar: cfg.bar, x: cfg.x,
      title: cfg.label, min: { w: wmin, h: 300 },
      dock: { min: wmin, max: 560, width: cfg.width }, snap: 24,
      maxTop: nwMaxTop, narrow: nwNarrow, shown: cfg.shown, onClose: cfg.close,
      onState: function (l) {
        if (boot) return;
        if (l.state === "docked") toast(cfg.label + "已合并回" + (l.side === "right" ? "右" : "左") + "侧栏 · 拖标题栏可再拆出", "panel-right");
        else if (l.state === "max") toast(cfg.label + "已铺满正文区", "maximize-2");
      }
    });
    if (!InkWin.read()[cfg.id]) PW[key].setState("docked", { side: cfg.side });
    boot = false;
    return PW[key];
  }
  function pwApply(key) { var w = PW && PW[key]; if (w) w.apply(); }

  /* ---------- 跳转 ---------- */
  function gotoBlock(bi) {
    if (bi == null || !blocks[bi]) return;
    pvClear();
    var id = blocks[bi].id;
    if (id) { gotoAnchor(id); return; }
    scPulse("chapter");
    if (state.scroll) { restoreScroll(BLOCK_OFF[bi] || 0); return; }
    restorePaged(BLOCK_OFF[bi] || 0);
    renderPage(0, false);
  }

  /* 跳转输入解析：123 → 第 123 页；35% → 35% 位置；其余按章节名匹配，再退到正文检索 */
  function resolveJump(q) {
    var s = String(q || "").trim();
    if (!s) return null;
    var m = s.match(/^(\d+(?:\.\d+)?)\s*%$/);
    if (m) return { kind: "pct", pct: Math.max(0, Math.min(100, parseFloat(m[1]))) };
    m = s.match(/^p\.?\s*(\d+)$/i) || s.match(/^(\d+)\s*页?$/);
    if (m) return { kind: "page", page: Math.max(1, parseInt(m[1], 10)) };

    var heads = [];
    blocks.forEach(function (b, i) { if (b.type === "h1" || b.type === "h2" || b.type === "h3") heads.push({ b: b, i: i }); });
    var hit = heads.filter(function (o) { return String(o.b.x || "").indexOf(s) >= 0; })[0];
    if (!hit) {
      /* 允许省掉「一、」「1」这类前缀，用后段文字匹配 */
      var bare = function (x) { return String(x || "").replace(/^[一二三四五六七八九十百\d]+[、.．,，:：\s]*/, ""); };
      hit = heads.filter(function (o) { return s.length >= 2 && bare(o.b.x).indexOf(s) >= 0; })[0];
    }
    if (hit) return { kind: "block", bi: hit.i };
    var r = kwSearch(s);
    return r.length ? { kind: "block", bi: r[0].bi } : null;
  }

  /* 跳转目标 → 预览内容（输入框里边打边看） */
  function targetPreview(t) {
    if (!t) return null;
    if (t.kind === "block") return { bi: t.bi, label: locLabel(t.bi) };
    var total = totalPages();
    if (t.kind === "page") {
      var p = Math.max(0, Math.min(total - 1, t.page - 1));
      var idx = state.pageIdx.length ? state.pageIdx : measuredPages();
      var bi = ((idx[p] || [0])[0]);
      return { bi: bi, label: "第 " + (p + 1) + " 页" };
    }
    var last = BLOCK_OFF[BLOCK_OFF.length - 1] || 1;
    if (state.scroll) return { bi: blockAt(t.pct / 100 * last), label: "约 " + Math.round(t.pct) + "%" };
    var p2 = Math.max(0, Math.min(total - 1, Math.round(t.pct / 100 * total) - 1));
    return { bi: ((state.pageIdx[p2] || [0])[0]), label: "约 " + Math.round(t.pct) + "%" };
  }

  function jumpTo(t) {
    if (!t) { toast("没找到这个位置，试试页码、百分比或章节名", "search"); return false; }
    pvClear();
    if (t.kind === "block") { gotoBlock(t.bi); return true; }
    var total = totalPages();
    if (state.scroll) {
      var sheet = qs("#sheet");
      var max = sheet.scrollHeight - sheet.clientHeight;
      var r;
      if (t.kind === "pct") r = t.pct / 100;
      else {
        var mp = measuredPages();
        var i0 = Math.max(0, Math.min(mp.length - 1, t.page - 1));
        r = (BLOCK_OFF[((mp[i0] || [0])[0])] || 0) / (BLOCK_OFF[BLOCK_OFF.length - 1] || 1);
      }
      sheet.scrollTo({ top: Math.max(0, r * max), behavior: read.reduce ? "auto" : "smooth" });
      toast("已定位到 " + Math.round(r * 100) + "%", "book-open");
    } else {
      var i2 = t.kind === "pct" ? Math.round(t.pct / 100 * total) - 1 : t.page - 1;
      i2 = Math.max(0, Math.min(total - 1, i2));
      state.cur = i2;
      scPulse("chapter");
      renderPage(0, false);
      toast("已到第 " + (i2 + 1) + " 页", "book-open");
    }
    paintTocChrome();
    return true;
  }

  /* ---------- 检索：关键词 / AI 模糊 ---------- */
  function setFindMode(m) {
    findMode = m;
    qsa("#findModes .seg-btn").forEach(function (b) {
      var on = b.dataset.fmode === m;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    qs("#findInput").placeholder = m === "ai" ? "描述你记得的内容，例如「主角第一次看见海的段落」" : "检索正文…";
    qs("#findHint").textContent = m === "ai"
      ? "AI 模糊检索：用一句话描述你记得的内容，我来找最接近的段落，先预览再跳。"
      : "关键词检索：输入词或短句，命中处会高亮定位。";
  }

  function buildCorpus() {
    return SEARCH_INDEX.map(function (e) {
      return { bi: e.bi, anchor: e.anchor, chapter: e.chapter, text: e.text,
        page: pageOfBlock(e.bi), pct: pctOfBlock(e.bi) };
    });
  }

  function renderResults(mode, q, hits, meta, note) {
    qs("#frMode").textContent = mode === "ai" ? "AI 语义检索" : "关键词检索";
    qs("#frMeta").textContent = meta || "";
    qs("#frRefine").hidden = mode !== "ai" || hits.length < 2;
    var box = qs("#findResults");
    if (!hits.length) {
      box.innerHTML = '<div class="fr-empty">' + esc(note || "没有找到匹配内容，试试更短或更通用的关键词。") +
        (mode === "kw" ? '<br><button class="chip chip-btn" data-refine="toai">用 AI 模糊检索试试 ›</button>' : "") + "</div>";
    } else {
      box.innerHTML = hits.map(function (h, i) {
        return '<article class="fr-card" tabindex="0" data-bi="' + h.bi + '" data-i="' + i + '">' +
          '<div class="fr-top"><b class="fr-ch">' + esc(h.chapter || doc.title || "") + '</b><em class="fr-loc">' + esc(locLabel(h.bi)) + "</em></div>" +
          '<p class="fr-sn">' + snippet(h.text, h.term || q, h.at == null ? 0 : h.at) + "</p>" +
          (h.reason ? '<p class="fr-why">命中理由：' + esc(h.reason) + "</p>" : "") +
          '<div class="fr-act"><button class="chip chip-btn" data-pv="1">预览</button><button class="chip chip-btn" data-go="1">跳转 ›</button></div>' +
          "</article>";
      }).join("");
    }
    qs("#findWrap").hidden = false;
    qs("#tocSec").hidden = true;
    bindResultCards();
  }

  function bindResultCards() {
    qsa(".fr-card", qs("#findResults")).forEach(function (c) {
      var bi = +c.dataset.bi;
      c.addEventListener("mouseenter", function () { pvShow(blockPreview(bi), c); });
      c.addEventListener("mouseleave", pvHide);
      c.addEventListener("focus", function () { pvShow(blockPreview(bi), c); });
      c.addEventListener("blur", pvHide);
      c.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); gotoBlock(bi); } });
      c.addEventListener("click", function (e) {
        if (e.target.closest("[data-go]")) { gotoBlock(bi); return; }
        pvShow(blockPreview(bi), c, true);
      });
    });
  }

  function runFind(mode, q) {
    q = String(q || "").trim();
    if (!q) { clearFind(); return; }
    findMode = mode; findQuery = q;
    if (mode === "kw") {
      var hits = kwSearch(q);
      findBase = hits; findHits = hits;
      if (!hits.length) {
        renderResults("kw", q, [], "共 0 处",
          "没有找到「" + q + "」。试试更短或更通用的关键词，或改用 AI 模糊检索。");
        return;
      }
      var chN = {};
      hits.forEach(function (h) { chN[h.chapter] = 1; });
      renderResults("kw", q, hits, "共 " + hits.length + " 处 · 覆盖 " + Object.keys(chN).length + " 节");
      return;
    }
    /* AI 模式：主脑在线时由模型按描述语义重排；离线时退回本地字符加权。
       两条路都在，但**必须如实标出是哪一条** —— 检索结果的可信度取决于来源是否诚实。 */
    qs("#frMode").textContent = "AI 模糊检索";
    qs("#frMeta").textContent = "正在理解…";
    qs("#frRefine").hidden = true;
    qs("#findResults").innerHTML = '<div class="fr-empty">正在理解你的描述…</div>';
    qs("#findWrap").hidden = false;
    qs("#tocSec").hidden = true;
    API.aiSearch(q, buildCorpus()).then(function (res) {
      var d = (res && res.data) || {};
      findBase = d.hits || [];
      findHits = findBase.slice();
      var byModel = !d.local && API.hasModel && API.hasModel();
      var src = byModel ? ("主脑语义重排 · " + ((API.modelCfg() || {}).model || "")) : "本地字符匹配（未接模型）";
      renderResults("ai", q, findHits, "找到 " + (d.count || findHits.length) + " 处相关 · " + src, d.note);
    });
  }

  function clearFind() {
    findQuery = ""; findHits = []; findBase = [];
    qs("#findWrap").hidden = true;
    qs("#tocSec").hidden = false;
    qs("#findInput").value = "";
    qs("#frRefine").hidden = true;
    pvClear();
  }

  function refine(kind) {
    if (kind === "toai") { setFindMode("ai"); runFind("ai", qs("#findInput").value); return; }
    if (kind === "reword") { qs("#findInput").value = ""; qs("#findInput").focus(); return; }
    if ((kind === "earlier" || kind === "later") && findBase.length) {
      findHits = findBase.slice().sort(function (a, b) { return kind === "earlier" ? a.bi - b.bi : b.bi - a.bi; });
      renderResults(findMode, findQuery, findHits,
        "共 " + findHits.length + " 处 · 按位置" + (kind === "earlier" ? "由早到晚" : "由晚到早"));
    }
  }

  /* ---------- 进度条拖拽：拖动即预览，松手才跳 ---------- */
  function tpRatioAt(e) {
    var r = qs("#tpTrack").getBoundingClientRect();
    var x = (e.clientX == null ? 0 : e.clientX) - r.left;
    return Math.max(0, Math.min(1, x / Math.max(1, r.width)));
  }

  function tpPreview(r) {
    var tr = qs("#tpTrack").getBoundingClientRect();
    var total = totalPages(), bi, label;
    if (state.scroll) {
      bi = blockAt(r * (BLOCK_OFF[BLOCK_OFF.length - 1] || 0));
      label = "通栏 " + Math.round(r * 100) + "%";
    } else {
      var p = Math.max(0, Math.min(total - 1, Math.round(r * total) - 1));
      bi = ((state.pageIdx[p] || [0])[0]);
      label = "第 " + (p + 1) + " 页";
    }
    tocPv.innerHTML = pvHtml(label, chapterOf(bi), BLOCK_TEXT[bi]);
    tocPv.dataset.on = "on";
    tocPv.setAttribute("aria-hidden", "false");
    positionPvFor(qs("#tpTrack"));
  }

  function tpCommit(r) {
    pvClear();
    var total = totalPages();
    if (state.scroll) {
      var sheet = qs("#sheet");
      var max = sheet.scrollHeight - sheet.clientHeight;
      sheet.scrollTo({ top: Math.max(0, r * max), behavior: "auto" });
    } else {
      var p = Math.max(0, Math.min(total - 1, Math.round(r * total) - 1));
      state.cur = p;
      scPulse("chapter");
      renderPage(0, false);
    }
    paintTocChrome();
  }

  var tpDragOn = false;
  function tpDown(e) {
    tpDragOn = true;
    qs("#tpTrack").dataset.drag = "on";
    tpDragMove(e);
    e.preventDefault();
  }
  function tpDragMove(e) {
    if (!tpDragOn) return;
    var r = tpRatioAt(e);
    tpPaint(r);
    tpPreview(r);
  }
  function tpUp(e) {
    if (!tpDragOn) return;
    tpDragOn = false;
    qs("#tpTrack").dataset.drag = "off";
    tpCommit(tpRatioAt(e));
  }

  /* ---------- 目录浮层的交互接线 ----------
     入口同一状态：工具栏「目录」按钮 / 快捷键 C；Esc 或关闭按钮收起（与任务抽屉同规矩）。
     跳转一律「先看后跳」：预览气泡先把页码与首句说清楚，确认才移动，绝不静默跳转。 */
  var tpKb = null;                          /* 键盘待定的进度位置（未确认前不动正文） */

  qs("#tDir").addEventListener("click", function () { toggleToc(); InkFX.ripple(qs("#tDir")); });
  qs("#tpcClose").addEventListener("click", closeToc);

  qsa("#findModes .seg-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      setFindMode(b.dataset.fmode);
      if (findQuery) runFind(b.dataset.fmode, qs("#findInput").value);
    });
  });
  qs("#findGo").addEventListener("click", function () { runFind(findMode, qs("#findInput").value); });
  qs("#findInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); runFind(findMode, this.value); }
    else if (e.key === "Escape" && !e.__inkEscHandled) { e.preventDefault(); clearFind(); }
  });
  qs("#frClear").addEventListener("click", clearFind);
  qs("#frRefine").addEventListener("click", function (e) {
    var b = e.target.closest("[data-refine]");
    if (b) refine(b.dataset.refine);
  });
  qs("#findResults").addEventListener("click", function (e) {
    var b = e.target.closest("[data-refine]");
    if (b) refine(b.dataset.refine);
  });

  /* 跳转输入：边打边预览，Enter / 「前往」才移动 */
  function jumpPreview() {
    var el = qs("#jumpInput");
    var p = targetPreview(resolveJump(el.value));
    if (!p) { pvClear(); return; }
    pvShow(pvHtml(p.label, chapterOf(p.bi), BLOCK_TEXT[p.bi]), null, false);
    positionPvFor(el);
  }
  qs("#jumpInput").addEventListener("input", jumpPreview);
  qs("#jumpInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); jumpTo(resolveJump(this.value)); }
    else if (e.key === "Escape" && !e.__inkEscHandled) { e.preventDefault(); pvClear(); closeToc(); }
  });
  qs("#jumpGo").addEventListener("click", function () { jumpTo(resolveJump(qs("#jumpInput").value)); });

  /* 进度条：拖动即预览、松手才跳；键盘同样先预览、Enter 才确认 */
  var tpTrack = qs("#tpTrack");
  tpTrack.addEventListener("pointerdown", tpDown);
  window.addEventListener("pointermove", tpDragMove);
  window.addEventListener("pointerup", tpUp);
  tpTrack.addEventListener("keydown", function (e) {
    var r = tpKb == null ? tocRatio() : tpKb;
    var step = e.shiftKey ? 0.1 : 0.02;
    var next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(1, r + step);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, r - step);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 1;
    else if (e.key === "Enter") { e.preventDefault(); tpCommit(r); return; }
    else if (e.key === "Escape" && !e.__inkEscHandled) { e.preventDefault(); tpKb = null; tpPaint(tocRatio()); pvClear(); return; }
    else return;
    e.preventDefault();
    tpKb = next;
    tpPaint(next);
    tpPreview(next);
  });

  /* 窄屏底部抽屉：下滑收起（与任务抽屉同一手势） */
  (function () {
    var grip = qs("#tpcGrip"), y0 = null;
    grip.addEventListener("pointerdown", function (e) { y0 = e.clientY; });
    grip.addEventListener("pointerup", function (e) {
      if (y0 !== null && e.clientY - y0 > 46) closeToc();
      y0 = null;
    });
  })();

  function renderBookmarks() {
    var list = state.notes.filter(function (n) { return n.kind === "bookmark" || n.kind === "highlight"; });
    if (!list.length) { qs("#bmList").innerHTML = '<div class="card-note">还没有书签或高亮，选中正文即可添加。</div>'; return; }
    qs("#bmList").innerHTML = list.map(function (n) {
      return '<div class="bm-item" data-note="' + n.id + '">' + icon(n.kind === "bookmark" ? "bookmark" : "highlighter", 15) +
        "<span>" + esc((n.text || "书签").slice(0, 26)) + "</span><em>" + (n.page ? "P" + n.page : "") + "</em></div>";
    }).join("");
    qsa("#bmList .bm-item").forEach(function (el) {
      el.addEventListener("click", function () { focusNote(el.dataset.note); });
    });
  }

  /* ============================================================
     5. 批注面板
     ============================================================ */
  var COLOR_HEX = { accent: "var(--accent)", green: "var(--green)", amber: "var(--amber)", blue: "var(--blue)", ink: "var(--ink-3)" };
  var KIND_LABEL = { highlight: "高亮", note: "笔记", bookmark: "书签", margin: "随笔" };
  /* 颜色中文名：查重提示要说人话（「已有高亮（朱砂）」比「已有高亮（accent）」有用） */
  var COLOR_NAME = { accent: "朱砂", green: "绿", amber: "琥珀", blue: "蓝", ink: "墨" };

  /* ---------- 字符级锚定（v2.5）：选中文本前后各 12 字 ----------
     只取选区首尾所在文本节点的原话：同一句话在全文重复出现时，靠上下文才知道是哪一处。
     拿不到（跨元素 / 选区异常）就给空串 —— 旧笔记没有 sp 字段一样能渲染，绝不因它报错。 */
  var SP_N = 12;
  function selContext(range, head, tail) {
    var out = { pre: "", suf: "" };
    try {
      var sc = range.startContainer, ec = range.endContainer;
      /* head / tail 是选区两侧被 trim 掉的空白：补回去，sp 才与原文一字不差 */
      if (sc && sc.nodeType === 3) {
        var s = sc.nodeValue || "", e1 = range.startOffset + (head || 0);
        out.pre = s.slice(Math.max(0, e1 - SP_N), e1);
      }
      if (ec && ec.nodeType === 3) {
        var t = ec.nodeValue || "", e2 = range.endOffset - (tail || 0);
        out.suf = t.slice(Math.max(0, e2), e2 + SP_N);
      }
    } catch (e) { /* 取不到上下文不是错误：退回文本 + 锚点定位即可 */ }
    return out;
  }

  /* 防重复高亮（v2.5）：同一位置只留一条 —— 锚点 + 文本 + 上下文三者相同即判为同一处，
     颜色不同也算同一处（否则同一句反复点色会叠出多条重影高亮，删起来还得一条条认）。
     双方都有 sp 才比对 sp；任一方没有（旧数据 / 跨元素选区）则退到锚点 + 文本判重。 */
  function findSameHighlight(text, anchor, sp) {
    return state.notes.find(function (n) {
      if (n.kind !== "highlight" || n.anchor !== anchor || n.text !== text) return false;
      var a = n.sp || {}, b = sp || {};
      var hasA = !!(a.pre || a.suf), hasB = !!(b.pre || b.suf);
      if (hasA && hasB) return (a.pre || "") === (b.pre || "") && (a.suf || "") === (b.suf || "");
      return true;
    });
  }
  function dupHighlightToast(dup) {
    return "该位置已有高亮（" + (COLOR_NAME[dup.color] || "朱砂") + "）· 先到批注列表删除再重标";
  }

  function renderNotes() {
    var list = state.notes.filter(function (n) { return state.filter === "all" || n.kind === state.filter; });
    /* v2.14：批注数徽标常驻底栏（#noteCount2），顶栏旧徽标 #noteCount 已删 */
    var nc2 = qs("#noteCount2"); if (nc2) nc2.textContent = state.notes.length;
    qs("#notesSummary").textContent = "共 " + state.notes.length + " 条 · 本文";
    if (!list.length) { qs("#noteList").innerHTML = '<div class="empty">' + icon("notebook-pen", 28) + "<p>暂无批注<br>选中正文文字即可高亮或写笔记</p></div>"; return; }
    qs("#noteList").innerHTML = list.map(function (n) {
      var body = n.body ? MD.render(n.body) : "";
      return '<div class="note-card" data-note="' + n.id + '">' +
        '<div class="nc-head"><span class="dot" style="background:' + (COLOR_HEX[n.color] || COLOR_HEX.accent) + '"></span>' +
        (KIND_LABEL[n.kind] || "批注") + "<span class=\"spacer\"></span><span>" + esc(n.at || "") + "</span>" +
        '<button class="nc-del" data-del="' + n.id + '" aria-label="删除这条批注" title="删除">' + icon("trash-2", 14) + "</button></div>" +
        (n.text ? '<div class="nc-text">' + esc(n.text) + "</div>" : "") +
        (body ? '<div class="nc-body">' + body + "</div>" : "") +
        '<div class="nc-src">' + esc(doc.title) + " · 第 " + (n.page || 1) + " 页</div>" +
        "</div>";
    }).join("");
    qsa("#noteList .nc-del").forEach(function (b) {
      b.addEventListener("click", async function (e) {
        e.stopPropagation();
        await API.deleteNote(b.dataset.del);
        state.notes = state.notes.filter(function (n) { return n.id !== b.dataset.del; });
        renderNotes(); renderBookmarks(); renderPage(0, false);
        toast("批注已删除", "trash-2");
      });
    });
    qsa("#noteList .note-card").forEach(function (c) {
      c.addEventListener("click", function () {
        var n = state.notes.find(function (x) { return x.id === c.dataset.note; });
        if (n) gotoAnchor(n.anchor);
      });
    });
  }

  function focusNote(id) {
    var n = state.notes.find(function (x) { return x.id === id; });
    if (!n) return;
    qsa(".side-tab[data-ntab]").forEach(function (t) { t.classList.remove("active"); });
    qs('.side-tab[data-ntab="list"]').classList.add("active");
    qsa("[data-npanel]").forEach(function (p) { p.style.display = p.dataset.npanel === "list" ? "flex" : "none"; });
    var card = qs('#noteList .note-card[data-note="' + id + '"]');
    if (card) {
      qsa(".note-row, .note-card").forEach(function (c) { c.classList.remove("on"); });
      card.classList.add("on");
      card.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    gotoAnchor(n.anchor);
  }

  /* ---------- 选中工具条 ---------- */
  var selBar = qs("#selBar");
  function hideSel() { selBar.style.display = "none"; }

  document.addEventListener("mouseup", function (e) {
    if (EDIT.on) { hideSel(); return; }   /* 修改模式：选中即光标，不弹批注条 */
    if (selBar.contains(e.target)) return;
    /* 刚拖过批注浮窗：那一下的 mouseup 不算划选（拖动时已清空选区，这里再兜一道） */
    if (ndWin.justDragged(260)) { hideSel(); return; }
    setTimeout(function () {
      var sel = window.getSelection();
      var raw = sel ? String(sel) : "";
      var text = raw.trim();
      var docEl = qs("#doc");
      if (!text || text.length < 2 || !sel.rangeCount || !docEl.contains(sel.anchorNode)) { hideSel(); return; }
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      /* 头尾被 trim 掉的空白要补回去，sp 才与原文严丝合缝（v2.5 字符级锚定） */
      var head = raw.indexOf(text);
      if (head < 0) head = 0;
      var tail = raw.length - head - text.length;
      state.sel = {
        text: text, anchor: currentAnchor(range), page: state.cur + 1,
        sp: selContext(range, head, tail > 0 ? tail : 0)
      };
      selBar.style.display = "flex";
      /* 助手开着时划了新的一段，携带条要当场跟上 —— 它是「这一问带了什么」的唯一凭据，
         划完不换就成了一句读者无法核对的承诺（W1e 的「自动携带选中段」）。 */
      arPaintCtx();
      var w = selBar.offsetWidth || 220;
      selBar.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, rect.left + rect.width / 2 - w / 2)) + "px";
      selBar.style.top = Math.max(12, rect.top - 46) + "px";
    }, 0);
  });

  function currentAnchor(range) {
    var docEl = qs("#doc");
    var heads = [];
    qsa("#tocList .toc-item").forEach(function (b) { if (b.dataset.anchor) heads.push(b.dataset.anchor); });
    if (!heads.length) return (blocks[0] && blocks[0].id) || "doc-top";
    function hel(id) { return docEl ? docEl.querySelector("#" + CSS.escape(id)) : null; }
    /* ① 有选区 → 以选区起点为准，向前找最近的标题：笔记就该钉在选区那一节。 */
    if (range && docEl) {
      var n = range.startContainer;
      var startEl = n ? (n.nodeType === 1 ? n : n.parentElement) : null;
      if (startEl && docEl.contains(startEl)) {
        var best = "";
        heads.forEach(function (id) {
          var h = hel(id);
          if (!h) return;
          if (h === startEl || (h.compareDocumentPosition(startEl) & (Node.DOCUMENT_POSITION_PRECEDING | Node.DOCUMENT_POSITION_CONTAINS))) best = id;
        });
        if (best) return best;
      }
    }
    /* ② 无选区 → 取「视口上沿之上最近的一条标题」。
       旧实现是遍历 TOC 取最后一个在 DOM 里存在的 id：滚动模式下每条 block 都常驻
       DOM，于是永远落在最后一节，边滚动边记的笔记全部锚错位置。 */
    var line = (window.innerHeight || 0) * 0.34, byPos = "";
    heads.forEach(function (id) {
      var h = hel(id);
      if (h && h.getBoundingClientRect().top <= line) byPos = id;
    });
    return byPos || (blocks[0] && blocks[0].id) || "doc-top";
  }

  qsa(".sel-dot").forEach(function (d) {
    d.addEventListener("click", async function () {
      if (!state.sel) return;
      /* 防重复高亮（v2.5）：同一位置已有高亮就不再新建 —— 不创建、给提示、工具条留着，
         用户可以直接换个颜色再试（提示里会说明已有的是哪个颜色），不必重新划选。 */
      var dup = findSameHighlight(state.sel.text, state.sel.anchor, state.sel.sp);
      if (dup) { toast(dupHighlightToast(dup), "alert-triangle"); return; }
      var note = { docId: docId, kind: "highlight", color: d.dataset.color, text: state.sel.text, body: "", anchor: state.sel.anchor, page: state.sel.page, sp: state.sel.sp };
      await API.saveNote(note);
      state.notes.unshift(note);
      hideSel();
      renderNotes(); renderBookmarks(); renderPage(0, false);
      InkFX.flash();
      toast("已高亮 · " + KIND_LABEL.highlight + "（" + (COLOR_NAME[d.dataset.color] || d.dataset.color) + "）", "highlighter");
    });
  });

  qs("#selNote").addEventListener("click", function () {
    if (!state.sel) return;
    switchNoteTab("new");
    qs("#quoteRef").style.display = "block";
    qs("#quoteRef").innerHTML = icon("quote", 13) + " " + esc(state.sel.text.slice(0, 90));
    qs("#noteInput").focus();
    hideSel();
  });

  qs("#selMark").addEventListener("click", async function () {
    if (!state.sel) return;
    /* 书签存完整选区文本（旧版截 40 字）：角标要锚在「选中文本末尾之后」，
       截断的文本会让定位停在句中，宁可多存几十字也不让位置跑偏。 */
    var note = { docId: docId, kind: "bookmark", color: "ink", text: state.sel.text, body: "", anchor: state.sel.anchor, page: state.sel.page, sp: state.sel.sp };
    await API.saveNote(note);
    state.notes.unshift(note);
    hideSel(); renderNotes(); renderBookmarks();
    /* 书签不包正文（无需重排版），但角标要当场出现 —— 只重画装饰层，页不动 */
    if (!EDIT.on) renderNoteRefs(qs("#doc"));
    toast("已加书签", "bookmark");
  });

  qs("#selCopy").addEventListener("click", function () {
    if (!state.sel) return;
    if (navigator.clipboard) navigator.clipboard.writeText(state.sel.text).catch(function () {});
    hideSel();
    toast("已复制选中文字", "copy");
  });

  /* ============================================================
     6.4 阅读模式（v9）：内容类别自适应
     调研结论落地：
     ① 模式不是「开关」，而是「工具集」——书籍=随笔边注、文献=引用摘录+双向链接、
        学习=草稿纸+闪卡+任务出处、漫画=方向+分格引导；
     ② 公共功能（目录 / 排版 / 批注 / 任务 / 翻译）只此一份，不随模式重复；
     ③ 主脑按正文结构给出建议与依据，最终决定权在用户（可改判 / 可回到自动）；
     ④ 翻译是共享服务：划词浮层 + 段落对照，四类内容都能用。
     ============================================================ */
  var modesReady = false;

  function addNoteFromMode(n) {
    return API.saveNote(n).then(function () {
      state.notes.unshift(n);
      renderNotes(); renderBookmarks(); renderPage(0, false);
      InkFX.flash();
      return n;
    });
  }
  function dropNoteLocal(id) {
    var i = state.notes.findIndex(function (n) { return n.id === id; });
    if (i >= 0) state.notes.splice(i, 1);
    renderNotes(); renderBookmarks();
  }

  InkModes.init({
    doc: doc, blocks: blocks, figSVG: FIG, figFor: figSVG,
    read: function () { return read; },
    state: state,
    notes: function () { return state.notes; },
    patch: patch,
    toast: toast,
    addNote: addNoteFromMode,
    dropNote: dropNoteLocal,
    rerender: function () { renderPage(0, false); },
    currentAnchor: currentAnchor,
    gotoAnchor: gotoAnchor,
    focusNote: focusNote
  });
  modesReady = true;
  InkModes.sync();

  /* 划词翻译：选中条上的「译」 */
  qs("#selTrans").addEventListener("click", function () {
    if (!state.sel) return;
    var r = selBar.getBoundingClientRect();
    InkModes.translateSelection(state.sel.text, r.left + r.width / 2, r.bottom + 8);
    hideSel();
  });

  /* ============================================================
     6.5 辅助阅读：解析 / 溯源
     调研结论落地：
     ① 只对「读者自己选中」的文字作答 —— 不替读者猜他在看什么；
     ② 解析给结构（讲什么 / 关键点 / 术语），不给一坨泛泛而谈；
     ③ 溯源是「出处考证」，不是「回到这篇文章的哪一段」——
        读者选中一段文字，要问的是「它从哪来、谁先说、原话是什么」，
        而不是「它在本篇第几页」（后者是目录与检索的活）。
        溯源对象是一切事物 —— 事、物、人、时、地皆可溯其来源，不限于典故；
        事件、典故、节日、引文、术语、地名、风俗、人物……都只是举例，
        凡「它从哪来」皆可考。
        故卡片分三层：定性（类别 + 一句话）→ 考据（出处 / 原始表述 / 含义本末 / 沿用 / 参见）
        → 存疑（拿不准的明写「未详」，绝不编造）。
        本地算出的「在本文中的落点」降为附赠，垫在最下面，供回看上下文。
     ④ 浮层不遮正文版心，Esc / 点空白 / 翻页即收。
     ============================================================ */
  var auxCard = qs("#auxCard");
  var auxBody = qs("#auxBody");
  /* 收起时必须让窗重画一次：停靠态在 #reader 上挂着 data-dock-* 与 --dock-w-*，
     卡片一藏、那份让位就成了正文旁边一条关不掉的空栏（v2.18 在批注窗上踩过）。 */
  function hideAux() {
    auxCard.hidden = true;
    if (auxWin) auxWin.apply(false);
  }

  /* v2.23 W2 · 解析/溯源卡入 InkWin：可拖、可停靠（正文让位）、可铺满、位置尺寸记忆。
     旧行为是每次呼出都按选区重摆一次、尺寸按 CSS 固定 —— 它想看多久就看多久、
     想挪就挪不动，于是「读完这一段接着查下一段」时只能反复遮住正文。
     落点规则改成：**本机第一次用它**时才贴着选区放（第一次总得出现在眼前），
     之后位置归窗，由读者拖出来的那个位置说了算。 */
  var auxWin = window.InkWin && InkWin.create(auxCard, {
    id: "aux", host: "viewport", claim: "#reader", autoH: true,
    handle: "#auxHead", bar: "#auxHead", x: "#auxX",
    title: "辅助阅读", f: { w: 344, h: 300 },
    min: { w: 288, h: 168 }, dock: { min: 288, max: 560, width: 344 }, snap: 20,
    dockTop: window.InkTopBand,          /* 停靠别让全局顶栏被盖住（顶栏右端是窗口三颗钮） */
    shown: function () { return !auxCard.hidden; },
    onClose: hideAux
  });
  qs("#auxX").addEventListener("click", hideAux);

  /* 选区落在第几块：上下文包按它定「当前章」。
     页首块只作回退 —— 跨页选区、或一页里有多章时，用页首块会挑错章。 */
  function selBi() {
    try {
      var s = window.getSelection();
      if (!s || !s.rangeCount) return -1;
      var n = s.getRangeAt(0).startContainer;
      var el = n && (n.nodeType === 1 ? n : n.parentElement);
      var b = el && el.closest ? el.closest("#doc [data-bi]") : null;
      return b ? biOf(b, -1) : -1;
    } catch (e) { return -1; }
  }

  function auxCtx() {
    var s = state.sel || {};
    var idx = state.pageIdx.length ? state.pageIdx : measuredPages();
    var pbi = (idx[state.cur] && idx[state.cur].length) ? idx[state.cur][0] : -1;
    var bi = selBi() >= 0 ? selBi() : pbi;
    return {
      doc: doc, docId: doc.id, bi: bi >= 0 ? bi : null, anchor: s.anchor,
      chapter: bi >= 0 ? chapterOf(bi) : (doc.title || ""), page: s.page
    };
  }

  function showAux(html) {
    auxBody.innerHTML = html;
    auxCard.hidden = false;
    if (!auxWin) return;
    auxWin.open();
    /* 本机第一次用它：贴着选区放一次，之后位置归读者拖出来的那个 */
    if (!InkWin.read()["aux"]) auxAtSel();
  }

  function auxAtSel() {
    var r = selBar.getBoundingClientRect();
    var w = auxWin.state().f.w;
    var h = auxCard.offsetHeight || 240;
    var left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    var top = r.bottom + 10;
    if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 10);
    auxWin.place(left, top);
  }

  /* 头部是窗口的 chrome（徽标 / 标题 / 形态钮 / ✕），正文才是内容：
     两者分开重写，否则整张卡 innerHTML 一换，InkWin 注入的把手就没了。 */
  function auxHead(kind, label) {
    qs("#auxKind").textContent = kind;
    qs("#auxLabel").textContent = label;
    return "";
  }

  function renderExplain(d) {
    var terms = (d.terms || []).length
      ? '<div class="aux-terms">' + d.terms.map(function (t) {
          return '<span class="aux-term"><b>' + esc(t.w) + '</b><em>' + esc(t.mean) + "</em></span>";
        }).join("") + "</div>"
      : "";
    var items = (d.items || []).map(function (it) {
      return '<div class="aux-item"><span class="ai-k">' + esc(it.k) + '</span><span class="ai-v">' + esc(it.v) + "</span></div>";
    }).join("");
    showAux(auxHead("解析", d.unstructured ? "模型未按格式回复" : d.title) +
      '<p class="aux-lead">' + esc(d.lead) + "</p>" +
      items + terms +
      (d.unstructured ? auxRaw(d) + auxExits(false) : "") +
      (d.note ? '<p class="aux-note">' + icon("info", 12) + esc(d.note) + "</p>" : ""));
    bindAuxActs();
  }

  /* 溯源卡片：三层自上而下 —— 定性 / 考据 / 存疑；本地落点垫底作附赠。
     有考据时徽标显示「溯源 · 类别」（典故 / 节日 / 历史事件…），一眼知道考的是什么。 */
  function traceHits(d) {
    return (d.hits || []).map(function (h) {
      var tag = h.kind === "exact" ? "原句落点" : "最接近";
      return '<article class="aux-hit" data-bi="' + h.bi + '" tabindex="0">' +
        '<div class="ah-top"><b>' + esc(h.chapter || doc.title || "") + '</b><em>' + esc(locLabel(h.bi)) + "</em>" +
        '<span class="ah-tag' + (h.kind === "exact" ? " on" : "") + '">' + tag + "</span></div>" +
        '<p class="ah-sn">' + snippet(h.text, String(d.query || "").slice(0, 6), h.at == null ? 0 : h.at) + "</p>" +
        '<div class="ah-act"><button class="chip chip-btn" data-go="' + h.bi + '">跳转 ›</button></div>' +
        "</article>";
    }).join("");
  }

  function bindHits() {
    qsa(".aux-hit", auxCard).forEach(function (c) {
      c.addEventListener("click", function () { gotoBlock(+c.dataset.bi); hideAux(); });
      c.addEventListener("keydown", function (e) { if (e.key === "Enter") { gotoBlock(+c.dataset.bi); hideAux(); } });
    });
  }

  /* 「模型没守格式」不该是死路：原话如实给出，再配三条出口 —— 重试 / 换模型 / 只看本地落点。
     旧行为是一句「模型未返回可解析的结构」把模型说过的话全丢了，读者对着空卡片什么也做不了。 */
  function auxRaw(d) {
    return d.raw
      ? '<div class="tr-sec un-raw-sec"><span class="tr-h">模型原话 · 未结构化</span>' +
        '<p class="tr-p un-raw">' + esc(d.raw) + "</p></div>"
      : "";
  }
  function auxExits(withLocal) {
    return '<div class="aux-exits">' +
      '<button class="chip chip-btn" data-ax="retry">' + icon("refresh-cw", 12) + "重试</button>" +
      '<button class="chip chip-btn" data-ax="cfg">换模型 / 查配置</button>' +
      (withLocal ? '<button class="chip chip-btn" data-ax="local">只看本地落点</button>' : "") +
      "</div>";
  }
  function bindAuxActs() {
    qsa("[data-ax]", auxCard).forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.dataset.ax;
        if (k === "retry") { if (lastAux) runAux(lastAux.kind, lastAux.txt, lastAux.ctx); return; }
        if (k === "cfg") { location.href = "ai.html"; return; }
        var s = qs(".un-raw-sec", auxCard);
        if (s) s.remove();
        b.remove();
      });
    });
  }

  function renderTrace(d) {
    var has = !!(d.title || d.meaning || (d.facts || []).length);

    /* 回了话、没成结构：原话 + 三条出口 + 落点，一样给全 */
    if (d.unstructured) {
      showAux(auxHead("溯源", "模型未按格式回复") +
        '<p class="aux-lead">' + icon("info", 13) +
          "它确实回了话，只是没有按约定的字段返回 —— 内容没有丢，原话照抄在下面，" +
          "只是没能拆成「出处 · 年代 · 原始表述」的分栏卡片。</p>" +
        auxRaw(d) + auxExits((d.hits || []).length > 0) +
        ((d.hits || []).length
          ? '<div class="tr-sec"><span class="tr-h">在本文中的落点</span>' + traceHits(d) + "</div>"
          : "") +
        (d.note ? '<p class="aux-note">' + icon("info", 12) + esc(d.note) + "</p>" : ""));
      bindHits(); bindAuxActs();
      return;
    }

    /* 未接模型 / 考据失败：明说能力边界（并讲清溯源能考什么），落点照常给出 */
    if (!has) {
      showAux(auxHead("溯源", "未做考据") +
        '<p class="aux-lead">' + icon("info", 13) +
          "溯源考据的是一切事物的来处 —— 事件、典故、节日、引文、术语、地名、风俗……都只是举例，凡「它从哪来、谁先说、原话是什么」皆可考。</p>" +
        (d.note ? '<p class="aux-note">' + icon("info", 12) + esc(d.note) + "</p>" : "") +
        ((d.hits || []).length
          ? '<div class="tr-sec"><span class="tr-h">在本文中的落点</span>' + traceHits(d) + "</div>"
          : ""));
      bindHits();
      return;
    }

    var facts = (d.facts || []).map(function (f) {
      return '<div class="aux-item"><span class="ai-k">' + esc(f.k) + '</span><span class="ai-v">' + esc(f.v) + "</span></div>";
    }).join("");

    var origin = d.origin && (d.origin.quote || d.origin.note)
      ? '<div class="tr-sec"><span class="tr-h">原始表述</span>' +
          (d.origin.quote ? '<blockquote class="tr-quote">' + esc(d.origin.quote) + "</blockquote>" : "") +
          (d.origin.note ? '<p class="tr-qn">' + esc(d.origin.note) + "</p>" : "") +
        "</div>"
      : "";

    var meaning = d.meaning
      ? '<div class="tr-sec"><span class="tr-h">含义与本末</span><p class="tr-p">' + esc(d.meaning) + "</p></div>"
      : "";

    var related = (d.related || []).length
      ? '<div class="tr-sec"><span class="tr-h">后世沿用</span><div class="tr-chips">' +
          d.related.map(function (r) { return '<span class="tr-chip">' + esc(r) + "</span>"; }).join("") +
        "</div></div>"
      : "";

    var refs = (d.refs || []).length
      ? '<div class="tr-sec"><span class="tr-h">参见</span><div class="tr-refs">' +
          d.refs.map(function (r) {
            return r.u
              ? '<a class="tr-ref" href="' + esc(r.u) + '" target="_blank" rel="noopener noreferrer">' + esc(r.t) + "</a>"
              : '<span class="tr-ref off">' + esc(r.t) + "</span>";
          }).join("") +
        "</div></div>"
      : "";

    var meta = (d.cached ? "取自缓存" : "") +
      (d.engine ? (d.cached ? " · " : "") + "考据：" + d.engine : "") +
      (d.via === "fields" ? " · 部分字段未能分栏" : "") +
      (d.via === "repaired" ? " · 回复超长被截断，已在可续处补全" : "");
    var note = [meta, d.note].filter(Boolean).join(" · ");

    showAux(auxHead("溯源 · " + (d.kind || "出处"), d.title || d.query || "出处考证") +
      (d.lead ? '<p class="aux-lead">' + esc(d.lead) + "</p>" : "") +
      (facts ? '<div class="tr-facts">' + facts + "</div>" : "") +
      origin + meaning + related + refs +
      (d.doubt ? '<p class="tr-doubt">' + icon("info", 12) + esc(d.doubt) + "</p>" : "") +
      ((d.hits || []).length
        ? '<div class="tr-sec"><span class="tr-h">在本文中的落点</span>' + traceHits(d) + "</div>"
        : "") +
      (note ? '<p class="aux-note">' + icon("info", 12) + esc(note) + "</p>" : ""));
    bindHits();
  }

  /* 划词 AI 两问共用一条路：记下来料，「未结构化」卡上的重试才能原样再问一次。
     ctx 必须在 hideSel 之前取 —— 选区一清，selBi() 就退回页首块，章定位跟着错。 */
  var lastAux = null;

  async function runAux(kind, txt, ctx) {
    lastAux = { kind: kind, txt: txt, ctx: ctx };
    if (kind === "trace") {
      showAux(auxHead("溯源", "正在考据…") +
        '<p class="aux-lead">' + icon("loader-circle", 13) + " 正在追它的来处：出处 · 年代 · 原始表述…</p>");
      var rt = await API.aiTrace(txt, buildCorpus(), ctx);
      renderTrace(rt.data);
      return;
    }
    showAux(auxHead("解析", "正在读…") +
      '<p class="aux-lead">' + icon("loader-circle", 13) + " 正在解析这段…</p>");
    var re = await API.aiExplain(txt, ctx);
    renderExplain(re.data);
  }

  qs("#selExplain").addEventListener("click", function () {
    if (!state.sel) return;
    var txt = state.sel.text, ctx = auxCtx();
    hideSel();
    runAux("explain", txt, ctx);
  });

  qs("#selTrace").addEventListener("click", function () {
    if (!state.sel) return;
    var txt = state.sel.text, ctx = auxCtx();
    hideSel();
    runAux("trace", txt, ctx);
  });

  document.addEventListener("mousedown", function (e) {
    if (auxCard.hidden) return;
    if (auxCard.contains(e.target) || e.target.closest("#selExplain, #selTrace")) return;
    /* 停靠 / 铺满 = 读者明确要它常驻在一侧，点正文不该把它赶走；
       「点外即收」只在浮动态保留（原有的随手一放随手收的手感不变）。 */
    var m = auxWin && auxWin.mode();
    if (m === "docked-left" || m === "docked-right" || m === "maximized") return;
    hideAux();
  });
  /* 解析卡的 Escape 归层栈（dock.js）：它领了 onClose: hideAux，
     所以这里不再自建文档级链 —— 两条链并存时一次按键收两层。 */


  /* 更多菜单：低频入口收在一处（v2.14 换底部 sheet：hidden 之外再同步 .open 播放滑入/滑出，开关逻辑不变）；
     触发钮 v2.14 起常驻底栏（#tMore2），顶栏旧钮已并入更多 sheet */
  var morePop = qs("#morePop"), tMore = qs("#tMore2");
  function closeMore() {
    morePop.classList.remove("open");
    tMore.setAttribute("aria-expanded", "false");
    setTimeout(function () { if (!morePop.classList.contains("open")) morePop.hidden = true; }, 160);
  }
  tMore.addEventListener("click", function (e) {
    e.stopPropagation();
    if (morePop.hidden) {
      morePop.hidden = false;
      tMore.setAttribute("aria-expanded", "true");
      requestAnimationFrame(function () { requestAnimationFrame(function () { morePop.classList.add("open"); }); });
    } else {
      closeMore();
    }
  });
  /* 翻译三态（关闭 / 段落对照 / 悬停译）收在「更多」里，选完不关菜单，
     便于当场对比两种译法的差别；划词翻译不受此开关影响。 */
  function paintTransSeg() {
    var cur = (InkTheme.read() || {}).trans || "off";
    qsa("#transSeg [data-tr]").forEach(function (b) { b.classList.toggle("on", b.dataset.tr === cur); });
  }
  morePop.addEventListener("click", function (e) {
    var tr = e.target.closest("[data-tr]");
    if (tr) { InkModes.setTrans(tr.dataset.tr); paintTransSeg(); return; }
    var item = e.target.closest(".more-item");
    if (!item) return;
    closeMore();
    if (item.dataset.more === "mode") InkModes.openPicker();
  });
  paintTransSeg();
  document.addEventListener("click", function (e) {
    if (!morePop.hidden && !morePop.contains(e.target) && !tMore.contains(e.target)) closeMore();
  });

  /* ---------- 出纸：导出 / 打印（v2.21 §3.8） ----------
     两条出路共用同一张 print.html —— 版式只有一处定义，导出的文件与打出来的纸不会两个样。
     出什么纸也不在这里选：纸面视图那张纸自带选择器，也自己记住偏好（inkread.paper.v1）；
     阅读页只把「是哪一本」递过去，搬运偏好是为了让两个入口落在同一档纸上。 */
  (function () {
    var DESK = !!(window.inkread && window.inkread.desktop);
    var expBtn = qs("#tExport"), printBtn = qs("#tPrint");
    /* 桌面有 printToPDF，出来的是真 PDF；浏览器 / 局域网手机没有那个引擎，
       这条出路实际给的是同源附件端点下发的离线 HTML（能离线打开、能直接打印）。
       文案按能力改写 —— 不拿「导出 PDF」骗人点下去再解释。 */
    if (!DESK) {
      qs("#tExport .mi-k").textContent = "存为文件";
      qs("#expHint").textContent = "离线 HTML · 可打印";
      expBtn.title = "这台设备没有 PDF 引擎，改为下载可离线打开、可直接打印的 HTML 文件";
      qs("#printHint").textContent = "打开纸面视图";
      printBtn.title = "先在纸面视图里核对版式，系统打印面板由那张纸自己的「打印」钮开";
    }
    /* 纸型偏好住在纸面视图那个页面的域里，这里只做搬运，不另立一份设置。 */
    function paperQuery(withBook) {
      var p = null;
      try { p = JSON.parse(localStorage.getItem("inkread.paper.v1") || "null"); } catch (e) {}
      p = (p && typeof p === "object") ? p : {};
      var sp = new URLSearchParams();
      if (withBook && doc.bookId) sp.set("book", String(doc.bookId));
      if (p.paper) sp.set("paper", String(p.paper));
      if (p.land) sp.set("land", "1");
      if (p.chap === false) sp.set("chap", "0");
      return sp.toString();
    }
    function busy(on) {
      expBtn.classList.toggle("is-off", !!on);
      expBtn.setAttribute("aria-busy", on ? "true" : "false");
    }
    expBtn.addEventListener("click", function () {
      if (expBtn.classList.contains("is-off")) return;
      if (!DESK) {
        /* 同源附件（Content-Disposition: attachment）：浏览器自己接管下载，页面不跳走。
           不用 Blob + a[download] —— 那要先把这个文件整份读进内存，手机上大书会卡住。 */
        var s = paperQuery(true);
        var a = document.createElement("a");
        a.href = "/api/export/" + encodeURIComponent(docId) + ".html" + (s ? "?" + s : "");
        a.rel = "noopener";
        document.body.appendChild(a); a.click(); a.remove();
        toast("已请求下载，浏览器里没有 PDF 引擎", "download");
        return;
      }
      /* 排版要几秒：先把钮按住（连点只会在主进程里排队等同一张纸），并把「正在做」说出来 */
      busy(true);
      toast("正在排版《" + (doc.title || "这本书") + "》…", "printer");
      window.inkread.paper.toPdf({ doc: docId }).then(function (r) {
        busy(false);
        if (r && r.ok) {
          var name = String(r.path || "").split(/[\\/]/).pop();
          toast("已导出 " + (name || "PDF"), "download");
        } else if (r && r.busy) {
          toast(r.error || "已有一个导出在进行，等它结束。", "x");
        } else if (!r || !r.canceled) {
          /* 取消是用户自己按的，不吭声；其余都要说清楚为什么没出文件 */
          toast((r && r.error) || "导出没能完成", "x");
        }
      }, function (e) {
        busy(false);
        toast("导出没能完成：" + String((e && e.message) || e), "x");
      });
    });
    printBtn.addEventListener("click", function () {
      if (DESK) {
        window.inkread.paper.print({ doc: docId }).then(function (r) {
          if (r && (r.ok || r.canceled)) return;   /* 预览窗开了 / 用户自己关掉了：不吭声 */
          toast((r && r.error) || "打印没能开始", "x");
        }, function (e) { toast("打印没能开始：" + String((e && e.message) || e), "x"); });
        return;
      }
      /* 浏览器 / 手机：先看纸面视图，再按那张纸自己的「打印」——
         直接 window.print() 打的是阅读页那把被分页切过的舞台，纸上会是一片空白。 */
      var s2 = paperQuery(false);
      var w = window.open("print.html?doc=" + encodeURIComponent(docId) + (s2 ? "&" + s2 : ""), "_blank");
      if (!w) toast("浏览器拦住了新窗口：允许弹出窗口后再点一次打印", "x");
    });
  })();

  /* ---------- v2.14 阅读底栏：六钮转发原有入口（原 id 全保留，只换容器） ---------- */
  function fwd(from, to) {
    var a = qs(from), b = qs(to);
    if (a && b) a.addEventListener("click", function () { b.click(); });
  }
  fwd("#tDir2", "#tDir");
  fwd("#tSpeak2", "#tSpeak");
  /* 沉浸底栏的「听书」同样转发；「自动翻页」直接调 autoToggle（它要的是开/关两态，
     转发到 #tAuto 只能在开的方向上有效）。开合状态由 autoPaint 同步到按钮上。 */
  fwd("#immSpeak", "#tSpeak");
  /* 顶栏书签钮：打开覆盖侧栏并切到「书签」页（与更多里 #tSide 同一面板） */
  qs("#tBookmark").addEventListener("click", function () {
    setSide(true);
    qsa(".side-tab[data-stab]").forEach(function (x) { x.classList.toggle("active", x.dataset.stab === "bm"); });
    qsa("[data-spanel]").forEach(function (p) { p.style.display = p.dataset.spanel === "bm" ? "block" : "none"; });
    InkFX.ripple(qs("#tBookmark"));
  });

  /* 底栏进度滑条：拖动即跳 —— 通栏滚 scrollTop，翻页跳页码；显示由 paintProg 回写 */
  qs("#progRange").addEventListener("input", function () {
    var v = +this.value;
    this.style.setProperty("--fill", v + "%");
    qs("#dockPct").textContent = v + "%";
    if (state.scroll) {
      var sheet = qs("#sheet");
      sheet.scrollTop = v / 100 * (sheet.scrollHeight - sheet.clientHeight);
    } else if (state.pages.length) {
      state.cur = Math.min(state.pages.length - 1, Math.round(v / 100 * (state.pages.length - 1)));
      renderPage(0, false);
    }
  });

  /* 浮层点外收起：模式弹层 / 翻译浮层（触发按钮自身不算「外」） */
  function isModeTrigger(t) {
    return !!(t.closest && (t.closest("#modeStrip") || t.closest("#immMode") || t.closest('[data-more="mode"]')));
  }
  document.addEventListener("click", function (e) {
    var mp = qs("#modePop");
    if (mp && !mp.hidden && !mp.contains(e.target) && !isModeTrigger(e.target)) InkModes.closePop();
    var tp = qs("#trPop");
    /* 与解析卡同规则：浮着才「点外即收」，停靠 / 铺满 = 读者要它常驻，点正文不该赶走 */
    var tms = (tp && tp.dataset.inwState) || "floating";
    if (tp && !tp.hidden && tms === "floating" && !tp.contains(e.target) &&
        !(e.target.closest && e.target.closest("#selTrans"))) tp.hidden = true;
  });

  /* 沉浸态补入口：全屏里也要能呼出目录与切模式（用户明确要求） */
  qs("#immToc").addEventListener("click", function () { toggleToc(); });
  qs("#immMode").addEventListener("click", function () { InkModes.openPicker(); });

  /* ---------- 写笔记 ---------- */
  function switchNoteTab(tab) {
    qsa(".side-tab[data-ntab]").forEach(function (t) { t.classList.toggle("active", t.dataset.ntab === tab); });
    qsa("[data-npanel]").forEach(function (p) { p.style.display = p.dataset.npanel === tab ? "flex" : "none"; });
    /* v2.5：浮窗按页签让位（「完整笔记」整块交给 iframe），首次切到时才懒加载它 */
    if (nwEl) { nwEl.dataset.tab = tab; if (tab === "embed") ensureEmbed(); }
  }
  qsa(".side-tab[data-ntab]").forEach(function (t) {
    t.addEventListener("click", function () { switchNoteTab(t.dataset.ntab); });
  });

  qsa("[data-md]").forEach(function (b) {
    b.addEventListener("click", function () {
      var ta = qs("#noteInput"), mk = b.dataset.md;
      var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
      var sel = v.slice(s, e) || "内容";
      var ins;
      if (mk === "$$") ins = "\n$$\n" + sel + "\n$$\n";
      else if (mk === "`") ins = "`" + sel + "`";
      else if (mk === "## " || mk === "- " || mk === "> ") ins = mk + sel;
      else ins = mk + sel + mk;
      ta.value = v.slice(0, s) + ins + v.slice(e);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + ins.length;
      syncPreview();
    });
  });

  function syncPreview() {
    var pv = qs("#notePreview");
    if (pv.style.display === "none") return;
    pv.innerHTML = MD.render(qs("#noteInput").value) || '<span class="card-note">预览区（空）</span>';
  }
  qs("#noteInput").addEventListener("input", syncPreview);
  qs("#mdPreview").addEventListener("click", function () {
    var pv = qs("#notePreview"), ta = qs("#noteInput");
    var show = pv.style.display === "none";
    pv.style.display = show ? "block" : "none";
    ta.style.display = show ? "none" : "block";
    if (show) syncPreview();
  });

  qs("#noteClear").addEventListener("click", function () {
    qs("#noteInput").value = "";
    qs("#quoteRef").style.display = "none";
    syncPreview();
  });

  /* 快速笔记的类型与颜色（体验排查 P3：沉浸态与普通态同权）——
     与划选工具条同一套色（蓝/绿/琥珀/朱砂），保存时随批注落库。
     v17：面板与全屏写作浮层共用这一份状态，任一处点选、两处同亮。 */
  var quickKind = "note", quickColor = "blue";
  function paintQuickMeta() {
    qsa("#noteMetaRow [data-nkind], #noteImKinds [data-nkind]").forEach(function (x) {
      x.classList.toggle("on", x.dataset.nkind === quickKind);
    });
    qsa("#noteMetaRow .sel-dot, #noteImDots .nim-dot").forEach(function (x) {
      x.classList.toggle("on", x.dataset.color === quickColor);
    });
  }
  qsa("#noteMetaRow [data-nkind], #noteImKinds [data-nkind]").forEach(function (b) {
    b.addEventListener("click", function () { quickKind = b.dataset.nkind; paintQuickMeta(); });
  });
  qsa("#noteMetaRow .sel-dot, #noteImDots .nim-dot").forEach(function (d) {
    d.addEventListener("click", function () { quickColor = d.dataset.color; paintQuickMeta(); });
  });
  qs("#noteSave").addEventListener("click", async function () {
    var v = qs("#noteInput").value.trim();
    if (!v) { toast("先写点内容吧", "alert-triangle"); return; }
    /* 引用条开着才算「挂在选中文字上」：此时带上下文（sp）落库，正文角标才落得准 */
    var onSel = !!(state.sel && qs("#quoteRef").style.display === "block");
    /* 挂在选区上时沿用选区建立那一刻算好的 anchor（那时 Range 还在，定位最准）；
       重新调用 currentAnchor() 会退化成「按当前视口」，选区可能早已滚出屏幕。 */
    var noteAnchor = (onSel && state.sel.anchor) ? state.sel.anchor : currentAnchor();
    /* 同一条链路也要防重复高亮：这里存「高亮 + 引用」时同样会压出一条重影高亮 */
    if (onSel && quickKind === "highlight") {
      var dup = findSameHighlight(state.sel.text, noteAnchor, state.sel.sp);
      if (dup) { toast(dupHighlightToast(dup), "alert-triangle"); return; }
    }
    var b = qs("#noteSave"); b.disabled = true;
    var note = {
      docId: docId, kind: quickKind, color: quickColor,
      text: onSel ? state.sel.text : "",
      body: v, anchor: noteAnchor, page: state.cur + 1,
      sp: onSel ? state.sel.sp : null
    };
    await API.saveNote(note);
    state.notes.unshift(note);
    b.disabled = false;
    qs("#noteInput").value = ""; qs("#quoteRef").style.display = "none"; syncPreview();
    InkFX.flash();
    renderNotes(); renderBookmarks(); renderPage(0, false);
    switchNoteTab("list");
    toast("批注已保存 · 双端已同步", "circle-check");
  });

  /* ---------- 写笔记 · 字号三档（v17）：15 / 17 / 20px，默认「中」17px ----------
     字号落在根上的 --note-fs，面板 #noteInput 与全屏 #noteImText 同一份值；
     档位记在本机（inkread.notefs.v1），打开阅读页即应用。 */
  var NOTE_FS_KEY = "inkread.notefs.v1", NOTE_FS_ALL = [15, 17, 20], NOTE_FS_DEF = 17;
  function noteFsRead() {
    var v = 0;
    try { v = parseInt(localStorage.getItem(NOTE_FS_KEY), 10) || 0; } catch (e) {}
    return NOTE_FS_ALL.indexOf(v) >= 0 ? v : NOTE_FS_DEF;
  }
  function noteFsPaint(v) {
    document.documentElement.style.setProperty("--note-fs", v + "px");
    qsa("#noteFsSeg [data-nfs], #noteImFs [data-nfs]").forEach(function (b) {
      b.classList.toggle("on", Number(b.dataset.nfs) === v);
    });
  }
  qsa("#noteFsSeg [data-nfs], #noteImFs [data-nfs]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = Number(b.dataset.nfs);
      noteFsPaint(v);
      try { localStorage.setItem(NOTE_FS_KEY, String(v)); } catch (e) {}
    });
  });
  noteFsPaint(noteFsRead());

  /* ---------- 写笔记 · 全屏写作浮层（v17）----------
     与面板原有链路零冲突的做法：只读写 #noteInput 的 value ——
       · 打开：面板内容带进 #noteImText（引用条、类型、色点同步一份）；
       · 书写：#noteImText 实时镜像回 #noteInput（原预览 / 保存逻辑一行都不用改）；
       · 退出（Esc / 退出 / 保存并退出）：再写回一次，内容绝不丢。
     保存并退出直接点 #noteSave：校验 → API.saveNote → renderNotes 全走原逻辑。 */
  var nimEl = qs("#noteImmersive"), nimTa = qs("#noteImText"), nimFrom = null;

  function nimOpen() { return !nimEl.hidden; }
  function nimCount() {
    var v = nimTa.value, n = v.replace(/\s/g, "").length;
    qs("#noteImCount").textContent = "共 " + n + " 字" + (v ? " · " + v.split("\n").length + " 行" : "");
  }
  function nimQuote() {
    var q = qs("#quoteRef"), box = qs("#noteImQuote");
    var on = q.style.display === "block" && !!q.textContent.trim();
    box.innerHTML = on ? q.innerHTML : "";
    box.hidden = !on;
  }
  function nimMirror() {          /* 全屏 → 面板（实时，单向即可：浮层全覆盖，面板此刻改不了） */
    qs("#noteInput").value = nimTa.value;
    syncPreview();
    nimCount();
  }
  function nimFocusBack() {
    var b = qs("#noteFull");
    if (b && b.offsetParent) b.focus();
    else if (nimFrom && nimFrom.focus) nimFrom.focus();
  }
  function openNoteIm() {
    nimFrom = document.activeElement;
    nimTa.value = qs("#noteInput").value;
    nimEl.hidden = false;
    paintQuickMeta(); nimQuote(); nimCount();
    nimTa.focus();
    nimTa.setSelectionRange(nimTa.value.length, nimTa.value.length);   /* 光标落到文末，接着写 */
  }
  function closeNoteIm() {
    nimMirror();
    nimEl.hidden = true;
    nimFocusBack();
  }
  qs("#icNoteFull").innerHTML = icon("maximize-2", 14);
  qs("#noteFull").addEventListener("click", openNoteIm);
  qs("#noteImExit").addEventListener("click", closeNoteIm);
  qs("#noteImSave").addEventListener("click", function () {
    if (!nimTa.value.trim()) { toast("先写点内容吧", "alert-triangle"); nimTa.focus(); return; }
    nimMirror();
    nimEl.hidden = true;                       /* 先收浮层：保存链路的 toast 与页签切换才看得见 */
    qs("#noteSave").click();
    nimFocusBack();
  });
  qs("#noteImClear").addEventListener("click", function () {
    nimTa.value = "";
    qs("#noteClear").click();                  /* 复用面板清空：清 #noteInput + 收引用条 + 同步预览 */
    nimCount(); nimQuote(); nimTa.focus();
  });
  nimTa.addEventListener("input", nimMirror);

  /* ---------- 全屏写作的浮动预览卡（v2.19.3） ----------
     可拖、可缩、位置尺寸记本机（inkread.noteImPreview.v1）；随写随渲染（140ms 防抖）。
     只做展示层：正文仍由 #noteImText 单向镜像进 #noteInput，卡片不写库。 */
  var nimPvEl = qs("#noteImPvCard"), nimPvBar = qs("#noteImPvBar"), nimPvBody = qs("#noteImPvBody"),
      nimPvBtn = qs("#noteImPv"), nimPvRz = qs("#noteImPvCard .nim-pv-rz");
  var NIM_PV_KEY = "inkread.noteImPreview.v1", nimPvRect = null;
  qs("#icNimPvClose").innerHTML = icon("x", 13);

  function nimPvRead() {
    try {
      var v = JSON.parse(localStorage.getItem(NIM_PV_KEY));
      return v && v.w && v.h ? { x: +v.x || 0, y: +v.y || 0, w: +v.w, h: +v.h } : null;
    } catch (e) { return null; }
  }
  function nimPvSave() {
    try { localStorage.setItem(NIM_PV_KEY, JSON.stringify(nimPvRect)); } catch (e) {}
  }
  /* 夹取：不许拖出全屏层，也不许压住顶栏（nim-bar 高约 44，留 52） */
  function nimPvClamp(r) {
    var W = nimEl.clientWidth || 900, H = nimEl.clientHeight || 600, M = 8, TOP = 52;
    r.w = Math.round(Math.max(260, Math.min(r.w, W - M * 2)));
    r.h = Math.round(Math.max(160, Math.min(r.h, H - TOP - M)));
    r.x = Math.round(Math.max(M, Math.min(r.x, W - r.w - M)));
    r.y = Math.round(Math.max(TOP, Math.min(r.y, H - r.h - M)));
    return r;
  }
  function nimPvApply() {
    if (!nimPvRect) nimPvRect = nimPvRead() || { x: (nimEl.clientWidth || 900) - 416, y: 60, w: 400, h: 420 };
    nimPvRect = nimPvClamp(nimPvRect);
    nimPvEl.style.left = nimPvRect.x + "px"; nimPvEl.style.top = nimPvRect.y + "px";
    nimPvEl.style.width = nimPvRect.w + "px"; nimPvEl.style.height = nimPvRect.h + "px";
  }
  function nimPvPaint() {
    nimPvBody.innerHTML = MD.render(nimTa.value) || '<span class="card-note">预览区（空）</span>';
  }
  function nimPvShow(on) {
    nimPvEl.hidden = !on;
    nimPvBtn.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) { nimPvApply(); nimPvPaint(); }
  }
  nimPvBtn.addEventListener("click", function () { nimPvShow(nimPvEl.hidden); });
  qs("#noteImPvClose").addEventListener("click", function () { nimPvShow(false); nimPvBtn.focus(); });

  /* 拖动与缩放共用一套。
     捕获必须在 pointerdown 起手就做（不同于 InkDock 的「过阈值才捕获」）：
     标题条只有 28px 高、抓角只有 18px 大，等攒够 6px 位移再捕获时，
     指针早就离开这块条了 —— 之后浏览器不再把 pointermove 发给它，纵向拖窗直接失灵。
     这里没有可点子元素会被劫持：关闭钮在 pointerdown 里已先行排除；
     6px 阈值只留着判「算不算拖过」，决定要不要写记忆，不影响事件流。 */
  function nimPvGesture(bar, onMove) {
    var g = null;
    bar.addEventListener("pointerdown", function (e) {
      if (e.button || (e.target.closest && e.target.closest("button"))) return;
      if (!nimPvRect) return;
      g = { id: e.pointerId, px: e.clientX, py: e.clientY, r: { x: nimPvRect.x, y: nimPvRect.y, w: nimPvRect.w, h: nimPvRect.h }, moved: false };
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
      document.body.classList.add("nim-pv-drag");
      e.preventDefault();
      var s = window.getSelection(); if (s && s.removeAllRanges) s.removeAllRanges();
    });
    bar.addEventListener("pointermove", function (e) {
      if (!g || e.pointerId !== g.id) return;
      if (!g.moved) {
        if (Math.abs(e.clientX - g.px) + Math.abs(e.clientY - g.py) < 6) return;
        g.moved = true;
      }
      nimPvRect = nimPvClamp(onMove(g, e.clientX - g.px, e.clientY - g.py));
      nimPvApply();
    });
    function end(e) {
      if (!g || (e && e.pointerId !== g.id)) return;
      try { bar.releasePointerCapture(g.id); } catch (err) {}
      document.body.classList.remove("nim-pv-drag");
      if (g.moved) nimPvSave();
      g = null;
    }
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  }
  nimPvGesture(nimPvBar, function (g, dx, dy) { return { x: g.r.x + dx, y: g.r.y + dy, w: g.r.w, h: g.r.h }; });
  nimPvGesture(nimPvRz, function (g, dx, dy) { return { x: g.r.x, y: g.r.y, w: g.r.w + dx, h: g.r.h + dy }; });
  /* 键盘可达：标题条拿到焦点后方向键挪窗（Shift 加速）；Esc 关预览。
     既由下面的浮层守卫直接调用，也留在 bar 上作直挂备用。 */
  function nimPvKey(e) {
    if (e.__nimPvDone) return;
    e.__nimPvDone = true;
    var step = e.shiftKey ? 32 : 8, hit = true;
    if (e.key === "ArrowLeft") nimPvRect.x -= step;
    else if (e.key === "ArrowRight") nimPvRect.x += step;
    else if (e.key === "ArrowUp") nimPvRect.y -= step;
    else if (e.key === "ArrowDown") nimPvRect.y += step;
    else if (e.key === "Escape") { nimPvShow(false); nimPvBtn.focus(); }
    else hit = false;
    if (hit) { e.preventDefault(); nimPvApply(); nimPvSave(); }
  }
  nimPvBar.addEventListener("keydown", nimPvKey);
  var nimPvTimer = 0;
  nimTa.addEventListener("input", function () {
    if (nimPvEl.hidden) return;
    clearTimeout(nimPvTimer);
    nimPvTimer = setTimeout(nimPvPaint, 140);
  });

  /* Esc 退出（内容保留）；浮层开着时页面快捷键一律让路。
     全局 keydown 都挂在 document 上（翻页 / 单键快捷键 / 收面板），
     在 window 捕获段截断即可整体让路，不必逐个改动原有处理器。 */
  window.addEventListener("keydown", function (e) {
    if (!nimOpen()) return;
    /* 预览卡是浮层之上的第二层：Esc 先收卡、方向键在卡上挪卡。
       必须排在截断之前 —— 否则捕获段一 stopPropagation，卡片自己的处理器也一起哑了。 */
    if (!nimPvEl.hidden &&
        (e.key === "Escape" || e.key.indexOf("Arrow") === 0 && nimPvEl.contains(document.activeElement))) {
      e.preventDefault(); e.stopPropagation(); nimPvKey(e); return;
    }
    e.stopPropagation();
    if (e.key === "Escape") { closeNoteIm(); return; }
    if (e.key !== "Tab") return;
    /* 焦点不外逃：Tab / Shift+Tab 在浮层内循环（预览卡带着标题条一起进环） */
    var all = qsa("#noteImmersive button, #noteImmersive textarea" +
                   (nimPvEl.hidden ? "" : ", #noteImPvBar")), ring = [];
    for (var i = 0; i < all.length; i++)
      if (!all[i].disabled && !all[i].closest("[hidden]")) ring.push(all[i]);
    if (!ring.length) return;
    var at = ring.indexOf(document.activeElement);
    e.preventDefault();
    ring[(at + (e.shiftKey ? -1 : 1) + ring.length) % ring.length].focus();
  }, true);

  /* ============================================================
     6. 设置 / 排版
     ============================================================ */
  function paintSettings() {
    qs("#swMarks").classList.toggle("on", read.marks);
    qs("#swMarks").setAttribute("aria-pressed", String(!!read.marks));
    paintSummary();
  }

  /* 排版或阅读方式变化后重新排版，并把阅读位置按字符偏移锚回（绝不回到章首） */
  function repaginate(animate) {
    var off = curOffset();
    applyVars();
    state.scroll = read.mode === "scroll";
    if (state.scroll) {
      state.cur = 0;
      renderPage(0, false);
      restoreScroll(off);
    } else {
      paginate();
      restorePaged(off);
      if (state.cur >= state.pages.length) state.cur = Math.max(0, state.pages.length - 1);
      renderPage(0, false);
    }
    statMark(off);       /* v2.7 统计埋点：模式切换 / 重排后把字数基准重设到真实位置（防假增量） */
    /* v2.20：换了阅读方式，自动翻页就地停（速度种子按类别分，跨态续跑没意义）；
       其余重排只为让分页跟上控制条占掉的高度 */
    if (AUTO.on && state.scroll !== AUTO.wasScroll) { autoStop("已切换阅读方式，自动翻页已停止"); return; }
    autoSyncBook();
    if (animate) InkFX.flash();
  }

  /* 统一写入出口：交给 theme.js 落库 + 落地变量，再经 ink:read 事件回流本页 */
  function patch(p, msg, ic) {
    InkTheme.commit(p, true);
    if (msg) toast(msg, ic);
  }

  /* 仅当影响分页的字段变化时才重新测量；主题/标记类变化只需重绘 */
  function layoutKey(s) {
    return [s.fs, s.lh, s.fw, s.wt, s.ls, s.para, s.indent, s.align, s.font, s.display, s.twoCol, s.mode].join("|");
  }
  var lastLayout = layoutKey(read);
  var rpTimer = null;
  document.addEventListener("ink:read", function (e) {
    read = e.detail;
    paintSettings();
    paintTransSeg();
    var k = layoutKey(read);
    if (k !== lastLayout) {
      lastLayout = k;
      /* 滑块连续拖动时合并测量，避免每帧重排 */
      clearTimeout(rpTimer);
      rpTimer = setTimeout(function () { repaginate(false); }, 90);
    } else renderPage(0, false);
  });

  /* 字号 / 行高 / 栏宽 / 双栏 / 自适应等排版项已移入阅读内「Aa」面板（theme.js），
     此处只留一个阅读态开关；「学习模式 · 任务出处」已并入学习模式的工具条（modes.js），
     避免同一设置出现两处入口 */
  qs("#swMarks").addEventListener("click", function () { patch({ marks: !read.marks }, !read.marks ? "已显示批注标记" : "已隐藏批注标记", "highlighter"); });
  /* 批注面板开关：v2.14 起常驻底栏（#tNotes2），顶栏旧钮已删 */
  qs("#tNotes2").addEventListener("click", function () {
    var r = qs("#reader");
    var open = r.dataset.notes === "open";
    r.dataset.notes = open ? "closed" : "open";
    /* 打开批注时收起书签侧栏：两个覆盖面板不同时占位 */
    if (!open) setSide(false);
    InkFX.ripple(qs("#tNotes2"));
  });

  /* 书签与设置：覆盖侧栏，默认收起；两个覆盖面板互斥，避免同时压住版心 */
  function setSide(open) {
    var r = qs("#reader");
    r.dataset.side = open ? "open" : "closed";
    if (open) r.dataset.notes = "closed";
    /* 书签侧栏同样入窗：可拖成浮窗、可换边停靠（出厂仍钉左）。
       「设置」那一格本来就是常驻面板，浮起来才谈得上边看设置边翻页。
       形态钮不塞进 .side-tabs：那是 238px 里两个页签（各 flex:1），再叠五枚钮（四形态 + ✕）
       就把页签挤成两三个字宽；更糟的是同一行两种手感 —— 点空白处拖窗、点页签切页签。
       这里让 InkWin 自建一条 .inkw-bar 当把手：那一条只有「标题 + 钮」，标题自己会省略号，
       实测 232px（出厂宽 238 再拖窄一点）不溢出、也不折行。 */
    panelWin("side", { el: qs("#sidePanel"), id: "side", label: "书签侧栏", handle: ".inkw-bar",
      width: 238, side: "left",
      shown: function () { return r.dataset.side === "open"; },
      close: function () { setSide(false); } });
    pwApply("side");
    var b = qs("#tSide");
    if (b) b.setAttribute("aria-expanded", open ? "true" : "false");
  }
  qs("#tSide").addEventListener("click", function () {
    setSide(qs("#reader").dataset.side !== "open");
    InkFX.ripple(qs("#tSide"));
  });

  /* ---------- 侧栏 tab ---------- */
  qsa(".side-tab[data-stab]").forEach(function (t) {
    t.addEventListener("click", function () {
      qsa(".side-tab[data-stab]").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      qsa("[data-spanel]").forEach(function (p) { p.style.display = p.dataset.spanel === t.dataset.stab ? "block" : "none"; });
    });
  });

  /* ---------- 批注筛选 ---------- */
  qsa("[data-nfilter]").forEach(function (b) {
    b.addEventListener("click", function () {
      qsa("[data-nfilter]").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      state.filter = b.dataset.nfilter;
      renderNotes();
    });
  });

  /* 角标点击（v2.5）：打开批注浮窗并定位到该条 —— 浮窗可能是关着的，先开再定位 */
  function openNoteAt(id) {
    qs("#reader").dataset.notes = "open";
    setSide(false);
    switchNoteTab("list");
    focusNote(id);
  }

  /* ---------- 任务出处跳转 ---------- */
  qs("#doc").addEventListener("click", function (e) {
    var nr = e.target.closest(".nref");
    if (nr && nr.dataset.note) { openNoteAt(nr.dataset.note); return; }
    var ref = e.target.closest(".note-ref");
    if (ref && ref.dataset.note) { location.href = noteLink(ref.dataset.note); return; }
    var f = e.target.closest(".task-flag");
    if (f) { openTasks(f.dataset.task); return; }
    var hl = e.target.closest(".hl");
    if (hl && hl.dataset.note) focusNote(hl.dataset.note);
  });

  /* ============================================================
     6b. 自动翻页（v2.20）—— 计时单位是「字」，不是「页」
     ------------------------------------------------------------
     我们的页不是定长的（v2.19.3 会把长段 / 长表 / 长列表就地拆开），所以 Kobo
     那套固定 5–60 秒档在引言页上让人等、在满页上逼人赶。分页态每页停留 =
     本页字数 ÷（读者实测速度 × 倍速）；通栏态按「每个滚动像素摊到多少字」匀速推进。
     两条时间轴都必须随时叫停（WCAG 2.2 SC 2.2.2），控制条常驻、沉浸态也不收。
     调研与验收口径见《墨读InkRead-v2.20-自动翻页方案.md》。
     ============================================================ */
  var AUTO_KEY = "inkread.autoread.v1";
  var AUTO_MULTS = [0.6, 0.8, 1.0, 1.3, 1.6];
  var AUTO = {
    on: false, manual: false, blocked: null, mult: 1.0,
    timer: null, raf: null, acc: 0, wrote: -1, last: 0, beat: null,
    wasScroll: null, inTick: false, bookH: null
  };
  /* 只存倍速：运行态刻意不落库 —— 刷新后自动翻页回到关闭才对，
     它要求读者对「当前页」有预期，接着上次跑等于吓人。 */
  try {
    var AUTO_SAVED = JSON.parse(localStorage.getItem(AUTO_KEY) || "null");
    if (AUTO_SAVED && AUTO_MULTS.indexOf(+AUTO_SAVED.mult) >= 0) AUTO.mult = +AUTO_SAVED.mult;
  } catch (e) {}
  function autoSave() { try { localStorage.setItem(AUTO_KEY, JSON.stringify({ mult: AUTO.mult })); } catch (e) {} }

  /* 速度种子：与「剩余时间」估算同一口径（近 14 天 / 同类实测 / 平均 300） */
  function autoSeed() {
    var sp = (window.API && API.readSpeed) ? API.readSpeed(doc.type) : { wpm: 300, source: "default" };
    return { wpm: Math.max(80, Math.min(1200, sp.wpm || 300)), source: sp.source || "default" };
  }
  function autoWpm() { return autoSeed().wpm * AUTO.mult; }
  /* 双读数：倍速是操作，字/分是「我到底在读多快」的量。未实测时如实标注。 */
  function autoReadTxt() {
    var s = autoSeed();
    return AUTO.mult.toFixed(1) + "× · 约 " + Math.round(s.wpm * AUTO.mult) + " 字/分" +
      (s.source === "default" ? "（未实测，按平均 300）" : "");
  }
  /* 按「这一页真的有多少字」计时，而不是「这几个块共有多少字」：
     长段落会被拆到连续两页，用块字数会向上虚报，读者等着一句早就读完的话。 */
  /* 减弱动效有两个来源：应用内开关（read.reduce）与系统偏好（OS 说了「减」也得减，WCAG 2.3.3）。
     开关值不动它 —— 用户那份选择要原样存着，这里问的是「现在到底该不该动」。 */
  function autoReduced() {
    return !!(read.reduce || (window.InkTheme && InkTheme.reduced && InkTheme.reduced()));
  }
  function autoPageChars(i) {
    var h = state.pages[i] || "";
    if (h) return h.replace(/<[^>]*>/g, "").replace(/\s+/g, "").length;
    var idx = state.pageIdx[i] || [], n = 0;
    for (var k = 0; k < idx.length; k++) n += (BLOCK_TEXT[idx[k]] || "").length;
    return n;
  }
  /* 每页时长的两个下限各有来头：纯图页 / 满页表格没有文字，按公式算是 0 秒
     （= 连环空翻，Kindle Word Runner 被抱怨得最多的就是这条），给 4 秒；
     一句引言页按公式只有几百毫秒，读者还没看清就翻走，兜到 1.2 秒。 */
  function autoMsFor(chars) {
    if (!chars) return 4000;
    return Math.max(1200, Math.min(120000, chars / Math.max(1, autoWpm()) * 60000));
  }
  /* 通栏态：整篇文档摊在多高的滚动距离上，一个字占多少像素 —— 双栏、图、表、
     段距全自动算进去，比「字号 × 行数」不易失真。图多的地方摊得薄 → 自然慢下来。 */
  function autoPxPerChar() { return Math.max(0.2, qs("#sheet").scrollHeight / Math.max(1, DOC_CHARS)); }
  function autoIdle() { return !AUTO.on || AUTO.manual || !!AUTO.blocked; }
  /* 位移是「机器推的」还是「眼睛读的」：只有后者才配进速度种子 */
  function autoDriving() { return AUTO.on && !AUTO.manual && !AUTO.blocked; }

  /* 「停下来做事」的地方一律暂停：方案 §4.4 的成败关键 */
  function autoBlocked() {
    if (document.hidden || document.visibilityState !== "visible") return "hidden";
    if (EDIT.on) return "edit";
    var ap = document.getElementById("aaPanel");
    if (ap && !ap.hidden) return "panel";
    /* 「更多」里全是要先读完才能选的字，页在底下自己翻等于抢答 */
    var mp = document.getElementById("morePop");
    if (mp && !mp.hidden) return "panel";
    /* 阅读设置面板同理：调完翻页速度/音量再继续翻才合读者的预期 */
    var rs = document.getElementById("readSet");
    if (rs && !rs.hidden) return "panel";
    if (tocOpen || tk.open || tOpen) return "panel";
    var rd = qs("#reader");
    if (rd.dataset.notes === "open" || rd.dataset.side === "open") return "panel";
    /* 只有**正文里**的划词才算「读者正在标注」—— 页眉书名、侧栏、顶栏日期上的选区与他无关：
       旧版只要页面上有任何一处非空选区就停，实测选中页眉的「卷」也会显示「已暂停（划词选中）」。 */
    var s = window.getSelection ? window.getSelection() : null;
    if (s && !s.isCollapsed && String(s).trim()) {
      var n = s.anchorNode, selEl = n && (n.nodeType === 1 ? n : n.parentElement);
      if (selEl && selEl.closest && selEl.closest("#doc")) return "sel";
    }
    return null;
  }
  var AUTO_WHY = { hidden: "不在前台", panel: "面板打开", sel: "划词选中", edit: "修改正文" };

  function autoPaint() {
    var bar = qs("#autoBar");
    if (!bar) return;
    bar.hidden = !AUTO.on;
    immBarPad();
    /* 沉浸底栏那枚「自动翻页」开合两态都要跟着走：关着时它是入口，开着时它是状态。
       不能放在下面那句 `if (!AUTO.on) return;` 之后 —— 那样关掉之后按钮永远停在「开」的样子。 */
    var ia = qs("#immAuto");
    if (ia) {
      var ipaused = AUTO.manual || !!AUTO.blocked;
      ia.classList.toggle("active", !!AUTO.on && !ipaused);
      ia.setAttribute("aria-pressed", String(!!AUTO.on));
      /* 文案跟 #autoPlay 同一口径：开着时再点是「暂停 / 继续」，不是「停止」——
         停止归自动翻页条上那枚 ✕（与 #tAuto 的既有语义一致，别在这里另立一套）。 */
      ia.title = !AUTO.on ? "自动翻页（R）" : (ipaused ? "继续自动翻页（R）" : "暂停自动翻页（R）");
    }
    if (!AUTO.on) return;
    var paused = AUTO.manual || !!AUTO.blocked;
    qs("#icAutoPlay").innerHTML = icon(paused ? "play" : "pause", 16);
    var pb = qs("#autoPlay");
    pb.setAttribute("aria-pressed", String(paused));
    pb.setAttribute("aria-label", paused ? "继续自动翻页" : "暂停自动翻页");
    pb.title = paused ? "继续（R）" : "暂停（R）";
    qs("#autoRead").textContent = autoReadTxt();
    var txt = "自动翻页 · ";
    txt += state.scroll ? "匀速滚动" : "定时翻页 · 本页约 " + Math.round(autoMsFor(autoPageChars(state.cur)) / 100) / 10 + " 秒";
    if (AUTO.manual) txt += " · 已暂停";
    else if (AUTO.blocked) txt += " · 已暂停（" + (AUTO_WHY[AUTO.blocked] || AUTO.blocked) + "）";
    qs("#autoNow").textContent = txt;
  }

  function autoStopRaf() { if (AUTO.raf) { cancelAnimationFrame(AUTO.raf); AUTO.raf = null; } }

  /* 通栏态：rAF 累加器。dt 钳到 50ms —— 切走再回来不跳屏。 */
  function autoFrame(ts) {
    if (autoIdle()) { AUTO.raf = null; return; }
    var sheet = qs("#sheet");
    var dt = AUTO.last ? Math.min(0.05, (ts - AUTO.last) / 1000) : 0;
    AUTO.last = ts;
    var max = sheet.scrollHeight - sheet.clientHeight;
    if (max <= 0) { AUTO.raf = requestAnimationFrame(autoFrame); return; }
    AUTO.acc += autoWpm() / 60 * autoPxPerChar() * dt;
    if (AUTO.acc >= max - 0.5) { AUTO.acc = max; AUTO.wrote = max; sheet.scrollTop = max; autoFinish(); return; }
    /* 读者自己滚了一下就顺着他去：位置以实况为准，绝不把他拽回累加器里 */
    if (Math.abs(sheet.scrollTop - AUTO.wrote) > 1.5) AUTO.acc = sheet.scrollTop;
    AUTO.acc = Math.max(0, AUTO.acc);
    AUTO.wrote = AUTO.acc;
    sheet.scrollTop = AUTO.acc;
    AUTO.raf = requestAnimationFrame(autoFrame);
  }
  /* 滚动条只在「真的在跑」时活着，暂停 / 阻塞时不空转耗电 */
  function autoScrollSync() {
    if (!AUTO.on || !state.scroll) { autoStopRaf(); return; }
    if (AUTO.manual || AUTO.blocked) { autoStopRaf(); return; }
    if (AUTO.raf) return;
    AUTO.acc = qs("#sheet").scrollTop;
    AUTO.wrote = AUTO.acc;
    AUTO.last = 0;
    AUTO.raf = requestAnimationFrame(autoFrame);
  }

  function autoArmPage() {
    clearTimeout(AUTO.timer); AUTO.timer = null;
    if (!AUTO.on || state.scroll) return;
    AUTO.timer = setTimeout(autoTick, autoMsFor(autoPageChars(state.cur)));
  }

  function autoTick() {
    AUTO.timer = null;
    if (!AUTO.on || state.scroll) return;
    autoReview();                 /* 到期先复核实况；解除阻塞会重头给一整页（见 autoReview） */
    if (AUTO.timer) return;
    if (AUTO.manual || AUTO.blocked) { AUTO.timer = setTimeout(autoTick, 200); return; }
    if (state.cur >= state.pages.length - 1) { autoFinish(); return; }
    AUTO.inTick = true;
    try { go(1); } finally { AUTO.inTick = false; }
    autoArmPage();
    /* 自动翻页这一支不走 autoRetime（renderPage 里被 inTick 挡住），
       条子得自己跟上，否则翻到新页还报着上一页的秒数。 */
    autoPaint();
  }

  /* 控制条占掉的高度会压小版心 → 分页必须按新高度重排，否则页内又长出滚动条
     （v2.19.3 的老坑）。通栏态不受影响：条子是同列兄弟，文档高度不变。 */
  function autoSyncBook() {
    if (!AUTO.on) {
      if (AUTO.bookH !== null) { AUTO.bookH = null; if (!state.scroll) repaginate(false); }
      return;
    }
    var h = qs("#book").clientHeight;
    if (state.scroll) { AUTO.bookH = h; autoRetime(); return; }
    if (AUTO.bookH !== null && h > AUTO.bookH - 8) return;   /* 版心没被压小：条子是叠上来的 */
    AUTO.bookH = h;
    repaginate(false);   /* repaginate 自己会把字数基准锚回原位，不留假增量 */
    autoRetime();
  }

  /* 手动翻页 / 拖进度条 / 跳目录：重新计时，不退出、不暂停 */
  function autoRetime() {
    if (!AUTO.on) return;
    if (state.scroll) { var st = qs("#sheet").scrollTop; AUTO.acc = st; AUTO.wrote = st; autoPaint(); return; }
    if (!AUTO.manual && !AUTO.blocked) autoArmPage();
    /* 条子上那句「本页约 X 秒」必须跟着实况走：读者自己翻了一页还报上一页的时长，
       等于当着人面说假话（暂停时也一样要报准，他才判断得了什么时候恢复）。 */
    autoPaint();
  }

  function autoWatch(on) {
    clearInterval(AUTO.beat); AUTO.beat = null;
    if (on) AUTO.beat = setInterval(autoReview, 200);
  }

  /* 实况复核：状态真的变了才动，平时一次比较就返回 */
  function autoReview() {
    if (!AUTO.on) return false;
    /* 系统「减弱动效」是运行途中也会变的 OS 级偏好，匀速滚动这种连续位移得当场停 */
    if (state.scroll && autoReduced()) { autoStop("系统已开启「减弱动效」，匀速滚动已停止"); return true; }
    var b = autoBlocked();
    if (b === AUTO.blocked) return false;
    AUTO.blocked = b;
    if (b === "edit") { autoStop("修改正文时不自动翻页"); return true; }
    autoPaint();
    if (state.scroll) autoScrollSync(); else autoArmPage();
    return true;
  }

  function autoStart() {
    if (AUTO.on) return;
    /* 连续位移正是前庭敏感者要避开的东西：减弱动效（应用内或系统级）下匀速档不开 */
    if (autoReduced() && state.scroll) { toast("已按「减弱动效」关闭匀速滚动，定时翻页请改用分页模式", "info"); return; }
    if (qs("#ttsBar").style.display === "flex") { toast("朗读时页面跟着声音走，不需要自动翻页", "info"); return; }
    AUTO.on = true; AUTO.manual = false; AUTO.blocked = null;
    /* 先记下当前方式：条子一现身就压小版心 → repaginate 的守卫会把「自己引起的重排」
       误判成用户切了阅读方式，刚开的自动翻页会被它自己关掉。 */
    AUTO.wasScroll = state.scroll;
    autoPaint();            /* 先出条，再量高度：分页要按条在时的高度重排 */
    autoSyncBook();
    autoScrollSync(); autoArmPage();
    autoWatch(true);
    toast(state.scroll ? "自动滚动已开始 · 按 R 暂停" : "自动翻页已开始 · 按 R 暂停", "chevrons-right");
  }

  function autoStop(why) {
    if (!AUTO.on) return;
    AUTO.on = false; AUTO.manual = false; AUTO.blocked = null;
    clearTimeout(AUTO.timer); AUTO.timer = null;
    autoStopRaf(); autoWatch(false); autoSave();
    autoPaint();            /* 收起控制条 */
    autoSyncBook();         /* 条子没了 → 版心长回来，页容量复原 */
    if (why) toast(why, "info");
  }

  function autoToggle() {
    if (!AUTO.on) { autoStart(); return; }
    if (AUTO.manual) { AUTO.manual = false; autoSave(); autoPaint(); autoScrollSync(); autoRetime(); }
    else { AUTO.manual = true; autoPaint(); autoScrollSync(); }
  }
  function autoFinish() { autoStop("已读到结尾"); }

  function autoStep(dir) {
    var i = AUTO_MULTS.indexOf(AUTO.mult); if (i < 0) i = 2;
    var j = Math.max(0, Math.min(AUTO_MULTS.length - 1, i + dir));
    if (j === i) { toast(dir < 0 ? "已经是最慢一档" : "已经是最快一档", "info"); return; }
    AUTO.mult = AUTO_MULTS[j];
    autoSave(); autoPaint(); autoRetime();
  }

  qs("#autoPlay").addEventListener("click", autoToggle);
  qs("#autoStop").addEventListener("click", function () { autoStop(); });
  qs("#autoDown").addEventListener("click", function () { autoStep(-1); });
  qs("#autoUp").addEventListener("click", function () { autoStep(1); });
  qs("#tAuto").addEventListener("click", function () { autoToggle(); });
  var immAutoBtn = qs("#immAuto");
  if (immAutoBtn) immAutoBtn.addEventListener("click", function () { autoToggle(); });

  /* 面板开合、划词、切后台都在这一秒内改变「该不该停」；200ms 兜底轮询之外，
     这三个事件让暂停当场反映到按钮上（WCAG 2.2.2 要求的是「随时能停」）。 */
  document.addEventListener("selectionchange", autoReview);
  document.addEventListener("pointerdown", function () { autoReview(); }, true);
  document.addEventListener("visibilitychange", autoReview);
  window.addEventListener("resize", autoRetime);

  /* ---------- 翻页交互：按钮 / 键盘 / 拖拽 ---------- */
  qs("#pgPrev").addEventListener("click", function () { go(-1); });
  qs("#pgNext").addEventListener("click", function () { go(1); });

  document.addEventListener("keydown", function (e) {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key !== "Escape" || e.__inkEscHandled) return;
    /* 浮层优先级：越靠上越先收，避免一次 Esc 收掉两层。
       翻译卡已入层栈（dock.js 的 InkWin.closeTop 收），此链不再自建分支。 */
    if (!morePop.hidden) closeMore();
    else if (qs("#modePop") && !qs("#modePop").hidden) InkModes.closePop();
    else if (InkModes.panelKey()) InkModes.closePanel();
    else if (tOpen) closeTasks();
    else if (tocOpen) closeToc();
    else if (imm.on) exitImm();
    else hideSel();
  });

  /* v2.22 S5：动作键统一入 InkKeys 注册表（方案 §四.D.2 迁移明账），
     逐条语义与原单链等价（横向翻页 ←→ / 竖向浏览 ↑↓ / ± 字号 / 单键动作）；
     Escape 链留局部 —— 一次 Esc 只收一层。注册表字段守卫覆盖
     INPUT/TEXTAREA/contenteditable：顺带修正「解锁改字时空格/字母误触翻页」
     （原 /^(INPUT|TEXTAREA)$/ 守卫漏 contenteditable）。 */
  if (window.InkKeys) {
    InkKeys.on("space, pagedown", function () { go(1); immWake(); }, { title: "下一页", group: "阅读" });
    InkKeys.on("pageup", function () { go(-1); immWake(); }, { title: "上一页", group: "阅读" });
    /* 焦点在目录进度条（role=slider，inField 管不到）时方向键归进度条预览，
       不得越权翻页/滚屏 —— 存量缺陷随 S5 修复（验证据 verify-v222-keys K6） */
    var offTrack = function () { return document.activeElement !== qs("#tpTrack"); };
    InkKeys.on("arrowright", function (e) { if (!state.scroll) { e.preventDefault(); go(1); } immWake(); }, { prevent: false, when: offTrack, title: "→ 向右翻页", group: "阅读" });
    InkKeys.on("arrowleft", function (e) { if (!state.scroll) { e.preventDefault(); go(-1); } immWake(); }, { prevent: false, when: offTrack, title: "← 向左翻页", group: "阅读" });
    InkKeys.on("arrowdown", function () { go(1); immWake(); }, { when: function () { return state.scroll && offTrack(); }, title: "↓ 下一屏（竖排）", group: "阅读" });
    InkKeys.on("arrowup", function () { go(-1); immWake(); }, { when: function () { return state.scroll && offTrack(); }, title: "↑ 上一屏（竖排）", group: "阅读" });
    InkKeys.on("+, =", function () { patch({ fs: Math.min(26, read.fs + 1) }); }, { prevent: false, title: "正文字号 +1", group: "阅读" });
    InkKeys.on("-", function () { patch({ fs: Math.max(13, read.fs - 1) }); }, { prevent: false, title: "正文字号 −1", group: "阅读" });
    InkKeys.on("b", function () { qs("#selMark").click(); }, { prevent: false, title: "书签 / 高亮", group: "阅读" });
    InkKeys.on("f", function () { toggleImm(); }, { title: "全屏沉浸", group: "阅读" });
    InkKeys.on("t", function () { toggleTasks(); }, { title: "任务面板", group: "阅读" });
    InkKeys.on("c", function () { toggleToc(); }, { title: "目录", group: "阅读" });
    InkKeys.on("m", function () { InkModes.openPicker(); }, { title: "模式切换", group: "阅读" });
    InkKeys.on("r", function () { autoToggle(); }, { title: "自动翻页", group: "阅读" });
    /* 助手在输入框里也认 Ctrl/⌘+J：正敲着问题要收起，不该先点出去夺焦点 */
    InkKeys.on("mod+j", function () { arToggle(); }, { inInput: true, title: "AI 阅读助手", group: "阅读" });
  }

  var drag = null;
  qs("#sheet").addEventListener("pointerdown", function (e) {
    if (e.target.closest(".task-flag, .hl, .nref")) return;   /* 角标 / 高亮 / 任务旗上不起手翻页 */
    if (state.scroll) return;
    // 仅在纸页左右边缘起手才视为翻页拖拽，避免与正文划词冲突
    var r = qs("#book").getBoundingClientRect();
    if (Math.min(e.clientX - r.left, r.right - e.clientX) > 96) return;
    drag = { x: e.clientX, y: e.clientY, moved: false };
  });
  window.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) {
      drag.moved = true;
      qs("#sheet").classList.add("dragging");
      qs("#sheet").style.transform = "perspective(2000px) rotateY(" + (dx > 0 ? Math.min(20, dx / 9) : Math.max(-20, dx / 9)) + "deg) translateX(" + dx * 0.16 + "px)";
    }
  });
  window.addEventListener("pointerup", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    var sheet = qs("#sheet");
    sheet.style.transform = "";
    sheet.classList.remove("dragging");
    var flip = drag.moved && Math.abs(dx) > 88;
    if (drag.moved) imm.lastDrag = Date.now();
    drag = null;
    if (flip) go(dx < 0 ? 1 : -1);
  });

  /* ---------- 听书 v2 ----------
     调研落地（详见《听书方案-调研与设计.md》）：
     ① 起点读书：入口在阅读菜单；语速 0.5~3×；音色随时换；定时关闭；
     ② @Voice Aloud Reader：点击任意段落即从该处起读；
     ③ 华为阅读「边听边看」：朗读进度驱动阅读页（自动翻页 / 滚动 + 当前段高亮）。
     只要有可朗读的文字段落就开放（书 / 论文 / 计划都行）；漫画没有文字段落才禁用。
     引擎在 api.js 的 API.ttsEngine()（段落队列 + 神经语音边播边预取）。 */
  var SPEAK_UNITS = [];
  blocks.forEach(function (b, i) {
    var t = (b.type === "p" || b.type === "h1" || b.type === "h2" || b.type === "h3" ||
             b.type === "quote" || b.type === "abstract");
    if (t && String(BLOCK_TEXT[i] || "").trim()) SPEAK_UNITS.push({ bi: i, text: BLOCK_TEXT[i] });
  });
  var CAN_SPEAK = doc.type !== "comic" && SPEAK_UNITS.length > 0;
  var ttsBtn = qs("#tSpeak");
  if (!CAN_SPEAK) {
    ttsBtn.disabled = true;
    ttsBtn.classList.add("is-off");
    ttsBtn.setAttribute("aria-disabled", "true");
    ttsBtn.title = "漫画以画为主，不提供朗读";
    var mi = ttsBtn.querySelector("em");
    if (mi) mi.textContent = "无可朗读文字";
  }
  /* 音色下拉：只列已安装的音色；当前音色不在已装列表里（被卸载）时补进去 */
  function paintVoiceSel() {
    var sel = qs("#ttsVoice");
    if (!sel || !window.InkVoice) return;
    var cur = InkVoice.current();
    var on = InkVoice.list().filter(function (v) { return v.installed; });
    if (!on.some(function (v) { return v.k === cur; })) on.unshift(InkVoice.meta(cur) || { k: cur, name: cur });
    sel.innerHTML = on.map(function (v) {
      return '<option value="' + v.k + '">' + esc(v.name) + "（" + esc(v.mood) + "）</option>";
    }).join("");
    sel.value = cur;
  }
  qs("#icVoice").innerHTML = icon("audio-lines", 15);
  qs("#icTtsPrev").innerHTML = icon("skip-back", 15);
  qs("#icTtsNext").innerHTML = icon("skip-forward", 15);
  qs("#icTtsTimer").innerHTML = icon("timer", 15);
  qs("#icStop").innerHTML = icon("x", 15);
  paintVoiceSel();
  qs("#ttsVoice").addEventListener("change", function () {
    InkVoice.setCurrent(this.value);
    if (TTS.eng) TTS.eng.setVoice(this.value);
    toast("朗读音色： " + InkVoice.meta(this.value).name, "audio-lines");
  });

  var TTS = { eng: null, bound: false, liveEl: null, popBi: null, timerLabel: "不定时", speed: 1 };
  try { TTS.speed = Math.max(0.5, Math.min(3, parseFloat(localStorage.getItem("inkread.tts.speed.v1")) || 1)); } catch (e) {}

  function unitEl(bi) { return biEl(bi); }
  function unitIdxOf(bi) {
    for (var k = 0; k < SPEAK_UNITS.length; k++) if (SPEAK_UNITS[k].bi >= bi) return k;
    return Math.max(0, SPEAK_UNITS.length - 1);
  }
  /* 边听边看：当前段高亮；不在当前页/视口就翻过去（分页走页机器，滚动走 scrollIntoView） */
  function ttsFollow(bi) {
    var el = unitEl(bi);
    if (!el && !state.scroll) {
      restorePaged(BLOCK_OFF[bi] || 0);
      state.cur = Math.max(0, Math.min(state.pages.length - 1, state.cur));
      renderPage(0, false);
      el = unitEl(bi);
    }
    if (TTS.liveEl && TTS.liveEl !== el) TTS.liveEl.classList.remove("tts-live");
    TTS.liveEl = null;
    if (!el) return;
    el.classList.add("tts-live");
    TTS.liveEl = el;
    if (state.scroll) {
      var sheet = qs("#sheet"), r = el.getBoundingClientRect(), sr = sheet.getBoundingClientRect();
      if (r.top < sr.top + 8 || r.bottom > sr.bottom - 8) {
        el.scrollIntoView({ block: "start", behavior: read.reduce ? "auto" : "smooth" });
      }
    }
  }
  function paintPlayBtn(playing) {
    qs("#icTtsPlay").innerHTML = icon(playing ? "pause" : "play", 16);
    qs("#ttsPlay").classList.toggle("active", !!playing);
  }
  /* 播放条在文档流的同列底部：一现身就把版心压掉 64~117px。分页是按开条前的高度切的，
     不重排就会让末行被条子拦腰切掉、页内又长出滚动条（autoSyncBook 治的是自动翻页条，
     同一个坑：两条互斥，见 autoStart 的自拒，所以各治各的）。通栏不分页，跳过。 */
  function ttsSyncBook() { if (!state.scroll) repaginate(false); }
  /* 沉浸态：朗读条 / 自动翻页条都是**文档流**里的元素，会被固定的沉浸底栏（54px）整条盖住 ——
     实测点开出自动翻页条后，条子中心命中的是 #immHint（底栏的提示语），暂停与调速全点不到
     （WCAG 2.2 SC 2.2.2 要的「暂停手段一直可达」当场破功）。谁现身就让 .reader-main 让出那条带子。 */
  function immBarPad() {
    var rm = document.querySelector(".reader-main");
    if (!rm) return;
    var tb = qs("#ttsBar"), ab = qs("#autoBar");
    var on = document.body.classList.contains("immersive") &&
      ((tb && tb.style.display === "flex") || (ab && ab.style.display !== "none" && !ab.hidden));
    rm.classList.toggle("bar-pad", !!on);
  }
  /* 空进度底槽不显形（v2.24.1）：播放前那条 76×6 的槽谁也点不动、也不显示任何状态，
     读者只会问「这条白条是干什么的」。有进度再让它出现 —— 用 visibility 不用 display，
     条子高度不变，ttsSyncBook 的重排账不必跟着改。 */
  function ttsProg(on) { var b = qs("#ttsBar"); if (b) b.classList.toggle("no-prog", !on); }
  function openTTSBar() { qs("#ttsBar").style.display = "flex"; ttsProg(false); immBarPad(); ttsSyncBook(); }
  function closeTTSBar() {
    qs("#ttsBar").style.display = "none";
    hideSpeedPop(); hideTimerPop();
    immBarPad();
    ttsSyncBook();
  }
  function ttsCleanup() {
    closeTTSBar();
    var b = qs("#ttsEng");
    if (b) { b.hidden = true; b.textContent = ""; b.classList.remove("warn"); }
    if (TTS.liveEl) { TTS.liveEl.classList.remove("tts-live"); TTS.liveEl = null; }
    paintPlayBtn(false);
  }
  function bindEngineEvents() {
    if (TTS.bound) return;
    TTS.bound = true;
    var e = TTS.eng;
    e.on("onSegment", function (bi, i) {
      var u = SPEAK_UNITS[i] || { text: "" };
      qs("#ttsNow").textContent = String(u.text).slice(0, 48) + (u.text.length > 48 ? "…" : "");
      qs("#ttsFrac").textContent = (i + 1) + " / " + SPEAK_UNITS.length;
      ttsFollow(bi);
    });
    e.on("onTick", function (f) {
      qs("#ttsBarFill").style.width = Math.round(f * 100) + "%";
      if (f > 0) ttsProg(true);   /* 真开始读了才让底槽显形（见 ttsProg 注释） */
    });
    /* 引擎徽标：现在真正在出声的是哪条链路，一眼看得见。
       降级（神经合成未响应）与静默（一句都没读出来）都用琥珀色标出来 ——
       旧版这里什么都不显示，机械音顶替神经音读者毫无察觉。 */
    e.on("onMode", function (m) {
      var b = qs("#ttsEng");
      if (!b || !m) return;
      var base = m.mode === "neural" ? "神经语音 · " + (m.voice || "") + (m.cast ? " · " + m.cast : "")
        : m.mode === "cloud" ? "云音色 · " + (m.voice || "")
        : m.mode === "speech" ? "本机声线 · " + (m.voice || "")
        : m.mode === "none" ? "未出声 · " + (m.note || "本机没有可用声线")
        : "计时模拟";
      /* 降级原因直接写进徽标：只放 title 的话读者看得见「换了条声线」却看不见「为什么换」，
         神经合成挂了必须当场说清，不能让人去猜是不是自己没配好。 */
      var txt = (m.mode === "none" || !m.note) ? base : base + " · " + m.note;
      b.textContent = txt;
      b.title = txt;
      b.hidden = false;
      b.classList.toggle("warn", m.mode === "none" || m.mode === "sim" || !!m.note);
    });
    e.on("onState", function (s, why) {
      if (s === "done") { ttsCleanup(); toast(why || "朗读结束", "volume-2"); }
      else if (s === "stopped") ttsCleanup();
      /* 「这台音色念不出这段」的停机：**只把播放键拨回 ▶，条子与音色下拉原地留着** ——
         条子一关，换音色的入口就没了，用户只能拿同一款音色再错一次（实测复现过）。 */
      else if (s === "halted") { paintPlayBtn(false); toast(why || "朗读已停止", "alert-triangle"); }
      else if (s === "paused") paintPlayBtn(false);
      else if (s === "playing") paintPlayBtn(true);
    });
  }
  /* fromBi：从该块号起找第一个可朗读段（点段起读 / 「旁听当前页」共用） */
  function startTTS(fromBi) {
    if (!CAN_SPEAK) return;
    if (!TTS.eng) TTS.eng = API.ttsEngine();
    bindEngineEvents();
    TTS.eng.setSpeed(TTS.speed);
    TTS.eng.setVoice(qs("#ttsVoice").value || InkVoice.current());
    TTS.eng.start(SPEAK_UNITS, unitIdxOf(fromBi));
    openTTSBar();
    paintPlayBtn(true);
    hideTtsPop();
  }
  /* 入口 A：更多菜单「朗读」—— 从当前页第一段开始 */
  ttsBtn.addEventListener("click", function () {
    if (!CAN_SPEAK || (TTS.eng && TTS.eng.playing())) return;
    startTTS(blockAt(curOffset()));
  });
  qs("#ttsStop").addEventListener("click", function () { if (TTS.eng) TTS.eng.stop(); });
  /* ▶ 两义：正在播 → 暂停/继续；停过之后（含「念不出这段」的停机）→ 从当前段重起。
     没有这一义，「换一款音色再点朗读」就只剩再跑一趟「更多 → 朗读」那条远路。 */
  qs("#ttsPlay").addEventListener("click", function () {
    if (!TTS.eng) return;
    if (TTS.eng.playing()) { TTS.eng.toggle(); return; }
    var u = SPEAK_UNITS[TTS.eng.idx()];
    startTTS(u ? u.bi : blockAt(curOffset()));
  });
  qs("#ttsPrev").addEventListener("click", function () { if (TTS.eng) TTS.eng.seekIdx(TTS.eng.idx() - 1); });
  qs("#ttsNext").addEventListener("click", function () { if (TTS.eng) TTS.eng.seekIdx(TTS.eng.idx() + 1); });

  /* 语速弹层（起点读书 0.5~3×；偏好持久化，换速从当前段重合成） */
  /* 音量：唯一真源在 API.ttsVol（本机键 inkread.tts.vol.v1）；弹层与阅读设置两处滑杆都从这里同步 */
  function paintVolUI() {
    var v = (window.API && API.ttsVol) ? API.ttsVol() : 1;
    var pc = Math.round(v * 100) + "%";
    var r1 = qs("#ttsVolRange"), o1 = qs("#ttsVolVal");
    if (r1) r1.value = v;
    if (o1) o1.textContent = pc;
    var r2 = qs("#rsVol"), o2 = qs("#rsVolVal");
    if (r2) r2.value = v;
    if (o2) o2.textContent = pc;
  }
  function paintSpeedUI() {
    qs("#ttsSpeed").textContent = TTS.speed + "×";
    qs("#ttsSpeedVal").textContent = TTS.speed + "×";
    qs("#ttsSpeedRange").value = TTS.speed;
    qsa("#ttsSpeedPop .tmp-presets button").forEach(function (b) {
      b.classList.toggle("on", parseFloat(b.dataset.sp) === TTS.speed);
    });
    paintVolUI();
  }
  function hideSpeedPop() { qs("#ttsSpeedPop").hidden = true; }
  function hideTimerPop() { qs("#ttsTimerPop").hidden = true; }
  function hideTtsPop() { TTS.popBi = null; qs("#ttsPop").hidden = true; }
  function placePop(pop, anchor) {
    pop.hidden = false;
    var r = anchor.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.max(10, Math.min(window.innerWidth - pw - 10, r.left));
    var top = r.top - ph - 8;
    if (top < 54) top = Math.min(window.innerHeight - ph - 10, r.bottom + 8);
    pop.style.left = left + "px"; pop.style.top = top + "px";
  }
  qs("#ttsSpeed").addEventListener("click", function () {
    var pop = qs("#ttsSpeedPop");
    if (!pop.hidden) { hideSpeedPop(); return; }
    hideTimerPop(); paintSpeedUI();
    placePop(pop, qs("#ttsSpeed"));
  });
  qs("#ttsSpeedRange").addEventListener("change", function () {
    TTS.speed = Math.max(0.5, Math.min(3, parseFloat(this.value) || 1));
    try { localStorage.setItem("inkread.tts.speed.v1", String(TTS.speed)); } catch (e) {}
    paintSpeedUI();
    if (TTS.eng && TTS.eng.playing()) TTS.eng.setSpeed(TTS.speed);
  });
  qsa("#ttsSpeedPop .tmp-presets button").forEach(function (b) {
    b.addEventListener("click", function () {
      TTS.speed = parseFloat(b.dataset.sp) || 1;
      try { localStorage.setItem("inkread.tts.speed.v1", String(TTS.speed)); } catch (e) {}
      paintSpeedUI();
      if (TTS.eng && TTS.eng.playing()) TTS.eng.setSpeed(TTS.speed);
    });
  });
  /* ============================================================
     多角色朗读（v2.24.2）：角色表 · 分段音色 · 模型归属
     —— 识别算法在 cast.js（纯函数，夹具闸 verify-v226-cast.js 逐条钉死）；
        这里只管三件事：读写**本书**的角色表、把角色映射成播放单元的音色、
        角色表面板的交互（含 L2 模型重认）。
     —— 默认关：只在用户对某一本书显式打开后生效（方案 §5.5 的拍板）。
     ============================================================ */
  var CAST_KEY = "inkread.cast.v1";
  function castAll() { try { return JSON.parse(localStorage.getItem(CAST_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function castPut(book) {
    var all = castAll();
    if (book) all[docId] = book; else delete all[docId];
    try { localStorage.setItem(CAST_KEY, JSON.stringify(all)); } catch (e) {}
  }
  var CAST = castAll()[docId] || { on: false, chars: {}, lines: [] };
  CAST.on = !!CAST.on;
  /* 角色音色的候选池：**先把自己（旁白）那款排除掉** —— 旁白用用户选的音色，
     角色若也分到同一款，听起来就是「换了半天等于没换」（首跑实测正是如此）。
     池子小到只剩一款时只好全体共用（宁可用，不可空）。 */
  function castPool() {
    var cur = window.InkVoice ? InkVoice.current() : "";
    var all = (window.InkVoice ? InkVoice.list() : []).filter(function (v) { return v.installed && v.edge; });
    var rest = all.filter(function (v) { return v.k !== cur; });
    return rest.length >= 2 ? rest : all;
  }
  var SPEAK_UNITS_PLAIN = SPEAK_UNITS;      /* 原始单元（无角色）；开了多角色才换成带角色的那份 */

  /* 重识别（L1）：把上一版角色表传进去，用户的音色指派与手改归属不会被冲掉 */
  function castScan() {
    var keep = (CAST && CAST.chars && Object.keys(CAST.chars).length) ? { chars: CAST.chars, lines: CAST.lines } : null;
    var next = window.InkCast ? InkCast.build(blocks, keep) : null;
    if (!next) return;
    next.on = !!CAST.on;
    InkCast.assignVoices(next.chars, castPool().map(function (v) { return { k: v.k, name: v.name, gender: v.gender }; }));
    CAST = next;
    castPut(CAST);
  }
  /* 按角色表重建播放单元：旁白 null（用户选的音色），台词带角色名与角色音色 */
  function castUnits() {
    if (!CAST.on || !CAST.lines || !CAST.lines.length || !window.InkCast) return null;
    return InkCast.unitsFor(blocks, CAST).map(function (u) {
      var c = u.cast ? CAST.chars[u.cast] : null;
      return { bi: u.bi, text: u.text, cast: u.cast || "", voiceK: (c && c.voiceK) || "" };
    });
  }
  function castApplyUnits() {
    SPEAK_UNITS = castUnits() || SPEAK_UNITS_PLAIN;
    if (CAST.on && !CAST.lines.length) castScan();      /* 开了但还没识别过：先按 L1 认一遍 */
    if (!CAST.on) SPEAK_UNITS = SPEAK_UNITS_PLAIN;
  }
  /* 面板：角色行（性别 + 音色）与对白行（改归属） */
  function castRender() {
    var body = qs("#castBody");
    if (!body) return;
    var names = Object.keys(CAST.chars || {});
    var pool = castPool();
    var h = [];
    h.push('<label class="tmp-row"><b>本书启用多角色</b><input type="checkbox" id="castOn"' + (CAST.on ? " checked" : "") + "></label>");
    h.push('<div class="tmp-row" style="gap:6px">' +
      '<button class="btn btn-ghost btn-sm" id="castScan">重新识别</button>' +
      '<button class="btn btn-ghost btn-sm" id="castModel"' + (window.API && API.hasModel && API.hasModel() ? "" : " disabled title=\"先在「主脑 · 模型配置」里填好模型\"") + ">用模型重认</button>" +
      '<button class="btn btn-ghost btn-sm" id="castClear">清空</button></div>');
    if (!names.length) {
      h.push('<div class="ap-hint">还没有识别到角色。点「重新识别」：先按对白提示语（「张三道：“…”」）认，再看两人轮转。判不出的一律算旁白。</div>');
      body.innerHTML = h.join("");
      castWire();
      return;
    }
    h.push('<section class="ap-sec"><h4>角色<span class="ap-sec-note">音色默认按性别自动配</span></h4>');
    names.sort(function (a, b) { return (CAST.chars[b].count || 0) - (CAST.chars[a].count || 0); }).forEach(function (n) {
      var c = CAST.chars[n];
      h.push('<div class="ap-row"><span class="ap-k">' + esc(n) + ' <em class="ap-sec-note">×' + c.count + "</em></span>" +
        '<span class="ap-c">' +
        '<select class="ap-sel" data-cast-gender="' + esc(n) + '" aria-label="' + esc(n) + " 的性别\">" +
        [["", "未知"], ["m", "男"], ["f", "女"]].map(function (g) { return '<option value="' + g[0] + '"' + ((c.gender || "") === g[0] ? " selected" : "") + ">" + g[1] + "</option>"; }).join("") +
        "</select>" +
        '<select class="ap-sel" data-cast-voice="' + esc(n) + '" aria-label="' + esc(n) + " 的音色\">" +
        '<option value="">按性别自动</option>' +
        pool.map(function (v) { return '<option value="' + v.k + '"' + (c.voiceK === v.k ? " selected" : "") + ">" + esc(v.name) + "</option>"; }).join("") +
        "</select></span></div>");
    });
    h.push("</section>");
    var lines = (CAST.lines || []);
    if (lines.length) {
      h.push('<section class="ap-sec"><h4>对白归属<span class="ap-sec-note">手改一次即写回本书角色表</span></h4>');
      lines.slice(0, 300).forEach(function (l, i) {
        h.push('<div class="ap-row"><span class="ap-k" style="max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(l.text) + '">“' + esc(String(l.text).slice(0, 16)) + "”</span>" +
          '<span class="ap-c"><select class="ap-sel" data-cast-line="' + i + '" aria-label="第 ' + (i + 1) + ' 句对白是谁说的">' +
          '<option value="">旁白</option>' +
          names.map(function (n) { return '<option value="' + esc(n) + '"' + (l.speaker === n ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") +
          "</select></span></div>");
      });
      h.push("</section>");
    }
    body.innerHTML = h.join("");
    castWire();
  }
  function castWire() {
    var body = qs("#castBody");
    var on = qs("#castOn");
    if (on) on.addEventListener("change", function () {
      CAST.on = on.checked;
      if (CAST.on && !(CAST.lines || []).length) castScan();
      castPut(CAST); castApplyUnits(); castRender();
      var box = qs("#ttsCast"); if (box) box.checked = CAST.on;
      toast(CAST.on ? "多角色朗读：已开启（旁白仍用你选的音色）" : "多角色朗读：已关闭", "users");
      if (TTS.eng && TTS.eng.playing()) TTS.eng.seekIdx(TTS.eng.idx());
    });
    var sc = qs("#castScan");
    if (sc) sc.addEventListener("click", function () { castScan(); castApplyUnits(); castRender(); toast("已按对白重新识别角色", "users"); });
    var cl = qs("#castClear");
    if (cl) cl.addEventListener("click", function () { CAST = { on: false, chars: {}, lines: [] }; castPut(null); castApplyUnits(); castRender(); var b = qs("#ttsCast"); if (b) b.checked = false; toast("本书角色表已清空", "rotate-ccw"); });
    var mo = qs("#castModel");
    if (mo) mo.addEventListener("click", function () { castModel(); });
    body.querySelectorAll("[data-cast-gender]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var c = CAST.chars[sel.dataset.castGender]; if (!c) return;
        c.gender = sel.value; c.locked = !!sel.value;
        InkCast.assignVoices(CAST.chars, castPool().map(function (v) { return { k: v.k, name: v.name, gender: v.gender }; }));
        castPut(CAST); castApplyUnits(); castRender();
      });
    });
    body.querySelectorAll("[data-cast-voice]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var c = CAST.chars[sel.dataset.castVoice]; if (!c) return;
        if (sel.value) { c.voiceK = sel.value; c.locked = true; } else { delete c.voiceK; c.locked = false; }
        castPut(CAST); castApplyUnits(); castRender();
      });
    });
    body.querySelectorAll("[data-cast-line]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var l = CAST.lines[Number(sel.dataset.castLine)]; if (!l) return;
        l.speaker = sel.value; l.user = true;
        castPut(CAST); castApplyUnits();
      });
    });
  }
  /* L2：让模型按上下文判归属。白名单在本地（cast.js 的 applyModel），模型点的新名字不写进角色表。 */
  async function castModel() {
    if (!(window.API && API.hasModel && API.hasModel()) || !API.llm) { toast("要先在「主脑 · 模型配置」里填好模型", "alert-triangle"); return; }
    if (!(CAST.lines || []).length) castScan();
    var names = Object.keys(CAST.chars || {});
    if (names.length < 2) { toast("先认出两个以上角色再让模型判", "info"); return; }
    toast("正在让模型判对白归属…", "brain");
    var lines = CAST.lines.slice(0, 120);
    var list = lines.map(function (l, i) { return (i + 1) + ". " + String(l.text).slice(0, 80); }).join("\n");
    var sys = "你是中文小说的对白归属标注器。只输出 JSON 数组，不要解释、不要代码块。";
    var usr = "已知角色：" + names.join("、") + "\n下面是按顺序出现的对白。给每一句判一个说话人；判不出就用 null。\n" +
      "输出格式：[{\"i\":1,\"speaker\":\"角色名\"},…]（i 从 1 开始，对应下面的序号）\n\n" + list;
    try {
      /* API.llm 的签名是 (sys, user) —— 别按变量名顺序顺手写反（v2.25.0 首版就反过一次） */
      var txt = String(await API.llm(sys, usr, { temp: 0.1, maxTokens: 1200, timeout: 45000 }) || "");
      var m = txt.match(/\[[\s\S]*\]/);
      var arr = m ? JSON.parse(m[0]) : null;
      if (!Array.isArray(arr)) { toast("模型没给出可用的 JSON，保留规则识别结果", "alert-triangle"); return; }
      var pairs = arr.map(function (x) { return { i: Number(x && x.i) - 1, speaker: x && x.speaker }; }).filter(function (x) { return x.i >= 0; });
      InkCast.applyModel(CAST, pairs);
      castPut(CAST); castApplyUnits(); castRender();
      toast("模型归属已并入（" + pairs.length + " 句）", "circle-check");
    } catch (e) {
      toast("模型判归属失败，保留规则结果：" + String((e && e.message) || e).slice(0, 40), "alert-triangle");
    }
  }
  (function castBind() {
    var box = qs("#ttsCast");
    if (box) {
      box.checked = !!CAST.on;
      box.addEventListener("change", function () {
        CAST.on = box.checked;
        if (CAST.on && !(CAST.lines || []).length) castScan();
        castPut(CAST); castApplyUnits();
        toast(CAST.on ? "多角色朗读：已开启" : "多角色朗读：已关闭", "users");
        if (TTS.eng && TTS.eng.playing()) TTS.eng.seekIdx(TTS.eng.idx());
      });
    }
    var open = qs("#ttsCastOpen");
    if (open) open.addEventListener("click", function () {
      hideSpeedPop();
      if (!(CAST.lines || []).length) castScan();
      castRender();
      var p = qs("#castPanel");
      if (p) { p.hidden = false; requestAnimationFrame(function () { p.classList.add("on"); }); }
    });
    var x = qs("#castX");
    if (x) x.addEventListener("click", function () {
      var p = qs("#castPanel");
      if (p) { p.classList.remove("on"); setTimeout(function () { p.hidden = true; }, 240); }
    });
  })();
  castApplyUnits();

  /* ------------------------------------------------------------
     v2.25.1 · 阅读设置（方案 B）：翻页（自动翻页档位）/ 朗读（语速·音量·音色·兜底·多角色）/
     排版（转发 Aa）。与各既有控件同源：同键、同 setter —— 开面板先同步现况，
     这里改一处，朗读条弹层下次打开即同值。
     ------------------------------------------------------------ */
  (function () {
    var sheet = qs("#readSet");
    if (!sheet) return;
    function setSync() {
      qsa("#rsAutoSeg .seg-btn").forEach(function (b) {
        b.classList.toggle("on", Math.abs(parseFloat(b.dataset.rsa) - AUTO.mult) < 1e-9);
      });
      var ah = qs("#rsAutoHint");
      if (ah) ah.textContent = "现档 " + AUTO.mult + "× · " + autoReadTxt();
      var asw = qs("#rsAutoSw");
      if (asw) { asw.classList.toggle("on", !!AUTO.on); asw.setAttribute("aria-pressed", String(!!AUTO.on)); }
      var sp = qs("#rsSpd");
      if (sp) sp.value = TTS.speed;
      var spv = qs("#rsSpdVal");
      if (spv) spv.textContent = TTS.speed + "×";
      paintVolUI();
      var sel = qs("#rsVoice");
      if (sel && window.InkVoice) {
        var on = InkVoice.list().filter(function (v) { return v.installed && v.edge; });
        sel.innerHTML = on.map(function (v) {
          return '<option value="' + v.k + '">' + esc(v.name) + "</option>";
        }).join("");
        sel.value = InkVoice.current();
      }
      var fb = qs("#rsFb");
      var fbon = !!(window.API && API.ttsSysFallback && API.ttsSysFallback());
      if (fb) { fb.classList.toggle("on", fbon); fb.setAttribute("aria-pressed", String(fbon)); }
      var cst = qs("#rsCast");
      if (cst) { cst.classList.toggle("on", !!CAST.on); cst.setAttribute("aria-pressed", String(!!CAST.on)); }
    }
    function setOpen() {
      hideSpeedPop();
      if (morePop && !morePop.hidden) closeMore();
      var t = qs("#tAa2");
      if (t && t.classList.contains("active")) t.click();   /* 同时只留一张 sheet：版式开着就让位 */
      setSync();
      sheet.hidden = false;
      requestAnimationFrame(function () { sheet.classList.add("on"); });
    }
    function setClose() {
      sheet.classList.remove("on");
      setTimeout(function () { sheet.hidden = true; }, 240);
    }
    qs("#tReadSet").addEventListener("click", function () { closeMore(); setOpen(); });
    var ims = qs("#immSet");
    if (ims) ims.addEventListener("click", function () { setOpen(); });
    qs("#setX").addEventListener("click", function () { setClose(); });
    /* Esc 先关面板（capture 置 __inkEscHandled，免得同一键又触发沉浸态退出） */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !sheet.hidden && !e.__inkEscHandled) {
        e.preventDefault(); e.__inkEscHandled = true; setClose();
      }
    }, true);
    /* 翻页：档位直写 AUTO.mult（与 autoStep 同一套存档/重定时） */
    qsa("#rsAutoSeg .seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        AUTO.mult = parseFloat(b.dataset.rsa) || 1;
        autoSave(); autoPaint(); autoRetime(); setSync();
      });
    });
    qs("#rsAutoSw").addEventListener("click", function () { autoToggle(); setSync(); });
    /* 朗读：语速 —— 与 #ttsSpeedRange 同一写入（TTS.speed + 同键 + 播放中即换） */
    qs("#rsSpd").addEventListener("change", function () {
      TTS.speed = Math.max(0.5, Math.min(3, parseFloat(this.value) || 1));
      try { localStorage.setItem("inkread.tts.speed.v1", String(TTS.speed)); } catch (e) {}
      paintSpeedUI(); setSync();
      if (TTS.eng && TTS.eng.playing()) TTS.eng.setSpeed(TTS.speed);
    });
    /* 音量 —— API.ttsVol 唯一真源（写键 + 正在放的那条音频当场改） */
    function applyVol(v) {
      if (window.API && API.ttsVol) API.ttsVol(v);
      paintVolUI();
    }
    qs("#rsVol").addEventListener("input", function () { applyVol(this.value); });
    var tvo = qs("#ttsVolRange");
    if (tvo) tvo.addEventListener("input", function () { applyVol(this.value); });
    qs("#rsVoice").addEventListener("change", function () {
      InkVoice.setCurrent(this.value);
      if (TTS.eng) TTS.eng.setVoice(this.value);
      paintVoiceSel();
      toast("朗读音色： " + InkVoice.meta(this.value).name, "audio-lines");
    });
    qs("#rsFb").addEventListener("click", function () {
      var on = this.getAttribute("aria-pressed") !== "true";
      API.ttsSysFallback(on);
      this.classList.toggle("on", on); this.setAttribute("aria-pressed", String(on));
      var box = qs("#ttsSysFb"); if (box) box.checked = on;
      toast(on ? "神经合成失败时改用本机声线" : "只保留特色音色：失败就停下并说明原因", "audio-lines");
    });
    qs("#rsCast").addEventListener("click", function () {
      var on = this.getAttribute("aria-pressed") !== "true";
      CAST.on = on;
      if (CAST.on && !(CAST.lines || []).length) castScan();
      castPut(CAST); castApplyUnits();
      var box = qs("#ttsCast"); if (box) box.checked = on;
      this.classList.toggle("on", on); this.setAttribute("aria-pressed", String(on));
      toast(on ? "多角色朗读：已开启" : "多角色朗读：已关闭", "users");
      if (TTS.eng && TTS.eng.playing()) TTS.eng.seekIdx(TTS.eng.idx());
    });
    /* 排版：转发 Aa 面板（先收起自己，等滑动动画起步再叫版式） */
    qs("#rsAa").addEventListener("click", function () {
      setClose();
      setTimeout(function () { var t = qs("#tAa2"); if (t) t.click(); }, 120);
    });
  })();

  /* 本机声线兜底开关：默认关（api.js 的 sysFallbackOn 是唯一真源，这里只做镜像） */
  (function () {
    var box = qs("#ttsSysFb");
    if (!box || !window.API || !API.ttsSysFallback) return;
    box.checked = !!API.ttsSysFallback();
    box.addEventListener("change", function () {
      API.ttsSysFallback(box.checked);
      toast(box.checked ? "神经合成失败时改用本机声线" : "只保留特色音色：失败就停下并说明原因", "audio-lines");
    });
  })();
  /* 定时弹层：不定时 / 读完本章 / 10 / 30 分钟（对齐起点读书） */
  function paintTimerBtn() {
    qs("#ttsTimer").title = "定时停止 · " + TTS.timerLabel;
  }
  qs("#ttsTimer").addEventListener("click", function () {
    var pop = qs("#ttsTimerPop");
    if (!pop.hidden) { hideTimerPop(); return; }
    hideSpeedPop(); paintTimerBtn();
    placePop(pop, qs("#ttsTimer"));
  });
  qsa("#ttsTimerPop button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!TTS.eng) return;
      var v = b.dataset.timer;
      if (v === "0") {
        TTS.eng.setDeadline(0); TTS.eng.setStopBi(null); TTS.timerLabel = "不定时";
      } else if (v === "chapter") {
        var curUnit = SPEAK_UNITS[Math.min(TTS.eng.idx(), SPEAK_UNITS.length - 1)];
        var stop = null;
        for (var k = curUnit.bi + 1; k < blocks.length; k++) {
          if (blocks[k].type === "h1" || blocks[k].type === "h2" || blocks[k].type === "h3") { stop = k; break; }
        }
        if (stop == null) { toast("本书到这里就是最后一章了", "info"); return; }
        TTS.eng.setDeadline(0); TTS.eng.setStopBi(stop); TTS.timerLabel = "读完本章";
      } else {
        TTS.eng.setDeadline(Date.now() + parseInt(v, 10) * 60000);
        TTS.eng.setStopBi(null); TTS.timerLabel = v + " 分钟";
      }
      qsa("#ttsTimerPop button").forEach(function (x) { x.classList.toggle("on", x === b); });
      paintTimerBtn(); hideTimerPop();
    });
  });

  /* 入口 B/C：点击任意段落起读 / 续读（@Voice 式）。
     划词、批注控件、修改模式一律让路；正在朗读时气泡变为「从此处续读」。 */
  function showTtsPop(el, bi) {
    TTS.popBi = bi;
    var playing = TTS.eng && TTS.eng.playing();
    qs("#ttsPopGo").innerHTML = icon("play", 13) + "<span>" + (playing ? "从此处续读" : "从此朗读") + "</span>";
    placePop(qs("#ttsPop"), el);
  }
  qs("#doc").addEventListener("click", function (e) {
    if (!CAN_SPEAK || EDIT.on) return;
    if (e.target.closest(".hl, .nref, .note-ref, .task-flag, .task-src, .tool-btn, .sel-bar")) return;
    var sel = window.getSelection();
    if (sel && String(sel).trim()) return;
    /* 左右 30% 是翻页区（v2.9 纸面 tap 翻页）——不弹朗读气泡，给翻页让路 */
    if (!state.scroll) {
      var bx = bookTapZone(e);
      if (bx < TAP_ZONE || bx > 1 - TAP_ZONE) return;
    }
    var el = e.target.closest("[data-bi]");
    if (!el) return;
    var bi = parseInt(el.getAttribute("data-bi"), 10);
    var isUnit = SPEAK_UNITS.some(function (u) { return u.bi === bi; });
    if (!isUnit) return;
    showTtsPop(el, bi);
  });
  qs("#ttsPopGo").addEventListener("click", function () {
    if (TTS.popBi == null) return;
    startTTS(TTS.popBi);
  });
  document.addEventListener("pointerdown", function (e) {
    if (!e.target.closest("#ttsPop")) hideTtsPop();
    if (!e.target.closest("#ttsSpeedPop, #ttsSpeed")) hideSpeedPop();
    if (!e.target.closest("#ttsTimerPop, #ttsTimer")) hideTimerPop();
  });
  qs("#sheet").addEventListener("scroll", hideTtsPop, { passive: true });
  window.addEventListener("resize", hideTtsPop);

  /* ============================================================
     6.5 任务抽屉：阅读时随时调出 · 勾画即打卡
     调研结论落地：
     ① 非模态（Material 标准底部面板 / Stella 侧抽屉规范）——不加遮罩，正文可继续阅读；
     ② 桌面端右侧滑入、窄屏转底部抽屉，主操作落在拇指区；
     ③ 无障碍：aria-expanded / aria-checked、Esc 收起、≥44px 命中区、减少动效时直切。
     ============================================================ */
  var tDrawer = qs("#taskDrawer");
  var tOpen = false;
  /* 任务清单来源：mock + 本机导入任务的合并视图（导入文档的任务也会出现在抽屉里） */
  var TD_LIST = (window.API && API.localTasks ? API.localTasks() : DB.tasks.slice())
    .filter(function (t) { return t.docId === docId; });

  function tChecked() { return InkStore.getCheckins(); }

  function paintTaskDrawer() {
    var ck = tChecked();
    var doneN = TD_LIST.filter(function (t) { return ck[t.id]; }).length;
    var pct = TD_LIST.length ? Math.round(doneN / TD_LIST.length * 100) : 0;

    qs("#tdScope").textContent = doc.type === "plan" ? "计划" : "文档";
    qs("#tdRing").style.setProperty("--p", pct);
    qs("#tdRing").querySelector("i").textContent = pct + "%";
    qs("#tdCount").textContent = TD_LIST.length ? doneN + " / " + TD_LIST.length + " 已打卡" : "本文无任务";
    qs("#tdNote").textContent = TD_LIST.length ? doc.title + " · 每日例行与月度任务" : doc.title + " 未解析出任务";
    qs("#tdBar").style.width = pct + "%";

    var list = TD_LIST.filter(function (t) {
      var on = !!ck[t.id];
      if (state.tfilter === "todo") return !on;
      if (state.tfilter === "done") return on;
      return true;
    });

    if (!TD_LIST.length) {
      qs("#tdBody").innerHTML = '<div class="empty">' + icon("list-checks", 26) +
        "<p>本文档未解析出任务<br>可前往「任务」页查看全部清单</p></div>";
    } else if (!list.length) {
      var onlyDone = state.tfilter === "done";
      qs("#tdBody").innerHTML = '<div class="empty">' + icon(onlyDone ? "clock" : "circle-check", 26) +
        "<p>" + (onlyDone ? "还没有已打卡的任务" : "今日任务已全部完成<br>保持这个节奏") + "</p></div>";
    } else {
      qs("#tdBody").innerHTML = list.map(function (t) {
        var on = !!ck[t.id];
        return '<div class="td-item' + (on ? " done" : "") + '" data-task="' + t.id + '">' +
          '<button type="button" class="td-cb" role="checkbox" aria-checked="' + (on ? "true" : "false") +
            '" data-tcheck="' + t.id + '" aria-label="' + esc(t.title) + " · " + (on ? "已打卡" : "待完成") + '">' +
            icon("check", 13) + "</button>" +
          '<div class="td-body-wrap">' +
            '<div class="td-name" data-tgo="' + t.id + '">' + esc(t.title) + "</div>" +
            '<div class="td-meta">' +
              (t.time || t.monthLabel ? '<span class="td-time">' + esc(t.time || t.monthLabel) + "</span>" : "") +
              '<span class="td-src">' + esc(t.src) + "</span>" +
              (on ? '<span class="td-stamp">已打卡 ' + esc(ck[t.id]) + "</span>" : "") +
              '<button type="button" class="td-go" data-tgo="' + t.id + '">原文定位 ›</button>' +
            "</div>" +
          "</div>" +
        "</div>";
      }).join("");
    }

    var todo = TD_LIST.length - doneN;
    [qs("#taskBadge"), qs("#immTaskBadge")].forEach(function (b) {
      if (!b) return;
      b.textContent = String(todo);
      b.classList.toggle("zero", todo === 0);
      b.style.display = TD_LIST.length ? "" : "none";
    });
    [qs("#tTasks"), qs("#immTasks")].forEach(function (b) {
      if (!b) return;
      b.classList.toggle("active", tOpen);
      b.setAttribute("aria-expanded", tOpen ? "true" : "false");
    });
  }

  /* 正文里的任务出处按钮需就地回写勾选态（正文 HTML 只在启动时构建一次） */
  function syncTaskFlags() {
    var ck = tChecked();
    qsa(".task-flag").forEach(function (b) {
      var on = !!ck[b.dataset.task];
      b.innerHTML = icon("list-checks", 11) + (on ? "已打卡" : "任务");
      b.classList.toggle("on", on);
    });
  }

  function openTasks(focusId) {
    if (!tOpen) {
      tOpen = true;
      panelWin("task", { el: tDrawer, id: "task", label: "任务清单", handle: ".td-head", bar: ".td-head",
        x: "#tdClose", width: 344, wmin: 300, side: "right", shown: function () { return tOpen; }, close: closeTasks });
      tDrawer.dataset.open = "on";
      tDrawer.setAttribute("aria-hidden", "false");
      pwApply("task");
    }
    paintTaskDrawer();
    if (focusId) {
      var row = qs('#tdBody .td-item[data-task="' + CSS.escape(focusId) + '"]');
      if (row) {
        row.classList.add("focus");
        /* 只在抽屉自己的滚动容器里纵向定位 —— 不用 scrollIntoView：
           它会为了把行「滚入视野」而横向滚动祖先容器（把正文推歪，
           关闭抽屉后残留空白，见 v2.3 修复记录）。 */
        var body = qs("#tdBody");
        if (body) {
          var target = row.offsetTop - body.clientHeight / 2 + row.offsetHeight / 2;
          body.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
        }
        setTimeout(function () { row.classList.remove("focus"); }, 2400);
      }
    }
  }
  function closeTasks() {
    if (!tOpen) return;
    tOpen = false;
    tDrawer.dataset.open = "off";
    pwApply("task");
    tDrawer.setAttribute("aria-hidden", "true");
    paintTaskDrawer();
  }
  function toggleTasks() { tOpen ? closeTasks() : openTasks(); }

  function locateTask(id) {
    var t = TD_LIST.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    gotoAnchor(t.anchor);
    flashEl(t.anchor);
  }

  qs("#tTasks").addEventListener("click", function () { toggleTasks(); InkFX.ripple(qs("#tTasks")); });
  qs("#immTasks").addEventListener("click", function () { toggleTasks(); immWake(); });
  qs("#tdClose").addEventListener("click", closeTasks);

  qsa("#tdSeg .seg-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      qsa("#tdSeg .seg-btn").forEach(function (x) { x.classList.remove("on"); x.setAttribute("aria-selected", "false"); });
      b.classList.add("on");
      b.setAttribute("aria-selected", "true");
      state.tfilter = b.dataset.tfilter;
      paintTaskDrawer();
    });
  });

  qs("#tdBody").addEventListener("click", async function (e) {
    var go = e.target.closest("[data-tgo]");
    if (go) { locateTask(go.dataset.tgo); return; }
    var cb = e.target.closest("[data-tcheck]");
    if (!cb) return;
    var id = cb.dataset.tcheck;
    var wasOn = cb.getAttribute("aria-checked") === "true";
    cb.disabled = true;
    if (wasOn) {
      await API.undoCheckin(id);
      toast("已撤销打卡", "undo-2");
    } else {
      var r = await API.checkin(id);
      InkFX.flash();
      toast("已打卡 " + r.data.time + " · 双端已同步", "stamp");
    }
    cb.disabled = false;
    paintTaskDrawer();
    syncTaskFlags();
  });

  /* 窄屏底部抽屉：下滑收起 */
  (function () {
    var grip = qs("#tdGrip"), y0 = null;
    grip.addEventListener("pointerdown", function (e) { y0 = e.clientY; });
    grip.addEventListener("pointerup", function (e) {
      if (y0 !== null && e.clientY - y0 > 46) closeTasks();
      y0 = null;
    });
  })();

  /* ============================================================
     7. 全屏沉浸阅读：中央呼出浮层 · 3.2s 无操作淡出 · Esc 退出
     ============================================================ */
  var imm = { on: false, timer: null, lastDrag: 0 };
  var immTop = qs("#immTop"), immBot = qs("#immBot");

  function immBars(show) { immTop.classList.toggle("hide", !show); immBot.classList.toggle("hide", !show); }
  function immIdle() {
    clearTimeout(imm.timer);
    if (!imm.on) return;
    imm.timer = setTimeout(function () { immBars(false); }, 3200);
  }
  function immWake() { if (!imm.on) return; immBars(true); immIdle(); }

  function immChapter() {
    var h = qs("#doc h1, #doc h2, #doc h3");
    return h ? h.textContent : "正文";
  }
  function immSync() {
    var w = qs("#readBar").style.width || "0%";
    qs("#immBar").style.width = w;
    qs("#immPct").textContent = w;
    qs("#immPage").textContent = qs("#pageInd").textContent;
    qs("#immChapter").textContent = immChapter();
    qs("#immMark").classList.toggle("active", !!read.marks);
  }

  function enterImm() {
    if (imm.on) return;
    imm.on = true;
    scPulse("immerse");
    document.body.classList.add("immersive");
    var el = document.documentElement;
    if (el.requestFullscreen) { try { el.requestFullscreen().catch(function () {}); } catch (e) {} }
    immBarPad();
    repaginate(false);
    immWake();
    toast("已进入全屏沉浸阅读 · 点击纸面中央呼出控件", "maximize");
  }
  function exitImm() {
    if (!imm.on) return;
    imm.on = false;
    clearTimeout(imm.timer);
    document.body.classList.remove("immersive");
    immBars(false);
    scPulse("immerse");
    if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen().catch(function () {}); } catch (e) {} }
    immBarPad();
    repaginate(false);
    toast("已退出全屏", "minimize");
  }
  function toggleImm() { imm.on ? exitImm() : enterImm(); }

  qs("#tFull").addEventListener("click", toggleImm);
  qs("#immExit").addEventListener("click", exitImm);
  qs("#immPrev").addEventListener("click", function () { go(-1); immWake(); });
  qs("#immNext").addEventListener("click", function () { go(1); immWake(); });
  qs("#immMark").addEventListener("click", function () { patch({ marks: !read.marks }, !read.marks ? "已显示批注标记" : "已隐藏批注标记", "highlighter"); immWake(); });
  /* 沉浸态的批注入口：直接在全屏内滑出面板，不再退出全屏（体验排查 P1） */
  qs("#immNotes").addEventListener("click", function () {
    var r = qs("#reader");
    var open = r.dataset.notes === "open";
    r.dataset.notes = open ? "closed" : "open";
    if (!open) { setSide(false); switchNoteTab("list"); }
    immWake();
  });
  /* 面板显式关闭：✕ 与 Esc（体验排查 P2；Esc 先收面板，收无可收才谈别的） */
  qs("#icNotesClose").innerHTML = icon("x", 14);
  function closeNotesPanel() { qs("#reader").dataset.notes = "closed"; }
  qs("#notesClose").addEventListener("click", function () { closeNotesPanel(); immWake(); });
  document.addEventListener("keydown", function (e) {
    if (window.InkKeys && InkKeys.isOpen()) return;   /* 命令面板 / 总览置顶：Esc 先归它们 */
    if (e.key !== "Escape" || e.__inkEscHandled) return;   /* 层栈已收过最上面一层：本链让路 */
    /* 草稿纸浮窗在最上层：先收它（v2.10）。注意必须走 InkModes.closePanel ——
       它负责清 panelKey 与工具条高亮，否则下次点「草稿纸」会被当成「再点一次＝收起」。 */
    if (window.InkPadWin && InkPadWin.isOpen()) {
      e.stopPropagation();
      if (window.InkModes && InkModes.closePanel) InkModes.closePanel(); else InkPadWin.close();
      return;
    }
    if (qs("#reader").dataset.notes === "open") { e.stopPropagation(); closeNotesPanel(); immWake(); return; }
    if (qs("#reader").dataset.side === "open") { setSide(false); immWake(); }
  }, true);
  [immTop, immBot].forEach(function (bar) { bar.addEventListener("pointerdown", immWake); });

  /* ============================================================
     6.5.1 批注浮窗（v2.10 · 迁入 InkDock 通用组件）
     ------------------------------------------------------------
     演进：v2.5「可拖 · 可缩放 · 可最大化 · 形态记忆」
           v2.10 增加「靠边吸附 → 停靠成侧栏」（用户诉求：「像 Word 工具栏那样，
           浮窗能贴边变成侧栏」，参考 Typora / VS 工具窗口）。
     几何、拖动、缩放、吸附、持久化一律交给 dock.js（草稿纸画板共用同一组件），
     本块只负责「宿主侧的事」：
       ① 定位容器（#reader）与最大化上界（正文台顶，撑满正文区但不遮顶栏）；
       ② 窄屏策略（≤700px 一律最大化 —— 8px 的拖拽靶子在触屏上没有意义）；
       ③ 开合 / 缩放 / 沉浸进出后的重算；
       ④ 开合 / 缩放 / 沉浸进出后的重算与 toast。
     开合机制一行没动（仍是 #reader[data-notes]），旧键 inkread.notewin.v1 读一次即迁移。
     ============================================================ */
  var nwEl = qs("#notesWin");
  var ndReady = false;
  function nwNarrow() { return window.innerWidth <= 700; }
  /* 最大化上界＝正文台顶（顶栏 + 模式条 + 场景带的高度） */
  function nwMaxTop() {
    var book = qs("#book"), bar = qs(".reader-bar");
    return (book && book.offsetTop) || (bar ? bar.offsetHeight : 0);
  }
  var ndWin = InkDock.create(nwEl, {
    id: "notes", host: "#reader", handle: ["#notesDragBar", "#notesTabs"], grip: "#notesGrip",
    /* W2 头部统一：形态钮插进宿主已有的拖动条尾端，不再另起一条窗控行；
       ✕ 沿用页签条尾部原有的 #notesClose，不造第二只关闭钮。 */
    bar: "#notesDragBar", x: "#notesClose",
    min: { w: 300, h: 320 }, dock: { min: 280, max: 560, width: 340 }, snap: 24,
    maxTop: nwMaxTop, narrow: nwNarrow,
    /* 旧键迁移：v2.5 的 {x,y,w,h,max} → 本组件的 float 形态（旧键不删） */
    migrate: function () {
      try { return JSON.parse(localStorage.getItem("inkread.notewin.v1")); } catch (e) { return null; }
    },
    onState: function (l) {
      if (!ndReady) return;
      if (l.state === "docked") toast("已停靠到" + (l.side === "right" ? "右" : "左") + "侧栏 · 拖标题栏可直接拖出", "panel-right");
      else if (l.state === "max") toast("浮窗已最大化 · 铺满正文区", "maximize-2");
    }
  });
  ndWin.apply();
  ndReady = true;

  /* 每次开合都重算落位：沉浸进出、窗口缩放后，记忆里的坐标可能已越界。
     关闭这一侧同样要 apply() —— 停靠态在 #reader 上挂了 --dock-w-right 让正文让位，
     原来只在「open」时 apply，收起时那份让位没人撤，正文右边就留下一条关不掉的空栏。 */
  new MutationObserver(function () { ndWin.apply(); })
    .observe(qs("#reader"), { attributes: true, attributeFilter: ["data-notes"] });

  /* 窗口变化：窄屏一律全屏；其余只重算边界（记忆值不动，回来时还是原样） */
  window.addEventListener("resize", function () { ndWin.apply(); });

  /* 拖完那一下的 click 不算「点页签」—— 否则拖窗会顺带换页签。
     只管页签：最大化 / 停靠 / 关闭钮本来就起不了拖拽，不必陪着一起被吞。 */
  qs("#notesTabs").addEventListener("click", function (e) {
    if (ndWin.justDragged(240) && e.target.closest(".side-tab")) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ============================================================
     6.5.2 草稿纸浮窗（v2.10）：与批注共用同一套 InkDock
     ------------------------------------------------------------
     旧状：寄生在右侧工具抽屉（.mode-drawer）里 —— 只能贴右通高、画布被压成
           230px 的窄条，底部一大块留白，也不能全屏（用户实测两条反馈）。
     新状：独立浮窗 —— 可拖、可缩放、可最大化，拖到左右边缘吸附成停靠侧栏；
           默认落在正文右下（560×640，画布要的就是面积）。
     内容（工具条 / 调色板 / 画布 / 草稿本）由 modes.js 的 renderPad 负责，
     本块只管「窗」：几何、开合、按钮与 Esc。
     ============================================================ */
  var padEl = qs("#padWin"), padCloseBtn = qs("#padClose");
  var pdReady = false;
  var pdWin = InkDock.create(padEl, {
    id: "pad", host: "#reader", handle: "#padHead",
    bar: "#padHead", x: "#padClose",
    min: { w: 380, h: 420 }, dock: { min: 320, max: 640, width: 400 }, snap: 24,
    maxTop: nwMaxTop, narrow: nwNarrow,
    onState: function (l) {
      if (!pdReady) return;
      if (l.state === "docked") toast("草稿纸已停靠到" + (l.side === "right" ? "右" : "左") + "侧栏 · 拖标题栏可直接拖出", "panel-right");
    }
  });
  qs("#icPadClose").innerHTML = icon("x", 14);
  pdWin.apply();
  pdReady = true;

  window.InkPadWin = {
    el: padEl,
    dock: pdWin,
    isOpen: function () { return padEl.dataset.open === "on"; },
    open: function () {
      padEl.dataset.open = "on";
      padEl.setAttribute("aria-hidden", "false");
      pdWin.apply();                       /* 开合后重算落位（记忆值越界时夹回来） */
      var cv = qs("#padCv");
      if (cv && cv.focus) cv.focus();
    },
    close: function () {
      if (!window.InkPadWin.isOpen()) return;
      if (window.InkModes && InkModes.savePadDraft) InkModes.savePadDraft();   /* 收起草稿不丢 */
      padEl.dataset.open = "off";
      padEl.setAttribute("aria-hidden", "true");
      pdWin.apply();                       /* 同批注浮窗：收起时要让 dock 撤掉正文的让位 */
    },
    apply: function () { pdWin.apply(); }
  };
  padCloseBtn.addEventListener("click", function () {
    if (window.InkModes && InkModes.closePanel) InkModes.closePanel(); else InkPadWin.close();
  });
  window.addEventListener("resize", function () { if (window.InkPadWin.isOpen()) pdWin.apply(); });
  /* ---------- 完整笔记（第三页签）：懒加载 notes.html?embed=1 ----------
     iframe 只在首次切到本页签时创建；切走不销毁、收起浮窗也不销毁 ——
     编辑状态留在里面，下次点开就是刚才那一屏（本地服务，首次也就百毫秒级）。
     内部交互（顶部细条 / doc 过滤 / ✕）由 notes.html 的 embed 模式自理；
     本页只认一条约定消息：inkread:embed-close → 收浮窗并切回批注页签。 */
  var embedFrame = null;
  function ensureEmbed() {
    if (embedFrame) return embedFrame;
    embedFrame = document.createElement("iframe");
    embedFrame.id = "noteEmbed";
    embedFrame.title = "完整笔记 · 本机笔记工作台";
    embedFrame.src = "notes.html?embed=1&doc=" + encodeURIComponent(docId);
    qs("#noteEmbedBox").appendChild(embedFrame);
    return embedFrame;
  }
  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "inkread:embed-close") return;
    if (!embedFrame || e.source !== embedFrame.contentWindow) return;   /* 只认自己装的这一枚 */
    closeNotesPanel();
    switchNoteTab("list");
    immWake();
  });

  /* 纸面中央点击呼出 / 隐藏控件；拖拽翻页与划词不触发 */
  /* 纸面点击（v2.9）：左 30% 上一页 / 右 30% 下一页 —— paged 模式，触屏与鼠标一致
     （手机阅读 App 的标准交互）；中央 40% 在沉浸态呼出 / 隐藏控件；
     拖拽翻页刚结束、划词、交互元素上一律不触发。 */
  var TAP_ZONE = 0.3;
  function bookTapZone(e) {
    var r = qs("#book").getBoundingClientRect();
    return (e.clientX - r.left) / Math.max(1, r.width);
  }
  qs("#book").addEventListener("click", function (e) {
    if (Date.now() - (imm.lastDrag || 0) < 320) return;
    if (e.target.closest(".hl, .nref, .note-ref, .task-flag, .task-src, .sel-bar, .tool-btn, a, button")) return;
    var sel = window.getSelection();
    if (sel && String(sel).trim()) return;
    if (!state.scroll && !EDIT.on) {
      var x = bookTapZone(e);
      if (x < TAP_ZONE) { go(-1); if (imm.on) immWake(); return; }
      if (x > 1 - TAP_ZONE) { go(1); if (imm.on) immWake(); return; }
    }
    if (!imm.on) return;
    if (immTop.classList.contains("hide")) immWake();
    else { clearTimeout(imm.timer); immBars(false); }
  });

  /* 鼠标靠近上下边缘自动呼出。
     v2.24.1 修两件事（实测复现）：① 带子原来是 62 / 70px —— 沉浸态里窗口标题栏就贴着屏幕最顶
     （形态钮实测在 y≈9–37），鼠标一往上走就叫出 46px 高的顶栏，把形态钮整条盖住
     （命中测试：点在「靠右停靠」钮中心，命中 #immBar）⇒ 切不回浮动形态；
     ② 指针正压在手柄/形态钮上时绝不唤醒 —— 保证「把鼠标移向标题栏」这个动作本身不会叫出顶栏。
     顶栏仍够得着：贴最上沿几像素，或点纸面中央（既有的呼出/隐藏开关）。 */
  window.addEventListener("pointermove", function (e) {
    if (!imm.on || !immTop.classList.contains("hide")) return;
    var t = e.target;
    if (t && t.closest && t.closest("[data-inkw-bar], .inkw-bar, .inkw-btn")) return;
    if (e.clientY <= 8 || e.clientY >= window.innerHeight - 12) immWake();
  });

  /* 浏览器原生退出全屏（Esc / F11）时同步退出沉浸态 */
  document.addEventListener("fullscreenchange", function () {
    if (!document.fullscreenElement && imm.on) {
      imm.on = false;
      clearTimeout(imm.timer);
      document.body.classList.remove("immersive");
      immBars(false);
      repaginate(false);
    }
  });

  /* ---------- 竖向浏览：滚动进度同步（rAF 合并，避免每帧写库） ---------- */
  var scrollTick = 0;
  qs("#sheet").addEventListener("scroll", function () {
    if (!state.scroll || scrollTick) return;
    scrollTick = requestAnimationFrame(function () {
      scrollTick = 0;
      var pct = Math.round(scrollRatio() * 100);
      qs("#readBar").style.width = pct + "%";
      paintProg();
      InkStore.setProgress(docId, pct);
      markToc();
      immSync();
      statBumpWords();     /* v2.7 统计埋点：滚动位置前进时按字符偏移累计字数 */
    });
  }, { passive: true });

  /* ---------- 窗口变化重新分页 ---------- */
  var rz;
  window.addEventListener("resize", function () {
    clearTimeout(rz);
    rz = setTimeout(function () { repaginate(false); }, 180);
  });

  /* ============================================================
     6.6 文档修改（v14）：阅读上锁 · 解锁改字 · 恢复原文
     调研结论（Word「限制编辑 · 只读」/ WPS PDF「打开密码 + 编辑密码」/ Adobe「Edit PDF」独立模式）：
     ① 默认上锁 —— 正文只读，划词 / 翻页 / 点选都不会改动一个字，防的是「误触改坏论文」；
     ② 解锁才进修改模式 —— 只改文字、不改格式（字体 / 字号 / 版式仍归 Aa 面板，正文格式天然不受影响）；
     ③ 即改即存（与 Aa 面板同一约定）—— 失焦即落库，翻页不丢字；
     ④ 留退路 —— 「恢复原文」一键抹掉本文档全部改动。
     实现取巧处：修改模式一律走「竖向浏览」，全篇正文同处一个 DOM，改字不必与分页打架；
     退出时回到用户原本的阅读方式，并按字符偏移锚回原处（不回到章首）。
     ============================================================ */
  var EDIT = { on: false };
  /* 可改字的块：正文 / 标题 / 摘要 / 题名行 / 引文。
     表格 / 公式 / 代码 / 图版不进修改模式 —— 它们各有结构，改坏了读者无从还原，不如不改。 */
  var EDIT_TYPES = { h1: 1, h2: 1, h3: 1, p: 1, quote: 1, abstract: 1, meta: 1 };
  var editPrevScroll = null;

  function editableIdx() {
    var out = [];
    /* mdx 是「表格救活」留下的空占位块，本身不产 DOM，不能进改字列表 */
    blocks.forEach(function (b, i) { if (EDIT_TYPES[b.type] && !b.mdx) out.push(i); });
    return out;
  }

  /* plaintext-only 最稳：粘进来的是纯文字，不会带一坨样式污染纸页 */
  var PLAIN = (function () {
    var d = document.createElement("div");
    d.setAttribute("contenteditable", "plaintext-only");
    return d.contentEditable === "plaintext-only";
  })();

  function paintEditBar() {
    var bar = qs("#editBar");
    if (bar) bar.hidden = !EDIT.on;
    var st = qs("#editState");
    if (st) st.textContent = InkStore.hasDocEdits(docId) ? "改动已自动保存 · 可继续改" : "原文未改动";
    var btn = qs("#tEdit");
    if (btn) {
      btn.classList.toggle("on", EDIT.on);
      btn.setAttribute("aria-pressed", EDIT.on ? "true" : "false");
      btn.innerHTML = icon(EDIT.on ? "lock-open" : "lock", 15) + (EDIT.on ? "修改中" : "已上锁");
      btn.title = EDIT.on ? "退出修改并上锁（改动已自动保存）" : "解锁后可改正文文字（不影响排版格式）";
    }
    /* v2.9.4：沉浸浮条的「修改」与工具栏同源同态 —— 修复「全屏下修改功能失效」
       （解锁入口此前只在非全屏工具栏，进了全屏就够不着） */
    var ib = qs("#immEdit");
    if (ib) {
      ib.classList.toggle("on", EDIT.on);
      ib.setAttribute("aria-pressed", EDIT.on ? "true" : "false");
      var iic = qs("#immIcEdit");
      if (iic) iic.innerHTML = icon(EDIT.on ? "lock-open" : "lock", 15);
      ib.title = EDIT.on ? "退出修改并上锁（改动已自动保存）" : "修改正文（解锁后可改字）";
    }
  }

  function pastePlain(e) {
    e.preventDefault();
    var t = (e.clipboardData || window.clipboardData).getData("text") || "";
    document.execCommand("insertText", false, t);
  }

  function setEditable(on) {
    editableIdx().forEach(function (i) {
      var el = biEl(i);
      if (!el) return;
      if (on) {
        el.classList.add("editable");
        el.setAttribute("contenteditable", PLAIN ? "plaintext-only" : "true");
        if (!PLAIN) el.addEventListener("paste", pastePlain);
      } else {
        el.classList.remove("editable");
        el.removeAttribute("contenteditable");
        if (!PLAIN) el.removeEventListener("paste", pastePlain);
      }
    });
  }

  /* 正文文字变了 → 同步 blocks / BLOCK_HTML / BLOCK_TEXT / BLOCK_OFF，
     否则目录名、检索摘要、进度百分比仍按旧文字算，越读越对不上。 */
  function rebuildIndexes() {
    BLOCK_HTML.length = 0;
    blocks.forEach(function (b) { BLOCK_HTML.push(renderBlock(b)); });
    BLOCK_TEXT.length = 0;
    blocks.forEach(function (b) { BLOCK_TEXT.push(blockText(b)); });
    var acc = 0;
    BLOCK_OFF.length = 0;
    BLOCK_TEXT.forEach(function (s) { BLOCK_OFF.push(acc); acc += Math.max(1, s.length); });
  }

  /* 失焦即存：只存「与原文不同」的块；改回原文 = 删掉这条覆盖 */
  function commitBlock(el, i) {
    if (!blocks[i]) return;
    var txt = (el.textContent || "").replace(/\s+/g, " ").trim();
    var orig = typeof blocks[i].x === "string" ? blocks[i].x.replace(/\s+/g, " ").trim() : "";
    if (!txt) {                       /* 清空不是修改，是误删 —— 退回原文，免得正文被抹成空块 */
      el.textContent = orig;
      toast("空段落已还原为原文");
      return;
    }
    var ed = InkStore.getDocEdits(docId);
    if (txt === orig) {
      if (ed[i] != null) { delete ed[i]; InkStore.setDocEdits(docId, ed); }
    } else {
      InkStore.setDocEdit(docId, i, txt);
    }
    blocks[i] = Object.assign({}, blocks[i], { x: txt });
    rebuildIndexes();
    paintEditBar();
    paintProg();
  }

  /* 把当前正在编辑的块落库（点「完成」或切走时调用） */
  function flushEdit() {
    var a = document.activeElement;
    if (!a || !a.classList || !a.classList.contains("editable")) return;
    var i = biOf(a, -1);
    if (i >= 0) commitBlock(a, i);
    if (a.blur) a.blur();
  }

  function enterEdit() {
    if (EDIT.on) return;
    editPrevScroll = state.scroll;
    var off = curOffset();
    EDIT.on = true;
    document.body.classList.add("doc-edit");
    if (!state.scroll) state.scroll = true;   /* 修改走竖向浏览：全篇同处一个 DOM */
    renderPage(0, false);
    restoreScroll(off);                       /* 重绘会重置滚动，按偏移锚回原处 */
    setEditable(true);
    paintEditBar();
    toast("已解锁：点正文即可改字，改动自动保存", "lock-open");
  }

  function exitEdit() {
    if (!EDIT.on) return;
    flushEdit();
    EDIT.on = false;
    document.body.classList.remove("doc-edit");
    setEditable(false);
    var off = curOffset();
    if (editPrevScroll === false) {           /* 回到用户原本的阅读方式，按偏移锚回原处 */
      state.scroll = false;
      paginate();
      restorePaged(off);
      if (state.cur >= state.pages.length) state.cur = Math.max(0, state.pages.length - 1);
      renderPage(0, false);
    } else {
      renderPage(0, false);
      restoreScroll(off);
    }
    paintEditBar();
    toast("已上锁：正文恢复只读", "lock");
  }

  function restoreOriginal() {
    InkStore.clearDocEdits(docId);
    var off = curOffset();
    blocks = MD.fixTables(sourceBlocks().map(function (b) { return Object.assign({}, b); }));
    rebuildIndexes();
    if (state.scroll) { renderPage(0, false); restoreScroll(off); }
    else { paginate(); restorePaged(off); renderPage(0, false); }
    setEditable(EDIT.on);
    paintEditBar();
    toast("已恢复原文", "rotate-ccw");
  }

  qs("#tEdit").addEventListener("click", function () { EDIT.on ? exitEdit() : enterEdit(); });
  qs("#immEdit").addEventListener("click", function () { (EDIT.on ? exitEdit() : enterEdit()); immWake(); });
  qs("#editDone").addEventListener("click", exitEdit);
  /* 「恢复原文」二次确认：不可撤销的动作，先点一次只是上膛 */
  qs("#editRestore").addEventListener("click", function () {
    if (!InkStore.hasDocEdits(docId)) { toast("本文档还没有改动", "info"); return; }
    if (this.dataset.armed) { restoreOriginal(); this.dataset.armed = ""; this.classList.remove("armed"); return; }
    this.dataset.armed = "1";
    this.classList.add("armed");
    var b = this;
    toast("再点一次确认恢复原文");
    setTimeout(function () { b.dataset.armed = ""; b.classList.remove("armed"); }, 3200);
  });

  /* 失焦落库：事件委托，块增删都不必重新绑定 */
  qs("#doc").addEventListener("focusout", function (e) {
    if (!EDIT.on) return;
    var el = e.target;
    if (!el.classList || !el.classList.contains("editable")) return;
    var i = biOf(el, -1);
    if (i >= 0) commitBlock(el, i);
  });
  /* 粘贴兜底：不支持 plaintext-only 的浏览器里，也保证只进纯文字 */
  qs("#doc").addEventListener("input", function (e) {
    if (!EDIT.on) return;
    var el = e.target;
    if (el.classList && el.classList.contains("editable") && el.children.length) el.textContent = el.textContent;
  });
  /* 修改中按 Esc 先退出修改（就近优先，与退出沉浸同一逻辑） */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && EDIT.on && !e.__inkEscHandled) exitEdit();
  });

  /* 空书空态：正文区给出 .empty（icon + 说明 + 回书架），不渲染空书；
     后续渲染 / 分页 / 目录一概跳过（blocks 为 0 时它们没有意义）。 */
  function renderEmptyDoc(missing) {
    var el = document.createElement("div");
    el.className = "empty";
    el.style.cssText = "margin:16vh auto 0;max-width:440px";
    var none = !!(missing && missing.stored === "none");
    el.innerHTML = icon(none ? "database" : "book", 34) +
      "<p>" + (none
        ? "《" + esc(missing.title || "这本书") + "》的正文没有存进本机<br>" +
          esc((window.API && API.storedNote) ? API.storedNote(missing.storedWhy) : "本机存储不可用") +
          " —— 清理旧书腾出空间后，重新导入原文件"
        : "这本文档没有提取到正文<br>多为扫描版 / 纯图片页 —— 文字层缺失，暂时读不了") +
      "</p>" +
      '<a class="btn btn-ghost" href="index.html" style="margin-top:12px">回书架</a>';
    var docEl = qs("#doc");
    docEl.className = "doc";
    docEl.innerHTML = "";
    docEl.appendChild(el);
    qs("#pageInd").textContent = "0 / 0";
    qs("#flipHint").style.display = "none";
  }

  /* 书不在书架上了（清空数据 / 换了机器的旧深链）：正文区如实说明，
     不给一册空白书，也不抛异常把整页留在空白。 */
  function renderNoDoc(wantId, note) {
    /* 本页没有可操作的对象，事件也一条都没绑：把用不上的阅读控件收掉，
       只留「顶栏返回 + 空态里的回书架」两条出路（收法见上面 body[data-nodoc] 那段）。 */
    document.body.setAttribute("data-nodoc", "1");
    var el = document.createElement("div");
    el.className = "empty";
    el.style.cssText = "margin:16vh auto 0;max-width:460px";
    el.innerHTML = icon("book-open", 34) +
      "<p>" + (note || (wantId
        ? "「" + esc(wantId) + "」已经不在书架上<br>本机数据可能被清空过，或这本书是在别的设备上导入的"
        : "书架还是空的<br>先在书架导入文档，再来这里读")) + "</p>" +
      '<a class="btn btn-ghost" href="index.html" style="margin-top:12px">回书架' + (wantId ? "" : " · 导入文档") + '</a>';
    qs("#docTitle").textContent = note ? "正文不在本机" : (wantId ? "文档不存在" : "还没有可读的书");
    qs("#docKind").style.display = "none";
    var docEl = qs("#doc");
    docEl.className = "doc";
    docEl.innerHTML = "";
    docEl.appendChild(el);
    qs("#pageInd").textContent = "0 / 0";
    qs("#flipHint").style.display = "none";
  }

  /* ============================================================
     8. 工具包（v2.6 · 要求一 + 要求二）
     ------------------------------------------------------------
     ① 按钮单态过滤 —— data-solo="plain|imm"：把「只在某一态才有意义」的按钮
        交给状态管，而不是靠各条工具栏自己记（「全屏」入口 = plain，沉浸态必隐藏）；
     ② 悬浮球 + 双层轮盘 —— 沉浸态右下角一颗球，拖动可挪位（inkread.orb.v1），
        单击开轮盘：一级按阅读/学习模式分类（5 模式 + 中心「全部」），
        二级同心外环列该模式工具，工具一律**调既有入口**（面板 / 开关 / 划选动作 / 主脑），
        不新增第二套实现；轮盘大小三档 小 200 / 中 260 / 大 320（inkread.wheel.v1）；
     ③ AI 速问浮窗 —— 复用 Brain.ask（带当前文档上下文），离线时如实说明。
     几何依据：扇区按角度吸附最近项（Fitz 定律：方向选择快于距离），
     环带 一级 0.34R–0.68R、二级 0.74R–R，全部工具合并后 ≤12 项。
     ============================================================ */
  var TK_ORB_KEY = "inkread.orb.v1", TK_WHEEL_KEY = "inkread.wheel.v1";
  var TK_D = { s: 200, m: 260, l: 320 };        /* 三档直径，默认中 */
  var TK_ORB_SIZE = 44, TK_DRAG_MIN = 6;        /* 拖动阈值：6px 内算点击 */
  var TK_SIZE_CN = { s: "小", m: "中", l: "大" };

  /* ---------- 8.1 工具表：每一项都指回一处既有入口 ----------
     提示文案统一 ≤10 字：中心圆里两行装得下（见 .tk-hub em 的算法），
     再长就要么裁字要么撑出轮盘 —— 用户反馈的「文字不在轮盘里」就是这么来的。 */
  var TK_TOOL = {
    marg:    { label: "随笔",     icon: "pen-line",     hint: "在页边留一句话",   run: function () { tkPanel("marg"); } },
    pad:     { label: "草稿纸",   icon: "pen-line",     hint: "随手涂写成笔记",   run: function () { tkPanel("pad"); } },
    card:    { label: "闪卡",     icon: "layers",       hint: "高亮挖空成问答卡", run: function () { tkPanel("card"); } },
    cite:    { label: "引用摘录", icon: "quote",        hint: "抽参考文献并导出", run: function () { tkPanel("cite"); } },
    back:    { label: "双向链接", icon: "link-2",       hint: "看同处的所有引用", run: function () { tkPanel("back"); } },
    learn:   { label: "任务出处", icon: "list-checks",  hint: "标出任务出处",     run: function () { tkToggle("learn"); } },
    guide:   { label: "分格引导", icon: "scan-text",    hint: "一次一格自动放大", run: function () { tkGuide(); } },
    speak:   { label: "朗读",     icon: "audio-lines",  hint: "从当前页开始朗读", run: tkSpeak },
    auto:    { label: "自动翻页", icon: "chevrons-right", hint: "按你的速度推进", run: autoToggle },
    bookmark:{ label: "书签",     icon: "bookmark",     hint: "看本文的书签",     run: function () { tkNotes("list", "bookmark"); } },
    notes:   { label: "笔记面板", icon: "notebook-pen", hint: "批注与完整笔记",   run: function () { tkNotes("list"); } },
    annot:   { label: "批注",     icon: "highlighter",  hint: "就当前页写批注",   run: function () { tkNotes("new", null, true); } },
    embed:   { label: "完整笔记", icon: "panel-right",  hint: "全屏写长笔记",     run: function () { tkNotes("embed"); } },
    brain:   { label: "AI 助手",  icon: "brain",        hint: "带着这一页问助手", run: arOpen },
    trans:   { label: "AI 翻译",  icon: "languages",    hint: "译选中的词句",     run: function () { tkSel("trans"); } },
    explain: { label: "AI 解析",  icon: "scan-text",    hint: "关键点与术语",     run: function () { tkSel("explain"); } },
    trace:   { label: "AI 溯源",  icon: "trace-back",   hint: "溯清来处与原文",   run: function () { tkSel("trace"); } }
  };

  /* 一级轮盘：阅读 / 学习模式五入口（与 modes.js 的四模式对齐，另加「通用」兜底）。
     二级工具按模式归类 —— 学习 7 / 文献 6 / 漫画 3 / 书籍 4 / 通用 8，全部 ≤12。 */
  var TK_MODE = [
    { k: "study",   name: "学习", icon: "list-checks",    desc: "批注 · 草稿 · 闪卡",
      tools: ["marg", "pad", "card", "cite", "back", "learn", "notes"] },
    { k: "paper",   name: "文献", icon: "graduation-cap", desc: "引用与双向链接",
      tools: ["trans", "explain", "trace", "cite", "back", "notes"] },
    { k: "comic",   name: "漫画", icon: "image",          desc: "图版连读 · 分格引导",
      tools: ["guide", "annot", "notes"] },
    { k: "book",    name: "书籍", icon: "book-open",      desc: "长文连读 · 页边随笔",
      tools: ["speak", "auto", "bookmark", "annot", "notes"] },
    { k: "general", name: "通用", icon: "sparkles",       desc: "不限类别 · 全部工具",
      tools: ["embed", "notes", "annot", "speak", "auto", "brain", "trans", "explain", "trace"] }
  ];
  /* 中心「全部」= 17 项能力按用途合并到 13 项扇区：
     ① 三个 AI 划选动作（翻译 / 解析 / 溯源）合成一枚「AI 划选」（点开同环换成三枚）；
     ② 笔记面板 / 写笔记 / 完整笔记本就是一个浮窗的三个页签，合成「笔记面板」一枚。
     其余各项保持独立，一项不丢。 */
  var TK_ALL = ["marg", "pad", "card", "learn", "cite", "back", "guide", "speak", "auto", "bookmark", "notes", "brain", "#aiSel"];
  var TK_GROUP = { "#aiSel": { label: "AI 划选", icon: "sparkles", hint: "翻译 · 解析 · 溯源", items: ["trans", "explain", "trace"] } };

  function tkItemOf(k) { return TK_GROUP[k] || TK_TOOL[k] || null; }
  function tkModeOf(k) {
    for (var i = 0; i < TK_MODE.length; i++) if (TK_MODE[i].k === k) return TK_MODE[i];
    return null;
  }

  /* ---------- 8.2 状态与存储 ---------- */
  var tkOrb = qs("#inkOrb"), tkRoot = qs("#inkWheel");
  var tk = {
    open: false, level: 1, modeKey: "all", sub: null,   /* level 1 = 模式环；2 = 工具外环 */
    size: "m", cx: 0, cy: 0, hover: null, sizeOpen: false
  };
  var tkOrbPos = { x: 0, y: 0 };

  function tkLs(key, fb) { try { var v = localStorage.getItem(key); return v == null ? fb : v; } catch (e) { return fb; } }
  function tkLsSet(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }
  function tkNum(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }

  function tkClampOrb(p) {
    p.x = Math.round(Math.max(6, Math.min(window.innerWidth - TK_ORB_SIZE - 6, p.x)));
    p.y = Math.round(Math.max(6, Math.min(window.innerHeight - TK_ORB_SIZE - 6, p.y)));
    return p;
  }
  /* 默认位置：右下 —— 距右 18、距底 84（避开沉浸底条那一条）；
     用户拖过就尊重用户（tkOrbUserSet），没拖过则视口一变就重算这个默认位。 */
  function tkOrbPaint() { tkOrb.style.left = tkOrbPos.x + "px"; tkOrb.style.top = tkOrbPos.y + "px"; }
  var tkOrbUserSet = false;
  function tkOrbHome() {
    var raw = tkLs(TK_ORB_KEY, ""), d = null;
    try { d = raw ? JSON.parse(raw) : null; } catch (e) { d = null; }
    var x = d && tkNum(d.x), y = d && tkNum(d.y);
    tkOrbUserSet = !(x === null || y === null);
    tkOrbPos = tkClampOrb({ x: x === null ? window.innerWidth - 18 - TK_ORB_SIZE : x,
                            y: y === null ? window.innerHeight - 84 - TK_ORB_SIZE : y });
    tkOrbPaint();
  }
  /* v2.11 B5：落库即视为「用户自定」，此后视口变化只夹回、不再回默认位 */
  function tkOrbSave() { tkOrbUserSet = true; tkLsSet(TK_ORB_KEY, JSON.stringify({ x: tkOrbPos.x, y: tkOrbPos.y })); }

  function tkSizeLoad() { var s = tkLs(TK_WHEEL_KEY, "m"); if (s === "s" || s === "m" || s === "l") tk.size = s; }
  function tkSizeSet(s) { tk.size = s; tkLsSet(TK_WHEEL_KEY, s); }

  /* 轮盘中心：贴悬浮球中心，但整盘必须收在视口内（大档 320 在右下角会顶出屏幕）；
     边界按「悬停放大 1.06」算 —— 放大后的扇区也不该越出视口。 */
  function tkCenter(cx, cy) {
    var R = TK_D[tk.size] / 2, m = R * 1.06 + 8;
    tk.cx = Math.round(Math.max(m, Math.min(window.innerWidth - m, cx)));
    tk.cy = Math.round(Math.max(m, Math.min(window.innerHeight - m, cy)));
  }

  /* ---------- 8.3 几何：环带与扇区（角度吸附，非距离） ---------- */
  var TK_B = { hub: 0.34, l1i: 0.34, l1o: 0.68, l1m: 0.51, l2i: 0.74, l2o: 1.0, l2m: 0.87 };
  function tkPt(r, deg) {
    var t = (deg - 90) * Math.PI / 180;
    return [Math.round(r * Math.cos(t) * 100) / 100, Math.round(r * Math.sin(t) * 100) / 100];
  }
  function tkWedge(R, rI, rO, i, n, cls, side, key) {
    var step = 360 / n, pad = Math.min(1.6, step * 0.05);
    var a0 = i * step + pad, a1 = (i + 1) * step - pad, big = (a1 - a0) > 180 ? 1 : 0;
    var p1 = tkPt(rO, a0), p2 = tkPt(rO, a1), p3 = tkPt(rI, a1), p4 = tkPt(rI, a0);
    return '<g class="tk-g" data-side="' + side + '" data-i="' + i + '" data-key="' + esc(key) + '">' +
      '<path class="tk-wedge ' + cls + '" d="M' + p1[0] + ' ' + p1[1] +
      ' A' + rO + ' ' + rO + ' 0 ' + big + ' 1 ' + p2[0] + ' ' + p2[1] +
      ' L' + p3[0] + ' ' + p3[1] + ' A' + rI + ' ' + rI + ' 0 ' + big + ' 0 ' + p4[0] + ' ' + p4[1] + 'Z"/></g>';
  }
  function tkLab(R, r, i, n, side, inner) {
    var step = 360 / n, p = tkPt(r, i * step + step / 2);
    return '<div class="tk-lab" data-side="' + side + '" data-i="' + i +
      '" style="left:calc(50% + ' + p[0] + 'px);top:calc(50% + ' + p[1] + 'px)">' + inner + "</div>";
  }

  /* ---------- 8.4 渲染 ---------- */
  function tkSubItems() {
    if (tk.level === 1) return null;
    if (tk.sub) return TK_GROUP[tk.sub].items;
    return tk.modeKey === "all" ? TK_ALL : (tkModeOf(tk.modeKey) || {}).tools || [];
  }
  function tkInfoOf(side, idx) {
    if (side === "l1") { var m = TK_MODE[idx]; return m ? { label: m.name, hint: m.desc, icon: m.icon } : null; }
    var list = tkSubItems() || [];
    return tkItemOf(list[idx]);
  }
  function tkHubHTML() {
    if (tk.hover) {
      var it = tkInfoOf(tk.hover.side, tk.hover.idx);
      if (it) return '<b>' + esc(it.label) + '</b><em>' + esc(it.hint || "") + "</em>";
    }
    if (tk.level === 1) return icon("grid-2x2", 15) + "<b>全部</b>";
    var title = tk.sub ? tkItemOf(tk.sub).label : (tkModeOf(tk.modeKey) || { name: "全部" }).name;
    return icon("arrow-left", 14) + "<b>返回</b><em>" + esc(title) + "</em>";
  }
  function tkRender() {
    if (!tkRoot) return;
    var D = TK_D[tk.size], R = D / 2, k = D / 260;
    var sub = tkSubItems();
    var svg = "", labs = "";
    TK_MODE.forEach(function (m, i) {
      svg += tkWedge(R, R * TK_B.l1i, R * TK_B.l1o, i, TK_MODE.length, "l1", "l1", m.k);
      labs += tkLab(R, R * TK_B.l1m, i, TK_MODE.length, "l1",
        icon(m.icon, Math.round(19 * k)) + '<span class="tk-tx">' + esc(m.name) + "</span>");
    });
    if (sub) {
      sub.forEach(function (key, i) {
        var it = tkItemOf(key) || { icon: "ellipsis" };
        svg += tkWedge(R, R * TK_B.l2i, R * TK_B.l2o, i, sub.length, "sub", "l2", key);
        labs += tkLab(R, R * TK_B.l2m, i, sub.length, "l2", icon(it.icon, Math.round(18 * k)));
      });
    }
    tkRoot.innerHTML =
      '<div class="tk-wheel" id="tkWheel" style="--tk-d:' + D + "px;--tk-hub:" + Math.round(R * 0.66) +
        "px;--tk-fs:" + Math.round(13 * k) + "px;--tk-hf:" + Math.max(9, Math.round(10 * k)) +
        "px;left:" + tk.cx + "px;top:" + tk.cy + 'px">' +
        '<svg class="tk-svg" viewBox="-' + R + " -" + R + " " + D + " " + D + '">' + svg + "</svg>" +
        labs +
        '<button class="tk-hub" id="tkHub" type="button" aria-label="中心">' + tkHubHTML() + "</button>" +
        '<button class="tk-gear" id="tkGear" type="button" title="轮盘大小（小 / 中 / 大）" aria-label="轮盘大小">' +
          icon("settings", Math.round(15 * k)) + "</button>" +
        '<div class="tk-sizes" id="tkSizes"' + (tk.sizeOpen ? "" : " hidden") + ">" +
          ["s", "m", "l"].map(function (s) {
            return '<button class="tk-chip' + (tk.size === s ? " on" : "") + '" type="button" data-tk-size="' + s + '">' +
              TK_SIZE_CN[s] + "</button>";
          }).join("") + "</div>" +
      "</div>";
    tkPaintDim();
    tkPaintHover();
  }
  function tkPaintDim() {
    var dim = tk.level === 2;
    qsa(".tk-g[data-side='l1'], .tk-lab[data-side='l1']", tkRoot).forEach(function (el) {
      el.classList.toggle("dim", dim);
    });
  }
  function tkSetHover(side, idx) {
    if (tk.hover && (side == null || (tk.hover.side === side && tk.hover.idx === idx))) {
      if (side == null) { tk.hover = null; } else return;
    } else {
      tk.hover = side == null ? null : { side: side, idx: idx };
    }
    tkPaintHover();
  }
  function tkPaintHover() {
    var h = tk.hover;
    qsa(".tk-g, .tk-lab", tkRoot).forEach(function (el) {
      el.classList.toggle("on", !!h && el.dataset.side === h.side && +el.dataset.i === h.idx);
    });
    var hub = qs("#tkHub", tkRoot);
    if (hub) hub.innerHTML = tkHubHTML();
  }

  /* ---------- 8.5 命中：按角度取最近扇区（吸附） ---------- */
  function tkHit(e) {
    var w = qs("#tkWheel", tkRoot);
    if (!w) return { kind: "none" };
    var r = w.getBoundingClientRect(), D = TK_D[tk.size], R = D / 2;
    /* 入场动画期间 rect 会被 scale 缩过 —— 按 rect 归一化，手感与静止时一致 */
    var dx = (e.clientX - (r.left + r.width / 2)) / ((r.width / D) || 1);
    var dy = (e.clientY - (r.top + r.height / 2)) / ((r.height / D) || 1);
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > R + 10) return { kind: "blank" };                      /* 轮盘外：关 / 退回 */
    if (d < R * TK_B.hub) return { kind: "hub" };                  /* 中心圆钮 */
    var ang = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;   /* 0 = 正上，顺时针 */
    var subs = tkSubItems();
    if (subs && d >= R * 0.71) {                                   /* 外环：二级工具 */
      var n = subs.length;
      return { kind: "l2", idx: Math.min(n - 1, Math.floor(ang / (360 / n))) };
    }
    if (tk.level === 2 && d > R * TK_B.l1o + 2) return { kind: "none" };
    if (tk.level === 1 && d > R * TK_B.l1o + 2) return { kind: "none" };
    var i = Math.min(TK_MODE.length - 1, Math.floor(ang / (360 / TK_MODE.length)));
    return { kind: "l1", idx: i };
  }

  /* ---------- 8.6 开 / 关 / 换环 ---------- */
  function tkOpen(cx, cy) {
    if (!tkRoot) return;
    tk.open = true; tk.level = 1; tk.modeKey = "all"; tk.sub = null; tk.hover = null; tk.sizeOpen = false;
    tkCenter(cx, cy);
    tkRender();
    tkRoot.hidden = false;
    document.body.classList.add("tk-open");
  }
  function tkClose() {
    if (!tkRoot) return;
    tk.open = false; tk.hover = null; tk.sizeOpen = false;
    tkRoot.hidden = true;
    tkRoot.innerHTML = "";
    document.body.classList.remove("tk-open");
  }
  function tkGoMode(key) {
    if (tk.level === 2 && tk.modeKey === key && !tk.sub) { tkBack(); return; }
    tk.level = 2; tk.modeKey = key; tk.sub = null; tk.hover = null;
    tkRender();
  }
  function tkAll() { tk.level = 2; tk.modeKey = "all"; tk.sub = null; tk.hover = null; tkRender(); }
  function tkBack() {
    if (tk.sub) { tk.sub = null; tk.hover = null; tkRender(); return; }   /* 组内 → 回到上一层列表 */
    if (tk.level === 2) { tk.level = 1; tk.hover = null; tkRender(); return; }
    tkClose();
  }
  function tkFire(key) {
    var it = tkItemOf(key);
    if (!it) return;
    if (it.items) { tk.sub = key; tk.hover = null; tkRender(); return; }  /* 「AI 划选」：同环换成三枚 AI 工具 */
    tkClose();
    if (typeof it.run === "function") it.run();
  }

  /* ---------- 8.7 工具动作：一律调既有入口 ---------- */
  /* 模式工具面板：与模式条 data-tool 同一开关函数（modes.js openPanel / closePanel） */
  function tkPanel(k) {
    if (InkModes.panelKey() === k) InkModes.closePanel(); else InkModes.openPanel(k);
  }
  /* 正文标记类开关：与模式条 toggle 同一条写入出口（patch → InkTheme.commit → ink:read 回流） */
  function tkToggle(key) {
    var t = TK_TOOL[key], on = !read[key], p = {};
    p[key] = on;
    patch(p, (on ? "已开启 " : "已关闭 ") + t.label, t.icon);
  }
  function tkGuide() {
    var t = TK_TOOL.guide, on = !read.guide;
    patch({ guide: on }, (on ? "已开启 " : "已关闭 ") + t.label, t.icon);
    if (on && !InkModes.guideOn()) toast("分格引导只在「漫画」模式下生效：可在模式条切换", "alert-triangle");
  }
  /* 听书：走「更多 → 朗读」的既有链路（起点式：从当前页第一段起读） */
  function tkSpeak() {
    var b = qs("#tSpeak");
    if (!b || b.disabled) { toast("本文没有可朗读的文字段落", "info"); return; }
    if (qs("#ttsPlay").classList.contains("active")) { toast("朗读进行中：沉浸态不打断声音", "audio-lines"); return; }
    b.click();
  }
  /* 批注浮窗（v2.5）：开合仍走 #reader[data-notes]，页签仍走 switchNoteTab —— 不复制一份实现 */
  function tkNotes(tab, filter, focusInput) {
    if (qs("#reader").dataset.notes !== "open") qs("#immNotes").click();
    switchNoteTab(tab || "list");
    if (filter) {
      var f = qs('[data-nfilter="' + filter + '"]');
      if (f) f.click();
    }
    if (focusInput) { var ta = qs("#noteInput"); if (ta) ta.focus(); }
  }
  /* 划选类 AI 动作：有选中文字才动，走的正是划选工具条那几个按钮的 handler */
  function tkSel(which) {
    var s = state.sel;
    if (!s || !s.text) { toast("先划选一段文字，再用 AI 工具", "info"); return; }
    if (which === "trans") { InkModes.translateSelection(s.text, tk.cx, tk.cy); return; }
    /* 解析 / 溯源卡片的落点取自划选工具条的位置 —— 把工具条挪到轮盘中心，卡片才落在视线处 */
    selBar.style.display = "flex";
    selBar.style.left = Math.max(12, Math.min(window.innerWidth - (selBar.offsetWidth || 220) - 12, tk.cx - (selBar.offsetWidth || 220) / 2)) + "px";
    selBar.style.top = Math.min(window.innerHeight - 60, tk.cy) + "px";
    qs(which === "explain" ? "#selExplain" : "#selTrace").click();
  }

  /* ---------- 8.8 悬浮球：拖动（pointer 序列 + setPointerCapture）与单击 ---------- */
  var tkOrbDrag = null;
  function tkOrbDown(e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();          /* 起手就不选字、不引发兼容鼠标事件（拖动只认指针序列） */
    tkOrbDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: tkOrbPos.x, oy: tkOrbPos.y, moved: false };
    try { tkOrb.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function tkOrbMove(e) {
    if (!tkOrbDrag || e.pointerId !== tkOrbDrag.id) return;
    e.stopPropagation();         /* 别把「靠边呼出沉浸浮条」也一并叫醒 */
    var dx = e.clientX - tkOrbDrag.x, dy = e.clientY - tkOrbDrag.y;
    if (!tkOrbDrag.moved && Math.abs(dx) + Math.abs(dy) < TK_DRAG_MIN) return;
    tkOrbDrag.moved = true;
    document.body.classList.add("tk-drag");
    tkOrbPos = tkClampOrb({ x: tkOrbDrag.ox + dx, y: tkOrbDrag.oy + dy });
    tkOrbPaint();
  }
  function tkOrbUp(e) {
    if (!tkOrbDrag || e.pointerId !== tkOrbDrag.id) return;
    var moved = tkOrbDrag.moved;
    try { tkOrb.releasePointerCapture(e.pointerId); } catch (err) {}
    tkOrbDrag = null;
    document.body.classList.remove("tk-drag");
    if (!moved) {              /* 拖动后释放不算点击 */
      tkOpen(tkOrbPos.x + TK_ORB_SIZE / 2, tkOrbPos.y + TK_ORB_SIZE / 2);
      return;
    }
    tkOrbSave();
  }
  if (tkOrb) {
    tkOrb.addEventListener("pointerdown", tkOrbDown);
    tkOrb.addEventListener("pointermove", tkOrbMove);
    tkOrb.addEventListener("pointerup", tkOrbUp);
    tkOrb.addEventListener("pointercancel", tkOrbUp);
    /* 键盘可达：Enter / 空格同「单击」 */
    tkOrb.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      tkOpen(tkOrbPos.x + TK_ORB_SIZE / 2, tkOrbPos.y + TK_ORB_SIZE / 2);
    });
  }

  /* ---------- 8.9 轮盘交互：移动吸附最近扇区，点击进入 / 执行 ---------- */
  if (tkRoot) {
    tkRoot.addEventListener("pointermove", function (e) {
      e.stopPropagation();
      var h = tkHit(e);
      if (h.kind === "l1" || h.kind === "l2") tkSetHover(h.kind, h.idx);
      else tkSetHover(null, -1);
    });
    tkRoot.addEventListener("click", function (e) {
      if (e.target.closest("#tkGear, #tkSizes")) return;      /* 齿轮与大小签自管 */
      /* 轮盘是临时浮层：点它的这一下不再穿透到页面的「点外收起」一类监听
         （否则刚由轮盘触发的翻译浮层会被这一下自己关掉） */
      e.stopPropagation();
      var h = tkHit(e);
      if (h.kind === "blank") { tk.level === 1 ? tkClose() : tkBack(); return; }
      if (h.kind === "hub") { tk.level === 1 ? tkAll() : tkBack(); return; }
      if (h.kind === "l1") { tkGoMode(TK_MODE[h.idx].k); return; }
      if (h.kind === "l2") { tkFire((tkSubItems() || [])[h.idx]); return; }
    });
    /* 齿轮：轮盘大小三档（小 200 / 中 260 / 大 320） */
    tkRoot.addEventListener("click", function (e) {
      var g = e.target.closest("#tkGear");
      if (g) {
        e.stopPropagation();
        tk.sizeOpen = !tk.sizeOpen;
        var box = qs("#tkSizes", tkRoot);
        if (box) box.hidden = !tk.sizeOpen;
        return;
      }
      var c = e.target.closest("[data-tk-size]");
      if (c) {
        e.stopPropagation();
        tkSizeSet(c.dataset.tkSize);
        tk.sizeOpen = false;
        tkCenter(tkOrbPos.x + TK_ORB_SIZE / 2, tkOrbPos.y + TK_ORB_SIZE / 2);
        tkRender();
      }
    });
    /* 触屏 / 笔：按下不松手滑动也要吸附；只挡穿透、不 preventDefault
       —— 取消 pointerdown 会连带压掉 click，轮盘本身就是靠 click 落点的 */
    tkRoot.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  }

  /* Esc：只收轮盘这一层。助手（#aiReader）是 InkWin，收起归 dock.js 的全局
     层栈（传了 onClose 就登记 dismiss），这里再拦一次会一次按键收两层。 */
  window.addEventListener("keydown", function (e) {
    if (window.InkKeys && InkKeys.isOpen()) return;   /* 命令面板 / 总览置顶：Esc 先归它们 */
    if (e.key !== "Escape") return;
    if (tk.open) { e.stopPropagation(); e.preventDefault(); tkClose(); }
  }, true);

  /* 视口变化 / 进出沉浸：没拖过的球重算默认位，拖过的只夹回视口内；
     v2.11 B5：拖动进行中（tk-drag class 就是被这次拖动加上的）不参与重算，
     否则 observer 回调会把球当场弹回默认位 —— 首拖必弹回的根因。 */
  window.addEventListener("resize", function () {
    if (tkOrbDrag) return;
    if (tkOrbUserSet) { tkOrbPos = tkClampOrb(tkOrbPos); tkOrbPaint(); } else tkOrbHome();
  });
  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (!document.body.classList.contains("immersive") && tk.open) tkClose();
      if (tkOrbDrag) return;
      if (tkOrbUserSet) { tkOrbPos = tkClampOrb(tkOrbPos); tkOrbPaint(); } else tkOrbHome();
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  /* ---------- 8.10 AI 阅读助手（#aiReader · v2.23 W1e）----------
     取代原「AI 速问」。速问的病不在「问」，在问完就断：一句答案留在浮窗里 ——
     引用是死的（点不回原文）、答案落不了地（变不成笔记 / 闪卡 / 任务）、
     上下文是空的（它不知道读者站在哪一章）。助手补的正是这三条：
       ① 每次提问现建上下文包（W1b）：书 + 当前章 + 选中段一起进 prompt，
          并把「相关段落」编号成 [1]…[N] 交给模型，要求它按编号引；
       ② 答案里的 [N] 渲染成按钮，点了走 reader.goto 跳回那一块；
       ③ 落地三钮与两条工具型预置问题全走 InkAgent（W1d′）：
          写之前摊开确认卡，写完能当场撤销。
     窗体（拖 / 靠边 / 铺满 / 位置记忆）和解析卡同一条路走 InkWin —— 不再自写
     pointermove；Esc 归 dock.js 那条层栈，一次只收一层。 */
  var ar = qs("#aiReader"), arStream = qs("#arStream"), arInput = qs("#arInput"), arCtxBar = qs("#arCtx");
  var arPreset = qs("#arPreset"), arCft = qs("#arCft"), arUndoBtn = qs("#arUndo");
  var arSendBtn = qs("#arSend"), arStopBtn = qs("#arStop");
  var arToNote = qs("#arToNote"), arToCard = qs("#arToCard"), arToTask = qs("#arToTask");
  var arBusy = false, arCtl = null, arSeq = 0, arRefs = [], arLast = null, arPend = null, arNoted = false;

  var arWin = window.InkWin && ar && InkWin.create(ar, {
    id: "aireader", host: "viewport", claim: "#reader",
    handle: "#arHead", bar: "#arHead", x: "#arX",
    title: "AI 助手", f: { w: 396, h: 560 }, min: { w: 300, h: 320 },
    dock: { min: 300, max: 620, width: 396 }, snap: 20,
    dockTop: window.InkTopBand,          /* 同上：停靠态让出顶栏那一条 */
    shown: function () { return !ar.hidden; }, onClose: arClose
  });

  function arBi() {
    var b = selBi();
    if (b >= 0) return b;
    var idx = state.pageIdx.length ? state.pageIdx : measuredPages();
    return (idx[state.cur] && idx[state.cur].length) ? idx[state.cur][0] : 0;
  }
  function arSel() { return String((state.sel && state.sel.text) || "").trim(); }

  function arRow(cls, html) {
    var el = document.createElement("div");
    el.className = "ar-row " + cls;
    el.innerHTML = html;
    arStream.appendChild(el);
    arStream.scrollTop = arStream.scrollHeight;
    return el;
  }
  /* 工具层做了什么，用一行灰字说清（读了哪章 / 将建几张卡）—— 与 InkAgent 的动作流水同源 */
  function arAct(txt) {
    var el = document.createElement("div");
    el.className = "ar-act";
    el.innerHTML = icon("wand-2", 12) + esc(txt);
    arStream.appendChild(el);
    arStream.scrollTop = arStream.scrollHeight;
    return el;
  }
  /* 回答正文走 MD.render —— 与 ai.html 的 AI 气泡同一条渲染路（那边 2.13 起就在用，
     列表 / 粗体 / 表格 / 代码都是真部件）。v2.23 新写这扇助手窗时漏接了它，
     自己写了个 esc + \n→<br>，于是模型一按 markdown 分点答，窗里就是满屏的 ** 和 - 。 */
  function arRich(txt, refs) {
    var box = document.createElement("div");
    box.innerHTML = MD.render(String(txt || ""));
    if (refs && refs.length) arLinkRefs(box, refs);
    return box.innerHTML;
  }
  /* [3] 只有在这轮真的把第 3 段交给模型时才做成按钮；编号越界就原样留着，
     不做点了没反应的假链接 —— 读者点一次没动静，以后所有编号他都不信了。
     只能在**渲染后的 DOM** 上换：渲染前对着字符串正则，会把代码块里的 [1]、
     链接 href 里的 [1] 一并做成按钮，点下去跳去不相干的地方。 */
  function arLinkRefs(root, refs) {
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        return p && p.closest("code,pre,.ar-ref") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], tn;
    while ((tn = tw.nextNode())) nodes.push(tn);
    nodes.forEach(function (node) {
      var parts = String(node.nodeValue).split(/\[(\d{1,2})\]/);
      if (parts.length < 2) return;
      var frag = document.createDocumentFragment(), buf = "";
      for (var k = 0; k < parts.length; k++) {
        if (k % 2 === 0) { buf += parts[k]; continue; }
        var i = Number(parts[k]) - 1;
        if (i < 0 || i >= refs.length) { buf += "[" + parts[k] + "]"; continue; }
        if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ""; }
        var b = document.createElement("button");
        b.className = "ar-ref"; b.type = "button"; b.dataset.ref = i;
        b.title = "跳回原文 · " + refs[i].label;
        b.textContent = "[" + parts[k] + "]";
        frag.appendChild(b);
      }
      if (buf) frag.appendChild(document.createTextNode(buf));
      node.parentNode.replaceChild(frag, node);
    });
  }
  /* 流式重画：每来一片都重建整条回答的 HTML 会把主线程占满（翻页动画当场掉帧），
     用 rAF 合帧 —— 一帧最多画一次。 */
  function arTick(el, txt) {
    el._t = txt;
    if (el._raf) return;
    el._raf = requestAnimationFrame(function () {
      el._raf = null;
      el.innerHTML = arRich(el._t, arRefs);
      arStream.scrollTop = arStream.scrollHeight;
    });
  }

  /* 携带条：这一问到底带上了什么。看不见就会怀疑没带，所以逐条摆出来。 */
  function arPaintCtx() {
    if (!arCtxBar) return;
    var sel = arSel(), bi = arBi(), ch = bi >= 0 ? chapterOf(bi) : (doc.title || "");
    arCtxBar.innerHTML =
      '<span class="ar-c" title="整本书的书目都带着">' + icon("book-open", 12) + esc(String(doc.title || "本文").slice(0, 12)) + "</span>" +
      '<span class="ar-c" title="这一章的正文带着">' + icon("toc", 12) + esc(String(ch || "本书").slice(0, 10)) + "</span>" +
      (sel ? '<span class="ar-c on" title="带着你划的这段：' + esc(sel.slice(0, 120)) + '">' + icon("highlighter", 12) +
             esc(sel.length > 14 ? sel.slice(0, 14) + "…" : sel) + "</span>"
           : '<span class="ar-hint">划一段再问更准</span>');
    qsa(".ar-p", arPreset).forEach(function (b) {
      var need = b.dataset.sel === "1" && !b.dataset.tool;
      b.disabled = arBusy || (need && !sel);
      if (need) b.title = sel ? "带着选中的这段问" : "先划一段，再问这一句";
    });
    arPaintLand();
  }

  function arPaintLand() {
    var hasA = !!(arLast && arLast.a), hasQ = !!(arLast && arLast.q), hasSel = !!arSel();
    if (arToNote) {
      arToNote.disabled = arBusy || !hasA;
      arToNote.title = hasA ? "把上一条回答存成这本书的笔记" : "先问一句，答完了才有东西可存";
    }
    if (arToCard) {
      arToCard.disabled = arBusy || !hasSel;
      arToCard.title = hasSel ? "把选中的这段原文做成闪卡（回原文查证才落）"
                              : "先划一段 —— 闪卡要的是原文里的话，不是模型的话";
    }
    if (arToTask) {
      arToTask.disabled = arBusy || !hasQ;
      arToTask.title = hasQ ? "把上一次提问变成一条待办" : "先问一句 —— 没问过就没什么可待办";
    }
    if (arUndoBtn) arUndoBtn.hidden = !!(window.InkAgent && InkAgent.pending().length === 0);
  }

  /* 材料包：把 W1b 的上下文包摊成带编号的 prompt。编号只给「相关段落」那一层 ——
     同章正文是背景，读者要跳的是「答案引到了全书的哪一处」。 */
  function arMaterial(pack, sel) {
    if (!pack) return sel ? "【读者选中的那段】\n" + sel : "";
    var m = pack.meta || {}, sec = [];
    sec.push("【读者正在读】《" + (m.title || "本文") + "》" + (m.author ? " · " + m.author : "") +
      "，站在「" + (pack.chapter.title || "") + "」");
    if (sel) sec.push("【读者选中的那段】\n" + sel);
    if (pack.related && pack.related.length) {
      sec.push("【可引用的原文 · 句末标 [编号] 出处，编号只能用下面给出来的，不许自造】\n" +
        pack.related.map(function (r, i) {
          return "[" + (i + 1) + "] " + (r.chapter || "") + " · 第 " + (r.page || "?") + " 页：" + r.text;
        }).join("\n"));
    }
    sec.push("【" + (pack.chapter.title || "本章") + " 正文" +
      (pack.chapter.whole ? "" : " · 节选（围绕读者所站的位置取，本章未全文附上）") + "】\n" + pack.chapter.text);
    if (pack.notes && pack.notes.length) {
      sec.push("【读者自己在书上的批注】\n" + pack.notes.map(function (n) {
        return "· " + (n.text ? "「" + n.text + "」" : "") + (n.body ? " —— " + n.body : "") + (n.page ? "（第 " + n.page + " 页）" : "");
      }).join("\n"));
    }
    return sec.join("\n\n");
  }

  /* 为什么不用 Brain.ask：它把 messages 组装包在自己手里，没有往 system 塞
     「带编号的原文 + 引用规则」这个口子。这里要的正是那个口子，所以自己拼、自己发，
     只把离线那半条路（Brain.offline）借回来 —— 兜底实现不留两份。 */
  async function arAsk(q, onPiece) {
    var sel = arSel().slice(0, 600);
    var pack = null;
    try { if (window.Brain && Brain.buildContextPack) pack = Brain.buildContextPack({ docId: docId, bi: arBi(), query: q, budget: 5200 }); } catch (e) {}
    arRefs = ((pack && pack.related) || []).map(function (r) {
      return { bi: r.bi, label: (r.chapter || "") + " · 第 " + (r.page || "?") + " 页" };
    });
    if (!(window.API && API.hasModel && API.hasModel())) {
      var o1 = await Brain.offline(q, { docId: docId });
      return { reply: o1.reply, mode: "offline", miss: o1.miss };
    }
    var sys = "你是墨读里的阅读助手，正陪着读者读这一本书。回答贴着下面给出的原文，别泛泛而谈；"
      + "原文里没有的就直说没有，不要编。" + (arRefs.length ? "引到某段时在该句末尾标它的编号，例如「[2]」；只给结论也要标出处。" : "")
      /* 排版约束：这扇窗只有 396px 宽、正文 13px。模型默认按「一页文档」的写法答，
         三级标题套大表格在窄栏里必然挤成一团 —— 让它按一栏的尺子写，比事后用 CSS 硬压有效。 */
      + "回答是贴在书页旁的一小段话，不是整篇文章：控制在几句之内，"
      + "要列举就用一层短列表，一条一句；不要多级标题、不要表格、不要代码块（读者点名要除外）；"
      + "术语解释用「术语：解释」这样的行，别另起标题。"
      + "\n\n" + arMaterial(pack, sel);
    try { if (window.Brain && Brain.preamble) sys += "\n\n" + Brain.preamble("chat"); } catch (e) {}
    arCtl = window.AbortController ? new AbortController() : null;
    var out = "";
    try {
      await API.llmMsgs([{ role: "system", content: sys }, { role: "user", content: q }], {
        temp: 0.6, timeout: 60000, signal: arCtl && arCtl.signal,
        onDelta: function (p, all) { out = all != null ? all : out + p; onPiece(out); }
      });
      return { reply: out, mode: "online" };
    } catch (e) {
      /* 停止 ≠ 失败：半截话照原样交回去，不去兜离线库（同 brain.js ask 的判据） */
      if (e && (e.aborted || (arCtl && arCtl.signal && arCtl.signal.aborted))) return { reply: out, mode: "stopped" };
      var o2 = await Brain.offline(q, { docId: docId });
      return { reply: o2.reply, mode: "offline", note: "模型请求失败：" + API.netErrPhrase(e) + "，已改用本机库作答。" };
    } finally { arCtl = null; }
  }

  async function arSend(text) {
    var q = String(text || "").trim();
    if (!q || arBusy) return;
    arBusy = true; arSeq++;
    var my = arSeq;
    arPend = null; arCft.hidden = true;
    if (arStopBtn) arStopBtn.hidden = false;
    if (arSendBtn) arSendBtn.disabled = true;
    arPaintCtx();
    arRow("me", esc(q));
    if (arInput) arInput.value = "";
    var holder = arRow("bot", '<span class="ar-busy">' + icon("loader-circle", 13) + "助手正在翻这本书…</span>");
    var r;
    try { r = await arAsk(q, function (t) { arTick(holder, t); }); }
    catch (e) { r = { mode: "error", reply: "", why: API.netErrPhrase(e) }; }
    if (my !== arSeq) return;                 /* 期间又发了新一轮：这轮的收尾别去踩新的状态 */
    if (holder._raf) { cancelAnimationFrame(holder._raf); holder._raf = null; }
    if (r.note) arRow("sys", esc(r.note));
    var tag = r.mode === "offline" ? '<span class="ar-tag">本机库</span>'
      : r.mode === "stopped" ? '<span class="ar-tag">已停止</span>'
      : r.mode === "error" ? '<span class="ar-tag">出错</span>' : "";
    var body = r.reply || (r.mode === "error" ? "助手暂时答不上来：" + (r.why || "")
      : r.mode === "stopped" ? "（按下了停止，这句没答完）" : "（没有给出内容）");
    holder.innerHTML = tag + arRich(body, r.mode === "offline" ? [] : arRefs);
    if (r.mode === "stopped" || r.mode === "error") {
      var retry = document.createElement("button");
      retry.className = "ar-p"; retry.type = "button"; retry.textContent = "重试这一问";
      retry.addEventListener("click", function () { arSend(q); });
      holder.appendChild(document.createElement("br"));
      holder.appendChild(retry);
    }
    if (r.mode !== "stopped" && r.reply) arLast = { q: q, a: r.reply };
    arBusy = false;
    if (arStopBtn) arStopBtn.hidden = true;
    if (arSendBtn) arSendBtn.disabled = false;
    arPaintCtx();
    holder.scrollIntoView({ block: "nearest" });
  }

  /* 预置六问：前两问是「读懂」，中间两问是「查清」，后两问直接落地成卡与任务。 */
  var AR_PRE = [
    { t: "讲什么", hint: "三句话说清这一章，再点出一处最值得停下来的地方",
      q: "这一章在讲什么？用三句话说清，再点出最值得停下来看的一处，并标出它在哪一段。" },
    { t: "这段看不懂", sel: 1, hint: "先划一段 —— 逐句拆给它看",
      q: "帮我读懂选中的这一段：先说它在讲什么，再解释其中的关键词，最后一句说清它和上下文的关系。" },
    { t: "人物关系", hint: "按原文列人物与关系，附引用编号",
      q: "列出这一章出现的人物及其关系，每人一行：人物 — 身份或与谁的关系 — 依据（标引用编号）。原文里没出现的人物不要编。" },
    { t: "术语表", hint: "术语与专名逐条解释，附出处",
      q: "汇总这一章的术语与专名，每条一行：术语 — 一句话解释 — 出处编号。" },
    { t: "出 5 张闪卡", tool: "cards.create", key: "quotes", hint: "模型从原文逐字挑 5 句 → 逐条回原文查证 → 确认卡上点头才落",
      sys: "从下面给出的原文里挑 5 句最值得记住的话。要求：逐字照抄原文，不改写、不拼接、不加引号、不缩略，"
        + "长短以 8-60 字为宜；只能从给的原文里挑，原文不够 5 句就少给几条。只回 JSON，不要解释。",
      usr: "挑 5 句原文。格式：{\"quotes\":[\"原文句子1\",\"原文句子2\"]}" },
    { t: "生成本章任务", tool: "tasks.create", key: "titles", hint: "模型按本章拟 4-6 条可执行任务 → 确认卡上点头才落",
      sys: "针对读者正在读的这一章，拟 4-6 条可执行的学习任务。要求：每条不超过 20 字、动词开头"
        + "（如「复述…」「整理…」「对照…」），彼此不重复，不要写「阅读本章」这类空话。只回 JSON，不要解释。",
      usr: "生成本章任务。格式：{\"titles\":[\"任务1\",\"任务2\"]}" }
  ];
  if (arPreset) {
    AR_PRE.forEach(function (p) {
      var b = document.createElement("button");
      b.className = "ar-p"; b.type = "button"; b.textContent = p.t;
      if (p.sel) b.dataset.sel = "1";
      if (p.tool) { b.dataset.tool = p.tool; b.dataset.sel = "1"; }
      b.title = p.hint || p.t;
      b.addEventListener("click", function () { if (p.tool) arRunTool(p); else arSend(p.q); });
      arPreset.appendChild(b);
    });
  }

  /* 工具型预置问题：走 §W1d′ 的「JSON 指令白名单」那条通道 —— 本版不请求原生
     tool_calls，只让模型交回一个固定形状的对象，字段名对着工具参数表核一遍才执行。 */
  async function arRunTool(p) {
    if (arBusy) return;
    if (!(window.API && API.hasModel && API.hasModel())) {
      var row = arRow("err", esc("「" + p.t + "」要由模型从原文挑句 / 拟任务，没接模型时助手不猜。"));
      var go = document.createElement("button");
      go.className = "ar-p"; go.type = "button"; go.textContent = "去主脑页配置模型";
      go.addEventListener("click", function () { arConfirm("ui.navigate", { to: "ai" }); });
      row.appendChild(document.createElement("br")); row.appendChild(go);
      return;
    }
    arBusy = true;
    if (arStopBtn) arStopBtn.hidden = false;
    if (arSendBtn) arSendBtn.disabled = true;
    arPaintCtx();
    var holder = arRow("bot", '<span class="ar-busy">' + icon("loader-circle", 13) + esc("正在" + p.t + "…") + "</span>");
    var pack = null, sel = arSel().slice(0, 600);
    try { if (window.Brain && Brain.buildContextPack) pack = Brain.buildContextPack({ docId: docId, bi: arBi(), query: p.t, budget: 5200 }); } catch (e) {}
    var got = null, bad = "";
    try {
      got = await API.aiJson(p.sys + "\n\n" + arMaterial(pack, sel), p.usr, { timeout: 40000 });
    } catch (e) {
      if (e && e.name === "UnstructuredError") bad = "模型没有按格式回话，所以这一条没有落地（不硬拆它的话，拆出来的多半是假的）。";
      else bad = "请求失败：" + API.netErrPhrase(e);
    }
    arBusy = false;
    if (arStopBtn) arStopBtn.hidden = true;
    if (arSendBtn) arSendBtn.disabled = false;
    if (!got) { holder.innerHTML = '<span class="ar-tag">没成</span>' + esc(bad); arPaintCtx(); return; }
    var arr = got.j && Array.isArray(got.j[p.key]) ? got.j[p.key] : [];
    var args = { docId: docId };
    args[p.key] = arr;
    if (p.tool === "tasks.create") args.today = false;
    if (!arr.length) { holder.innerHTML = '<span class="ar-tag">空</span>模型这回没有交出可用条目，所以什么都没落。'; arPaintCtx(); return; }
    arLast = { q: p.t, a: arr.map(function (x) { return typeof x === "string" ? x : JSON.stringify(x); }).join("\n") };
    holder.innerHTML = '<span class="ar-tag">' + esc(got.via === "direct" ? "JSON" : "已解析") + "</span>" +
      esc("挑出了 " + arr.length + " 条，摊在下面这张确认卡上 —— 点「确认落地」才写进应用。");
    arPaintCtx();
    arConfirm(p.tool, args);
  }

  /* ---------------- 确认卡与落地 ---------------- */
  async function arConfirm(tool, args) {
    if (!window.InkAgent) { arRow("err", "工具层没有加载，落地按钮暂时用不了。"); return; }
    var r = await InkAgent.invoke(tool, args);
    if (r && r.needConfirm) { arShowConfirm(r); return; }
    arReport(r, tool);
  }
  function arShowConfirm(res) {
    arPend = { tool: res.tool, args: res.args };
    var pv = res.preview || {};
    var li = (pv.lines || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
    arCft.innerHTML = "<b>" + esc(pv.title || "确认这次操作") + "</b>" + (li ? "<ul>" + li + "</ul>" : "") +
      '<div class="ar-cf-row"><button class="btn btn-accent btn-sm" id="arCfYes" type="button">确认落地</button>' +
      '<button class="btn btn-ghost btn-sm" id="arCfNo" type="button">先不</button>' +
      '<span class="spacer"></span><span class="card-note">落错了可以在右边撤销</span></div>';
    arCft.hidden = false;
    qs("#arCfYes", arCft).addEventListener("click", async function () {
      var job = arPend; arPend = null; arCft.hidden = true;
      if (!job) return;
      var r = await InkAgent.invoke(job.tool, job.args, { confirm: true });
      arReport(r, job.tool);
    });
    qs("#arCfNo", arCft).addEventListener("click", function () {
      arPend = null; arCft.hidden = true;
      arAct("先不落地，什么都没写");
    });
    qs("#arCfYes", arCft).focus();
  }
  var AR_WHY = {
    "unknown-tool": "这条指令不在白名单里", "missing-param": "缺了必要参数", "bad-type": "参数类型不对",
    "no-host": "这一页没有接入该能力", "not-found": "没找到那个位置", "no-doc": "没有当前书籍",
    "empty-text": "没有可写的文字", "empty-quotes": "没有可做的条目", "empty-titles": "没有可建的任务",
    "save-failed": "本机没能存下这条", "not-in-text": "这些句子在原文里查不到", "not-object": "指令形状不对",
    "error": "执行时出了错", "failed": "没有成功"
  };
  function arWhy(w) { return AR_WHY[w] || String(w || "failed"); }
  function arReport(r, tool) {
    if (!r) return;
    if (r.rejected) { arRow("err", '<span class="ar-tag">挡下</span>' + esc(arWhy(r.why) + (r.detail && r.detail.tool ? "：" + r.detail.tool : ""))); return; }
    if (r.needConfirm) { arShowConfirm(r); return; }
    if (r.ok === false) { arRow("err", '<span class="ar-tag">没成</span>' + esc(arWhy(r.why))); return; }
    if (r.same) { arAct("已经在这一页了"); return; }
    var t = InkAgent.trace(), last = t[t.length - 1];
    arAct(last ? last.text : "办好了");
    if (tool === "cards.create") {
      if (r.missed && r.missed.length) {
        arRow("sys", esc(r.missed.length + " 条在原文里查无此句，没有做成卡（助手的原话：「" + String(r.missed[0]).slice(0, 40) + "」）—— 不做成卡是对的，编出来的句子背了也白背。"));
      }
      if (r.made) toast("已加入 " + r.made + " 张闪卡", "layers");
    }
    if (tool === "tasks.create" && r.made) toast("已建 " + r.made + " 条任务", "list-checks");
    if (tool === "notes.create") {
      toast("已存为笔记", "notebook-pen");
      if (r.stored === false) arRow("sys", "本机存储没收下这条，只在本次会话里可见");
    }
    arPaintLand();
  }

  /* ---------------- 开合与接线 ---------------- */
  function arHome() {
    if (!arWin) return;
    var f = arWin.state().f || { w: 396, h: 560 };
    arWin.place(Math.max(12, window.innerWidth - f.w - 24), Math.max(12, Math.round((window.innerHeight - f.h) / 2) - 20));
  }
  function arOpen() {
    if (!ar) return;
    ar.hidden = false;
    qs("#arK").innerHTML = icon("brain", 15) + "AI 助手";
    qs("#arX").innerHTML = icon("x", 14);
    qs("#arDoc").textContent = "《" + (doc.title || "本文") + "》";
    if (arWin) {
      arWin.open();
      /* 本机第一次用它才自己挑个落点，之后位置归读者拖出来的那个 */
      if (!InkWin.read()["aireader"]) arHome();
    }
    if (!arStream.childElementCount) {
      arRow("sys", "带着「这本书 + 这一章" + (arSel() ? " + 你划的这段" : "") + "」问。下面六枚是常问的，也可以自己写。");
    }
    if (!(window.API && API.hasModel && API.hasModel()) && !arNoted) {
      arNoted = true;
      arRow("sys", "未接模型：常识问答用本机库，「出 5 张闪卡 / 生成本章任务」这类要模型从原文挑的办不了。");
    }
    arPaintCtx();
    setTimeout(function () { if (arInput) arInput.focus(); }, 40);
  }
  function arClose() {
    if (!ar) return;
    /* 收起必须让窗重画一次：停靠态在 #reader 上挂着 data-dock-* 与 --dock-w-*，
       卡片一藏、那份让位就成了正文旁边一条关不掉的空栏（同 auxWin，见 6.5）。 */
    ar.hidden = true;
    if (arWin) arWin.apply(false);
    if (arCtl) { try { arCtl.abort(); } catch (e) {} arCtl = null; }
    arSeq++; arBusy = false;
    if (arStopBtn) arStopBtn.hidden = true;
    if (arSendBtn) arSendBtn.disabled = false;
  }
  function arToggle() { if (ar && !ar.hidden) arClose(); else arOpen(); }

  if (ar) {
    qs("#arX").addEventListener("click", arClose);
    qs("#arForm").addEventListener("submit", function (e) { e.preventDefault(); arSend(arInput && arInput.value); });
    arStopBtn.addEventListener("click", function () { if (arCtl) { try { arCtl.abort(); } catch (e) {} } });
    /* 引用按钮是 arRich 现生成的，监听挂在流容器上按 data-ref 分发 —— 免得每片 delta 重绑一遍 */
    arStream.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".ar-ref") : null;
      if (!b) return;
      var ref = arRefs[Number(b.dataset.ref)];
      if (!ref) return;
      if (window.InkAgent) InkAgent.invoke("reader.goto", { bi: ref.bi });
      arAct("跳回了 " + ref.label);
    });
    arToNote.addEventListener("click", function () {
      if (!arLast || !arLast.a) return;
      arConfirm("notes.create", {
        docId: docId, text: arLast.a.replace(/\s+/g, " ").slice(0, 380), body: arLast.a,
        anchor: (state.sel && state.sel.anchor) || "", page: (state.sel && state.sel.page) || 0
      });
    });
    arToCard.addEventListener("click", function () {
      var s = arSel();
      if (!s) return;
      arConfirm("cards.create", { docId: docId, quotes: [s] });
    });
    arToTask.addEventListener("click", function () {
      if (!arLast || !arLast.q) return;
      arConfirm("tasks.create", { docId: docId, titles: [arLast.q.slice(0, 120)], today: false });
    });
    arUndoBtn.addEventListener("click", async function () {
      var r = await InkAgent.undo();
      arAct(r.ok ? "撤回了 1 条" + r.kind : "这轮没有可撤销的操作了");
      if (r.ok) toast("已撤回", "rotate-ccw");
      arPaintLand();
    });
    /* 划词条上的「问 AI」：选中即问 —— 速问退役后，它就是那个入口（方案 §四 判定） */
    qs("#selAsk").addEventListener("click", function () {
      if (!state.sel) return;
      hideSel();
      arOpen();
    });
  }

  /* 工具层的宿主桥：只有阅读页才有的三样 —— 当前书、页内跳转、批注重画 */
  if (window.InkAgent) {
    InkAgent.host({
      docId: function () { return docId; },
      selBi: arBi,
      selection: arSel,
      goto: jumpTo,
      refresh: function () {
        return API.fetchNotes(docId).then(function (r) {
          state.notes = ((r && r.data) || []).slice();
          renderNotes(); renderBookmarks(); renderPage(0, false);
        });
      }
    });
  }

  /* ---------- 8.11 按钮清理（要求一）：单态过滤 ----------
     审计见交付报告：reader-bar / 模式条里没有「只在沉浸才有意义」的项（全屏入口是
     反向的那一颗），故只挂 plain（非全屏专属）；机制同时支持 imm，供将来按钮挂载。 */
  function tkSoloFilter() {
    var immOn = document.body.classList.contains("immersive");
    qsa("[data-solo]").forEach(function (el) {
      el.hidden = el.dataset.solo === "imm" ? !immOn : immOn;
    });
  }
  tkSoloFilter();
  if (window.MutationObserver) {
    new MutationObserver(tkSoloFilter).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  /* 启动：悬浮球就位 + 轮盘档位回读（沉浸态由 CSS 决定可见性） */
  tkOrbHome();
  tkSizeLoad();

  /* ============================================================
     9. 启动
     ============================================================ */
  async function boot() {
    qs("#docTitle").textContent = doc.title;
    qs("#docKind").innerHTML = icon(doc.type === "paper" ? "graduation-cap" : doc.type === "plan" ? "list-checks" : "book", 13) +
      (doc.type === "paper" ? "论文" : doc.type === "plan" ? "计划" : "文学");
    qs("#docKind").className = "chip " + (doc.type === "paper" ? "chip-blue" : doc.type === "plan" ? "chip-accent" : "chip-green");

    /* 正文未落库：顶栏长期挂出这枚状态 —— 这一本现在能读是因为内存里还留着，
       下一次打开就读不到了，得让用户在还能补救的时候看见。 */
    if (doc.stored === "none") {
      var se = qs("#docStored");
      se.hidden = false;
      se.innerHTML = icon("database", 13) + "仅本机 · 正文未落库";
      se.title = (window.API && API.storedNote ? API.storedNote(doc.storedWhy) : "本机存储不可用") +
        " · 清理旧书腾出空间后，重新导入原文件";
    }

    /* 设置面板先按当前阅读偏好上漆：空书（解析不出正文块）也要显示真实的
       开关状态，不能停在标记未点的默认态 —— 原先这行在空书 return 之后，
       每册空书的「显示批注标记」都与设置不符。 */
    read = InkTheme.read();
    paintSettings();

    /* 空书空态：导入的 DOCX / PDF 原型解析不了二进制，没有正文块 ——
       与其渲染一册空白书，不如在正文区明说，并给出回书架的出口。
       正文没落库的书走另一句实话：不是解析不出来，是这台机器存不下。 */
    if (!blocks.length) { renderEmptyDoc(doc.stored === "none" ? doc : null); return; }

    statHeartbeat();     /* v2.7 统计埋点：真的打开了一本书，才开始 5s 阅读时长心跳 */

    var r = await API.fetchNotes(docId);
    state.notes = r.data.slice();

    applyVars();
    paintEditBar();

    state.scroll = read.mode === "scroll";
    if (!state.scroll) paginate();
    state.cur = Math.min(state.cur, Math.max(0, state.pages.length - 1));
    renderPage(0, false);

    renderToc();
    renderNotes();
    renderBookmarks();
    paintTaskDrawer();

    if (location.hash) setTimeout(function () { gotoAnchor(location.hash.slice(1)); }, 120);
    else {
      var prog = InkStore.getProgress()[docId];
      if (prog) {
        if (state.scroll) {
          /* 竖向浏览：按百分比还原滚动位置 */
          var sheet = qs("#sheet");
          sheet.scrollTop = Math.round((sheet.scrollHeight - sheet.clientHeight) * prog / 100);
          paintProg();
        } else if (state.pages.length) {
          state.cur = Math.min(state.pages.length - 1, Math.round(prog / 100 * state.pages.length) - 1);
          renderPage(0, false);
        }
      }
    }

    /* 深链：notes.html「回到原文」→ reader.html?doc=…&note=…，定位并高亮该条笔记 */
    var noteParam = params.get("note");
    if (noteParam) {
      qs("#reader").dataset.notes = "open";
      setSide(false);
      setTimeout(function () {
        focusNote(noteParam);
        var card = qs('#noteList .note-card[data-note="' + noteParam + '"]');
        if (card) card.classList.add("flash");
      }, 220);
    }

    // 字体加载完成后重新测量一次，避免分页高度偏差（位置按偏移锚回）
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        if (state.scroll) return;
        var off = curOffset();
        paginate();
        restorePaged(off);
        if (state.cur >= state.pages.length) state.cur = Math.max(0, state.pages.length - 1);
        renderPage(0, false);
      });
    }

    /* 少数插图读不出尺寸（无 width/height 的 SVG 等）：它们的高度要等解码才有。
       先让图加载完，再按字体那套「重测 + 偏移锚回」走一遍，坏图四秒后也不再等。 */
    (function () {
      var noDim = blocks.filter(function (b) { return b.type === "img" && !(+b.w > 0 && +b.h > 0) && b.src; });
      if (!noDim.length) return;
      var left = noDim.length, fired = false;
      var settle = function () {
        if (fired) return;
        fired = true;
        if (state.scroll) return;
        var off = curOffset();
        paginate();
        restorePaged(off);
        if (state.cur >= state.pages.length) state.cur = Math.max(0, state.pages.length - 1);
        renderPage(0, false);
      };
      var one = function () { if (--left <= 0) settle(); };
      noDim.forEach(function (b) {
        var im = new Image();
        im.onload = one; im.onerror = one; im.src = b.src;
      });
      setTimeout(settle, 4000);
    })();
  }

  /* ============================================================
     v2.7 阅读统计埋点（组 A）—— 只上报，不参与任何阅读逻辑
     —— 时长：5s 心跳，页面可见才计（切走即停；与微信读书「有效阅读」/ Kindle
        逐秒计时的口径一致），全页统一交给 api.js 的防抖落库；
     —— 字数：以 curOffset()（全局字符偏移）为口径的精确增量 —— 比微信读书
        「进度 × 总字数」的推算更准（我们本来就有 BLOCK_OFF 偏移表）。
        delta > 0 且 ≤ 3000 才记：回退不扣不计，跳章 / 目录跳转的大跳不刷字数。
     —— 位置基准 statOff：初次进入只记基准不累加；模式切换 / 重排按真实位置重设。
     ============================================================ */
  var statOff = null;        /* 上次上报的字符偏移；null / 非法 = 尚未建立基准 */
  var statBeat = null;       /* 5s 心跳句柄 */

  function statBumpWords() {
    /* 埋点整体兜底：量位置 / 写统计出错也绝不影响翻页与滚动（不动既有行为） */
    try {
      if (!window.API || !API.statsBump) return;
      var off = curOffset();
      if (statOff == null || !isFinite(statOff)) { statOff = off; return; }
      var d = off - statOff;
      statOff = off;
      if (d > 0 && d <= 3000) {
        API.statsBump("words", d);
        /* v2.20 反身性防护：自动翻页推进的字数不能进速度种子，否则
           自动翻页 → speedBump → readSpeed 变大 → 翻页更快 → 更快。
           人确实读过了这些字（全局统计照记），但这段位移不是他眼睛的速度。 */
        try { if (!autoDriving()) API.speedBump(doc.type, "words", d); } catch (e) {}
      }
    } catch (e) {}
  }
  /* 模式切换 / 重排后把基准重设为切换前的真实位置（此时位置尚未跳变）：
     既不产生假增量，也不丢掉切换前那一段真实增量。 */
  function statMark(off) { statOff = off; }
  function statFlush() {
    try { if (window.API && API.statsFlush) API.statsFlush(); } catch (e) {}
  }
  /* 文档打开后启动：可见才 +5s，隐藏时下一次心跳自然跳过（并已由下方 flush 落库） */
  function statHeartbeat() {
    if (statBeat) return;
    statBeat = setInterval(function () {
      if (document.visibilityState !== "visible" || document.hidden) return;
      if (!window.API || !API.statsBump) return;
      try { API.statsBump("sec", 5); try { if (!autoDriving()) API.speedBump(doc.type, "sec", 5); } catch (e) {}; } catch (e) {}
    }, 5000);
  }
  /* 隐藏 / 离开即落库：最后不到 2 秒的内存挂账不丢 */
  document.addEventListener("visibilitychange", function () { if (document.hidden) statFlush(); });
  window.addEventListener("pagehide", statFlush);
  window.addEventListener("beforeunload", statFlush);

  boot();
})();
