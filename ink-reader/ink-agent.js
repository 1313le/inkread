/* ============================================================
   ink-agent.js —— 主脑工具层（v2.23 W1d′ 首刀）
   ------------------------------------------------------------
   做的事：把「主脑能碰应用」这件事收成一个面 —— 七枚工具、一份白名单、
   一套确认与撤销。工具本体不猜模型想要什么：调用方（阅读助手）交来指令，
   这里逐条对着注册表校验，认不出的名字、缺必填参数、参数类型不对，一律不执行。

   为什么写操作必须有确认与撤销：模型说「给这本书建 5 张卡」时，它并不知道自己
   要建的句子在原文里根本不存在。确认卡让读者看见将落地的每一条，撤销让落错了
   能当场收回来 —— 而不是等他到笔记页一条条删。

   本版不做完整 18 枚（方案 §W1d′），也不做「模型自主多轮调用」那条循环：
   首刀由助手用例驱动，指令由助手按预置问题生成，读者在确认卡上点头。
   自主轮次与原生 tool_calls 传输留给 v2.23.x 第二刀。

   依赖：InkStore（app.js）、API（api.js）、Brain（brain.js）
   宿主桥：阅读页用 InkAgent.host({...}) 交出自己才有的能力（跳转、页内定位）；
   没交就明说「此页未接入」，不让工具假装成功。
   ============================================================ */
