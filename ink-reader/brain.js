/* ============================================================
   brain.js · 墨读主脑 —— 全程序唯一的 AI 大脑
   ------------------------------------------------------------
   三件事，缺一不可：

   ① 学 —— 主动学习，不是被动接受条件。
      读者做什么，主脑看什么：打卡的时间、划的高亮、调过的字号、
      读到的页、翻过的卡、加过的术语。行为本身就是证据。
      每条记忆都带「证据（why / ev）」与「置信度（conf）」，
      证据不足就不记 —— 宁可少记，不凭空捏造。

   ② 认 —— 上下文装配。
      主脑把「这位读者是谁 + 正在读什么」拼成前言，
      注入本程序里所有 AI 入口（翻译 / 溯源 / 解析 / 检索 / 对话）。
      所以在任何一处，主脑都认识这位读者，而不只在对话框里。

   ③ 答 —— 唯一通路。
      在线：交给读者自己接入的模型（OpenAI 兼容），多轮 + 流式。
      离线：只用离线库（已导入文档原文 / 任务 / 术语表 / 记忆 / 内置卡）。
            离线库里没有的，就直说没有 —— 不装、不编。
   ============================================================ */

(function () {
  "use strict";

  var K_SIG = "inkread.signals.v1";   /* 行为信号（行为摘要，不是原始日志） */
  var K_SEED = "inkread.brain.seeded.v1";

  /* 记忆变动的订阅者。
     学习是异步于页面渲染的（boot 在 DOMContentLoaded 才跑），
     所以任何「显示记忆条数」的界面都不能在解析期读一次就算数 ——
     必须等主脑学完由主脑通知。页面用 Brain.onChange 订阅，不再靠轮询。 */
  var CHANGE_FNS = [];
  function onChange(fn) {
    if (typeof fn === "function" && CHANGE_FNS.indexOf(fn) < 0) CHANGE_FNS.push(fn);
    return function () {
      var i = CHANGE_FNS.indexOf(fn);
      if (i >= 0) CHANGE_FNS.splice(i, 1);
    };
  }
  function emitChange(info) {
    CHANGE_FNS.slice().forEach(function (fn) {
      try { fn(info || {}); } catch (e) {}
    });
  }

  /* ============================================================
     一、行为信号
     信号是「摘要」不是「流水账」：打卡留时间、设置留终值、操作留次数。
     这样学的时候读得动，也不会把 localStorage 撑爆。
     ============================================================ */
  var SIG_DEF = function () {
    return {
      v: 1,
      checkins: [],                    /* [{taskId, time, at}] 最近 120 次打卡 */
      reads: null,                     /* 最近一次的排版 / 显示设置快照 */
      readHits: {},                    /* {字段: 改动次数} —— 改得多的就是真在乎的 */
      notes: { n: 0, kinds: {}, colors: {}, docs: {}, at: 0 },
      ops: { translate: 0, trace: 0, explain: 0, search: 0, chat: 0, tts: 0, gloss: 0 },
      docs: {},                        /* {docId: {opens, pct, at}} */
      learnedAt: 0
    };
  };

  function sigGet() {
    try {
      var v = JSON.parse(localStorage.getItem(K_SIG));
      if (!v || typeof v !== "object") return SIG_DEF();
      var d = SIG_DEF();
      return Object.assign(d, v, {
        notes: Object.assign(d.notes, v.notes || {}),
        ops: Object.assign(d.ops, v.ops || {}),
        readHits: Object.assign({}, v.readHits || {}),
        docs: Object.assign({}, v.docs || {}),
        checkins: Array.isArray(v.checkins) ? v.checkins : []
      });
    } catch (e) { return SIG_DEF(); }
  }
  function sigSet(v) {
    try { localStorage.setItem(K_SIG, JSON.stringify(v)); } catch (e) {}
    return v;
  }
  function nowStamp() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") +
      " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function hmNow() {
    var d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function daysAgo(stamp) {
    var t = Date.parse(String(stamp || "").replace(/-/g, "/"));
    if (isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }

  /* 记录一个行为。kind 见下；data 里放这一行为的关键事实。 */
  function observe(kind, data) {
    var s = sigGet();
    var d = data || {};
    if (kind === "checkin") {
      s.checkins.push({ taskId: d.taskId, time: d.time || hmNow(), at: nowStamp() });
      if (s.checkins.length > 120) s.checkins = s.checkins.slice(-120);
    } else if (kind === "uncheckin") {
      for (var i = s.checkins.length - 1; i >= 0; i--) {
        if (s.checkins[i].taskId === d.taskId) { s.checkins.splice(i, 1); break; }
      }
    } else if (kind === "read") {
      var prev = s.reads || {};
      Object.keys(d.patch || {}).forEach(function (k) {
        if (prev[k] !== d.patch[k]) s.readHits[k] = (s.readHits[k] || 0) + 1;
      });
      s.reads = Object.assign({}, prev, d.patch || {});
    } else if (kind === "note") {
      s.notes.n++;
      var nk = d.ntype || "md", ck2 = d.color || "ink";
      s.notes.kinds[nk] = (s.notes.kinds[nk] || 0) + 1;
      s.notes.colors[ck2] = (s.notes.colors[ck2] || 0) + 1;
      if (d.docId) s.notes.docs[d.docId] = (s.notes.docs[d.docId] || 0) + 1;
      s.notes.at = Date.now();
    } else if (kind === "progress") {
      var doc = s.docs[d.docId] || { opens: 0, pct: 0, at: 0 };
      doc.opens++;
      doc.pct = Math.max(doc.pct || 0, Number(d.pct) || 0);
      doc.at = Date.now();
      s.docs[d.docId] = doc;
    } else if (kind === "open") {
      var dc = s.docs[d.docId] || { opens: 0, pct: 0, at: 0 };
      dc.opens++;
      dc.at = Date.now();
      s.docs[d.docId] = dc;
    } else if (s.ops[kind] != null) {
      s.ops[kind]++;
    } else {
      s.ops[kind] = (s.ops[kind] || 0) + 1;
    }
    sigSet(s);
    scheduleLearn();
    return s;
  }

  /* 首次运行：把应用里既有的真实数据折成信号 —— 这不是预置记忆，
     而是「主脑第一次睁眼时读到的东西」（设置、笔记、打卡、进度）。 */
  function seedSignals() {
    if (localStorage.getItem(K_SEED)) return;
    /* v2.11 B2：用户主动清空过（哨兵在，键名故意不带 inkread. 前缀）→ 不播演示信号 */
    var cleared = false;
    try { cleared = localStorage.getItem("inkread-cleared.v1") === "1"; } catch (e) {}
    if (cleared) { try { localStorage.setItem(K_SEED, "1"); } catch (e) {} return; }
    var s = sigGet();
    if (window.InkStore && InkStore.getRead) s.reads = Object.assign({}, InkStore.getRead());
    if (window.InkStore && InkStore.getCheckins) {
      var ck = InkStore.getCheckins();
      s.checkins = Object.keys(ck).map(function (id) { return { taskId: id, time: ck[id], at: nowStamp() }; });
    }
    if (window.InkStore && InkStore.getProgress) {
      var pr = InkStore.getProgress();
      Object.keys(pr).forEach(function (id) { s.docs[id] = { opens: 1, pct: pr[id], at: Date.now() }; });
    }
    sigSet(s);
    try { localStorage.setItem(K_SEED, "1"); } catch (e) {}
  }

  /* ============================================================
     二、学习引擎
     每个 learner 读「信号 + 原始库」，产出记忆候选：
       {key, kind, text, why, ev, conf, src}
     key 是身份：同一件事只留一条，重复学习只更新证据与置信度。
     ============================================================ */

  /* 领域词表：用来从批注里看出「这位读者反复在意什么」。
     不做通用分词（离线、无依赖），只用「已知术语 + 字串共现」两路证据。 */
  function domainTerms() {
    var out = [], seen = {};
    var push = function (w) {
      w = String(w || "").trim();
      if (w.length >= 2 && w.length <= 8 && !seen[w]) { seen[w] = 1; out.push(w); }
    };
    /* ① 术语表里的词 —— 读者自己认可的概念 */
    try {
      if (window.DB && DB.tasks) DB.tasks.forEach(function (t) { (String(t.title || "").match(/[\u4e00-\u9fff]{2,6}/g) || []).forEach(push); });
    } catch (e) {}
    /* ② 批注标题里出现 ≥2 次的连续汉字片段 */
    var notes = (window.InkStore && InkStore.getNotes()) || [];
    var freq = {};
    notes.forEach(function (n) {
      var txt = String((n.title || "") + " " + (n.text || "") + " " + (n.body || ""));
      (txt.match(/[\u4e00-\u9fff]{2,6}/g) || []).forEach(function (w) {
        if (/^(这个|那个|什么|因为|所以|可以|我们|他们|一个|以及|或者|但是|如果|就是|没有|不是|已经|还是|这样|那样|需要|进行|通过|对于|关于|其中|其中|一样|一起)$/.test(w)) return;
        freq[w] = (freq[w] || 0) + 1;
      });
    });
    Object.keys(freq).filter(function (w) { return freq[w] >= 2; })
      .sort(function (a, b) { return freq[b] - freq[a] || b.length - a.length; })
      .forEach(push);
    return out.slice(0, 24);
  }

  function noteDigest() {
    var notes = (window.InkStore && InkStore.getNotes()) || [];
    var d = { n: notes.length, kinds: {}, colors: {}, docs: {}, terms: [] };
    notes.forEach(function (n) {
      var k = n.kind || "note", c = n.color || "ink";
      d.kinds[k] = (d.kinds[k] || 0) + 1;
      d.colors[c] = (d.colors[c] || 0) + 1;
      if (n.docId) d.docs[n.docId] = (d.docs[n.docId] || 0) + 1;
    });
    d.terms = domainTerms();
    return d;
  }

  function topKey(obj) {
    var best = null, n = 0;
    Object.keys(obj || {}).forEach(function (k) { if (obj[k] > n) { n = obj[k]; best = k; } });
    return best ? { k: best, n: n } : null;
  }

  var KIND_CN = { highlight: "高亮", note: "笔记", bookmark: "书签", margin: "随笔" };
  var COLOR_CN = { accent: "朱砂", blue: "靛", green: "苔绿", amber: "藤黄", ink: "墨色" };

  var LEARNERS = [
    /* ---- 1. 打卡钟点：从真实打卡时间里长出「你几点在读书」 ---- */
    function (s) {
      var times = (s.checkins || []).map(function (c) { return String(c.time || "").slice(0, 2); })
        .filter(function (h) { return /^\d{2}$/.test(h); });
      if (times.length < 3) return [];
      var freq = {};
      times.forEach(function (h) { freq[h] = (freq[h] || 0) + 1; });
      var top = topKey(freq);
      if (!top || top.n < 3) return [];
      var hh = top.k;
      var span = (s.checkins || []).length;
      return [{
        key: "clock", kind: "habit", src: "打卡记录",
        text: "常在 " + hh + ":00 前后完成打卡（" + top.n + " 次落在这一时段）",
        why: "证据：共 " + span + " 次打卡，其中 " + top.n + " 次集中在 " + hh + " 点档。",
        ev: { hour: hh, hits: top.n, total: span },
        conf: Math.min(0.96, 0.55 + top.n * 0.06)
      }];
    },

    /* ---- 2. 坚持度：连续打卡与完成率 ---- */
    function (s, ctx) {
      var out = [];
      var streak = window.InkStats ? Number(InkStats.streakSmart()) || 0 : 0;
      if (streak >= 5) {
        out.push({
          key: "streak", kind: "habit", src: "打卡记录",
          text: "已连续打卡 " + streak + " 天，处于稳定执行期",
          why: "证据：连续打卡 " + streak + " 天（未中断）。",
          ev: { streak: streak },
          conf: Math.min(0.97, 0.6 + streak * 0.015)
        });
      }
      var daily = ctx.dailyTasks, ck = ctx.checkins;
      if (daily.length && Object.keys(ck).length >= 2) {
        var done = daily.filter(function (t) { return ck[t.id]; }).length;
        var rate = Math.round(done / daily.length * 100);
        out.push({
          key: "dailyrate", kind: "habit", src: "打卡记录",
          text: "每日任务完成率约 " + rate + "%（当前 " + done + "/" + daily.length + " 项）",
          why: "证据：每日清单 " + daily.length + " 项，已勾选 " + done + " 项。",
          ev: { done: done, total: daily.length, rate: rate },
          conf: 0.62
        });
      }
      return out;
    },

    /* ---- 3. 排版偏好：读者亲手调出来的字号、行高、字体、主题 ---- */
    function (s, ctx) {
      var r = ctx.read || {};
      var hits = s.readHits || {};
      var bits = [];
      if (r.fs) bits.push(r.fs + "px 字号");
      if (r.lh) bits.push("行高 " + r.lh);
      if (r.font) bits.push({ serif: "衬线", sans: "无衬线" }[r.font] || r.font);
      if (r.align) bits.push({ left: "左对齐", justify: "两端对齐", center: "居中" }[r.align] || r.align);
      if (!bits.length) return [];
      var touched = Object.keys(hits).filter(function (k) { return hits[k] > 0; }).length;
      return [{
        key: "typo", kind: "pref", src: "排版设置",
        text: "正文偏好 " + bits.join(" · ") + (r.twoCol ? " · 双栏" : " · 单栏"),
        why: "证据：当前排版为 " + bits.join(" / ") + "，栏宽 " + (r.fw || "—") + "px；" +
          (touched ? "你先后调整过 " + touched + " 项排版设置。" : "取自你的排版面板选择。"),
        ev: { fs: r.fs, lh: r.lh, font: r.font, align: r.align, fw: r.fw, twoCol: !!r.twoCol, touched: touched },
        conf: Math.min(0.97, 0.8 + Math.min(0.15, touched * 0.03))
      }];
    },

    /* ---- 4. 主题与夜间：什么时候开夜读，是习惯不是设置 ---- */
    function (s, ctx) {
      var r = ctx.read || {};
      var out = [];
      var t = ctx.themeName(r.theme);
      if (t) {
        out.push({
          key: "theme", kind: "pref", src: "外观设置",
          text: "常驻主题「" + t + "」" + (r.night ? "，" + (r.night === "on" ? "夜读常开" : "夜间自动") : ""),
          why: "证据：当前主题为「" + t + "」，夜间阅读为 " +
            ({ on: "常开", auto: "自动", off: "关闭" }[r.night] || "关闭") + "。",
          ev: { theme: r.theme, night: r.night, nightAt: r.nightAt, nightSense: r.nightSense },
          conf: 0.88
        });
      }
      if (r.flip) {
        out.push({
          key: "flip", kind: "pref", src: "外观设置",
          text: "翻页动效偏好「" + ({ curl: "卷页", slide: "平移", fade: "淡入", cover: "覆盖", none: "直切" }[r.flip] || r.flip) + "」" +
            (r.reduce ? "，并开启了减少动效" : ""),
          why: "证据：外观面板中翻页动效设为 " + r.flip + (r.reduce ? "，减少动效已开。" : "。"),
          ev: { flip: r.flip, reduce: !!r.reduce },
          conf: 0.78
        });
      }
      return out;
    },

    /* ---- 5. 笔记习惯：怎么记、记什么颜色、在哪本书上记得最多 ---- */
    function (s, ctx) {
      var d = ctx.noteDigest;
      if (!d.n) return [];
      var out = [];
      var kind = topKey(d.kinds), color = topKey(d.colors), doc = topKey(d.docs);
      var bits = [];
      if (kind) bits.push("以「" + (KIND_CN[kind.k] || kind.k) + "」为主（" + kind.n + "/" + d.n + " 条）");
      if (color) bits.push("常用" + (COLOR_CN[color.k] || color.k));
      if (bits.length) {
        out.push({
          key: "notehabit", kind: "habit", src: "批注记录",
          text: "做笔记" + bits.join("，"),
          why: "证据：共 " + d.n + " 条笔记，其中" +
            (kind ? (KIND_CN[kind.k] || kind.k) + " " + kind.n + " 条" : "") +
            (color ? "，" + (COLOR_CN[color.k] || color.k) + " " + color.n + " 条" : "") + "。",
          ev: { total: d.n, kinds: d.kinds, colors: d.colors },
          conf: Math.min(0.95, 0.6 + d.n * 0.02)
        });
      }
      if (doc && doc.n >= 2) {
        var name = ctx.docTitle(doc.k);
        if (name) out.push({
          key: "notedoc", kind: "habit", src: "批注记录",
          text: "在《" + name + "》上批注最密（" + doc.n + " 条）",
          why: "证据：这本书上的笔记占全部笔记的 " + Math.round(doc.n / d.n * 100) + "%。",
          ev: { docId: doc.k, n: doc.n, total: d.n },
          conf: Math.min(0.94, 0.6 + doc.n * 0.04)
        });
      }
      if (d.terms.length >= 2) {
        out.push({
          key: "interest", kind: "interest", src: "批注记录",
          text: "反复关注：" + d.terms.slice(0, 4).join(" · "),
          why: "证据：这些词在你的高亮与批注里各出现 ≥2 次。",
          ev: { terms: d.terms.slice(0, 8) },
          conf: Math.min(0.9, 0.55 + d.terms.length * 0.04)
        });
      }
      return out;
    },

    /* ---- 6. 阅读进度：读到哪了 ---- */
    function (s, ctx) {
      var out = [];
      var list = Object.keys(s.docs || {}).map(function (id) {
        return { id: id, pct: s.docs[id].pct || 0, opens: s.docs[id].opens || 0 };
      }).filter(function (d) { return d.pct >= 5; }).sort(function (a, b) { return b.pct - a.pct; });
      if (list.length) {
        var t = ctx.docTitle(list[0].id);
        if (t) out.push({
          key: "progress", kind: "state", src: "阅读进度",
          text: "正在读《" + t + "》，已到 " + Math.round(list[0].pct) + "%",
          why: "证据：阅读进度记录 " + Math.round(list[0].pct) + "%，进入阅读 " + list[0].opens + " 次。",
          ev: { docId: list[0].id, pct: list[0].pct, opens: list[0].opens },
          conf: 0.9
        });
      }
      var load = window.InkStats ? { sec: InkStats.range("day").sec, words: InkStats.range("week").words } : null;
      if (load && (load.sec || load.words)) {
        out.push({
          key: "load", kind: "state", src: "阅读记录",
          text: "阅读节奏：今日 " + InkStats.fmtSec(load.sec).join(" ") + "、本周 " + InkStats.fmtWords(load.words).join(" "),
          why: "证据：本机统计（inkread.stats.v1）今日阅读 " + InkStats.fmtSec(load.sec).join(" ") + "，本周累计 " + Math.round(load.words) + " 字。",
          ev: { readSec: load.sec, weekWords: load.words },
          conf: 0.72
        });
      }
      return out;
    },

    /* ---- 7. 闪卡：反复记不住的，才是真该加练的 ---- */
    function (s, ctx) {
      var cards = ctx.cards || {};
      var ids = Object.keys(cards);
      if (!ids.length) return [];
      var weak = ids.filter(function (id) {
        var c = cards[id] || {};
        return (c.reps || 0) >= 2 && (c.ivl || 0) <= 2;
      });
      if (!weak.length) return [];
      return [{
        key: "cards", kind: "state", src: "闪卡记录",
        text: "有 " + weak.length + " 张卡反复遗忘，间隔一直压在一两天内",
        why: "证据：" + weak.length + " 张卡复习 ≥2 次后间隔仍 ≤2 天 —— 属于难记项，建议加练。",
        ev: { weak: weak.slice(0, 12), total: ids.length },
        conf: Math.min(0.93, 0.6 + weak.length * 0.05)
      }];
    },

    /* ---- 8. 术语表：读者自己定的译名 ---- */
    function (s, ctx) {
      var g = ctx.gloss || [];
      if (g.length < 3) return [];
      return [{
        key: "gloss", kind: "pref", src: "术语表",
        text: "自建术语 " + g.length + " 条，翻译一律按你的译名统一",
        why: "证据：你在术语表里新增了 " + g.length + " 条译名，例：" +
          g.slice(0, 3).map(function (t) { return t.src + "→" + t.dst; }).join("、") + "。",
        ev: { n: g.length, sample: g.slice(0, 6) },
        conf: Math.min(0.95, 0.7 + g.length * 0.03)
      }];
    },

    /* ---- 9. 用法：常做翻译 / 常考据出处 / 常检索 ---- */
    function (s) {
      var o = s.ops || {}, out = [];
      if ((o.translate || 0) >= 3) out.push({
        key: "use-tr", kind: "habit", src: "使用行为",
        text: "常做对照翻译（已 " + o.translate + " 次），偏好边读边看译文",
        why: "证据：本机记录到 " + o.translate + " 次翻译调用。",
        ev: { n: o.translate }, conf: Math.min(0.9, 0.6 + o.translate * 0.04)
      });
      if ((o.trace || 0) >= 2) out.push({
        key: "use-tr2", kind: "habit", src: "使用行为",
        text: "常考据来处（已 " + o.trace + " 次），读到不懂的东西会追出处",
        why: "证据：本机记录到 " + o.trace + " 次溯源考据。",
        ev: { n: o.trace }, conf: Math.min(0.9, 0.6 + o.trace * 0.05)
      });
      if ((o.search || 0) >= 3) out.push({
        key: "use-search", kind: "habit", src: "使用行为",
        text: "习惯用模糊描述找段落（已 " + o.search + " 次检索）",
        why: "证据：本机记录到 " + o.search + " 次检索。",
        ev: { n: o.search }, conf: Math.min(0.88, 0.58 + o.search * 0.04)
      });
      return out;
    },

    /* ---- 10. 阅读节奏（v2.7）：从本机统计里算出「一天读多久、能坚持几天」 ----
       数据源是 inkread.stats.v1 的逐日记录（近 14 天）。没有逐时数据，
       就不硬编「常读时段」—— 只讲能证实的：日均时长、最长单日、有效天数占比。
       证据不足（不足 3 天有阅读，或日均不到 10 分钟）不产 —— 与其它 learner 同一约定。 */
    function (s, ctx) {
      var days = ctx.statsDays || {};
      var now = new Date();
      var list = [];
      for (var i = 0; i < 14; i++) {
        var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        var r = days[key] || {};
        list.push({ key: key, sec: Number(r.sec) || 0, words: Number(r.words) || 0, checks: Number(r.checks) || 0 });
      }
      var active = list.filter(function (x) { return x.sec > 0; });
      if (active.length < 3) return [];
      var totalSec = active.reduce(function (a, x) { return a + x.sec; }, 0);
      var avgMin = Math.round(totalSec / 60 / active.length);
      if (avgMin < 10) return [];
      var max = active.reduce(function (a, x) { return x.sec > a.sec ? x : a; }, active[0]);
      var maxMin = Math.round(max.sec / 60);
      var cover = Math.round(active.length / 14 * 100);
      return [{
        key: "pace", kind: "habit", src: "阅读统计",
        text: "近两周日均阅读 " + avgMin + " 分钟，最长单日 " + maxMin + " 分钟",
        why: "证据：近 14 天共读 " + Math.round(totalSec / 60) + " 分钟，有效阅读 " + active.length + " 天（占比 " + cover + "%）。",
        ev: { span: 14, days: active.length, totalMin: Math.round(totalSec / 60), avgMin: avgMin,
              maxMin: maxMin, maxDay: max.key, cover: cover, sec: totalSec },
        conf: Math.min(0.9, 0.5 + active.length * 0.05)
      }];
    },

    /* ---- 11. 阅读速度（v2.8）：从按类别累积的 words/sec 学出「你读得有多快」 ----
       门槛比显示侧更严（单词类 ≥1200 字、≥240 秒），记忆要更稳；
       多类别时在文本里列出差异（主脑由此知道「读文献偏慢、读小说偏快」）。 */
    function () {
      var map = {};
      try { map = JSON.parse(localStorage.getItem("inkread.speedmap.v1")) || {}; } catch (e) { map = {}; }
      var NAME = { book: "书籍", textbook: "教材", paper: "论文", report: "报告", plan: "计划", note: "笔记", comic: "漫画", other: "其他" };
      var ks = Object.keys(map).filter(function (k) {
        var r = map[k];
        return r && Number(r.words) >= 1200 && Number(r.sec) >= 240;
      });
      if (!ks.length) return [];
      var w = 0, sec = 0;
      ks.forEach(function (k) { w += Number(map[k].words) || 0; sec += Number(map[k].sec) || 0; });
      var wpm = Math.round(w / Math.max(1, sec) * 60);
      if (!(wpm >= 80 && wpm <= 1200)) return [];
      var detail = ks.map(function (k) {
        return (NAME[k] || k) + "约 " + Math.round(Number(map[k].words) / Math.max(1, Number(map[k].sec)) * 60) + " 字/分";
      }).join("、");
      return [{
        key: "speed", kind: "habit", src: "阅读统计",
        text: "阅读速度约 " + wpm + " 字/分" + (ks.length >= 2 ? "（" + detail + "）" : ""),
        why: "证据：按你实际读过的字数与时长累计 —— " + detail + "；剩余时间估算已按此校准。",
        ev: { wpm: wpm, kinds: ks.length, words: Math.round(w) },
        conf: Math.min(0.9, 0.55 + ks.length * 0.08 + (w >= 8000 ? 0.1 : 0))
      }];
    }
  ];

  /* 学习：跑一遍所有 learner，与既有记忆合并。
     合并规则 —— 以 key 为准：
       · 已有同 key：更新 text/why/ev/conf/at，保留读者的 on 开关；
       · 新 key：追加；
       · 置信度低于门槛：丢弃（证据不足就不记）；
       · 本次没再出现的 key：保留（读者可能正需要它），但不再更新证据。 */
  function learn(opts) {
    var o = opts || {};
    var s = sigGet();
    var ctx = {
      read: (window.InkStore && InkStore.getRead && InkStore.getRead()) || {},
      checkins: (window.InkStore && InkStore.getCheckins && InkStore.getCheckins()) || {},
      dailyTasks: ((window.DB && DB.tasks) || []).filter(function (t) { return t.kind === "daily"; }),
      noteDigest: noteDigest(),
      cards: readCards(),
      gloss: readGloss(),
      themeName: themeName,
      docTitle: docTitle,
      statsDays: readStatsDays()
    };

    var cands = [];
    LEARNERS.forEach(function (fn) {
      try { cands = cands.concat(fn(s, ctx) || []); } catch (e) {}
    });

    var prev = (window.API && API.memList) ? API.memList() : [];
    var byKey = {};
    prev.forEach(function (m) { if (m && m.key) byKey[m.key] = m; });

    var learned = 0, updated = 0;
    cands.forEach(function (c) {
      if (!c || !c.key || !c.text) return;
      if ((c.conf || 0) < 0.4) return;
      var old = byKey[c.key];
      var on = old ? old.on !== false : true;
      var same = old && old.text === c.text && Math.abs((old.conf || 0) - (c.conf || 0)) < 0.02;
      var next = {
        id: "m-" + c.key, key: c.key, kind: c.kind || "habit",
        text: c.text, why: c.why || "", ev: c.ev || {},
        conf: Math.round((c.conf || 0) * 100) / 100,
        at: same && old.at ? old.at : nowStamp(),
        on: on, src: c.src || "行为"
      };
      byKey[c.key] = next;
      if (!old) learned++; else if (!same) updated++;
    });

    var list = Object.keys(byKey).map(function (k) { return byKey[k]; })
      .sort(function (a, b) { return (b.conf || 0) - (a.conf || 0); });

    if (window.API && API.memWrite) API.memWrite(list);
    s.learnedAt = Date.now();
    sigSet(s);

    if (learned || updated) emitChange({ learned: learned, updated: updated, total: list.length });

    if (!o.silent && (learned || updated)) {
      var msg = learned ? "主脑学到 " + learned + " 条新记忆" : "主脑更新了 " + updated + " 条记忆";
      if (window.toast) toast(msg, "brain");
    }
    return { learned: learned, updated: updated, list: list };
  }

  function readCards() {
    try { return JSON.parse(localStorage.getItem("inkread.cards.v1")) || {}; } catch (e) { return {}; }
  }
  function readGloss() {
    try {
      var v = JSON.parse(localStorage.getItem("inkread.glossary.v1"));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  /* v2.7：本机阅读统计的逐日原始记录（阅读节奏 learner 用）。
     api.js 的 statsRange 只给汇总，学习者要的是近 14 天的逐日分布 ——
     直接读同一份存储（inkread.stats.v1），不额外造接口。 */
  function readStatsDays() {
    try {
      var v = JSON.parse(localStorage.getItem("inkread.stats.v1"));
      return (v && v.days && typeof v.days === "object") ? v.days : {};
    } catch (e) { return {}; }
  }

  /* 学习节流：行为连着来的时候不反复重算 */
  var learnTimer = null;
  function scheduleLearn() {
    if (learnTimer) clearTimeout(learnTimer);
    learnTimer = setTimeout(function () { learnTimer = null; learn({ silent: true }); }, 900);
  }

  /* ============================================================
     三、上下文装配
     主脑的「认识你」不是一句口号：它把记忆、行为、当前文档拼成前言，
     下发给本程序里每一个 AI 入口。
     ============================================================ */
  var CUR_DOC = null;      /* 主脑当前认的文档（阅读页会设） */

  function memList() { return (window.API && API.memList) ? API.memList() : []; }
  function enabledMems() { return memList().filter(function (m) { return m && m.on !== false; }); }

  /* 相关性：问题里的字词与记忆文本 / 领域词的重叠。
     中文没有词间空格，用 2-gram 字符片算重叠才稳。 */
  function grams(s) {
    s = String(s || "").toLowerCase().replace(/[\s，。！？、；：""''（）《》〈〉…—,.!?;:'"()\[\]<>]/g, "");
    var out = [], seen = {};
    for (var i = 0; i + 2 <= s.length; i++) {
      var g = s.slice(i, i + 2);
      if (!seen[g]) { seen[g] = 1; out.push(g); }
    }
    return out;
  }
  function memScore(q, m) {
    var qs = grams(q), t = String(m.text || "") + " " + String(m.why || "") + " " +
      ((m.ev && m.ev.terms) ? m.ev.terms.join(" ") : "");
    t = t.toLowerCase();
    var s = 0;
    qs.forEach(function (g) { if (t.indexOf(g) >= 0) s += 1; });
    var kindBoost = { habit: 0.6, pref: 0.5, state: 0.7, interest: 0.55 }[m.kind] || 0.4;
    return s / Math.sqrt(1 + qs.length / 3) + kindBoost * 0.35;
  }
  function pickMems(q, n) {
    var list = enabledMems().map(function (m) { return { m: m, s: memScore(q, m) }; });
    list.sort(function (a, b) { return b.s - a.s || (b.m.conf || 0) - (a.m.conf || 0); });
    var hits = list.filter(function (x) { return x.s >= 0.55; }).slice(0, n || 4);
    if (!hits.length) hits = list.slice(0, 2).filter(function (x) { return (x.m.conf || 0) >= 0.75; });
    return hits.map(function (x) { return x.m; });
  }

  function memLine(m) {
    return "- " + m.text + "（" + (m.src || "行为") + " · 置信 " + Math.round((m.conf || 0) * 100) + "%）";
  }

  /* ---------- v2.2 · 记忆指令：手动记忆通道 ----------
     调研对齐（ChatGPT Memory 2025 最佳实践：让用户能亲口教、能纠正、能审计）：
       ①「记住 X」→ 即刻存为高置信记忆（src 标明「你亲口说的」）并回执；
       ②「忘掉 X」→ 语义匹配到对应记忆真删除（不是关掉），找不到就列出候选；
       ③「你记得我什么」→ 列出现有记忆（含置信度与来源）。
     命令优先于模型：命中即办，不消耗 token，在线/离线一致。 */
  function memIntent(q) {
    var m, list = memList();
    var d = new Date();
    var pad2 = function (n) { return ("0" + n).slice(-2); };
    var today = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());

    /* ① 记住 */
    m = q.match(/^(?:请|麻烦|帮我|给我)?\s*(?:记住|记一下|记下|记录一下|记着)[：:，,。\s]+(.+)$/);
    if (m) {
      var text = m[1].trim().replace(/[。！？!?]+$/, "");
      if (text.length >= 2) {
        var hit = null;
        for (var i = 0; i < list.length; i++) if (list[i].text === text) { hit = list[i]; break; }
        var mem = {
          id: hit ? hit.id : "m-user-" + Date.now().toString(36),
          key: hit ? hit.key : "m-user-" + Date.now().toString(36),
          kind: "user", src: "你亲口说的", text: text,
          why: "你在对话里明确要求记住，无需行为证据。",
          ev: {}, conf: 0.99, on: true, at: today
        };
        var next = hit
          ? list.map(function (x) { return x.id === hit.id ? Object.assign({}, x, mem) : x; })
          : list.concat([mem]);
        if (window.API && API.memWrite) API.memWrite(next);
        emitChange({ learned: hit ? 0 : 1, updated: hit ? 1 : 0, total: next.length, source: "user" });
        return {
          reply: "好，记住了：**" + text + "**\n\n" +
            (hit ? "这条原本就在记忆里，已按你说的更新。" : "这条由你亲口所说，置信度取最高（99%），从今往后每轮对话都会带上它。") +
            "\n想改或想删，点上方「" + next.length + " 条记忆」随时处理。",
          refs: [mem.id], mode: "memory", action: "remember"
        };
      }
    }

    /* ② 忘掉（语义匹配最近的记忆；真删除） */
    m = q.match(/^(?:请|麻烦|帮我)?\s*(?:忘掉|忘记|别记着|别记|不要记|删除记忆|删掉记忆)[：:，,。\s]*(.+)$/);
    if (m) {
      var target = m[1].trim();
      var cands = list.map(function (x) { return { m: x, s: memScore(target, x) }; })
        .sort(function (a, b) { return b.s - a.s; });
      var best = cands[0];
      if (best && best.s >= 0.45) {
        if (window.API && API.memWrite) API.memWrite(list.filter(function (x) { return x.id !== best.m.id; }));
        emitChange({ source: "forget", id: best.m.id, total: list.length - 1 });
        return {
          reply: "已经忘掉了：「" + best.m.text + "」\n\n（这是真删除，不是关掉——相关证据再攒够时，有可能重新学出来。）",
          refs: [], mode: "memory", action: "forget"
        };
      }
      var tail = list.length
        ? "\n\n当前记着这些：" + list.slice(0, 6).map(function (x) { return "「" + x.text.slice(0, 18) + "」"; }).join("、") +
          (list.length > 6 ? " 等 " + list.length + " 条" : "")
        : "\n\n目前还没有任何记忆。";
      return { reply: "没找到和「" + target + "」对得上的记忆。" + tail, refs: [], mode: "memory", action: "miss" };
    }

    /* ③ 你记得我什么 */
    if (/^(?:你记得我什么|你记住了什么|你记得什么|看看你的记忆|记忆列表|我的记忆)[？?]?$/.test(q)) {
      if (!list.length) {
        return {
          reply: "现在还什么都没记 —— 多读几页、划几条高亮、打几次卡，证据攒够了记忆会自己长出来；\n也可以直接对我说「记住：我在备考雅思，12 月考试」这样教我。",
          refs: [], mode: "memory", action: "list"
        };
      }
      var body = list.map(function (x, idx) {
        return (idx + 1) + ". " + x.text + "（" + Math.round((x.conf || 0) * 100) + "% · " + (x.src || "行为") +
          (x.on === false ? " · 已停用" : "") + "）";
      }).join("\n");
      return {
        reply: "我记得这些（共 " + list.length + " 条）：\n\n" + body +
          "\n\n都可以说「忘掉 …」删掉；点上方「" + list.length + " 条记忆」可逐条开关、编辑。",
        refs: list.slice(0, 4).map(function (x) { return x.id; }), mode: "memory", action: "list"
      };
    }
    return null;
  }

  function behaviorBrief() {
    var s = sigGet();
    var bits = [];
    var ck = (window.InkStore && InkStore.getCheckins && InkStore.getCheckins()) || {};
    var daily = ((window.DB && DB.tasks) || []).filter(function (t) { return t.kind === "daily"; });
    if (daily.length) {
      var done = daily.filter(function (t) { return ck[t.id]; }).length;
      bits.push("今日打卡 " + done + "/" + daily.length);
    }
    if (window.InkStats) {
      var st = InkStats.streakSmart();
      if (st) bits.push("连续 " + st + " 天");
      var ds = InkStats.range("day").sec;
      if (ds) bits.push("今日已读 " + InkStats.fmtSec(ds).join(" "));
    }
    var notes = (window.InkStore && InkStore.getNotes && InkStore.getNotes()) || [];
    if (notes.length) bits.push("笔记 " + notes.length + " 条");
    return bits.join(" · ");
  }

  function docBrief() {
    var d = CUR_DOC ? docMeta(CUR_DOC) : null;
    if (!d) return "";
    /* 只报书名等于没报（v2.23 W1b）：模型拿到「《X》」三个字，仍然不知道这是一本
       多长、分几节、读者读到哪儿的书。补上体量与进度，它才谈得出「这本书」。 */
    var bs = blocksOf(d.id);
    var s = "《" + d.title + "》" + (d.author ? "（" + d.author + "）" : "");
    s += bs.length ? " · 正文 " + bs.length + " 块 / " + chaptersOf(bs).length + " 节" : " · 本机没有它的正文";
    if (d.words) s += " · 约 " + d.words + " 字";
    if (d.pages) s += " / " + d.pages + " 页";
    if (d.progress) s += " · 读者读到 " + d.progress + "%";
    return s;
  }

  /* ---------- v2.7 阅读统计摘要（主脑「对一切数据了如指掌」的入口） ----------
     全部走 api.js 的统计层；接口不存在（纯桩环境 / 老版本）就整段跳过 —— 不编数字。 */
  function spanText(sec) {                       /* 秒 → 人话：分钟 <60 显示分钟，否则小时 */
    var m = Math.round((Number(sec) || 0) / 60);
    if (m < 60) return m + " 分钟";
    return (m / 60).toFixed(1).replace(/\.0$/, "") + " 小时";
  }
  function wordText(n) {                         /* 字 → 人话：过万折「万字」 */
    n = Math.max(0, Math.round(Number(n) || 0));
    if (n < 10000) return n + " 字";
    return (n / 10000).toFixed(1).replace(/\.0$/, "") + " 万字";
  }
  /* 今日 X 分钟 / 本周 Y 字 / 累计 Z 小时 W 万字 / 连续打卡 N 天 / 有效阅读 M 天 */
  function statsBrief() {
    if (!window.API || !API.statsToday || !API.statsRange || !API.statsStreak) return "";
    try {
      var t = API.statsToday() || {};
      var w = API.statsRange("week") || {};
      var a = API.statsRange("total") || {};
      var k = API.statsStreak() || {};
      return "今日 " + spanText(t.sec) + " / 本周 " + wordText(w.words) +
        " / 累计 " + spanText(a.sec) + " " + wordText(a.words) +
        " / 连续打卡 " + (k.streak || 0) + " 天 / 有效阅读 " + (k.activeDays || 0) + " 天";
    } catch (e) { return ""; }
  }

  /* 主脑前言：所有 AI 入口共用。
     chat 要完整（它是对话的主战场）；其他入口（翻译 / 检索 / 解析 / 溯源）
     只要「别把我当陌生人」—— 给文档与少量记忆，不给一堆无关上下文。 */
  function preamble(kind) {
    var k = kind || "chat";
    var mems = enabledMems();
    var lines = [];
    if (k === "chat") {
      lines.push("【关于这位读者 · 主脑从行为中学到的】");
      if (mems.length) lines.push(mems.slice(0, 8).map(memLine).join("\n"));
      else lines.push("- 暂无 —— 读者的行为还不足以支撑结论，不要编造。");
      var b = behaviorBrief();
      if (b) lines.push("【行为摘要】" + b);
      var sb = statsBrief();
      if (sb) lines.push("【阅读统计 · 实时】" + sb);
      var db = docBrief();
      lines.push(db ? "【当前文档】" + db : "【当前文档】读者未指定，可在书架范围内作答");
    } else {
      var short = [];
      var db2 = docBrief();
      if (db2) short.push("当前文档 " + db2);
      var top = mems.slice(0, 2);
      if (top.length) short.push("读者：" + top.map(function (m) { return m.text; }).join("；"));
      if (short.length) lines.push("【主脑上下文 · " + k + "】" + short.join("。") + "。");
    }
    return lines.join("\n");
  }

  /* ============================================================
     四、文档库（离线库的正文部分）
     ============================================================ */
  function shelf() { return (window.shelfList && shelfList()) || (window.DB && DB.shelf) || []; }
  function docMeta(id) { return shelf().find(function (d) { return d.id === id; }) || null; }
  function docTitle(id) { var d = docMeta(id); return d ? d.title : ""; }
  /* 主题 key → 可读名（"paper" → "宣纸"）。名字只有 theme.js 知道，这里问它要；
     问不到就退回 key 本身，不编一个假名。 */
  function themeName(k) {
    if (!k) return "";
    try {
      if (window.InkTheme && InkTheme.metaOf) {
        var t = InkTheme.metaOf(k);
        if (t && t.name) return t.name;
      }
    } catch (e) {}
    return String(k);
  }

  /* 正文块的两个来源（v2.23 W1b）：导入的书落在本机正文库（inkread.contents.v1，经 API.localContent），
     随包样书在 mock 的 DB.contents。过去这里只读后者 —— 用户导入的每一本书，
     在主脑的检索、摘要、对话里都是「零块」，等于主脑看不见他的藏书。
     顺序与 reader.html 的 sourceBlocks 一致：本机库优先，取不到再回 mock。 */
  function blocksOf(id) {
    if (id && window.API && API.localContent) {
      try {
        var c = API.localContent(id);
        if (c && c.length) return c;
      } catch (e) {}
    }
    var m = window.DB && DB.contents && DB.contents[id];
    return Array.isArray(m) ? m : [];
  }

  /* 把一个块摊成可检索的文字 */
  function blockText(b) {
    if (!b) return "";
    if (b.type === "table") return (b.head || []).join(" ") + " " + (b.rows || []).map(function (r) { return r.join(" "); }).join(" ");
    if (b.type === "list" || b.type === "olist" || b.type === "kw" || b.type === "refs") {
      return (b.items || []).map(function (i) { return typeof i === "string" ? i : (i && i.x) || ""; }).join("；");
    }
    if (b.type === "fig") return [b.cap, b.note].filter(Boolean).join(" ");
    return b.x || b.label || "";
  }

  /* 全库语料：每本书的每个块 → {bi, anchor, chapter, page, pct, text, docId, docTitle} */
  function corpus(docId) {
    var out = [];
    var list = docId ? shelf().filter(function (d) { return d.id === docId; }) : shelf();
    list.forEach(function (d) {
      var bs = blocksOf(d.id);
      if (!bs.length) return;
      var chap = d.title, perPage = Math.max(1, Math.ceil(bs.length / Math.max(1, d.pages || 1)));
      bs.forEach(function (b, i) {
        if (b.type === "h1" || b.type === "h2" || b.type === "h3") { chap = b.x || chap; }
        var t = blockText(b).trim();
        if (!t || t.length < 8) return;
        out.push({
          bi: i, anchor: b.id || (b.type === "h1" ? "sec-1" : ""),
          chapter: chap, page: Math.min(d.pages || 999, Math.floor(i / perPage) + 1),
          pct: Math.round(i / bs.length * 100),
          text: t, docId: d.id, docTitle: d.title
        });
      });
    });
    return out;
  }

  /* 相关性检索：离线时用本地字符加权；在线时也可先本地捞候选再交给模型。 */
  async function retrieve(q, docId, n) {
    var all = corpus(docId || null);
    if (!all.length || !String(q || "").trim()) return [];
    try {
      var r = await API.aiSearch(q, all);
      return ((r.data && r.data.hits) || []).slice(0, n || 6);
    } catch (e) { return []; }
  }

  /* ============================================================
     四点五、上下文包（v2.23 W1b）
     主脑的每个 AI 入口从前只拿到「选中的那一句」，一本书的字都没进 prompt
     （实测：溯源请求的 user 消息 44 字、解析 59 字，全书 1141 字一个字没带）。
     这里把「这本书」摊成分级的材料包，让入口只管提问、不管搬书。
     分级与预算（按字符，中文约 1 字 ≈ 1 token 多一点；默认 5200 字 ≈ 一轮请求的稳妥区间）：
       ① 同章正文 62% ② 相关段落 22% ③ 邻章首尾 8% ④ 全书目录 6% ⑤ 书目 + 批注 4%
     实测参照：随包样书全书 1141 字 / 单章最大 456 字；24 段导入文档全书 3215 字 / 单章 3207 字
     —— 默认预算装得下「一章 + 一圈周边」，装不下的按级裁，并如实记下裁过哪些级。
     ============================================================ */

  /* 按标题块切章：返回 [{title, level, anchor, start, end}]（end 不含）。
     正文起首若有非标题块（无前言的文档很常见），补一条「（正文起首）」章占住它们。 */
  function chaptersOf(bs) {
    var list = bs || [];
    var hs = [];
    list.forEach(function (b, i) {
      if (b && (b.type === "h1" || b.type === "h2" || b.type === "h3")) {
        hs.push({ title: String(b.x || "").trim(), level: b.type, anchor: b.id || "", start: i });
      }
    });
    if (!hs.length) return [{ title: "", level: "", anchor: list.length ? (list[0].id || "") : "", start: 0, end: list.length }];
    hs.forEach(function (h, i) { h.end = i + 1 < hs.length ? hs[i + 1].start : list.length; });
    if (hs[0].start > 0) hs.unshift({ title: "（正文起首）", level: "", anchor: "", start: 0, end: hs[0].start });
    return hs;
  }

  /* 上下文包内部的相关度：查询的 2/3 字符片在段落里的命中占比。
     够钝就行 —— 真正的语义重排是 aiSearch 的活，这一级只保证最相关的段落不被预算裁掉。 */
  function relRank(q, text) {
    var s = String(q || "").replace(/\s+/g, "");
    var t = String(text || "");
    if (s.length < 2 || !t) return 0;
    var hit = 0, tot = 0;
    for (var n = 2; n <= 3; n++) {
      for (var i = 0; i + n <= s.length; i++) {
        tot++;
        if (t.indexOf(s.slice(i, i + n)) >= 0) hit++;
      }
    }
    return tot ? hit / tot : 0;
  }

  /* 从 o 里定住「读者站在哪一块」：显式块号 → 锚点 id → 查询命中的块 → 第一章 */
  function locate(bs, o, q) {
    if (typeof o.bi === "number" && o.bi >= 0 && o.bi < bs.length) return o.bi;
    if (o.anchor) {
      for (var i = 0; i < bs.length; i++) if (bs[i] && bs[i].id === o.anchor) return i;
    }
    if (q) {
      var best = -1, bs0 = 0;
      bs.forEach(function (b, i) {
        var s = relRank(q, blockText(b));
        if (s > bs0) { bs0 = s; best = i; }
      });
      if (bs0 > 0) return best;
    }
    return 0;
  }

  /* 取 [s,e) 里以 center 为中心、不超过 room 字的连续窗口（含 center 那一块） */
  function windowOf(bs, texts, s, e, center, room) {
    var a = center, b = center, chars = texts[center].length;
    for (;;) {
      var grew = false;
      if (b + 1 < e && chars + texts[b + 1].length + 1 <= room) { b++; chars += texts[b].length + 1; grew = true; }
      if (a > s && chars + texts[a - 1].length + 1 <= room) { a--; chars += texts[a].length + 1; grew = true; }
      if (!grew) break;
    }
    return { a: a, b: b };
  }

  /* 建包：无书 / 无正文 → null（调用方退回「只带选中文本」的旧形状，不把功能关掉） */
  function buildContextPack(o) {
    o = o || {};
    var docId = o.docId || CUR_DOC || null;
    var d = docId ? docMeta(docId) : null;
    if (!d) return null;
    var bs = blocksOf(docId);
    if (!bs.length) return null;

    var budget = Math.max(800, Math.min(12000, Number(o.budget) || 5200));
    var q = String(o.query || "").trim();
    var texts = bs.map(function (b) { return String(blockText(b) || "").trim(); });
    var chs = chaptersOf(bs);
    var at = Math.max(0, Math.min(bs.length - 1, locate(bs, o, q)));
    var ci = 0;
    for (var i = 0; i < chs.length; i++) if (at >= chs[i].start && at < chs[i].end) { ci = i; break; }
    var ch = chs[ci];

    var pack = {
      docId: docId,
      meta: {
        title: d.title || "", author: d.author || "", type: d.type || "",
        tags: (d.tags || []).slice(0, 6), pages: d.pages || 0, words: d.words || 0,
        progress: d.progress || 0, group: d.group || ""
      },
      at: at,
      chapter: { index: ci, count: chs.length, title: ch.title || d.title || "", anchor: ch.anchor || "", from: ch.start, to: ch.end, text: "", whole: true, cut: false },
      around: { before: "", after: "" },
      related: [],
      toc: chs.map(function (c) { return { lv: c.level || "p", x: String(c.title || "").slice(0, 24), bi: c.start }; }),
      notes: [],
      cut: []
    };
    if (pack.toc.length > 40) { pack.toc = pack.toc.slice(0, 40); pack.cut.push("toc"); }

    /* ⑤ 书目 + 批注：先扣掉（小额固定开销），剩下的才轮到正文分级 */
    var notes = ((window.InkStore && InkStore.getNotes && InkStore.getNotes()) || [])
      .filter(function (n) { return n && n.docId === docId && (n.text || n.body); })
      .slice(0, 6)
      .map(function (n) {
        return {
          text: String(n.text || "").slice(0, 80), body: String(n.body || "").slice(0, 80),
          anchor: n.anchor || "", page: n.page || 0
        };
      });
    if (notes.length > 6) pack.cut.push("notes");
    pack.notes = notes;

    var nChars = notes.reduce(function (s, n) { return s + n.text.length + n.body.length + 8; }, 0);
    var tChars = pack.toc.reduce(function (s, t) { return s + t.x.length + 6; }, 0);
    var room = Math.max(200, budget - nChars - tChars - 160);

    /* ① 同章正文（离提问最近的一级，装不下就围绕立足点扩窗） */
    var w = windowOf(bs, texts, ch.start, ch.end, at, Math.floor(room * 0.62));
    var seg = [];
    for (var k = w.a; k <= w.b; k++) if (texts[k]) seg.push(texts[k]);
    pack.chapter.from = w.a; pack.chapter.to = w.b + 1;
    pack.chapter.whole = (w.a === ch.start && w.b + 1 === ch.end);
    pack.chapter.text = seg.join("\n");
    if (pack.chapter.text.length > Math.floor(room * 0.62)) {
      pack.chapter.text = pack.chapter.text.slice(0, Math.floor(room * 0.62));
      pack.chapter.cut = true;
    }
    if (!pack.chapter.whole) pack.cut.push("chapter");

    /* ② 相关段落：全书打分，去掉已在同章窗口里的 */
    if (q) {
      var scored = [];
      bs.forEach(function (b, i) {
        if (i >= w.a && i <= w.b) return;
        var sc = relRank(q, texts[i]);
        if (sc > 0.12 && texts[i].length >= 8) scored.push({ i: i, s: sc, t: texts[i] });
      });
      scored.sort(function (x, y) { return y.s - x.s || x.i - y.i; });
      var used = 0, capR = Math.floor(room * 0.22);
      scored.forEach(function (x) {
        if (pack.related.length >= 5 || used + x.t.length > capR) return;
        var hh = null;
        for (var m = 0; m < chs.length; m++) if (x.i >= chs[m].start && x.i < chs[m].end) { hh = chs[m]; break; }
        pack.related.push({
          bi: x.i, anchor: (bs[x.i] && bs[x.i].id) || "",
          chapter: (hh && hh.title) || d.title || "", score: Math.round(x.s * 100) / 100,
          page: pageOf(d, bs.length, x.i), text: x.t.slice(0, capR - used)
        });
        used += x.t.length;
      });
      if (scored.length > pack.related.length) pack.cut.push("related");
    }

    /* ③ 邻章首尾：只给「这一章之前/之后在讲什么」的一句话轮廓 */
    var capA = Math.floor(room * 0.08);
    var prev = ci > 0 ? chs[ci - 1] : null, next = ci + 1 < chs.length ? chs[ci + 1] : null;
    if (prev) pack.around.before = chapterGlue(texts, prev, capA, "head");
    if (next) pack.around.after = chapterGlue(texts, next, capA, "tail");
    return pack;
  }

  /* 邻章轮廓：取该章正文的头（或尾）若干字 */
  function chapterGlue(texts, ch, room, end) {
    var parts = [];
    for (var i = ch.start; i < ch.end; i++) if (texts[i]) parts.push(texts[i]);
    var s = parts.join("\n");
    if (!s) return "";
    return (end === "tail" ? "…" + s.slice(-room) : s.slice(0, room));
  }

  /* 块号 → 页码（书架条目只有总页数，按块均分估；与 corpus() 同一口径） */
  function pageOf(d, len, i) {
    var perPage = Math.max(1, Math.ceil(len / Math.max(1, d.pages || 1)));
    return Math.min(d.pages || 999, Math.floor(i / perPage) + 1);
  }

  /* 包 → prompt 文字。顺序按「越相关越靠近提问」排（长上下文中段最容易被读漏）：
     书目 → 目录 → 批注 → 邻章 → 相关段落 → 当前章正文 →（调用方在此接上选中的那句 + 提问） */
  function packPrompt(pack) {
    if (!pack) return "";
    var m = pack.meta, sec = [];
    sec.push("【书目】《" + m.title + "》" + (m.author ? "（" + m.author + "）" : "") +
      (m.type ? " · 类别 " + m.type : "") +
      (m.tags && m.tags.length ? " · 标签 " + m.tags.join("、") : "") +
      (m.words ? " · 全书约 " + m.words + " 字 / " + m.pages + " 页" : "") +
      (m.progress ? " · 读者读到 " + m.progress + "%" : ""));
    if (pack.toc.length > 1) {
      sec.push("【目录】" + pack.toc.map(function (t, i) {
        return (i + 1) + "." + (t.x || "（无题）");
      }).join(" / "));
    }
    if (pack.notes.length) {
      sec.push("【读者自己在书上的批注】\n" + pack.notes.map(function (n) {
        return "· " + (n.text ? "「" + n.text + "」" : "") + (n.body ? " —— " + n.body : "") + (n.page ? "（第 " + n.page + " 页）" : "");
      }).join("\n"));
    }
    if (pack.around.before || pack.around.after) {
      sec.push("【前一章结尾】" + (pack.around.before || "（无）") +
        "\n【后一章开头】" + (pack.around.after || "（无）"));
    }
    if (pack.related.length) {
      sec.push("【书里与这个问题最接近的段落】\n" + pack.related.map(function (r) {
        return "· " + r.chapter + " · 第 " + r.page + " 页：" + r.text;
      }).join("\n"));
    }
    sec.push("【" + pack.chapter.title + " 正文" +
      (pack.chapter.whole ? "" : " · 节选（围绕读者所站的位置取，本章未全文附上）") + "】\n" +
      pack.chapter.text);
    return sec.join("\n\n");
  }

  /* 供 api.js 一次取齐：包 + 拼好的文字 + 实测各级字数（闸门与「模型到底看到了多少字」的可查证据） */
  function contextFor(o) {
    var pack = buildContextPack(o);
    if (!pack) return null;
    var txt = packPrompt(pack);
    return {
      pack: pack, text: txt, chars: txt.length,
      tierChars: {
        chapter: pack.chapter.text.length,
        related: pack.related.reduce(function (s, r) { return s + r.text.length; }, 0),
        around: pack.around.before.length + pack.around.after.length,
        toc: pack.toc.reduce(function (s, t) { return s + t.x.length; }, 0),
        notes: pack.notes.reduce(function (s, n) { return s + n.text.length + n.body.length; }, 0)
      },
      cut: pack.cut.slice()
    };
  }

  /* ============================================================
     五、离线库
     读者没接模型、或模型请求失败时，主脑只能靠「库里有的东西」作答：
       ① 已导入文档的原文   ② 任务清单   ③ 术语表
       ④ 主脑学到的记忆     ⑤ 内置的阅读与用法卡片
     库里没有的，直说没有 —— 这是离线能力的边界，不装。
     ============================================================ */
  var KB = [
    { t: "调字号与排版", k: "字号 排版 字体 行高 字距 段距 缩进 对齐 栏宽 分栏 变大 变小",
      a: "在阅读页按工具栏的「Aa」打开排版面板（快捷键 A）。字号、行高、字距、段距、字重、对齐、缩进、栏宽、分栏都在那里，拖动即见、改完即存，没有「应用」按钮。全局外观面板只留主题、强度、翻页与显示项。" },
    { t: "换主题与视觉强度", k: "主题 配色 换肤 外观 强度 静谧 标准 张扬 商城 封面",
      a: "主题商城在「书架 → 主题商城」，分「预装 8 / 商城 18 / 我的创作」三层：点卡片预览（含正文样张与对比度核验），再「下载 → 应用」。视觉强度三档（静谧 / 标准 / 张扬）在外观面板，只影响界面外壳与书架，正文纸页不受影响。" },
    { t: "翻页动效", k: "翻页 动效 卷页 平移 淡入 覆盖 直切 动画",
      a: "外观面板 → 翻页，五式可选：卷页 / 平移 / 淡入 / 覆盖 / 直切，面板里能当场试翻对比。开启「减少动效」或系统偏好为减少动效时，一律直切。" },
    { t: "夜间阅读", k: "夜间 夜读 护眼 暖色 变暗 自动 日出日落",
      a: "外观面板 → 当前外观里有夜间阅读：可设「常开 / 自动 / 关闭」。自动模式支持「按日出日落」（用本机时间与经纬度）或「按钟点」两种依据，还能调暖色与变暗程度。位置可一键用当前位置、选预设城市或直接填经纬度。" },
    { t: "任务与打卡", k: "任务 打卡 清单 今日 勾选 抽屉 完成率 分配",
      a: "任务页有今日清单时间轴与月度清单分组，勾选即打卡、落 inkread.checkins.v1。阅读时按快捷键 T（或工具栏「任务」按钮、沉浸浮层里的「任务」）可呼出任务抽屉，边读边勾；抽屉是非模态的，不打断阅读。每条任务带「原文定位 ›」，可跳回正文出处。" },
    { t: "主脑记忆是什么", k: "记忆 学习 主脑 习惯 偏好 置信 证据 忘掉",
      a: "记忆不是预置文案，而是主脑从你的真实行为里学来的结论：打卡的时间、划的高亮、调过的排版、读到的进度、复习的闪卡、自建的术语。每条记忆都带证据与置信度，在「主脑」页的「N 条记忆」浮层里可随时开关或忘掉。关掉的记忆不再被任何 AI 入口引用。" },
    { t: "主脑能做什么", k: "主脑 能力 智能 ai 模型 对话 总结 提炼 咨询",
      a: "主脑是这套程序的中枢：翻译、溯源（出处考证）、解析、检索、模式识别、对话，全都由它完成 —— 不只是对话框。对话入口主要用于讨论已导入文档的内容与做总结提炼，但你接入的模型有什么能力，主脑就有什么能力：写作、编程、数学、翻译、常识、推理都可以直接问。在线走你配置的模型，离线只用离线库。" },
    { t: "离线时能做什么", k: "离线 断网 没网 不联网 本地 离线库",
      a: "离线时主脑只用离线库：① 已导入文档的原文 ② 任务清单 ③ 术语表 ④ 主脑学到的记忆 ⑤ 内置的阅读与用法卡片。可以查文档内容、做摘要提炼、看任务与术语。离线库里没有的内容，主脑会直接说没有 —— 接入模型后才能回答任意问题。" },
    { t: "术语表", k: "术语 译名 术语表 导入 导出 csv 统一 翻译一致",
      a: "主脑页有术语表：内置只读 + 自建可增删。支持粘贴或导入 CSV / TSV（自动认分隔符、跳过表头、预览后再落库），也能导出成 CSV。翻译时全量下发给模型作为固定译名，保证全篇一致；同名以你自建的为准。" },
    { t: "闪卡与间隔重复", k: "闪卡 间隔 重复 记忆曲线 fsrs sm-2 复习 挖空",
      a: "学习类文档的模式条里有「闪卡」：把高亮挖空成问答卡，按 FSRS-5 的遗忘曲线排期回来找你 —— 每次评分都同时更新「这张卡有多稳」（稳定度）和「它对你有多难」（难度），下次到期点定在可回忆概率落到 90% 的那一刻；忘了则新稳定度与旧值取小，重新爬坡。到期队列会驱动徽标与计数，结算落 inkread.cards.v1。老的简化 SM-2 仍可作为回退档启用（本机偏好 inkread.srs.engine.v1 置为 sm2）。" },
    { t: "溯源 = 出处考证", k: "溯源 出处 考证 典故 来源 来历 引文 最早 原话",
      a: "划选一段文字 → 「溯源」，主脑会考据它的来处：先辨类别（典故 / 历史事件 / 人物 / 节日 / 地名 / 名物 / 术语 / 诗句 / 文献引文…），再给最早出处、原始表述、含义与本末、后世沿用与存疑。宁可写「未详」也不编造。卡片下方还会附上它在本书正文里的落点。" },
    { t: "翻译", k: "翻译 译成 互译 多语言 对照 悬停 划词 语向",
      a: "划选文字即出翻译条；「更多」里可把整页切到段落对照或悬停译两种状态。源语言支持自动检测，目标语言除常见语种外还有「AI 智能」—— 由主脑按原文判断该译成什么语（中文书里的英文引文默认译回中文）。译文按原文 + 语向 + 模型缓存，重复划选不再打网络。" },
    { t: "检索：关键词与模糊", k: "检索 搜索 查找 关键词 模糊 找不到 记不清 段落",
      a: "目录浮层里有两种检索：「关键词检索」按字面命中；「AI 模糊检索」用一句话描述你记得的内容（例如「主角第一次看见海的段落」），主脑会给出最接近的几段，附命中理由，先预览再跳转。在线时由模型语义重排，离线时退回本地字符加权检索。" },
    { t: "笔记三视图", k: "笔记 大纲 脑图 思维导图 markdown latex 视图 互转",
      a: "笔记以「一棵大纲树」为唯一真相源，三个渲染器实时互转：文字大纲 / 思维导图 / Markdown·LaTeX。位置属于视图配置，不写进正文。笔记与原文双向跳转，可从正文跳到笔记，也能从笔记跳回出处。" },
    { t: "导入文档", k: "导入 添加 上传 文档 md docx pdf 解析 任务抽取",
      a: "书架 → 导入：支持 MD / DOCX / PDF 等，导入后会走解析流程（读取结构 → 识别章节与时间词 → 抽取任务条目 → 归组生成清单）。解析出的任务进入任务页的今日 / 月度清单，可打卡。" },
    { t: "阅读认知负荷", k: "认知负荷 阅读 疲劳 回视 注视 理解 长文",
      a: "认知负荷指阅读时工作记忆承受的负担。常用三个可测指标：单页平均注视时长、跨行回视率、主观负荷量表（NASA-TLX）得分。研究显示，反射式（电子墨水）屏在 40 分钟以上长文阅读中，回视率与主观负荷显著低于透射式液晶屏，而理解正确率无显著差异 —— 收益来自无背光频闪与稳定的版面锚点。" },
    { t: "电子墨水屏原理", k: "电子墨水 墨水屏 e-ink 反射 刷新 ppi 残影",
      a: "电子墨水屏靠微胶囊里的黑白粒子在电场下移动显色，本身不发光，靠环境光反射成像，所以没有背光频闪、阳光下可读、静态画面不耗电。代价是刷新慢、有残影，因此界面动效要克制 —— 这也是本程序「动效只服务物理」的原因。" },
    { t: "对比度与可访问性", k: "对比度 可访问性 wcag 无障碍 aaa 7:1 亮度",
      a: "WCAG 2.2 按相对亮度算对比度：正文文字与其底色要达到 7:1（AAA），大字号至少 4.5:1。本程序的正文在任何主题 × 任何视觉强度组合下都保证 ≥7:1，强调色作文字时走专门的 accent-ink 色值以达标。" },
    { t: "番茄工作法与专注", k: "番茄 专注 效率 25 分钟 休息 时间管理",
      a: "番茄工作法：专注 25 分钟 + 休息 5 分钟为一个番茄钟，四个番茄钟后长休 15–30 分钟。要点是「一个钟内只做一件事」，被打断就作废重来。对阅读而言，可把「精读一篇 + 整理生词」压进两个番茄钟。" },
    { t: "间隔重复", k: "间隔重复 遗忘曲线 复习 记忆 艾宾浩斯",
      a: "间隔重复按遗忘曲线安排复习时点：越熟的内容间隔越长，越生的越常回来。简化的 SM-2 规则是答对后间隔按 1 天 → 6 天 → 上次间隔 × 难度系数递增，答错则间隔归零重来。关键在于「在快忘的时候复习」，而不是一次背很久。" }
  ];

  function kbScore(q, card) {
    var qs = grams(q), t = (card.t + " " + card.k + " " + card.a).toLowerCase();
    var s = 0, hit = 0;
    qs.forEach(function (g) { if (t.indexOf(g) >= 0) { s += 1; hit++; } });
    var kws = card.k.split(/\s+/);
    var kwHit = kws.filter(function (w) { return w.length >= 2 && String(q).indexOf(w) >= 0; }).length;
    return { s: s / Math.sqrt(1 + qs.length / 4) + kwHit * 0.6, kw: kwHit, raw: hit };
  }

  function scoreTasks(q) {
    var tasks = (window.DB && DB.tasks) || [];
    var qs = grams(q), out = [];
    tasks.forEach(function (t) {
      var txt = (t.title + " " + t.quote + " " + (t.src || "") + " " + (t.time || "")).toLowerCase();
      var s = 0;
      qs.forEach(function (g) { if (txt.indexOf(g) >= 0) s += 1; });
      if (s > 0) out.push({ t: t, s: s / Math.sqrt(1 + qs.length / 4) });
    });
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, 4);
  }

  function scoreGloss(q) {
    var terms = [];
    try {
      if (window.API && API.fetchGlossarySync) terms = API.fetchGlossarySync();
    } catch (e) {}
    if (!terms.length) return [];
    var qs = grams(q), out = [];
    terms.forEach(function (t) {
      var txt = String(t.src + " " + t.dst).toLowerCase();
      var s = 0;
      qs.forEach(function (g) { if (txt.indexOf(g) >= 0) s += 1; });
      if (String(q).indexOf(t.src) >= 0) s += 3;
      if (s > 0) out.push({ t: t, s: s });
    });
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, 5);
  }

  /* 抽取式摘要：离线也能做「文档总结提炼」。
     按词频给句子打分，取高分句、按原文顺序还原 —— 不做无中生有的润色。 */
  function summarize(docId, n) {
    var bs = blocksOf(docId);
    if (!bs.length) return null;
    var d = docMeta(docId);
    var sents = [], chap = (d && d.title) || "";
    bs.forEach(function (b, i) {
      if (b.type === "h1" || b.type === "h2" || b.type === "h3") { chap = b.x || chap; return; }
      var t = blockText(b).trim();
      if (!t) return;
      String(t).split(/(?<=[。！？；])/).forEach(function (s) {
        s = s.trim();
        if (s.length >= 12) sents.push({ s: s, bi: i, chapter: chap });
      });
    });
    if (!sents.length) return null;
    var freq = {};
    sents.forEach(function (x) {
      (String(x.s).match(/[\u4e00-\u9fff]{2}/g) || []).forEach(function (g) { freq[g] = (freq[g] || 0) + 1; });
    });
    var scored = sents.map(function (x, i) {
      var gs = String(x.s).match(/[\u4e00-\u9fff]{2}/g) || [];
      var sc = 0;
      gs.forEach(function (g) { sc += (freq[g] || 0); });
      sc = sc / Math.sqrt(1 + gs.length / 6) * (i < 3 ? 1.2 : 1);
      return { x: x, sc: sc, i: i };
    });
    scored.sort(function (a, b) { return b.sc - a.sc; });
    var top = scored.slice(0, Math.max(3, Math.min(8, n || 6)));
    top.sort(function (a, b) { return a.i - b.i; });
    return {
      docId: docId, title: (d && d.title) || "文档",
      lead: top[0] ? top[0].x.s : "",
      points: top.map(function (t) { return { s: t.x.s, chapter: t.x.chapter, bi: t.x.bi }; })
    };
  }

  function hasIntent(q, re) { return re.test(String(q || "")); }

  /* 离线作答：只用离线库，且如实交代来源与边界。 */
  async function offline(q, opts) {
    var o = opts || {};
    var docId = o.docId || CUR_DOC;
    var secs = [], refs = [], used = [];

    /* ① 文档总结提炼（离线也能做，靠抽取式摘要） */
    if (hasIntent(q, /总结|概括|提炼|摘要|主旨|讲了什么|讲了啥|大意|梳理|脉络/) && docId) {
      var sm = summarize(docId);
      if (sm) {
        used.push("摘要");
        secs.push("【文档摘要 · 抽取自原文】《" + sm.title + "》\n" +
          sm.points.map(function (p, i) { return (i + 1) + ". " + p.s + "（" + p.chapter + "）"; }).join("\n"));
      }
    }

    /* ② 内置用法卡 */
    var kb = KB.map(function (c) { return { c: c, s: kbScore(q, c) }; })
      .filter(function (x) { return x.s.s >= 0.7 || x.s.kw >= 1; })
      .sort(function (a, b) { return b.s.s - a.s.s; });
    if (kb.length) {
      used.push("内置卡");
      secs.push(kb.slice(0, 2).map(function (x) {
        return "【" + x.c.t + "】" + x.c.a;
      }).join("\n\n"));
    }

    /* ③ 已导入文档的原文 */
    var hits = await retrieve(q, o.docId || null, 4);
    hits = hits.filter(function (h) { return (h.reason && h.reason.indexOf("命中") >= 0) || h.at != null; });
    if (hits.length) {
      used.push("原文");
      secs.push("【相关原文】\n" + hits.slice(0, 3).map(function (h) {
        return "· 《" + (h.docTitle || docTitle(docId) || "本书") + "》" + (h.chapter || "") + " · 第 " + (h.page || "?") + " 页\n  「" + String(h.text || "").slice(0, 120) + "」";
      }).join("\n"));
    }

    /* ④ 任务清单 */
    var tk = scoreTasks(q);
    if (tk.length) {
      used.push("任务");
      secs.push("【任务清单】\n" + tk.map(function (x) {
        var ck = (window.InkStore && InkStore.getCheckins && InkStore.getCheckins()) || {};
        return "· " + (x.t.time ? x.t.time + " " : "") + x.t.title + (ck[x.t.id] ? "（已打卡 " + ck[x.t.id] + "）" : "");
      }).join("\n"));
    }

    /* ⑤ 术语表 */
    var gl = scoreGloss(q);
    if (gl.length) {
      used.push("术语表");
      secs.push("【术语】\n" + gl.map(function (x) { return "· " + x.t.src + " = " + x.t.dst + (x.t.pos ? "（" + x.t.pos + "）" : ""); }).join("\n"));
    }

    /* ⑥ 记忆 */
    var mems = pickMems(q, 3);
    if (mems.length) {
      used.push("记忆");
      refs = mems.map(function (m) { return m.id; });
      secs.push("【我记得的】\n" + mems.map(memLine).join("\n"));
    }

    if (!secs.length) {
      return {
        reply: "离线库（已导入文档的原文、任务清单、术语表、我学到的记忆、内置的阅读与用法卡片）里没有能回答这个问题的内容。\n\n" +
          "离线时我能做的是：查已导入文档的内容、做文档摘要与要点提炼、查任务与打卡、查术语、聊我学到的你的习惯。\n" +
          "要回答任意问题（写作、编程、数学、常识……），请到「模型配置」填好接口地址与密钥 —— 那时主脑就是你接入的那个模型。",
        refs: [], mode: "offline", used: [], miss: true
      };
    }

    var head = "（离线作答 · 来源：" + used.join(" / ") + "）\n\n";
    var tail = "\n\n—— 以上内容全部来自本机离线库。需要更完整的解释或任意问题的答案，接入模型后由主脑直接作答。";
    return { reply: head + secs.join("\n\n") + tail, refs: refs, mode: "offline", used: used };
  }

  /* ============================================================
     六、对话
     在线：多轮 + 流式，交给读者接入的模型。
     离线：只用离线库。
     ============================================================ */
  var history = [];      /* [{role, content}] 最近 8 条，页面内保留 */
  var MAX_TURNS = 8;

  /* v1.5-S4 E4 —— 图只在「这一轮」活着。
     base64 一旦进 history / localStorage，4MB 的同步上限与 localStorage 配额会被一起炸开，
     所以这里把三件事定死：最多几张、多大才收、history 只留 [图 × n] 占位。 */
  var MAX_IMG_N = 3;
  var MAX_IMG_BYTES = 200 * 1024;
  var IMG_RE = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

  function imgBytes(url) {
    var s = String(url || ""), i = s.indexOf(",");
    return i < 0 ? 0 : Math.floor((s.length - i - 1) * 3 / 4);
  }

  /* 只收 canvas 重画过的那一种形状（data:image + base64）。原文件不直传：
     手机书页动辄几 MB，压缩是界面的活，这里是最后一道验收。 */
  function cleanImages(list) {
    var out = [], dropped = 0;
    (Array.isArray(list) ? list : []).forEach(function (it) {
      var url = typeof it === "string" ? it : String((it && (it.url || it.dataUrl)) || "");
      if (out.length >= MAX_IMG_N || !IMG_RE.test(url) || imgBytes(url) > MAX_IMG_BYTES) { dropped++; return; }
      out.push({ url: url, bytes: imgBytes(url), name: String((it && it.name) || "图").slice(0, 60) });
    });
    return { imgs: out, dropped: dropped };
  }

  /* 纯文本轮的 content 必须是字符串（有些兼容层对数组 content 更挑）；
     只有本轮真有图才升成数组。 */
  function userContent(q, imgs) {
    if (!imgs || !imgs.length) return q;
    var parts = [{ type: "text", text: q || "请看这张图，说说你看到了什么。" }];
    imgs.forEach(function (im) { parts.push({ type: "image_url", image_url: { url: im.url } }); });
    return parts;
  }

  /* history 只落占位：图本身绝不进这一格（同步与配额红线）。 */
  function histText(q, n) {
    var s = String(q || "");
    return n ? (s ? s + "\n" : "") + "[图 × " + n + "]" : s;
  }

  /* 「这家不认图」的证据：只有 400 且响应体点到图 / 视觉才认。
     401 / 403 / 429 / 超时一律不翻 —— 松一次就会把「密钥写错」静默记成「模型不认图」。 */
  function visionRejected(e) {
    var s = Number(e && e.status) || 0;
    var b = String((e && e.body) || "");
    if (s !== 400 || !b) return false;
    return /image|vision|multimodal|图片|图像|视觉/i.test(b);
  }

  var VISION_NOTE = "这家不认图，改用文字描述。";

  /* 人设文本搬到 M2 提示词注册表（featureKey brain.chat）—— 这里只交「怎么称呼这位读者」。 */
  function persona() {
    var name = window.InkProfile ? InkProfile.name() : "读者";
    return API.promptSys("brain.chat", {
      honor: window.InkProfile && !InkProfile.isDefault() ? "读者希望被称为「" + name + "」。" : ""
    });
  }

  /* 递给模型的相关原文只在这一处拼（v1.3 D4）：脚注要报的字数必须就是发出去的那一份，
     两处各拼各的，屏上的「随问附上 N 字」就成了凭空捏造的数。 */
  function passageLines(passages, docId) {
    return passages.map(function (p) {
      return "· 《" + (p.docTitle || docTitle(docId) || "本书") + "》" + (p.chapter || "") + " · 第 " + (p.page || "?") + " 页：" + String(p.text || "").slice(0, 200);
    });
  }

  function buildMessages(q, mems, passages, docId, imgs) {
    var parts = [persona()];
    var pre = preamble("chat");
    if (pre) parts.push("", pre);
    if (passages.length) {
      parts.push("", "【相关原文 · 已从书里检索出来，可直接引用】");
      parts.push(passageLines(passages, docId).join("\n"));
    }
    var msgs = [{ role: "system", content: parts.join("\n") }];
    history.slice(-MAX_TURNS).forEach(function (h) { msgs.push(h); });
    msgs.push({ role: "user", content: userContent(q, imgs) });
    return msgs;
  }

  /* 本轮 retrieve() 真捞上来的那几段原文。产物工具写 source.passages 读的就是这一格：
     「这一份是带着几段原文写出来的」是产物卡要说得出的一句实话。
     换问即清（ask 开头），捞到即存（ask 单轮 / loopAsk）；resumeTools 不清 ——
     读者点完确认才落的那条产物，出处属于上一问，不是这一次点击。 */
  var ROUND_PASSAGES = [];

  async function ask(text, opts) {
    var o = opts || {};
    var q = String(text || "").trim();
    var ci = cleanImages(o.images);
    var imgs = ci.imgs;
    var attN = imgs.length;            /* 读者真附上的张数：history 占位与回执都按它 */
    if (!q && !attN) return { reply: "", refs: [], mode: "none" };
    /* v2.2：记忆指令优先于一切（记住 / 忘掉 / 你记得我什么）—— 命中即办，不走模型 */
    var mc = q ? memIntent(q) : null;
    if (mc) { observe("chat", {}); return mc; }
    var docId = o.docId || CUR_DOC;
    var mems = pickMems(q, 4);
    /* 换问就清账：上一问捞的原文不算这一问的出处（产物工具写 source.passages 读这一格） */
    ROUND_PASSAGES = [];

    /* 该不该带图在进模型之前定下来：能力位已经翻 false 就不再撞一次 400；
       太大 / 格式不对的也不发 —— 理由要能说出口，不能悄悄丢。 */
    var imgNote = ci.dropped ? ("有 " + ci.dropped + " 张图太大或不是可发的图片格式，没有发出去。") : "";
    if (imgs.length && !API.capGet("vision")) { imgs = []; imgNote = VISION_NOTE; }
    if (!q && !imgs.length) {
      return { reply: "", refs: [], mode: "none", imgs: attN, note: imgNote || VISION_NOTE };
    }

    if (window.API && API.hasModel && API.hasModel()) {
      /* v1.5-S4 E1：宿主点名要工具回合就交 InkLoop —— 模型自己决定读哪一段、调哪枚工具，
         看完再答。不进这一支时下面这条单轮路径一个字没动（今天的形态）。
         带图这一轮不走工具循环：图的形状只该出现在「最后一问」上，循环会把消息带进多轮账，
         而图不进 history / 不进存储是本期红线。 */
      if (o.useTools && !attN && window.InkLoop) return await loopAsk(q, o, docId, mems);
      /* 在线才需要先捞正文候选喂给模型；离线时 offline() 自己会捞，不必捞两遍 */
      var passages = await retrieve(q, docId, 6);
      ROUND_PASSAGES = passages;
      /* 随问附上的原文量就是 passageLines 拼出去的那一份 —— 脚注报的数必须与发出去的一致（v1.3 D4） */
      var ctxChars = passages.length ? passageLines(passages, docId).join("\n").length : 0;
      var pr = API.promptParams("brain.chat");
      var st = { net: 0 };
      /* 一发 request：图上不上按 list 定 —— 只有本轮真有图时 user content 才是数组。
         每发各自累计文本，失败重发时不会把上一发的半句带进正文；
         seen 是越出这一发的「已流出的最后一句」—— 读者按停止时 fire 会抛，
         out 还没被赋值，只有它能把半句原样交回去（S1b）。 */
      var seen = "";
      async function fire(list) {
        var acc = "";
        seen = "";
        await API.llmMsgs(buildMessages(q, mems, passages, docId, list), Object.assign({
          cfg: pr.cfg, signal: o.signal || null, stats: st,
          onDelta: function (piece, all) {
            acc = all != null ? all : acc + piece;
            seen = acc;
            if (o.onDelta) o.onDelta(piece, acc);
          }
        }, pr.send));
        return acc;
      }
      var out = "", fallNote = "";
      try {
        try {
          out = await fire(imgs);
        } catch (e0) {
          /* 只有「400 且点到图」才翻能力位；这一轮当场退回纯文本重发一次，
             读者不必自己删图重问。别的错照旧走下面的兜底。 */
          if (!imgs.length || !visionRejected(e0)) throw e0;
          API.capSet("vision", false);
          fallNote = VISION_NOTE;
          imgs = [];
          out = await fire(null);
        }
        history.push({ role: "user", content: histText(q, attN) });
        history.push({ role: "assistant", content: out });
        if (history.length > MAX_TURNS * 2) history = history.slice(-MAX_TURNS * 2);
        observe("chat", {});
        return {
          reply: out, refs: mems.map(function (m) { return m.id; }),
          mode: "online", model: (API.modelCfg() || {}).model,
          passages: passages.length, hits: passages,
          ctxChars: ctxChars, ctxItems: passages.length, net: st.net,
          imgs: attN, note: [imgNote, fallNote].filter(Boolean).join(" ") || undefined
        };
      } catch (e) {
        /* 读者按了停止：半句照原样交回去，不去兜离线库。
           「我叫停的」被显示成「模型答不上来」，会让读者怀疑刚接好的模型坏了；
           已流出的内容也不写进 history —— 半截话进上下文，下一轮就顺着半截编。 */
        if (e && (e.aborted || (o.signal && o.signal.aborted))) {
          return { reply: out || seen, refs: [], mode: "stopped", aborted: true, passages: passages.length, hits: passages, imgs: attN };
        }
        var off = await offline(q, { docId: docId });
        /* 重问过几次要说得出（v1.3 D3）：只报「失败」会把「等了两次才没戏」说成「一次都没通」 */
        off.note = "模型请求失败：" + API.netErrPhrase(e) +
          API.retryTail(e && e.netRetried) + "，已改用离线库作答。" +
          ([imgNote, fallNote].filter(Boolean).length ? " " + [imgNote, fallNote].filter(Boolean).join(" ") : "");
        off.refs = off.refs || mems.map(function (m) { return m.id; });
        off.imgs = attN;
        return off;
      }
    }
    observe("chat", {});
    if (attN) {
      return { reply: "", refs: [], mode: "offline", imgs: attN,
        note: "现在还没接模型，看不了图 —— 先到「模型配置」接一家认图的服务，接好后把图再发一次。" };
    }
    var r = await offline(q, { docId: docId });
    return r;
  }

  /* ============================================================
     v1.5-S4 E1 —— 主脑页的自主多轮回路
     ------------------------------------------------------------
     为什么这一段非不可：S2 把回合编排器建好了，却只长在阅读页助手上。主脑页既没载
     ink-agent/ink-loop，ask() 也没把工具名册递出去 —— 模型「只能聊天」不是上游不给力，
     是我们没把工具交给它。这一节只加通路不改语义：单轮那条路（上面那段）原样留着，
     不接 useTools 就压根不进这里，能力位被翻成不认原生 tool_calls 时循环自己降级。

     账目只认 InkLoop.snap() 那一份正本（rounds/calls/landed/net/ms），这里不自造计数器。
     ============================================================ */

  /* 宿主桥：有回调才挂，别把 undefined 传下去让循环去猜。
     onText 的两个参数是「这一截」与「本轮这一截」，不是全局累计 —— 界面按轮各起一段流，
     喂全局会把第 1 轮的话在第 2 轮重打一遍。 */
  function loopHost(o) {
    var h = {};
    if (o.signal) h.signal = o.signal;
    ["onPlan", "onEvent", "onTool", "onAwait"].forEach(function (k) { if (o[k]) h[k] = o[k]; });
    if (o.onDelta) h.onText = function (piece, roundText) {
      try { o.onDelta(piece, roundText); } catch (e) {}
    };
    return h;
  }

  async function loopAsk(q, o, docId, mems) {
    var passages = await retrieve(q, docId, 6);
    ROUND_PASSAGES = passages;
    var msgs = buildMessages(q, mems, passages, docId);
    /* 随问附上的字数就是 passageLines 真发出去的那一份（v1.3 D4 同一条判据） */
    var ctxChars = passages.length ? passageLines(passages, docId).join("\n").length : 0;
    var pr = API.promptParams("brain.chat");
    var r;
    try {
      r = await InkLoop.run({ goal: q, stream: true, messages: msgs, prm: pr, host: loopHost(o) });
    } catch (e) {
      r = { status: "error", why: "net", answer: "", partial: "", plan: [], await: [],
        rounds: 0, calls: 0, landed: 0, net: 0, note: API.netErrPhrase(e) };
    }
    return await loopTail(r, q, { docId: docId, mems: mems, passages: passages, ctxChars: ctxChars });
  }

  /* 读者点完「确认落地 / 先不」之后接着跑。prev 只从 InkLoop.last() 取正本，
     界面不留副本 —— 留了就会有两份「刚才那一轮」，撤销与账对不上号。 */
  async function resumeTools(o) {
    o = o || {};
    var prev = window.InkLoop && InkLoop.last();
    if (!prev || !prev.ctx) {
      return { reply: "", mode: "error", why: "no-ctx", note: "这一步接不上刚才那轮了，请重新问一次。",
        plan: [], awaitList: [], rounds: 0, calls: 0, landed: 0, ctxChars: 0 };
    }
    var r;
    try {
      r = await InkLoop.resume(prev, { signal: o.signal || null, refuse: !!o.refuse,
        finishOnly: !!o.finishOnly });
    } catch (e) {
      r = { status: "error", why: "net", answer: "", partial: "", plan: prev.plan || [], await: [],
        rounds: prev.rounds || 0, calls: prev.calls || 0, landed: prev.landed || 0,
        note: API.netErrPhrase(e) };
    }
    var out = await loopTail(r, "", { docId: o.docId || CUR_DOC, mems: [], passages: [], ctxChars: 0 });
    /* 续跑这一趟没重发原文：脚注那句「随问附上 N 字」不该再报一遍，
       报了就是把上一问的字数记在这次点头的账上。 */
    out.ctxChars = 0; out.ctxItems = 0; out.continued = true;
    if (!out.reply) out.reply = o.refuse ? "好，这一条不落。已经办完的那些没动。" : "按你点头的这几条办完了。";
    return out;
  }

  /* 循环的出口摊成界面认识的那几种收尾，每种各说各的话：
     答完了 / 被叫停 / 触顶 / 压根没起跑 / 模型出错本机库接手 —— 不许混成一句「失败了」。 */
  async function loopTail(r, q, m) {
    var base = {
      awaitList: (r && r.await) || [], via: r && r.via,
      rounds: (r && r.rounds) || 0, calls: (r && r.calls) || 0, landed: (r && r.landed) || 0,
      plan: (r && r.plan) || [], net: (r && r.net) || 0, ms: (r && r.ms) || 0, note: "",
      refs: (m.mems || []).map(function (x) { return x.id; }),
      passages: (m.passages || []).length, hits: m.passages || [],
      ctxChars: m.ctxChars || 0, ctxItems: (m.passages || []).length
    };
    var st = (r && r.status) || "error";
    var out;
    if (st === "answer") out = Object.assign(base, { reply: r.answer || "", mode: "online",
      model: (API.modelCfg() || {}).model });
    else if (st === "stopped") out = Object.assign(base, { reply: r.partial || "", mode: "stopped",
      aborted: true, note: r.note || "" });
    else if (st === "budget") out = Object.assign(base, { reply: r.answer || "", mode: "budget",
      note: r.note || "回合用到顶了。" });
    else if (r.why === "no-model" || r.why === "offline")
      out = Object.assign(base, { reply: "", mode: "blocked", why: r.why, note: r.note || "" });
    else if (r.why === "correct-stalled")
      out = Object.assign(base, { reply: "", mode: "error", why: "correct-stalled", note: r.note || "" });
    /* 点头续跑那半截（q 为空）出错时不兜离线库：本机库答的是「上一问」那句话，
       这里根本没有那句话 —— 兜出来的是答非所问，还会被记成上一条回答。 */
    else if (!q) out = Object.assign(base, { reply: "", mode: "error", why: r.why || "net", note: r.note || "" });
    else {
      var off = await offline(q, { docId: m.docId });
      off.refs = off.refs || base.refs;
      out = Object.assign(base, { reply: off.reply, mode: "offline", miss: off.miss, ctxChars: 0,
        note: "模型请求失败：" + (r.note || (r.why || "error")) + API.retryTail(base.net) + "，已改用离线库作答。" });
    }
    /* 只有真答完的那两种进上下文：叫停留下的半截话会让下一轮顺着没说完的话编；
       兜底答案与今天单轮那条路一样也不写进 history。 */
    if (q && (out.mode === "online" || out.mode === "budget") && out.reply) {
      history.push({ role: "user", content: q });
      history.push({ role: "assistant", content: out.reply });
      if (history.length > MAX_TURNS * 2) history = history.slice(-MAX_TURNS * 2);
    }
    if (out.mode === "online" || out.mode === "budget") observe("chat", {});
    return out;
  }

  function reset() { history = []; }

  /* ============================================================
     v1.5-S4 E3 · 报告（brain.report）
     ------------------------------------------------------------
     与 E2 的 artifact.write 分工：那一枚是模型在自主回合里自己写的，出处只能按
     「这本书里查得到」对（宿主没把本轮 passages 递进 InkLoop）；这一条是读者点名
     要一份报告 —— 宿主先检索，把这一轮的原文按段号递进去，所以「依据 i」能按
     **本轮真捞到的段号**逐条核对。查不到的依据整条剔掉（不改正文其他行），
     产物卡上明写剔了几条；依据全被剔光则整份拒收（与 E2 的 F5 同一条红线：
     一份说不出出处的结论就是编的），结论为空也整份拒收，绝不把空报告交进产物区。
     ============================================================ */
  function reportFlat(s) { return String(s == null ? "" : s).replace(/\s+/g, ""); }
  function reportLines(passages, docId) {
    return passages.map(function (p, i) {
      return "[" + (i + 1) + "] 《" + (p.docTitle || docTitle(docId) || "本书") + "》" +
        (p.chapter || "") + " · 第 " + (p.page || "?") + " 页：" + String(p.text || "").slice(0, 200);
    });
  }
  function artBriefLines(n) {
    var list = (window.API && API.artList) ? (API.artList() || []) : [];
    return list.slice(0, n || 8).map(function (a) {
      return "- " + a.id + "｜《" + String(a.title || "未命名") + "》｜" + String(a.kind || "report") +
        "｜" + (Number(a.size) || 0) + " 字" + (a.indexOnly ? "（只留索引）" : "");
    });
  }
  /* 依据条目的书名 / 章节 / 页码一律从真段落里写，不用模型回的那一份 ——
     它给错页码也无从冒充，这是「绝不编造出处」的另一半。 */
  function reportMd(title, conclusion, good, risk, nexts, docId) {
    var lines = ["# " + title, "", "## 结论", "", conclusion, "", "## 依据", ""];
    good.forEach(function (e, i) {
      lines.push((i + 1) + ". 《" + (e.p.docTitle || docTitle(docId) || "本书") + "》" +
        (e.p.chapter || "") + " · 第 " + (e.p.page || "?") + " 页：" + e.quote +
        (e.why ? "（" + e.why + "）" : ""));
    });
    lines.push("", "## 反证与不确定", "", risk || "（这一轮模型没给出反证与不确定。）", "");
    lines.push("## 下一步", "");
    if (nexts.length) nexts.forEach(function (x) { lines.push("- " + x); });
    else lines.push("（这一轮模型没给出下一步。）");
    return lines.join("\n");
  }

  async function report(goal, opts) {
    var o = opts || {};
    var q = String(goal || "").trim();
    if (!q) return { ok: false, why: "no-goal", note: "先说一句这份报告要回答什么。" };
    if (!(window.API && API.hasModel && API.hasModel())) {
      return { ok: false, why: "no-model", note: "还没接模型：到右侧「模型配置」填上接口与密钥，再写报告。" };
    }
    var docId = o.docId || CUR_DOC;
    var passages = await retrieve(q, docId, 6);
    ROUND_PASSAGES = passages;
    if (!passages.length) {
      return { ok: false, why: "no-passages",
        note: "这本书里没检索到与「" + q.slice(0, 30) + "」相关的原文，报告落不了依据。" };
    }
    var arts = artBriefLines(6);
    var usr = "【报告目标】\n" + q +
      "\n\n【原文 · 本轮检索结果（i 就是段号）】\n" + reportLines(passages, docId).join("\n") +
      (arts.length ? "\n\n【本机已有的产物】\n" + arts.join("\n") : "");
    var out;
    try { out = await API.run("brain.report", usr); }
    catch (e) {
      if (e && (e.aborted || (o.signal && o.signal.aborted))) {
        return { ok: false, why: "stopped", note: "这份报告停在半路，什么都没写。" };
      }
      if (e && e.name === "UnstructuredError") {
        return { ok: false, why: "unstructured", note: "模型没按格式交出报告，这一份没写。" };
      }
      return { ok: false, why: "net",
        note: "模型请求失败：" + API.netErrPhrase(e) + API.retryTail(e && e.netRetried) + "。报告没写。" };
    }
    var j = (out && out.j) || {};
    var conclusion = String(j.conclusion == null ? "" : j.conclusion).trim();
    if (!conclusion) {
      var why = String(j.reason == null ? "" : j.reason).trim();
      return { ok: false, why: "empty-conclusion",
        note: "这轮没判出可用结论" + (why ? "，原因：" + why : "") + "。报告没有写进产物区。" };
    }
    var evs = Array.isArray(j.evidence) ? j.evidence : [];
    var good = [], dropped = [];
    evs.forEach(function (e) {
      var i = Number(e && e.i);
      var p = (i >= 1 && i <= passages.length && i === Math.floor(i)) ? passages[i - 1] : null;
      if (!p) {
        var raw = (e && e.i != null) ? e.i : "?";
        dropped.push({ i: raw, why: "第 " + raw + " 段原文不在本轮检索结果里" });
        return;
      }
      var text = String(p.text || "");
      var quote = String((e && e.quote) || "").replace(/\s+/g, " ").trim().slice(0, 160);
      /* 引文对不上原文就退回真段落的第一句：宁可少一句漂亮话，也不让屏上的
         「原话」是模型自己编的。 */
      if (!quote || reportFlat(text).indexOf(reportFlat(quote)) < 0) {
        quote = text.slice(0, 120) + (text.length > 120 ? "…" : "");
      }
      good.push({ i: i, p: p, quote: quote, why: String((e && e.why) || "").trim().slice(0, 60) });
    });
    /* 依据一条都没站住 = 这份结论在本轮原文里没有立足点。与 E2 的 F5 同一条红线：
       宁可整份不落，也不交一份「屏上写着出处、账上一条都对不上」的报告。 */
    if (!good.length) {
      return { ok: false, why: "no-evidence",
        note: evs.length
          ? "这轮报告的 " + evs.length + " 条依据全都查不到本轮原文（已剔除）。报告没有写进产物区。"
          : "这轮报告没给出一条能对上的依据。报告没有写进产物区。" };
    }
    var nexts = (Array.isArray(j.next) ? j.next : []).map(function (x) { return String(x || "").trim(); })
      .filter(Boolean).slice(0, 5);
    var title = String(j.title == null ? "" : j.title).trim().slice(0, 60) || ("报告 · " + q.slice(0, 24));
    var md = reportMd(title, conclusion, good, String(j.risk == null ? "" : j.risk).trim(), nexts, docId);
    var w = API.artWrite({ title: title, kind: "report", md: md,
      source: { docId: docId || "", passages: passages.length, via: "report" },
      audit: { rounds: 0, calls: 1, rejected: dropped.length } });
    if (!w || !w.ok) {
      return { ok: false, why: "write-failed", note: "本机没能存下这一份：" + ((w && w.why) || "存储满") + "。" };
    }
    var a = w.art || {};
    return { ok: true, id: a.id, title: a.title, kind: a.kind, size: a.size,
      indexOnly: a.indexOnly === true, cites: evs.length, unchecked: 0,
      rejected: dropped.length, dropped: dropped.slice(0, 3),
      note: a.indexOnly === true
        ? "这份正文 " + a.size + " 字，超过本机单份 80 万字的预算，账上只留下索引与摘要：正文没存下来。"
        : "",
      reply: "报告已写好：《" + title + "》" +
        (dropped.length ? "；其中 " + dropped.length + " 条依据查无出处，已剔除。" : "。") };
  }

  /* ============================================================
     v2.7 · Brain.cheer —— 里程碑鼓励文案（展示层在 ink:milestone 事件后调用）
     在线：真模型生成（主脑人设 + 记忆摘要 + 累计统计），失败即静默落模板池；
     离线：模板池按轮次轮换，模板里带「第 N 天 / 第 N 年」——
           离线也保证「每满一年：同特效、不同文本」（round 直接参与轮换与文本）。
     返回纯文本（2-3 句），绝不返回空串。
     ============================================================ */
  var CHEER_BASIC = [
    "第 {days} 天，说长不长，说短也不短 —— 足够让一件事从「试试看」变成「习惯了」。你今天读过的那些字，正在悄悄替你铺路。",
    "第 {days} 天。没有哪本书是一夜读完的，就像没有哪条河是一次流成的 —— 你只是每天都往前挪了一点。",
    "坚持到第 {days} 天，靠的其实不是热情，是每天坐下来、把书翻开的那一下。这一页翻得很稳。",
    "阅读这件事最公平：你给它多少时间，它就还你多少自己。第 {days} 天，你已经攒下了一份谁也拿不走的积累。",
    "第 {days} 天的打卡，看起来只是又一个勾。可横着看，它已经是 {round} 个三十天连成的一条直线了。",
    "第 {days} 天。中间一定有过不想翻书的晚上吧 —— 你还是回来了，这就够了。",
    "第 {days} 天 · 累计已读 {total}。数字不大，但它是真的；真的东西，会慢慢长成底气。"
  ];
  /* 每条周年模板都埋了 {years} 或 {days}：模板池即使轮完一圈回到同一条，
     填出来的文本仍随年份不同 —— 离线也满足「每满一年：同特效、不同文本」。 */
  var CHEER_ANNI = [
    "第 {years} 年。一年前翻开的那一页，如今已经连成一整条河 —— 而你还在河上。",
    "第 {years} 年整。累计已读 {total} —— 那不是数字，是一年里每一个安静的晚上。",
    "第 {years} 个周年。书还是那些书，你已经不是一年前的你了 —— 这是阅读最诚实的复利。",
    "第 {years} 年 · 第 {days} 天。所谓成长，大概就是把「今天读一点」重复成一件不必再下决心的事。",
    "第 {years} 年整 · 累计已读 {total}。坚持从来不需要轰轰烈烈，只需要每天回来一次 —— 你已经回来 {days} 次了。"
  ];
  function cheerStub(c) {
    var pool = c.anni ? CHEER_ANNI : CHEER_BASIC;
    var t = pool[(Math.max(1, c.round) - 1) % pool.length] || pool[0];
    return t.replace(/\{days\}/g, c.days).replace(/\{round\}/g, c.round)
      .replace(/\{years\}/g, c.round).replace(/\{total\}/g, c.totalText);
  }
  /* ctx = {days, level:"basic"|"advanced", round, isAnniversary} → Promise<string> */
  async function cheer(ctx) {
    var c = ctx || {};
    var days = Math.max(0, Math.floor(Number(c.days) || 0));
    var anni = !!c.isAnniversary || c.level === "advanced";
    var round = Math.max(1, Math.floor(Number(c.round) || (anni ? Math.round(days / 365) : Math.round(days / 30)) || 1));
    var tot = { sec: 0, words: 0 };
    try {
      if (window.API && API.statsRange) {
        var r = API.statsRange("total") || {};
        tot.sec = r.sec || 0; tot.words = r.words || 0;
      }
    } catch (e) {}
    /* {total} 只填「X 小时 Y 字」，前缀「累计已读」由模板自己写 —— 免得拼出重复的句子 */
    var totalText = spanText(tot.sec) + " " + wordText(tot.words);

    if (window.API && API.run && API.hasModel && API.hasModel()) {
      try {
        var mems = enabledMems().slice(0, 5);
        var usr = "读者数据：连续打卡 " + days + " 天" + (anni ? "（第 " + round + " 个周年）" : "") +
          "；累计已读 " + totalText + "。请写这 2-3 句鼓励。";
        var rr = await API.run("brain.cheer", usr, {
          vars: {
            persona: persona(),
            memory: mems.length ? "\n【关于这位读者 · 主脑从行为中学到的】\n" + mems.map(memLine).join("\n") + "\n\n" : "\n",
            stat: "这位读者" + (anni ? "连续打卡满 " + days + " 天 —— 第 " + round + " 个周年" : "连续打卡满 " + days + " 天") + "，" + totalText + "。"
          }
        });
        var txt = String(rr.text || "").trim();
        if (txt) return txt;
      } catch (e) { /* 网络 / 超时 / 未配置：静默落模板池 —— 里程碑不该因为网络而空着 */ }
    }
    return cheerStub({ days: days, round: round, anni: anni, totalText: totalText });
  }

  /* ============================================================
     七、接线
     ① 上下文提供者 —— 所有 AI 入口共用主脑的上下文；
     ② 行为采集 —— 挂钩 InkStore 的写入，行为自动成为证据；
     ③ 首次信号播种 + 学习。
     ============================================================ */
  function attachStore() {
    if (!window.InkStore || InkStore.__brainHooked) return;
    InkStore.__brainHooked = true;

    var _ck = InkStore.setCheckin;
    InkStore.setCheckin = function (id, time) {
      var r = _ck.apply(this, arguments);
      observe("checkin", { taskId: id, time: time });
      return r;
    };
    var _uck = InkStore.removeCheckin;
    InkStore.removeCheckin = function (id) {
      var r = _uck.apply(this, arguments);
      observe("uncheckin", { taskId: id });
      return r;
    };
    var _note = InkStore.upsertNote;
    InkStore.upsertNote = function (note) {
      var r = _note.apply(this, arguments);
      observe("note", { docId: note && note.docId, ntype: note && note.ntype, color: note && note.color, kind: note && note.kind });
      return r;
    };
    var _read = InkStore.setRead;
    InkStore.setRead = function (patch) {
      var r = _read.apply(this, arguments);
      observe("read", { patch: patch || {} });
      return r;
    };
    var _prog = InkStore.setProgress;
    InkStore.setProgress = function (docId, pct) {
      var r = _prog.apply(this, arguments);
      observe("progress", { docId: docId, pct: pct });
      return r;
    };
  }

  function attachApi() {
    if (!window.API) return;
    if (API.setContextProvider) API.setContextProvider(preamble);
    /* 用户手动开关 / 忘掉记忆时，主脑把这件事转播给订阅者 —— 界面即时同步 */
    if (API.setMemoryNotifier) API.setMemoryNotifier(emitChange);
    /* 各 AI 入口的用法计数 —— 也是学习素材 */
    ["aiTrace", "aiExplain", "translate", "aiSearch"].forEach(function (fn) {
      if (typeof API[fn] !== "function" || API[fn].__brainCounted) return;
      var orig = API[fn];
      var key = { aiTrace: "trace", aiExplain: "explain", translate: "translate", aiSearch: "search" }[fn];
      var wrapped = function () {
        observe(key, {});
        return orig.apply(this, arguments);
      };
      wrapped.__brainCounted = true;
      API[fn] = wrapped;
    });
  }

  function boot() {
    attachStore();
    attachApi();
    seedSignals();
    learn({ silent: true });
    /* 合盖唤醒 / 切回页面时补学一次 */
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) learn({ silent: true });
    });
  }

  /* ============================================================
     对外接口
     ============================================================ */
  window.Brain = {
    /* 学习 */
    observe: observe,
    learn: learn,
    signals: sigGet,
    resetLearn: function () {
      try { localStorage.removeItem(K_SIG); localStorage.removeItem(K_SEED); } catch (e) {}
      boot();
      return learn();
    },

    /* 记忆（透传 api.js 的存储） */
    memories: memList,
    enabled: enabledMems,
    pick: pickMems,
    /* 订阅记忆变动（学到新的 / 用户开关 / 忘掉）—— 界面据此即时刷新，不轮询 */
    onChange: onChange,

    /* 上下文 */
    preamble: preamble,
    setDoc: function (id) { CUR_DOC = id || null; if (id) observe("open", { docId: id }); return CUR_DOC; },
    currentDoc: function () { return CUR_DOC; },
    docBrief: docBrief,
    behaviorBrief: behaviorBrief,
    /* 上下文包（v2.23 W1b）：api.js 的三个 AI 入口靠它拿到「这本书」 */
    buildContextPack: buildContextPack,
    packPrompt: packPrompt,
    contextFor: contextFor,
    chaptersOf: chaptersOf,

    /* 对话 */
    ask: ask,
    /* v1.5-S4 E3：读者点名要一份报告 —— 宿主先检索、按段号核依据，再落产物账 */
    report: report,
    /* v1.5-S4 E1：确认卡上「确认落地 / 先不」走这里接着跑上一轮（prev 只认 InkLoop.last()） */
    resumeTools: resumeTools,
    /* v1.5-S4 E2：本轮真捞上来的原文段落（产物工具据此写 source.passages） */
    roundPassages: function () { return ROUND_PASSAGES.slice(); },
    cheer: cheer,          /* v2.7 里程碑鼓励文案：在线真模型 / 离线模板池，返回纯文本 */
    reset: reset,
    history: function () { return history.slice(); },
    online: function () { return !!(window.API && API.hasModel && API.hasModel()); },

    /* 离线库 */
    offline: offline,
    summarize: summarize,
    corpus: corpus,
    kb: KB,

    /* 工具（页面复用） */
    docMeta: docMeta,
    docTitle: docTitle,
    blocksOf: blocksOf,
    blockText: blockText
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
