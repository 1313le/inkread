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

  /* ============================================================
     v2.19.6 · 挖空选位（L0）—— 替换「id 哈希取位置」
     ------------------------------------------------------------
     旧状（用户当面质疑，核对属实）：洞的位置 = 笔记 id 的哈希对 1000 取余，
       与语义无关。后果是它会劈开英文单词（impor|tant）、会挖掉「的了是」，
       并且任何 ≥8 字的高亮都硬出一张卡。
     调研结论（一手来源，详见桌面《闪卡出题逻辑完善方案》）：
       · Anki Manual：cloze 是 "drag the mouse over the text you want to hide"
         —— 出题权在人；
       · RemNote："you select specific parts of a bullet's text to hide"，
         其 AI 只生成问答，不代人决定遮哪几个字；
       · SuperMemo《Twenty rules》第 4 条 minimum information principle：
         一张卡只考一个原子片段；
       · 墨墨 MaiMemo：逐词 WDR 调度 + 给用户「标示熟知 / 删除」的排除权。
       ⇒ 没有一流产品靠「软件判断重要性」做闪卡。要补的是
         **体面的默认值（L0）+ 完全的否决权（L1 改挖 / L2 排除）**。
     设计取舍：只用文本里已经存在的**硬边界**给候选打分（数字、拉丁串、
       定义关系词、括注专名、因果连接词、罕见子句），**不引中文分词库**
       —— MB 级词典换不来用户可感知的质量。无候选 ⇒ 不出卡（宁缺毋滥）。
       确定性保留：同分候选用 id 哈希破平，同一张卡每次挖同一处。
     ============================================================ */

  /* 洞首尾禁吃的虚词：挖「的」「是」这种空，卡是废卡 */
  var STOP = "的了是在和与及把被给让做就都很更最些个之于以而或为从这那其该此等等已经不过";
  var EDGE_BAD = /[\s，。、；：！？,.!?;:·…—－"'“”‘’()（）《》〈〉「」『』【】\[\]<>]/;
  /* 出处指针：括注内容以这些字开头的，是「见第 3 页」这类引用，不是知识 */
  var REF_HEAD = /^(见|参见|详见|如|同上|如下|约|略|待|图|表)/;

  function hashOf(seed) {
    var h = 0, s = String(seed);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  /* 不可分区间：拉丁词串（含空格连接的多词术语）与数字串。
     候选洞与任一区间「部分重叠」即作废 —— 这一条专治劈开半个词。
     括号/书名号不进这里：它们的整块本身就是候选（取内部内容），
     框住只会把正确的候选否掉。 */
  function atoms(s) {
    var A = [];
    var re = /[A-Za-z][A-Za-z0-9+_.\-]*(?:[ \u00A0]+[A-Za-z][A-Za-z0-9+_.\-]*)*|[0-9]+(?:[.,][0-9]+)*/g, m;
    while ((m = re.exec(s))) A.push([m.index, m.index + m[0].length]);
    return A;
  }

  /* 候选生成：每条线索一个分数，add() 统一做边界修剪与废卡否决 */
  function cands(s) {
    var L = s.length, A = atoms(s), out = [], m, i, j, seg;
    function whole(at, len) {
      for (var k = 0; k < A.length; k++) {
        var a = A[k];
        if (at < a[1] && at + len > a[0] && !(at <= a[0] && at + len >= a[1])) return false;
      }
      return true;
    }
    function bad(ch) { return EDGE_BAD.test(ch) || STOP.indexOf(ch) >= 0; }
    function add(at, len, score, why) {
      if (at < 0 || len < 1 || at + len > L) return;
      while (len > 1 && bad(s.charAt(at))) { at++; len--; }              /* 首部修剪 */
      while (len > 1 && bad(s.charAt(at + len - 1))) len--;             /* 尾部修剪 */
      if (len < 2) return;                                             /* 单字洞不成立 */
      seg = s.slice(at, at + len);
      if (/^\s*$/.test(seg) || /^\s|\s$/.test(seg)) return;             /* 修剪后仍带空白：作废 */
      if (at === 0 && len >= L) return;                                /* 整句遮没＝正面全空白 */
      if (!whole(at, len)) return;
      out.push({ at: at, len: len, score: score, why: why });
    }

    /* 1) 数字与量：定义型考点里最可考的一类，且天然原子。
          「第 3 页 / 图 2-1」这类引用编号否决掉。 */
    m = null;
    var reN = /[0-9]+(?:[.,][0-9]+)*/g;
    while ((m = reN.exec(s))) {
      var at = m.index, ln = m[0].length;
      var nx = s.charAt(at + ln) || "", pv = s.charAt(at - 1) || "";
      if (pv === "第" && /[页章节段篇卷幕式图表]/.test(nx)) continue;
      add(at, ln + (/[%℃°]/.test(nx) ? 1 : 0), /[A-Za-z]/.test(nx) ? 94 : 90, "数字");
    }
    /* 2) 拉丁术语 / 全大写缩写：中文书里的英文串几乎必然是关键词 */
    var reL = /[A-Za-z][A-Za-z0-9+_.\-]*(?:[ \u00A0]+[A-Za-z][A-Za-z0-9+_.\-]*)*/g;
    while ((m = reL.exec(s))) {
      seg = m[0];
      var caps = /^[A-Z][A-Z0-9+_.\-]{1,}$/.test(seg);
      add(m.index, seg.length, caps ? 92 : (seg.indexOf(" ") > -1 ? 84 : 78), caps ? "缩写" : "术语");
    }
    /* 3) 定义式：X 是/为/称为/定义为 Y ⇒ 取 Y。最小信息原则的正解。
          Y 若被标点自然收尾，是一个完整的最小信息单元（高分）；
          若被长度上限截断，说明这句信息量大于一张卡，降分并交给 L1 让人自己选。 */
    var reD = /(?:定义为|称为|叫做|指的是|是指|等于|记作|表示为|即|意味着|是|为)([^，。；！？、,;:!?\n]{2,14})/g;
    while ((m = reD.exec(s))) {
      var y = m[1], y0 = m.index + m[0].length - y.length, tail = s.charAt(y0 + y.length) || "";
      add(y0, y.length, (tail === "" || EDGE_BAD.test(tail)) ? 96 : 64, "定义");
    }
    /* 4) 专名（书名号/引号）与括注（括号内多为术语原文或释义） */
    var reQ = /[《「“]([^》」”]{2,16})[》」”]/g;
    while ((m = reQ.exec(s))) add(m.index + 1, m[1].length, 82, "专名");
    var reP = /[（(]([^）)]{2,16})[）)]/g;
    while ((m = reP.exec(s))) { if (REF_HEAD.test(m[1])) continue; add(m.index + 1, m[1].length, 76, "括注"); }
    /* 5) 因果与条件连接词的一侧（同样只在标点收尾时给满分） */
    var reC = /(?:导致|引起|造成|因此|所以|由于|因为|只有|必须|不得|应当|需要|可以)([^，。；！？、,;:!?\n]{2,12})/g;
    while ((m = reC.exec(s))) {
      var c2 = m[1], c0 = m.index + m[0].length - c2.length, t2 = s.charAt(c0 + c2.length) || "";
      add(c0, c2.length, (t2 === "" || EDGE_BAD.test(t2)) ? 72 : 56, "因果");
    }

    /* 6) 子句兜底 + 用字稀有度：在同一条里反复出现的字是「背景」，
          罕见那截才像考点（墨墨逐词难度思路的最小实现，不引词表）。 */
    var freq = {};
    for (i = 0; i < L; i++) { var ch = s.charAt(i); if (!EDGE_BAD.test(ch)) freq[ch] = (freq[ch] || 0) + 1; }
    var reS = /[^，。；：！？、,;:!?·\n\r]{3,8}/g;
    while ((m = reS.exec(s))) {
      seg = m[0];
      if (/^(见|参见|详见|如|同上|如下|以下|上述|前文|后文|第)/.test(seg)) continue;
      var rare = 0;
      for (j = 0; j < seg.length; j++) rare += 1 / (freq[seg.charAt(j)] || 1);
      add(m.index, seg.length, 52 + Math.min(8, Math.round(rare * 1.6)), "子句");
    }
    return out;
  }

  /* 默认挖哪：取最高分候选；只有子句级线索且分数不足 ⇒ 不出卡 */
  function pickCloze(text, seed) {
    var s = String(text || "");
    if (s.length < 8) return null;
    var list = cands(s);
    if (!list.length) return null;
    var max = 0;
    list.forEach(function (c) { if (c.score > max) max = c.score; });
    if (max < 60) return null;
    var top = list.filter(function (c) { return c.score === max; });
    return top[hashOf(seed) % top.length];
  }

  /* 出题权在人：手选的洞存在 cards.v1 的 cloze 字段，永远覆盖机器默认。
     why 一起存：「换个空」是机器换的，徽标该继续说实话（数字/术语/子句），
     只有人手点出来的才叫「自定」。 */
  function clozeFor(n, st) {
    var s = String((n && n.text) || "");
    var h = st && st.cloze;
    if (h && +h.at >= 0 && +h.len > 0 && +h.at + +h.len <= s.length) return { at: +h.at, len: +h.len, why: h.why || "自定" };
    return pickCloze(s, n && n.id);
  }

  /* 点字选段：落点若在拉丁/数字词内则整个词，否则中文按句长收敛，
     并保证洞尾不吃标点虚词（人手点的意图优先，长度 1 也放行）。 */
  function snapHole(text, at) {
    var s = String(text || ""), L = s.length;
    if (!L) return null;
    at = Math.max(0, Math.min(L - 1, Math.round(+at || 0)));
    var A = atoms(s);
    for (var k = 0; k < A.length; k++) if (at >= A[k][0] && at < A[k][1]) return { at: A[k][0], len: A[k][1] - A[k][0] };
    /* 点在空白上：往后挪到第一个实字，否则洞首是个空格 */
    while (at < L - 1 && /\s/.test(s.charAt(at))) at++;
    var len = Math.max(2, Math.min(6, Math.round(L * 0.16)));
    /* 尾巴收敛三件事：不吃标点虚词（原有）、不劈开拉丁/数字词、不吃空白。
       「射式 L」这种半个词是 L0 明令禁止的，L1 顺手生成的默认长度也不能犯。 */
    while (len > 1) {
      var end = at + len, cut = false;
      if (end > L) { len--; continue; }
      for (var i = 0; i < A.length; i++) {
        var a = A[i];
        if (at < a[1] && end > a[0] && !(at <= a[0] && end >= a[1])) { cut = true; break; }
      }
      if (cut || /\s/.test(s.charAt(end - 1))) { len--; continue; }
      if (STOP.indexOf(s.charAt(end - 1)) >= 0 || EDGE_BAD.test(s.charAt(end - 1))) { len--; continue; }
      break;
    }
    return len >= 1 ? { at: at, len: len } : null;
  }

  /* 「换个空」：把分数够用的候选按 分数降序 → 位置升序 排好，循环给出下一处。
     用循环而不是「第一个跟当前不同的」—— 用户可以把可挖的地方看完再绕回来。 */
  function nextCloze(text, cur) {
    var list = cands(String(text || "")).filter(function (c) { return c.score >= 60; });
    if (!list.length) return null;
    list.sort(function (a, b) { return b.score - a.score || a.at - b.at; });
    /* 同一截文字可以同时是「数字」和「子句」（23.4% 就是两处候选、同一个洞）。
       不去重，「换个空」会点一下看似没反应——只留分数最高的那一份。 */
    var seen = {}, uniq = [];
    for (var i = 0; i < list.length; i++) {
      var key = list[i].at + ":" + list[i].len;
      if (seen[key]) continue;
      seen[key] = 1; uniq.push(list[i]);
    }
    if (uniq.length < 2) return cur ? null : uniq[0];
    for (var j = 0; j < uniq.length; j++) {
      if ((!cur) || uniq[j].at !== cur.at || uniq[j].len !== cur.len) continue;
      return uniq[(j + 1) % uniq.length];
    }
    return uniq[0];
  }

  /* 卡源口径（与阅读页 poolAll、闪卡页 cardSources 三方共用的唯一定义）：
     kind ∈ {highlight, margin} 且 ≥8 字；**同文高亮只留一张** —— 同一句话划两次
     不该让用户背两遍同一个知识点，被并入的条数在返回值里如实报告。 */
  var DUP_STRIP = /[\s，。、；：！？,.!?;:·…—－"'“”‘’()（）《》〈〉「」『』【】\[\]]/g;
  function poolOf(notes) {
    var seen = {}, list = [], dup = 0;
    (notes || []).forEach(function (n) {
      if (!n || (n.kind !== "highlight" && n.kind !== "margin")) return;
      if (String(n.text || "").length < 8) return;
      var k = String(n.text).replace(DUP_STRIP, "").slice(0, 160);
      if (seen[k]) { dup++; return; }
      seen[k] = 1;
      list.push(n);
    });
    return { list: list, dup: dup };
  }

  /* 渲染用：给出正面 HTML；无候选时 front 是原文、none=true（调用方须按「不出卡」处理） */
  function makeCloze(text, seed, st) {
    var s = String(text);
    var g = st ? clozeFor({ text: s, id: seed }, st) : pickCloze(s, seed);
    if (!g) return { front: esc(s), hole: "", at: -1, len: 0, none: true };
    var hole = s.slice(g.at, g.at + g.len);
    return {
      front: esc(s.slice(0, g.at)) + '<mark class="fc-hole">' + esc(hole) + "</mark>" + esc(s.slice(g.at + g.len)),
      hole: hole, at: g.at, len: g.len, why: g.why
    };
  }

  window.InkSRS = {
    ymd: ymd,
    isDueSt: isDueSt,
    isSusp: isSusp,
    sm2Update: sm2Update,
    RATE: RATE,
    makeCloze: makeCloze,
    pickCloze: pickCloze,
    clozeFor: clozeFor,
    nextCloze: nextCloze,
    snapHole: snapHole,
    poolOf: poolOf
  };
})();
