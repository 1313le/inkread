/* ============================================================
   preload.js · 渲染进程 ↔ 主进程 的唯一通道
   —— contextIsolation 保持开启，页面拿到的只是这一个小 API：
      window.inkread.desktop   是否运行在桌面 App 内
      window.inkread.win.*     最小化 / 最大化切换 / 关闭 / 最大化状态
      window.inkread.paper.*   导出 PDF / 打印 / 打印机清单
   —— 自绘标题栏（一体化外壳）的窗口控制全部走这里。
   ============================================================ */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("inkread", {
  desktop: true,
  platform: process.platform,
  paper: {
    /* 参数只带纸面视图认得的字段，主进程不接收任何路径或 HTML */
    toPdf(opts) { return ipcRenderer.invoke("ink:pdf", opts || {}); },
    print(opts) { return ipcRenderer.invoke("ink:print", opts || {}); },
    printers() { return ipcRenderer.invoke("ink:printers"); }
  },
  win: {
    minimize() { ipcRenderer.invoke("ink:win-min"); },
    toggleMaximize() { ipcRenderer.invoke("ink:win-max"); },
    close() { ipcRenderer.invoke("ink:win-close"); },
    isMaximized() { return ipcRenderer.invoke("ink:win-is-max"); },
    /* 主进程最大化状态变化时回调；返回解绑函数 */
    onMaximizeChange(cb) {
      const handler = (_e, v) => cb(v);
      ipcRenderer.on("ink:win-max-changed", handler);
      return () => ipcRenderer.removeListener("ink:win-max-changed", handler);
    }
  }
});
