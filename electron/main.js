/* ============================================================
   main.js · 墨读 InkRead 桌面端主进程
   —— 先起本地静态服务，再让窗口去 loadURL。
      origin 必须稳定（http://127.0.0.1:固定端口），否则每次启动端口一变，
      localStorage 就换了一套 —— 书架、笔记、记忆全"丢"。
   —— 用户自填的模型接口是跨域请求：这里只对「非本机服务」的响应补 CORS 头，
      不关 webSecurity（关掉等于把整个渲染进程的沙箱拆了）。
   ============================================================ */
"use strict";

const { app, BrowserWindow, Menu, session, shell, ipcMain, dialog } = require("electron");
const path = require("path");
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
  win.on("closed", () => { win = null; });
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
  const r = await bootServer();
  httpServer = r.server;
  appUrl = r.url;  patchCors(r.url.replace(/\/$/, ""));
  patchPermissions();
  buildMenu();
  bindWindowIPC();
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
