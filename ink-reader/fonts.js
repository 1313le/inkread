/* ============================================================
   fonts.js · 墨读 InkRead 字体系统
   职责：字体注册表 / 按需懒加载 / 主题×字体配对 / 字体商城状态
   —— 自包含，不依赖 app.js；须在 theme.js 之前引入（theme.js 会读它）。
   —— 字体的 font-family 栈写在 styles.css 的 --font-<k>；此处只管
      「元数据 + 加载 + 配对 + 安装态」，避免两处真相。
   ============================================================ */
(function () {
  "use strict";

  var GF = "https://fonts.googleapis.com/css2?family=";
  var JD = "https://cdn.jsdelivr.net/npm/";

  /* ------------------------------------------------------------
     1. 字体注册表
     kind: zh 中文字 / latin 拉丁字
     load: gf=Google Fonts 家族串；face=自建 @font-face（jsDelivr 直链）
     ------------------------------------------------------------ */
  var FONTS = [
    /* ---- 中文 10 款 ---- */
    { k: "song", name: "思源宋体", en: "Noto Serif SC", kind: "zh", d: "印刷宋体，横细竖粗，长文阅读的端正之选", mood: "典雅 · 书卷",
      load: { gf: "Noto+Serif+SC:wght@300;400;600;700;900" } },
    { k: "hei", name: "思源黑体", en: "Noto Sans SC", kind: "zh", d: "中性无衬线，屏幕显示清晰，界面与正文皆宜", mood: "现代 · 中性",
      load: { gf: "Noto+Sans+SC:wght@300;400;500;700;900" } },
    { k: "kai", name: "霞鹜文楷", en: "LXGW WenKai", kind: "zh", d: "手写楷体骨架，笔意温润，读来亲近", mood: "文艺 · 亲和",
      load: { css: [JD + "lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css", JD + "lxgw-wenkai-webfont@1.7.0/lxgwwenkai-bold.css"] } },
    { k: "smiley", name: "得意黑", en: "Smiley Sans", kind: "zh", d: "窄长斜切黑体，海报般的现代张力，适合标题", mood: "前卫 · 冲击",
      load: { face: [{ family: "Smiley Sans", weight: 400, style: "normal",
        url: JD + "@fontpkg/smiley-sans@2.0.4/SmileySans-Oblique.otf.woff2" }] } },
    { k: "xiaowei", name: "站酷小薇体", en: "ZCOOL XiaoWei", kind: "zh", d: "清秀纤细，笔锋利落，标题有书卷气", mood: "清秀 · 雅致",
      load: { gf: "ZCOOL+XiaoWei" } },
    { k: "huangyou", name: "站酷庆科黄油体", en: "ZCOOL QingKe HuangYou", kind: "zh", d: "圆润饱满，暖调亲和，适合轻松标题", mood: "圆润 · 温暖",
      load: { gf: "ZCOOL+QingKe+HuangYou" } },
    { k: "kuaile", name: "站酷快乐体", en: "ZCOOL KuaiLe", kind: "zh", d: "活泼跳脱，手写感强，用于玩味标题", mood: "活泼 · 玩味",
      load: { gf: "ZCOOL+KuaiLe" } },
    { k: "mashan", name: "马善政毛笔楷书", en: "Ma Shan Zheng", kind: "zh", d: "毛笔书写，墨气淋漓，复古戏剧感", mood: "书法 · 复古",
      load: { gf: "Ma+Shan+Zheng" } },
    { k: "longcang", name: "龙藏体", en: "Long Cang", kind: "zh", d: "细笔手写，轻逸舒展，适合引语与题记", mood: "手写 · 轻逸",
      load: { gf: "Long+Cang" } },
    { k: "mono", name: "等宽黑体", en: "Noto Sans Mono", kind: "zh", d: "等宽字形，代码、数据与终端风主题", mood: "技术 · 等宽",
      load: { gf: "Noto+Sans+Mono:wght@300;400;500;700" } },

    /* ---- 拉丁 13 款（v2.14 新增 Crimson Pro） ---- */
    { k: "crimson", name: "Crimson Pro", en: "Crimson Pro", kind: "latin", d: "文艺复兴古风衬线，字腔温暖，纸墨气质的拉丁正文", mood: "书卷 · 温润",
      load: { gf: "Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400" } },
    { k: "cormorant", name: "Cormorant Garamond", en: "Cormorant Garamond", kind: "latin", d: "古典加拉蒙，笔画纤细优雅", mood: "古典 · 优雅",
      load: { gf: "Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400" } },
    { k: "garamond", name: "EB Garamond", en: "EB Garamond", kind: "latin", d: "旧体衬线，印刷书页的经典气息", mood: "书页 · 复古",
      load: { gf: "EB+Garamond:ital,wght@0,400;0,600;0,700;1,400" } },
    { k: "playfair", name: "Playfair Display", en: "Playfair Display", kind: "latin", d: "高对比迪多风格，杂志大标题的常客", mood: "杂志 · 高雅",
      load: { gf: "Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400" } },
    { k: "bodoni", name: "Bodoni Moda", en: "Bodoni Moda", kind: "latin", d: "极致粗细对比，时尚刊物的冷艳", mood: "时尚 · 冷艳",
      load: { gf: "Bodoni+Moda:ital,wght@0,400;0,600;0,700;0,900;1,400" } },
    { k: "dmserif", name: "DM Serif Display", en: "DM Serif Display", kind: "latin", d: "现代高对比衬线，标题利器", mood: "现代 · 庄重",
      load: { gf: "DM+Serif+Display:ital,wght@0,400;1,400" } },
    { k: "fraunces", name: "Fraunces", en: "Fraunces", kind: "latin", d: "可变软衬线，复古又当代", mood: "复古 · 当代",
      load: { gf: "Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400" } },
    { k: "archivo", name: "Archivo", en: "Archivo", kind: "latin", d: "中性无衬线，国际主义编辑风", mood: "瑞士 · 中性",
      load: { gf: "Archivo:wght@400;500;600;700;800;900" } },
    { k: "anton", name: "Anton", en: "Anton", kind: "latin", d: "超窄重黑，海报冲击力最强", mood: "海报 · 冲击",
      load: { gf: "Anton" } },
    { k: "bebas", name: "Bebas Neue", en: "Bebas Neue", kind: "latin", d: "窄体大写，标题排布紧凑有力", mood: "紧凑 · 有力",
      load: { gf: "Bebas+Neue" } },
    { k: "syne", name: "Syne", en: "Syne", kind: "latin", d: "另类几何无衬线，艺术展气质", mood: "艺术 · 另类",
      load: { gf: "Syne:wght@400;600;700;800" } },
    { k: "unbounded", name: "Unbounded", en: "Unbounded", kind: "latin", d: "未来感宽体，科技海报气质", mood: "未来 · 科技",
      load: { gf: "Unbounded:wght@300;400;600;700;900" } },
    { k: "spacemono", name: "Space Mono", en: "Space Mono", kind: "latin", d: "等宽复古，终端与数据段落", mood: "等宽 · 复古",
      load: { gf: "Space+Mono:ital,wght@0,400;0,700;1,400" } },

    /* ---- 品牌族 2 款（v12）：取自品牌视觉规范，标题 Poppins / 正文 Lora ---- */
    { k: "poppins", name: "Poppins", en: "Poppins", kind: "latin", d: "几何无衬线，圆润规整，标题层级清晰", mood: "现代 · 规整",
      load: { gf: "Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400" } },
    { k: "lora", name: "Lora", en: "Lora", kind: "latin", d: "当代衬线，笔锋有弹性，长段拉丁正文耐读", mood: "当代 · 书卷",
      load: { gf: "Lora:ital,wght@0,400;0,500;0,600;0,700;1,400" } }
  ];

  var MAP = {};
  FONTS.forEach(function (f) { MAP[f.k] = f; });

  /* ------------------------------------------------------------
     2. 主题 × 字体配对（26 套主题各配中文 + 拉丁 display）
     ------------------------------------------------------------ */
  var PAIR = {
    paper:        { zh: "song",     latin: "crimson" },
    white:        { zh: "hei",      latin: "archivo" },
    sepia:        { zh: "kai",      latin: "garamond" },
    cream:        { zh: "song",     latin: "playfair" },
    leaf:         { zh: "kai",      latin: "cormorant" },
    bean:         { zh: "hei",      latin: "archivo" },
    herb:         { zh: "xiaowei",  latin: "fraunces" },
    lilac:        { zh: "song",     latin: "cormorant" },
    night:        { zh: "song",     latin: "garamond" },
    charcoal:     { zh: "hei",      latin: "archivo" },
    ember:        { zh: "song",     latin: "playfair" },
    black:        { zh: "hei",      latin: "bebas" },
    contrast:     { zh: "hei",      latin: "archivo" },
    contrastNight:{ zh: "hei",      latin: "archivo" },
    bauhaus:      { zh: "hei",      latin: "archivo" },
    swiss:        { zh: "hei",      latin: "archivo" },
    riso:         { zh: "smiley",   latin: "spacemono" },
    brutal:       { zh: "smiley",   latin: "anton" },
    memphis:      { zh: "kuaile",   latin: "syne" },
    neonwashi:    { zh: "smiley",   latin: "syne" },
    magazine:     { zh: "smiley",   latin: "bodoni" },
    cyberink:     { zh: "hei",      latin: "unbounded" },
    nocturne:     { zh: "song",     latin: "playfair" },
    terminal:     { zh: "mono",     latin: "spacemono" },
    abyss:        { zh: "hei",      latin: "unbounded" },
    vermilion:    { zh: "song",     latin: "dmserif" },
    /* 品牌 · 暖陶（v12）：一套同纸同墨的暖纸三调，字体家族统一 ——
       标题 Poppins、拉丁正文 Lora，中文回落到宋体 */
    clay:         { zh: "song",     latin: "poppins", latinBody: "lora" },
    sage:         { zh: "song",     latin: "poppins", latinBody: "lora" },
    clayNight:    { zh: "song",     latin: "poppins", latinBody: "lora" }
  };

  /* ------------------------------------------------------------
     3. 按需加载：只在字体首次被用到时注入
     ------------------------------------------------------------ */
  var K_ENABLED = "inkread.fonts.enabled.v1";
  var PRELOAD = ["song", "hei", "kai", "mono", "cormorant", "archivo", "garamond", "playfair", "poppins", "lora"];
  var done = {};                             /* 已注入标记 */
  var _enabled = null;

  function lsGet(k, fb) {
    try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); }
    catch (e) { return fb; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function injectCSS(id, css) {
    if (document.getElementById(id)) return;
    var st = document.createElement("style");
    st.id = id; st.textContent = css;
    document.head.appendChild(st);
  }
  /* 字体样式表一律「不挡首屏」，也不再挡 load —— v1.0.1 起改为 fetch 取文本 + 注入 <style>：
     —— <link media="print"> 只保首绘，保不住 load 事件：link 一发出请求，load 就等它结束，
        而挂死的表实测 4–6.5s 才被网络栈放弃（劣化网络更久），且**移除节点/href 都放不开**
        （headless Chromium 实测三法全灭：节点移除、removeAttribute(href)、href="data:"）。
     —— fetch 不进文档资源集，天然不压 load；AbortController 到点即真中止；失败/超时留档，
        联网 / 回到前台时原样再取一次即可补上字体。display=swap 由远端表自带，取不回也不白屏。 */
  var LINK_TIMEOUT = 5000;
  var pending = [];
  function loadFontCss(rec) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) try { ctl.abort(); } catch (e) {} }, LINK_TIMEOUT);
    fetch(rec.href, { mode: "cors", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (css) {
        clearTimeout(timer);
        var st = document.getElementById(rec.id);
        if (!st) { st = document.createElement("style"); st.id = rec.id; document.head.appendChild(st); }
        st.textContent = css;
        rec.done = true;
      })
      .catch(function () { clearTimeout(timer); rec.done = false; });
  }
  function injectLink(id, href) {
    if (document.getElementById(id)) return;
    var rec = { id: id, href: href, done: false };
    pending.push(rec);
    loadFontCss(rec);
  }
  function retryPending() {
    pending.forEach(function (rec) { if (!rec.done) loadFontCss(rec); });
  }
  if (window.addEventListener) {
    window.addEventListener("online", retryPending);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) retryPending(); });
  }

  /* 把某字体接到页面上（幂等） */
  function ensure(k) {
    var f = MAP[k];
    if (!f || done[k]) return;
    done[k] = true;
    var L = f.load || {};
    if (L.gf) injectLink("fnt-" + k, GF + L.gf + "&display=swap");
    if (L.css) L.css.forEach(function (u, i) { injectLink("fnt-" + k + "-" + i, u); });
    if (L.face) {
      injectCSS("fnt-" + k, L.face.map(function (fc) {
        return '@font-face{font-family:"' + fc.family + '";font-style:' + (fc.style || "normal") +
          ";font-weight:" + (fc.weight || 400) + ";font-display:swap;src:url(" + fc.url + ') format("woff2")}';
      }).join("\n"));
    }
  }
  /* 预取当前主题所需的两款（首屏只加载这两个） */
  function ensurePair(themeK) {
    var p = PAIR[themeK] || PAIR.paper;
    ensure(p.zh); ensure(p.latin);
    if (p.latinBody) ensure(p.latinBody);
  }

  function enabled() {
    if (_enabled) return _enabled;
    var v = lsGet(K_ENABLED, null);
    _enabled = Array.isArray(v) ? v : PRELOAD.slice();
    if (!Array.isArray(v)) lsSet(K_ENABLED, _enabled);
    return _enabled;
  }
  function setEnabled(v) { _enabled = v; lsSet(K_ENABLED, v); return v; }
  function isEnabled(k) { return enabled().indexOf(k) >= 0 || PRELOAD.indexOf(k) >= 0; }
  function enable(k) { if (!MAP[k]) return enabled(); var v = enabled(); if (v.indexOf(k) < 0) { v.push(k); setEnabled(v); } return v; }
  function disable(k) { return setEnabled(enabled().filter(function (x) { return x !== k; })); }

  /* 已启用字体 + 全部字体（供字体商城两栏共用） */
  function list() {
    var on = enabled();
    return FONTS.map(function (f) {
      return { k: f.k, name: f.name, en: f.en, kind: f.kind, d: f.d, mood: f.mood,
        installed: on.indexOf(f.k) >= 0 || PRELOAD.indexOf(f.k) >= 0 };
    });
  }
  function stackOf(k) { return MAP[k] ? "var(--font-" + k + ")" : "var(--font-song)"; }
  function pairFor(themeK) { return PAIR[themeK] || PAIR.paper; }

  /* 主题的字体描述（供主题卡显示） */
  function pairNames(themeK) {
    var p = pairFor(themeK);
    return { zh: MAP[p.zh] ? MAP[p.zh].name : p.zh, latin: MAP[p.latin] ? MAP[p.latin].name : p.latin,
      latinBody: p.latinBody ? (MAP[p.latinBody] ? MAP[p.latinBody].name : p.latinBody) : "",
      zhK: p.zh, latinK: p.latin, latinBodyK: p.latinBody || "" };
  }

  window.InkFonts = {
    FONTS: FONTS, MAP: MAP, PAIR: PAIR, PRELOAD: PRELOAD,
    ensure: ensure, ensurePair: ensurePair,
    enabled: enabled, isEnabled: isEnabled, enable: enable, disable: disable,
    list: list, meta: function (k) { return MAP[k] || null; },
    stackOf: stackOf, pairFor: pairFor, pairNames: pairNames
  };

  /* 首屏：把当前主题的两款字体挂上（theme.js 稍后会再按设置校正） */
  try {
    var bootTheme = lsGet("inkread.theme", null) || "paper";
    ensurePair(typeof bootTheme === "string" ? bootTheme : "paper");
  } catch (e) {}
})();
