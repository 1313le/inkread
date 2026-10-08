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
    return "《" + d.title + "》" + (d.author ? "（" + d.author + "）" : "");
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

  function blocksOf(id) {
    var c = window.DB && DB.contents && DB.contents[id];
    return Array.isArray(c) ? c : [];
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
    { t: "闪卡与间隔重复", k: "闪卡 间隔 重复 记忆曲线 sm-2 复习 挖空",
      a: "学习类文档的模式条里有「闪卡」：把高亮挖空成问答卡，按简化的 SM-2 调度回来找你 —— 评分低于 3 判为遗忘、间隔归零；答对则按 1 → 6 → 间隔×EF 递增，EF 随评分微调、下限 1.3。到期队列会驱动徽标与计数，结算落 inkread.cards.v1。" },
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

  function persona() {
    var name = window.InkProfile ? InkProfile.name() : "读者";
    return [
      "你是「墨读」的主脑 —— 这套水墨屏阅读器的中枢智能。" +
        (window.InkProfile && !InkProfile.isDefault() ? "读者希望被称为「" + name + "」。" : ""),
      "",
      "【你的职责】",
      "你不只是对话框里的助手。本程序里所有用到 AI 的地方 —— 翻译、溯源（出处考证）、解析、检索、内容模式识别 —— 都由你完成。这里是你的对话入口，主要用于讨论读者已导入文档的内容、做总结与提炼，但你具备你所接入模型应有的全部能力：写作、编程、数学、翻译、常识、推理、创意，任何通用问题都直接、完整、认真地回答。不要因为「这是阅读器」就拒绝或敷衍与文档无关的问题。",
      "",
      "【作答要求】",
      "1. 先直接给答案，再补理由；不要用「作为 AI」之类的空话开场。",
      "2. 结合下面的读者记忆与文档上下文作答；引用原文时标明《书名》· 章节 · 页码。",
      "3. 拿不准就说不确定，绝不编造出处、数据或引文。",
      "4. 用中文回答（读者用其他语言提问时跟随其语言）。",
      "5. 篇幅按问题需要，不为了显得详细而灌水。"
    ].join("\n");
  }

  function buildMessages(q, mems, passages, docId) {
    var sys = [persona()];
    var pre = preamble("chat");
    if (pre) sys.push("", pre);
    if (passages.length) {
      sys.push("", "【相关原文 · 已从书里检索出来，可直接引用】");
      sys.push(passages.map(function (p) {
        return "· 《" + (p.docTitle || docTitle(docId) || "本书") + "》" + (p.chapter || "") + " · 第 " + (p.page || "?") + " 页：" + String(p.text || "").slice(0, 200);
      }).join("\n"));
    }
    var msgs = [{ role: "system", content: sys.join("\n") }];
    history.slice(-MAX_TURNS).forEach(function (h) { msgs.push(h); });
    msgs.push({ role: "user", content: q });
    return msgs;
  }

  async function ask(text, opts) {
    var o = opts || {};
    var q = String(text || "").trim();
    if (!q) return { reply: "", refs: [], mode: "none" };
    /* v2.2：记忆指令优先于一切（记住 / 忘掉 / 你记得我什么）—— 命中即办，不走模型 */
    var mc = memIntent(q);
    if (mc) { observe("chat", {}); return mc; }
    var docId = o.docId || CUR_DOC;
    var mems = pickMems(q, 4);

    if (window.API && API.hasModel && API.hasModel()) {
      /* 在线才需要先捞正文候选喂给模型；离线时 offline() 自己会捞，不必捞两遍 */
      var passages = await retrieve(q, docId, 6);
      var msgs = buildMessages(q, mems, passages, docId);
      var out = "";
      try {
        await API.llmMsgs(msgs, {
          temp: 0.6, timeout: 60000,
          onDelta: function (piece, all) {
            out = all != null ? all : out + piece;
            if (o.onDelta) o.onDelta(piece, out);
          }
        });
        history.push({ role: "user", content: q });
        history.push({ role: "assistant", content: out });
        if (history.length > MAX_TURNS * 2) history = history.slice(-MAX_TURNS * 2);
        observe("chat", {});
        return {
          reply: out, refs: mems.map(function (m) { return m.id; }),
          mode: "online", model: (API.modelCfg() || {}).model,
          passages: passages.length
        };
      } catch (e) {
        var off = await offline(q, { docId: docId });
        off.note = "模型请求失败（" + ((e && e.message) || "网络或跨域") + "），已改用离线库作答。";
        off.refs = off.refs || mems.map(function (m) { return m.id; });
        return off;
      }
    }
    observe("chat", {});
    var r = await offline(q, { docId: docId });
    return r;
  }

  function reset() { history = []; }

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

    if (window.API && API.llm && API.hasModel && API.hasModel()) {
      try {
        var mems = enabledMems().slice(0, 5);
        var parts = [persona(), ""];
        if (mems.length) parts.push("【关于这位读者 · 主脑从行为中学到的】", mems.map(memLine).join("\n"), "");
        parts.push(
          "【这次的任务 · 里程碑鼓励】",
          "这位读者" + (anni ? "连续打卡满 " + days + " 天 —— 第 " + round + " 个周年" : "连续打卡满 " + days + " 天") + "，" + totalText + "。",
          "请写 2-3 句真诚、有分寸、不油腻的鼓励：承认坚持本身的分量，但不夸张吹捧、不喊口号；",
          "可以用一个和阅读、坚持有关的小意象；感叹号不超过两个；不用 emoji，不用 markdown 标题与列表。",
          "只输出鼓励文本本身 —— 不要前后缀，不要解释你在做什么。"
        );
        var usr = "读者数据：连续打卡 " + days + " 天" + (anni ? "（第 " + round + " 个周年）" : "") +
          "；累计已读 " + totalText + "。请写这 2-3 句鼓励。";
        var txt = String(await API.llm(parts.join("\n"), usr, { temp: 0.85, maxTokens: 260, timeout: 20000 }) || "").trim();
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

    /* 对话 */
    ask: ask,
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
