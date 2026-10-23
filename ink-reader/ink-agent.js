/* ============================================================
   ink-agent.js —— 主脑工具层（v2.23 W1d′ 首刀）
   ------------------------------------------------------------
   做的事：把「主脑能碰应用」这件事收成一个面 —— 一张工具名册、一套确认与撤销。
   工具本体不猜模型想要什么：调用方（阅读助手）交来指令，
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
    /* docs 是「逐个参数的说明」：注册表里 "string?" 只说得了类型与可选，
       说不清「docId 不填即当前这本」。原生 tool_calls 那份名册要把这句话交上去，
       否则模型只能猜 —— 猜错的每一条都会被校验挡下，白烧额度。 */
    var t = { name: name, risk: risk, desc: desc, params: params || {}, run: run, confirm: o.confirm !== false, docs: o.docs || {} };
    for (var i = 0; i < regs.length; i++) if (regs[i].name === name) { regs[i] = t; return t; }
    regs.push(t);
    return t;
  }
  /* 撤销队列存的是一句「怎么收回」，不是整条记录。
     id 显式传进闭包（fn(u.id)）而不是靠循环变量 —— var 是函数作用域，
     批量建 5 张卡时所有闭包会共用最后一个 id，撤销五条只删得掉最后一条。 */
  function pushUndo(kind, id, fn) { undoQ.push({ kind: kind, id: id, at: Date.now(), fn: fn }); }

  /* ---------------- 工具名册：首刀九枚 + v1.4 补十四枚 + v1.5 产物三枚 ---------------- */

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
    }, { confirm: false, docs: {
      docId: "读哪本书，不填就是读者当前开着的这本",
      bi: "从第几块开始读（块号从 0 起），不填就从读者站的位置起",
      blocks: "一次读几块，1 到 12，不填按 6 块" } });

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
    }, { docs: {
      docId: "写进哪本书，不填就是当前这本",
      text: "笔记的那一句话，原样写进原文里能查到的句子才会自动定出出处；这条必填、不能空",
      body: "笔记正文的长文，只想要一条短笔记就不用给",
      anchor: "挂在原文哪一段的锚点，不给就按上面那句话查到的那段定",
      page: "落在第几页，不给同样按查到的那段取" } });

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
    }, { docs: {
      docId: "从哪本书里做卡，不填就是当前这本",
      quotes: "要做成闪卡的原文句子，一条条给原话（最多 20 条）；原文里查不到原句的那条不会成卡，会回在 missed 里" } });

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
    }, { docs: {
      titles: "每条任务的标题，一次最多 20 条，标题写成一句话说清要做什么",
      docId: "挂在哪本书下，不填就是当前这本",
      today: "true 就同时加进「今日」那一列，不给算 false" } });

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
    }, { confirm: false, docs: {
      bi: "跳到第几块（块号从 0 起）；三样里给一样就够，同时给了按块号优先",
      anchor: "跳到哪个锚点，就是引用回原文时带的那份出处标记",
      page: "跳到第几页（从 1 起）" } });

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
    }, { docs: {
      to: "去哪个页：shelf 书架 / reader 阅读 / notes 笔记 / cards 闪卡 / tasks 任务 / ai 主脑 / themes 天幕；名字不在这一列里会被挡下并回列出可选页" } });

  /* ---------------- 目录扫描两枚（定案 §三 T6）----------------
     为什么要拆成两枚：scan 是「读」——它问模型、把结果停在阅读页目录面板的建议位上，
     账本一个字节都不动；apply 是「写」——它才换整张表，所以要确认卡，且落账前存好旧表。
     这条边界和 S5b 的铁律是同一条：模型给的一切永远只是建议，改读者的东西要读者点头。
     本体不在这里实现（候选行预筛、逐字回原文查证都在阅读页，那里才有 blocks）：
     工具只负责把这份能力端给模型，并如实报告扫出了几节、为什么是 0 节。 */

  define("toc.scan", "read", "扫描当前这本书的正文，让模型认标题、给出一份候选目录（只进建议位，不改目录）",
    {},
    async function () {
      if (!host.tocScan) return { ok: false, why: "no-host" };
      var r = await host.tocScan();
      if (!r) return { ok: false, why: "failed" };
      var n = r.count || 0;
      trace(n ? "扫出 " + n + " 节候选目录（还没落账）" : "扫了一遍目录，没认出可用的节", "toc.scan", "read");
      /* why 只放状态码，人话留在 err 里：阅读页那套解释表认的是码，
         把一整句失败原因塞进 why 会让界面只能显示「未知原因」。 */
      return {
        ok: n > 0, count: n, why: n ? "" : (r.why || "none"),
        note: str(r.note, 80), err: str(r.err, 80), cut: str(r.cut, 60),
        toc: (r.items || []).slice(0, 8).map(function (x) { return { bi: x.bi, lv: x.lv, x: str(x.x, 40) }; })
      };
    }, { confirm: false });

  define("toc.apply", "write", "把刚才扫出的候选目录落成这本书的目录（采用前那份会存下来，可当场收回）",
    {},
    async function () {
      if (!host.tocApply) return { ok: false, why: "no-host" };
      var list = (host.tocSuggest && host.tocSuggest()) || [];
      if (!list.length) return { ok: false, why: "no-suggestion" };
      var n = await host.tocApply(list);
      if (!n) return { ok: false, why: "frozen-or-empty" };
      /* 快照只有一份，存在阅读页：面板上那颗「收回」与这里的 undo 收回的是同一次采用，
         谁先点都只回得去一次 —— 两处各存一份旧表迟早对不上，那是更坏的结局。 */
      pushUndo("目录", curDocId(), function () { return Promise.resolve(host.tocUndo ? host.tocUndo() : false); });
      trace("采用 " + n + " 节目录（旧表已存，可收回）", "toc.apply", "write");
      return { ok: true, count: n, undo: true };
    });

  /* ---------------- v1.4-S2 新十四枚：把「查、改、删」这一半补齐 ----------------
     首刀只有「建」没有「查」，模型连自己上一轮建了什么都不知道，多轮循环就成了空转：
     它读不到现状，就只能凭想象再建一遍。这十四枚每一条都接真出口 —— 注册了名字
     而背后没出口，是 v1.3 D5 那类缺陷，闸的 T 组逐枚点名验。 */

  define("notes.list", "read", "列出某本书里已有的笔记与批注（含 id、出处、摘要）",
    { docId: "string?", kind: "string?" },
    async function (p) {
      var id = str(p.docId, 60) || curDocId();
      var r = await API.fetchNotes(id);
      var all = (r && r.data) || [];
      var kind = str(p.kind, 20);
      var list = kind ? all.filter(function (n) { return n.kind === kind; }) : all;
      trace("翻了 " + list.length + " 条已有笔记" + (kind ? "（" + kind + "）" : ""), "notes.list", "read");
      return {
        ok: true, docId: id, count: list.length, kind: kind || "all",
        notes: list.slice(0, 30).map(function (n) {
          return { id: n.id, kind: n.kind || "note", text: str(n.text, 80), page: n.page || 0, anchor: str(n.anchor, 24), at: n.at || "" };
        })
      };
    }, { confirm: false, docs: { docId: "书的 id，不填即读者当前这本", kind: "只要这一类（note / highlight），不填全给" } });

  define("notes.update", "write", "改一条已有笔记的正文或标题（按 id 定位，改前那份可当场收回）",
    { id: "string", text: "string?", body: "string?" },
    async function (p) {
      var nid = str(p.id, 40);
      var rec = (window.InkStore && InkStore.getNote) ? InkStore.getNote(nid) : null;
      if (!rec) return { ok: false, why: "not-found", id: nid };
      /* 存一份改前正本进撤销闭包：upsert 是就地覆盖，改完再想「收回」就找不到旧字了。 */
      var prev = { text: rec.text, body: rec.body };
      var text = str(p.text, 400), body = str(p.body, 4000);
      if (!text && !body) return { ok: false, why: "nothing-to-change", id: nid };
      var next = Object.assign({}, rec);
      if (text) next.text = text;
      if (body) next.body = body;
      var r = await API.saveNote(next);
      if (!r || r.code !== 0) return { ok: false, why: "save-failed", id: nid };
      pushUndo("笔记", nid, function (i2) {
        return API.saveNote(Object.assign({}, next, { id: i2, text: prev.text, body: prev.body }));
      });
      if (host.refresh) host.refresh();
      trace("改了 1 条笔记（旧文已存，可收回）", "notes.update", "write");
      return { ok: true, id: nid, stored: r.stored !== false,
        changed: (text ? "text" : "") + (text && body ? "+" : "") + (body ? "body" : "") };
    }, { docs: { id: "notes.list 交回来的那条 id", text: "新标题句（不改就别填）", body: "新正文（不改就别填）" } });

  define("notes.delete", "write", "删掉一条笔记或闪卡（按 id；本次会话内还能当场收回）",
    { id: "string" },
    async function (p) {
      var nid = str(p.id, 40);
      var rec = (window.InkStore && InkStore.getNote) ? InkStore.getNote(nid) : null;
      if (!rec) return { ok: false, why: "not-found", id: nid };
      var gone = Object.assign({}, rec);
      await API.deleteNote(nid);
      pushUndo(gone.kind === "highlight" ? "闪卡" : "笔记", nid, function (i2) { return API.saveNote(Object.assign({}, gone, { id: i2 })); });
      if (host.refresh) host.refresh();
      trace("删了 1 条" + (gone.kind === "highlight" ? "闪卡" : "笔记") + "（本轮内可收回）", "notes.delete", "write");
      return { ok: true, id: nid, kind: gone.kind || "note", undo: true };
    }, { docs: { id: "notes.list 交回来的那条 id" } });

  define("cards.list", "read", "列出闪卡池与各自的复习状态（到期 / 暂停 / 重复次数）",
    { docId: "string?", dueOnly: "boolean?" },
    async function (p) {
      var id = str(p.docId, 60);
      var cardR = await API.fetchCards();
      var noteR = await API.fetchNotes(id);
      var cards = cardR && cardR.data || {};
      var notes = (noteR && noteR.data || []).filter(function (n) { return n.kind === "highlight"; });
      var today = new Date().toLocaleDateString("sv");
      var out = notes.map(function (n) {
        var st = cards[n.id] || {};
        return { id: n.id, text: str(n.text, 70), due: st.due || "", reps: st.reps || 0, suspended: !!st.suspended, overdue: !!st.due && st.due <= today };
      });
      var list = p.dueOnly ? out.filter(function (x) { return x.overdue && !x.suspended; }) : out;
      trace("点了闪卡池：" + list.length + " 张（到期 " + list.filter(function (x) { return x.overdue; }).length + "）", "cards.list", "read");
      return { ok: true, count: list.length, total: out.length, dueOnly: !!p.dueOnly, cards: list.slice(0, 30) };
    }, { confirm: false, docs: { docId: "只看这本书的卡，不填给全部", dueOnly: "true 时只列今天到期的" } });

  define("cards.suspend", "write", "暂停一张闪卡（不再排进复习队列，其余状态原样留着）",
    { id: "string" },
    async function (p) { return setSusp(p, true); },
    { docs: { id: "闪卡的 id（= 它那条批注的 id，cards.list 里有）" } });

  define("cards.resume", "write", "恢复一张被暂停的闪卡，重新排进复习队列",
    { id: "string" },
    async function (p) { return setSusp(p, false); },
    { docs: { id: "闪卡的 id" } });

  /* 暂停标记只是卡上的一位：SM-2 的 ef/ivl/reps 必须原样带走。
     api.js 的 setCard 是整条覆盖，所以这里先读回旧的那份再合并 ——
     直接写 {suspended:1} 会把读者攒了几个月的复习进度抹平。 */
  async function setSusp(p, on) {
    var nid = str(p.id, 40);
    if (!nid) return { ok: false, why: "no-id" };
    var r = await API.fetchCards();
    var all = (r && r.data) || {};
    var prev = all[nid];
    var next = Object.assign({}, prev || {});
    if (on) next.suspended = true; else delete next.suspended;
    var s = await API.saveCard(nid, next);
    if (!s || s.code !== 0) return { ok: false, why: "save-failed", id: nid };
    /* 旧的那条本来不存在（第一次复习前没有记录）→ 收回等于把这条记录删掉，
       留一个空壳会让闪卡页多出一张没有状态的卡。 */
    pushUndo("闪卡状态", nid, function (i) {
      return prev ? API.saveCard(i, prev) : API.deleteCard(i);
    });
    trace((on ? "暂停了 1 张闪卡" : "恢复了 1 张闪卡"), on ? "cards.suspend" : "cards.resume", "write");
    return { ok: true, id: nid, suspended: !!on, hadRecord: !!prev };
  }

  define("tasks.list", "read", "列出任务清单（可按书与「今日」过滤），带每条的 id",
    { docId: "string?", todayOnly: "boolean?" },
    async function (p) {
      var all = (API.localTasks && API.localTasks()) || [];
      var id = str(p.docId, 60);
      var list = all.filter(function (t) { return (!id || t.docId === id) && (!p.todayOnly || t.today); });
      trace("看了任务清单：" + list.length + " 条", "tasks.list", "read");
      return {
        ok: true, count: list.length, total: all.length,
        tasks: list.slice(0, 40).map(function (t) {
          return { id: t.id, title: str(t.title || t.x, 60), today: !!t.today, docId: str(t.docId, 40) };
        })
      };
    }, { confirm: false, docs: { docId: "只看这本书的任务", todayOnly: "true 时只列今天要做的那些" } });

  define("tasks.toggle", "write", "把一条任务加入或移出「今日」（不新建、不删除那条任务）",
    { id: "string", today: "boolean?" },
    async function (p) {
      var tid = str(p.id, 40);
      var all = (API.localTasks && API.localTasks()) || [];
      var rec = null;
      for (var i = 0; i < all.length; i++) if (all[i] && all[i].id === tid) { rec = all[i]; break; }
      if (!rec) return { ok: false, why: "not-found", id: tid };
      var was = !!rec.today;
      var want = typeof p.today === "boolean" ? p.today : !was;
      var r = await API.setToday(tid, want);
      if (!r || r.code !== 0) return { ok: false, why: "save-failed", id: tid };
      pushUndo("今日标记", tid, function (i2) { return API.setToday(i2, was); });
      trace((want ? "加入今日 1 条" : "移出今日 1 条") + "任务", "tasks.toggle", "write");
      return { ok: true, id: tid, today: want, was: was };
    }, { docs: { id: "tasks.list 交回来的那条 id", today: "true 加入今日 / false 移出；不填就是翻转" } });

  define("tasks.delete", "write", "删掉一条独立任务（本机没有回收站，这条删了找不回来）",
    { id: "string" },
    async function (p) {
      var tid = str(p.id, 40);
      var r = await API.deleteTask(tid);
      if (!r || r.code !== 0) return { ok: false, why: (r && r.msg) === "not-found" ? "not-found" : "save-failed", id: tid };
      /* 不放进撤销队列：saveTask 会另发一个 id，「收回」出来的是一条新任务，
         读者以为复原了、其实清单里多了一条别的 —— 不如当场说清删了就没了。 */
      trace("删了 1 条任务（本机无回收站，不可恢复）", "tasks.delete", "write");
      return { ok: true, id: tid, undo: false };
    }, { docs: { id: "tasks.list 交回来的那条 id" } });

  define("doc.search", "read", "在一本书的原文里逐字找一段话，回命中块及其块号 / 页码 / 锚点",
    { q: "string", docId: "string?" },
    async function (p) {
      var want = str(p.q, 200);
      if (!want) return { ok: false, why: "empty-q" };
      var id = str(p.docId, 60) || curDocId();
      if (!window.Brain || !id) return { ok: false, why: id ? "no-brain" : "no-doc" };
      var list = Brain.corpus(id) || [];
      var flat = function (s) { return String(s).replace(/\s+/g, ""); };
      var needle = flat(want), hits = [];
      for (var i = 0; i < list.length && hits.length < 12; i++) {
        var t = String(list[i].text || "");
        if (t.indexOf(want) >= 0 || (needle.length >= 4 && flat(t).indexOf(needle) >= 0)) {
          var at = Math.max(0, flat(t).indexOf(needle));
          hits.push({ bi: list[i].bi, page: list[i].page || 0, anchor: list[i].anchor || "", chapter: list[i].chapter || "",
            excerpt: t.slice(Math.max(0, at - 20), at + needle.length + 40) });
        }
      }
      trace("在原文里找「" + want.slice(0, 16) + "」：" + hits.length + " 处命中", "doc.search", "read");
      /* 0 处命中也是「查完了」，不是「查失败」：ok 表达这次查做成了，
         有没有找到由 count 说 —— 否则模型会把「没有」当成工具坏了，重试到烧完额度。 */
      return { ok: true, docId: id, q: want, count: hits.length, hits: hits };
    }, { confirm: false, docs: { q: "要逐字找的那段话", docId: "在哪本书里找，不填即当前这本" } });

  define("toc.list", "read", "读出一本书当前的目录（层级、标题、指向的块号）",
    { docId: "string?" },
    async function (p) {
      var id = str(p.docId, 60) || curDocId();
      if (!id) return { ok: false, why: "no-doc" };
      /* tocOf 交回的是一整份记录 {nodes, links}，不是数组：直接当列表用会得到
         items.length === undefined，「这本书有没有目录」就永远说不准。 */
      var rec = API.tocOf ? API.tocOf(id) : null;
      var items = (rec && rec.nodes) || [];
      trace("读了目录：" + items.length + " 节", "toc.list", "read");
      return {
        ok: true, docId: id, count: items.length,
        note: items.length ? "" : "这本书还没有目录（可以用 toc.scan 让模型扫一遍候选）",
        items: items.slice(0, 40).map(function (x) { return { lv: x.lv || 1, x: str(x.x, 50), bi: x.bi, anchor: str(x.anchor, 24) }; })
      };
    }, { confirm: false, docs: { docId: "哪本书的目录，不填即当前这本" } });

  define("progress.set", "write", "把这本书的阅读进度设成某个比例（0~1），书架上的读数跟着变",
    { docId: "string", progress: "number" },
    async function (p) {
      var id = str(p.docId, 60) || curDocId();
      var d = window.InkStore && InkStore.getDoc ? InkStore.getDoc(id) : null;
      if (!d) return { ok: false, why: "not-found", docId: id };
      var v = Number(p.progress);
      if (!isFinite(v)) return { ok: false, why: "bad-progress", got: String(p.progress) };
      v = Math.max(0, Math.min(1, v));
      var was = d.progress || 0;
      /* 走书架这条账，不走 progress.v1：后者是「读到哪一页」的本机游标，不进七个账本键、
         也不参与同步 —— 模型说「把这本书标成读完」，落点该是读者在书架上看到的那个数。 */
      var hit = InkStore.updateDoc(id, { progress: v });
      if (!hit) return { ok: false, why: "save-failed", docId: id };
      pushUndo("进度", id, function (i) { return Promise.resolve(InkStore.updateDoc(i, { progress: was })); });
      trace("把《" + (d.title || "本文") + "》进度设为 " + Math.round(v * 100) + "%", "progress.set", "write");
      return { ok: true, docId: id, progress: v, was: was, title: str(d.title, 40) };
    }, { docs: { docId: "哪本书", progress: "0 到 1 的比例（0.5 = 读到一半）" } });

  define("glossary.add", "write", "往术语表加一条「原词 → 译名」（同名以这条覆盖，内置表不动）",
    { src: "string", dst: "string", pos: "string?" },
    async function (p) {
      var src = str(p.src, 40), dst = str(p.dst, 60);
      if (!src || !dst) return { ok: false, why: "missing-pair" };
      var before = await API.fetchGlossary();
      var user = (before && before.data && before.data.user) || [];
      var had = user.some(function (t) { return t.src === src; });
      var r = await API.importGlossary([{ src: src, dst: dst, pos: str(p.pos, 12) }], "over");
      var d = (r && r.data) || {};
      if (!r || r.code !== 0 || !(d.added || d.over)) return { ok: false, why: "save-failed" };
      var rest = user.filter(function (t) { return t.src !== src; });
      pushUndo("术语", src, function () { return API.saveGlossary(rest); });
      trace("加了术语「" + src + " → " + dst + "」", "glossary.add", "write");
      return { ok: true, src: src, dst: dst, added: d.added || 0, over: d.over || 0, replaced: had };
    }, { docs: { src: "原文里的那个词", dst: "读者想看到的译名", pos: "词性（可选，n./v./adj.）" } });

  define("shelf.remove", "write", "从书架上移除一本书（笔记与闪卡不跟着删；EPUB 书仓的正文会一并清掉）",
    { docId: "string" },
    async function (p) {
      var id = str(p.docId, 60);
      var d = window.InkStore && InkStore.getDoc ? InkStore.getDoc(id) : null;
      if (!d) return { ok: false, why: "not-found", docId: id };
      var rec = Object.assign({}, d);
      pushUndo("书架条目", id, function (i) {
        return Promise.resolve(InkStore.setShelf([rec].concat(InkStore.getShelf().filter(function (x) { return x.id !== i; }))));
      });
      InkStore.removeDocs([id]);
      trace("从书架移除了《" + (rec.title || "本文") + "》", "shelf.remove", "write");
      return { ok: true, docId: id, title: str(rec.title, 40), disk: rec.src === "disk", notesKept: true };
    }, { docs: { docId: "要移除的那本书的 id（shelf.list 里有）" } });

  /* ---------------- v1.5-S4 E2：产物三枚（写要点头，读自动） ----------------
     两道本地校验各归一处，不许在这里再量一遍长度：
     · 容量闸归账本（api.js 的 setArt 一处，超预算退成索引行），这里只把「这份没存下正文」
       如实读回来上屏 —— 两处各量一次，超没超就变成两个答案。
     · 引用完整性只有工具层判得了：它才知道架上真有哪些书、那本书里真有哪几页。
       对不上出处的依据剔掉，而不是让它跟着产物落进读者本机、下次同步到另一台设备。
     校验口径是「这本书里查得到」，不是方案原文那句「命中本轮 retrieve() 的 passage」：
     两个宿主都没把本轮 passages 递进 InkLoop.run（brain.js loopAsk / reader-app 助手），
     resumeTools 更是显式递 passages: []，按检索命中判会在点头落地那一趟恒判不出。
     本轮真捞了几段仍然如实记账（source.passages），只是不当剔除的依据。 */
  var CITE_BOOK = /《([^》]{1,40})》/g;
  var CITE_PAGE = /第\s*([0-9]{1,4})\s*页/g;
  var CITE_ANCHOR = /#[A-Za-z0-9][A-Za-z0-9_.:-]{1,59}/g;
  var ART_READ_MAX = 40000;   /* 读回来的正文进上下文：一份 70 万字的产物整份喂回去，下一轮必被上游拒 */
  function citeFlat(s) { return String(s == null ? "" : s).replace(/\s+/g, ""); }
  function citeCut(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, 80); }

  /* 一本书可对证的事实：它本机真有哪些页码、哪些锚点。没解析过正文的书没有事实可查。 */
  function citeFacts(d) {
    var list = (window.Brain && Brain.corpus) ? (Brain.corpus(d.id) || []) : [];
    var f = { title: citeCut(d.title) || "这本书", has: list.length > 0, pages: {}, anchors: {} };
    list.forEach(function (b) {
      if (b.page) f.pages[b.page] = 1;
      if (b.anchor) f.anchors[citeFlat(b.anchor)] = 1;
    });
    return f;
  }

  /* 逐行判：一行里出现《书名》才算一条出处声明（裸的「第 12 页」不知归谁，不算声明也不挑错）。
     查得出的留在正文里；查不出的整行剔掉并说清为什么 —— 半行半句地改正文会把模型的话截断。 */
  function citeCheck(md) {
    var src = String(md == null ? "" : md);
    var marks = src.match(CITE_BOOK) || [];
    var shelf = (window.InkStore && InkStore.getShelf) ? (InkStore.getShelf() || []) : [];
    var idx = {};
    shelf.forEach(function (d) {
      if (!d || !d.id || !d.title) return;
      var k = citeFlat(d.title);
      if (k && !idx[k]) idx[k] = d;
    });
    /* 架上空空：一句都无从对证。判它「全查不出」会把「先写一份再导入书」这条路堵死，
       所以这里叫「查不了」而不叫「查无」—— 正文原样留着，一条都不剔。 */
    if (!Object.keys(idx).length) {
      return { md: src, dropped: [], cites: marks.length, unchecked: marks.length };
    }
    var cache = {}, keep = [], out = { md: src, dropped: [], cites: 0, unchecked: 0 };
    src.split("\n").forEach(function (line) {
      var named = line.match(CITE_BOOK) || [];
      if (!named.length) { keep.push(line); return; }
      out.cites++;
      var bad = "", known = [];
      named.forEach(function (mk) {
        if (bad) return;
        var k = citeFlat(mk.slice(1, -1));
        if (!k) return;
        if (!idx[k]) { bad = "架上没有" + mk + "这本书"; return; }
        if (known.indexOf(k) < 0) known.push(k);
      });
      if (!bad) {
        if (known.length !== 1) out.unchecked++;   /* 同一行两本书：那句页码不知归谁，不判 */
        else {
          var f = cache[known[0]] || (cache[known[0]] = citeFacts(idx[known[0]]));
          if (!f.has) out.unchecked++;             /* 书在架上但本机没正文：无从对证 */
          else {
            (line.match(CITE_PAGE) || []).forEach(function (mk) {
              if (bad) return;
              var n = parseInt(String(mk).replace(/[^0-9]/g, ""), 10) || 0;
              if (!f.pages[n]) bad = "《" + f.title + "》没有第 " + n + " 页";
            });
            (line.match(CITE_ANCHOR) || []).forEach(function (mk) {
              if (bad) return;
              if (!f.anchors[citeFlat(mk.slice(1))]) bad = "《" + f.title + "》里找不到锚点 " + mk;
            });
          }
        }
      }
      if (bad) out.dropped.push({ line: citeCut(line), why: bad });
      else keep.push(line);
    });
    if (out.dropped.length) out.md = keep.join("\n");
    return out;
  }

  /* 这一份产物是谁写出来的：只有从 InkLoop 的续跑通路落下来的，才算 loop。
     写操作一律要点头，而点头后落地的唯一通路就是 InkLoop.resume —— 它在办这一批之前
     先把正本改写成 status:"await"（循环本身早已改成 queue-and-continue，不再停在 await 上）。
     助手自己攒的那批（没起循环）落到这里 LAST 为空或已收尾，判 manual。 */
  function artRound() {
    var last = (window.InkLoop && InkLoop.last) ? InkLoop.last() : null;
    return last && last.status === "await" ? last : null;
  }

  define("artifact.write", "write", "把这一轮的结论写成一份产物（报告 / 大纲 / 数据表）存进本机产物账，可以反复读、可以下载、可以接着改",
    { title: "string", markdown: "string", kind: "string?", id: "string?", docId: "string?" },
    async function (p) {
      var title = str(p.title, 120), md = String(p.markdown == null ? "" : p.markdown);
      if (!title) return { ok: false, why: "no-title" };
      if (!md.trim()) return { ok: false, why: "no-body" };
      var c = citeCheck(md);
      if (c.dropped.length && !c.md.trim()) return { ok: false, why: "all-citations-dropped", dropped: c.dropped.slice(0, 3) };
      var id = str(p.id, 40), was = id ? API.artGet(id) : null;
      var restore = !was || !!String(was.md || "").trim();   /* 改前那版只剩索引时没正文可还原，不谎称收得回 */
      var round = artRound();
      var rec = { id: id, title: title, md: c.md,
        source: { docId: str(p.docId, 60) || curDocId() || "",
          passages: window.Brain && Brain.roundPassages ? Brain.roundPassages().length : 0,
          via: round ? "loop" : "manual" },
        audit: { rounds: round ? (round.rounds || 0) : 0, calls: round ? (round.calls || 0) : 0, rejected: c.dropped.length } };
      var kind = str(p.kind, 20).toLowerCase();
      if (kind) rec.kind = kind;
      var r = API.artWrite(rec);
      if (!r || !r.ok) return { ok: false, why: "write-failed", note: str(r && r.why, 80) };
      var a = r.art || {};
      if (restore) pushUndo("产物", a.id, function (aid) {
        return Promise.resolve(was ? API.artWrite(was) : API.artDelete(aid));
      });
      trace("写下产物《" + title + "》· " + a.size + " 字" +
        (c.dropped.length ? " · 剔了 " + c.dropped.length + " 条查无出处的依据" : ""), "artifact.write", "write");
      if (host.refresh) host.refresh();
      return { ok: true, id: a.id, title: str(title, 60), kind: a.kind, size: a.size,
        indexOnly: a.indexOnly === true, cites: c.cites, unchecked: c.unchecked,
        rejected: c.dropped.length, dropped: c.dropped.slice(0, 3), canUndo: restore,
        note: a.indexOnly === true
          ? "这份正文 " + a.size + " 字，超过本机单份 80 万字的预算，账上只留下索引与摘要：正文没存下来。要留全文就写短一些。"
          : "" };
    }, { docs: { title: "产物标题，写在产物卡上", markdown: "正文（Markdown）", kind: "档位：report 报告 / outline 大纲 / dataset 数据表，不填按 report",
      id: "要改写已有那一份就给它现在的 id（artifact.list 里有）；不给就是新写一份", docId: "这份是关于哪本书的，不填即当前这本" } });

  define("artifact.list", "read", "列出本机产物账里都有什么（id、标题、档位、字数、还留没留正文）",
    { kind: "string?", limit: "number?" },
    async function (p) {
      var all = API.artList() || [];
      var kind = str(p.kind, 20).toLowerCase();
      var n = Math.max(1, Math.min(30, Number(p.limit) || 10));
      var list = kind ? all.filter(function (a) { return String(a.kind).toLowerCase() === kind; }) : all;
      trace("翻了产物账：" + list.length + " 份", "artifact.list", "read");
      return { ok: true, count: list.length, total: all.length,
        artifacts: list.slice(0, n).map(function (a) {
          return { id: a.id, title: str(a.title, 60), kind: a.kind, size: a.size,
            indexOnly: a.indexOnly === true, rejected: (a.audit || {}).rejected || 0, excerpt: str(a.excerpt, 70) };
        }) };
    }, { confirm: false, docs: { kind: "只看某一档（report / outline / dataset），不填即全列", limit: "最多列几份（默认 10，上限 30）" } });

  define("artifact.read", "read", "读回本机某一份产物的正文 —— 接着改它就靠这一枚",
    { id: "string" },
    async function (p) {
      var id = str(p.id, 40), a = API.artGet(id);
      if (!a) return { ok: false, why: "not-found", id: id };
      var body = String(a.md || "");
      trace("读回了产物《" + str(a.title, 40) + "》", "artifact.read", "read");
      if (!body.trim()) {
        return { ok: true, id: a.id, kind: a.kind, title: str(a.title, 60), markdown: "",
          size: a.size, indexOnly: true, excerpt: str(a.excerpt, 200),
          note: "这一份当初超了本机预算，账上只留下索引与摘要，正文读不回来" };
      }
      var cut = body.length > ART_READ_MAX ? body.slice(0, ART_READ_MAX) : body;
      return { ok: true, id: a.id, kind: a.kind, title: str(a.title, 60), markdown: cut,
        size: a.size, indexOnly: false, truncated: cut.length !== body.length,
        rejected: (a.audit || {}).rejected || 0, updatedAt: a.updatedAt };
    }, { confirm: false, docs: { id: "要读的那一份的 id（artifact.list 里有）" } });

  /* ---------------- JSON Schema 投影（原生 tool_calls 的那份名册） ----------------
     注册表里的 "string?" 是我们的方言，上游认的是 JSON Schema：
     带 ? 的落不进 required —— 漏了这一条，模型每轮都会被「缺必填参数」挡掉，
     看着像它不会用工具，其实是我们没告诉它哪些可以不给。 */
  var JSON_T = { string: "string", number: "number", boolean: "boolean", array: "array", object: "object" };
  function toolsPayload() {
    return regs.map(function (t) {
      var props = {}, req = [];
      Object.keys(t.params).forEach(function (k) {
        var spec = String(t.params[k] || "string");
        var opt = spec.indexOf("?") >= 0;
        var ty = JSON_T[spec.replace(/\?/g, "")] || "string";
        var one = (t.docs && t.docs[k]) || (opt ? "可填可不填" : "必须给");
        props[k] = { type: ty, description: one };
        if (!opt) req.push(k);
      });
      return { type: "function", function: { name: t.name, description: String(t.desc || t.name),
        parameters: { type: "object", properties: props, required: req } } };
    });
  }

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
    } else if (name === "notes.update") {
      out.lines = [str(a.body, 90) || str(a.text, 90)];
      out.count = 1;
      out.title = "将改 1 条笔记 · 改前那一份当场可以收回";
    } else if (name === "notes.delete") {
      /* 确认卡上必须写清「收不收得回」：读者点下去之后能不能反悔，是他唯一还需要的信息。
         笔记这条能收回（本轮内），任务与书目那条不能 —— 措辞不能共用一句。 */
      var dn = (window.InkStore && InkStore.getNote) ? InkStore.getNote(str(a.id, 40)) : null;
      out.lines = [dn ? str(dn.text, 90) : "（找不到这条：" + str(a.id, 40) + "）"];
      out.count = 1;
      out.title = "将删 1 条" + (dn && dn.kind === "highlight" ? "闪卡" : "笔记") + " · 本轮内可以收回";
    } else if (name === "tasks.delete") {
      var dt = ((window.API && API.localTasks && API.localTasks()) || []).filter(function (t) { return t.id === str(a.id, 40); })[0];
      out.lines = [dt ? str(dt.title || dt.x, 90) : "（找不到这条：" + str(a.id, 40) + "）",
        "本机没有回收站 · 这条删了不可恢复"];
      out.count = 1;
      out.title = "将删 1 条任务 · 删了收不回";
    } else if (name === "shelf.remove") {
      var dr = (window.InkStore && InkStore.getDoc) ? InkStore.getDoc(str(a.docId, 60)) : null;
      out.lines = [dr ? str(dr.title, 60) : str(a.docId, 40),
        "只移书目 · 笔记与闪卡不跟着删（本轮内可收回这条书目）",
        dr && dr.src === "disk" ? "EPUB 正文会一并从本机清掉 · 要重读得重新导入" : ""];
      out.count = 1;
      out.title = "将从书架移除 1 本书 · 笔记与闪卡原样留着";
    } else if (name === "cards.suspend" || name === "cards.resume") {
      out.lines = [str(a.id, 40)]; out.count = 1;
      out.title = name === "cards.suspend"
        ? "将暂停 1 张闪卡 · 复习进度原样留着，可收回"
        : "将恢复 1 张闪卡 · 重新排进复习队列，可收回";
    } else if (name === "tasks.toggle") {
      out.lines = [str(a.id, 40)]; out.count = 1;
      out.title = "将把 1 条任务" + (a.today === false ? "移出" : a.today === true ? "加入" : "翻转") + "今日 · 改得回来";
    } else if (name === "progress.set") {
      out.lines = ["进度 " + Math.round(Math.max(0, Math.min(1, Number(a.progress) || 0)) * 100) + "%"];
      out.count = 1; out.title = "将改这本书的阅读进度 · 改前那个数可以收回";
    } else if (name === "glossary.add") {
      out.lines = [str(a.src, 40) + " → " + str(a.dst, 60)];
      out.count = 1; out.title = "将加 1 条术语 · 同名以这条覆盖，可收回";
    } else if (name === "artifact.write") {
      /* 确认卡上就把「有几条依据会被剔掉」说清：落库之后再报，读者已经点过头了 ——
         剔行这件事必须在点头之前看得见，否则「按你说的办」办掉的是被改过的东西。 */
      var ac = citeCheck(String(a.markdown == null ? "" : a.markdown));
      out.lines = [str(a.title, 60) + " · " + (str(a.kind, 20).toLowerCase() || "report") + " · " + ac.md.length + " 字"];
      if (ac.dropped.length) out.lines.push("将剔除 " + ac.dropped.length + " 条查无出处的依据（" +
        ac.dropped.slice(0, 2).map(function (d) { return d.why; }).join("；") + "）");
      if (ac.unchecked) out.lines.push("另有 " + ac.unchecked + " 条出处本机对不上证，原样留着");
      if (str(a.id, 40)) out.lines.push("这是改写已有那一份 · 改前那一版可以收回");
      out.count = 1; out.title = "将写 1 份产物进本机产物账";
    } else if (name === "toc.apply") {
      var sug = (host.tocSuggest && host.tocSuggest()) || [];
      out.lines = sug.slice(0, 8).map(function (r) { return "第 " + (r.lv || 1) + " 级 · " + str(r.x, 40); });
      if (sug.length > 8) out.lines.push("…另有 " + (sug.length - 8) + " 节，面板上逐条能看");
      out.count = sug.length;
      out.title = "将把目录换成模型扫出的 " + sug.length + " 节 · 采用前那一份可以当场收回";
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
    /* 原生 tool_calls 那份名册（JSON Schema 投影）：交给 api.js 塞进请求的 tools 字段 */
    toolsPayload: toolsPayload,
    /* 循环编排器（ink-loop.js）把它的台账同时记一份到这里：助手面板显示的
       「它到底干了什么」读的是这份流水，两处各记一份迟早对不上。 */
    log: function (text, tool, risk) { return trace(text, tool, risk); },
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
