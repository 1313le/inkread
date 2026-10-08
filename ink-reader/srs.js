/* ============================================================
   srs.js · 墨读 InkRead 闪卡调度纯函数（单一事实源）
   ------------------------------------------------------------
   为什么要有这个文件：
   cards.html（闪卡页）与 modes.js（阅读页闪卡面板）此前各自逐字复制
   了同一套纯函数，注释里写着「改一处需两处同步」—— 这是一笔迟早会
   算错的债。此处抽成一份，两个调用点都只引用 window.InkSRS。
   约束：纯函数、无副作用、无框架、无构建（沿用项目 ES5 + 中文注释风格）。
   唯一的隐式依赖是全局 esc()（app.js 提供），且只在 makeCloze 被调用时
   才需要它已就绪 —— 不用形参传入是为了让调用点保持与原实现一字不差。
   ============================================================ */
(function () {
  "use strict";

  /* 今日 yyyy-mm-dd（本地时区）；传 d 则格式化该日期 */
  function ymd(d) {
    var x = d || new Date();
    return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  }

  /* 到期判定：从未复习过，或到期日不晚于今天 */
  function isDueSt(st) {
    return !st || !st.due || st.due <= ymd();
  }

  /* 挂起判定：挂起的卡不进复习队列、不计到期数 */
  function isSusp(st) { return !!(st && st.suspended); }

  /* SM-2 简化实现：quality 0–5（<3 判为遗忘，间隔归零重来）。
     答对后间隔按 1 → 6 → ivl×EF 递增，EF 随评分微调、下限 1.3 ——
     与 Anki 默认曲线同源，只保留必要参数，原型里不堆整套调度器。 */
  function sm2Update(quality, st) {
    var q = Math.max(0, Math.min(5, Math.round(quality)));
    var s = st || {};
    var ef = s.ef || 2.5, ivl = s.ivl || 0, reps = s.reps || 0;
    if (q < 3) {
      reps = 0;
      ivl = 1;
    } else {
      reps += 1;
      if (reps === 1) ivl = 1;
      else if (reps === 2) ivl = 6;
      else ivl = Math.max(1, Math.round(ivl * ef));
      ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    }
    var due = new Date();
    due.setDate(due.getDate() + ivl);
    return { ef: Math.round(ef * 100) / 100, ivl: ivl, reps: reps, due: ymd(due), last: ymd() };
  }

  /* 四档评分对应 SM-2 的 0 / 3 / 4 / 5：比让人记「0–5 该打几分」直观 */
  var RATE = [
    ["0", "忘记", "重来"],
    ["3", "模糊", "明天"],
    ["4", "记得", "按曲线"],
    ["5", "熟练", "拉长"]
  ];

  /* 挖空：取句子中段的一小段（按 id 哈希定长，同一张卡每次挖同一处，不闪跳） */
  function makeCloze(text, seed) {
    var s = String(text);
    var h = 0;
    for (var i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) >>> 0;
    var len = Math.max(2, Math.min(6, Math.round(s.length * 0.18)));
    var at = Math.floor((h % 1000) / 1000 * Math.max(0, s.length - len - 2)) + 1;
    var hole = s.slice(at, at + len);
    /* 挖到空白或标点就往前挪，避免挖出「，」这种没意义的空 */
    while (/[\s，。、；：！？,.!?;:]/.test(hole) && at > 0) { at--; hole = s.slice(at, at + len); }
    return {
      front: esc(s.slice(0, at)) + '<mark class="fc-hole">' + esc(hole) + "</mark>" + esc(s.slice(at + len))
    };
  }

  window.InkSRS = {
    ymd: ymd,
    isDueSt: isDueSt,
    isSusp: isSusp,
    sm2Update: sm2Update,
    RATE: RATE,
    makeCloze: makeCloze
  };
})();
