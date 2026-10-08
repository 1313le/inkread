/* ============================================================
   app.js · 墨读共享运行时
   图标库（Lucide 内联）/ 本地持久化 / Toast / 墨屏刷新 / 涟漪 / 主题
   ============================================================ */

/* ---------- 图标：Lucide 路径内联，离线可用，统一 1.8 描边 ---------- */
/* 版本号：本机数据面板页脚与备份文件署名共用 */
window.InkVersion = "2.18.0";

window.ICONS = {
  library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  "book-open": '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  "book-marked": '<path d="M10 2v8l3-3 3 3V2"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  "notebook-pen": '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>',
  "list-checks": '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  sparkle: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  "wifi-off": '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M13.83 10.17A10 10 0 0 1 19 12.859"/><path d="M2 8.82a15 15 0 0 1 4.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="m2 2 20 20"/>',
  battery: '<rect width="16" height="10" x="2" y="7" rx="2" ry="2"/><line x1="22" x2="22" y1="11" y2="13"/><line x1="6" x2="6" y1="11" y2="13"/><line x1="10" x2="10" y1="11" y2="13"/>',
  "battery-charging": '<path d="M15 7h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><path d="M6 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1"/><path d="m11 7-3 5h4l-3 5"/><line x1="22" x2="22" y1="11" y2="13"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  "circle-check": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  circle: '<circle cx="12" cy="12" r="10"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  "calendar-days": '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  "bookmark-check": '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/><path d="m9 10 2 2 4-4"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  "refresh-cw": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  "rotate-ccw": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4Z"/>',
  eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  award: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  stamp: '<path d="M5 22h14"/><path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z"/><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"/>',
  "alert-triangle": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  brain: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  type: '<path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/>',
  "columns-2": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>',
  "panel-right": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
  "volume-2": '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  "audio-lines": '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
  mic: '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  "file-input": '<path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M2 15h10"/><path d="m9 18 3-3-3-3"/>',
  "trash-2": '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  "undo-2": '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  "redo-2": '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
  bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
  italic: '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
  heading: '<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  "list-ordered": '<path d="M10 12h11"/><path d="M10 18h11"/><path d="M10 6h11"/><path d="M4 10h2"/><path d="M4 6h1v4"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  sigma: '<path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  feather: '<path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/>',
  "pen-line": '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
  "graduation-cap": '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  "maximize-2": '<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>',
  "share-2": '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  "trending-up": '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  "sliders-horizontal": '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  "grid-2x2": '<path d="M12 3v18"/><path d="M3 12h18"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  "wand-2": '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  "scan-text": '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8h8"/><path d="M7 12h10"/><path d="M7 16h6"/>',
  "loader-circle": '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  "grip-vertical": '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  "chevron-up": '<path d="m18 15-6-6-6 6"/>',
  "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  "arrow-down": '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  "arrow-up-right": '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  "arrow-left-right": '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  "panel-left-close": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
  focus: '<circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
  "link-2": '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
  network: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  "mouse-pointer-2": '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>',
  "zoom-in": '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
  "zoom-out": '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>',
  "corner-down-left": '<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
  "indent-increase": '<polyline points="3 8 7 12 3 16"/><line x1="21" x2="11" y1="12" y2="12"/><line x1="21" x2="11" y1="6" y2="6"/><line x1="21" x2="11" y1="18" y2="18"/>',
  "indent-decrease": '<polyline points="7 8 3 12 7 16"/><line x1="21" x2="11" y1="12" y2="12"/><line x1="21" x2="11" y1="6" y2="6"/><line x1="21" x2="11" y1="18" y2="18"/>',
  "circle-dot": '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  "minus-circle": '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
  "text-cursor": '<path d="M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6"/><path d="M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7"/><path d="M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1"/><path d="M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1"/><path d="M9 6v12"/>',
  "list-tree": '<path d="M21 12h-8"/><path d="M21 6h-8"/><path d="M21 18h-8"/><path d="M3 10v4c0 1.1.9 2 2 2h3"/><path d="M3 6h1"/><path d="M3 18h1"/>',
  "heading-1": '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="m17 12 3-2v8"/>',
  "heading-2": '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/>',
  "heading-3": '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2"/><path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
  "rotate-ccw": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  "clipboard-check": '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  ellipsis: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  "panel-bottom": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 15h18"/>',
  "text-quote": '<path d="M17 6H3"/><path d="M21 12H8"/><path d="M21 18H8"/><path d="M3 12v6"/>',
  "square-pen": '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
  "book-copy": '<path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M9 3h10a2 2 0 0 1 2 2v10"/>',
  "move-horizontal": '<path d="m18 8 4 4-4 4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/>',
  /* v14 文档修改：锁 / 开锁（阅读态上锁，防误触改动正文） */
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  "lock-open": '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  /* v15 听书面板：播放 / 暂停 / 跳段 / 定时（Lucide 路径，1.8 描边同库） */
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  "skip-back": '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
  "skip-forward": '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
  timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
  /* v2.12 笔记自由文本搜索：放大镜 / 空结果（Lucide 同库路径） */
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  "search-x": '<path d="m13.5 8.5-5 5"/><path d="m8.5 8.5 5 5"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  /* v2.14 ≤600 底栏「更多」 */
  menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>'
};

window.icon = function (name, size, cls) {
  size = size || 18;
  return '<svg class="ic' + (cls ? " " + cls : "") + '" width="' + size + '" height="' + size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (window.ICONS[name] || "") + "</svg>";
};

/* ---------- 本地持久化 ---------- */
window.InkStore = {
  K_CK: "inkread.checkins.v1",
  K_NOTES: "inkread.notes.v1",
  K_READ: "inkread.read.v1",
  K_THEME: "inkread.theme",
  K_PROG: "inkread.progress.v1",
  K_SHELF: "inkread.shelf.v1",
  K_DOCEDITS: "inkread.docs.edit.v1",
  /* 清空哨兵：故意不带「inkread.」前缀 —— 不进任何 keys() 统计/导出/清空清单，
     清空时留下来，恰好表达「用户主动清过，演示数据别再播」（v2.11 B2） */
  K_CLEARED: "inkread-cleared.v1",

  _get(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } },
  _set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  isCleared() { try { return localStorage.getItem(this.K_CLEARED) === "1"; } catch (e) { return false; } },

  /* ---------- 书架：用户导入的书籍 / 论文 / 漫画 / 计划都可编辑 ---------- */
  /* 首次读取把 mock 快照写库，此后一切增删改都落在同一份数据上 */
  getShelf() {
    var s = this._get(this.K_SHELF, null);
    /* v2.11 B2：用户主动清空后（哨兵在），键缺失也不再回播演示书架 */
    if (s === null && !this.isCleared()) { s = DB.shelf.map(function (d) { return Object.assign({}, d); }); this._set(this.K_SHELF, s); }
    return s === null ? [] : s;
  },
  setShelf(list) { this._set(this.K_SHELF, list); return list; },
  getDoc(id) { return this.getShelf().find(function (d) { return d.id === id; }) || null; },
  updateDoc(id, patch) {
    var l = this.getShelf(), hit = null;
    l = l.map(function (d) { if (d.id !== id) return d; hit = Object.assign({}, d, patch); return hit; });
    this.setShelf(l);
    return hit;
  },
  removeDocs(ids) {
    var set = {};
    ids.forEach(function (i) { set[i] = 1; });
    return this.setShelf(this.getShelf().filter(function (d) { return !set[d.id]; }));
  },
  moveDocs(ids, group) {
    var set = {};
    ids.forEach(function (i) { set[i] = 1; });
    return this.setShelf(this.getShelf().map(function (d) {
      return set[d.id] ? Object.assign({}, d, { group: group }) : d;
    }));
  },
  /* 分组视图：按出现顺序给出组名与计数 */
  shelfGroups() {
    var order = [], count = {};
    this.getShelf().forEach(function (d) {
      var g = d.group || "未分组";
      if (!count[g]) { count[g] = 0; order.push(g); }
      count[g]++;
    });
    return order.map(function (g) { return { name: g, n: count[g] }; });
  },
  resetShelf() { this._set(this.K_SHELF, null); return this.getShelf(); },

  getCheckins() { return this._get(this.K_CK, {}); },
  setCheckin(id, time) { var c = this.getCheckins(); c[id] = time; this._set(this.K_CK, c); },
  removeCheckin(id) { var c = this.getCheckins(); delete c[id]; this._set(this.K_CK, c); },

  getNotes() {
    /* v2.11 B3：批注/笔记 = 纯用户数据，不做演示播种 ——
       QA 口径：全新数据打开文档时批注面板必须为空；首条标注入库不得夹带演示批注。
       键缺失即空表（清空哨兵只管书架与主脑信号的演示播种）。 */
    var n = this._get(this.K_NOTES, null);
    return n === null ? [] : n;
  },
  setNotes(list) { this._set(this.K_NOTES, list); },
  /* 已存储的笔记底表（null → 空表）—— 写路径专用：演示列表只读展示，
     绝不因某一次写操作把整份演示列表带进存储（v2.11 B3） */
  storedNotes() { var n = this._get(this.K_NOTES, null); return n === null ? [] : n.slice(); },
  getNote(id) { return this.getNotes().find(function (n) { return n.id === id; }) || null; },
  /* 按 id 覆盖或插入一条笔记，返回该条 */
  upsertNote(note) {
    var list = this.storedNotes();
    var i = -1;
    for (var k = 0; k < list.length; k++) if (list[k].id === note.id) { i = k; break; }
    if (i >= 0) list[i] = Object.assign({}, list[i], note);
    else list.unshift(note);
    this.setNotes(list);
    return note;
  },

  getRead() {
    var d = {
      /* 主题 */
      theme: "paper", themeMode: "manual", dayTheme: "paper", nightTheme: "night",
      /* 定时切换：sun=按日出日落（本机时间+经纬度），fixed=按钟点 */
      schedMode: "sun", dayAt: 7, nightAt: 19, lat: 39.9042, lon: 116.4074,
      /* 排版 */
      font: "serif", fs: 17, lh: 2, wt: 400, ls: 0.012, para: 0.72, indent: 0, align: "left",
      fw: 760, twoCol: false, auto: true,
      /* 显示 */
      marks: true, learn: true, fx: true, reduce: false, grain: true, prog: "page",
      /* 翻页动效：curl 卷页 / slide 平移 / fade 淡入 / cover 覆盖 / none 直切 */
      flip: "curl"
    };
    var r = this._get(this.K_READ, null);
    return r ? Object.assign(d, r) : d;
  },
  setRead(patch) { var r = this.getRead(); Object.assign(r, patch); this._set(this.K_READ, r); return r; },

  getProgress() { return this._get(this.K_PROG, {}); },
  setProgress(docId, pct) { var p = this.getProgress(); p[docId] = Math.max(p[docId] || 0, pct); this._set(this.K_PROG, p); },

  /* ---------- 文档修改（v14）：正文块的文字覆盖，按 文档id → {块序号: 新文字} 存 ----------
     只存「被改过的块」，未改的块仍走 mock 原文；故「恢复原文」= 删掉该文档这一条即可。 */
  getDocEdits(docId) { return this._get(this.K_DOCEDITS, {})[docId] || {}; },
  setDocEdit(docId, bi, text) {
    var all = this._get(this.K_DOCEDITS, {});
    var doc = all[docId] || {};
    doc[bi] = text;
    all[docId] = doc;
    this._set(this.K_DOCEDITS, all);
    return doc;
  },
  /* 整表覆盖：改回原文时要「删掉某个块」，单条 setter 做不到，故留一个批量写入口 */
  setDocEdits(docId, doc) {
    var all = this._get(this.K_DOCEDITS, {});
    if (doc && Object.keys(doc).length) all[docId] = doc;
    else delete all[docId];
    this._set(this.K_DOCEDITS, all);
    return doc || {};
  },
  clearDocEdits(docId) {
    var all = this._get(this.K_DOCEDITS, {});
    delete all[docId];
    this._set(this.K_DOCEDITS, all);
  },
  hasDocEdits(docId) { return Object.keys(this.getDocEdits(docId)).length > 0; }
};

