/* ============================================================
   main.js · 墨读 InkRead 桌面端主进程
   —— 先起本地静态服务，再让窗口去 loadURL。
      origin 必须稳定（http://127.0.0.1:固定端口），否则每次启动端口一变，
      localStorage 就换了一套 —— 书架、笔记、记忆全"丢"。
   —— 用户自填的模型接口是跨域请求：这里只对「非本机服务」的响应补 CORS 头，
      不关 webSecurity（关掉等于把整个渲染进程的沙箱拆了）。
   ============================================================ */
"use strict";

const { app, BrowserWindow, Menu, session, shell, ipcMain, dialog, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");
const { start, ROOT } = require("../scripts/serve.js");

const PORT_CANDIDATES = [8770, 8771, 8772, 8773, 8774, 8775, 8776, 8777, 8778, 8779];
const PAPER = "#f2eee2";

/* 开发模式（--dev）：使用独立 userData。
   单实例锁按 userData 划界 —— 这样开发实例与正式安装版可以同时开着，
   互不抢锁、互不读对方的 localStorage。 */
if (process.argv.includes("--dev")) {
  try { app.setPath("userData", app.getPath("userData") + "-dev"); } catch (e) {}
}

let win = null;
let httpServer = null;
let appUrl = "";

async function bootServer() {
  for (const p of PORT_CANDIDATES) {
    try {
      const r = await start(p);
      return r;
    } catch (e) {
      if (e && e.code === "EADDRINUSE") continue;
      throw e;
    }
  }
  return start(0); /* 全被占用时退回随机端口（此情形下数据会另起一套，必须告知用户） */
}

/* localStorage 按 origin 分区，origin 里含端口 —— 换了端口就等于换了一间书房。
   不说明的话，用户看到的是一个「数据全丢」的空库，而这只是端口被占了。 */
function warnPortDrift(port) {
  try {
    dialog.showMessageBox({
      type: "warning",
      title: "墨读 InkRead · 端口占用",
      message: "本机端口 8770 已被其它程序占用，本次运行改用端口 " + port + "。",
      detail: "阅读数据按端口分开存放，所以现在打开的可能是另一份（空的）数据，你的原数据没有被删除。\n\n" +
        "处理方法：关闭占用 8770 的程序（或重启电脑）后重新打开墨读，即可回到原来的数据。\n" +
        "局域网同步地址也会随之变化。",
      buttons: ["知道了"]
    });
  } catch (e) {}
}

/* 跨域响应补 CORS：OpenAI 兼容接口大多不回 ACAO，浏览器就直接把响应丢掉。
   仅重写「不是本机服务」的响应；本机响应原样放行。 */
function patchCors(localPrefix) {
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    if (details.url.startsWith(localPrefix)) return cb({});
    const src = details.responseHeaders || {};
    const out = {};
    for (const k of Object.keys(src)) {
      const lk = k.toLowerCase();
      if (lk === "access-control-allow-origin" ||
          lk === "access-control-allow-headers" ||
          lk === "access-control-allow-methods" ||
          lk === "access-control-expose-headers") continue;
      out[k] = src[k];
    }
    out["Access-Control-Allow-Origin"] = ["*"];
    out["Access-Control-Allow-Headers"] = ["*"];
    out["Access-Control-Allow-Methods"] = ["GET, POST, PUT, PATCH, DELETE, OPTIONS"];
    out["Access-Control-Expose-Headers"] = ["*"];
    cb({ responseHeaders: out });
  });
}

/* 权限请求显式放行：Electron 未设 handler 时 geolocation 的授权行为不明确，
   而「使用当前位置」需要它（失败另有 /api/geo IP 定位兜底，这里只保证不冤枉拒绝）。 */
function patchPermissions() {
  const allowed = new Set(["geolocation", "notifications", "clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(allowed.has(permission));
  });
}

/* 自绘标题栏的窗口控制：preload 暴露的 window.inkread.win.* 全部落到这里。
   保持 contextIsolation / sandbox 不变，只走 invoke 这一条窄道。 */
