/* ============================================================
   InkDock · 可停靠浮窗（v2.10）—— 桌面端通用组件
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

   用法：
     var d = InkDock.create(qs("#notesWin"), {
       id: "notes",                      // 持久化标识（inkread.panel.v1）
       host: "#reader",                  // 定位容器（position: relative/absolute）
       handle: "#notesTabs",             // 拖动把手（通常是标题栏/页签条）
       grip: "#notesGrip",               // 浮动态右下抓角（可省）
       min: { w: 300, h: 320 },          // 浮动态最小尺寸
       dock: { min: 260, max: 520, width: 320 },   // 停靠态宽度区间与默认宽
       snap: 24,                         // 边缘吸附带（px）
       maxTop: function () { return 0; },// 最大化时的上界（避开顶栏）
       narrow: function () { return false; },      // true → 强制最大化
       onLayout: function (l) {},        // 停靠态：宿主据此重排主内容
       onState:  function (l) {}         // 状态变更回调（含 toast 由宿主自理）
     });
     d.apply();            // 重算并落地（开合、窗口缩放后都要调）
     d.toggleMax();        // 最大化 ⇄ 还原
     d.toggleDock();       // 浮动 ⇄ 停靠（V S 的「双击标题栏」语义）
     d.detach();           // 解除停靠，回到浮动（= 回到最近一次浮动位）
   ============================================================ */