/* ---------- 物理反馈：墨屏刷新 / 涟漪 ---------- */
window.InkFX = {
  reduced: function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; },

  /* 墨屏刷新：整屏反显一闪，模拟电子墨水重绘 */
  flash: function () {
    if (this.reduced()) return;
    var r = InkStore.getRead();
    if (!r.fx) return;
    var s = document.getElementById("screen");
    if (!s) return;
    var el = document.createElement("div");
    el.className = "eink-flash";
    s.appendChild(el);
    setTimeout(function () { el.remove(); }, 340);
  },

  /* 墨点涟漪 */
  ripple: function (el, ev) {
    if (this.reduced() || !el) return;
    var rect = el.getBoundingClientRect();
    var x = (ev && ev.clientX ? ev.clientX - rect.left : rect.width / 2);
    var y = (ev && ev.clientY ? ev.clientY - rect.top : rect.height / 2);
    var sp = document.createElement("span");
    sp.className = "ink-ripple";
    var size = Math.max(rect.width, rect.height) * 1.5;
    sp.style.width = sp.style.height = size + "px";
    sp.style.left = (x - size / 2) + "px";
    sp.style.top = (y - size / 2) + "px";
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.appendChild(sp);
    setTimeout(function () { sp.remove(); }, 620);
  }
};

/* ---------- Toast ---------- */
/* v2.11：支持第三参 action（函数）—— 渲染「撤销」按钮，时长取 MD3 Snackbar 上限 10s，
   给用户留足反应时间；点击即执行回调并收起。 */
window.toast = function (msg, iconName, action) {
  var root = document.getElementById("toastRoot");
  if (!root) return;
  var el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = icon(iconName || "circle-check", 16) + "<span>" + msg + "</span>";
  var timer = 0;
  function out() { el.classList.add("out"); setTimeout(function () { el.remove(); }, 420); }
  if (typeof action === "function") {
    var b = document.createElement("button");
    b.type = "button"; b.className = "toast-act"; b.textContent = "撤销";
    b.addEventListener("click", function () {
      clearTimeout(timer);
      try { action(); } catch (e) {}
      out();
    });
    el.appendChild(b);
  }
  root.appendChild(el);
  timer = setTimeout(out, typeof action === "function" ? 10000 : 2400);
};

/* 读当前主题的 token 值（画布 / SVG 里要用真实色，不能用 var()） */
window.cssVar = function (name, el) {
  return getComputedStyle(el || document.documentElement).getPropertyValue(name).trim();
};

/* 导出预览：非模态浮卡，点任意处或 Esc 收起（与任务抽屉同一「不打断」原则） */
window.preview = function (title, text) {
  var el = document.getElementById("inkPreview");
  if (el) el.remove();
  el = document.createElement("div");
  el.className = "ink-preview";
  el.id = "inkPreview";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", title || "预览");
  el.innerHTML = '<header><b>' + (title || "预览") + '</b>' +
    '<button class="pv-x" aria-label="收起">' + icon("x", 14) + "</button></header>" +
    "<pre>" + esc(text || "") + "</pre>";
  document.body.appendChild(el);
  function close() {
    el.remove();
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("click", onOut, true);
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  function onOut(e) { if (!el.contains(e.target)) close(); }
  el.querySelector(".pv-x").addEventListener("click", close);
  setTimeout(function () {
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onOut, true);
  }, 0);
};

/* ---------- 通用工具 ---------- */
window.qs = function (s, r) { return (r || document).querySelector(s); };
window.qsa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
window.esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
window.byId = function (id) {
  var list = window.InkStore && InkStore.getShelf ? InkStore.getShelf() : DB.shelf;
  return list.find(function (d) { return d.id === id; }) || list[0];
};
window.shelfList = function () { return window.InkStore && InkStore.getShelf ? InkStore.getShelf() : DB.shelf; };

/* ---------- 封面（v16）----------
   六种「书籍」封面排布 + 读者自传的图片封面。规矩不变：
   平涂底、零新增色值（底色与墨色都取自每本书自己的 tone）、不用装饰性渐变。
   纹样与框线一律 currentColor，所以换主题、换强度时封面自动同源。 */
window.COVER_MOTIF = {
  seal: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><circle cx="50" cy="50" r="31"/><circle cx="50" cy="50" r="21"/><path d="M50 19v62M19 50h62"/></svg>',
  grid: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2"><path d="M0 25h100M0 50h100M0 75h100M25 0v100M50 0v100M75 0v100"/></svg>',
  mountain: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><path d="M0 78 L30 34 L50 58 L70 26 L100 78Z"/><path d="M0 88h100"/></svg>',
  wave: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><path d="M0 40c15-12 30-12 45 0s30 12 45 0"/><path d="M0 58c15-12 30-12 45 0s30 12 45 0"/><path d="M0 76c15-12 30-12 45 0s30 12 45 0"/></svg>'
};
window.COVER_KIND = { book: "书籍", paper: "论文", plan: "计划", comic: "漫画" };
/* 类别图标：继续阅读卡、书架角标、编辑预览共用一套 —— 一眼分清手里这本是书、论文、计划还是漫画。
   图标名都取自 ICONS，不新增图形，换主题时随 currentColor 同源。 */
window.COVER_ICON = { book: "book", paper: "graduation-cap", plan: "list-checks", comic: "image" };
window.typeIcon = function (t) { return window.COVER_ICON[t] || "book"; };

/* 封面样式表。id 即 data-cover 的值，排布全在 styles.css 里，这里只声明语义。 */
window.COVERS = [
  { id: "spine", name: "书脊", note: "左侧压深书脊，题名靠下 —— 默认" },
  { id: "frame", name: "印刷框", note: "双线内框，题名居中，像旧书扉页" },
  { id: "band", name: "题签", note: "上端一道题签条，古籍装帧的样子" },
  { id: "grid", name: "印谱", note: "细格铺底，稿纸与印谱的质感" },
  { id: "vertical", name: "竖排", note: "题名竖排右起，诗文集的路子" },
  { id: "plain", name: "素面", note: "只留题名与作者，最安静的一种" }
];
window.coverById = function (id) {
  return window.COVERS.filter(function (c) { return c.id === id; })[0] || window.COVERS[0];
};

/* 默认封面样式：存 inkread.covers.v1，供「未单独指定」的书共用 */
window.coverDefault = function () {
  try {
    var v = localStorage.getItem("inkread.covers.v1");
    if (v && window.coverById(v)) return v;
  } catch (e) {}
  return "spine";
};
window.setCoverDefault = function (id) {
  if (!window.coverById(id)) return window.coverDefault();
  try { localStorage.setItem("inkread.covers.v1", id); } catch (e) {}
  return id;
};
/* 一本书的封面样式：自己指定过就用自己的，否则跟默认 */
window.coverOf = function (doc) {
  return (doc && doc.cover) || window.coverDefault();
};

/* 平涂封面底色 + 墨色文字；传了自传图片则叠在底色之上（无渐变） */
window.coverStyle = function (doc) {
  var img = doc && doc.coverImg;
  /* v2.11 B1：旧数据/导入数据可能缺 tone —— 兜底回退纸底墨字，书架不再崩 */
  var t = (doc && doc.tone) || [];
  return "background-color:" + (t[0] || "#efe7d6") + ";color:" + (t[1] || "#2b2823") +
    (img ? ';background-image:url("' + img + '");background-size:cover;background-position:center' : "");
};
/* 封面的样式与状态挂在属性上，CSS 据此换排布；图片封面走 data-img 另作处理 */
window.coverAttrs = function (doc) {
  return ' data-cover="' + window.coverOf(doc) + '"' + (doc && doc.coverImg ? ' data-img="on"' : "");
};
/* 封面内里：语义固定（纹样 / 类别 / 题名 / 作者 / 徽标 / 进度），排布交给 CSS。
   书架墙、继续阅读卡、编辑预览、封面样式样张四处共用同一份 —— 免得各写一份走样。 */
window.coverInner = function (doc, opts) {
  var o = opts || {};
  var p = Math.max(0, Math.min(100, Number(o.pct) || 0));
  return '<div class="cover-motif">' + (window.COVER_MOTIF[doc.motif] || window.COVER_MOTIF.grid) + "</div>" +
    '<div class="cover-kind">' + (window.COVER_KIND[doc.type] || "书籍") + "</div>" +
    '<div class="cover-title">' + esc(doc.title) + "</div>" +
    '<div class="cover-author">' + esc(doc.author) + "</div>" +
    (o.badge ? '<div class="cover-badge' + (p >= 100 ? " reading done" : p > 0 ? " reading" : "") + '">' + esc(o.badge) + "</div>" : "") +
    (o.progress === false ? "" : '<div class="cover-progress"><i style="width:' + p + '%"></i></div>');
};
/* 把读者选的图片压到封面够用的尺寸再存 —— 原图动辄几 MB，塞进 localStorage 会撑爆配额。
   1365×2048 的封面在 3:4.3 比例下够清晰，且 JPEG 质量 .82 一般落在 150–400KB。 */
