/* ============================================================
   ink-loop.js —— 主脑自主多轮 tool-calling 回合编排器（v1.4-S2）
   ------------------------------------------------------------
   它办的事：把「模型调工具 → 读到结果 → 再想 → 再调」这条循环第一次真正闭上。
   在此之前工具层只有一次机会：助手按预置问题生成一批指令，读者点头，落完就结束。
   模型看不到自己刚读到的东西，所以「先查再改」这类复合任务它办不成 —— 缺的不是
   工具，是回合。

   为什么单独成一个文件而不是塞进 ink-agent.js：工具语义与回合编排是两件事，
   合在一起谁都测不动（前者要验「这条指令能不能落地」，后者要验「第几轮停的、
   为什么停」）。循环体只认自家 Plan 形状，不认上游方言 —— 上游怎么把工具调用
   摊在响应里，是 api.js 传输层的事。

   三条不可让的边界（与 v2.23 W1d′ / v1.1-S5b 同一条铁律，不因「是循环」而放宽）：
   ① 模型给的一切永远只是建议：写操作在循环里照样不落，攒进 await[] 交界面点头；
   ② 无网络 / 没配模型时循环根本不启动，且给一句能照着做的说明；
   ③ 预算触顶不回滚已落地的动作 —— 回滚比停在半途更难解释，但停在哪必须上屏。

   依赖：API（api.js 的 llmMsgs/hasModel/capGet/capSet）、InkAgent（ink-agent.js）
   宿主桥：由 reader-app.js 交来 onPlan/onText/onTool/onAwait/onEvent 与 signal。
   ============================================================ */