function bindWindowIPC() {
  ipcMain.handle("ink:win-min", () => { if (win) win.minimize(); });
  ipcMain.handle("ink:win-max", () => {
    if (!win) return;
    if (win.isMaximized()) { win.unmaximize(); } else { win.maximize(); }
  });
  ipcMain.handle("ink:win-close", () => { if (win) win.close(); });
  ipcMain.handle("ink:win-is-max", () => !!win && win.isMaximized());
  /* 主题 → 壳层：窗口底色与 nativeTheme 跟随应用主题（页面自己管 CSS 侧的 color-scheme）。
     参数一律校验：tone 只认两个值，底色只认 #rrggbb —— 不接受任意字符串进 setBackgroundColor。 */
  ipcMain.handle("ink:win-theme", (_e, arg) => {
    const a = arg || {};
    if (a.tone === "dark" || a.tone === "light") nativeTheme.themeSource = a.tone;
    if (win && typeof a.paper === "string" && /^#[0-9a-fA-F]{6}$/.test(a.paper)) win.setBackgroundColor(a.paper);
  });
}

/* ============================================================
   v2.21 E8 · 导出管线（PDF / 打印）
   —— 只能打在 print.html 上：阅读页的 DOM 是被分页机切过的舞台，
      直接 printToPDF 实测出一张白纸（方案 §2.6）。
   —— 纸型与页边由那张纸自己的 CSS @page 决定，主进程不碰 pageSize/margins：
      §2.7 实测 margins:{marginType:"custom"} 直接抛错、landscape:true 不改 MediaBox，
      而 preferCSSPageSize:true 时纸型本来就归 CSS 说了算。
   —— 数据流：隐藏窗口载入 → 等 body[data-ready] → printToPDF 拿 Buffer →
      系统「另存为」→ Buffer 直写磁盘（不经 base64，省一遍内存拷贝）。
   ============================================================ */
const PDF_FOOT_MS = 30000;    /* 排版封顶：print.html 自己给就绪信号兜了 5s 底，这里防的是整页挂死 */
let exporting = false;        /* 一次只开一张纸：并发导出会把 CPU 打满，用户看到的是「越点越慢」 */
let printWin = null;          /* 打印预览窗（同一本书只留一扇，关掉再开也不留孤儿） */
/* 验收闸专用通道：设了 INKREAD_EXPORT_DIR，PDF 直接落进该目录、打印只开预览不弹系统面板。
   真用户永远不设它 —— 他们要的是「另存为」和打印对话框。目录来自启动环境，页面改不了。
   INKREAD_EXPORT_CANCEL=1：模拟用户在「另存为」里点了取消（排版做完、故意不落盘）。
   这两条都从启动环境读，渲染进程无论怎么改 opts 都碰不到。 */
const PROBE_DIR = String(process.env.INKREAD_EXPORT_DIR || "").trim();
const CANCEL_STUB = String(process.env.INKREAD_EXPORT_CANCEL || "").trim() === "1";

/* 出纸规格的三个键只在「调用方点了名」时才写进地址：
   print.html 按 查询参数 → 本机偏好（inkread.paper.v1）→ A4 竖版 三级取值，
   这里替它填一个默认值就等于抢了那张纸的话事权 —— 用户在纸面视图上选了 A5，
   从阅读页再点导出却被按回 A4，选择器就成了摆设。 */
const PAPER_SIZES = ["A4", "A5", "B5", "LETTER", "LEGAL"];
function printUrl(o) {
  const q = new URLSearchParams();
  q.set("doc", String((o && o.doc) || ""));
  const p = String((o && o.paper) || "").trim().toUpperCase();
  if (PAPER_SIZES.includes(p)) q.set("paper", p);
  if (o && o.land !== undefined && o.land !== null) q.set("land", o.land ? "1" : "0");
  if (o && o.chap !== undefined && o.chap !== null) q.set("chap", o.chap ? "1" : "0");
  return appUrl + "print.html?" + q.toString();
}

/* 导出的那张纸：可见＝打印预览（用户要看得见纸再决定打不打），隐藏＝出 PDF，不打扰主窗。
   可见时必须有系统边框 —— print.html 不载 app.js，自绘标题栏在那儿是不存在的。 */
function makePrintWindow(visible) {
  return new BrowserWindow({
    width: visible ? 1000 : 1180,
    height: visible ? 860 : 1500,
    show: false,
    frame: !!visible,
    autoHideMenuBar: true,
    resizable: !!visible,
    backgroundColor: "#ffffff",
    title: visible ? "纸面预览 · 墨读 InkRead" : "墨读 InkRead",
    parent: visible && win ? win : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      /* 隐藏窗口一旦被节流，rAF 与定时器都停摆 —— data-ready 永远等不到 */
      backgroundThrottling: false
    }
  });
}