(function () {
  "use strict";

  var KEY = "inkread.panel.v1";
  var TOPZ = 258;                 /* 默认层级：高于沉浸浮条（240） */
  var DRAG_MIN = 6;               /* 位移阈值：小于它算点击，不算拖动 */
  var ANIM = 170;                 /* 吸附动画时长（ms） */

  function qs(s, r) { return (r || document).querySelector(s); }
  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
  }
  function store(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {} }
  function reduceMotion() {
    try {
      if (document.documentElement.getAttribute("data-reduce") === "on") return true;
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) { return false; }
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(v, b)); }

  function create(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var id = opts.id || el.id || "panel";
    var host = typeof opts.host === "string" ? qs(opts.host) : (opts.host || el.parentElement);
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
    var grip = typeof opts.grip === "string" ? qs(opts.grip, el) : (opts.grip || null);
    var minW = (opts.min && opts.min.w) || 300;
    var minH = (opts.min && opts.min.h) || 320;
    var dkMin = (opts.dock && opts.dock.min) || 260;
    var dkMax = (opts.dock && opts.dock.max) || 520;
    var SNAP = opts.snap == null ? 24 : opts.snap;
    var GAP = 8;                                   /* 浮动态离边最小距离 */
    var narrow = opts.narrow || function () { return false; };
    var maxTop = opts.maxTop || function () { return 0; };

    /* ---------- 状态 ---------- */
    var st = { state: "float", side: "right", maxSide: "right",
               f: { x: 0, y: 0, w: 392, h: 600 }, dockW: (opts.dock && opts.dock.width) || 320 };

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
        var w = dockWNow();
        return { x: st.side === "right" ? b.W - w : 0, y: 0, w: w, h: b.H, mode: "docked" };
      }
      var f = st.f;
      f.w = Math.round(clamp(f.w, minW, Math.max(minW, b.W - GAP * 2)));
      f.h = Math.round(clamp(f.h, minH, Math.max(minH, b.H - GAP * 2)));
      f.x = Math.round(clamp(f.x, GAP, Math.max(GAP, b.W - f.w - GAP)));
      f.y = Math.round(clamp(f.y, GAP, Math.max(GAP, b.H - f.h - GAP)));
      return { x: f.x, y: f.y, w: f.w, h: f.h, mode: "float" };
    }

    /* ---------- 落地（含停靠态通知宿主重排） ----------
       停靠按「边」独立记账：宿主上是 data-dock-left / data-dock-right 与
       --dock-w-left / --dock-w-right。这样批注与草稿纸可以一左一右同时停靠，
       互不覆盖；同一边被另一个面板占用时，由 claimSide() 把先来的挪回浮动。 */
    var mySide = null;
    function releaseSide() {
      if (!mySide) return;
      if (host.getAttribute("data-dock-" + mySide) === "on") {
        host.removeAttribute("data-dock-" + mySide);
        host.style.removeProperty("--dock-w-" + mySide);
      }
      mySide = null;
    }
    function claimSide(side) {
      var list = host.__inkDocks || [];
      list.forEach(function (d) {
        if (d !== api && d.state().state === "docked" && d.state().side === side) d.detach();
      });
      mySide = side;
      host.__inkDocks = list;
    }
    var lastKey = "";
    /* 面板被宿主收起时（批注 data-notes=closed / 草稿纸 data-open=off，都走 visibility:hidden）
       不能再占边：停靠会在宿主上挂 data-dock-* 与 --dock-w-* 让正文让位，面板一收，
       那份让位就成了正文旁边一条「关不掉的空栏」。
       这里只放行不记账、不改 st.state —— 重新打开时停靠的边与宽度原样回来。 */
    function holdsSide() {
      var cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    }
    function paint(anim) {
      var from = el.getBoundingClientRect();
      var g = geom();
      var docking = g.mode === "docked" && holdsSide();
      if (docking) {
        if (mySide !== st.side) { releaseSide(); claimSide(st.side); }
        host.setAttribute("data-dock-" + st.side, "on");
        host.style.setProperty("--dock-w-" + st.side, g.w + "px");
        el.setAttribute("data-docked", st.side);
      } else {
        releaseSide();
        el.removeAttribute("data-docked");
      }
      el.setAttribute("data-dock-state", g.mode);
      el.dataset.max = g.mode === "max" ? "1" : "0";
      el.style.zIndex = TOPZ;
      var want = { left: g.x + "px", top: g.y + "px", width: g.w + "px", height: g.h + "px" };
      var changed = el.style.left !== want.left || el.style.top !== want.top ||
                    el.style.width !== want.width || el.style.height !== want.height;
      if (anim && changed && !reduceMotion()) {
        var hb = host.getBoundingClientRect();
        var k0 = {
          left: (from.left - hb.left) + "px", top: (from.top - hb.top) + "px",
          width: from.width + "px", height: from.height + "px"
        };
        el.style.left = want.left; el.style.top = want.top;
        el.style.width = want.width; el.style.height = want.height;
        try {
          el.animate([k0, want], { duration: ANIM, easing: "cubic-bezier(.2,.8,.3,1)" });
        } catch (e) {}
      } else {
        el.style.left = want.left; el.style.top = want.top;
        el.style.width = want.width; el.style.height = want.height;
      }
      /* 手柄上的停靠/最大化按钮状态（若宿主提供了按钮，自行订阅 onState 也行） */
      var key = g.mode + ":" + st.side;
      if (key !== lastKey) {
        lastKey = key;
        if (opts.onState) opts.onState({ state: g.mode, side: st.side, w: g.w, h: g.h });
      }
      if (opts.onLayout) opts.onLayout({ state: g.mode, side: st.side, w: g.w, h: g.h });
    }

    /* ---------- 停靠引导（吸附前预告落点，VS 的阴影预览） ---------- */
    var guide = document.createElement("div");
    guide.className = "dock-guide";
    guide.setAttribute("aria-hidden", "true");
    host.appendChild(guide);
    function showGuide(side, w) {
      guide.setAttribute("data-side", side);
      guide.style.width = (w || dockWNow()) + "px";
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
      /* 吸附判定：指针在边缘带内，或面板自身贴到边缘 */
      var side = null;
      if (!e.ctrlKey && !e.metaKey) {
        var px = e.clientX - hr.left, g = geom();
        if (px <= SNAP || g.x <= SNAP) side = "left";
        else if (px >= hr.width - SNAP || g.x + g.w >= hr.width - SNAP) side = "right";
      }
      if (side) { st.side = side; showGuide(side); } else { hideGuide(); }
    }
    function onUp(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var moved = drag.moved, ctrl = e && (e.ctrlKey || e.metaKey);
      try { drag.cap.releasePointerCapture(drag.id); } catch (err) {}
      document.body.classList.remove("dock-drag");
      var guided = guide.classList.contains("on");
      hideGuide();
      drag = null;
      if (!moved) return;                                  /* 单击交给把手自己的语义 */
      dragEndAt = Date.now();
      if (guided && !ctrl) {
        st.state = "docked"; st.maxSide = st.side; save(); paint(true);
      } else {
        st.state = "float"; save(); paint(true);
      }
    }
    handles.forEach(function (h) {
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
    });

    /* 键盘可达：方向键微移（浮动）/ 调宽（停靠）；Enter 或空格切停靠 */
    if (handle) {
      if (!handle.hasAttribute("tabindex")) handle.setAttribute("tabindex", "0");
      handle.addEventListener("keydown", function (e) {
        if (e.target !== handle) return;
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
    ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach(function (dir) {
      if (dir === "se" && grip) return;
      var bar = document.createElement("div");
      bar.className = "dock-rz";
      bar.dataset.dir = dir;
      bar.setAttribute("aria-hidden", "true");
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

    /* ---------- 对外 API ---------- */
    function apply(anim) { paint(!!anim); syncEdge(); }
    function setState(s, o) {
      if (s !== "float" && s !== "docked" && s !== "max") return;
      if (s === "docked" && o && (o.side === "left" || o.side === "right")) { st.side = o.side; st.maxSide = o.side; }
      st.state = s;
      save(); paint(true); syncEdge();
    }
    function toggleMax() {
      if (narrow()) return false;
      st.state = st.state === "max" ? (st.maxSide ? "docked" : "float") : "max";
      if (st.state === "docked") st.side = st.maxSide;
      save(); paint(true); syncEdge();
      return st.state === "max";
    }
    function toggleDock() {
      if (narrow()) return false;
      if (st.state === "docked") { st.state = "float"; }
      else { st.state = "docked"; st.side = st.maxSide || "right"; }
      save(); paint(true); syncEdge();
      return st.state === "docked";
    }
    function detach() { if (st.state === "docked") { st.state = "float"; save(); paint(true); syncEdge(); } }
    function state() { return { state: narrow() ? "max" : st.state, side: st.side, dockW: dockWNow(), f: st.f }; }
    function justDragged(ms) { return Date.now() - dragEndAt < (ms || 240); }
    function reset() { var m = load(); delete m[id]; store(m); }

    /* 宿主尺寸变化：停靠/最大化必须跟着重算；浮动只做边界夹取 */
    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { paint(false); syncEdge(); });
      ro.observe(host);
    }
    var api = { el: el, apply: apply, setState: setState, toggleMax: toggleMax, toggleDock: toggleDock,
                detach: detach, state: state, justDragged: justDragged, reset: reset,
                guideShow: showGuide, guideHide: hideGuide };
    /* 登记到宿主，供同侧互斥协调（同一宿主可停靠多个面板：一左一右） */
    (host.__inkDocks = host.__inkDocks || []).push(api);
    var _detach = api.detach;
    api.detach = function () { releaseSide(); return _detach(); };
    return api;
  }

  window.InkDock = { create: create, KEY: KEY, read: load };
})();