(function () {
  "use strict";

  var DEF_BUDGET = { rounds: 6, calls: 24, ms: 180000 };
  var MAX_CORRECT = 2;    /* 同一枚工具的纠错回合上限：超了停机，别让它原地改参数改到天亮 */
  var MAX_PARALLEL = 4;   /* 一轮最多办 4 条调用，多余的截断并回灌「还剩 N 条没办」 */

  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function str(v, cap) { return String(v == null ? "" : v).slice(0, cap || 120); }
  function now() { return Date.now(); }

  /* 幂等键：规范化 args（键按字典序展开 + 去掉全部空白）后与工具名拼起来。
     直接 JSON.stringify 不行 —— 模型第二次可能把同一份参数换个键序吐出来，
     那是同一次调用，不是另一次。 */
  function normArgs(a) {
    if (!isObj(a)) return "";
    var keys = Object.keys(a).sort();
    var out = "{";
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = a[k];
      out += '"' + k + '":';
      if (isObj(v) || Array.isArray(v)) out += normVal(v);
      else if (typeof v === "number" || typeof v === "boolean") out += String(v);
      else if (v === null || v === undefined) out += "null";
      else out += '"' + String(v).replace(/["\\]/g, "") + '"';
      out += ",";
    }
    return out.replace(/,$/, "}").replace(/\s+/g, "");
  }
  function normVal(v) {
    if (Array.isArray(v)) {
      var parts = [];
      for (var i = 0; i < v.length; i++) {
        var x = v[i];
        parts.push(isObj(x) ? normVal(x) : (typeof x === "string" ? '"' + x.replace(/["\\]/g, "") + '"' : String(x)));
      }
      return "[" + parts.join(",") + "]";
    }
    if (isObj(v)) {
      var ks = Object.keys(v).sort(), out = "{";
      for (var k = 0; k < ks.length; k++) {
        var w = v[ks[k]];
        out += '"' + ks[k] + '":' + (isObj(w) || Array.isArray(w) ? normVal(w)
          : (typeof w === "string" ? '"' + w.replace(/["\\]/g, "") + '"' : String(w === undefined ? null : w))) + ",";
      }
      return out.replace(/,$/, "}");
    }
    return String(v);
  }
  function idemKey(name, args) { return name + "|" + normArgs(args); }
  function digest(s) {
    /* 只当台账里的「这轮干了哪一件事」指纹用，不是加密哈希，别拿它去证伪 */
    var h = 2166136261, m = String(s || "");
    for (var i = 0; i < m.length; i++) { h ^= m.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h.toString(36);
  }

  /* 上游回来的 tool_calls 里 arguments 是字符串（可能分片拼出来的），
     坏 JSON 是常态而不是异常：把它当「参数不对」走纠错回合，而不是摔整条循环。 */
  function parseArgs(raw) {
    if (isObj(raw)) return { ok: true, args: raw };
    var s = String(raw == null ? "" : raw);
    if (!s) return { ok: true, args: {} };
    try { var v = JSON.parse(s); return { ok: !!isObj(v), args: isObj(v) ? v : {}, why: isObj(v) ? "" : "bad-args" }; }
    catch (e) { return { ok: false, args: {}, why: "bad-args" }; }
  }

  /* 观察必须可定位：结果里带上「读到多少字 / 哪几块 / 存成了什么 id」，
     模型下一轮才谈得上「根据刚才读到的继续」，闸也才断言得了 B3。
     降级通路（JSON 那半）没有 tool_call_id 这回事 —— 那一家只认 role:user，
     硬灌 role:tool 会被服务端当畸形请求摔回来，所以这里按通路分两种形状。 */
  function feed(ctx, callId, payload) {
    var txt = JSON.stringify(payload);
    if (ctx.via === "json") return { role: "user", content: "观察：" + txt };
    return { role: "tool", tool_call_id: callId, content: txt };
  }
  /* 切到降级通路时要补的那一句协议说明：没有它，模型不知道该交出什么形状，
     「plan 里写工具名」这件事就成了猜 —— 猜错的每一条都会被校验挡下，白烧额度。 */
  var JSON_PROTOCOL = { role: "system", content:
    "这次不能用原生工具调用。请把要办的事写成 JSON：{\"plan\":[{\"tool\":\"工具名\",\"args\":{...}}]}；" +
    "不需要办事时写 {\"say\":\"给读者的话\"}。工具名与参数只能从上一条请求的 tools 名册里选，名册外的一律不认。" };

  function toolsPayload() {
    var t = (window.InkAgent && InkAgent.toolsPayload) || null;
    return t ? t() : [];
  }

  /* 上一条快照的正本只这一份：界面那两颗确认钮和闸都经 InkLoop.last() 取它。
     各存一份会漂移 —— 界面续跑用的是 A 副本、闸验的是 B 副本，那验的就不是用户点的。 */
  var LAST = null;

  /* 切进降级通路只做一次的事：认通路、补协议、收回合预算。
     上限按「现在跑到第几轮了」往上加 2，不是写死一个数 —— 触发降级那一轮已经烧掉了，
     写死 2 会让它一进去就触顶；反过来若读者把 rounds 调得比 2 还小，也不该被这里放大。 */
  function enterJson(ctx) {
    ctx.via = "json";
    ctx.tools = false;
    ctx.budget.rounds = Math.min(ctx.budget.rounds, ctx.rounds + 2);
    if (!ctx.protoPushed) { ctx.protoPushed = true; ctx.messages.push(JSON_PROTOCOL); }
  }

  function explain(why, extra) {
    var M = {
      "no-model": "这一步要模型：去主脑页填接口地址、密钥与模型名，再回来点。",
      "offline": "现在连不上网：循环不会在没有网络时改你的任何数据。",
      "correct-stalled": "同一枚工具连改两次还是不对，我先停下来 —— 继续问只会烧额度。",
      "budget-rounds": "回合用到顶了。",
      "budget-calls": "工具调用次数用到顶了。",
      "budget-ms": "时间用到顶了。",
      "aborted": "你叫停了。已完成的那几件留在清单里，还能逐条收回。"
    };
    return (M[why] || extra || why || "");
  }

  function newCtx(spec) {
    var b = Object.assign({}, DEF_BUDGET, isObj(spec.budget) ? spec.budget : {});
    return {
      goal: str(spec.goal, 200),
      host: isObj(spec.host) ? spec.host : {},
      budget: b,
      /* prm：宿主按槽位算好的那一份发送参数（{cfg, send}）。循环自己不懂「助手这一问该
         用哪家模型、什么温度」—— 那是提示词注册表的事。不接这一颗，宿主选了独立的
         assistant 端点也会在循环里被悄悄退回全局配置：界面选的是 A，发出去的是 B。 */
      prm: isObj(spec.prm) ? spec.prm : null,
      messages: (spec.messages || []).slice(),
      stream: !!spec.stream,
      tools: spec.tools === false ? false : true,
      plan: [],
      rounds: 0, calls: 0, landed: 0,
      seen: {},          /* 幂等键 → 上一次结果 */
      pend: {},          /* 幂等键 → 已进确认队列的那一条（同一枚写不列两遍） */
      corr: {},          /* 工具名 → 已纠错次数 */
      startedAt: now(),
      via: "native",
      net: 0,
      partial: "",       /* 已经吐给界面的字：叫停时靠它如实交出「说到哪儿了」 */
      roundText: "",     /* 本轮这一截：每轮开始清空，界面上的流只该续写本轮 */
      protoPushed: false,/* 降级协议那句 system 只补一次，多轮循环里反复追加会把上下文灌水 */
      signal: spec.host && spec.host.signal ? spec.host.signal : (spec.signal || null),
      answer: ""
    };
  }

  function aborted(ctx) { return !!(ctx.signal && ctx.signal.aborted); }

  /* 三条预算线只看「还要不要再发一轮」，触顶就停在这一轮之前 ——
     已经落地的动作不回滚（见文件头③）。 */
  function overBudget(ctx) {
    if (ctx.rounds >= ctx.budget.rounds) return "rounds";
    if (ctx.calls >= ctx.budget.calls) return "calls";
    if (now() - ctx.startedAt >= ctx.budget.ms) return "ms";
    return "";
  }

  /* 轮内只判 calls 与 ms，不判 rounds：rounds 的意思是「不再发新的一发请求」，
     而这一发的钱已经花掉了 —— 轮中还挂着 rounds 判据会把模型已经吐出来的调用
     当没发生过，白烧额度还把结果扣住不还给模型。 */
  function overCallBudget(ctx) {
    if (ctx.calls >= ctx.budget.calls) return "calls";
    if (now() - ctx.startedAt >= ctx.budget.ms) return "ms";
    return "";
  }

  function emit(ctx, kind, data) {
    var h = ctx.host;
    try {
      if (kind === "plan" && h.onPlan) h.onPlan(ctx.plan.slice());
      if (kind === "tool" && h.onTool) h.onTool(data);
      if (kind === "await" && h.onAwait) h.onAwait(data);
      if (h.onEvent) h.onEvent({ kind: kind, data: data, rounds: ctx.rounds, calls: ctx.calls });
    } catch (e) { /* 界面回调摔了不该把循环带崩：审计账本照记 */ }
  }

  function logAudit(ctx, entry) {
    ctx.plan.push(entry);
    /* 同一份证据要进工具层的流水：助手面板显示的「它到底干了什么」读的是那一份 */
    if (window.InkAgent && InkAgent.log) {
      InkAgent.log(entry.text || (entry.tool + " " + (entry.ok ? "成" : "未成")), entry.tool, entry.risk);
    }
    emit(ctx, "plan", entry);
  }

  async function askOnce(ctx, tools) {
    var o = { raw: true, stats: {}, timeout: ctx.budget.roundMs || 30000 };
    if (ctx.signal) o.signal = ctx.signal;
    /* 只有读者/宿主明确要流式才挂 onDelta —— api.js 里「有没有 onDelta」就是 stream 开关本身，
       这里无条件挂等于把每一发请求都变成流式，闸里「整段响应」那条通路就再也跑不到（A3 会退化成
       拿流式和流式比，看着像反证其实是自证）。
       吐出来的字先攒进 ctx.partial 再交界面：读者按停止时那一截已经上屏了，
       丢了它就成了「屏幕上有字、账上说没答」—— G2 判的正是这个差额。
       第二个参数是「本轮」自己这一截，不是全局 partial：界面上每轮各是一段流，
       喂全局会让第 2 轮把第 1 轮的话重打一遍。
       net 读的是 o.stats：api.js 把自动重问次数写进调用方给的那个 stats 对象里，返回值不带 stats。 */
    if (ctx.host.onText && ctx.stream) o.onDelta = function (t) {
      var s = String(t || "");
      ctx.partial += s;
      ctx.roundText += s;
      try { ctx.host.onText(s, ctx.roundText); } catch (e) {}
    };
    if (tools && ctx.tools) { o.tools = tools; o.toolChoice = "auto"; }
    if (ctx.via === "json") o.jsonFormat = true;
    if (ctx.prm) { if (ctx.prm.cfg) o.cfg = ctx.prm.cfg; Object.assign(o, ctx.prm.send || {}); }
    var r = await API.llmMsgs(ctx.messages, o);
    ctx.net += (o.stats && o.stats.net) || 0;
    return r;
  }

  /* 降级通路（T3）：这一家不认原生 tool_calls 时，改用固定形状 JSON。
     解析出的 plan 与原生通路收敛成同一个形状，循环体不认上游方言。 */
  function jsonPlan(ctx, content) {
    var j = API.pickJson ? API.pickJson(content) : null;
    if (!j) return { calls: [], say: str(content, 400) };
    if (Array.isArray(j.plan)) {
      return { calls: j.plan.map(function (p, i) {
        return { id: "json_" + i, name: str(p && p.tool, 40), args: isObj(p && p.args) ? p.args : {} };
      }) };
    }
    return { calls: [], say: str(j.say || j.answer || content, 400) };
  }

  function capToolsOff(e) {
    /* 只有「400 且响应体里点了 tools/tool_choice 的名」才翻能力位。
       401/403/429/超时是密钥与限流，把它们记成「不认工具」会让此后所有请求
       悄悄退回降级通路 —— 那是把配置错误伪装成能力差异。 */
    var s = Number(e && e.status) || 0;
    var body = String((e && e.body) || (e && e.message) || "");
    return s === 400 && /tool/i.test(body);
  }

  /* 一轮：发 → 收 → 对 → 分 → 灌。返回值是给上层的状态词，别在这里拼最终结果对象。 */
  async function oneRound(ctx, tools) {
    ctx.rounds++;
    ctx.roundText = "";
    var resp;
    try {
      resp = await askOnce(ctx, tools);
    } catch (e) {
      if (e && e.aborted) return "stopped";
      if (capToolsOff(e) && ctx.via === "native") {
        try { API.capSet("toolCalls", false); } catch (ce) {}
        enterJson(ctx);
        /* 降级不等于「换了个传送形状就一样强」，这句要上屏让读者看见：
           界面若继续写「已启用原生工具调用」，那就是替读者撒谎。 */
        logAudit(ctx, { round: ctx.rounds, tool: "(transport)", risk: "", ok: true, why: "tools-unsupported",
          text: "这一家不认原生工具调用，已改走结构化 JSON" });
        return "retry";
      }
      ctx.error = { why: "net", message: str(e && e.message, 200) };
      return "error";
    }

    var content = String((resp && (resp.content != null ? resp.content : resp.text)) || "");
    var rawCalls = resp && resp.tool_calls && resp.tool_calls.length ? resp.tool_calls
      : (resp && resp.toolCalls ? resp.toolCalls : null);
    var calls = [];
    if (rawCalls && rawCalls.length) {
      for (var c = 0; c < rawCalls.length; c++) {
        var it = rawCalls[c] || {};
        var fn = it.function || {};
        var pa = parseArgs(fn.arguments != null ? fn.arguments : it.arguments);
        calls.push({ id: str(it.id, 40) || ("call_" + ctx.rounds + "_" + c), name: str(fn.name || it.name, 40),
          parsed: pa });
      }
    } else if (ctx.via === "json" && content) {
      var jp = jsonPlan(ctx, content);
      if (jp.calls.length) calls = jp.calls.map(function (x) { return { id: x.id, name: x.name, parsed: { ok: true, args: x.args } }; });
      else { ctx.answer = jp.say || content; return "answer"; }
    }

    if (!calls.length) { ctx.answer = content; return "answer"; }

    /* 协议硬要求：先把带 tool_calls 的那条 assistant 消息原样压回上下文，
       再逐条交 tool 结果 —— 只灌 tool 不回灌 assistant，下一轮模型看不到自己问过什么。
       content 在 raw 通路里恒为字符串（api.js 的 rawMsg 兜过底），空串按 OpenAI 形状写成 null。 */
    var asst = { role: "assistant", content: content || null };
    if (rawCalls && rawCalls.length) asst.tool_calls = rawCalls;
    ctx.messages.push(asst);

    var cut = calls.length > MAX_PARALLEL ? calls.slice(0, MAX_PARALLEL) : calls;
    if (cut.length < calls.length) {
      for (var x = MAX_PARALLEL; x < calls.length; x++) {
        ctx.messages.push(feed(ctx, calls[x].id, { ok: false, why: "not-run", note: "一轮最多办 4 条，这条没办" }));
        logAudit(ctx, { round: ctx.rounds, tool: calls[x].name, argsDigest: "", risk: "", ok: false, why: "not-run",
          text: "这条没办（一轮最多 4 条）" });
      }
    }

    var awaits = [];
    for (var i = 0; i < cut.length; i++) {
      var cl = cut[i];
      if (aborted(ctx)) return "stopped";
      var t0 = now();

      if (!cl.parsed.ok) {
        var w1 = corr(ctx, cl.name);
        ctx.messages.push(feed(ctx, cl.id, { ok: false, why: cl.parsed.why, tool: cl.name }));
        logAudit(ctx, { round: ctx.rounds, tool: cl.name, argsDigest: "", risk: "", ok: false, why: cl.parsed.why,
          ms: now() - t0, text: "参数不是合法 JSON" });
        if (w1 > MAX_CORRECT) return "correct-stalled";
        continue;
      }

      var d = InkAgent.validate({ tool: cl.name, args: cl.parsed.args });
      if (!d.ok) {
        /* 校验不过不静默跳过：把「为什么不行、缺哪一项」交回模型，让它改 —— 这是纠错回合 */
        var w2 = corr(ctx, cl.name);
        var fb = { ok: false, why: d.why, tool: str(d.tool, 40) };
        if (d.miss) fb.miss = d.miss;
        if (d.bad) fb.bad = d.bad;
        if (d.why === "unknown-tool" && InkAgent.tools) fb.known = InkAgent.tools().map(function (t) { return t.name; });
        ctx.messages.push(feed(ctx, cl.id, fb));
        logAudit(ctx, { round: ctx.rounds, tool: cl.name, argsDigest: digest(normArgs(cl.parsed.args)), risk: "",
          ok: false, why: d.why, ms: now() - t0, text: "挡下：" + d.why });
        if (w2 > MAX_CORRECT) return "correct-stalled";
        continue;
      }

      var tool = d.tool, args = d.args, key = idemKey(tool.name, args);

      if (ctx.seen[key]) {
        /* 幂等：同一次调用第二次出现不再执行（防「再把刚才那 5 张卡建一遍」） */
        ctx.messages.push(feed(ctx, cl.id, { ok: true, deduped: true, prev: ctx.seen[key].result }));
        logAudit(ctx, { round: ctx.rounds, tool: tool.name, argsDigest: digest(key), risk: tool.risk, ok: true,
          why: "deduped", ms: now() - t0, text: "这条刚才办过了，没再办" });
        continue;
      }

      if (InkAgent.needConfirm(tool)) {
        /* 写（含换页）一律不落：攒进 await[] 交读者点头，但循环接着往下想（见 mergeAwaits）。
           同一枚写操作第二次出现也不再列第二遍 —— 确认队列里两条一样的「建这张卡」，
           读者点一次「确认落地」会落两遍，那比不落更糟。 */
        if (ctx.pend[key]) {
          ctx.messages.push(feed(ctx, cl.id, { ok: false, why: "already-queued", tool: tool.name,
            note: "这一条已经在等你点头了，没再列一遍" }));
          logAudit(ctx, { round: ctx.rounds, tool: tool.name, argsDigest: digest(key), risk: "write", ok: false,
            why: "already-queued", ms: now() - t0, text: "这条已经在确认队列里，没重复列" });
          continue;
        }
        var pv = InkAgent.preview(tool.name, args);
        ctx.pend[key] = { callId: cl.id, round: ctx.rounds };
        awaits.push({ tool: tool.name, args: args, preview: pv, callId: cl.id, round: ctx.rounds });
        /* 队列也是观察：不告诉模型「这条已交读者点头」，它会以为落地成功接着往下编，
           或原样再发一遍（那已被 pend 挡成 already-queued，白占一轮）。 */
        ctx.messages.push(feed(ctx, cl.id, { ok: false, why: "need-confirm", tool: tool.name,
          note: "这条没落地，已经放进确认队列等读者点头" }));
        logAudit(ctx, { round: ctx.rounds, tool: tool.name, argsDigest: digest(key), risk: "write", ok: false,
          why: "need-confirm", ms: now() - t0, text: "等你点头：" + (pv.title || tool.name) });
        continue;
      }

      var cb = overCallBudget(ctx);
      if (cb) {
        /* 轮内也要判 calls：一发响应里带三枚并行读时，只在轮与轮之间判等于
           让这一轮把上限冲过去。没办的每条都如实回灌，不假装办成。 */
        for (var y = i; y < cut.length; y++) {
          ctx.messages.push(feed(ctx, cut[y].id, { ok: false, why: "not-run", note: "预算用到顶了，这条没办" }));
          logAudit(ctx, { round: ctx.rounds, tool: cut[y].name, argsDigest: "", risk: "", ok: false,
            why: "not-run", text: "这条没办（预算用到顶）" });
        }
        mergeAwaits(ctx, awaits);
        return "budget:" + cb;
      }

      var r = await InkAgent.invoke(tool.name, args, {});
      ctx.calls++;
      ctx.seen[key] = { result: r, id: cl.id };
      ctx.messages.push(feed(ctx, cl.id, r && r.ok !== false ? r : Object.assign({ ok: false }, r || {})));
      logAudit(ctx, { round: ctx.rounds, tool: tool.name, argsDigest: digest(key), risk: tool.risk,
        ok: !!(r && r.ok), why: r && r.ok ? "" : (r && r.why) || "failed", ms: now() - t0,
        text: tool.name + (r && r.ok ? " 办了" : " 没办成：" + ((r && r.why) || "failed")) });
      emit(ctx, "tool", { tool: tool.name, ok: !!(r && r.ok), result: r, round: ctx.rounds });
    }

    mergeAwaits(ctx, awaits);
    return "loop";
  }

  /* 攒进确认队列，但循环不因此中断（queue-and-continue）：
     「先读→再改→还要再读」这类复合任务要的正是点头之前先把后面想到做完；
     停在队列上等于把回合权交还给读者，模型再想就得等一次点击。
     队列本身仍是「没落地」，写一条都不落盘（红线①），界面在每轮出队时把最新一份
     合并后的名册交出去，快照里 await[] 照旧带着 —— 点头钮与闸读的都是这一份。 */
  function mergeAwaits(ctx, list) {
    if (!list || !list.length) return;
    ctx.awaitQ = (ctx.awaitQ || []).concat(list);
    emit(ctx, "await", ctx.awaitQ.slice());
  }

  function corr(ctx, name) {
    ctx.corr[name] = (ctx.corr[name] || 0) + 1;
    return ctx.corr[name];
  }

  function snap(ctx, status, why) {
    var out = {
      status: status,
      answer: ctx.answer || "",
      partial: ctx.partial || "",
      rounds: ctx.rounds, calls: ctx.calls,
      plan: ctx.plan.slice(),
      await: (ctx.awaitQ || []).slice(),
      landed: ctx.landed,
      why: why || "",
      note: why ? explain(why, ctx.error && ctx.error.message) : "",
      via: ctx.via, net: ctx.net,
      ms: now() - ctx.startedAt,
      ctx: ctx            /* resume 要用的就这一份：messages / seen / corr / 预算计数 */
    };
    LAST = out;   /* 每一条出口都留正本：界面「等点头」之后按确认钮，拿到的就是刚出来的这一份 */
    return out;
  }

  async function drive(ctx) {
    var tools = ctx.via === "native" && ctx.tools ? toolsPayload() : null;
    for (;;) {
      var ob = overBudget(ctx);
      if (ob) return snap(ctx, "budget", "budget-" + ob);
      if (aborted(ctx)) return snap(ctx, "stopped", "aborted");
      var st = await oneRound(ctx, ctx.via === "native" && ctx.tools ? tools : null);
      if (st === "retry") continue;
      if (st === "loop") continue;
      if (st === "answer") {
        /* 最终回答也进台账：界面「想了什么」那一行与答案本身要同处一份证据里 */
        logAudit(ctx, { round: ctx.rounds, tool: "(answer)", risk: "", ok: true, why: "",
          text: "答了 " + String(ctx.answer || "").length + " 字" });
        return snap(ctx, "answer", "");
      }
      if (st.indexOf("budget:") === 0) return snap(ctx, "budget", "budget-" + st.slice(7));
      if (st === "stopped") return snap(ctx, "stopped", "aborted");
      if (st === "correct-stalled") return snap(ctx, "error", "correct-stalled");
      return snap(ctx, "error", (ctx.error && ctx.error.why) || "error");
    }
  }

  window.InkLoop = {
    budget: DEF_BUDGET,
    normArgs: normArgs,
    idemKey: idemKey,
    /* 唯一入口：跑一轮以上的自主回合，直到出答案 / 等到点头 / 触顶 / 被叫停。
       无模型或离线时根本不启动 —— 这是红线二，放在最前面，不靠上层自觉。 */
    run: async function (spec) {
      spec = spec || {};
      var ctx = newCtx(spec);
      if (!API.hasModel || !API.hasModel()) {
        return Object.assign(snap(ctx, "error", ""), { why: "no-model", note: explain("no-model") });
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return Object.assign(snap(ctx, "error", ""), { why: "offline", note: explain("offline") });
      }
      ctx.nativeCap = true;
      try { ctx.nativeCap = API.capGet ? API.capGet("toolCalls") !== false : true; } catch (e) {}
      if (!ctx.nativeCap) enterJson(ctx);
      return drive(ctx);
    },
    /* 上一条快照的正本：界面那两颗确认钮与闸都从这里取 prev，不各自留副本 */
    last: function () { return LAST; },
    /* 读者点完「确认落地 / 先不」之后接着跑：落地结果与拒绝都作为 tool 结果回灌，
       所以「先不」之后模型还能给一段不含写操作的收尾，而不是拒绝完就哑。 */
    resume: async function (prev, o) {
      o = o || {};
      var ctx = prev && prev.ctx ? prev.ctx : null;
      if (!ctx) return { status: "error", why: "no-ctx", plan: [], await: [], answer: "", rounds: 0, calls: 0, note: "这一步接不上刚才那轮" };
      ctx.signal = o.signal || ctx.signal;
      var list = (prev.await || []);
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (aborted(ctx)) { ctx.awaitQ = []; return snap(ctx, "stopped", "aborted"); }
        if (o.refuse) {
          ctx.messages.push(feed(ctx, a.callId, { ok: false, why: "refused-by-reader", tool: a.tool,
            note: "读者点了「先不」，这条没落地" }));
          logAudit(ctx, { round: a.round, tool: a.tool, argsDigest: digest(idemKey(a.tool, a.args)), risk: "write",
            ok: false, why: "refused", text: "读者拒绝了这一条" });
          continue;
        }
        var r = await InkAgent.invoke(a.tool, a.args, { confirm: true });
        /* landed 只数真办成的：读者点了头但工具当场判空（如目录建议位已过期）不该记一次落地，
           否则「落了几条」这个数就成了装饰 —— 界面上它是要上屏给读者看的。 */
        ctx.calls++; if (r && r.ok) ctx.landed++;
        ctx.seen[idemKey(a.tool, a.args)] = { result: r, id: a.callId };
        ctx.messages.push(feed(ctx, a.callId, r));
        logAudit(ctx, { round: a.round, tool: a.tool, argsDigest: digest(idemKey(a.tool, a.args)), risk: "write",
          ok: !!(r && r.ok), why: r && r.ok ? "" : (r && r.why) || "failed",
          text: "点头后落地：" + (r && r.ok ? "成" : ((r && r.why) || "failed")) });
        emit(ctx, "tool", { tool: a.tool, ok: !!(r && r.ok), result: r, round: a.round, landed: true });
      }
      ctx.awaitQ = [];
      if (o.finishOnly) {   /* 落完就收，不再问第 N+1 轮：界面上「只要这批」的那颗钮 */
        ctx.answer = String(o.doneNote || "已经按你点头的那几条办完了。");
        return snap(ctx, "answer", "");
      }
      return drive(ctx);
    }
  };
})();