/* 预览窗是「一张纸」，不是第二个应用窗口：链接一律不许把它变成浏览器，
   「返回书架」按字面执行 —— 关掉预览，回到原来那扇窗。 */
function lockToPaper(pw) {
  pw.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  pw.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith(appUrl + "print.html")) return;   /* 换纸型/换书：留在本窗，照常导航 */
    e.preventDefault();
    if (/^https?:/i.test(url)) return shell.openExternal(url);
    pw.close();
    if (win && !win.isDestroyed()) win.focus();
  });
}

/* 等 print.html 把 body[data-ready] 挂上（它自带 5 秒封顶，不会永远不放行） */
function pollReady(pw, timeoutMs) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (pw.isDestroyed()) return reject(new Error("预览窗口已关闭"));
      if (Date.now() - t0 > (timeoutMs || PDF_FOOT_MS)) return reject(new Error("排版超时"));
      pw.webContents.executeJavaScript("!!(document.body && document.body.dataset.ready)", true)
        .then((ok) => (ok ? resolve() : setTimeout(tick, 60)), () => setTimeout(tick, 120));
    };
    tick();
  });
}

/* 载入并等排版就绪：先挂监听再 loadURL，否则快文档会在挂上之前就把 did-finish-load 放掉。 */
function openPrintPage(opts, visible) {
  const pw = makePrintWindow(visible);
  const loaded = new Promise((resolve, reject) => {
    const ok = () => { settle(); resolve(); };
    const bad = (_e, code, desc, _url, isMainFrame) => { if (!isMainFrame) return; settle(); reject(new Error("页面载入失败（" + code + " " + desc + "）")); };
    const gone = () => { settle(); reject(new Error("预览窗口已关闭")); };
    function settle() {
      pw.webContents.removeListener("did-finish-load", ok);
      pw.webContents.removeListener("did-fail-load", bad);
      pw.removeListener("closed", gone);
    }
    pw.webContents.on("did-finish-load", ok);
    pw.webContents.on("did-fail-load", bad);
    pw.on("closed", gone);
  });
  pw.loadURL(printUrl(opts));
  if (visible) lockToPaper(pw);
  return loaded.then(() => pollReady(pw).then(() => pw));
}

function footerTemplate(title) {
  const t = String(title || "墨读 InkRead").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  return '<div style="font-size:7px;color:#5f5950;width:100%;text-align:center;padding:0 4mm;' +
    'font-family:system-ui,-apple-system,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
    t + ' · 第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页 · 墨读 InkRead</div>';
}

