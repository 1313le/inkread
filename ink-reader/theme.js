/* ============================================================
   theme.js · 墨读 InkRead 外观引擎
   职责：主题注册表 / 主题解析与切换 / 阅读设置模型 / 全站共享外观面板
   —— 色值只写在 styles.css 的 [data-theme="k"] 里，此处仅登记元数据。
      主题卡片的预览由 CSS 自行渲染：卡片自带 data-theme，从而继承该主题的 token。
   —— 依赖 app.js 的 InkStore / icon / toast / qs，故必须在其后引入。
   ============================================================ */
(function () {
  "use strict";

  /* ============================================================
     1. 主题注册表
     分组依据阅读介质与场景（对齐 Kindle / Apple Books / MarginNote 的分类方式）
     ============================================================ */
  var GROUPS = [
    { k: "day",   name: "纸 · 日间",     note: "反射纸感，长文阅读的默认选择" },
    { k: "care",  name: "护眼 · 低刺激", note: "低饱和底色，降低视觉刺激" },
    { k: "night", name: "夜 · 低光",     note: "暗底暖字，避免纯白压在暗底上" },
    { k: "a11y",  name: "高对比 · 无障碍", note: "对比度优先；墨水屏残影会略增" },
    { k: "brand", name: "品牌 · 暖陶",   note: "暖纸近黑墨，强调色克制；标题 Poppins、拉丁正文 Lora" },
    { k: "bold",  name: "宣言 · 大胆",   note: "撞色、硬边与几何母题；界面层放开，正文仍守 AAA" }
  ];

  /* 场景母题（v8）：主题自带一幅静态分层场景，动效只在交互那一刻发生一次。
     pixel   像素远行 —— 三层阶梯山脊 + 针叶林 + 日轮，纯 SVG 逐像素绘制
     aurora  几何色带 —— 硬边楔形色块叠印（包豪斯 / 瑞士 / 新粗野的几何母题）
     seasons 四时流转 —— 同一像素山水按本机时段离散换色（不流动） */
  var SCENE_META = {
    pixel:   { name: "像素远行", d: "三层阶梯山脊与针叶林，翻页时按景深错速横移一次" },
    aurora:  { name: "几何色带", d: "硬边楔形撞色叠印，换章时色相偏移一次" },
    seasons: { name: "水墨长卷", d: "六幅大都会公版真迹手卷；按本机时段换色，翻页时展卷错速一次" }
  };

  var THEMES = [
    { k: "paper",   name: "宣纸",   g: "day",   tone: "light", d: "微暖米白，接近胶版纸", scene: "seasons" },
    { k: "white",   name: "素白",   g: "day",   tone: "light", d: "干净白底，图表与公式最清晰" },
    { k: "sepia",   name: "羊皮纸", g: "day",   tone: "light", d: "偏黄褐，复古书页", scene: "seasons" },
    { k: "cream",   name: "杏仁黄", g: "day",   tone: "light", d: "淡黄底，降低蓝光感", scene: "seasons" },
    { k: "leaf",    name: "秋叶褐", g: "day",   tone: "light", d: "暖褐底，久看不刺眼", scene: "seasons" },
    { k: "bean",    name: "豆沙绿", g: "care",  tone: "light", d: "经典护眼绿，底色较实" },
    { k: "herb",    name: "青草绿", g: "care",  tone: "light", d: "浅青绿，底色更轻" },
    { k: "lilac",   name: "葛巾紫", g: "care",  tone: "light", d: "灰紫调，弱化色偏" },
    { k: "night",   name: "夜墨",   g: "night", tone: "dark",  d: "暖调深墨，夜间默认", scene: "seasons" },
    { k: "charcoal",name: "深灰",   g: "night", tone: "dark",  d: "中性灰，无暖色偏" },
    { k: "ember",   name: "暖夜",   g: "night", tone: "dark",  d: "琥珀底，蓝光最少", scene: "seasons" },
    { k: "black",   name: "纯黑",   g: "night", tone: "dark",  d: "最省电；残影与拖影最明显", scene: "pixel" },
    { k: "contrast",     name: "高对比",   g: "a11y", tone: "light", d: "近黑字压近白底" },
    { k: "contrastNight",name: "高对比夜", g: "a11y", tone: "dark",  d: "纯色两极，弱视友好" },
    /* 宣言 · 大胆：界面层允许撞色与几何，正文对比度仍按 AAA 校准 */
    { k: "bauhaus",   name: "包豪斯",     g: "bold", tone: "light", d: "红蓝三原色撞色，几何构成，1920 年代现代主义", scene: "aurora" },
    { k: "swiss",     name: "瑞士",       g: "bold", tone: "light", d: "无衬线 + 强对比红，国际主义编辑风", scene: "aurora" },
    { k: "riso",      name: "Riso 双色",  g: "bold", tone: "light", d: "橙青双色叠印，孔版印刷的错位感", scene: "aurora" },
    { k: "brutal",    name: "新粗野",     g: "bold", tone: "light", d: "荧光黄底压纯黑，硬边与方角", scene: "aurora" },
    { k: "memphis",   name: "孟菲斯",     g: "bold", tone: "light", d: "珊瑚红撞钴蓝，1980 年代后现代", scene: "aurora" },
    { k: "neonwashi", name: "荧光和纸",   g: "bold", tone: "light", d: "洋红荧光落纸，冷蓝压边", scene: "aurora" },
    { k: "magazine",  name: "杂志",       g: "bold", tone: "light", d: "编辑部大标题红，冷蓝作副", scene: "aurora" },
    { k: "cyberink",  name: "赛博墨",     g: "bold", tone: "dark",  d: "青绿撞紫，暗底霓虹", scene: "pixel" },
    { k: "nocturne",  name: "暗夜金",     g: "bold", tone: "dark",  d: "金箔压黑，庄重而贵", scene: "pixel" },
    { k: "terminal",  name: "荧光终端",   g: "bold", tone: "dark",  d: "磷光绿撞琥珀，CRT 时代", scene: "pixel" },
    { k: "abyss",     name: "深海",       g: "bold", tone: "dark",  d: "蓝撞青，深海冷光", scene: "pixel" },
    { k: "vermilion", name: "赤金",       g: "bold", tone: "dark",  d: "朱砂撞金，碑拓拓印", scene: "pixel" },
    /* 品牌 · 暖陶（v12）：以品牌视觉规范校准的暖纸三调 —— 橙 / 蓝 / 绿三支强调色 */
    { k: "clay",      name: "暖陶",   g: "brand", tone: "light", d: "暖纸压近黑墨，橙为主强调、蓝作副", scene: "seasons" },
    { k: "sage",      name: "鼠尾草", g: "brand", tone: "light", d: "同纸同墨，绿作主强调、橙作副", scene: "seasons" },
    { k: "clayNight", name: "暖陶夜", g: "brand", tone: "dark",  d: "近黑暖底压米白字，夜间不刺眼", scene: "seasons" }
  ];

  var THEME_MAP = {};
  THEMES.forEach(function (t) { THEME_MAP[t.k] = t; });
  var GROUP_NAME = {};
  GROUPS.forEach(function (g) { GROUP_NAME[g.k] = g.name; });

  /* ============================================================
     1b. 主题商城模型
     出厂预装一小撮（每组至少 1 套），其余进商城按需下载 ——
     避免 29 套一次铺开造成的选择过载（Choice Paradox）。
     存储：installed=已安装 key 数组；custom=用户自建主题（L1 四原色）。
     ============================================================ */
  var PREINSTALL = ["paper", "clay", "white", "sepia", "bean", "night", "charcoal", "contrast", "bauhaus"];
  var K_INST = "inkread.themes.installed.v1";
  var K_CUSTOM = "inkread.themes.custom.v1";
  var _custom = null;                       /* 自建主题内存缓存，写入时失效 */

  function installed() {
    var v = lsGet(K_INST, null);
    if (!Array.isArray(v)) { v = PREINSTALL.slice(); lsSet(K_INST, v); }
    return v;
  }
  function setInstalled(v) { lsSet(K_INST, v); return v; }

  function customList() {
    if (_custom) return _custom;
    var v = lsGet(K_CUSTOM, []);
    _custom = Array.isArray(v) ? v : [];
    return _custom;
  }
  function customOf(k) {
    return customList().filter(function (c) { return c.k === k; })[0] || null;
  }
  function customSave(t) {
    var list = customList().slice(), i = -1;
    for (var n = 0; n < list.length; n++) if (list[n].k === t.k) { i = n; break; }
    if (i >= 0) list[i] = Object.assign({}, list[i], t); else list.push(t);
    _custom = list; lsSet(K_CUSTOM, list);
    return t;
  }
  function customRemove(k) {
    _custom = customList().filter(function (c) { return c.k !== k; });
    lsSet(K_CUSTOM, _custom);
    return _custom;
  }

  /* 元数据查询：内置主题与自建主题统一走这里 */
  function metaOf(k) { return THEME_MAP[k] || customOf(k); }
  function isInstalled(k) { return installed().indexOf(k) >= 0 || !!customOf(k); }
  function install(k) {
    if (!THEME_MAP[k]) return installed();
    var v = installed();
    if (v.indexOf(k) < 0) { v.push(k); setInstalled(v); }
    return v;
  }
  /* 卸载：只摘掉安装标记，色值仍留在 styles.css，重新下载即恢复 */
  function uninstall(k) {
    return setInstalled(installed().filter(function (x) { return x !== k; }));
  }
  /* 可用主题 = 已安装的内置主题 + 全部自建主题 */
  function available() {
    var inst = installed();
    return THEMES.filter(function (t) { return inst.indexOf(t.k) >= 0; }).concat(customList());
  }
  /* 商城列表：内置主题带 installed 标记，供「我的主题 / 主题商城」两栏共用 */
  function storeList() {
    var inst = installed();
    return THEMES.map(function (t) {
      return Object.assign({}, t, { installed: inst.indexOf(t.k) >= 0 });
    });
  }

  /* ============================================================
     2. 阅读设置模型
     沿用旧键（fs/lh/fw/theme/marks/learn/twoCol/auto/fx）以保证旧数据可用
     ============================================================ */
  var DEFAULTS = {
    /* 主题 */
    theme: "paper", themeMode: "manual",
    dayTheme: "paper", nightTheme: "night",
    /* 视觉强度：静谧 / 标准 / 张扬；只作用于界面外壳，不动正文 */
    intensity: "standard",
    /* 定时切换：fixed=按钟点，sun=按日出日落（本机时间 + 经纬度推算） */
    schedMode: "sun", dayAt: 7, nightAt: 19,
    lat: 39.9042, lon: 116.4074,
    /* 夜间护眼（v13）：在纸面之上再叠一层降蓝光滤镜，与主题切换互相独立。
       off 关闭 / auto 自动（环境光优先，退化到按时间）/ on 常开 */
    night: "off", nightWarm: 45, nightDim: 14,
    /* 排版 */
    font: "auto", display: "auto", fs: 17, lh: 2, wt: 400, ls: 0.012,
    para: 0.72, indent: 0, align: "left",
    /* 栏宽以「每行字数」计量（v12）：随字号缩放，换字号时版心不跑偏 */
    fw: 36, twoCol: false, auto: true,
    /* 阅读模式：paged 横向翻页 / scroll 竖向浏览（v8 从 twoCol 拆出） */
    mode: "paged",
    /* 内容类别阅读模式（v9）：auto 由主脑识别推荐，也可由用户改判为四类之一 */
    modeCat: "auto",
    /* 漫画阅读方向：ltr 从左到右 / rtl 从右到左（日式） */
    comicDir: "ltr",
    /* 条漫分格间距：seam 无缝拼接（同一场景的连续分镜）/ mid 常规 / wide 疏朗（场景转换） */
    comicGap: "mid",
    /* 分格引导阅读：一次一格，自动放大 */
    guide: false,
    /* 翻译：off 关闭 / para 段落对照 / hover 悬停译（划词翻译始终可用，无需开关） */
    trans: "off",
    /* 翻译语向（v15）：记住读者上次选的语向，不必每次重挑 ——
       trFrom 源语言（auto = 自动检测）；trTo 目标语言（ai = 由主脑按原文判断该译成什么语言） */
    trFrom: "auto", trTo: "ai",
    /* 显示 */
    marks: true, learn: true, fx: true, reduce: false, grain: true,
    /* 场景装饰：主题自带的静态分层场景（动效只在交互时播放一次） */
    scene: true,
    /* 画卷（v2.1）：名画画库 —— auto 为每次进入随机展卷一幅；可固定某一名画 */
    sceneArt: "auto",
    prog: "page",
    /* 翻页动效 */
    flip: "curl"
  };

  /* 旧数据缺字段用默认值补齐；数值做范围钳制，避免脏数据把版面撑坏 */
  var RANGE = {
    fs: [13, 26], lh: [1.4, 2.8], wt: [300, 800], ls: [0, 0.12],
    para: [0, 2], indent: [0, 2], fw: [26, 48], dayAt: [0, 23], nightAt: [0, 23],
    lat: [-90, 90], lon: [-180, 180], nightWarm: [0, 100], nightDim: [0, 100]
  };

  var NUMERIC = { fs: 1, lh: 1, wt: 1, ls: 1, para: 1, indent: 1, fw: 1, dayAt: 1, nightAt: 1, lat: 1, lon: 1, nightWarm: 1, nightDim: 1 };

  /* ------------------------------------------------------------
     v2.19.3 B：页面疏密五档
     字号 × 行高 × 段间距打包成一个「意图」，读者一次改一档就能把整本页容量
     从「一页 18 行」调到「一页 30 行」，不必分别拖三条滑块。
     端点守住可读性下限：中文正文 16px（网页中文排版共识的地板）、行距 1.6
     （低于此值汉字上下行笔画开始互咬）；最疏一档封顶 2.3，再疏就成了画册。
     mid 与旧默认值逐字相同，所以「适中」即出厂状态，不是新的一档。
     ------------------------------------------------------------ */
  var DEN = {
    loose2: { fs: 18, lh: 2.30, para: 0.95 },
    loose1: { fs: 17, lh: 2.15, para: 0.85 },
    mid:    { fs: 17, lh: 2.00, para: 0.72 },
    dense1: { fs: 16, lh: 1.80, para: 0.60 },
    dense2: { fs: 16, lh: 1.60, para: 0.50 }
  };
  var DEN_ORDER = ["loose2", "loose1", "mid", "dense1", "dense2"];
  var DEN_NAME = { loose2: "极疏", loose1: "稍疏", mid: "适中", dense1: "稍密", dense2: "极密" };

  /* 当前三个数值落在哪一档才算命中：全等才亮，拖过滑块就退回「未选中」——高亮不能骗人 */
  function denKey(s) {
    for (var i = 0; i < DEN_ORDER.length; i++) {
      var k = DEN_ORDER[i], d = DEN[k];
      if (Math.round(+s.fs) === d.fs && Math.abs(+s.lh - d.lh) < 0.011 && Math.abs(+s.para - d.para) < 0.011) return k;
    }
    return "";
  }

  /* 档位行下的说明：自适应开着时先把话讲明白（选一档会接管排版），否则给当前档读数 */
  function denHint(s) {
    if (s.auto) {
      return "五档各是一组「字号 · 行高 · 段距」配比。当前「按内容自适应」开着，行高由文体决定；" +
        "点一档即转为手动排版，随时可在下方分栏区重开自适应。";
    }
    var k = denKey(s);
    return k ? "当前「" + DEN_NAME[k] + "」：正文 " + DEN[k].fs + "px · 行高 " + DEN[k].lh +
      " 倍 · 段距 " + DEN[k].para + "em。"
      : "当前数值与五档都不完全一致（自定义）；点一档即可归位。";
  }

  /* 一键推荐的实测报告由阅读页写进来（reader.html 的 inkDenAI），改过排版即作废 */
  var denReport = "";
  var DEN_TOUCH = { fs: 1, lh: 1, para: 1, ls: 1, indent: 1, fw: 1, auto: 1, twoCol: 1 };
  function setDenReport(txt) { denReport = txt || ""; aaSync(); }

  /* 常用城市：手动填经纬度对读者不友好，给一组预设；不在表内即「自定义」 */
  var CITIES = [
    { n: "北京", lat: 39.9042, lon: 116.4074 },
    { n: "上海", lat: 31.2304, lon: 121.4737 },
    { n: "广州", lat: 23.1291, lon: 113.2644 },
    { n: "成都", lat: 30.5728, lon: 104.0668 },
    { n: "西安", lat: 34.3416, lon: 108.9398 },
    { n: "哈尔滨", lat: 45.8038, lon: 126.5349 },
    { n: "乌鲁木齐", lat: 43.8256, lon: 87.6168 },
    { n: "拉萨", lat: 29.652, lon: 91.1721 },
    { n: "香港", lat: 22.3193, lon: 114.1694 },
    { n: "台北", lat: 25.033, lon: 121.5654 }
  ];

  var UNIT = { fs: "px", lh: " 倍", ls: " em", para: " em", indent: " em", fw: " 字", nightWarm: " %", nightDim: " %" };

  function fmt(k, v) { return v + (UNIT[k] || ""); }

  /* ------------------------------------------------------------
     存储：优先走 app.js 的 InkStore；未加载时（本文件置于 head）
     直接读同一套 localStorage 键，保证首屏零闪烁且不丢设置。
     ------------------------------------------------------------ */
  var K_READ = "inkread.read.v1", K_THEME = "inkread.theme";

  function lsGet(k, fb) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; }
    catch (e) { return fb; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function storeRead() {
    if (window.InkStore && InkStore.getRead) return InkStore.getRead();
    return lsGet(K_READ, null) || {};
  }
  function storeWrite(patch) {
    if (window.InkStore && InkStore.setRead) return InkStore.setRead(patch);
    var r = Object.assign(storeRead(), patch);
    lsSet(K_READ, r);
    return r;
  }

  /* 字体取值闸门：只接受 auto 或字体注册表里同类型的键，避免脏数据指向不存在的变量 */
  function fontOk(v, kind, fb) {
    if (v === "auto") return "auto";
    var m = window.InkFonts && InkFonts.meta(v);
    return m && m.kind === kind ? v : fb;
  }

  function read() {
    var r = storeRead();
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = r[k] === undefined || r[k] === null ? DEFAULTS[k] : r[k];
    });
    /* v12 迁移：栏宽由 px 改为「每行字数」。旧值必 > 60（px），按当前字号折算；折算后 ≤48，故幂等 */
    if (Number(out.fw) > 60) out.fw = Math.round(Number(out.fw) / (Number(out.fs) || DEFAULTS.fs));
    Object.keys(RANGE).forEach(function (k) {
      var v = Number(out[k]);
      out[k] = isNaN(v) ? DEFAULTS[k] : Math.min(RANGE[k][1], Math.max(RANGE[k][0], v));
    });
    if (!metaOf(out.theme)) out.theme = DEFAULTS.theme;
    if (!metaOf(out.dayTheme)) out.dayTheme = DEFAULTS.dayTheme;
    if (!metaOf(out.nightTheme)) out.nightTheme = DEFAULTS.nightTheme;
    /* 主题被卸载后若仍是当前选择，回落到可用主题，避免界面落到未安装项 */
    var okKeys = available().map(function (t) { return t.k; });
    var fb = okKeys[0] || DEFAULTS.theme;
    if (okKeys.indexOf(out.theme) < 0) out.theme = fb;
    if (okKeys.indexOf(out.dayTheme) < 0) out.dayTheme = fb;
    if (okKeys.indexOf(out.nightTheme) < 0) out.nightTheme = fb;
    /* 枚举字段兜底，避免脏数据让 --font-* 指向不存在的变量 */
    var LEGACY_FONT = { serif: "auto", sans: "auto", kai: "kai", mono: "mono" };
    if (LEGACY_FONT[out.font]) out.font = LEGACY_FONT[out.font];
    out.font = fontOk(out.font, "zh", DEFAULTS.font);
    out.display = fontOk(out.display, "latin", DEFAULTS.display);
    if (["paged", "scroll"].indexOf(out.mode) < 0) out.mode = DEFAULTS.mode;
    if (["auto", "book", "paper", "study", "comic"].indexOf(out.modeCat) < 0) out.modeCat = DEFAULTS.modeCat;
    if (["ltr", "rtl"].indexOf(out.comicDir) < 0) out.comicDir = DEFAULTS.comicDir;
    if (["seam", "mid", "wide"].indexOf(out.comicGap) < 0) out.comicGap = DEFAULTS.comicGap;
    if (["off", "para", "hover"].indexOf(out.trans) < 0) out.trans = DEFAULTS.trans;
    /* 语向只做「非空字符串」这一层兜底；合法语种由 api.js 的语言表裁定（此处不重复维护一份表） */
    out.trFrom = String(out.trFrom || DEFAULTS.trFrom).slice(0, 12) || DEFAULTS.trFrom;
    out.trTo = String(out.trTo || DEFAULTS.trTo).slice(0, 12) || DEFAULTS.trTo;
    out.guide = !!out.guide;
    if (["left", "justify"].indexOf(out.align) < 0) out.align = DEFAULTS.align;
    if (["page", "percent", "remain"].indexOf(out.prog) < 0) out.prog = DEFAULTS.prog;
    if (["manual", "system", "schedule"].indexOf(out.themeMode) < 0) out.themeMode = DEFAULTS.themeMode;
    if (["fixed", "sun"].indexOf(out.schedMode) < 0) out.schedMode = DEFAULTS.schedMode;
    if (["curl", "slide", "fade", "cover", "none"].indexOf(out.flip) < 0) out.flip = DEFAULTS.flip;
    if (["quiet", "standard", "bold"].indexOf(out.intensity) < 0) out.intensity = DEFAULTS.intensity;
    if (["off", "auto", "on"].indexOf(out.night) < 0) out.night = DEFAULTS.night;
    /* 旧设置的 nightSense（环境光/按时间）已随传感器移除，静默丢弃 */
    delete out.nightSense;
    /* 校验表与 scene.js 的 GALLERY 同序；油画三幅（andes/estaque/cedars）随 v2.19 入列，
       万里江山图同版退役（绢本通幅 127.8，过不了 §四 亮度闸门）—— 已存该键的人会被
       回落到 auto 随机展卷，不是报错。这里不改成现取：normalize() 可能在 scene.js
       之前被调用，现取会把已存的油画键洗掉。 */
    if (["auto", "fuchun", "qingming", "shuangsong", "qiuse", "sihuayu",
         "andes", "estaque", "cedars"].indexOf(out.sceneArt) < 0) out.sceneArt = DEFAULTS.sceneArt;
    return out;
  }

  /* 系统级「减弱动效」与应用内开关同效（WCAG 2.3.3 / 开关旁那句「同时遵循系统的…」）。
     read().reduce 保持是「用户自己的选择」不动它，这里给的是「现在到底该不该动」——
     匀速滚动这类连续位移，OS 说了「减」就必须减。 */
  function reduced() {
    if (read().reduce) return true;
    try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    catch (e) { return false; }
  }

  function write(patch) {
    storeWrite(patch);
    var cur = read();
    /* 旧入口仍读 inkread.theme，保持同步 */
    try { localStorage.setItem(K_THEME, cur.theme); } catch (e) {}
    return cur;
  }

  /* ============================================================
     3. 主题解析与落地
     ============================================================ */
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  /* ---------- 本机时间 ---------- */
  /* 小数小时（含分钟），定时切换按本机时钟推进 */
  function nowHours() {
    var d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }
  function tzOffset() { return -new Date().getTimezoneOffset() / 60; }
  function tzLabel() {
    var t = tzOffset(), sign = t < 0 ? "-" : "+", v = Math.abs(t);
    var h = Math.floor(v), m = Math.round((v - h) * 60);
    return "UTC" + sign + h + (m ? ":" + ("0" + m).slice(-2) : "");
  }
  function hhmm(h) {
    if (h == null || isNaN(h)) return "—";
    var m = Math.round(h * 60) % 1440;
    if (m < 0) m += 1440;
    return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2);
  }

  /* ---------- 日出日落（NOAA 简化算法，纯本地推算，无网络依赖） ----------
     输入本机日期 + 经纬度，输出本机时间制下的小数小时。
     极昼 / 极夜时返回 null，由调用方回退到钟点模式。
     参考：NOAA Solar Calculator 的 Sunrise/Sunset Algorithm。 */
  function sunTimes(date, lat, lon) {
    var rad = Math.PI / 180, deg = 180 / Math.PI;
    var startOfYear = Date.UTC(date.getFullYear(), 0, 0);
    var today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    var doy = Math.floor((today - startOfYear) / 86400000);
    var zenith = 90.833 * rad;          /* 含大气折射与日面半径的官方日出日落天顶角 */
    var tz = tzOffset();

    function calc(isRise) {
      var lngHour = lon / 15;
      var t = doy + (((isRise ? 6 : 18) - lngHour) / 24);
      var M = (0.9856 * t) - 3.289;                                    /* 平近点角 */
      var L = M + (1.916 * Math.sin(M * rad)) + (0.02 * Math.sin(2 * M * rad)) + 282.634;
      L = ((L % 360) + 360) % 360;                                     /* 真黄经 */
      var RA = Math.atan(0.91764 * Math.tan(L * rad)) * deg;           /* 赤经 */
      RA = ((RA % 360) + 360) % 360;
      RA = RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90);
      RA = RA / 15;
      var sinDec = 0.39782 * Math.sin(L * rad);
      var cosDec = Math.cos(Math.asin(sinDec));
      var cosH = (Math.cos(zenith) - (sinDec * Math.sin(lat * rad))) / (cosDec * Math.cos(lat * rad));
      if (cosH > 1 || cosH < -1) return null;                          /* 极夜 / 极昼 */
      var H = (isRise ? 360 - Math.acos(cosH) * deg : Math.acos(cosH) * deg) / 15;
      var T = H + RA - (0.06571 * t) - 6.622;
      var UT = ((T - lngHour) % 24 + 24) % 24;                         /* 世界时 */
      return ((UT + tz) % 24 + 24) % 24;                               /* 换算为本机时间 */
    }

    return { rise: calc(true), set: calc(false) };
  }

  /* 该设置下今日的日出日落；sun 模式才计算 */
  function sunToday(s) {
    if (s.schedMode !== "sun") return null;
    return sunTimes(new Date(), s.lat, s.lon);
  }

  /* 白天的起止小时：钟点模式取用户设定，日出日落模式取今日日照区间 */
  function dayWindow(s) {
    if (s.schedMode === "sun") {
      var st = sunToday(s);
      if (st && st.rise != null && st.set != null) return { a: st.rise, b: st.set, sun: true };
      /* 极昼极夜：无日出日落可言，回退钟点 */
      return { a: s.dayAt, b: s.nightAt, sun: false };
    }
    return { a: s.dayAt, b: s.nightAt, sun: false };
  }

  /* 当前是否处于白天；区间允许跨零点 */
  function isDay(s) {
    var w = dayWindow(s), h = nowHours();
    return w.a <= w.b ? (h >= w.a && h < w.b) : (h >= w.a || h < w.b);
  }

  /* 当前生效的是白天槽还是夜间槽；手动模式返回 null */
  function activeSlot(s) {
    if (s.themeMode === "system") return mq && mq.matches ? "night" : "day";
    if (s.themeMode === "schedule") return isDay(s) ? "day" : "night";
    return null;
  }

  function resolve(s) {
    var slot = activeSlot(s);
    if (slot === "night") return s.nightTheme;
    if (slot === "day") return s.dayTheme;
    return s.theme;
  }

  /* ---------- 夜间护眼（v13） ----------
     三层退化：环境光感应（AmbientLightSensor，最贴实际）→ 按本机昼夜时段 → 手动常开/关闭。
     传感器只在 Chromium 且获授权时可用，失败一律静默退到「按时间」，不弹窗打扰阅读。
     滤镜本身是叠在画面上的一张覆盖层（见 styles.css .night-veil），
     与主题 token 正交 —— 换主题、切昼夜都不会把它冲掉。 */
  /* ---------- 夜间护眼 ----------
     v2.1：移除 AmbientLightSensor 环境光检测 —— Web 支持率极低
     （Android Chrome 需实验开关、iOS Safari 与桌面均不支持），实测不可用。
     夜间判定回归普通口径：手动常开/常关 + 按本机昼夜时段（日出日落或钟点）。
     滤镜是叠在画面上的一张覆盖层（见 styles.css .night-veil），
     与主题 token 正交 —— 换主题、切昼夜都不会把它冲掉。 */
  function nightActive(s) {
    if (s.night === "on") return true;
    if (s.night === "off") return false;
    /* auto：按本机昼夜时段判定 */
    return !isDay(s);
  }

  /* 暖度 → 暖色 multiply 层的不透明度：0–100 映射到 0–0.5，50 是「看得出但不糊」的中点 */
  function warmAlpha(w) { return Math.max(0, Math.min(100, Number(w) || 0)) / 200; }
  /* 压暗 → 纯黑层的不透明度：0–100 映射到 0–0.5 */
  function dimAlpha(d) { return Math.max(0, Math.min(100, Number(d) || 0)) / 200; }

  function paintNight(s) {
    var el = document.documentElement, st = el.style;
    st.setProperty("--night-tint", "rgb(255 162 74 / " + warmAlpha(s.nightWarm).toFixed(3) + ")");
    st.setProperty("--night-dim-a", dimAlpha(s.nightDim).toFixed(3));
    el.dataset.night = nightActive(s) ? "on" : "off";
  }

  /* 覆盖层挂在 body 上，越晚注入越安全（各页 DOM 结构不一，故只依赖 body 存在） */
  function mountNightVeil() {
    if (!document.body || document.querySelector(".night-veil")) return;
    var v = document.createElement("div");
    v.className = "night-veil";
    v.setAttribute("aria-hidden", "true");
    document.body.appendChild(v);
  }

  /* 面板里的一句实话：现在生不生效、依据是什么 */
  function nightHintHTML(s) {
    if (s.night === "off") {
      return "关闭时不叠加滤镜；只想要暗底，选「夜」组主题即可。";
    }
    var on = nightActive(s);
    var how = s.night === "auto"
      ? "按本机昼夜时段自动判定（与主题定时共用同一套日出日落 / 钟点）"
      : "手动常开";
    return (on ? "<b>已生效</b>" : "未触发") + " · " + how +
      "。滤镜只叠在纸面，与主题色独立。";
  }

  /* ---------- WCAG 计算（自建主题的可读性闸门靠它把关） ---------- */
  function ratio(a, b) {
    var la = relLum(toRGB(a)), lb = relLum(toRGB(b));
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  function mixHex(a, b, t) {
    var A = toRGB(a), B = toRGB(b), out = [];
    for (var i = 0; i < 3; i++) {
      var v = Math.round(A[i] * (1 - t) + B[i] * t);
      out.push(("0" + Math.max(0, Math.min(255, v)).toString(16)).slice(-2));
    }
    return "#" + out.join("");
  }
  /* 把前景色朝远离底色的方向推，直到对比度达标 —— 自建主题不跌破可读线 */
  function readable(fg, bg, target) {
    target = target || 4.5;
    var toward = relLum(toRGB(bg)) < 0.5 ? "#ffffff" : "#000000";
    var out = fg;
    for (var i = 0; i < 24 && ratio(out, bg) < target; i++) out = mixHex(out, toward, 0.09);
    return out;
  }
  /* 实底上的字色：纸色与墨色里选对比更高的那个，再确保 ≥4.5:1 */
  function onAccent(accent, paper, ink) {
    var base = ratio(paper, accent) >= ratio(ink, accent) ? paper : ink;
    return readable(base, accent, 4.5);
  }
  /* 自建主题 → 一段 CSS：只写 L1 四原色，L2 派生（color-mix）自动跟上。
     sel 可换成任意选择器，供商城预览卡/编辑器样张做「局部套色」。 */
  function l1Vars(t) {
    var l1 = t.l1 || {};
    var paper = l1.paper || "#f2eee2", ink = l1.ink || "#2a2722";
    var accent = l1.accent || "#9e3b2b", accent2 = l1.accent2 || accent;
    var tone = t.tone || (relLum(toRGB(paper)) < 0.35 ? "dark" : "light");
    var lift = tone === "dark" ? "#fff" : ink;
    return "--paper:" + paper + ";--ink:" + ink +
      ";--accent:" + accent + ";--accent-2:" + accent2 +
      ";--accent-ink:" + readable(accent, paper, 4.5) +
      ";--on-accent:" + onAccent(accent, paper, ink) +
      ";--on-accent-2:" + onAccent(accent2, paper, ink) +
      ";--lift:" + lift;
  }
  function l1CSS(sel, t) { return sel + "{" + l1Vars(t) + "}"; }
  function customCSS(t) { return l1CSS('[data-theme="custom"]', t); }
  /* 自建主题保存前的闸门：正文 ink/paper ≥7:1、实底 on-accent/accent ≥4.5:1 */
  function auditTheme(t) {
    var l1 = t.l1 || {};
    var paper = l1.paper, ink = l1.ink, accent = l1.accent || ink;
    var body = ratio(ink, paper);
    var on = ratio(onAccent(accent, paper, ink), accent);
    return {
      body: body, on: on,
      bodyOK: body >= 7, onOK: on >= 4.5,
      ok: body >= 7 && on >= 4.5
    };
  }

  function apply(key) {
    var t = metaOf(key) || THEME_MAP.paper;
    var el = document.documentElement;
    if (t.custom) {
      var st = document.getElementById("inkCustom");
      if (!st) { st = document.createElement("style"); st.id = "inkCustom"; document.head.appendChild(st); }
      st.textContent = customCSS(t);
      el.dataset.theme = "custom";
    } else {
      el.dataset.theme = t.k;
    }
    /* 真实主题键（custom 时仍是 custom），供字体配对取用 */
    el.dataset.themeKey = t.k;
    el.dataset.tone = t.tone;
    /* 场景母题：主题自带，交给 scene.js 绘制；自定义主题不带场景 */
    el.dataset.scene = t.scene || "";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = getComputedStyle(el).getPropertyValue("--paper").trim() || "#f2eee2";
    /* 桌面壳层跟着主题走：窗口底色（原生 resize 抖动时露出的就是它）与
       nativeTheme.themeSource（原生右键菜单 / OS 通道控件）。网页侧的 color-scheme
       由 styles.css 的 html[data-tone] 负责，这里只管壳层。 */
    if (window.inkread && inkread.win && inkread.win.setTheme) inkread.win.setTheme(el.dataset.tone, meta.content);
  }

  /* 编辑器里的「边调边看」：把草稿主题临时套到全站，取消时还原已保存主题。
     不写库、不派发 ink:read —— 只有落库（commit）才成为正式状态。 */
  function previewCustom(t) {
    var st = document.getElementById("inkCustom");
    if (!st) { st = document.createElement("style"); st.id = "inkCustom"; document.head.appendChild(st); }
    st.textContent = customCSS(t);
    var el = document.documentElement;
    el.dataset.theme = "custom";
    el.dataset.tone = t.tone || (relLum(toRGB((t.l1 || {}).paper || "#f2eee2")) < 0.35 ? "dark" : "light");
  }
  function endPreview() { apply(resolve(read())); }

  /* 主题 × 字体：每套主题配一对（中文正文 + 拉丁展示）；用户可在 Aa 面板覆盖。
     latinBody（可选，v12）：拉丁正文面 —— 品牌族要求「标题 Poppins、正文 Lora」，
     故把它插在中文正文面之前，拉丁字形走 Lora、中日韩字形回落到中文面。
     只在此处解析并懒加载，CSS 端只认 --doc-font / --display-font 两个 token。 */
  function paintFonts(s) {
    var r = document.documentElement.style;
    var themeK = document.documentElement.dataset.themeKey || s.theme || "paper";
    var pair = (window.InkFonts && InkFonts.pairFor(themeK)) || { zh: "song", latin: "cormorant" };
    var docK = s.font === "auto" ? pair.zh : s.font;
    var dispK = s.display === "auto" ? pair.latin : s.display;
    var docStack = "var(--font-" + docK + ")";
    if (pair.latinBody && s.font === "auto") docStack = "var(--font-" + pair.latinBody + "), " + docStack;
    r.setProperty("--doc-font", docStack);
    /* 展示字体：拉丁领衔 + 主题中文标题面兜底，中西混排不塌 */
    r.setProperty("--display-font", "var(--font-" + dispK + "), var(--font-" + pair.zh + "), var(--font-song)");
    if (window.InkFonts) { InkFonts.ensure(docK); InkFonts.ensure(dispK); InkFonts.ensure(pair.zh); if (pair.latinBody) InkFonts.ensure(pair.latinBody); }
    return { doc: docK, display: dispK, pair: pair };
  }

  /* 主题、动效、纸纹、排版变量统一落到 <html>，页面无需各自实现 */
  function paint(s) {
    var r = document.documentElement.style;
    r.setProperty("--doc-fs", s.fs + "px");
    r.setProperty("--doc-lh", s.lh);
    r.setProperty("--doc-measure", s.fw + "em");
    r.setProperty("--doc-wt", s.wt);
    r.setProperty("--doc-ls", s.ls + "em");
    r.setProperty("--doc-para", s.para + "em");
    r.setProperty("--doc-indent", s.indent + "em");
    r.setProperty("--doc-align", s.align);
    paintFonts(s);
    var de = document.documentElement.dataset;
    de.reduce = s.reduce ? "on" : "off";
    de.grain = s.grain ? "on" : "off";
    de.prog = s.prog;
    de.cols = s.twoCol ? "two" : "one";
    de.auto = s.auto ? "on" : "off";
    de.int = s.intensity;
    de.mode = s.mode;
    de.sceneOn = s.scene ? "on" : "off";
    de.sceneArt = s.sceneArt;
    /* 夜间护眼：只写 --night-* 与 data-night，正文纸页与主题 token 不动 */
    paintNight(s);
    /* 场景由 scene.js 绘制（本文件在 head 中先于它执行，故需判空） */
    if (window.InkScene && InkScene.sync) InkScene.sync();
  }

  /* 统一写入出口：写库 → 解析主题 → 落地变量 → 通知各页 */
  function commit(patch, silent) {
    /* 疏密档位是「一组三个字段」的快捷键：落库前展开成实际排版字段。
       显式选档即代表读者要自己掌控版面，连带关闭文体自适应（同 AUTO_OFF_KEYS 的原则），
       否则 data-auto=on 时 .doc[data-doc-theme] 会在元素上重写 --doc-lh，把用户选的档高压掉。 */
    if (patch && patch.den && DEN[patch.den]) {
      var d = DEN[patch.den];
      patch = Object.assign({}, patch, { fs: d.fs, lh: d.lh, para: d.para, auto: false });
      delete patch.den;
    } else if (patch && Object.keys(patch).some(function (k) { return DEN_TOUCH[k]; })) {
      denReport = "";   /* 手动改过排版字段，上一次实测报告即作废 */
    }
    var s = write(patch);
    apply(resolve(s));
    paint(s);
    document.dispatchEvent(new CustomEvent("ink:read", { detail: s }));
    if (!silent) syncDrawer();
    return s;
  }

  /* 跟随系统 / 按时间：只在对应模式下生效 */
  function watch() {
    if (mq) {
      var onSys = function () { if (read().themeMode === "system") commit({}, true); };
      if (mq.addEventListener) mq.addEventListener("change", onSys); else mq.addListener(onSys);
    }

    /* 按本机时钟推进：跨过日出/日落（或钟点）即切换。
       30s 轮询足以让跳转落在分钟级；睡眠唤醒后由 visibilitychange 立即补算。 */
    function tick() {
      var s = read();
      if (s.themeMode === "schedule" && document.documentElement.dataset.theme !== resolve(s)) commit({}, true);
      /* 夜间护眼按昼夜时段判定时，也要随本机时钟推进；只改属性，不写库 */
      if (s.night === "auto") paintNight(s);
      refreshClock();
    }
    setInterval(tick, 30000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
  }

  /* 面板打开时，同步「本机时间 / 当前时段 / 今日日出日落」这类随时间漂移的信息 */
  function refreshClock() {
    if (!drawer || mask.hidden) return;
    var s = read();
    var now = drawer.querySelector("#apNow");
    if (now) now.textContent = hhmm(nowHours());
    var slot = drawer.querySelector("#apSlot");
    if (slot) {
      var w = dayWindow(s), d = isDay(s);
      slot.innerHTML = '当前处于「<b>' + (d ? "白天" : "夜间") + "</b>」· 白天 " +
        hhmm(w.a) + " – " + hhmm(w.b) + (w.sun ? "" : "（钟点）");
    }
    var si = drawer.querySelector("#apSun");
    if (si) si.innerHTML = sunInfoHTML(s);
    /* 跨过日出/日落后生效主题会变，主题卡高亮与色值读数需跟着走 */
    var cur = resolve(s);
    drawer.querySelectorAll("[data-pick]").forEach(function (c) {
      c.classList.toggle("on", cur === c.dataset.pick);
    });
    var ro = drawer.querySelector("#apReadout");
    if (ro) ro.innerHTML = readoutHTML();
  }

  /* ============================================================
     4. 控件构造
     ============================================================ */
  var SEGS = {
    themeMode: [["manual", "手动"], ["system", "跟随系统"], ["schedule", "按时间"]],
    intensity: [["quiet", "静谧"], ["standard", "标准"], ["bold", "张扬"]],
    /* 兜底表：正常情况下 seg() 会从 scene.js 的 GALLERY 现取（见下）；
       只有 InkScene 没加载成功时才用这一份。 */
    sceneArt: [["auto", "每次随机"], ["fuchun", "富春山居图"], ["qingming", "清明上河图"], ["shuangsong", "双松平远图"], ["qiuse", "溪山秋色图"], ["sihuayu", "四花雨禅图"], ["andes", "安第斯山之心"], ["estaque", "从拉德斯托卡眺望马赛湾"], ["cedars", "达里恩的雪松暮色"]],
    schedMode: [["sun", "日出日落"], ["fixed", "按钟点"]],
    align: [["left", "左对齐"], ["justify", "两端对齐"]],
    den: [["loose2", "极疏"], ["loose1", "稍疏"], ["mid", "适中"], ["dense1", "稍密"], ["dense2", "极密"]],
    indent: [[0, "顶格"], [2, "缩进 2 字"]],
    fw: [[28, "窄"], [32, "中"], [36, "宽"], [42, "极宽"]],
    prog: [["page", "页码"], ["percent", "百分比"], ["remain", "剩余时间"]],
    mode: [["paged", "横向翻页"], ["scroll", "竖向浏览"]],
    flip: [["curl", "卷页"], ["slide", "平移"], ["fade", "淡入"], ["cover", "覆盖"], ["none", "直切"]],
    night: [["off", "关闭"], ["auto", "按时段"], ["on", "常开"]]
  };

  /* 阅读方式说明：切换时阅读位置按字符偏移锚定，不会回到章首 */
  var MODE_NOTE = {
    paged: "逐页翻阅：← → 翻页、五种动效、按页定位；最接近纸质书",
    scroll: "连续滚动：上下通读；长文与摘录更顺手"
  };

  /* 翻页动效说明：让读者在选之前就知道手感与代价 */
  var FLIP_NOTE = {
    curl: "旧页绕书脊外旋收窄、新页自对侧落纸；最像纸书（约 0.74s）",
    slide: "整页平移，方向感最明确，不做 3D 旋转（约 0.74s）",
    fade: "淡出淡入，最安静，墨水屏残影最少（约 0.68s）",
    cover: "旧页作底衬不动，新页自边缘盖上去，压边带一道随行投影（0.5s）",
    none: "不做过渡，只留一次极轻的墨屏反显；最快也最省电"
  };

  /* 场景说明：静态绘制，只有交互那一刻动一次；当前主题没有场景时明说 */
  function sceneHint() {
    var k = document.documentElement.dataset.scene || "";
    var m = SCENE_META[k];
    return m ? "「" + m.name + "」· " + m.d : "当前主题未配场景；主题商城里带「场景」徽标的主题可见";
  }

  /* 视觉强度说明：三档只改界面外壳，正文纸页与字形始终不动 */
  var INT_NOTE = {
    quiet: "只留线与字，去掉投影与撞色，最接近纸面印刷",
    standard: "墨读默认：细线、轻影、克制圆角，装饰不抢正文",
    bold: "硬描边、零位移硬投影、双色撞色块与几何母题；正文对比度不变"
  };

  function seg(key, cur) {
    /* 天幕画卷的清单事实源在 scene.js 的 GALLERY（本文件先于它加载，故 SEGS 里那份只是兜底）：
       渲染时 InkScene 已就位，按它现取，新增一幅画不必再来改这里。 */
    var opts = SEGS[key];
    if (key === "sceneArt" && window.InkScene && window.InkScene.gallery && window.InkScene.gallery.length) {
      opts = [["auto", "每次随机"]].concat(window.InkScene.gallery.map(function (g) { return [g.k, g.name]; }));
    }
    return '<span class="ap-seg" data-seg="' + key + '">' +
      opts.map(function (o) {
        return '<button class="ap-seg-b' + (String(cur) === String(o[0]) ? " on" : "") +
          '" data-val="' + o[0] + '">' + o[1] + "</button>";
      }).join("") + "</span>";
  }

  /* 定时切换的日/夜主题下拉：只列可用主题（已安装 + 自建），避免选到没下载的 */
  function themeSelect(key, cur) {
    var list = available();
    var has = list.filter(function (t) { return t.k === cur; })[0];
    if (!has && metaOf(cur)) list = list.concat([metaOf(cur)]);
    /* v2.23 §W3 第七步：外面套一层 .ap-sel-w —— 箭头从 data-URI 里的死色
       （%238b8577，换主题不变色）改成遮罩 + currentColor，跟着主题走。
       select 自身不能挂伪元素，形状只能落在宿主上；事件一律 closest，不受这层影响。 */
    return '<span class="ap-sel-w"><select class="ap-sel" data-sel="' + key + '">' + list.map(function (t) {
      return '<option value="' + t.k + '"' + (t.k === cur ? " selected" : "") + ">" + esc(t.name) + "</option>";
    }).join("") + "</select></span>";
  }

  /* 字体样张行：每个 chip 用自身字面渲染，等于就地看样。
     只列「已安装」的字体，避免选到没下载的面；「跟随主题」永远排第一。 */
  function fontRow(setKey, cur) {
    var kind = setKey === "display" ? "latin" : "zh";
    var all = (window.InkFonts ? InkFonts.FONTS : []).filter(function (f) { return f.kind === kind; });
    var on = window.InkFonts ? all.filter(function (f) { return InkFonts.isEnabled(f.k); }) : all;
    var themeK = document.documentElement.dataset.themeKey || "paper";
    var pn = window.InkFonts ? InkFonts.pairNames(themeK) : { zh: "思源宋体", latin: "Cormorant Garamond" };
    var autoName = kind === "latin" ? pn.latin : pn.zh;
    var html = '<button class="ap-seg-b' + (cur === "auto" ? " on" : "") + '" data-val="auto" ' +
      'title="跟随主题配对：' + esc(autoName) + '">跟随主题 · ' + esc(autoName) + "</button>";
    on.forEach(function (f) {
      html += '<button class="ap-seg-b' + (cur === f.k ? " on" : "") + '" data-val="' + f.k + '" ' +
        'style="font-family:var(--font-' + f.k + ')" title="' + esc(f.en + " · " + f.mood) + '">' + esc(f.name) + "</button>";
    });
    return '<span class="ap-seg ap-seg-scroll" data-seg="' + setKey + '" role="radiogroup" ' +
      'aria-label="' + (kind === "latin" ? "标题展示字体" : "正文字体") + '">' + html + "</span>";
  }

  function row(label, ctl, hint) {
    return '<div class="ap-row"><span class="ap-k">' + label + "</span>" +
      '<span class="ap-c">' + ctl + "</span></div>" +
      (hint ? '<div class="ap-hint">' + hint + "</div>" : "");
  }

  function sw(key, cur) {
    return '<button class="switch' + (cur ? " on" : "") + '" data-sw="' + key +
      '" aria-pressed="' + !!cur + '"></button>';
  }

  function range(key, cur) {
    var step = key === "ls" ? "0.002" : key === "lh" ? "0.05" : key === "para" ? "0.05" : "1";
    return '<span class="ap-range"><input type="range" data-range="' + key + '" min="' + RANGE[key][0] +
      '" max="' + RANGE[key][1] + '" step="' + step + '" value="' + cur +
      '" aria-label="' + key + '"><b data-val-for="' + key + '">' + fmt(key, cur) + "</b></span>";
  }

  /* 行长：CJK 每行字数。栏宽按字数计（em 随字号缩放），故此处即用户所设值 */
  function cpl(s) { return Math.round(s.fw); }

  /* 版心舒适区：中文长文 30–40 字（clreq / 网页排版共识），拉丁按 0.5 字宽折半 ≈ 60–80 CPL */
  function widthHintHTML(s) {
    var n = cpl(s), ok = n >= 28 && n <= 40;
    return '每行约 <b class="' + (ok ? "ok" : "warn") + '">' + n + "</b> 字（≈ " + (n * 2) + " 拉丁字符）" +
      (ok ? " · 落在中文 30–40 字的舒适区内" : n > 40 ? " · 已超出中文 40 字上限，请收窄栏宽" : " · 偏窄，长文易频繁换行");
  }

  /* WCAG 2.2 相对亮度与对比度：面板内实时核验正文可读性 */
  function toRGB(v) {
    v = String(v).trim();
    if (v.charAt(0) === "#") {
      if (v.length === 4) v = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      return [parseInt(v.substr(1, 2), 16), parseInt(v.substr(3, 2), 16), parseInt(v.substr(5, 2), 16)];
    }
    var m = v.match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
  }
  function relLum(rgb) {
    var a = rgb.map(function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrastHTML() {
    var cs = getComputedStyle(document.documentElement);
    var a = relLum(toRGB(cs.getPropertyValue("--ink")));
    var b = relLum(toRGB(cs.getPropertyValue("--paper")));
    var hi = Math.max(a, b), lo = Math.min(a, b);
    var r = (hi + 0.05) / (lo + 0.05);
    var ok = r >= 4.5;
    return "正文对比度 <b style='color:" + (ok ? "var(--ink)" : "var(--accent)") + "'>" +
      r.toFixed(1) + ":1</b> · " + (ok ? (r >= 7 ? "AAA" : "AA") : "低于 AA 4.5:1");
  }

  /* 当前经纬度命中的预设城市；不在表内即「自定义」 */
  function cityOf(s) {
    var hit = matchCity(s);
    return hit ? hit.n : "自定义";
  }

  /* 今日日出日落读数 + 本机时区；极昼极夜给出明确回退说明 */
  function sunInfoHTML(s) {
    var st = sunTimes(new Date(), s.lat, s.lon);
    if (!st.rise || !st.set) {
      return '<span class="ap-warn">该纬度今日为极昼或极夜，无日出日落，已回退为钟点切换</span>';
    }
    var mins = Math.round((st.set - st.rise + 24) % 24 * 60);
    return "今日日出 <b>" + hhmm(st.rise) + "</b> · 日落 <b>" + hhmm(st.set) +
      "</b> · 日照 <b>" + Math.floor(mins / 60) + " 时 " + (mins % 60) + " 分</b>" +
      '<br>按本机时区 ' + tzLabel() + " 推算 · 位置「" + cityOf(s) + "」";
  }

  /* 经纬度命中预设城市则选中该城市，否则停在「自定义」 */
  function matchCity(s) {
    return CITIES.filter(function (c) {
      return Math.abs(c.lat - s.lat) < 0.01 && Math.abs(c.lon - s.lon) < 0.01;
    })[0] || null;
  }

  function citySelect(s) {
    var hit = matchCity(s);
    return '<span class="ap-sel-w"><select class="ap-sel" data-city>' +
      '<option value=""' + (hit ? "" : " selected") + ">自定义</option>" +
      CITIES.map(function (c) {
        return '<option value="' + c.lat + "," + c.lon + '"' +
          (hit && hit.n === c.n ? " selected" : "") + ">" + c.n + "</option>";
      }).join("") + "</select></span>";
  }

  /* ============================================================
     5. 共享外观面板
     ============================================================ */
  var drawer = null, mask = null;

  /* 当前外观摘要：主题名 + 四色读数 + 商城入口。
     26 张主题卡不再铺在面板里 —— 面板只回答「我现在是什么样」，挑选交给商城。 */
  function summaryHTML(s) {
    var cur = resolve(s), t = metaOf(cur) || THEME_MAP.paper;
    var sub = t.custom ? "我的创作" : (GROUP_NAME[t.g] || "主题");
    return '<div class="ap-sum">' +
        '<i class="ap-sum-sw" data-theme="' + (t.custom ? "custom" : t.k) + '"><b></b></i>' +
        '<div class="ap-sum-tx"><b>' + esc(t.name) + "</b><span>" + sub + " · " +
          (t.tone === "dark" ? "暗底" : "浅底") + "</span></div>" +
        '<a class="btn btn-ghost btn-sm" href="themes.html">' + icon("grid-2x2", 14) + "主题商城</a>" +
      "</div>" +
      '<div id="apReadout">' + readoutHTML() + "</div>";
  }

  function scheduleBlock(s) {
    var isSun = s.schedMode === "sun";
    return '<div class="ap-sched"' + (s.themeMode === "schedule" ? "" : " hidden") + ">" +
      row("切换依据", seg("schedMode", s.schedMode)) +
      '<div class="ap-sun"' + (isSun ? "" : " hidden") + ">" +
        row("所在城市", citySelect(s)) +
        row("本机定位", '<button class="btn btn-ghost btn-sm" data-act="geo">' +
          icon("target", 14) + "使用当前位置</button>") +
        row("纬度", '<input class="ap-num ap-num-wide" type="number" step="0.0001" min="-90" max="90" data-num="lat" value="' + s.lat + '">') +
        row("经度", '<input class="ap-num ap-num-wide" type="number" step="0.0001" min="-180" max="180" data-num="lon" value="' + s.lon + '">') +
        '<div class="ap-hint" id="apSun">' + sunInfoHTML(s) + "</div>" +
      "</div>" +
      '<div class="ap-fix"' + (isSun ? " hidden" : "") + ">" +
        row("白天从", '<input class="ap-num" type="number" min="0" max="23" data-num="dayAt" value="' + s.dayAt + '"> 时') +
        row("夜间从", '<input class="ap-num" type="number" min="0" max="23" data-num="nightAt" value="' + s.nightAt + '"> 时') +
      "</div>" +
      row("白天主题", themeSelect("dayTheme", s.dayTheme)) +
      row("夜间主题", themeSelect("nightTheme", s.nightTheme)) +
      '<div class="ap-hint" id="apSlot"></div>' +
      '<div class="ap-hint">切换随本机时钟推进：本机时间 <b id="apNow">' + hhmm(nowHours()) + "</b>，" +
        (isSun ? "跨过日出/日落即自动换主题" : "跨过所设钟点即自动换主题") + "</div>" +
      "</div>";
  }

  /* 翻页动效：分段选择 + 一台两页的小样机，选中即试翻一次。
     aria-hidden 只罩在装饰性的小样机上 —— 罩住整个 .flip-pv 会把「试翻一页」按钮
     一并从无障碍树里摘掉，读屏用户就够不着了。
     样机里画「缩微正文」（标题条 + 文本行），而不是「一 / 二」两枚大字：
     缩小到 116×78 后，只有缩微正文才看得出哪一页在动、朝哪边动。 */
  function fpLines(n, short) {
    var out = '<i class="fp-t"></i>';
    for (var i = 0; i < n; i++) out += '<i class="fp-l' + (short.indexOf(i) >= 0 ? " s" : "") + '"></i>';
    return out;
  }
  function flipBlock(s) {
    return '<div class="flip-pv" id="apFlipPv" data-flip="' + s.flip + '">' +
        '<div class="fp-stage" aria-hidden="true">' +
          '<span class="fp-page fp-a">' + fpLines(6, [2, 4]) + "</span>" +
          '<span class="fp-page fp-b">' + fpLines(6, [1, 5]) + "</span>" +
        "</div>" +
        '<button class="btn btn-ghost btn-sm" data-act="flipDemo">' + icon("refresh-cw", 14) + "试翻一页</button>" +
      "</div>" +
      row("翻页动效", seg("flip", s.flip)) +
      '<div class="ap-hint" id="apFlipNote">' + (FLIP_NOTE[s.flip] || "") + "</div>";
  }

  /* 计算后的颜色统一成 #rrggbb，便于在面板里给出可核对的读数 */
  function toHex(v) {
    v = String(v).trim();
    if (v.charAt(0) === "#") {
      if (v.length === 4) v = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      return v.toLowerCase();
    }
    var m = v.match(/[\d.]+/g);
    if (!m || m.length < 3) return v;
    return "#" + [0, 1, 2].map(function (i) {
      var h = Math.round(+m[i]).toString(16);
      return h.length < 2 ? "0" + h : h;
    }).join("");
  }

  /* 当前主题色值读数：把「看着像」变成「量得出」，四色对应主题卡的四象限样张 */
  function readoutHTML() {
    var cs = getComputedStyle(document.documentElement);
    var items = [["纸", "--paper"], ["墨", "--ink"], ["主强调", "--accent"], ["副强调", "--accent-2"]];
    return '<div class="ap-readout">' + items.map(function (it) {
      return '<div class="ap-rd"><i style="--c:var(' + it[1] + ')"></i><span>' + it[0] + " " +
        toHex(cs.getPropertyValue(it[1])) + "</span></div>";
    }).join("") + "</div>";
  }

  function build(s) {
    return "" +
    '<header class="ap-head"><b>外观与阅读设置</b>' +
      '<button class="ap-x" data-act="close" aria-label="关闭">' + icon("x", 17) + "</button></header>" +
    '<div class="ap-body">' +
      '<section class="ap-sec"><h4>当前外观<span class="ap-sec-note" id="apContrast"></span></h4>' +
        summaryHTML(s) +
        row("切换方式", seg("themeMode", s.themeMode)) +
        scheduleBlock(s) +
        '<div class="ap-hint">字体、字号与版式在阅读页的 <b>Aa</b> 面板，可边读边调，即时生效。</div>' +
      "</section>" +
      '<section class="ap-sec"><h4>视觉强度<span class="ap-sec-note">只作用于界面外壳</span></h4>' +
        row("强度", seg("intensity", s.intensity)) +
        '<div class="ap-hint" id="apIntNote">' + (INT_NOTE[s.intensity] || "") + "</div>" +
      "</section>" +
      '<section class="ap-sec"><h4>翻页<span class="ap-sec-note">作用于阅读页</span></h4>' +
        flipBlock(s) +
        '<div class="ap-hint">翻页动效仅用于「横向翻页」；「竖向浏览」为连续滚动，无翻页过渡。阅读方式在阅读页 <b>Aa</b> 面板切换。</div>' +
      "</section>" +
      '<section class="ap-sec"><h4>夜间护眼<span class="ap-sec-note">降蓝光 · 压亮度</span></h4>' +
        row("夜间模式", seg("night", s.night)) +
        '<div id="apNightExtra"' + (s.night === "off" ? " hidden" : "") + ">" +
          row("暖度", range("nightWarm", s.nightWarm)) +
          row("压暗", range("nightDim", s.nightDim)) +
        "</div>" +
        '<div class="ap-hint" id="apNight">' + nightHintHTML(s) + "</div>" +
      "</section>" +
      '<section class="ap-sec"><h4>显示</h4>' +
        row("批注标记", sw("marks", s.marks)) +
        row("学习模式 · 任务出处", sw("learn", s.learn)) +
        row("墨屏刷新动效", sw("fx", s.fx)) +
        row("减少动效", sw("reduce", s.reduce), "同时遵循系统的「减弱动态效果」") +
        row("纸张纹理", sw("grain", s.grain), "细颗粒噪点；想要最干净的字形可关闭") +
        row("进度显示", seg("prog", s.prog)) +
      "</section>" +
    "</div>" +
    '<footer class="ap-foot">' +
      '<button class="btn btn-ghost btn-sm" data-act="reset">' + icon("rotate-ccw", 14) + "恢复默认" + "</button>" +
      '<span class="spacer"></span>' +
      '<button class="btn btn-ghost btn-sm" data-act="export">' + icon("clipboard-check", 14) + "导出设置" + "</button>" +
    "</footer>";
  }

  function mount() {
    if (drawer) return drawer;
    mask = document.createElement("div");
    mask.className = "ap-mask";
    mask.id = "apMask";
    mask.hidden = true;
    mask.innerHTML = '<div class="ap" id="apPanel" role="dialog" aria-modal="true" aria-label="外观与阅读设置"></div>';
    document.body.appendChild(mask);
    drawer = mask.querySelector("#apPanel");

    mask.addEventListener("click", function (e) {
      if (e.target === mask || e.target.closest('[data-act="close"]')) close();
    });

    drawer.addEventListener("click", function (e) {
      var segB = e.target.closest(".ap-seg-b");
      if (segB) {
        var key = segB.closest(".ap-seg").dataset.seg;
        commit(patch(key, segB.dataset.val));
        if (key === "flip") syncFlipPv(true);
        return;
      }

      var swB = e.target.closest("[data-sw]");
      if (swB) { commit(patch(swB.dataset.sw, !read()[swB.dataset.sw])); return; }

      var pick = e.target.closest("[data-pick]");
      if (pick) {
        var s = read();
        var slot = activeSlot(s);
        if (!slot) commit({ theme: pick.dataset.pick });
        else { var p = {}; p[slot === "night" ? "nightTheme" : "dayTheme"] = pick.dataset.pick; commit(p); }
        return;
      }

      var act = e.target.closest("[data-act]");
      if (!act) return;
      if (act.dataset.act === "reset") {
        InkStore.setRead(Object.assign({}, DEFAULTS));
        commit({}, false);
        drawer.innerHTML = build(read());
        syncDrawer();
        toast("已恢复默认外观", "rotate-ccw");
      } else if (act.dataset.act === "flipDemo") {
        syncFlipPv(true);
      } else if (act.dataset.act === "geo") {
        /* 定位双链路：浏览器精确定位先试（4s 快败）→ 本地服务 /api/geo IP 城市级兜底。
           桌面端 geolocation 依赖 Google 网络定位（应用不带 Key，electron#1376），
           而 IP 定位对推算日出日落绰绰有余；file:// 无本地服务时维持手填引导。
           进行中反馈由按钮态承担：toast 全程只报一次结果，不弹「正在获取」。 */
        if (act.dataset.geoBusy) return;
        act.dataset.geoBusy = "1";
        var geoOld = act.innerHTML;
        act.innerHTML = icon("loader-circle", 14) + "定位中…";
        var geoTick = function () { delete act.dataset.geoBusy; act.innerHTML = geoOld; };
        var geoOk = function (msg) {
          act.innerHTML = icon("circle-check", 14) + "已定位";
          toast(msg, "target");
          setTimeout(function () { delete act.dataset.geoBusy; act.innerHTML = geoOld; }, 1600);
        };
        var useIp = function () {
          fetch("/api/geo").then(function (r) { return r.json(); }).then(function (j) {
            if (j && j.code === 0 && j.data) {
              commit({ lat: j.data.lat, lon: j.data.lon });
              geoOk(j.data.city ? "定位到 " + j.data.city + "（网络定位·城市级），已推算日出日落" : "已按网络定位推算日出日落");
            } else { geoTick(); toast("网络定位不可用，请选城市或手填经纬度", "target"); }
          }).catch(function () { geoTick(); toast("网络定位不可用，请选城市或手填经纬度", "target"); });
        };
        if (!navigator.geolocation) { useIp(); return; }
        var geoSettled = false;
        navigator.geolocation.getCurrentPosition(function (pos) {
          if (geoSettled) return; geoSettled = true;
          commit({ lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4) });
          geoOk("已按当前位置推算日出日落");
        }, function () {
          if (geoSettled) return; geoSettled = true; useIp();
        }, { timeout: 4000, maximumAge: 600000 });
        /* 个别环境既不回调也不报错：6s 后仍在等就转 IP 兜底 */
        setTimeout(function () { if (!geoSettled) { geoSettled = true; useIp(); } }, 6000);
      } else if (act.dataset.act === "export") {
        var txt = JSON.stringify(read(), null, 2);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(
            function () { toast("设置已复制为 JSON", "clipboard-check"); },
            function () { toast("复制失败，请检查浏览器权限", "clipboard-check"); });
        } else toast("当前环境不支持复制", "clipboard-check");
      }
    });

    drawer.addEventListener("input", function (e) {
      var r = e.target.closest("[data-range]");
      if (r) {
        var k = r.dataset.range, v = parseFloat(r.value);
        var out = drawer.querySelector('[data-val-for="' + k + '"]');
        if (out) out.textContent = fmt(k, v);
        commit(patch(k, v));
        return;
      }
      var n = e.target.closest("[data-num]");
      if (n) {
        var nk = n.dataset.num, nv = parseFloat(n.value);
        if (isNaN(nv)) return;
        var rg = RANGE[nk] || [-Infinity, Infinity];
        commit(patch(nk, Math.min(rg[1], Math.max(rg[0], nv))));
      }
    });

    drawer.addEventListener("change", function (e) {
      var city = e.target.closest("[data-city]");
      if (city) {
        if (!city.value) return;
        var xy = city.value.split(",");
        commit({ lat: parseFloat(xy[0]), lon: parseFloat(xy[1]) });
        return;
      }
      var sel = e.target.closest("[data-sel]");
      if (sel) commit(patch(sel.dataset.sel, sel.value));
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && mask && !mask.hidden) close();
    });
    /* 层栈让路（§W2.4）：这是 aria-modal 的设置抽屉，开着时 Esc 归它，
       不然一次按键连身后停靠的窗一起收掉。mount() 只在首次挂载时跑一次。 */
    if (window.InkWin) InkWin.yieldTo("ap-modal", function () { return !!mask && !mask.hidden; });
    return drawer;
  }

  /* v2.11 B4：这些排版字段一被用户显式改动，就连带关闭「按内容自适应」——
     用户设置必须压过内建/自适应排版（EPUB 3.3 与 KOReader 的同款原则）。
     data-auto=on 时 .doc[data-doc-theme] 会在同元素上重写 --doc-lh 等变量、
     压掉 <html> 上的用户值，所以只有关掉 auto 用户值才真正生效。
     开关在面板里可见翻转，随时可手动重开。 */
  var AUTO_OFF_KEYS = { lh: 1, ls: 1, para: 1, indent: 1, align: 1 };
  function patch(key, val) {
    var p = {};
    p[key] = NUMERIC[key] ? Number(val) : val;
    if (AUTO_OFF_KEYS[key] && read().auto) p.auto = false;
    return p;
  }

  /* 只刷新状态，不重建 DOM，避免滑块在拖动中被重置 */
  function syncDrawer() {
    if (!drawer || mask.hidden) return;
    var s = read(), cur = resolve(s);

    drawer.querySelectorAll("[data-seg]").forEach(function (g) {
      var k = g.dataset.seg;
      g.querySelectorAll(".ap-seg-b").forEach(function (b) {
        b.classList.toggle("on", String(s[k]) === b.dataset.val);
      });
    });
    drawer.querySelectorAll("[data-sw]").forEach(function (b) {
      var on = !!s[b.dataset.sw];
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    });
    drawer.querySelectorAll("[data-range]").forEach(function (r) {
      if (document.activeElement !== r) r.value = s[r.dataset.range];
    });
    drawer.querySelectorAll("[data-val-for]").forEach(function (b) {
      var k = b.dataset.valFor;
      b.textContent = fmt(k, s[k]);
    });
    drawer.querySelectorAll("[data-sel]").forEach(function (sel) {
      sel.value = s[sel.dataset.sel];
    });
    drawer.querySelectorAll("[data-pick]").forEach(function (c) {
      c.classList.toggle("on", cur === c.dataset.pick);
    });
    var sch = drawer.querySelector(".ap-sched");
    if (sch) sch.hidden = s.themeMode !== "schedule";
    var sun = drawer.querySelector(".ap-sun");
    if (sun) sun.hidden = s.schedMode !== "sun";
    var fix = drawer.querySelector(".ap-fix");
    if (fix) fix.hidden = s.schedMode !== "fixed";
    drawer.querySelectorAll("[data-num]").forEach(function (i) {
      if (document.activeElement !== i) i.value = s[i.dataset.num];
    });
    /* 手改经纬度后城市下拉需回落到「自定义」 */
    var citySel = drawer.querySelector("[data-city]");
    if (citySel) {
      var hit = matchCity(s);
      citySel.value = hit ? hit.lat + "," + hit.lon : "";
    }
    var wh = drawer.querySelector("#apWh");
    if (wh) wh.innerHTML = widthHintHTML(s);
    var cc = drawer.querySelector("#apContrast");
    if (cc) cc.innerHTML = contrastHTML();
    var inote = drawer.querySelector("#apIntNote");
    if (inote) inote.textContent = INT_NOTE[s.intensity] || "";
    /* 夜间护眼：模式为「关闭」时收起感应方式与两根滑块，避免无谓的界面噪音 */
    var nEx = drawer.querySelector("#apNightExtra");
    if (nEx) nEx.hidden = s.night === "off";
    var nHint = drawer.querySelector("#apNight");
    if (nHint) nHint.innerHTML = nightHintHTML(s);
    /* 时间相关读数（本机时间 / 当前时段 / 今日日出日落）随时间漂移，统一刷新 */
    refreshClock();
    syncFlipPv(false);
  }

  /* 翻页小样机：切换模式即更新说明并试翻一次，便于对比手感 */
  function syncFlipPv(play) {
    if (!drawer) return;
    var pv = drawer.querySelector("#apFlipPv");
    if (!pv) return;
    var s = read();
    pv.dataset.flip = s.flip;
    var note = drawer.querySelector("#apFlipNote");
    if (note) note.textContent = FLIP_NOTE[s.flip] || "";
    if (!play) return;
    pv.classList.remove("run");
    void pv.offsetWidth;                 /* 强制回流，让同一模式也能重放 */
    pv.classList.add("run");
    clearTimeout(pv._t);
    /* 与最长的一条样机动画（覆盖 0.5s / 卷页 0.48s）对齐，留一点余量再摘 .run */
    pv._t = setTimeout(function () { pv.classList.remove("run"); }, 700);
  }

  function open() {
    var d = mount();
    d.innerHTML = build(read());
    mask.hidden = false;
    syncDrawer();
    requestAnimationFrame(function () { mask.classList.add("on"); });
  }

  function close() {
    if (!mask) return;
    mask.classList.remove("on");
    setTimeout(function () { mask.hidden = true; }, 180);
  }

  /* ============================================================
     5b. 阅读内排版面板（Aa）
     设置出现在使用它的地方：正文就在面板背后，拖动即见变化。
     非模态、无遮罩，可继续阅读与翻页；Esc 或再点 Aa 收起。
     ============================================================ */
  var aaPanel = null;

  /* v2.14：Aa sheet 顶部的快捷主题行 —— 六个常用主题（全部出厂预装），色板写死不做「最近使用」。
     名称与 THEMES 表一致；色值为各主题纸色的代表值（与 styles.css 的 L1 保持同调）。 */
  var QUICK_THEMES = [
    ["white", "素白",   "#FDFCF9"],
    ["sepia", "羊皮纸", "#F3E9D7"],
    ["bean",  "豆沙绿", "#C9E8CC"],
    ["lilac", "葛巾紫", "#E7E7E2"],
    ["night", "夜墨",   "#1E1B16"],
    ["black", "纯黑",   "#0F0E0C"]
  ];

  function aaBuild(s) {
    return "" +
    '<div class="aa-quick" role="group" aria-label="快捷阅读主题">' +
      QUICK_THEMES.map(function (t) {
        return '<button class="aa-tblock" data-theme-pick="' + t[0] + '" title="' + t[1] + '">' +
          '<i style="background:' + t[2] + '"></i><span>' + t[1] + "</span></button>";
      }).join("") +
      '<a class="aa-tall" href="themes.html">全部主题<em aria-hidden="true">→</em></a>' +
    "</div>" +
    '<header class="aa-head"><b>' + icon("type", 15) + "排版</b>" +
      '<button class="aa-x" data-aa="close" aria-label="收起排版面板">' + icon("x", 17) + "</button></header>" +
    '<div class="aa-body">' +
      '<div class="aa-pv"><p>阅读的舒适度取决于版心宽度、行高与字距三者的配合。此段随下方设置即时重排，便于当场判断。</p></div>' +
      '<section class="ap-sec"><h4>页面疏密<span class="ap-sec-note">字号 · 行高 · 段距一组配比</span></h4>' +
        '<div class="aa-den-row">' + seg("den", denKey(s)) + "</div>" +
        '<div class="ap-hint" id="aaDenNote">' + denHint(s) + "</div>" +
        /* 「一键推荐」挨着档位行放：它改的就是这一行，报告也写在同一处；
           只有阅读页有正文可试排，别的页面挂这个按钮就是空头承诺。 */
        (window.inkDenAI ? '<div class="aa-den-ai"><button class="btn btn-ghost btn-sm" data-aa="denAI">' +
          icon("sparkles", 14) + "一键推荐疏密</button></div>" : "") +
      "</section>" +
      '<section class="ap-sec"><h4>字体<span class="ap-sec-note">每套主题自带配对</span></h4>' +
        '<div class="ap-row ap-row-col"><span class="ap-k">正文 · 中文</span>' + fontRow("font", s.font) + "</div>" +
        '<div class="ap-row ap-row-col"><span class="ap-k">标题 · 展示</span>' + fontRow("display", s.display) + "</div>" +
        '<div class="ap-hint">默认跟随主题配对（中文正文 + 拉丁展示）；改动即时保存，可切回「跟随主题」。</div>' +
      "</section>" +
      '<section class="ap-sec"><h4>字号</h4>' +
        '<div class="aa-fs">' +
          '<button class="aa-step" data-aa="fsDown" aria-label="减小字号">' + icon("minus", 16) + "</button>" +
          '<span class="aa-fs-v"><b id="aaFs">' + s.fs + "</b> px</span>" +
          '<button class="aa-step" data-aa="fsUp" aria-label="增大字号">' + icon("plus", 16) + "</button>" +
        "</div>" +
      "</section>" +
      '<section class="ap-sec"><h4>间距</h4>' +
        row("行高", range("lh", s.lh)) +
        row("字距", range("ls", s.ls)) +
        row("段间距", range("para", s.para)) +
      "</section>" +
      '<section class="ap-sec"><h4>阅读方式<span class="ap-sec-note">切换后位置不丢</span></h4>' +
        row("翻阅方式", seg("mode", s.mode)) +
        '<div class="ap-hint" id="aaModeNote">' + (MODE_NOTE[s.mode] || "") + "</div>" +
      "</section>" +
      '<section class="ap-sec"><h4>版式</h4>' +
        row("字重", range("wt", s.wt), "墨水屏避免过细字重，300 以下易被残影吞没") +
        row("对齐", seg("align", s.align)) +
        row("首行缩进", seg("indent", s.indent)) +
        row("栏宽", seg("fw", s.fw), '<span class="ap-wh" id="aaWh">' + widthHintHTML(s) + "</span>") +
      "</section>" +
      '<section class="ap-sec"><h4>分栏</h4>' +
        row("双栏排版", sw("twoCol", s.twoCol), "翻页时每页分两栏，滚动时通栏分两栏") +
        row("按内容自适应", sw("auto", s.auto), "按文体套用行高与字距；关闭后以你的设置为准") +
      "</section>" +
      '<section class="ap-sec"><h4>场景<span class="ap-sec-note">静态绘制 · 交互才动</span></h4>' +
        row("场景装饰", sw("scene", s.scene), '<span id="aaSceneHint">' + sceneHint() + "</span>") +
        (metaOf(s.theme) && metaOf(s.theme).scene === "seasons"
          ? row("天幕画卷", seg("sceneArt", s.sceneArt), "名画画库 · 每次进入可随机展卷一幅；画卷随主题纸色同化，深浅主题各自成立")
          : "") +
      "</section>" +
    "</div>" +
    '<footer class="aa-foot">' +
      '<button class="btn btn-ghost btn-sm" data-aa="reset">' + icon("rotate-ccw", 14) + "恢复排版默认" + "</button>" +
      '<span class="ap-hint" style="padding:0">改动即时保存</span>' +
    "</footer>";
  }

  function aaMount() {
    if (aaPanel) return aaPanel;
    aaPanel = document.createElement("aside");
    aaPanel.className = "aa aa-sheet";   /* v2.14：底部 sheet 形态 */
    aaPanel.id = "aaPanel";
    aaPanel.hidden = true;
    aaPanel.setAttribute("role", "dialog");
    aaPanel.setAttribute("aria-label", "排版设置");
    /* 挂进 .screen：与任务抽屉同源定位，右侧滑入贴合阅读区而非浏览器窗口 */
    (document.querySelector(".screen") || document.body).appendChild(aaPanel);

    aaPanel.addEventListener("click", function (e) {
      var tp = e.target.closest("[data-theme-pick]");
      if (tp) { commit({ theme: tp.dataset.themePick }); return; }   /* 与外观抽屉主题卡同一提交链路；ink:read 会带 aaSync */
      var segB = e.target.closest(".ap-seg-b");
      if (segB) { commit(patch(segB.closest(".ap-seg").dataset.seg, segB.dataset.val)); return; }
      var swB = e.target.closest("[data-sw]");
      if (swB) { commit(patch(swB.dataset.sw, !read()[swB.dataset.sw])); return; }
      var a = e.target.closest("[data-aa]");
      if (!a) return;
      var act = a.dataset.aa;
      if (act === "close") aaClose();
      else if (act === "denAI") { if (window.inkDenAI) window.inkDenAI(); }
      else if (act === "fsUp") commit({ fs: Math.min(RANGE.fs[1], read().fs + 1) });
      else if (act === "fsDown") commit({ fs: Math.max(RANGE.fs[0], read().fs - 1) });
      else if (act === "reset") {
        var d = {};
        ["font", "display", "fs", "lh", "wt", "ls", "para", "indent", "align", "fw", "twoCol", "auto", "mode"]
          .forEach(function (k) { d[k] = DEFAULTS[k]; });
        commit(d);
        toast("已恢复排版默认", "rotate-ccw");
      }
    });

    /* 滑块拖动即改即存：正文在面板背后同步重排 */
    aaPanel.addEventListener("input", function (e) {
      var r = e.target.closest("[data-range]");
      if (!r) return;
      var k = r.dataset.range, v = parseFloat(r.value);
      var out = aaPanel.querySelector('[data-val-for="' + k + '"]');
      if (out) out.textContent = fmt(k, v);
      var p = patch(k, v);
      var flipped = p.auto === false;   /* 排版被显式调整、auto 被连带关闭 */
      commit(p);
      if (flipped) aaSync();            /* 立刻翻转面板上的「按内容自适应」开关显示 */
    });

    document.addEventListener("keydown", function (e) {
      /* 层栈（dock.js）已经收掉最上面一层时，这次 Esc 就用完了 —— 一次只收一层。
         Aa sheet 不入栈：它是钉在正文底部的临时调参盘，浮起来只会盖住正在调的正文。 */
      if (e.key !== "Escape" || e.__inkEscHandled) return;
      if (aaPanel && !aaPanel.hidden) aaClose();
    });
    return aaPanel;
  }

  /* 只刷新状态，不重建 DOM，避免滑块在拖动中被重置 */
  function aaSync() {
    if (!aaPanel || aaPanel.hidden) return;
    var s = read();
    aaPanel.querySelectorAll("[data-seg]").forEach(function (g) {
      var k = g.dataset.seg;
      /* 疏密档没存进库（它的效果就是那三个字段），高亮按当前数值反查得出 */
      var cur = k === "den" ? denKey(s) : s[k];
      g.querySelectorAll(".ap-seg-b").forEach(function (b) { b.classList.toggle("on", String(cur) === b.dataset.val); });
    });
    aaPanel.querySelectorAll("[data-sw]").forEach(function (b) {
      var on = !!s[b.dataset.sw];
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    });
    aaPanel.querySelectorAll("[data-range]").forEach(function (r) {
      if (document.activeElement !== r) r.value = s[r.dataset.range];
    });
    aaPanel.querySelectorAll("[data-val-for]").forEach(function (b) { b.textContent = fmt(b.dataset.valFor, s[b.dataset.valFor]); });
    var fv = aaPanel.querySelector("#aaFs");
    if (fv) fv.textContent = s.fs;
    var wh = aaPanel.querySelector("#aaWh");
    if (wh) wh.innerHTML = widthHintHTML(s);
    var mn = aaPanel.querySelector("#aaModeNote");
    if (mn) mn.textContent = MODE_NOTE[s.mode] || "";
    var sh = aaPanel.querySelector("#aaSceneHint");
    if (sh) sh.textContent = sceneHint();
    var dn = aaPanel.querySelector("#aaDenNote");
    if (dn) dn.textContent = denReport || denHint(s);
    /* v2.14：快捷主题块高亮当前主题（含主题商城跳回后的回显） */
    var cur = resolve(read());
    aaPanel.querySelectorAll("[data-theme-pick]").forEach(function (b) {
      b.classList.toggle("on", b.dataset.themePick === cur);
    });
    /* 「跟随主题」chip 的文案随主题配对变化，避免切主题后标签停在旧字体名 */
    var pn = window.InkFonts ? InkFonts.pairNames(document.documentElement.dataset.themeKey || "paper") : null;
    if (pn) {
      aaPanel.querySelectorAll('[data-seg="font"] .ap-seg-b[data-val="auto"]').forEach(function (b) { b.textContent = "跟随主题 · " + pn.zh; });
      aaPanel.querySelectorAll('[data-seg="display"] .ap-seg-b[data-val="auto"]').forEach(function (b) { b.textContent = "跟随主题 · " + pn.latin; });
    }
  }

  function aaOpen() {
    var p = aaMount();
    p.innerHTML = aaBuild(read());
    p.hidden = false;
    aaSync();
    requestAnimationFrame(function () { p.classList.add("on"); });
    document.querySelectorAll("[data-aa-toggle]").forEach(function (b) {
      b.classList.add("active");
      b.setAttribute("aria-expanded", "true");
    });
  }
  function aaClose() {
    if (!aaPanel) return;
    aaPanel.classList.remove("on");
    setTimeout(function () { aaPanel.hidden = true; }, 200);
    document.querySelectorAll("[data-aa-toggle]").forEach(function (b) {
      b.classList.remove("active");
      b.setAttribute("aria-expanded", "false");
    });
  }
  function aaToggle() { if (aaPanel && !aaPanel.hidden) aaClose(); else aaOpen(); }

  /* ============================================================
     6. 启动
     本文件置于 <head>，因此脚本执行时立即落地主题 → 首屏零闪烁；
     面板与事件在 DOM 就绪后挂载（面板依赖 app.js 的 icon / toast）。
     ============================================================ */
  function syncToggle() {
    var btn = document.getElementById("themeToggle");
    if (!btn) return;
    if (window.icon) btn.innerHTML = icon("palette", 15);
    btn.title = "外观与阅读设置";
    btn.setAttribute("aria-label", "外观与阅读设置");
  }

  /* 立即落地：避免首帧闪白 / 闪黑 */
  (function boot() {
    var s = read();
    apply(resolve(s));
    paint(s);
  })();

  function typing(e) {
    var t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  }

  function start() {
    watch();
    syncToggle();
    /* 夜间护眼：挂覆盖层（首屏即有位）；判定用本机昼夜时段（v2.1 起移除环境光传感器） */
    mountNightVeil();
    /* 主题切换 / 定时切换后同步顶栏图标与各页 */
    document.addEventListener("ink:read", syncToggle);
    document.addEventListener("ink:read", aaSync);
    /* 任意页面上的 [data-appearance] 入口都打开同一外观面板 */
    document.addEventListener("click", function (e) {
      var trigger = e.target.closest("[data-appearance]");
      if (trigger) { e.preventDefault(); open(); return; }
      /* [data-aa-toggle] 是排版面板的开关（阅读页），同一状态 */
      var aa = e.target.closest("[data-aa-toggle]");
      if (aa) { e.preventDefault(); aaToggle(); }
    });
    /* 快捷键 A：阅读页调出排版面板（v2.22 S5：移入 InkKeys 注册表）。
       when 表达「阅读页且外观面板未开」；page 标注同一件事给「总览」列表看
       —— theme.js 是全局脚本，不标注就会在书架等页的总览里列出一条按不动的 A。
       注册表字段守卫覆盖 INPUT/TEXTAREA/contenteditable，fn 内 typing(e) 补 SELECT ——
       与原 typing() 守卫逐项等价（原实现：修饰键必须全空）。 */
    if (window.InkKeys) {
      InkKeys.on("a", function (e) { if (typing(e)) return; e.preventDefault(); aaToggle(); }, {
        prevent: false, title: "Aa 排版面板", group: "阅读", page: "reader",
        when: function () { return document.body.dataset.page === "reader" && !(mask && !mask.hidden); }
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.InkTheme = {
    GROUPS: GROUPS, THEMES: THEMES, DEFAULTS: DEFAULTS, CITIES: CITIES,
    PREINSTALL: PREINSTALL,
    read: read, commit: commit, resolve: resolve, activeSlot: activeSlot,
    reduced: reduced,
    apply: apply, paint: paint, start: start, open: open, close: close,
    syncToggle: syncToggle, cpl: cpl,
    /* 主题商城：安装态与自建主题 */
    installed: installed, install: install, uninstall: uninstall, isInstalled: isInstalled,
    available: available, storeList: storeList, metaOf: metaOf,
    SCENE_META: SCENE_META, sceneOf: function (k) { var t = metaOf(k); return (t && t.scene) || ""; },
    customList: customList, customSave: customSave, customRemove: customRemove,
    auditTheme: auditTheme, ratio: ratio, customCSS: customCSS, l1CSS: l1CSS, l1Vars: l1Vars,
    toHex: toHex, previewCustom: previewCustom, endPreview: endPreview,
    /* 阅读内排版面板 */
    aaOpen: aaOpen, aaClose: aaClose, aaToggle: aaToggle, aaSync: aaSync,
    /* 疏密五档（v2.19.3 B/C）：配比表 + 反查 + 实测报告写回 */
    DEN: DEN, DEN_ORDER: DEN_ORDER, DEN_NAME: DEN_NAME, denKey: denKey, setDenReport: setDenReport,
    /* 时间与日照：供各页做「跟随本机时间」的展示或扩展 */
    sunTimes: sunTimes, sunToday: sunToday, dayWindow: dayWindow,
    isDay: isDay, nowHours: nowHours, hhmm: hhmm, tzLabel: tzLabel,
    /* 夜间护眼：供核验脚本与各页读取运行时状态 */
    nightActive: nightActive, nightState: function () {
      return { active: nightActive(read()) };
    }
  };
})();
