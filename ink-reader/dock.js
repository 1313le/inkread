/* ============================================================
   InkDock · 可停靠浮窗（v2.10 起版 · v2.23 W2 扩为统一窗管理）—— 桌面端通用组件
   ------------------------------------------------------------
   要解决的问题（用户实测反馈）：
     「草稿纸和批注这类功能不要做成侧边栏，做成可拖动的悬浮窗，
       并且悬浮窗可以有靠近边缘吸附功能，变成侧边栏 —— 就像 Word 的工具栏」

   调研依据（一手来源）：
     ① Visual Studio 工具窗口停靠规范（Microsoft Learn, 2026-05-22）：
        · 拖标题栏移动；拖到框架外即浮动；拖回边缘停靠目标即吸附归位；
        · 拖动中给出「停靠引导 + 目标区域阴影预览」（吸附前必须预告落点）；
        · 按住 Ctrl 拖动可**临时禁用吸附**；
        · 双击 / Ctrl+双击标题栏，在「浮动」与「最近一次停靠位」之间切换；
        · 布局持久化。
     ② Material 3 supporting pane：常驻 + 主内容可重排 → 停靠（Fixed）；
        临时 + 主内容不可重排 → 浮动（Floating）。故本组件停靠时**通知宿主重排主内容**，
        而不是像弹窗一样盖住正文。

   状态机：float（浮动） ⇄ docked（停靠：left | right） ⇄ max（铺满宿主）
   设计取舍：
     · 位置尺寸一律**内联下发**（与阅读页 v2.5 的既有取舍一致），免得与 styles.css
       的侧栏定位、媒体查询打架；宿主只管「我是谁的容器」。
     · 拖动判定沿用项目血的教训：**位移 > 6px 才 setPointerCapture**，
       否则 pointerdown 里的立即捕获会把页签/按钮的 click 一并劫走。
     · 吸附动画用 WAAPI（不写 transition 属性）—— 免得被宿主样式表的
       transition 声明覆盖（页内样式的特异性更高，改不动）。
     · 「浮起 → 停靠」那一下叠一层液桥剪影（v2.23.2）：目标边先凝一滴候着，窗前沿伸出
       另一滴，两滴互相拉长、触到后并成一条颈 —— 整层套 feGaussianBlur + α 阈值。
       filter 只许落在这层一次性剪影上，窗体本身绝不进滤镜 —— filter 会造包含块，
       窗内 position:fixed 当场被关住。

   用法：
     var d = InkDock.create(qs("#notesWin"), {
       id: "notes",                      // 持久化标识（inkread.win.v1 里的那一格）
       host: "#reader",                  // 定位容器（position: relative/absolute）
       handle: "#notesTabs",             // 拖动把手（通常是标题栏/页签条）
       grip: "#notesGrip",               // 浮动态右下抓角（可省）
       min: { w: 300, h: 320 },          // 浮动态最小尺寸
       dock: { min: 260, max: 520, width: 320 },   // 停靠态宽度区间与默认宽
       snap: 24,                         // 边缘吸附带（px）
       dockable: false,                  // 横条那种浮层：贴边停靠 / 铺满没有意义（v1.3 S3 朗读条）
       maxTop: function () { return 0; },// 最大化时的上界（避开顶栏）
       narrow: function () { return false; },      // true → 强制最大化
       onLayout: function (l) {},        // 停靠态：宿主据此重排主内容
       onState:  function (l) {}         // 状态变更回调（含 toast 由宿主自理）
     });
     d.apply();            // 重算并落地（开合、窗口缩放后都要调）
     d.toggleMax();        // 最大化 ⇄ 还原
     d.toggleDock();       // 浮动 ⇄ 停靠（V S 的「双击标题栏」语义）
     d.detach();           // 解除停靠，回到浮动（= 回到最近一次浮动位）

   ────────────────────────────────────────────────────────────
   v2.23 W2 增订 · 「哪些浮层归本组件管」的总账（改动前先来看）

   五态：docked-left | docked-right | floating | maximized | hidden
     标题栏自动注入，钮四枚 = ←停靠 / →停靠 / 浮动 / 最大化 + ✕。方案 §W2 原写三枚，
     实测把左右合一后「从右沿直接换到左沿」没有直达落点，且两向让位相反、tooltip
     得反着写 → 拆成四枚（明账：有意变更）。无把手的浮层自动获得把手。

   几何持久化：新键 inkread.win.v1 按 id 分格；旧 inkread.panel.v1 整表搬一次、不删。
     这张表会跨设备同步 —— InkSync 的 SKIP 只挡 ai.model.v1 / tts.v1。v2.22 的
     inkread.panel.v1 本来就同步，窗位跟人机位是既有行为，W2 沿用未改、不是新增泄漏面。

   层栈：InkWin.stack/top/closeTop 统一接管 Esc，取代 reader 里三条各自为政的 Escape 链；
     一次 Esc 只收一层（v2.22 已验收，反证配方见 verify-v223-wins.js 头）。
     不窗化的浮层用 InkWin.yieldTo(key) 登记自己的收起动作，在同一闸口按序放行。

   窄屏：narrow() 为 true 强制最大化。六个正文宿主窗（modepanel / toc / side / task / notes / pad）
     统一取 700 —— 方案的 600 会在 601~700 留下「停靠栏挤压正文」的半残区间（明账：有意变更）。
     两张视口卡 tr / aux 不传 narrow：它们只贴边不挤版心，窄屏铺满反倒吃掉整屏正文。

   接入 8 窗：
     notes      #notesWin    批注浮窗     v2.5 起就是本组件客户，W2 只迁新键
     pad        #padWin      草稿纸画布   同上
     modepanel  #modePanel   模式工具抽屉 modes.js:450（方案 §W2 名单里写的 #modePop 是
                   「选择阅读模式」的一次性弹层，选完即收 —— 那是另一块，见下方豁免）
     tr         #trPop       翻译浮层     modes.js:1559（viewport + claim #reader）
     toc        #tocPanel    目录检索     reader.html panelWin 工厂
     side       #sidePanel   书签侧栏     同上
     task       #taskDrawer  任务抽屉     同上
     aux        #auxCard     辅助卡       reader.html:3153（viewport + claim）

   豁免（方案 §W2 原列「接入 13 / 豁免 10」，逐条复核后把 6 个从接入移到豁免：
     #aaPanel #morePop #modePop #memPop #tocPv #inkPreview）：
     #aaPanel      底部 sheet（theme.js:1346）—— 位置由触发它的底栏决定，横铺的 seg 控件
                   拖窄即崩；「边读边调」要的是常驻底部，不是可摆放的工作区 → 只走层栈。
     #morePop      role=menu 动作表（reader.html:649）—— 选中即收起的一次性菜单，
                   给了「停靠/最大化」等于把"点了就没"改成"关了还留着"。
     #modePop      选择阅读模式弹层（reader.html:680）—— 同上：钉在底栏「模式」钮上、
                   点外面就收，modes.js:431 那段豁免注释从 v2.19.6 就写着，W2 未翻案。
     #memPop       锚定 #memBtn 的 popover（ai.html:166）—— 位置由锚点算，离开锚点即断指向。
     #tocPv        role=tooltip 悬停气泡（reader.html:942）—— 寿命 = 悬停时长、无交互面，
                   tooltip 长标题栏是反语义。
     #inkPreview   window.preview() 临时卡（app.js:456）—— 每次调用先 remove 再重建，
                   持久化一个每帧都重生的几何 = 存了没人读。
     .modal-mask×8 —— 强制确认层：窗化就送了"拖走/最小化"这条逃生通道，模态的意义正是无处可逃。
                   整表 = 静态 6（ai #modelMask / index #editMask #importMask / tasks #batchMask /
                   themes #pvMask #edMask）+ app.js 运行时 2（#ldMask 本机数据、#inkDanger 清空确认）。
                   方案写的「6」只数了静态那批；reader 页上真正出现的是后者两枚（故有 data-modal 让路）。
     #noteImmersive #fcStage #inkWheel #guideStage —— 全屏笔记 / 闪卡舞台 / 径向轮盘 / 首启引导，
                   占满视口或屏中正就是它们的定义。
     #boot .night-veil #toastRoot —— 系统层（启动、转场遮罩、回执），不是用户可摆放的内容。
   S7 结清 2（当年记作「延后」，如今两侧都有了下场）：
     #aiAsk     —— 退役，没单独窗化它：速问浮层整块被 #aiReader 吸收，「选中即问」并进 #selBar
                   的 #selAsk 一枚。先把旧浮层接成窗再拆，成本整笔作废，不如一次换掉。
     #aiReader  —— 以 InkWin 出生（reader.html §8.10）：停靠 ⇄ 浮动 ⇄ 收起三态、mod+j、
                   几何走 inkread.win.v1，从未进过上面那张豁免名单。
   ============================================================ */