/* Windows 文件名里不能出现的字符一律换掉：书名带「/」「:」是常事，不是例外。 */
function safeFileName(s) {
  const t = String(s || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return (t || "墨读导出").slice(0, 80).replace(/[. ]+$/, "");
}

function writeErrorHint(e) {
  const c = (e && e.code) || "";
  if (c === "EPERM" || c === "EACCES" || c === "EBUSY") {
    return "已生成但写入失败：目标位置不可写（可能被其它程序占用），请换个目录再试。";
  }
  if (c === "ENAMETOOLONG") return "已生成但写入失败：所选路径太长，请换一个目录。";
  return "已生成但写入失败：" + (c || (e && e.message) || "未知原因");
}

function bindExportIPC() {
  ipcMain.handle("ink:pdf", async (_e, opts) => {
    if (exporting) return { ok: false, busy: true, error: "已有一个导出在进行，请等它结束。" };
    exporting = true;
    let pw = null;
    try {
      pw = await openPrintPage(opts, false);
      /* 纸上没有正文就先停住：空态那一块是 .no-print，printToPDF 会出一个「文件名像模像样、
         内容整页全白」的 PDF —— 用户看到的是导出成功，打开是一张白纸，比直接报错更糟。
         拒绝时把纸面视图自己写的实话带回去（正文没落库 / 本机没这本书，补救不一样）。 */
      const bare = await pw.webContents.executeJavaScript(
        "(function(){var b=document.body;if(!b||b.dataset.blank!=='1')return null;" +
        "return ((document.getElementById('blankWhy')||{}).textContent||'').trim();})()", true
      ).catch(() => null);
      if (bare !== null) {
        pw.destroy(); pw = null;
        return { ok: false, error: "这本书在本机没有正文，印出来只会是一张白纸。" + bare };
      }
      /* 标题取页面自己算出来的那一份：正文自带书名时它和书架条目名并不相同（E7），
         落盘文件名与页脚要跟着纸上印的字走，而不是跟着导出目录里的文件名走。 */
      const title = (pw.webContents.getTitle() || "").replace(/\s*·\s*墨读导出$/, "").trim() || "墨读导出";
      const pdfOpts = {
        printBackground: !!(opts && opts.bg),
        preferCSSPageSize: true,
        displayHeaderFooter: opts && opts.footer === false ? false : true,
        /* 空串不等于「没有页眉」：Chromium 把空模板当成没指定，于是把默认页眉
           （日期 + 文档标题）印在每一页顶上 —— 截图里实测到了，正文标题被重复了一遍。
           要真留白得给一个空元素。 */
        headerTemplate: "<span></span>",
        footerTemplate: footerTemplate(title),
        generateTaggedPDF: !(opts && opts.tagged === false),
        generateDocumentOutline: !(opts && opts.outline === false)
      };
      /* 只印「其中几页」（"1-2,5"）由调用方点名才有；不点名 = 全本，不给默认值 */
      if (opts && opts.ranges) pdfOpts.pageRanges = String(opts.ranges);
      const buf = await pw.webContents.printToPDF(pdfOpts);
      pw.destroy(); pw = null;
      /* 探针通道②：走到这一步排版已经做完，取消只意味着「不落盘」——
         文件一个都不能有，但仍如实回 canceled（阅读页据此静默收场，不报错）。 */
      if (CANCEL_STUB) return { ok: false, canceled: true };
      if (PROBE_DIR) {
        const p = path.join(PROBE_DIR, safeFileName(title) + ".pdf");
        try { fs.writeFileSync(p, buf); } catch (e) { return { ok: false, error: writeErrorHint(e) }; }
        return { ok: true, path: p, bytes: buf.length, title: title, probe: true };
      }
      const r = await dialog.showSaveDialog(win || undefined, {
        title: "导出 PDF",
        defaultPath: safeFileName(title) + ".pdf",
        filters: [{ name: "PDF 文档", extensions: ["pdf"] }]
      });
      if (r.canceled || !r.filePath) {
        /* 路径超长时 filePath 会返回空串（Electron #10299）：不能当成用户取消，得说清楚 */
        if (!r.canceled) return { ok: false, error: "保存路径太长，选了个空路径。请换一个目录后再导出。" };
        return { ok: false, canceled: true };
      }
      try { fs.writeFileSync(r.filePath, buf); } catch (e) { return { ok: false, error: writeErrorHint(e) }; }
      return { ok: true, path: r.filePath, bytes: buf.length, title: title };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    } finally {
      if (pw && !pw.isDestroyed()) pw.destroy();
      exporting = false;
    }
  });

  /* 打印：露一张真纸（可见预览窗）再开系统面板。隐藏窗口里弹系统对话框，
     对话框没有能聚焦的宿主，用户只会看到「点了没反应」。 */
  ipcMain.handle("ink:print", async (_e, opts) => {
    let pw = null;
    try {
      /* 只留一扇预览窗：再点一次「打印」是换纸型/换书，回到那张纸重载，而不是叠出第二扇 */
      pw = printWin && !printWin.isDestroyed() ? printWin : null;
      if (pw) {
        /* 先把就绪旗摘掉：不然轮询会把「上一页还没刷」读成「这页已经排好」 */
        await pw.webContents.executeJavaScript("document.body && (document.body.dataset.ready='')", true).catch(() => {});
        pw.loadURL(printUrl(opts));
        await pollReady(pw);
      } else {
        pw = await openPrintPage(opts, true);
        printWin = pw;
        pw.on("closed", () => { if (printWin === pw) printWin = null; });
      }
      pw.show(); pw.focus();
      /* 探针：验收闸只看预览窗开没开（CDP 里能数到那张纸），不去碰系统打印面板 */
      if (PROBE_DIR) return { ok: true, preview: true };
      const r = await new Promise((res) => {
        let done = false;
        const once = (success, failureReason) => { if (done) return; done = true; res({ success, failureReason }); };
        pw.once("closed", () => once(false, "cancelled"));
        try {
          pw.webContents.print({
            silent: false,
            printBackground: !!(opts && opts.bg),
            margins: { marginType: "none" }
          }, once);
        } catch (e) { once(false, (e && e.message) || String(e)); }
      });
      if (r.success) { try { pw.close(); } catch (e) {} return { ok: true }; }
      if (r.failureReason === "cancelled" || !r.failureReason) return { ok: false, canceled: true };
      return { ok: false, error: "打印失败：" + r.failureReason };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  });

  ipcMain.handle("ink:printers", async () => {
    const wc = (win && !win.isDestroyed() && win.webContents) || null;
    if (!wc) return [];
    try {
      const list = await wc.getPrintersAsync();
      return (list || []).map((p) => ({
        name: p.name, displayName: p.displayName || p.name,
        status: p.status, isDefault: !!p.isDefault
      }));
    } catch (e) { return []; }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 420,
    minHeight: 560,
    /* 一体化无边框：系统标题栏与白边全部去掉，标题栏由页面自绘（可拖拽区） */
    frame: false,
    backgroundColor: PAPER,
    autoHideMenuBar: true,
    show: false,
    title: "墨读 InkRead",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  win.once("ready-to-show", () => win.show());

  /* 最大化状态同步给自绘标题栏（切换 □ / 还原图标） */
  const sendMax = () => { try { win.webContents.send("ink:win-max-changed", win.isMaximized()); } catch (e) {} };
  win.on("maximize", sendMax);
  win.on("unmaximize", sendMax);

  /* 正文里的外链一律交给系统浏览器，别把应用窗口变成浏览器 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(appUrl)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(appUrl);
  win.on("closed", () => {
    win = null;
    /* 主窗关了，纸面预览不能把应用留成一扇「找不到主界面」的空壳 */
    if (printWin && !printWin.isDestroyed()) { try { printWin.close(); } catch (e) {} }
  });
}

/* 极简菜单：只留「视图」里的全屏/缩放/重载，其余交给界面自身 */
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新载入" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "全屏" }
      ]
    }
  ]));
}