(function () {
  "use strict";

  var regs = [];           /* [{name, risk, desc, params, confirm, run}] */
  var host = {};           /* 宿主能力桥（阅读页注册） */
  var undoQ = [];          /* 本次会话的写操作撤销队列 */
  var trail = [];          /* 动作流水：给界面显示「读了什么 / 将写什么」，也是审计证据 */
  var MAX_TRAIL = 60, uid = 0;

  function byName(name) {
    for (var i = 0; i < regs.length; i++) if (regs[i].name === name) return regs[i];
    return null;
  }
  function trace(text, tool, risk) {
    trail.push({ at: Date.now(), id: "a" + (++uid), tool: tool || "", risk: risk || "", text: String(text || "") });
    if (trail.length > MAX_TRAIL) trail = trail.slice(-MAX_TRAIL);
    return trail[trail.length - 1];
  }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function str(v, cap) { return String(v == null ? "" : v).trim().slice(0, cap || 120); }
  /* 模型交来的条目可能是字符串，也可能是 {q:…|text:…|title:…} ——
     按字符串硬拼会得到一串 [object Object]，所以先认字段再降级。 */
  function pickStr(x, cap) {
    if (x && typeof x === "object") {
      var cand = [x.q, x.text, x.quote, x.front, x.title, x.x];
      for (var i = 0; i < cand.length; i++) if (str(cand[i]).length >= 4) return str(cand[i], cap);
      return str(cand[0], cap);
    }
    return str(x, cap);
  }
  function curDocId() {
    return (host.docId && host.docId()) || (window.Brain && Brain.currentDoc && Brain.currentDoc()) || "";
  }
  function bookTitle(id) {
    var d = window.InkStore && InkStore.getDoc ? InkStore.getDoc(id) : null;
    return (d && d.title) || (window.Brain && id ? Brain.docTitle(id) : "") || "";
  }

  /* 一本书里按原文找一句话：返回命中块 {bi, anchor, page, text, chapter}。
     命中不了就是命中不了 —— 这是工具的诚实边界：模型编的句子不许进用户的卡池。 */
  function findQuote(docId, q) {
    var want = str(q, 400);
    if (!want || !window.Brain) return null;
    var list = Brain.corpus(docId) || [];
    var flat = function (s) { return String(s).replace(/\s+/g, ""); };
    var needle = flat(want);
    for (var i = 0; i < list.length; i++) {
      var t = String(list[i].text || "");
      if (t === want || t.indexOf(want) >= 0 || (needle.length >= 8 && flat(t).indexOf(needle) >= 0)) {
        return { bi: list[i].bi, anchor: list[i].anchor || "", page: list[i].page || 0, text: t, chapter: list[i].chapter || "" };
      }
    }
    /* 整句找不到，退一步按前 12 字找：模型常把一句原话截断或改标点，
       但它真引用过的那几个字还在。退到更短就成了瞎猜，宁可不给。 */
    if (needle.length >= 16) {
      var head = needle.slice(0, 12);
      for (var k = 0; k < list.length; k++) {
        if (flat(String(list[k].text || "")).indexOf(head) >= 0) {
          return { bi: list[k].bi, anchor: list[k].anchor || "", page: list[k].page || 0, text: String(list[k].text || ""), chapter: list[k].chapter || "" };
        }
      }
    }
    return null;
  }

  function define(name, risk, desc, params, run, o) {
    o = o || {};
    var t = { name: name, risk: risk, desc: desc, params: params || {}, run: run, confirm: o.confirm !== false };
    for (var i = 0; i < regs.length; i++) if (regs[i].name === name) { regs[i] = t; return t; }
    regs.push(t);
    return t;
  }
  /* 撤销队列存的是一句「怎么收回」，不是整条记录。
     id 显式传进闭包（fn(u.id)）而不是靠循环变量 —— var 是函数作用域，
     批量建 5 张卡时所有闭包会共用最后一个 id，撤销五条只删得掉最后一条。 */
  function pushUndo(kind, id, fn) { undoQ.push({ kind: kind, id: id, at: Date.now(), fn: fn }); }

  /* ---------------- 七枚首刀工具 ---------------- */

  define("shelf.list", "read", "列出书架上的书（书名 / 类别 / 进度）", {}, function () {
    var shelf = (window.InkStore && InkStore.getShelf()) || [];
    trace("翻了书架，共 " + shelf.length + " 本", "shelf.list", "read");
    return {
      ok: true, count: shelf.length,
      books: shelf.slice(0, 30).map(function (d) {
        return { id: d.id, title: str(d.title, 60), author: str(d.author, 40), type: d.type || "", progress: d.progress || 0, pages: d.pages || 0 };
      })
    };
  }, { confirm: false });

  define("doc.read", "read", "读一本书的正文（默认从读者站的位置起若干块）",
    { docId: "string?", bi: "number?", blocks: "number?" },
    function (p) {
      if (!window.Brain) return { ok: false, why: "no-brain" };
      var id = str(p.docId, 60) || curDocId();
      if (!id) return { ok: false, why: "no-doc" };
      var list = Brain.corpus(id) || [];
      if (!list.length) return { ok: false, why: "empty-doc", docId: id };
      var at = typeof p.bi === "number" ? p.bi : (host.selBi ? Math.max(0, host.selBi()) : list[0].bi);
      var n = Math.max(1, Math.min(12, Number(p.blocks) || 6));
      var seg = list.filter(function (b) { return b.bi >= at; }).slice(0, n);
      var chars = seg.reduce(function (s, b) { return s + String(b.text || "").length; }, 0);
      trace("读了《" + (bookTitle(id) || "本文") + "》" + (seg.length ? seg[0].chapter + " 起 " : "") + seg.length + " 块 · " + chars + " 字", "doc.read", "read");
      return {
        ok: true, docId: id, title: bookTitle(id),
        from: seg.length ? seg[0].bi : -1, chapter: seg.length ? seg[0].chapter : "",
        chars: chars, text: seg.map(function (b) { return String(b.text || ""); }).join("\n").slice(0, 2400)
      };
    }, { confirm: false });

  define("notes.create", "write", "把一条笔记写进这本书（kind=note，不进闪卡池）",
    { docId: "string", text: "string", body: "string?", anchor: "string?", page: "number?" },
    async function (p) {
      var text = str(p.text, 400);
      if (!text) return { ok: false, why: "empty-text" };
      var id = str(p.docId, 60) || curDocId();
      var hit = findQuote(id, text);
      var rec = {
        docId: id, kind: "note", color: "ink", ntype: "md",
        text: text, body: str(p.body, 4000),
        anchor: str(p.anchor, 40) || (hit && hit.anchor) || "",
        page: Number(p.page) || (hit && hit.page) || 0
      };
      var r = await API.saveNote(rec);
      if (!r || r.code !== 0) return { ok: false, why: "save-failed" };
      var nid = r.data.id;
      pushUndo("笔记", nid, function (i) { return API.deleteNote(i); });
      if (host.refresh) host.refresh();
      trace("写了 1 条笔记" + (id ? " · 《" + (bookTitle(id) || "本文") + "》" : ""), "notes.create", "write");
      return { ok: true, id: nid, stored: r.stored !== false, where: rec.anchor, page: rec.page };
    });

  define("cards.create", "write", "把原文里的句子做成闪卡（逐条回原文查证，查不到就不成卡）",
    { docId: "string", quotes: "array" },
    async function (p) {
      var id = str(p.docId, 60) || curDocId();
      var raw = Array.isArray(p.quotes) ? p.quotes : [];
      var qs = [];
      for (var i = 0; i < raw.length && qs.length < 20; i++) { var s = pickStr(raw[i], 300); if (s) qs.push(s); }
      if (!qs.length) return { ok: false, why: "empty-quotes" };
      if (!id) return { ok: false, why: "no-doc" };
      var made = [], missed = [];
      for (var k = 0; k < qs.length; k++) {
        var hit = findQuote(id, qs[k]);
        if (!hit) { missed.push(qs[k]); continue; }
        var rec = {
          docId: id, kind: "highlight", color: "accent", ntype: "md",
          text: hit.text.length > 240 ? hit.text.slice(0, 240) : hit.text, body: "",
          anchor: hit.anchor, page: hit.page
        };
        var r = await API.saveNote(rec);
        if (!r || r.code !== 0) { missed.push(qs[k]); continue; }
        made.push(r.data.id);
        pushUndo("闪卡", r.data.id, function (nid) { return API.deleteNote(nid); });
      }
      if (host.refresh) host.refresh();
      trace("做成 " + made.length + " 张闪卡" + (missed.length ? "，" + missed.length + " 条原文里查无此句" : ""), "cards.create", "write");
      return { ok: made.length > 0, made: made.length, ids: made, missed: missed, why: made.length ? "" : "not-in-text" };
    });

  define("tasks.create", "write", "生成待办任务并落进任务页",
    { titles: "array", docId: "string?", today: "boolean?" },
    async function (p) {
      var raw = Array.isArray(p.titles) ? p.titles : [];
      var ts = [];
      for (var i = 0; i < raw.length && ts.length < 20; i++) { var s = pickStr(raw[i], 120); if (s) ts.push(s); }
      if (!ts.length) return { ok: false, why: "empty-titles" };
      var id = str(p.docId, 60) || curDocId();
      var made = [];
      for (var k = 0; k < ts.length; k++) {
        var r = await API.saveTask({ x: ts[k], docId: id, today: !!p.today, src: "AI 助手" });
        if (!r || r.code !== 0) continue;
        made.push(r.data.id);
        pushUndo("任务", r.data.id, function (tid) { return API.deleteTask(tid); });
      }
      trace("建了 " + made.length + " 条任务" + (p.today ? "（含今日）" : ""), "tasks.create", "write");
      return { ok: made.length > 0, made: made.length, ids: made, why: made.length ? "" : "save-failed" };
    });

  define("reader.goto", "ui", "跳到书中的某个位置（块号 / 锚点 / 页码）",
    { bi: "number?", anchor: "string?", page: "number?" },
    function (p) {
      /* 引用跳转本身就是读者点出来的动作，不再二次确认；换页才要点头 */
      if (!host.goto) return { ok: false, why: "no-host" };
      var t = null;
      if (typeof p.bi === "number") t = { kind: "block", bi: p.bi };
      else if (p.anchor) t = { kind: "anchor", anchor: str(p.anchor, 40) };
      else if (p.page) t = { kind: "page", page: Number(p.page) };
      if (!t) return { ok: false, why: "no-target" };
      var done = !!host.goto(t);
      if (done) trace("跳回原文：" + (t.bi != null ? "第 " + (t.bi + 1) + " 块" : t.page ? "第 " + t.page + " 页" : "所引的那一段"), "reader.goto", "ui");
      return { ok: done, why: done ? "" : "not-found" };
    }, { confirm: false });

  define("ui.navigate", "ui", "换到应用的另一个页面",
    { to: "string" },
    function (p) {
      var PAGES = { shelf: "index.html", reader: "reader.html", notes: "notes.html", cards: "cards.html", tasks: "tasks.html", ai: "ai.html", themes: "themes.html" };
      var key = str(p.to, 20).toLowerCase();
      var href = PAGES[key];
      if (!href) return { ok: false, why: "unknown-page", pages: Object.keys(PAGES) };
      if (href === (location.pathname.split("/").pop() || "index.html")) return { ok: true, same: true };
      /* 换页按全局同一条转场约定走（inkread.nav.v1）：直接改 location 会和首启动画打架 */
      if (window.InkKeys && InkKeys.navGo) InkKeys.navGo(href);
      else { try { sessionStorage.setItem("inkread.nav.v1", "1"); } catch (e) {} location.href = href; }
      trace("去了「" + key + "」页", "ui.navigate", "ui");
      return { ok: true, to: href };
    });

  /* ---------------- 白名单校验与执行 ---------------- */

  var TYPE_OF = { string: "s", number: "n", boolean: "b", array: "a", object: "o" };
  function typeOf(v) {
    if (Array.isArray(v)) return "a";
    if (isObj(v)) return "o";
    if (typeof v === "number") return "n";
    if (typeof v === "boolean") return "b";
    return "s";
  }
  /* 参数表写法："string" 必填 / "string?" 可选。校验只看这一张表 ——
     模型递来一个没登记的工具名、漏了必填项、或把数组写成字符串，在这里就挡掉，不进 run()。 */
  function validate(dir) {
    if (!isObj(dir)) return { ok: false, why: "not-object" };
    var name = str(dir.tool, 40) || str(dir.name, 40);
    var t = byName(name);
    if (!t) return { ok: false, why: "unknown-tool", tool: name };
    var args = isObj(dir.args) ? dir.args : (isObj(dir.params) ? dir.params : {});
    var miss = [], bad = [];
    Object.keys(t.params).forEach(function (k) {
      var spec = t.params[k], need = spec.indexOf("?") < 0;
      var want = TYPE_OF[spec.replace("?", "")];
      var has = args[k] !== undefined && args[k] !== null && args[k] !== "";
      if (!has && need) miss.push(k);
      if (has && want && typeOf(args[k]) !== want) bad.push(k + ":" + typeOf(args[k]) + "≠" + want);
    });
    if (miss.length) return { ok: false, why: "missing-param", tool: name, miss: miss };
    if (bad.length) return { ok: false, why: "bad-type", tool: name, bad: bad };
    return { ok: true, tool: t, args: args };
  }

  /* 该不该由读者点头：写操作一律要；ui 里只有「换页」要（页内跳转是读者自己点的引用）。 */
  function needConfirm(t) { return t.risk === "write" || (t.risk === "ui" && t.confirm); }

  function previewOf(name, a) {
    var out = { tool: name, lines: [], count: 0 };
    if (name === "cards.create") {
      out.lines = (Array.isArray(a.quotes) ? a.quotes : []).map(function (q) { return pickStr(q, 60); });
      out.count = out.lines.length;
      out.title = "将新建 " + out.count + " 张闪卡 · 逐条回原文查证，查不到的会明说";
    } else if (name === "tasks.create") {
      out.lines = (Array.isArray(a.titles) ? a.titles : []).map(function (x) { return pickStr(x, 60); });
      out.count = out.lines.length;
      out.title = "将新建 " + out.count + " 条任务" + (a.today ? "（加入今日）" : "");
    } else if (name === "notes.create") {
      /* body 往往就是没截断的那份 text —— 两行各截 90 字会摊成「看着像两条」的重复，
         标题却写着 1 条。所以正文只列一遍，第二行改说出处（回不回得去原文是读者点确认前
         唯一还想知道的事）。 */
      var t = str(a.text, 90), b = str(a.body, 90);
      out.lines = [t];
      if (b && b !== t && b.indexOf(t) !== 0 && t.indexOf(b) !== 0) out.lines.push("另附正文 " + b);
      out.lines.push(a.page ? "出处 第 " + a.page + " 页"
        : (a.anchor ? "出处 " + str(a.anchor, 24) : "不带出处 · 存下后回不去原文"));
      out.count = 1; out.title = "将写 1 条笔记";
    } else if (name === "ui.navigate") {
      out.lines = [str(a.to, 20)]; out.count = 1; out.title = "将离开本页，去「" + str(a.to, 20) + "」";
    } else {
      out.lines = [JSON.stringify(a).slice(0, 160)]; out.count = 1; out.title = name;
    }
    return out;
  }

  async function invoke(name, args, o) {
    o = o || {};
    var d = validate({ tool: name, args: args });
    if (!d.ok) {
      trace("挡下一条指令：" + d.why + (d.tool ? "（" + d.tool + "）" : ""), name, "");
      return { ok: false, rejected: true, why: d.why, detail: d };
    }
    var t = d.tool;
    if (needConfirm(t) && !o.confirm) {
      return { ok: false, needConfirm: true, tool: t.name, risk: t.risk, preview: previewOf(t.name, d.args), args: d.args };
    }
    try {
      var r = await t.run(d.args, o);
      if (!r || typeof r !== "object") r = { ok: !!r, data: r };
      if (!r.ok && !r.why) r.why = "failed";
      return r;
    } catch (e) {
      return { ok: false, why: "error", err: String((e && e.message) || e) };
    }
  }

  async function undo(id) {
    for (var i = undoQ.length - 1; i >= 0; i--) {
      if (id && undoQ[i].id !== id) continue;
      var u = undoQ.splice(i, 1)[0];
      try { await u.fn(u.id); } catch (e) { return { ok: false, why: "error", kind: u.kind }; }
      if (host.refresh) host.refresh();
      trace("撤回了 1 条" + u.kind, "undo", "write");
      return { ok: true, kind: u.kind, id: u.id };
    }
    return { ok: false, why: "not-found" };
  }

  window.InkAgent = {
    /* 宿主桥：阅读页把「只有本页才有的能力」交进来 */
    host: function (o) { if (isObj(o)) host = Object.assign(host, o); return host; },
    tools: function () {
      return regs.map(function (t) {
        return { name: t.name, desc: t.desc, risk: t.risk, confirm: t.confirm, params: Object.assign({}, t.params) };
      });
    },
    get: byName,
    validate: validate,
    needConfirm: needConfirm,
    preview: previewOf,
    invoke: invoke,
    /* 一批指令（模型的结构化结果映射成工具调用）：先全部校验，有一条不认就不执行整批 ——
       半批落地比一条不落更难解释，也更难撤销。 */
    execute: async function (dirs, o) {
      o = o || {};
      var list = Array.isArray(dirs) ? dirs : [dirs];
      var checked = list.map(validate);
      for (var i = 0; i < checked.length; i++) {
        if (!checked[i].ok) return { ok: false, why: "rejected", index: i, detail: checked[i] };
      }
      var out = [];
      for (var k = 0; k < checked.length; k++) out.push(await invoke(checked[k].tool.name, checked[k].args, o));
      return { ok: out.every(function (r) { return r.ok; }), results: out };
    },
    undo: undo,
    pending: function () { return undoQ.map(function (u) { return { kind: u.kind, id: u.id, at: u.at }; }); },
    trace: function () { return trail.slice(); },
    traceClear: function () { trail = []; return trail.slice(); }
  };
})();