(function () {
  "use strict";

  var KEY = "inkread.win.v1";     /* v2.23 W2：所有浮层共用这一张几何表（按 id 分格） */
  var OLDKEY = "inkread.panel.v1"; /* 旧键整表搬一次、留着不删：新键写坏了还有底可回 */
  var TOPZ = 258;                 /* 层栈底：高于沉浸浮条（240），上限压在 toast（300）之下 */
  var DRAG_MIN = 6;               /* 位移阈值：小于它算点击，不算拖动 */
  var ANIM = 170;                 /* 吸附动画时长（ms） */

  function qs(s, r) { return (r || document).querySelector(s); }
  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
      /* 迁移只在「新键空、旧键有」时做一次整体搬；半迁移状态不搬，
         否则会把旧表里的过期格子盖回已经改过的新格上。 */
      var o = JSON.parse(localStorage.getItem(OLDKEY));
      if (o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length) {
        store(o);
        return o;
      }
    } catch (e) {}
    return {};
  }
  function store(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {} }

  /* ---------- 视口宿主（v2.23 W2） ----------
     InkDock 的 host 是一块真容器（#reader）：量边界靠它，停靠时还要在它身上
     挂 data-dock-* / --dock-w-* 让正文让位。而原先钉在 CSS 里的 fixed 浮层
     （解析卡 / 翻译卡 / 速问卡 / 导出预览卡 / 记忆窗）没有宿主 —— 它们的坐标
     本来就是视口坐标。这块假容器补齐「量边界」，同时**故意不记账**：
     没有正文可让位，它的「停靠」就是贴住屏幕那条边常驻，不是把版心挤窄。 */
  var VH = null;
  function viewportHost() {
    if (VH) return VH;
    VH = {
      nodeType: 0, __inkDocks: [],
      style: { setProperty: function () {}, removeProperty: function () {} },
      setAttribute: function () {}, removeAttribute: function () {},
      getAttribute: function () { return null; },
      appendChild: function (n) { document.body.appendChild(n); },
      getBoundingClientRect: function () {
        var w = window.innerWidth, h = window.innerHeight;
        return { left: 0, top: 0, x: 0, y: 0, width: w, height: h, right: w, bottom: h };
      }
    };
    Object.defineProperty(VH, "clientWidth", { get: function () { return window.innerWidth; } });
    Object.defineProperty(VH, "clientHeight", { get: function () { return window.innerHeight; } });
    return VH;
  }

  /* ---------- 层栈（v2.23 W2） ----------
     原先每次 paint 都硬写 el.style.zIndex = TOPZ：三块面板同一个值，
     谁压着谁由 DOM 顺序决定。浮层从 3 块推广到十几块之后必须有显式次序，
     否则「点一下把窗带到前面」这件事根本做不出来。
     本步落**z 序 + 查询 + 收起**（见 InkWin.closeTop）：入栈且领了收起钩子的窗
     由这条统一链收，一次按键只动最上面一层；没登记的层仍归页面自己的 Escape 链。 */
  var STACK = [];
  function reslot() {
    for (var i = 0; i < STACK.length; i++) STACK[i].slot = TOPZ + i;
    /* 保险丝：窗口多到要顶穿 toast(300) 时整体压回 258–299 */
    if (STACK.length && TOPZ + STACK.length - 1 > 299) {
      var step = 41 / Math.max(1, STACK.length - 1);
      for (var k = 0; k < STACK.length; k++) STACK[k].slot = Math.round(258 + k * step);
    }
  }
  function raise(r) {
    if (!r || STACK.indexOf(r) >= 0 && r === STACK[STACK.length - 1]) return;
    var i = STACK.indexOf(r);
    if (i >= 0) STACK.splice(i, 1);
    STACK.push(r);
    reslot();
    if (r.el) r.el.style.zIndex = r.slot;
  }
  function reduceMotion() {
    try {
      if (document.documentElement.getAttribute("data-reduce") === "on") return true;
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) { return false; }
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(v, b)); }

  /* ---------- 液桥滤镜（全篇一份，随首次吸附注入） ----------
     feGaussianBlur 把剪影的硬边化开，feColorMatrix 只改 alpha：A' = 25A − 12.5
     → 阈值落在 A=0.5，也就是**原边位置**：直边不缩不涨，只有两形之间的凹角被填成颈缩。
     color-interpolation-filters 必须写 sRGB —— 默认 linearRGB 会先把颜色搬到线性空间，
     阈值点跟着漂移，剪影边缘会莫名胖一圈。 */
  var GOO_SIG = 9;
  function gooDef() {
    if (document.getElementById("inkGoo")) return;
    var w = document.createElement("div");
    w.setAttribute("aria-hidden", "true");
    w.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    w.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"><defs>'
      + '<filter id="inkGoo" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">'
      + '<feGaussianBlur in="SourceGraphic" stdDeviation="' + GOO_SIG + '" result="b"/>'
      + '<feColorMatrix in="b" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 25 -12.5"/>'
      + '</filter></defs></svg>';
    document.body.appendChild(w);
  }

  function create(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var id = opts.id || el.id || "panel";
    var inView = opts.host === "viewport";
    var host = inView ? viewportHost()
             : typeof opts.host === "string" ? qs(opts.host) : (opts.host || el.parentElement);
    if (!host) return null;
    /* 视口浮层用 fixed：坐标即视口坐标，滚动时不跟着跑（原先各页自己写 CSS 时也是这个语义） */
    if (inView) el.style.position = "fixed";
    /* 把手可以是选择器 / 元素 / 元素数组（标题栏与页签条都要能拖 —— 页签条整行是
       按钮时，按 noDragTarget 规则会被排除，所以调用方应另给一条专用拖动条） */
    function toEls(v) {
      var out = [];
      (Array.isArray(v) ? v : [v]).forEach(function (x) {
        var n = typeof x === "string" ? qs(x, el) : x;
        if (n) out.push(n);
      });
      return out;
    }
    var handles = toEls(opts.handle == null ? el : opts.handle);
    var handle = handles[0] || el;
    /* 把手指向 InkWin 自造的那条细栏时，create() 这会儿栏还不存在 ——
       先记下来，等 barSlot() 把栏造出来再补绑（否则整扇窗没有能拖的地方）。 */
    var pendingHandle = (typeof opts.handle === "string" && !handles.length) ? opts.handle : null;
    var barHandle = false;                  /* 自造细栏当把手：一旦被认下来，栏重建就重绑 */
    var grip = typeof opts.grip === "string" ? qs(opts.grip, el) : (opts.grip || null);
    var minW = (opts.min && opts.min.w) || 300;
    var minH = (opts.min && opts.min.h) || 320;
    var dkMin = (opts.dock && opts.dock.min) || 260;
    var dkMax = (opts.dock && opts.dock.max) || 520;
    var SNAP = opts.snap == null ? 24 : opts.snap;
    /* 横条那一类浮层（v1.3 S3 朗读条）：贴左右边 = 变成 320 宽的侧栏，铺满 = 吃掉整屏，
       两种形态对它都不是「更大一点的工作区」而是「挡住一切」。dockable:false 只留浮动，
       拖到边缘不吸附、双击与 Enter 都不切形态 —— 组件本身仍然是它的位置与尺寸记账方。 */
    var dockable = opts.dockable !== false;
    var GAP = 8;                                   /* 浮动态离边最小距离 */
    var narrow = opts.narrow || function () { return false; };
    var maxTop = opts.maxTop || function () { return 0; };
    /* 停靠态自己的上边界。maxTop 说的是「铺满 / 窄屏时让开本页界栏」，量的是容器里那一行；
       全局顶栏不在任何容器内，而视口宿主的 box 原点就是屏幕左上，
       停靠若不让出这一条，顶栏右端的最小化/最大化/关闭与外观设置会被整个盖住。 */
    var dockTop = opts.dockTop || function () { return 0; };
    /* 只有真容器才需要「让正文让位」的记账；视口宿主跳过（见 viewportHost）。
       nodeType 是这里唯一的判别 —— 假容器没有 DOM 身份。
       opts.claim 让 fixed 浮层把「让位记账」挂到真容器上：贴边常驻时正文照旧让开，
       而元素本身仍按视口定位，不跟着宿主重排。 */
    var ck = opts.claim === undefined ? (host.nodeType === 1 ? host : null)
           : (typeof opts.claim === "string" ? qs(opts.claim) : opts.claim);
    /* 卡片族（解析 / 溯源 / 翻译 / 模式）的高度是**内容说了算**：
       写死 height 会在短文下面留一截空白，还会废掉 CSS 的 max-height 滚动。
       autoH 就是「只钉位置和宽度，高度还给内容」——停靠贴边时也一样。 */
    var autoH = !!opts.autoH;
    /* 「这块窗此刻露在外面吗」：各层收起的写法不统一（hidden / visibility / data-open），
       由宿主说清楚；判不出来按计算样式兜底。收起的窗不许占着停靠边。 */
    var shown = opts.shown || function () {
      if (el.hidden) return false;
      var cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    };
    var rec = { id: id, el: el, slot: TOPZ, open: function () { return !!shown(); } };

    /* ---------- 状态 ---------- */
    var f0 = opts.f || {};                    /* 首启浮动态尺寸（卡片族按自己的 CSS 宽度给） */
    var st = { state: "float", side: "right", maxSide: "right",
               f: { x: +f0.x || 0, y: +f0.y || 0, w: +f0.w || 392, h: +f0.h || 600 },
               dockW: (opts.dock && opts.dock.width) || 320 };

    /* 读取记忆（按面板 id 存一格） */
    var prev = load()[id];
    if (prev && typeof prev === "object") {
      if (prev.f) st.f = { x: +prev.f.x || 0, y: +prev.f.y || 0, w: +prev.f.w || st.f.w, h: +prev.f.h || st.f.h };
      if (prev.dockW) st.dockW = +prev.dockW || st.dockW;
      if (prev.side === "left" || prev.side === "right") { st.side = prev.side; st.maxSide = prev.side; }
      if (prev.state === "docked" || prev.state === "float" || prev.state === "max") st.state = prev.state;
    }
    /* 旧键迁移：阅读页批注浮窗的 inkread.notewin.v1 → 本键（读一次即转，旧键不删） */
    if (opts.migrate && !prev) {
      var old = opts.migrate();
      if (old && typeof old === "object") {
        st.f = { x: +old.x || 0, y: +old.y || 0, w: +old.w || st.f.w, h: +old.h || st.f.h };
        st.state = old.max ? "max" : "float";
      }
    }
    /* dockable:false 的窗只认浮动：账上若还留着别处的形态（改配置前存的），当场收回浮动，
       否则 geom() 会照着旧账铺满 / 让位，钮又点不回去。 */
    if (!dockable) st.state = "float";

    function save() {
      var m = load();
      m[id] = { state: st.state, side: st.side, f: st.f, dockW: Math.round(st.dockW) };
      store(m);
    }

    /* ---------- 几何 ---------- */
    function box() {                               /* 宿主可用区 */
      return { W: host.clientWidth || 900, H: host.clientHeight || 640 };
    }
    function dockWNow() {
      var b = box();
      return Math.round(clamp(st.dockW, dkMin, Math.min(dkMax, b.W - 220)));
    }
    function geom() {
      var b = box(), t = maxTop();
      if (narrow()) {                              /* 窄屏：浮窗没有意义，一律铺满 */
        return { x: 0, y: t, w: b.W, h: Math.max(minH, b.H - t), mode: "max" };
      }
      if (st.state === "max") return { x: 0, y: t, w: b.W, h: Math.max(minH, b.H - t), mode: "max" };
      if (st.state === "docked") {
        var w = dockWNow(), dt = dockTop();
        return { x: st.side === "right" ? b.W - w : 0, y: dt, w: w, h: Math.max(minH, b.H - dt), mode: "docked" };
      }
      var f = st.f;
      f.w = Math.round(clamp(f.w, minW, Math.max(minW, b.W - GAP * 2)));
      if (!autoH) f.h = Math.round(clamp(f.h, minH, Math.max(minH, b.H - GAP * 2)));
      /* autoH 的窗高度由内容决定，纵向夹取要看**实际渲染高度** ——
         照记忆里那个 f.h 夹，一张长卡片会半个身子掉在下边界外。 */
      var hh = autoH ? Math.min(Math.max(minH, el.offsetHeight || f.h), b.H - GAP * 2) : f.h;
      f.x = Math.round(clamp(f.x, GAP, Math.max(GAP, b.W - f.w - GAP)));
      f.y = Math.round(clamp(f.y, GAP, Math.max(GAP, b.H - hh - GAP)));
      return { x: f.x, y: f.y, w: f.w, h: hh, mode: "float" };
    }

    /* ---------- 落地（含停靠态通知宿主重排） ----------
       停靠按「边」独立记账：宿主上是 data-dock-left / data-dock-right 与
       --dock-w-left / --dock-w-right。这样批注与草稿纸可以一左一右同时停靠，
       互不覆盖；同一边被另一个面板占用时，由 claimSide() 把先来的挪回浮动。 */
    var mySide = null;
    function releaseSide() {
      if (!ck || !mySide) return;
      if (ck.getAttribute("data-dock-" + mySide) === "on") {
        ck.removeAttribute("data-dock-" + mySide);
        ck.style.removeProperty("--dock-w-" + mySide);
      }
      mySide = null;
    }
    function claimSide(side) {
      var list = ck.__inkDocks || [];
      list.forEach(function (d) {
        if (d !== api && d.state().state === "docked" && d.state().side === side) d.detach();
      });
      mySide = side;
      ck.__inkDocks = list;
    }
    var lastKey = "";
    var prevMode = "";            /* 上一次落地的形态：液桥只认「不是停靠 → 停靠」这一条边 */
    /* 面板被宿主收起时（批注 data-notes=closed / 草稿纸 data-open=off，都走 visibility:hidden）
       不能再占边：停靠会在宿主上挂 data-dock-* 与 --dock-w-* 让正文让位，面板一收，
       那份让位就成了正文旁边一条「关不掉的空栏」。
       这里只放行不记账、不改 st.state —— 重新打开时停靠的边与宽度原样回来。 */
    function holdsSide() { return !!shown(); }
    /* ---------- 坐标系换算（v2.23 W2） ----------
       geom() 算的是**宿主相对**坐标，el.style.left 却是相对**元素自己的定位原点**：
       绝对定位元素的原点 = offsetParent 的 padding 边，fixed 的原点 = 视口。
       两者不是同一层时（目录 / 任务 / 工具抽屉挂在 .screen 上、宿主写的是 #reader），
       差值就是宿主相对那一层的偏移 —— 实测 1360 宽下差 208px：
       抽屉按「停靠右侧」落到正文中间，屏幕右缘反倒空出一条。
       元素测不到时（display:none 下 offsetParent 为 null）按零偏移落，
       可见后的下一次 apply() 会再校一次。 */
    function originDelta() {
      var hr = host.getBoundingClientRect();
      if (getComputedStyle(el).position === "fixed") return { x: hr.left, y: hr.top };
      var op = el.offsetParent;
      if (!op) return { x: 0, y: 0 };
      var ocs = getComputedStyle(op), or_ = op.getBoundingClientRect();
      return { x: hr.left - or_.left - (+parseFloat(ocs.borderLeftWidth) || 0),
               y: hr.top - or_.top - (+parseFloat(ocs.borderTopWidth) || 0) };
    }
    function paint(anim) {
      var from = el.getBoundingClientRect();
      var g = geom();
      /* 视口浮层的「停靠」= 贴住屏幕那条边常驻；有 claim 容器时顺带叫正文让位，
         没有 claim 就只是贴边，不去改别人的版心 */
      if (g.mode === "docked" && holdsSide()) {
        if (ck) {
          if (mySide !== st.side) { releaseSide(); claimSide(st.side); }
          ck.setAttribute("data-dock-" + st.side, "on");
          ck.style.setProperty("--dock-w-" + st.side, g.w + "px");
        }
        el.setAttribute("data-docked", st.side);
      } else {
        if (ck) releaseSide();
        el.removeAttribute("data-docked");
      }
      el.setAttribute("data-dock-state", g.mode);
      el.dataset.max = g.mode === "max" ? "1" : "0";
      el.style.zIndex = rec.slot;
      var d = originDelta();
      var want = { left: (d.x + g.x) + "px", top: (d.y + g.y) + "px", width: g.w + "px", height: g.h + "px" };
      /* autoH：**只有浮动态**才把高度还给内容 —— 浮在正文旁边的一张卡，写死高度会在
         短文下面留一截空白。一停靠 / 一铺满，它就是侧栏，必须撑满那一条，
         超出部分交给 CSS 的 overflow 滚动。补间里也不能有 height：
         目标是 auto 的属性无法插值，写进去整个动画就废了。 */
      var contentH = autoH && g.mode === "float";
      var props = contentH ? ["left", "top", "width"] : ["left", "top", "width", "height"];
      if (contentH) el.style.height = "";
      var changed = props.some(function (p) { return el.style[p] !== want[p]; });
      var run = null;
      /* 刚由 hidden 转可见时 getBoundingClientRect 全是 0，拿它当动画起点会演出
         「从左上角长出来」—— 那种时刻直接落到位，不要补间。 */
      if (anim && changed && !reduceMotion() && from.width > 0 && from.height > 0) {
        var hb = host.getBoundingClientRect();
        /* 起点也要换算到**元素坐标系**（与 want 同一把尺），否则跨坐标系补间会先跳一下 */
        var now = { left: from.left - hb.left + d.x, top: from.top - hb.top + d.y, width: from.width, height: from.height };
        var k0 = {}, k1 = {};
        props.forEach(function (p) { k0[p] = Math.round(now[p]) + "px"; k1[p] = want[p]; el.style[p] = want[p]; });
        try {
          run = el.animate([k0, k1], { duration: ANIM, easing: "cubic-bezier(.2,.8,.3,1)" });
        } catch (e) { run = null; }
        /* 液桥只认「浮着 → 停靠」这一条边：脱开、铺满都不是融合，硬套只会让手感变黏。
           剪影层读的就是上面这条动画的 progress（缓动已含），与窗体同源补间，不会各走各的。 */
        if (run && g.mode === "docked" && prevMode !== "docked") {
          snapGoo(run, from, { l: hb.left + g.x, t: hb.top + g.y, w: g.w, h: g.h }, st.side);
        }
      } else {
        props.forEach(function (p) { el.style[p] = want[p]; });
      }
      /* 手柄上的停靠/最大化按钮状态（若宿主提供了按钮，自行订阅 onState 也行） */
      var key = g.mode + ":" + st.side;
      if (key !== lastKey) {
        lastKey = key;
        if (opts.onState) opts.onState({ state: g.mode, side: st.side, w: g.w, h: g.h });
      }
      if (opts.onLayout) opts.onLayout({ state: g.mode, side: st.side, w: g.w, h: g.h });
      prevMode = g.mode;
      syncBar();
    }

    /* ---------- 停靠融合：剪影层液桥（v2.23.2） ----------
       观感目标：贴边那一下不像「一块矩形滑进槽里」，而像两滴水互相拉扯后并成一滴。
       四块剪影同处一层，全部由「窗前沿离目标边还有多远」这一个量驱动：
         g-mv  窗前沿的一条供块（藏在实窗底下，只负责往接缝外漏一点 α）
         g-a   目标边伸出的那一滴（起手就有，越近伸得越长）
         g-b   窗前沿伸出的那一滴（两沿相距 ≤ TWIN 才出现，否则隔得太远只是两条无关的墨）
         g-an  目标角上的一截水珠桩（给 a 一个落点，免得液桥在屏幕边被硬切成断面）
       整层套 #inkGoo（模糊 σ + α 阈值）→ 两滴触到后中间自动凹出颈缩，先分后合。
       三条红线：
         ① filter 只落在这层一次性剪影上，窗体本身绝不进滤镜 —— 见 styles.css 同段注释。
         ② 剪影层每帧按四块的并集 + 3σ 重算方框（并夹在宿主内），不是整块宿主：
            模糊的成本就是面积，通高一条带是 854×200，收紧后约 280×150。
         ③ 时长与吸附动画同寿（ANIM），走完自己摘除；reduceMotion 时整段不进这里。
       两个数是从消融里量出来的，不是拍的：
         · 细过 ~18px 的条在 σ=9 下峰值 α≈0.21 < 0.5，阈值直接抹掉 → 最细 16 起步，
           靠 prox 长粗；
         · 剪影填充必须不透明，材质透明度只能放在 filter 之后当图层 opacity（CSS 顺序：
           filter → clip → mask → opacity）。
       补间进度读窗体那条 WAAPI 动画的 getComputedTiming().progress（缓动已含），
       剪影与窗体因此同源；读不到就退回按墙钟线性，误差只在桥的长短上，看不出来。 */
    var PAD = GOO_SIG * 3, AW = 26, TWIN = 260, FADE = 40;
    var gooNode = null, gooRaf = 0;
    function killGoo() {
      if (gooRaf) { cancelAnimationFrame(gooRaf); gooRaf = 0; }
      if (gooNode && gooNode.parentNode) gooNode.parentNode.removeChild(gooNode);
      gooNode = null;
    }
    function snapGoo(anim, srcRect, tgt, side) {
      killGoo();
      gooDef();
      var s = { l: srcRect.left, t: srcRect.top, w: srcRect.width, h: srcRect.height };
      var right = side !== "left";
      var parent = el.parentElement;
      if (!parent) return;
      var hb = host.getBoundingClientRect();
      var layer = document.createElement("div");
      layer.className = "dock-goo";
      layer.dataset.goo = id;
      layer.setAttribute("aria-hidden", "true");
      layer.style.position = inView ? "fixed" : "absolute";
      layer.style.zIndex = String(Math.max(1, rec.slot - 1));   /* 永远压在窗体底下：实窗是主角 */
      layer.innerHTML = '<i class="g-mv"></i><i class="g-a"></i><i class="g-b"></i><i class="g-an"></i>';
      parent.appendChild(layer);
      /* 剪影层与窗体同一个定位上下文：absolute 的原点是 offsetParent 的 padding 边
         （与 originDelta() 同一把尺），fixed 的原点就是视口。 */
      var ox = 0, oy = 0;
      if (!inView && layer.offsetParent) {
        var op = layer.offsetParent, ocs = getComputedStyle(op), ob = op.getBoundingClientRect();
        ox = ob.left + (+parseFloat(ocs.borderLeftWidth) || 0);
        oy = ob.top + (+parseFloat(ocs.borderTopWidth) || 0);
      }
      var cs = layer.children;
      function box(n, l, t, w, h) {
        n.style.left = Math.round(l) + "px"; n.style.top = Math.round(t) + "px";
        n.style.width = Math.round(w) + "px"; n.style.height = Math.round(h) + "px";
      }
      var start = performance.now();
      function frame(now) {
        gooRaf = 0;
        if (!gooNode) return;
        var p = clamp((now - start) / ANIM, 0, 1);
        if (anim) {
          try {
            var cp = anim.effect.getComputedTiming().progress;
            if (typeof cp === "number" && isFinite(cp)) p = clamp(cp, 0, 1);
          } catch (e) {}
        }
        var L = s.l + (tgt.l - s.l) * p, T = s.t + (tgt.t - s.t) * p,
            W = s.w + (tgt.w - s.w) * p, H = s.h + (tgt.h - s.h) * p;
        var outX = right ? tgt.l + tgt.w : tgt.l;          /* 目标外沿＝宿主那条边 */
        var lead = right ? L + W : L;                      /* 窗的前沿 */
        var face = right ? outX - AW : outX + AW;          /* 水珠桩朝向窗的那一面 */
        var gap = right ? face - lead : lead - face;
        var oT = Math.max(T, tgt.t), oB = Math.min(T + H, tgt.t + tgt.h), oh = oB - oT;
        /* 进场 22% 淡入、收尾 FADE 淡出：两头都不能硬切，尤其收尾那一下 —— 桩子还露在
           屏幕边上，一撤就是一次闪烁。 */
        var op = gap > 4 && oh > 8 ? clamp(p / 0.22, 0, 1) * clamp((gap - 4) / FADE, 0, 1) : 0;
        layer.style.opacity = String(op);
        if (op > 0) {
          var prox = clamp(1 - gap / TWIN, 0, 1);          /* 就近程度：越近越长越粗 */
          var th = Math.min(oh, 16 + 30 * prox);
          var len = Math.min(gap * 0.62, 130 * prox);
          var mid = (oT + oB) / 2, sh = Math.min(oh, th * 2.4);
          var rs = [
            /* 供块只在「窗侧那一滴已经伸出来」时才要：它唯一的作用是让那滴从窗上长出来，
               两沿还隔着老远时摆这么一块只会把方框撑大（实测 663px 宽 vs 收紧后 53px）。 */
            gap <= TWIN ? { l: right ? lead - PAD * 2 : lead, t: mid - th, w: PAD * 2, h: th * 2 } : null,
            { l: right ? face - len : face - 8, t: mid - th / 2, w: len + 8, h: th },
            gap <= TWIN ? { l: right ? lead - 8 : lead - len - 6, t: mid - th / 2, w: len + 14, h: th } : null,
            { l: right ? face : face - AW, t: mid - sh / 2, w: AW, h: sh },
          ];
          var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0;
          for (var i = 0; i < rs.length; i++) {
            var r = rs[i];
            if (!r || r.w < 0.5 || r.h < 0.5) { cs[i].style.display = "none"; continue; }
            cs[i].style.display = "block";
            x0 = Math.min(x0, r.l); x1 = Math.max(x1, r.l + r.w);
            y0 = Math.min(y0, r.t); y1 = Math.max(y1, r.t + r.h);
            n++;
          }
          if (n) {
            x0 = Math.max(hb.left, x0 - PAD); x1 = Math.min(hb.right, x1 + PAD);
            y0 = Math.max(hb.top, y0 - PAD);  y1 = Math.min(hb.bottom, y1 + PAD);
            if (x1 - x0 >= 8 && y1 - y0 >= 8) {
              box(layer, x0 - ox, y0 - oy, x1 - x0, y1 - y0);
              for (var k = 0; k < rs.length; k++) {
                if (cs[k].style.display === "none") continue;
                box(cs[k], rs[k].l - x0, rs[k].t - y0, rs[k].w, rs[k].h);
              }
            } else {
              layer.style.opacity = "0";
            }
          }
        }
        if (p >= 1) { killGoo(); return; }
        gooRaf = requestAnimationFrame(frame);
      }
      gooNode = layer;
      gooRaf = requestAnimationFrame(frame);
    }

    /* ---------- 停靠引导（吸附前预告落点，VS 的阴影预览） ---------- */
    var guide = document.createElement("div");
    guide.className = "dock-guide";
    guide.setAttribute("aria-hidden", "true");
    if (inView) guide.style.position = "fixed";   /* 引导层挂在 body 上，也得按视口量 */
    host.appendChild(guide);
    function showGuide(side, w) {
      guide.setAttribute("data-side", side);
      /* 上边缘的落点是整块可用区，不量宽；左右才谈宽度 */
      if (side === "max") { guide.style.width = ""; guide.style.top = ""; }
      else { guide.style.width = (w || dockWNow()) + "px"; guide.style.top = dockTop() + "px"; }
      guide.classList.add("on");
    }
    function hideGuide() { guide.classList.remove("on"); }

    /* ---------- 拖动：浮动 ⇄ 停靠 ---------- */
    var drag = null, dragEndAt = 0;
    function noDragTarget(t) {
      return !!(t && t.closest && t.closest("button, a, input, textarea, select, [data-no-drag], .nw-grip, .dock-edge, .dock-rz"));
    }
    function onDown(e) {
      if (e.button != null && e.button !== 0) return;
      if (narrow()) return;
      if (noDragTarget(e.target)) return;
      var hr = host.getBoundingClientRect();
      var wasDocked = st.state === "docked";
      /* 从停靠态起手：先脱开成浮动（VS 是同一个行为），抓取点落在把手正中偏左 */
      var g = geom();
      if (wasDocked) {
        st.state = "float";
        st.f.w = Math.max(minW, Math.min(g.w, box().W - GAP * 2));
        st.f.h = Math.max(minH, Math.min(Math.round(box().H * 0.82), box().H - GAP * 2));
        st.f.x = clamp(e.clientX - hr.left - st.f.w * 0.35, GAP, Math.max(GAP, box().W - st.f.w - GAP));
        st.f.y = clamp(e.clientY - hr.top - 18, GAP, Math.max(GAP, box().H - st.f.h - GAP));
        paint(false);
      }
      var gg = geom();
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY,
               ox: e.clientX - hr.left - gg.x, oy: e.clientY - hr.top - gg.y,
               moved: false, wasDocked: wasDocked, cap: e.currentTarget || handle };
      /* 捕获必须在 pointerdown 起手就做：停靠态一脱开，面板会按抓取点重排，
         指针往往正好落在新增的 .dock-rz 顶条上；等攒够 6px 位移再捕获时，
         handle 已经收不到 pointermove 了（表现为脱开后面板不再跟手）。 */
      try { drag.cap.setPointerCapture(e.pointerId); } catch (err) {}
      var s = window.getSelection();
      if (s && s.removeAllRanges) s.removeAllRanges();   /* 拖窗不是划词 */
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < DRAG_MIN) return;
        drag.moved = true;
        document.body.classList.add("dock-drag");
      }
      var hr = host.getBoundingClientRect();
      st.f.x = Math.round(e.clientX - hr.left - drag.ox);
      st.f.y = Math.round(e.clientY - hr.top - drag.oy);
      paint(false);
      /* 吸附判定：指针在边缘带内，或面板自身贴到边缘。
         上边缘=铺满（v2.23 W2）—— VS / Windows 的「拖到顶部最大化」是肌肉记忆，
         原来只有「双击标题栏」一条路，找不到的人就只能一直浮着。 */
      var side = null;
      if (dockable && !e.ctrlKey && !e.metaKey) {
        var px = e.clientX - hr.left, py = e.clientY - hr.top, g = geom();
        /* v2.23 W2 边角仲裁：左右缘优先于上缘。
           原先上缘排第一，实测「把浮着的抽屉往右一甩」会落进铺满——抽屉浮起后标题条
           常停在宿主顶边 24px 带内（宿主顶=视口 46，抓取点 y≈70~80），此时 py≤SNAP 成立，
           而用户的横向意图（px 已越出右缘）被上缘抢走。改成先判竖边：
           贴左/贴右按栏停靠，两条竖边都不靠才认上缘铺满（＝Windows 顶部中间那条带的语义）。 */
        if (px <= SNAP || g.x <= SNAP) side = "left";
        else if (px >= hr.width - SNAP || g.x + g.w >= hr.width - SNAP) side = "right";
        else if (py <= SNAP) side = "max";
      }
      if (side) { if (side !== "max") st.side = side; showGuide(side); } else { hideGuide(); }
    }
    function onUp(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var moved = drag.moved, ctrl = e && (e.ctrlKey || e.metaKey);
      try { drag.cap.releasePointerCapture(drag.id); } catch (err) {}
      document.body.classList.remove("dock-drag");
      var guided = guide.classList.contains("on");
      var gside = guide.getAttribute("data-side");
      hideGuide();
      drag = null;
      if (!moved) return;                                  /* 单击交给把手自己的语义 */
      dragEndAt = Date.now();
      if (ctrl || !guided) { st.state = "float"; save(); paint(true); }
      else if (gside === "max") { st.state = "max"; save(); paint(true); }
      else { st.state = "docked"; st.maxSide = st.side; save(); paint(true); }
      syncBar();
    }
    function bindHandle(h) {
      h.addEventListener("pointerdown", onDown);
      h.addEventListener("pointermove", onMove);
      h.addEventListener("pointerup", onUp);
      h.addEventListener("pointercancel", onUp);
      /* 双击标题栏：浮动 ⇄ 最近停靠位（VS 语义；Ctrl+双击同效） */
      h.addEventListener("dblclick", function (e) {
        if (noDragTarget(e.target) || narrow()) return;
        e.preventDefault();
        toggleDock();
      });
      /* 键盘可达：方向键微移（浮动）/ 调宽（停靠）；Enter 或空格切停靠 */
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "0");
      h.addEventListener("keydown", function (e) {
        if (e.target !== h) return;
        var step = e.shiftKey ? 32 : 8, hit = false;
        if (e.key === "Enter" || e.key === " ") { toggleDock(); hit = true; }
        else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          var dir = e.key === "ArrowRight" ? 1 : -1;
          if (st.state === "docked") st.dockW = clamp(dockWNow() + dir * step, dkMin, dkMax);
          else st.f.x += dir * step;
          hit = true;
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          if (st.state !== "docked") { st.f.y += (e.key === "ArrowDown" ? step : -step); hit = true; }
        }
        if (hit) { e.preventDefault(); save(); paint(false); }
      });
    }
    handles.forEach(bindHandle);

    /* ---------- 浮动态抓角缩放（沿用既有右下抓角） ---------- */
    var zoom = null;
    if (grip) {
      grip.addEventListener("pointerdown", function (e) {
        if (st.state !== "float" || narrow()) return;
        zoom = { id: e.pointerId, x: e.clientX, y: e.clientY, w: st.f.w, h: st.f.h };
        try { grip.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
        var s = window.getSelection();
        if (s && s.removeAllRanges) s.removeAllRanges();
        document.body.classList.add("dock-drag");
      });
      grip.addEventListener("pointermove", function (e) {
        if (!zoom || e.pointerId !== zoom.id) return;
        var b = box();
        st.f.w = Math.round(clamp(zoom.w + (e.clientX - zoom.x), minW, b.W - st.f.x - GAP));
        st.f.h = Math.round(clamp(zoom.h + (e.clientY - zoom.y), minH, b.H - st.f.y - GAP));
        paint(false);
      });
      function zEnd(e) {
        if (!zoom || (e && e.pointerId !== zoom.id)) return;
        dragEndAt = Date.now();
        save();
        document.body.classList.remove("dock-drag");
        try { grip.releasePointerCapture(zoom.id); } catch (err) {}
        zoom = null;
      }
      grip.addEventListener("pointerup", zEnd);
      grip.addEventListener("pointercancel", zEnd);
    }

    /* ---------- 浮动态八方位缩放手柄 ----------
       用户实测反馈「只有右下角一个把手可调大小」：单一 SE 抓角要试错才知道能拉，
       而 VS / Figma 的窗口是四边八角通用。这里在面板内缘生成八条细手柄
       （边 6px、角 12px，压在内容之上但不挡点击以外的区域）；
       宿主若已提供右下可视抓角（grip），SE 那条就让给它，不叠第二块。
       停靠态宽度由 .dock-edge 负责、最大化态无缩放语义，故只在 float 态显示。 */
    /* 窗体自带的三类「非内容」节点：缩放手柄、停靠调宽竖边、自造标题栏槽。
       内容型浮层每渲染一次重写整块 innerHTML，这些节点会连着 DOM 一起被抹掉，
       但节点对象（和挂在上面的监听）还在 —— 刷态时统一认回来，不重建第二份实现。 */
    var rzBars = [], barSlotEl = null;
    var RZ_LB = { n: "上缘：调高度", s: "下缘：调高度", e: "右缘：调宽度", w: "左缘：调宽度",
                  ne: "右上角：同时调宽高", nw: "左上角：同时调宽高", se: "右下角：同时调宽高", sw: "左下角：同时调宽高" };
    /* 与 pointermove 同一套夹取：dx/dy 一律解释成「这条边往哪移了」，
       西 / 北边的反向由下面各自的算式管，调用方不再重复取负。 */
    function zoomBy(dir, dx, dy) {
      var b = box(), g = geom();
      var x = g.x, y = g.y, w = g.w, h = g.h;
      if (dir.indexOf("e") > -1) w = clamp(g.w + dx, minW, b.W - g.x - GAP);
      if (dir.indexOf("s") > -1) h = clamp(g.h + dy, minH, b.H - g.y - GAP);
      if (dir.indexOf("w") > -1) { w = clamp(g.w - dx, minW, g.x + g.w - GAP); x = g.x + g.w - w; }
      if (dir.indexOf("n") > -1) { h = clamp(g.h - dy, minH, g.y + g.h - GAP); y = g.y + g.h - h; }
      st.f.x = Math.round(x); st.f.y = Math.round(y);
      st.f.w = Math.round(w); st.f.h = Math.round(h);
      save(); paint(false);
    }
    ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach(function (dir) {
      if (dir === "se" && grip) return;
      /* autoH 的窗高度归内容：上下向的手柄拖不动任何东西，留着只会骗人 */
      if (autoH && /[ns]/.test(dir)) return;
      var bar = document.createElement("div");
      bar.className = "dock-rz";
      bar.dataset.dir = dir;
      /* §W2 第 6 条：缩放手柄是分隔条，不是装饰。原先一律 aria-hidden，
         读屏里整圈手柄等于不存在 —— 键盘用户只能靠标题栏那四条方向键。
         这里给它 separator + 方向 + 可聚焦，并让方向键真的按这条边的轴向缩放。 */
      bar.removeAttribute("aria-hidden");
      bar.setAttribute("role", "separator");
      bar.setAttribute("tabindex", "0");
      bar.setAttribute("aria-label", RZ_LB[dir]);
      if (dir === "e" || dir === "w") bar.setAttribute("aria-orientation", "vertical");
      else if (dir === "n" || dir === "s") bar.setAttribute("aria-orientation", "horizontal");
      bar.addEventListener("keydown", function (e) {
        if (st.state !== "float" || narrow()) return;
        var step = e.shiftKey ? 32 : 8;
        var dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
        var dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
        if (!dx && !dy) return;
        /* 这条边管哪个轴，方向键就只改哪个轴：上边不许改宽、右边不许改高。
           西 / 北边的「往里推=缩小」不在这里取负，交给 zoomBy 里那套与拖动同源的算式。 */
        var okX = dir.indexOf("e") > -1 || dir.indexOf("w") > -1;
        var okY = dir.indexOf("s") > -1 || dir.indexOf("n") > -1;
        if (!okX) dx = 0;
        if (!okY) dy = 0;
        if (!dx && !dy) return;
        e.preventDefault(); e.stopPropagation();
        zoomBy(dir, dx, dy);
      });
      var z = null;
      bar.addEventListener("pointerdown", function (e) {
        if (e.button || st.state !== "float" || narrow()) return;
        var g = geom();
        z = { id: e.pointerId, px: e.clientX, py: e.clientY, x: g.x, y: g.y, w: g.w, h: g.h };
        try { bar.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault(); e.stopPropagation();
        document.body.classList.add("dock-drag");
      });
      bar.addEventListener("pointermove", function (e) {
        if (!z || e.pointerId !== z.id) return;
        var b = box(), dx = e.clientX - z.px, dy = e.clientY - z.py;
        var x = z.x, y = z.y, w = z.w, h = z.h;
        if (dir.indexOf("e") > -1) w = clamp(z.w + dx, minW, b.W - z.x - GAP);
        if (dir.indexOf("s") > -1) h = clamp(z.h + dy, minH, b.H - z.y - GAP);
        if (dir.indexOf("w") > -1) { w = clamp(z.w - dx, minW, z.x + z.w - GAP); x = z.x + z.w - w; }
        if (dir.indexOf("n") > -1) { h = clamp(z.h - dy, minH, z.y + z.h - GAP); y = z.y + z.h - h; }
        st.f.x = Math.round(x); st.f.y = Math.round(y);
        st.f.w = Math.round(w); st.f.h = Math.round(h);
        paint(false);
      });
      function zEnd(e) {
        if (!z || (e && e.pointerId !== z.id)) return;
        dragEndAt = Date.now();
        save();
        document.body.classList.remove("dock-drag");
        try { bar.releasePointerCapture(z.id); } catch (err) {}
        z = null;
      }
      bar.addEventListener("pointerup", zEnd);
      bar.addEventListener("pointercancel", zEnd);
      el.appendChild(bar);
      rzBars.push(bar);
    });

    /* ---------- 停靠态：内侧竖边可调宽 ---------- */
    var edge = null, edgeDrag = null;
    function ensureEdge() {
      if (edge) return edge;
      edge = document.createElement("div");
      edge.className = "dock-edge";
      edge.setAttribute("aria-hidden", "true");
      el.appendChild(edge);
      edge.addEventListener("pointerdown", function (e) {
        if (st.state !== "docked") return;
        edgeDrag = { id: e.pointerId, x: e.clientX, w: dockWNow() };
        try { edge.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault(); e.stopPropagation();
        document.body.classList.add("dock-drag");
      });
      edge.addEventListener("pointermove", function (e) {
        if (!edgeDrag || e.pointerId !== edgeDrag.id) return;
        var dx = e.clientX - edgeDrag.x;
        st.dockW = clamp(edgeDrag.w + (st.side === "right" ? -dx : dx), dkMin, dkMax);
        paint(false);
      });
      function eEnd(e) {
        if (!edgeDrag || (e && e.pointerId !== edgeDrag.id)) return;
        save();
        document.body.classList.remove("dock-drag");
        try { edge.releasePointerCapture(edgeDrag.id); } catch (err) {}
        edgeDrag = null;
      }
      edge.addEventListener("pointerup", eEnd);
      edge.addEventListener("pointercancel", eEnd);
      return edge;
    }
    function syncEdge() {
      var e = ensureEdge();
      if (st.state !== "docked" || narrow()) { e.style.display = "none"; return; }
      e.style.display = "block";
      e.style[st.side === "right" ? "left" : "right"] = "-4px";
      e.style[st.side === "right" ? "right" : "left"] = "auto";
    }

    /* ---------- 形态钮：所有浮层一键互切（v2.23 W2 · 问题三「固定的悬浮框」） ----------
       刻意**不新造一条标题栏**：同一页里两种头部两种长相，比少几个按钮更糟。
       opts.bar 指到宿主已有的头部（多半就是那条 .xx-head），把四枚形态钮插进去；
       指不到才自建一条细栏 —— 那些「只有一张卡、连头都没有」的浮层就此有了把手。
       钮全用原生 <button>：拖动逻辑本来就跳过按钮（noDragTarget），
       于是「按钮不触发拖窗」这件事不用另写判据，键盘可达也是白送的。
       opts.bar === false 表示宿主自己管形态（草稿纸 / 工具抽屉已有各自的合并钮）。 */
    var bar = null, bx = null, bbtn = {}, origin = null;
    var BAR_SPEC = [
      { k: "left",  ic: "panel-left",     g: "◧", lb: "靠左停靠", ti: "停靠到左边（拖标题栏也能做到）" },
      { k: "right", ic: "panel-right",      g: "◨", lb: "靠右停靠", ti: "停靠到右边（拖标题栏也能做到）" },
      { k: "float", ic: "move-horizontal",  g: "✥", lb: "浮起来",   ti: "脱离边缘，自由浮动" },
      { k: "max",   ic: "maximize-2",       g: "⛶", lb: "铺满",     ti: "铺满可用区（再按一次还原）" }
    ];
    function winIcon(name, glyph) {
      /* dock.js 排在 app.js 之前加载，但 create() 都在页面就绪后才跑，图标表那时已在。
         真遇上不加载 app.js 的页（print.html）就退回文字符号 —— 空钮比丑钮更糟。 */
      if (window.icon) { try { return window.icon(name, 14); } catch (e) {} }
      return '<span class="inkw-g">' + glyph + "</span>";
    }
    function barSlot() {
      var slot = typeof opts.bar === "string" ? qs(opts.bar, el)
               : (opts.bar && el.contains(opts.bar) ? opts.bar : null);
      if (slot) { slot.setAttribute("data-inkw-bar", ""); return slot; }
      /* 自建细栏：先看上一次造的那条还在不在（内容型浮层重写 innerHTML 会把它抹掉，
         抹掉了就再造一条 —— 标题跟着内容走，形态钮跟着窗口走，两件事不能挤同一个槽） */
      slot = (barSlotEl && el.contains(barSlotEl)) ? barSlotEl : qs(".inkw-bar", el);
      if (!slot) {
        slot = document.createElement("div");
        slot.className = "inkw-bar";
        slot.innerHTML = '<b class="inkw-t">' + escTitle(opts.title || el.getAttribute("aria-label") || "窗口") + "</b>";
        el.insertBefore(slot, el.firstChild);
        /* 自造的细栏就是这扇窗的把手：那些「只有一张卡、连头都没有」的浮层，
           除了这条栏没有别的地方可以抓。宿主把 opts.handle 指到 .inkw-bar 时，
           create() 那会儿栏还不存在，于是这里认下来（barHandle 一旦为真就记住了，
           卡片每次重写 innerHTML 把栏抹掉重建，把手都跟着重新绑）。 */
        if (!barHandle && pendingHandle && qs(pendingHandle, el) === slot) barHandle = true;
        if (barHandle) {
          handles.length = 0; handles.push(slot); handle = slot; bindHandle(slot);
        }
      }
      barSlotEl = slot;
      slot.setAttribute("data-inkw-bar", "");
      return slot;
    }
    function escTitle(s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    }
    /* 内容型浮层（解析 / 翻译 / 速问 / 导出预览）每渲染一次就把整块 innerHTML 重写，
       窗体自己的三样东西会被连着抹掉：标题栏槽、八方位缩放手柄、停靠态调宽竖边。
       节点对象还在（监听也在），只是离开了 DOM —— 挂回去即可，绝不重建第二份实现。
       手柄是绝对定位、贴内缘，追加到尾部不影响层序；标题栏槽要留在最前。 */
    function remountChrome() {
      if (barSlotEl && !el.contains(barSlotEl)) el.insertBefore(barSlotEl, el.firstChild);
      rzBars.forEach(function (b) { if (!el.contains(b)) el.appendChild(b); });
      if (edge && !el.contains(edge)) el.appendChild(edge);
    }
    function mountBar() {
      if (!bar) return;
      var slot = barSlot();
      /* opts.x 指宿主已有的 ✕。形态钮插在它**前面**：标题栏的通行次序是
         [标题] … [形态] [关闭]，把 ✕ 夹在中间会让人以为它还管形态。
         同时不给它加监听 —— 那只 ✕ 多半绑着宿主的收起逻辑（批注那种还是「点一次翻一次」的
         开关），再补一次就是 double toggle。 */
      var anchor = typeof opts.x === "string" ? qs(opts.x, el) : (opts.x && el.contains(opts.x) ? opts.x : null);
      slot.insertBefore(bar, anchor && anchor.parentNode === slot ? anchor : null);
      if (bx && !anchor && !slot.contains(bx)) slot.appendChild(bx);
    }
    function buildBar() {
      if (opts.bar === false) return;
      bar = document.createElement("span");
      bar.className = "inkw-st";
      bar.setAttribute("role", "group");
      bar.setAttribute("aria-label", "窗口形态");
      BAR_SPEC.forEach(function (s) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "inkw-btn";
        b.dataset.inkw = s.k;
        b.innerHTML = winIcon(s.ic, s.g);
        b.setAttribute("aria-label", s.lb);
        b.title = s.ti;
        b.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          if (s.k === "float") setState("float");
          else if (s.k === "max") toggleMax();
          else setState("docked", { side: s.k });
        });
        bar.appendChild(b);
        bbtn[s.k] = b;
      });
      if (opts.closable !== false) {
        bx = document.createElement("button");
        bx.type = "button";
        bx.className = "inkw-btn inkw-x";
        bx.innerHTML = winIcon("x", "✕");
        bx.setAttribute("aria-label", opts.closeLabel || "收起");
        bx.title = "收起（Esc 同样有效）";
        bx.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); closeWin(); });
      }
      mountBar();
      /* 把手说明：吸附预览只在拖动那一下才看得见，光靠拖学不会。
         只补**没有 role** 的把手 —— 页签条那种自带 role=tablist 的绝不能覆盖，
         一改就把整条页签的无障碍语义抹平。 */
      handles.forEach(function (h) {
        if (!h.hasAttribute("title")) h.title = "拖动这条：贴左右边缘=停靠成侧栏，贴上边缘=铺满，双击=浮起⇄停靠";
        if (!h.getAttribute("role")) { h.setAttribute("role", "group"); h.setAttribute("aria-roledescription", "可拖动标题栏"); }
        if (!h.hasAttribute("aria-label")) h.setAttribute("aria-label", (opts.title || id) + " 标题栏");
      });
      /* 浮层本体补 dialog 语义：非模态（不加 aria-modal=true），正文照常可读可点 */
      if (!el.getAttribute("role")) el.setAttribute("role", "dialog");
      if (!el.hasAttribute("aria-modal")) el.setAttribute("aria-modal", "false");
      if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", opts.title || id);
    }
    function valuetext() {
      var s = st.state;
      return s === "max" ? "已铺满" : s === "docked" ? "已停靠在" + (st.side === "right" ? "右" : "左") + "侧" : "浮动中";
    }
    function syncBar() {
      if (!bar) return;
      /* 内容型浮层（解析 / 翻译 / 问问）每渲染一次就重写 innerHTML，注入台上的形态钮
         会被一起抹掉 —— 每次刷态前确认它还在台上，不在了就重新找头部落位。 */
      if (!el.contains(bar)) mountBar();
      remountChrome();
      var m = geom().mode;
      /* 这四行与 BAR_SPEC 的四条逐字锁死：少一条 spec 就让 bbtn 少一枚，这里直接抛 TypeError；
         而 syncBar() 在 create() 的同步路径上 —— 一处少钮能让整页 reader 起不来（#doc 都不渲染）。
         增删形态钮必须两处同改（反向验证 W2-X4 实测）。 */
      bbtn.left.setAttribute("aria-pressed", m === "docked" && st.side === "left" ? "true" : "false");
      bbtn.right.setAttribute("aria-pressed", m === "docked" && st.side === "right" ? "true" : "false");
      bbtn.float.setAttribute("aria-pressed", m === "float" ? "true" : "false");
      bbtn.max.setAttribute("aria-pressed", m === "max" ? "true" : "false");
      /* 形态同时写进 data 属性：宿主和闸门都靠它判当前态，不必去读四枚钮的 aria-pressed。
         这里必须走 mode() 而不是 geom().mode —— geom() 只说「落在哪块区域」，
         收起来的窗照样算得出一个 float，五态里的 hidden 就永远没人写得出来（§W2.1）。
         钮上的 aria-pressed 仍按 geom()：窗收起来时，那枚「浮窗」钮还该照着记忆里的形态亮着。 */
      el.dataset.inwState = mode();
      el.dataset.inwForm = form();
      el.dataset.inwText = valuetext();
      /* 分隔条得把「现在拖得出什么」说清楚：浮动态报实测宽高，其余形态明说不可缩放，
         否则读屏里那八条边只是八个同名控件，用户无从知道按下去有没有反应。 */
      var gz = geom();
      el.querySelectorAll(".dock-rz").forEach(function (b) {
        b.setAttribute("aria-valuetext", gz.mode === "float" ? "宽 " + gz.w + " 高 " + gz.h + " 像素" : "仅浮动时可缩放");
        b.setAttribute("aria-disabled", gz.mode === "float" ? "false" : "true");
      });
    }
    function closeWin() {
      var hadFocus = el.contains(document.activeElement);
      if (opts.onClose) opts.onClose(api); else el.hidden = true;
      if (hadFocus && origin && document.contains(origin)) { try { origin.focus(); } catch (e) {} }
    }

    /* 抬起 + 记住焦点来路：关掉窗之后焦点要回到它原来待的地方，
       而不是掉进 body（原先十几个浮层各自为政，没一处做这件事）。 */
    el.addEventListener("pointerdown", function () {
      raise(rec);
      var a = document.activeElement;
      if (!origin && a && a !== document.body && !el.contains(a)) origin = a;
    }, true);
    /* Esc 只在焦点位于窗内时收这一层：不碰各页已有的文档级 Escape 链，
       免得一处按键收掉两层（v2.22 已验收的语义）。
       层栈收过的那一次必须让路：文档捕获链按「谁在最上面」收，焦点却可能落在
       下面那层里 —— 两链各自动手时，一次 Esc 就收掉两层（S7 实测复现的组合）。 */
    el.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !shown() || e.__inkEscHandled) return;
      e.stopPropagation(); e.preventDefault();
      closeWin();
    });

    function apply(anim) { paint(!!anim); syncEdge(); }
    function setState(s, o) {
      if (s !== "float" && s !== "docked" && s !== "max") return;
      if (!dockable && s !== "float") return;
      if (s === "docked" && o && (o.side === "left" || o.side === "right")) { st.side = o.side; st.maxSide = o.side; }
      st.state = s;
      save(); paint(true); syncEdge();
    }
    function toggleMax() {
      if (!dockable || narrow()) return false;
      st.state = st.state === "max" ? (st.maxSide ? "docked" : "float") : "max";
      if (st.state === "docked") st.side = st.maxSide;
      save(); paint(true); syncEdge();
      return st.state === "max";
    }
    function toggleDock() {
      if (!dockable || narrow()) return false;
      if (st.state === "docked") { st.state = "float"; }
      else { st.state = "docked"; st.side = st.maxSide || "right"; }
      save(); paint(true); syncEdge();
      return st.state === "docked";
    }
    function detach() { if (st.state === "docked") { st.state = "float"; save(); paint(true); syncEdge(); } }
    function state() { return { state: narrow() ? "max" : st.state, side: st.side, dockW: dockWNow(), f: st.f }; }
    function justDragged(ms) { return Date.now() - dragEndAt < (ms || 240); }
    function reset() { var m = load(); delete m[id]; store(m); }
    /* 五态口径（方案 §W2.1）：state() 那三个值 + 边 + 「收起了没有」。
       不动 state() 的返回形状 —— 批注、草稿纸、工具抽屉三处已在按它写文案。 */
    function mode() { return shown() ? form() : "hidden"; }
    /* 形态本身，与「收起来没收起来」无关。退场动画必须读它而不是 mode()：
       关闭的第一帧 mode() 已经是 hidden，CSS 无从知道这个正在滑走的窗是浮窗还是停靠。 */
    function form() {
      var m = narrow() ? "max" : st.state;
      return m === "docked" ? "docked-" + st.side : m === "float" ? "floating" : "maximized";
    }
    function openWin() {
      if (!shown()) { el.hidden = false; if (opts.onOpen) opts.onOpen(api); }
      raise(rec); apply(true);
    }
    /* 由内容定落点（解析卡跟着选区、翻译卡跟着鼠标）：只挪浮动位，不改形态。
       夹取交给 geom() —— 这里写进来的值可能贴着屏幕边，落位前还要过一次边界。 */
    function place(x, y, w) {
      if (w) st.f.w = Math.round(w);
      st.f.x = Math.round(x); st.f.y = Math.round(y);
      save(); paint(false);
    }

    /* 宿主尺寸变化：停靠/最大化必须跟着重算；浮动只做边界夹取。
       视口宿主不是 Element，ResizeObserver.observe 会直接抛 —— 改听 window。 */
    if (host.nodeType === 1 && window.ResizeObserver) {
      var ro = new ResizeObserver(function () { paint(false); syncEdge(); });
      ro.observe(host);
    } else {
      window.addEventListener("resize", function () { paint(false); syncEdge(); });
    }

    buildBar();
    /* 只有宿主讲清了「怎么收」的窗才领收起钩子。批注浮窗那类靠 #reader[data-notes]
       记账的，收起逻辑归宿主自己 —— 硬套 el.hidden 只会收不掉，还会留下半开的重排账。 */
    if (opts.onClose) rec.dismiss = closeWin;
    STACK.push(rec); reslot();

    var api = { el: el, apply: apply, setState: setState, toggleMax: toggleMax, toggleDock: toggleDock,
                detach: detach, state: state, justDragged: justDragged, reset: reset,
                guideShow: showGuide, guideHide: hideGuide,
                mode: mode, close: closeWin, open: openWin, place: place, shown: shown,
                raise: function () { raise(rec); },
                rec: rec };
    /* 登记到记账容器，供同侧互斥协调（同一宿主可停靠多个面板：一左一右）。
       视口浮层带 claim 时登记的也是那台真容器 —— 于是「右边缘只能有一个常驻」
       这件事对卡片族和面板族是同一套规则。 */
    var reg = ck || host;
    (reg.__inkDocks = reg.__inkDocks || []).push(api);
    var _detach = api.detach;
    api.detach = function () { releaseSide(); return _detach(); };
    return api;
  }

  /* InkDock 是旧名，三处接入（批注 / 草稿纸 / 工具抽屉）都还认它；
     InkWin 是同一个构造器的新名 + 层栈查询（方案 §W2：升级而非另起一套）。 */

  /* 让路登记（§W2.4 的另外半边）：模态框 / 底部 sheet / 面板内的子选择态这些**不入栈**、
     却盖在窗上面的层，按 Esc 时必须由它们先收 —— 否则栈在同一次按键里把身后的窗一起收了，
     「一次 Esc 只收一层」当场破功（实测两处：目录窗 + 本机数据 modal 同收、+「更多」sheet 同收）。
     按 key 登记、重复登记只换谓词：宿主在 render 里重报当前状态也不会堆出一串旧闭包。 */
  var YIELDS = [];
  function yielding() {
    for (var i = 0; i < YIELDS.length; i++) if (YIELDS[i].fn()) return YIELDS[i].key;
    return null;
  }

  window.InkDock = { create: create, KEY: KEY, read: load };
  window.InkWin = {
    create: create, KEY: KEY, read: load,
    /* 只读层栈快照：给宿主和闸门用。「谁在最上面」这件事从 DOM 顺序变成显式次序之后，
       总得有个地方能问出来，否则排查又要回去看得知的 z-index。 */
    stack: function () {
      return STACK.map(function (r) { return { id: r.id, slot: r.slot, shown: !!r.open() }; });
    },
    top: function () { var r = STACK[STACK.length - 1]; return r && r.id; },
    yieldTo: function (key, fn) {
      for (var i = 0; i < YIELDS.length; i++) if (YIELDS[i].key === key) { YIELDS[i].fn = fn; return; }
      YIELDS.push({ key: key, fn: fn });
    },
    yields: function () { return YIELDS.map(function (r) { return r.key; }); },
    /* 收掉最上面一层「领了收起钩子」的窗，返回被收的 id；一层都不该由栈收时返回 null。
       返回 null 而不是 false —— 调用方要拿它当「这条链管不管」的判据，
       而 id 可能是空串，用布尔判断会把成功收起误读成无人认领。 */
    closeTop: function () {
      for (var i = STACK.length - 1; i >= 0; i--) {
        var r = STACK[i];
        if (r.dismiss && r.open()) { r.dismiss(); return r.id; }
      }
      return null;
    }
  };

  /* 文档级 Escape 归一（方案 §W2 第 4 条）：捕获段先跑，收成功后在事件上打标记，
     页面里那些各自的 Escape 链（查找框 / 目录 / 修改态 / 面板）见标记就让路。
     原先是一按 Esc 同时收掉解析卡和翻译卡两层 —— 各链互不知道对方也动了手。
     标记的语义因此是「这次按键有主了」，不是「栈收了一个窗」：
     栈上有模态时（yielding 命中）栈不收窗，但同样把按键判给那一层，
     否则页面里那条局部优先链会补上一刀，实测还是一次收两层。
     模态自己的链**不查**这个标记 —— 它们就是这次按键的主人。 */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || e.__inkEscHandled) return;
    if (yielding()) { e.__inkEscHandled = true; return; }
    if (InkWin.closeTop() !== null) e.__inkEscHandled = true;
  }, true);
})();