app.whenReady().then(async () => {
  /* 打包后 app.asar 只读，TTS 缓存必须落到 userData 下的可写目录，
     否则合成一律失败 → 全部退回本机 SAPI 机械音。 */
  try { process.env.INKREAD_CACHE = path.join(app.getPath("userData"), "tts-cache"); } catch (e) {}
  /* 双端同步的数据快照（/api/store）同样必须可写：指向 userData */
  try { process.env.INKREAD_SYNC = path.join(app.getPath("userData"), "sync-store.json"); } catch (e) {}
  /* 书仓：EPUB 正文与插图落 userData/ebooks —— 一本几百 MB 的书不可能塞进 localStorage，
     也不该塞（4MB 快照墙），手机连同一台服务时靠它读到同一份正文。 */
  try { process.env.INKREAD_EBOOKS = path.join(app.getPath("userData"), "ebooks"); } catch (e) {}
  const r = await bootServer();
  httpServer = r.server;
  appUrl = r.url;  patchCors(r.url.replace(/\/$/, ""));
  patchPermissions();
  buildMenu();
  bindWindowIPC();
  bindExportIPC();
  createWindow();
  if (r.port !== PORT_CANDIDATES[0]) warnPortDrift(r.port);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((e) => {
  console.error("启动失败：" + e.message);
  /* 双击图标后毫无反应是最难排查的故障：至少要留下一句能看见的话 */
  try { dialog.showErrorBox("墨读 InkRead 启动失败", String((e && e.stack) || e)); } catch (err) {}
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (httpServer) { try { httpServer.close(); } catch (e) {} }
});

/* 单实例：第二次启动就把已有窗口提到前面 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

module.exports = { ROOT };