window.coverImageFromFile = function (file) {
  return new Promise(function (resolve, reject) {
    if (!file || !/^image\//.test(file.type)) { reject(new Error("请选择图片文件")); return; }
    var fr = new FileReader();
    fr.onerror = function () { reject(new Error("读取失败")); };
    fr.onload = function () {
      var img = new Image();
      img.onerror = function () { reject(new Error("这不是一张能解码的图片")); };
      img.onload = function () {
        var W = 1365, H = 2048;
        var cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        var ctx = cv.getContext("2d");
        /* 居中裁切填满（cover），不留白边、不变形 */
        var s = Math.max(W / img.width, H / img.height);
        var dw = img.width * s, dh = img.height * s;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        try { resolve(cv.toDataURL("image/jpeg", 0.82)); }
        catch (e) { reject(new Error("图片无法保存（可能是跨域图片）")); }
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
};
window.uid = function (p) { return (p || "x") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
/* 笔记形态标签 */
window.NTYPE_LABEL = { outline: "文字大纲", mindmap: "思维导图", md: "Markdown · LaTeX" };
/* 三类笔记：缺省 ntype 的老数据按 md 处理 */
window.nType = function (n) { return (n && n.ntype) || "md"; };
/* 深链 */
window.noteLink = function (id) { return "notes.html?note=" + encodeURIComponent(id); };
window.srcLink = function (docId, noteId) { return "reader.html?doc=" + encodeURIComponent(docId) + "&note=" + encodeURIComponent(noteId); };

/* ---------- 启动 ---------- */
document.addEventListener("DOMContentLoaded", function () {
  var page = document.body.dataset.page;
  qsa(".nav-link[data-nav]").forEach(function (a) {
    if (a.dataset.nav === page) a.classList.add("active");
  });

  /* （v2.14）侧栏设置入口已撤：外观钮唯一入口在顶栏 */

  /* 开场动画：CSS 自行播完后移除节点，避免长期占用合成层。
     已在设置里开启「减少动效」或系统偏好时直接跳过。
     播过即记 sessionStorage 会话标记：同会话内整页跳转/重载不再重播墨印
     （新开窗口/新会话无标记，冷启动仪式照常），脚本于各页 <head> 首帧前读取。 */
  var boot = document.getElementById("boot");
  try { sessionStorage.setItem("inkread.boot.v1", "1"); } catch (e) {}
  if (boot) {
    var drop = function () { if (boot && boot.parentNode) boot.remove(); };
    var reduced = document.documentElement.dataset.reduce === "on" ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (reduced) {
      drop();
    } else {
      boot.addEventListener("animationend", function (e) { if (e.target === boot) drop(); });
      setTimeout(drop, 1500);
    }
  }

  /* v2.17 · 换页转场「落墨」：新页首帧已带着纸与印（<head> 内联脚本挂的 html.nav-in），
     动画跑完就把类摘掉，别让两个 fixed 伪元素长期占着合成层。 */
  if (document.documentElement.classList.contains("nav-in")) {
    setTimeout(function () { document.documentElement.classList.remove("nav-in"); }, 420);
  }

  /* v2.17 · 落墨转场的「保底揭开」：遮幕动画是 fill:both，跑完会永久停在满遮上 ——
     正常导航时新页紧接着提交、旧页被替换，看不见；异常时（导航没发生、目标页迟迟不提交、
     从 bfcache 按后退回来脚本不再跑）就是一屏下不去的黑。两处退路都只挂一次，
     不随点击累积监听。 */
  var liftTimer = 0;
  function liftVeil() {
    clearTimeout(liftTimer);
    document.documentElement.classList.remove("nav-out");
  }
  function scheduleLift() {
    clearTimeout(liftTimer);
    liftTimer = setTimeout(liftVeil, 1600);
  }
  window.addEventListener("pageshow", function (ev) { if (ev.persisted) liftVeil(); });

  /* v2.17 · 侧栏导航接管（详见 styles.css「落墨」段）：
     ① 点的就是当前页 → 不跳转，只滚回顶部。这既符合 iOS/Mac 标签栏的既定约定，
        也从根上消灭了「同一个按钮反复点、动画反复播」——不导航，自然没有动画可播。
     ② 换页 → 先落印（140ms）再导航，并给新页留一次性标记让它首帧接住。
     ③ 减少动效 / 修饰键（新开、拖拽）→ 一律放行给浏览器原生行为。 */
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest(".nav-link[data-nav]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (!href || /^(https?:|mailto:|javascript:)/i.test(href)) return;
    var target = href.split(/[?#]/)[0];
    var here = (location.pathname.split("/").pop() || "index.html");
    var reduced = document.documentElement.dataset.reduce === "on" ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    if (target === here) {
      e.preventDefault();
      var sc = document.querySelector(".app-content") || document.scrollingElement;
      if (sc && sc.scrollTo) sc.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      return;
    }
    if (reduced) return;
    e.preventDefault();
    try { sessionStorage.setItem("inkread.nav.v1", "1"); } catch (err) {}
    document.documentElement.classList.add("nav-out");
    /* navVeilIn 用了 both —— 动画跑完 veil 会一直停在 opacity:1，这是对的
       （新页没提交前就该被纸盖住），但它同时也是「长时间黑屏」的唯一来源：
       新页解析慢、或导航根本没发生（被别的监听吃掉），这一屏就下不去。
       兜底见文件末尾的 liftVeil()：超时 + pageshow(persisted) 两条退路。 */
    scheduleLift();
    /* 动画 140ms，导航比它稍晚起步，免得半遮面就切走 */
    setTimeout(function () { location.href = href; }, 180);
  });

  /* v2.7（F）：日期全部本机时区生成，且每分钟自检跨天 —— 不再只在加载时写一次 */
  InkDate.watch();

  /* 顶栏「外观」入口由 theme.js 统一接管（[data-appearance]） */

  /* 涟漪：按钮 / 导航 / 卡片统一响应 */
  document.addEventListener("pointerdown", function (e) {
    var t = e.target.closest(".btn, .tool-btn, .nav-link, .chip-btn, .ptab, .m-check, .seg-btn");
    if (t) InkFX.ripple(t, e);
  });
});

/* ============================================================
   v2.7 · 展示侧（B 展示 / C 火焰演进与里程碑激励 / E 危险操作 / F 时间一致）
   —— 与统计引擎（api.js / reader.html）的接口约定：
      · 存储 inkread.stats.v1 = { days:{"YYYY-MM-DD":{sec,words,checks}}, total:{sec,words}, updatedAt }
        （时间键 = 本机时区，时长以秒计）；
      · 里程碑事件 ink:milestone（detail: {hit, level, days, round, isAnniversary}）；
      · 贺词 Brain.cheer({days,level,round,isAnniversary}) → Promise<string>；
      · inkread.milestones.v1 由引擎记账，这里只读不写。
   —— 引擎的汇总 API（statsRange / statsStreak）就绪则优先采用，未就绪、抛错、形状不对
      一律回落「页内直读 localStorage 自算」——展示不依赖引擎进度，两条路径同口径。
   ============================================================ */

/* ---------- 统计口径（与引擎同源：周一起算周；月 / 年按本机日期；累计取 total） ---------- */
window.InkStats = (function () {
  var K = "inkread.stats.v1";
  var K_CK = "inkread.checkins.v1";

  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function pad2(n) { return ("0" + n).slice(-2); }
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function raw() {
    var v = null;
    try { v = JSON.parse(localStorage.getItem(K) || "null"); } catch (e) { v = null; }
    if (!v || typeof v !== "object") return { days: {}, total: { sec: 0, words: 0 }, updatedAt: 0 };
    return { days: v.days && typeof v.days === "object" ? v.days : {},
             total: v.total && typeof v.total === "object" ? v.total : { sec: 0, words: 0 },
             updatedAt: num(v.updatedAt) };
  }
  /* 口径起点（本机时区）：日=今天 0 点；周=本周一 0 点；月=本月 1 日；年=本年 1 月 1 日 */
  function fromKey(kind) {
    var d = new Date(), t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (kind === "week") { var wd = (t.getDay() + 6) % 7; t.setDate(t.getDate() - wd); }
    else if (kind === "month") t.setDate(1);
    else if (kind === "year") { t.setMonth(0); t.setDate(1); }
    return dayKey(t);
  }
  /* 页内自算：区间 = [起点, 今天] 的 days 求和（YYYY-MM-DD 字典序即时序）；累计 = total。
     days 按引擎同口径取「有效阅读天数」= 单日满 60 秒（调研②的微信读书口径）。 */
  function rangeLocal(kind) {
    var s = raw(), n = 0;
    function eff(k, d) { return num((d || {}).sec) >= 60 ? 1 : 0; }
    if (kind === "total" || kind === "all") {
      Object.keys(s.days).forEach(function (k) { n += eff(k, s.days[k]); });
      return { sec: num(s.total.sec), words: num(s.total.words), days: n, by: "local" };
    }
    var from = fromKey(kind === "day" ? "day" : kind), to = dayKey();
    var sec = 0, words = 0;
    Object.keys(s.days).forEach(function (k) {
      if (k < from || k > to) return;
      var d = s.days[k] || {};
      sec += num(d.sec); words += num(d.words); n += eff(k, d);
    });
    return { sec: sec, words: words, days: n, by: "local" };
  }
  /* API 回包归一：{code,data:{sec,words}} 或 {sec,words} 都认；形状不对返回 null */
  function pick(r) {
    if (!r || typeof r !== "object") return null;
    var d = r.data && typeof r.data === "object" ? r.data : r;
    if (typeof d.sec !== "number" && typeof d.words !== "number") return null;
    var out = { sec: num(d.sec), words: num(d.words), by: "api" };
    if (typeof d.days === "number") out.days = num(d.days);
    return out;
  }
  /* 引擎读数与页内自算对齐：同一份存储的两种读法，逐项取大。
     引擎侧带内存缓存（同一标签页刚写的要等下一次 storage 事件才失效），
     这里取「更完整的一侧」，读数绝不会因缓存陈旧而少报；两者同源同时，取大无副作用
     （sec / words 只增不减，days 是同一口径的天数）。 */
  function reconcile(a, local) {
    return { sec: Math.max(num(a.sec), local.sec), words: Math.max(num(a.words), local.words),
             days: Math.max(num(a.days), local.days), by: a === local ? "local" : "api+local" };
  }
  /* 汇总：优先 API.statsRange（同步或异步皆可），否则页内自算。
     异步实现时先用自算值顶上、API 回来再经 cb 校正一次 —— 首屏不等网络。 */
  function range(kind, cb) {
    var local = rangeLocal(kind);
    var api = window.API;
    if (!api || typeof api.statsRange !== "function") { if (cb) cb(local); return local; }
    var out = null;
    try { out = api.statsRange(kind); } catch (e) { out = null; }
    if (out && typeof out.then === "function") {
      out.then(function (r) { var v = pick(r); if (v && cb) cb(reconcile(v, local)); }).catch(function () {});
      if (cb) cb(local);
      return local;
    }
    var v = pick(out);
    var res = v ? reconcile(v, local) : local;
    if (cb) cb(res);
    return res;
  }
  /* 连续天数：从今天回数 days[].checks>0；今天还没打卡不算断，从昨天起算（同一根火没灭） */
  function streakLocal() {
    var days = raw().days, n = 0, d = new Date();
    if (!(days[dayKey(d)] && num(days[dayKey(d)].checks) > 0)) d.setDate(d.getDate() - 1);
    while (days[dayKey(d)] && num(days[dayKey(d)].checks) > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function pickNum(r) {
    if (typeof r === "number") return isFinite(r) ? r : null;
    if (r && typeof r === "object") {
      var v = r.streak != null ? r.streak : (r.data && r.data.streak != null ? r.data.streak : r.days);
      if (typeof v === "number" && isFinite(v)) return v;
    }
    return null;
  }
  /* 连续天数：优先 API.statsStreak（引擎口径完全一致），与页内自算取大（同 reconcile 的理由） */
  function streak(cb) {
    var local = streakLocal();
    var api = window.API;
    if (!api || typeof api.statsStreak !== "function") { if (cb) cb(local); return local; }
    var out = null;
    try { out = api.statsStreak(); } catch (e) { out = null; }
    if (out && typeof out.then === "function") {
      out.then(function (r) { var v = pickNum(r); if (v != null && cb) cb(Math.max(v, local)); }).catch(function () {});
      if (cb) cb(local);
      return local;
    }
    var v = pickNum(out);
    var res = v == null ? local : Math.max(v, local);
    if (cb) cb(res);
    return res;
  }
  /* 展示用连续天数：stats 还没采到任何一天时，退回老 checkins 口径（今天有打卡 = 1 天） */
  function streakSmart(cb) {
    var has = Object.keys(raw().days).length > 0;
    if (has) return streak(cb);
    var n = 0;
    try { n = Object.keys(JSON.parse(localStorage.getItem(K_CK) || "null") || {}).length > 0 ? 1 : 0; } catch (e) { n = 0; }
    if (cb) cb(n);
    return n;
  }
  /* 单位自适应：<60 秒 → 秒；<60 分钟 → 分钟；≥60 分钟 → N.N 小时（时长以秒存储，调研①的教训） */
  function fmtSec(sec) {
    sec = Math.max(0, Math.round(num(sec)));
    if (sec < 60) return [String(sec), "秒"];
    if (sec < 3600) return [String(Math.round(sec / 60)), "分钟"];
    return [(sec / 3600).toFixed(1), "小时"];
  }
  /* 单位自适应：<1 万 → N 字；≥1 万 → N.N 万字 */
  function fmtWords(w) {
    w = Math.max(0, Math.round(num(w)));
    if (w < 10000) return [String(w), "字"];
    return [(w / 10000).toFixed(1), "万字"];
  }
  /* 统一刷新时机：打卡事件 / 跨天事件 / 其它页写库（storage）/ 每 60 秒（长开与跨天兜底） */
  function watch(cb) {
    if (typeof cb !== "function") return;
    document.addEventListener("ink:checkins", function () { cb(); });
    document.addEventListener("ink:daychange", function () { cb(); });
    window.addEventListener("storage", function (e) {
      if (!e || !e.key) { cb(); return; }
      if (e.key === K || e.key === K_CK || e.key === "inkread.read.v1" || e.key === "inkread.milestones.v1") cb();
    });
    setInterval(cb, 60000);
  }

  return { K: K, dayKey: dayKey, raw: raw, range: range, rangeLocal: rangeLocal,
           streak: streak, streakSmart: streakSmart, fmtSec: fmtSec, fmtWords: fmtWords, watch: watch };
})();

/* ---------- 火焰演进：双层火焰，朱砂按连续进度自底向上填充（周期 30 天） ----------
   底层灰墨描边 = 未填部分；内层朱砂整条焰形，用 clipPath 里一块随 ratio 上升的矩形裁出已填段。
   周期 30 天：ratio = (streak % 30) / 30，streak>0 且整除 30 时满格（30/60/90…），0 则全空。 */
window.InkFlame = (function () {
  var PERIOD = 30;
  /* 焰形锚点：自焰尖顺时针一圈（16 点）。逐点过 Catmull-Rom 转三次贝塞尔 —— 不手写控制点，
     半径自焰尖向下单调张开（不留凹腰，否则会摊成水滴/洋葱），左缘带一点 S 走偏，
     下宽上尖、微微左倾；改锚点即整体改形，不引任何外部资源。 */
  /* 焰形直接采用成稿的火苗轮廓（焰尖向左回勾、底部圆融），
     不再用 Catmull-Rom 自己搓气泡 —— 自搓的轮廓在 34px 下会糊成一坨。
     填充机制不变：clipPath 从下往上按 streak/30 截断同一轮廓。 */
  var D = "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";

  function ratio(streak) {
    var s = Math.floor(Number(streak));
    if (!isFinite(s) || s <= 0) return 0;
    var m = s % PERIOD;
    if (m === 0) return 1;              /* 满格瞬间（30/60/90…） */
    return m / PERIOD;
  }
  /* 填充面顶边在 24 单位视窗里的 y：ratio=0 → 23.6（焰底之下 = 空）；ratio=1 → 1.0（盖过焰尖） */
  function fillY(r) { return Math.round((23.6 - 22.6 * r) * 100) / 100; }
  var seq = 0;
  function svg(size, streak, opts) {
    opts = opts || {};
    size = size || 24;
    var r = opts.full ? 1 : ratio(streak);
    var y = fillY(r);
    var id = "inkFl" + (++seq);
    return '<svg class="ink-flame' + (opts.cls ? " " + opts.cls : "") + '" width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" data-ratio="' + r.toFixed(4) + '" data-fill-y="' + y + '" aria-hidden="true">' +
      '<defs><clipPath id="' + id + '" clipPathUnits="userSpaceOnUse">' +
        '<rect x="-1" y="' + y + '" width="26" height="' + Math.round((26 - y) * 100) / 100 + '"/></clipPath></defs>' +
      /* 内层朱砂（已填段）在下，外层灰墨描边压在上面 —— 未填段只剩灰轮廓 */
      '<g clip-path="url(#' + id + ')"><path d="' + D + '" fill="var(--accent)" stroke="var(--accent-ink)" ' +
        'stroke-width="1.7" stroke-linejoin="round"/></g>' +
      '<path d="' + D + '" fill="none" stroke="var(--ink-3)" stroke-width="1.7" ' +
        'stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  }
  return { PERIOD: PERIOD, ratio: ratio, fillY: fillY, svg: svg, path: D };
})();

/* ---------- 里程碑激励弹窗（全站注入型）----------
   初级（每满 30 天）：火焰弹性放大入场 + 火叶粒子上浮；
   高级（每满 365 天）：叠加全屏斜向辉光扫过 + 火焰外圈金光徽章环 + 更多粒子；
   文案链路：先「主脑正在酝酿贺词…」→ Brain.cheer(ctx) 返回替换（6 秒超时）；
             不可用 / 失败 / 超时 → 兜底模板池（按 round 轮换 + 周年分流，同特效不同文本）。 */
window.InkCheer = (function () {
  var el = null, opener = null, lastKey = "", lastAt = 0, pend = 0;
  var TIMEOUT = 6000;

  /* 兜底模板池：基础 6 套 + 周年 6 套 = 12 套（≥10）。
     文案自带轮次序号 ⇒ 同一特效、不同 round 的文本必不相同（「每满一年相同特效不同鼓励文本」成立）。 */
  var BASIC_POOL = [
    "三十天不长，但足够把「明天再说」改成「今天也读了」。",
    "火苗又旺了一格 —— 你读过的每一页都在给它添柴。",
    "习惯不是坚持出来的，是每天同一时刻顺手做出来的。",
    "这一程的刻度已刻下。下一程，照旧从今天开始。",
    "阅读这件事，最怕中断，最不怕慢。你两样都躲过了。",
    "纸页翻动的声音，就是这三十天最稳的节拍。"
  ];
  var ANNIV_POOL = [
    "一年了。时间没有辜负任何一个每天读几页的人。",
    "四季翻过，书页没停。这一年你给自己攒下了一整座书斋。",
    "周年了 —— 火焰换了一层，人对文字的耐心还是原来那层。",
    "一整年。不是每天都热烈，但每天都还在，这更难。",
    "又一年。你把「读一点」变成了「一直在」。",
    "周年快乐。往后每一年，这团火都记得从哪一页烧起来的。"
  ];
  function fallbackText(o) {
    o = o || {};
    var round = Math.max(1, Math.floor(Number(o.round) || 1));
    var pool = o.isAnniversary ? ANNIV_POOL : BASIC_POOL;
    var body = pool[(round - 1) % pool.length];
    if (o.isAnniversary) return "第 " + round + " 年（连续 " + (o.days || 0) + " 天）—— " + body;
    return "第 " + round + " 个三十天（连续 " + (o.days || 0) + " 天）—— " + body;
  }
  function reduced() {
    if (document.documentElement.dataset.reduce === "on") return true;
    try { if (InkStore.getRead().reduce) return true; } catch (e) {}
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function askBrain(o) {
    if (!(window.Brain && typeof window.Brain.cheer === "function")) return Promise.reject(new Error("Brain.cheer 不可用"));
    var p;
    try { p = Promise.resolve(window.Brain.cheer({ days: o.days, level: o.level, round: o.round, isAnniversary: !!o.isAnniversary })); }
    catch (e) { return Promise.reject(e); }
    return p.then(function (t) {
      var s = String(t == null ? "" : t).replace(/\s+/g, " ").trim();
      if (!s) throw new Error("贺词为空");
      return s.length > 240 ? s.slice(0, 240) + "…" : s;
    });
  }
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error("超时")); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function particles(adv) {
    var n = adv ? 14 : 8, out = "";
    for (var i = 0; i < n; i++) {
      var left = 16 + Math.round(Math.random() * 68);
      var size = 3 + Math.round(Math.random() * 4);
      out += '<i style="left:' + left + '%;width:' + size + 'px;height:' + size + 'px;' +
        '--ic-d:' + (Math.random() * 0.5).toFixed(2) + 's;--ic-t:' + (0.9 + Math.random() * 0.8).toFixed(2) + 's"></i>';
    }
    return out;
  }
  function subText(o) {
    var t = InkStats.fmtSec(InkStats.range("total").sec), w = InkStats.fmtWords(InkStats.range("total").words);
    return "连续打卡 " + (o.days || 0) + " 天 · 累计阅读 " + t[0] + " " + t[1] + "、" + w[0] + " " + w[1];
  }
  function build() {
    el = document.createElement("div");
    el.className = "ink-cheer";
    el.id = "inkCheer";
    el.hidden = true;
    el.innerHTML =
      '<div class="ic-scrim" data-ic-close="1"></div>' +
      '<div class="ic-sweep" aria-hidden="true"></div>' +
      '<div class="ic-card" role="alertdialog" aria-modal="true" aria-labelledby="icTitle" aria-describedby="icText">' +
        '<div class="ic-stage">' +
          /* 徽章环 + 火焰（满焰）+ 角上小徽章：环与徽章只在高级显示（CSS 按 .is-adv 切） */
          '<div class="ic-flamebox">' +
            '<span class="ic-ring" aria-hidden="true"></span>' +
            '<span class="ic-flame-art" id="icFlame"></span>' +
            '<span class="ic-badge" aria-hidden="true">' + icon("award", 15) + "</span>" +
          "</div>" +
          '<div class="ic-parts" id="icParts" aria-hidden="true"></div>' +
        "</div>" +
        '<div class="ic-body">' +
          '<h3 class="ic-title" id="icTitle"></h3>' +
          '<p class="ic-text" id="icText"></p>' +
          '<p class="ic-sub" id="icSub"></p>' +
        '</div>' +
        '<div class="ic-foot">' +
          '<button type="button" class="btn btn-primary" id="icGo">继续</button>' +
          '<a class="ic-more" id="icMore" href="index.html">看看我的统计</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector("#icGo").addEventListener("click", close);
    el.querySelector(".ic-scrim").addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && el && !el.hidden) close();
    });
  }
  function close() {
    if (!el || el.hidden) return;
    el.hidden = true;
    el.className = "ink-cheer";
    if (opener && opener.focus) { try { opener.focus(); } catch (e) {} }
    opener = null;
  }
  function show(o) {
    o = o || {};
    var adv = o.level === "advanced";
    var key = (adv ? "A" : "B") + ":" + (o.days || 0) + ":" + (o.round || 0);
    var now = Date.now();
    if (key === lastKey && now - lastAt < 1000) return false;      /* 同一里程碑 1 秒内只认一次 */
    if (el && !el.hidden) return false;                           /* 已在弹：不叠层 */
    if (!document.body) { document.addEventListener("DOMContentLoaded", function () { show(o); }, { once: true }); return false; }
    if (!el) build();
    lastKey = key; lastAt = now;
    opener = document.activeElement;

    var flat = reduced();
    el.className = "ink-cheer" + (adv ? " is-adv" : " is-basic") + (flat ? " is-flat" : "");
    el.querySelector("#icTitle").textContent = o.isAnniversary
      ? "第 " + (o.round || 1) + " 年 · 连续 " + (o.days || 0) + " 天"
      : "连续打卡 " + (o.days || 0) + " 天";
    var txt = el.querySelector("#icText");
    txt.textContent = "主脑正在酝酿贺词…";
    txt.dataset.src = "";                    /* 清掉上一条来源标记："" = 还在等 */
    txt.classList.remove("in");
    txt.classList.add("loading");
    el.querySelector("#icSub").textContent = subText(o);
    el.querySelector("#icFlame").innerHTML = InkFlame.svg(adv ? 76 : 64, 0, { full: true });
    el.querySelector("#icParts").innerHTML = flat ? "" : particles(adv);
    el.querySelector("#icMore").hidden = !adv;                    /* 高级才给「看看我的统计」 */
    el.hidden = false;
    el.querySelector("#icGo").focus();                            /* 焦点只给「继续」，不给任何危险动作 */

    var mySeq = ++pend;
    withTimeout(askBrain(o), TIMEOUT)
      .then(function (s) { if (mySeq === pend) setText(s, "brain"); })
      .catch(function () { if (mySeq === pend) setText(fallbackText(o), "fallback"); });
    return true;
  }
  function setText(s, src) {
    var t = el && el.querySelector("#icText");
    if (!t) return;
    t.classList.remove("loading");
    t.textContent = s;
    t.dataset.src = src;
    t.classList.add("in");
  }
  document.addEventListener("ink:milestone", function (e) {
    var d = (e && e.detail) || {};
    show({ days: d.days, level: d.level === "advanced" ? "advanced" : "basic",
           round: d.round, isAnniversary: !!d.isAnniversary });
  });
  return { show: show, close: close, text: fallbackText, open: function () { return !!el && !el.hidden; } };
})();

/* ---------- 时间与本机一致：顶栏日期每分钟自检跨天（F） ----------
   现状是加载时写一次，页面开着过 0 点就停在昨天；这里改为自检 + 跨天广播 ink:daychange。 */
window.InkDate = (function () {
  var WK = ["日", "一", "二", "三", "四", "五", "六"];
  var last = "", timer = 0;
  function text(d) {
    d = d || new Date();
    return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 · 周" + WK[d.getDay()];
  }
  /* 幂等：同一天重复调用不重写 DOM */
  function paint() {
    var d = new Date(), t = text(d), node = document.getElementById("statusDate");
    if (node && node.textContent !== t) node.textContent = t;
    last = d.toDateString();
    return last;
  }
  /* 每分钟一发：跨天才重画并广播（返回是否跨天，便于自测） */
  function tick() {
    var s = new Date().toDateString();
    if (s === last) return false;
    paint();
    try { document.dispatchEvent(new CustomEvent("ink:daychange", { detail: { day: InkStats.dayKey() } })); } catch (e) {}
    return true;
  }
  function watch() { paint(); if (!timer) timer = setInterval(tick, 60000); }
  return { text: text, paint: paint, tick: tick, watch: watch };
})();

/* ============================================================
   一体化外壳 · 公共顶栏 + 公共导航（全站唯一来源）
   —— 六个页面的顶栏与侧栏此前是逐字复制的六份静态 HTML，
      改一处要动六个文件；现在统一由这里在脚本解析时同步注入，
      首帧即成型（开场动画遮罩之下，无闪烁）。
   —— 桌面 App（window.inkread 存在，见 electron/preload.js）时
      追加 Windows 窗口控制钮；浏览器开发态自动省略。
      顶栏整条是窗口拖拽区（-webkit-app-region），按钮一律 no-drag。
   ============================================================ */
(function mountChrome() {
  var device = document.querySelector(".device");
  var screen = document.getElementById("screen");
  if (!device || !screen || document.querySelector(".device-topbar")) return;

  var isDesktop = !!(window.inkread && window.inkread.desktop);
  if (isDesktop) document.body.classList.add("desktop");

  /* 窗口控制钮的 10×10 线性图标（Windows 11 风格，随主题着色） */
  var WSVG = 'width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1"';
  var SVG_MIN = '<svg ' + WSVG + '><path d="M0 5.5h10"/></svg>';
  var SVG_MAX = '<svg ' + WSVG + '><rect x="0.5" y="0.5" width="9" height="9"/></svg>';
  var SVG_RESTORE = '<svg ' + WSVG + '><rect x="0.5" y="2.5" width="7" height="7"/><path d="M2.5 2.5v-2h7v7h-2"/></svg>';
  var SVG_CLOSE = '<svg ' + WSVG + ' stroke-width="1.1"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9"/></svg>';

  /* 顶栏原始状态图标（云同步 / Wi-Fi / 电量）沿用原 HTML 内联路径 */
  var topbar =
    '<div class="device-topbar" id="inkTopbar">' +
      '<div class="brand">' +
        '<span class="brand-seal">墨</span>' +
        '<span class="brand-name">墨读 InkRead</span>' +
        '<span class="brand-mode">水墨屏阅读器</span>' +
      '</div>' +
      '<div class="tb-drag" aria-hidden="true"></div>' +
      '<div class="status">' +
        '<span class="status-item hide-sm" id="statusDate"></span>' +
        '<span class="status-item hide-sm"><svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>本地已保存</span>' +
        /* v2.2：网络与电量改为与本机真实状态同步（见 syncMachineStatus） */
        '<span class="status-item" id="inkNet" title="网络状态"><span id="inkNetIco"></span></span>' +
        '<span class="status-item" id="inkBat" title="电池状态"><span id="inkBatIco"></span><em id="inkBatTxt" class="status-num">—</em></span>' +
        '<button class="icon-btn" id="themeToggle" data-appearance title="外观与阅读设置" aria-label="外观与阅读设置"></button>' +
      '</div>' +
    '</div>';

  /* 侧栏六项：data-nav 是页面键，图标名与原静态 HTML 一致 */
  var NAVS = [
    ["library", "library", "index.html", "书架"],
    ["reader", "book-open", "reader.html", "阅读"],
    ["notes", "notebook-pen", "notes.html", "笔记"],
    ["cards", "layers", "cards.html", "闪卡"],
    ["tasks", "list-checks", "tasks.html", "任务"],
    ["ai", "sparkles", "ai.html", "主脑"]
  ];
  var navLinks = NAVS.map(function (n) {
    return '<a class="nav-link" data-nav="' + n[0] + '" href="' + n[2] + '">' + icon(n[1], 19) + "<span>" + n[3] + "</span></a>";
  }).join("");

  /* ---------- 打卡 / 阅读状态（v2.7 升级）----------
     连续天数改为读 inkread.stats.v1 的 days[].checks（引擎采集的真实日期维度）；
     引擎没采到任何一天时退回老 checkins 口径（今天有打卡 = 连续 1 天）；
     「今日已读」不再是「——」：stats 有当日 sec 就报真实分钟数。
     火焰按 30 天周期填充（InkFlame），数字为 0 时灰、>0 朱砂。
     刷新时机：打卡事件 + storage + 每 60 秒（跨天/长开兜底，见 InkStats.watch）。 */
  var lastStreak = null, painting = false;
  function paintStreak() {
    if (painting) return;                 /* 防重入：同步回调不进入下一层重画 */
    painting = true;
    var card = document.querySelector(".streak-card");
    var slot = card && card.querySelector(".sk-flame");
    if (!card) { painting = false; return; }
    /* API.statsStreak 若为异步实现，回调里补一次重画（值确实变了才画） */
    var n = InkStats.streakSmart(function (v) { if (!painting && v !== lastStreak) paintStreak(); });
    lastStreak = n;
    if (slot) slot.innerHTML = InkFlame.svg(20, n);
    var b = card.querySelector(".sk-b"), s = card.querySelector(".sk-s");
    var today = InkStats.rangeLocal("day");
    var hit = (InkStats.raw().days[InkStats.dayKey()] || {}).checks > 0;
    if (b) b.textContent = hit ? "今日已打卡" : "今日未打卡";
    if (s) {
      var read = today.sec > 0 ? "今日已读 " + InkStats.fmtSec(today.sec).join(" ") : "今日已读 ——";
      s.textContent = "连续 " + n + " 天 · " + read;
    }
    card.classList.toggle("is-hot", n > 0);
    painting = false;
  }
  InkStats.watch(paintStreak);

  /* v2.14：侧栏换新貌 —— 品牌位 + 六项导航 + 双细线界栏 + 状态足部（含日期）。
     ≤600 底栏档由 CSS 隐藏 nav-brand / nav-sec / nav-foot，导航以底栏 + 更多 sheet 呈现。 */
  var nav =
    '<aside class="app-nav">' +
      '<div class="nav-brand"><span class="brand-seal">墨</span><b>墨读</b></div>' +
      '<nav class="nav-list">' + navLinks + '</nav>' +
      '<div class="nav-sec rule-2line" aria-hidden="true"></div>' +
      '<div class="nav-foot">' +
        /* 火焰槽位由 paintStreak 填 InkFlame.svg(20, streak)：底层灰墨 + 朱砂按进度自底向上填充 */
        '<div class="streak-card">' +
          '<span class="sk-flame" id="inkStreakFlame">' + icon("flame", 20) + '</span>' +
          '<div><b class="sk-b">今日未打卡</b><span class="sk-s">连续 0 天 · 今日已读 ——</span></div>' +
        '</div>' +
        /* v2.2：装饰性用户条改造为「本机数据」入口（导出备份 / 恢复 / 清理）——
           单机应用没有账号体系，真正需要的是一个数据管理门。
           v2.19：名字不再是演示人设「林知夏」，改读本机称呼 inkread.profile.v1。 */
        '<button class="user-chip" id="inkDataBtn" type="button" title="本机数据 · 备份与恢复">' +
          '<span class="avatar" id="ucInitial"></span>' +
          '<div><b id="ucName"></b><span>本机数据 · 点击管理</span></div>' +
          '<span class="uc-go" id="icDataGo"></span>' +
        '</button>' +
        '<div class="nav-date" id="navDate" aria-hidden="true"></div>' +
      '</div>' +
    '</aside>';

  device.insertAdjacentHTML("afterbegin", topbar);
  screen.insertAdjacentHTML("afterbegin", nav);
  paintStreak();
  syncMachineStatus();
  mountLocalData();

  /* ---------- v2.14 · ≤600 底栏「更多」sheet ----------
     底栏放书架/阅读/笔记/闪卡四个高频入口 + 更多；任务、主脑、主题、打卡、
     本机数据收进 sheet（五宫格）。桌面导航不受影响（按钮 CSS 默认 display:none）。
     打卡项没有独立页面：streak-card 从未绑定过点击（grep 全文确认），
     故跳转任务页（打卡 UI 在那里）；本机数据项直接复用 #inkDataBtn 的挂接逻辑。 */
  (function mountMoreSheet() {
    var page = document.body.dataset.page;
    var navList = screen.querySelector(".nav-list");
    var moreBtn = document.createElement("button");
    moreBtn.className = "nav-more" + (page === "tasks" || page === "ai" ? " active" : "");
    moreBtn.id = "navMore";
    moreBtn.type = "button";
    moreBtn.setAttribute("aria-haspopup", "true");
    moreBtn.setAttribute("aria-expanded", "false");
    moreBtn.setAttribute("aria-controls", "navMoreSheet");
    moreBtn.innerHTML = icon("menu", 19) + "<span>更多</span>";
    navList.appendChild(moreBtn);

    var sheet = document.createElement("div");
    sheet.className = "more-sheet";
    sheet.id = "navMoreSheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "更多入口");
    sheet.hidden = true;
    var isCur = function (k) { return page === k ? " cur" : ""; };
    sheet.innerHTML =
      '<div class="ms-grid">' +
        '<a class="ms-item' + isCur("tasks") + '" href="tasks.html">' + icon("list-checks", 22) + '<span>任务</span></a>' +
        '<a class="ms-item' + isCur("ai") + '" href="ai.html">' + icon("sparkles", 22) + '<span>主脑</span></a>' +
        '<a class="ms-item" href="themes.html">' + icon("palette", 22) + '<span>主题</span></a>' +
        '<button class="ms-item" type="button" data-ms="checkin">' + icon("flame", 22) + '<span>打卡</span></button>' +
        '<button class="ms-item" type="button" data-ms="data">' + icon("database", 22) + '<span>本机数据</span></button>' +
      '</div>' +
      '<button class="ms-close" type="button" aria-label="收起">收起</button>';
    device.appendChild(sheet);

    var open = false;
    function openSheet() {
      if (open) return;
      open = true;
      sheet.hidden = false;
      moreBtn.setAttribute("aria-expanded", "true");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { sheet.classList.add("open"); });
      });
    }
    function closeSheet() {
      if (!open) return;
      open = false;
      sheet.classList.remove("open");
      moreBtn.setAttribute("aria-expanded", "false");
      setTimeout(function () { if (!open) sheet.hidden = true; }, 180);
    }
    moreBtn.addEventListener("click", function () { open ? closeSheet() : openSheet(); });
    sheet.addEventListener("click", function (e) {
      if (e.target === sheet) { closeSheet(); return; }
      var act = e.target.closest("[data-ms]");
      if (!act) return;
      if (act.dataset.ms === "checkin") { location.href = "tasks.html"; return; }
      if (act.dataset.ms === "data") {
        closeSheet();
        var dataBtn = document.getElementById("inkDataBtn");
        if (dataBtn) dataBtn.click();
      }
    });
    sheet.querySelector(".ms-close").addEventListener("click", closeSheet);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) closeSheet();
    });
  })();

  /* v2.14：侧栏足部日期 —— 复用 InkDate.text() 同一文案源，不新建格式逻辑；
     跨天由 ink:daychange 触发重写（InkDate.tick 每分钟自检后派发）。 */
  (function mountNavDate() {
    var el = document.getElementById("navDate");
    if (!el) return;
    el.textContent = InkDate.text(new Date());
    document.addEventListener("ink:daychange", function () { el.textContent = InkDate.text(new Date()); });
  })();

  /* ---------- v2.2 · 顶栏与本机真实状态同步 ----------
     电量：Battery Status API（Chromium 系全支持；取不到则隐藏该项）；
     网络：navigator.onLine + online/offline 事件（离线时图标划掉并注明可离线用）。
     旧版这两处是写死的「82%」与静态图标 —— 现在如实反映本机。 */
  function syncMachineStatus() {
    var net = qs("#inkNet"), bat = qs("#inkBat");
    if (!net || !bat) return;
    var netIco = qs("#inkNetIco"), batIco = qs("#inkBatIco"), batTxt = qs("#inkBatTxt");
    function paintNet() {
      var on = navigator.onLine !== false;
      netIco.innerHTML = icon(on ? "wifi" : "wifi-off", 15);
      net.title = on ? "网络已连接" : "网络已断开 · 离线功能不受影响";
      net.classList.toggle("off", !on);
    }
    paintNet();
    window.addEventListener("online", paintNet);
    window.addEventListener("offline", paintNet);
    function paintBat(b) {
      if (!b) { bat.hidden = true; return; }
      var pct = Math.round((b.level == null ? 1 : b.level) * 100);
      batIco.innerHTML = icon(b.charging ? "battery-charging" : "battery", 15);
      batTxt.textContent = pct + "%";
      var extra = "";
      if (!b.charging && isFinite(b.dischargingTime) && b.dischargingTime > 0) {
        extra = "（约剩 " + Math.max(1, Math.round(b.dischargingTime / 3600)) + " 小时）";
      }
      bat.title = (b.charging ? "充电中" : "电池") + " · " + pct + "%" + extra;
    }
    if (navigator.getBattery) {
      navigator.getBattery().then(function (b) {
        paintBat(b);
        b.addEventListener("levelchange", function () { paintBat(b); });
        b.addEventListener("chargingchange", function () { paintBat(b); });
      }).catch(function () { paintBat(null); });
    } else {
      paintBat(null);
    }
  }

  /* ---------- v2.2 · 本机数据面板（用户条改造） ----------
     调研结论（ChatGPT Memory 与数据面板惯例）：单机应用不谈账号，用户真正需要的是
     「看得见的数据 + 一键备份 + 可恢复 + 可清空」。这里把原先纯装饰的用户条
     改成这个入口；导出为带版本与时间戳的 JSON，恢复时校验格式后逐键写回。 */
  function mountLocalData() {
    var btn = qs("#inkDataBtn");
    if (!btn) return;
    if (qs("#icDataGo")) qs("#icDataGo").innerHTML = icon("chevron-right", 14);

    var mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.id = "ldMask";
    mask.style.display = "none";
    mask.innerHTML =
      '<div class="modal ld-modal">' +
        '<div class="modal-head"><h3>' + icon("database", 16) + "本机数据</h3>" +
          '<button class="modal-x" id="ldClose" aria-label="关闭"></button></div>' +
        '<div class="modal-body">' +
          '<p class="card-note">全部数据存在本机（浏览器存储），不上传云端。可导出备份、换机恢复。</p>' +
          '<div class="ld-name">' +
            '<label class="field-label" for="ldNameInput">称呼</label>' +
            '<div class="ld-name-row">' +
              '<input class="field" id="ldNameInput" maxlength="12" placeholder="读者" autocomplete="off" spellcheck="false">' +
              '<button class="btn btn-ghost" id="ldNameSave" type="button">保存</button>' +
            '</div>' +
          '</div>' +
          '<div class="ld-stats" id="ldStats"></div>' +
          '<div class="ld-acts">' +
            '<button class="btn btn-primary" id="ldExport">' + icon("download", 14) + "导出全部数据</button>" +
            '<button class="btn btn-ghost" id="ldImportBtn">' + icon("upload", 14) + "从备份恢复</button>" +
            '<input type="file" id="ldImportFile" accept=".json,application/json" hidden>' +
          "</div>" +
          '<div class="hr"></div>' +
          '<div class="ld-danger">' +
            "<div><b>清空全部数据</b>" +
              '<span class="card-note">书籍、笔记、任务打卡、记忆、统计与主题设置将全部删除，不可撤销。</span></div>' +
            /* 面板里的入口保持轻文案，危险全在那扇危险弹窗里（v2.7 · E） */
            '<button class="btn btn-ghost ld-wipe" id="ldWipe" title="危险操作 · 将打开确认弹窗">清空</button>' +
          "</div>" +
          '<p class="ld-foot" id="ldFoot"></p>' +
        "</div>" +
      "</div>";
    document.body.appendChild(mask);
    qs("#ldClose").innerHTML = icon("x", 14);

    /* 侧栏称呼：本机称呼改一处，七页侧栏与主脑问候同步（无账号体系，仅显示用） */
    function paintProfileChip() {
      var n = InkProfile.name();
      var nb = qs("#ucName"), av = qs("#ucInitial");
      if (nb) nb.textContent = n;
      if (av) av.textContent = n.charAt(0);
    }
    paintProfileChip();
    qs("#ldNameSave").addEventListener("click", function () {
      var input = qs("#ldNameInput");
      var n = InkProfile.set(input.value);
      input.value = n === "读者" ? "" : n;
      paintProfileChip();
      toast(n === "读者" ? "已恢复默认称呼「读者」" : "已改为「" + n + "」", "check");
    });

    function keys() {
      var out = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("inkread.") === 0) out.push(k);
      }
      return out;
    }
    function count(k, pick) {
      try {
        var v = JSON.parse(localStorage.getItem(k) || "null");
        return pick(v);
      } catch (e) { return 0; }
    }
    function paintStats() {
      var ks = keys();
      var bytes = 0;
      ks.forEach(function (k) { bytes += (localStorage.getItem(k) || "").length; });
      var stats = [
        ["藏书", count("inkread.shelf.v1", function (v) { return (v || []).length; }) + " 本"],
        ["笔记", count("inkread.notes.v1", function (v) { return (v || []).length; }) + " 条"],
        ["打卡", count("inkread.checkins.v1", function (v) { return Object.keys(v || {}).length; }) + " 次"],
        ["记忆", count("inkread.memory.v1", function (v) { return (v || []).length; }) + " 条"],
        ["主题", count("inkread.themes.installed.v1", function (v) { return (v || []).length; }) + " 套"],
        ["占用", bytes > 102400 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB"]
      ];
      qs("#ldStats").innerHTML = stats.map(function (s) {
        return '<div class="ld-stat"><b>' + esc(s[1]) + "</b><span>" + esc(s[0]) + "</span></div>";
      }).join("");
      qs("#ldFoot").textContent = "本机数据 " + ks.length + " 项 · 版本 " + (window.InkVersion || "dev") + " · 许可 MIT";
    }
    function open() {
      var n = InkProfile.name();
      qs("#ldNameInput").value = n === "读者" ? "" : n;
      paintStats();
      mask.style.display = "grid";
    }
    function close() { mask.style.display = "none"; closeDanger(); }
    btn.addEventListener("click", open);
    qs("#ldClose").addEventListener("click", close);
    mask.addEventListener("click", function (e) { if (e.target === mask) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || mask.style.display === "none") return;
      if (danger && danger.style.display !== "none") return;   /* 危险弹窗开着时，Esc 交给它 */
      close();
    });

    /* 导出：带版本与时间戳的完整 JSON —— 换机/换端口（localStorage 换套）时的救生索 */
    qs("#ldExport").addEventListener("click", function () {
      var data = {};
      keys().forEach(function (k) {
        try { data[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { data[k] = localStorage.getItem(k); }
      });
      var d = new Date();
      var pad = function (n) { return ("0" + n).slice(-2); };
      var name = "inkread-backup-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
        "-" + pad(d.getHours()) + pad(d.getMinutes()) + ".json";
      var blob = new Blob([JSON.stringify({ app: "inkread", version: window.InkVersion || "dev", exportedAt: d.toISOString(), data: data }, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast("已导出备份 · " + name, "download");
    });
    /* 恢复：校验格式 → 逐键写回 → 重载 */
    qs("#ldImportBtn").addEventListener("click", function () { qs("#ldImportFile").click(); });
    qs("#ldImportFile").addEventListener("change", function () {
      var f = this.files && this.files[0];
      this.value = "";
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var j;
        try { j = JSON.parse(fr.result); } catch (e) { toast("文件不是有效的 JSON", "alert-triangle"); return; }
        if (!j || j.app !== "inkread" || !j.data || typeof j.data !== "object") {
          toast("不是墨读的备份文件", "alert-triangle"); return;
        }
        var n = 0;
        Object.keys(j.data).forEach(function (k) {
          if (k.indexOf("inkread.") !== 0) return;
          try { localStorage.setItem(k, JSON.stringify(j.data[k])); n++; } catch (e) {}
        });
        toast("已恢复 " + n + " 项数据 · 即将重载", "circle-check");
        setTimeout(function () { location.reload(); }, 900);
      };
      fr.readAsText(f);
    });
    /* ---------- v2.7 · 清空 = 危险操作保护（方案 E）----------
       调研③的共识是「摩擦匹配风险」：不写「确定吗」，写具体后果；
       破坏按钮红 + 图标、不自动聚焦；再叠加用户要求的 3 秒倒计时解锁。
       （旧的「两击确认」信息量为零 —— 见 .work 里的交互复盘。） */
    var danger = null, dTimer = 0, dLeft = 0, dReady = false, dOpener = null;

    /* 现况计数：从 localStorage 直读，弹窗前一刻的真实数字 */
    function dangerCounts() {
      var ck = count("inkread.checkins.v1", function (v) { return Object.keys(v || {}).length; });
      var days = count("inkread.stats.v1", function (v) { return Object.keys((v && v.days) || {}).length; });
      return [
        ["book", "本书", count("inkread.shelf.v1", function (v) { return (v || []).length; })],
        ["notebook-pen", "条笔记", count("inkread.notes.v1", function (v) { return (v || []).length; })],
        ["brain", "条记忆", count("inkread.memory.v1", function (v) { return (v || []).length; })],
        ["history", "条打卡与统计", ck + days],
        ["palette", "套主题设置", count("inkread.themes.installed.v1", function (v) { return (v || []).length; })]
      ];
    }
    function buildDanger() {
      danger = document.createElement("div");
      danger.className = "modal-mask danger-mask";
      danger.id = "inkDanger";
      danger.style.display = "none";
      danger.innerHTML =
        '<div class="modal danger-modal" role="alertdialog" aria-modal="true" aria-labelledby="dgTitle" aria-describedby="dgLead dgList">' +
          '<div class="modal-head"><h3 class="dg-title">' + icon("alert-triangle", 16) + "清空全部数据</h3></div>" +
          '<div class="modal-body">' +
            '<p class="dg-lead" id="dgLead">将永久删除本机以下数据，<b>无法恢复</b>：</p>' +
            '<ul class="dg-list" id="dgList"></ul>' +
            '<p class="card-note">统计与里程碑记录一并清除。想留一份，请先「导出全部数据」再回来。</p>' +
          "</div>" +
          '<div class="modal-foot">' +
            '<button type="button" class="btn btn-ghost" id="dgCancel">取消</button>' +
            '<button type="button" class="btn btn-danger" id="dgGo" disabled>' +
              icon("trash-2", 15) + '<span id="dgGoTxt">请稍候 3s</span></button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(danger);
      danger.addEventListener("click", function (e) {
        if (e.target === danger) closeDanger();          /* 点遮罩 = 取消 */
      });
      qs("#dgCancel").addEventListener("click", closeDanger);
      qs("#dgGo").addEventListener("click", function () {
        var b = qs("#dgGo");
        if (b.disabled) return;                          /* 倒计时未走完不可点 */
        b.disabled = true;
        /* v2.11 B2：先把「清空」广播给同步快照（墓碑），再清本机 ——
           否则重载后 boot 的 pull 会把远端旧值整体复活。墓碑发不出（离线）也照常清本机。 */
        var wiping = (window.InkSync && InkSync.wipeRemote) ? InkSync.wipeRemote() : Promise.resolve();
        keys().forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
        /* 清空哨兵：故意不带「inkread.」前缀 —— 不进任何 keys() 统计/导出/清空清单，
           清空时留下来，恰好表达「用户主动清过，演示数据别再播」。 */
        try { localStorage.setItem("inkread-cleared.v1", "1"); } catch (e) {}
        toast("已清空全部本机数据 · 示例内容不再出现", "trash-2");
        function back() { setTimeout(function () { location.reload(); }, 600); }
        wiping.then(back, back);
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && danger && danger.style.display !== "none") closeDanger();
      });
    }
    function paintDanger() {
      var list = qs("#dgList");
      if (list) {
        list.innerHTML = dangerCounts().map(function (r) {
          return "<li>" + icon(r[0], 14) + "<b>" + r[2] + "</b><span>" + esc(r[1]) + "</span></li>";
        }).join("");
      }
      var go = qs("#dgGo"), txt = qs("#dgGoTxt");
      if (go) go.disabled = !dReady;
      if (txt) txt.textContent = dReady ? "确认清空" : "请稍候 " + Math.max(1, dLeft) + "s";
    }
    /* 3 秒倒计时解锁：中途取消/关闭一律重置，绝不残留「随时可点」的状态 */
    function countdown() {
      clearInterval(dTimer);
      dLeft = 3; dReady = false;
      paintDanger();
      dTimer = setInterval(function () {
        dLeft--;
        if (dLeft <= 0) { clearInterval(dTimer); dTimer = 0; dLeft = 0; dReady = true; }
        paintDanger();
      }, 1000);
    }
    function openDanger() {
      if (!danger) buildDanger();
      dOpener = document.activeElement;
      paintStats();
      danger.style.display = "grid";
      countdown();
      qs("#dgCancel").focus();                            /* 默认焦点给「取消」，不给破坏按钮 */
    }
    function closeDanger() {
      if (!danger || danger.style.display === "none") return;
      clearInterval(dTimer); dTimer = 0; dLeft = 0; dReady = false;
      danger.style.display = "none";
      paintDanger();
      if (dOpener && dOpener.focus) { try { dOpener.focus(); } catch (e) {} }
      dOpener = null;
    }
    qs("#ldWipe").addEventListener("click", openDanger);
  }

  /* 桌面 App：接上窗口控制（preload 暴露的窄接口） */
  if (isDesktop) {
    var tb = document.getElementById("inkTopbar");
    var status = tb.querySelector(".status");
    var ctl = document.createElement("div");
    ctl.className = "win-controls";
    ctl.innerHTML =
      '<button class="win-btn" id="winMin" title="最小化" aria-label="最小化">' + SVG_MIN + '</button>' +
      '<button class="win-btn" id="winMax" title="最大化 / 还原" aria-label="最大化或还原">' +
        '<span class="wc-max">' + SVG_MAX + '</span><span class="wc-restore">' + SVG_RESTORE + '</span></button>' +
      '<button class="win-btn win-close" id="winClose" title="关闭" aria-label="关闭">' + SVG_CLOSE + '</button>';
    status.appendChild(ctl);

    var w = window.inkread.win;
    document.getElementById("winMin").addEventListener("click", function () { w.minimize(); });
    document.getElementById("winMax").addEventListener("click", function () { w.toggleMaximize(); });
    document.getElementById("winClose").addEventListener("click", function () { w.close(); });
    var paintMax = function (v) { tb.classList.toggle("is-max", !!v); };
    try {
      w.onMaximizeChange(paintMax);
      w.isMaximized().then(paintMax);
    } catch (e) {}
  }
})();

/* ============================================================
   v2.3 · 真·双端同步（window.InkSync）
   —— 数据权威副本在本地服务的快照文件（/api/store，见 scripts/serve.js）。
      桌面端与局域网里的手机访问的是同一台服务、同一份快照 —— 真同步，
      不再是「演示同步」。手机浏览器打开 http://<电脑IP>:8765 即接同一份数据。
   —— 同步单元：localStorage 里全部 inkread.* 键，包时间戳信封 {t, v}；
      合并规则 last-write-wins（t 大者胜），并发推送互不抹掉。
   —— 运行节奏：
        · 启动 1.5s 后 pull 合并一次（首启保护：本机已有数据且从未同步过则本地为准）；
        · 每 20s 检测变更 push 一次；页面隐藏前 push（最后几秒的改动不丢）；
        · 「立即同步」按钮 = pull + push，返回统计供按钮 toast。
   —— 旧版「双端同步」按钮是固定返回 items:15 的假动作，此处彻底替换。
   ============================================================ */
window.InkSync = (function () {
  var META = "inkread.syncmeta.v1";     /* { key: 本地最后写入时间戳 }（不参与同步） */
  var LOG = "inkread.synclog.v1";       /* 真实同步日志（参与同步，两端可见） */
  var LOCAL_HOSTS = ["127.0.0.1", "localhost", "::1", ""];
  /* 设备本地配置：里面有明文 API Key。/api/store 对局域网开放（双端同步的前提），
     所以密钥不能上行 —— 服务端也有一层洗除，这里是第一道。 */
  var SKIP = { "inkread.ai.model.v1": 1, "inkread.tts.v1": 1 };
  var pushing = false;
  /* 变更检测基线：key → 内容指纹。旧版直接存整段 JSON，等于在堆里再抄一份库；
     现在只留长度 + 两个 32 位哈希。 */
  var lastSeen = {};
  var dirty = {};                       /* 自上次成功推送以来「变化 / 消失」的键（-1 = 待墓碑） */

  function fp(s) {
    var h1 = 2166136261 >>> 0, h2 = 5381 >>> 0, n = s.length;
    for (var i = 0; i < n; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = (Math.imul(h2, 33) ^ c) >>> 0;
    }
    return n + "." + h1.toString(36) + "." + h2.toString(36);
  }

  function deviceName() {
    var ua = navigator.userAgent || "";
    if (/iPad|Tablet/i.test(ua)) return "平板";
    if (/Android|iPhone|iPod|Mobile/i.test(ua)) return "手机";
    return "桌面";
  }
  function keys() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf("inkread.") === 0 && k !== META && !SKIP[k]) out.push(k);
    }
    return out;
  }
  function metaGet() { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch (e) { return {}; } }
  function metaSet(m) { try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) {} }
  function valOf(k) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v === undefined ? null : v; }
    catch (e) { return localStorage.getItem(k); }
  }
  var INIT = "inkread.syncinit.v1";   /* 本设备是否已接入过同步（本地记号，不参与同步） */
  function initedOnce() { try { return localStorage.getItem(INIT) === "1"; } catch (e) { return false; } }
  /* 变更检测：给「新增或变化」的键盖章 t=now（同步的新鲜度全靠它）。
     四种情形分开处理：
       ① 首次接入（!init）：全部存量键盖章 —— 本地已有数据优先的基线起点；
       ② reload 后首扫（内存基线重置）：只重建 lastSeen，不盖章 ——
          m 里已有各键时间戳，重盖会把本机旧数据「伪造成最新」压掉对端；
       ③ 运行中已见过的键变化：盖章（正常变更路径）；
       ④ 运行中首次出现的新键（如第一次打卡新建 inkread.checkins.v1）：
          m 里没有 → 必是本地新写（远端拉来的键在 pull 里已同步写入 m 与基线）→ 盖章。
      —— 修复：旧版情形④漏盖章（t=0），新建的键永远传不到对端。 */
  function stampChanges() {
    var m = metaGet(), now = Date.now(), changed = 0;
    var firstEver = !initedOnce();
    keys().forEach(function (k) {
      var sig = fp(localStorage.getItem(k) || "");
      if (firstEver) {
        if (!m[k]) { m[k] = now; changed++; dirty[k] = 1; }
        lastSeen[k] = sig;
        return;
      }
      if (!(k in lastSeen)) {
        lastSeen[k] = sig;
        if (!m[k]) { m[k] = now; changed++; dirty[k] = 1; }   /* 新键盖章；reload 后存量键 m 已有值，不动 */
        return;
      }
      if (lastSeen[k] !== sig) {
        m[k] = now; changed++; dirty[k] = 1;
        lastSeen[k] = sig;
      }
    });
    /* 上一版曾把密钥类配置一起同步过：从时间戳表里摘掉，防止下面的墓碑循环
       误把对端的本地配置删掉（它们从未「被用户删除」，只是不再上行）。 */
    Object.keys(m).forEach(function (k) { if (SKIP[k]) delete m[k]; });
    if (firstEver) { try { localStorage.setItem(INIT, "1"); } catch (e) {} }
    metaSet(m);
    return changed;
  }
  function addLog(entry) {
    try {
      var l = JSON.parse(localStorage.getItem(LOG)) || [];
      if (!Array.isArray(l)) l = [];
      var e = Object.assign({ at: Date.now(), device: deviceName() }, entry);
      e.atText = new Date(e.at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      l.unshift(e);
      localStorage.setItem(LOG, JSON.stringify(l.slice(0, 20)));
    } catch (err) {}
  }
  function recentLog() { try { var l = JSON.parse(localStorage.getItem(LOG)); return Array.isArray(l) ? l : []; } catch (e) { return []; } }

  /* 拉取并合并远程较新的键；返回 {pulled, remoteEmpty, offline, client} */
  function pull() {
    return fetch("/api/store", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var remote = (j && j.data) || {};
        var m = metaGet();
        if (!Object.keys(remote).length) {
          return { pulled: 0, remoteEmpty: true, client: (j && j.client) || null };
        }
        var pulled = 0;
        Object.keys(remote).forEach(function (k) {
          if (SKIP[k]) return;
          var env = remote[k];
          if (!env || typeof env.t !== "number") return;
          if (env.t <= (m[k] || 0)) return;
          if (env.deleted) {                 /* 墓碑：对端删了这条键，本地照做 */
            var had = false;
            try { had = localStorage.getItem(k) !== null; } catch (e) {}
            try { localStorage.removeItem(k); } catch (e) {}
            delete m[k];
            delete lastSeen[k];
            /* 只有真删掉了本地键才计入 pulled —— 本来就没有的键收到墓碑是「空删」，
               若也计入，boot 会以为拉到了新数据而 reload，而墓碑又永远躺在快照里，
               于是每次启动都 reload 一次（死循环）。 */
            if (had) pulled++;
            return;
          }
          try { localStorage.setItem(k, JSON.stringify(env.v)); } catch (e) {}
          m[k] = env.t;
          lastSeen[k] = fp(localStorage.getItem(k) || "");   /* 同步基线：勿被当成新变更又推回去 */
          pulled++;
        });
        metaSet(m);
        return { pulled: pulled, client: (j && j.client) || null };
      })
      .catch(function () { return { pulled: 0, offline: true }; });
  }
  /* 推送全量（带各键时间戳）；服务端按 t 合并。
     墓碑：本地曾同步过（m 里有）而现在已不存在的键（如「清空全部数据」后），
     发一条 deleted 信封 —— 否则对端与服务端会保留旧值、下次拉取又把它复活。 */
  /* 推送：只发「本轮真的变过」的键 + 墓碑。服务端本来就是按键 LWW 合并，
     少发键不会覆盖对端；而过去每 20s 全量重发会把整库重新序列化、
     重新落盘一遍 —— 那才是主进程卡顿的来源。没有变更就一个请求都不发。
     墓碑：META 里有、本地已不存在的键（如「清空全部数据」后）发 deleted 信封 ——
     否则对端与服务端会保留旧值、下次拉取又把它复活。 */
  function push(force) {
    if (pushing) return Promise.resolve({ pushed: 0, busy: true });
    var m = metaGet();
    var changed = stampChanges();
    var data = {}, live = {}, names;
    keys().forEach(function (k) { live[k] = 1; });
    Object.keys(m).forEach(function (k) {
      if (live[k] || k === INIT || SKIP[k]) return;
      data[k] = { t: Date.now(), deleted: true };
      dirty[k] = -1;                       /* 墓碑要重试，直到服务端收下 */
      delete m[k];
    });
    Object.keys(dirty).forEach(function (k) {
      if (data[k]) return;                 /* 已是墓碑 */
      if (SKIP[k]) { delete dirty[k]; return; }
      if (localStorage.getItem(k) === null) { dirty[k] = -1; data[k] = { t: Date.now(), deleted: true }; return; }
      data[k] = { t: m[k] || 0, v: valOf(k) };
    });
    metaSet(m);
    names = Object.keys(data);
    if (!changed && !names.length && !force) return Promise.resolve({ pushed: 0, noop: true });
    pushing = true;
    return fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: data,
        client: { name: deviceName(), host: location.hostname, ua: (navigator.userAgent || "").slice(0, 120), at: Date.now() }
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        pushing = false;
        names.forEach(function (k) { delete dirty[k]; });   /* 失败不清基线：下次重试 */
        return { pushed: (j && j.applied) || 0, at: Date.now() };
      })
      .catch(function () { pushing = false; return { pushed: 0, offline: true }; });
  }
  /* v2.11 B2：清空全部数据时立即广播墓碑 ——
     不做这一步，重载后的 boot 会先 pull、把远端旧值整体复活（pull 先于 push，
     且 META 已随清空删除、墓碑再无从发出），「清空」就被同步悄悄撤销了。
     对本机已知（META 里有）的每个同步键发 deleted 信封；重载后的 pull
     见到远端已空即 remoteEmpty，数据不再回流；另一台设备也会照墓碑删除。 */
  function wipeRemote() {
    var m = metaGet(), data = {};
    Object.keys(m).forEach(function (k) {
      if (k === INIT || SKIP[k]) return;
      data[k] = { t: Date.now(), deleted: true };
    });
    if (!Object.keys(data).length) return Promise.resolve({ wiped: 0, offline: false });
    metaSet({});
    lastSeen = {};
    dirty = {};
    return fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: data,
        client: { name: deviceName(), host: location.hostname, ua: (navigator.userAgent || "").slice(0, 120), at: Date.now() }
      })
    })
      .then(function (r) { return r.ok ? r.json() : { applied: 0, failed: true }; })
      .then(function (j) { return { wiped: (j && j.applied) || 0, offline: !!(j && j.failed) }; })
      .catch(function () { return { wiped: 0, offline: true }; });
  }
  /* 立即同步：pull → push → 记日志 */
  function now() {
    return pull().then(function (p) {
      return push(true).then(function (pu) {
        var res = {
          pulled: p.pulled || 0, pushed: pu.pushed || 0,
          offline: !!(p.offline || pu.offline),
          client: p.client || null, at: Date.now()
        };
        addLog({ action: "sync", pulled: res.pulled, pushed: res.pushed, offline: res.offline });
        return res;
      });
    });
  }
  /* 启动流程：建基线 → pull（有远端更新则刷新一次页面把数据带进内存）→ push */
  function boot() {
    stampChanges();
    pull().then(function (p) {
      if (p.pulled) {
        addLog({ action: "pull", pulled: p.pulled });
        location.reload();
        return;
      }
      push().then(function (pu) {
        if (pu && pu.pushed) addLog({ action: "push", pushed: pu.pushed });
      });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 1500); });
  } else {
    setTimeout(boot, 1500);
  }
  setInterval(function () { if (!document.hidden) push(); }, 20000);
  document.addEventListener("visibilitychange", function () { if (document.hidden) push(); });

  return { now: now, pull: pull, push: push, wipeRemote: wipeRemote, log: recentLog, device: deviceName, isLocal: function () { return LOCAL_HOSTS.indexOf(location.hostname) >= 0; } };
})();
