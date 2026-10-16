/* ============================================================
   cast.js · 多角色朗读（阅读模式读小说）
   ------------------------------------------------------------
   纯算法，不碰 DOM：切台词 → 认说话人 → 建角色表 → 排配音。
   播放层只消费它产出的「单元」（每单元带一个角色名或 null=旁白），
   所以识别与播放互不耦合，这一层能用夹具逐条钉死（verify-v226-cast.js）。

   三层归属（方案 §五）：
     L1 规则（本文件）：提示语 → 代词回指 → 两人轮转；判不出归旁白（宁保守不误判）。
     L2 模型：applyModel() 把模型给的 [{i, speaker}] 合进来（调用方负责问模型）。
     L3 用户：角色表里的手动指派永远压过前两层（mergeUser）。
   口吻与取舍写在各函数上方；有争议的判断都以「宁可归旁白」为准。
   ============================================================ */
(function () {
  "use strict";

  /* 说类动词：只收常见的。收得太宽会把「作者写道」也算成说话人 —— 那类词故意不进表。 */
  var SAY = "道|说道|说|问|问道|答|答道|喊|叫道|叫|笑道|笑问|冷哼|低声道|低声说|开口|回答|嘟囔|嘀咕|怒道|插话|插嘴|自言自语|骂道|叹道|嚷道|冷笑|呵呵一笑";
  var SAY_RE = new RegExp("(?:" + SAY + ")", "g");
  /* 引号对：只收中文小说里真正在用的四种。单引号 ' 不收 —— 英文撇号会把整段切碎。 */
  var PAIRS = [["「", "」"], ["『", "』"], ["“", "”"], ["\"", "\""]];
  var PRON = { "他": "m", "她": "f", "它": "", "我": "", "你": "", "您": "", "咱": "" };
  var NOT_NAME = /^(他|她|它|我|你|您|咱|这|那|大|小|老|众|人|众人|大家|对方|两|一个|那个|这个)$/;

  /* ---------------- ① 切台词 ----------------
     返回 [{t:"narr"|"say", x:文本, q:引号}]。未闭合的引号当普通字符（小说里破损的引号不该吞掉后半段）。 */
  function splitSpans(text) {
    var s = String(text || ""), out = [], buf = "", i = 0;
    while (i < s.length) {
      var ch = s.charAt(i), close = null, p;
      for (p = 0; p < PAIRS.length; p++) if (ch === PAIRS[p][0]) { close = PAIRS[p][1]; break; }
      if (!close) { buf += ch; i++; continue; }
      var j = s.indexOf(close, i + 1);
      if (j < 0) { buf += ch; i++; continue; }
      if (buf) { out.push({ t: "narr", x: buf }); buf = ""; }
      out.push({ t: "say", x: s.slice(i + 1, j), q: ch });
      i = j + 1;
    }
    if (buf) out.push({ t: "narr", x: buf });
    return out;
  }

  /* ---------------- ② 提示语找名字 ----------------
     tail=true 取这段旁白的**末尾**（前置式：「张三道：“…”」）；
     tail=false 取**开头**（后置式：「“…，”张三说。」）。
     动词取靠近引文的那一个（前置式取最后一个、后置式取第一个），
     名字只取动词前 2–4 个汉字 —— 这样「张三说道」不会把名字吃成「张三说」。 */
  function tagName(narr, tail) {
    var t = String(narr || "");
    if (!t) return null;
    var seg = tail ? t.slice(-18) : t.slice(0, 14);
    SAY_RE.lastIndex = 0;
    var m, hits = [];
    while ((m = SAY_RE.exec(seg))) { hits.push(m.index); if (hits.length > 6) break; }
    /* 合并「相邻两击」：正则里 `道` 与 `问道` 并列时，「问道」会被拆成两次命中（1 与 2），
       取最后一次就把「道」当成了动词、把「她问」当成了名字（实测踩过）。
       合并后每个动词只留首字位置。 */
    var merged = [];
    for (var q = 0; q < hits.length; q++) {
      if (merged.length && hits[q] === merged[merged.length - 1] + 1) continue;
      merged.push(hits[q]);
    }
    hits = merged;
    if (!hits.length) return null;
    var at = tail ? hits[hits.length - 1] : hits[0];
    var before = seg.slice(Math.max(0, at - 6), at);
    /* 先试 2–4 字的名字；再试单字代词（「他说道」也带信息：性别指向 + 回指信号）。
       match 的结果没有捕获组，取 [0] —— 这行踩过：写成 [1] 会永远拿到 undefined。 */
    var nm = before.match(/[\u4e00-\u9fff]{2,4}$/);
    if (nm) {
      var name = nm[0];
      /* 剥掉动词前常见的状语尾巴：「张三笑着说道」不该被认成「张三笑着」。
         剥完还不足 2 字就当没认出来（宁缺勿错）。 */
      var stripped = name.replace(/(笑着|笑道|冷笑|呵呵一笑|低声|轻声|小声|大声|轻轻|缓缓|慢慢|冷冷|淡淡|连忙|急忙|忙|又|才|才又)$/g, "");
      if (stripped.length >= 2) name = stripped;
      if (NOT_NAME.test(name)) return null;
      if (/^(心里|心中|暗自|默默|连忙|急忙|于是|接着|然后|只是|不过|忽然|突然)$/.test(name)) return null;
      return name;
    }
    var pr = before.match(/[他她我你您咱]$/);
    return pr ? pr[0] : null;
  }

  /* 旁白里点名的人：「张三走了进来」这种 —— 只用来**解析代词**，不据此断定谁在说话。
     词形收得窄（名字 + 走/站/抬/转/点/摇/叹/皱/笑/说/问 族动词），误捉也不会造成说话人误判。 */
  var MENTION_RE = /([\u4e00-\u9fff]{2,3})(?=走了进来|走进|出来|走了|进来|进来|站起|站着|坐下|坐着|站起身来|抬起|抬头|低头|转身|点头|摇头|叹气|皱眉|笑了笑|笑了|说着|问|答道|回答)/;
  function mentionName(text) {
    var s = String(text || ""), m, last = null;
    var re = new RegExp(MENTION_RE.source, "g");
    while ((m = re.exec(s))) {
      if (re.lastIndex === m.index) re.lastIndex++;
      /* 只认「词的起点」：捕获前面还是汉字就说明它切在词中间 ——
         「张三走了进来」里那个「走了」就是这么冒出来的（后面正好跟着「进来」撞上了前瞻表）。 */
      if (m.index > 0 && /[\u4e00-\u9fff]/.test(s.charAt(m.index - 1))) continue;
      last = m[1];
    }
    if (!last) return null;
    if (NOT_NAME.test(last)) return null;
    return last;
  }

  /* ---------------- ③ 性别线索 ----------------
     只在**首现的同一段**里看：名字附近 12 字内出现「她」记女、出现「他」记男；
     都没线索就留空（角色表里可手改）。不跨段猜 —— 跨段容易把旁白里的他/她算到角色头上。 */
  function genderHint(name, text) {
    var s = String(text || ""), i = s.indexOf(name);
    if (i < 0) return "";
    var win = s.slice(Math.max(0, i - 12), i + name.length + 12);
    if (/她/.test(win) && !/他/.test(win)) return "f";
    if (/他/.test(win) && !/她/.test(win)) return "m";
    return "";
  }

  function recentPush(list, name) {
    if (!name) return list;
    var out = [name];
    for (var i = 0; i < list.length && out.length < 2; i++) if (list[i] !== name) out.push(list[i]);
    return out;
  }

  /* ---------------- ④ 一行（一段 blocks）里的归属 ----------------
     ctx 跨段传递：lastName / pron / recent（最近两位说话人，供轮转）。
     优先级：提示语 → 代词回指 → 两人轮转 → 归旁白。 */
  function attrLine(spans, ctx) {
    var said = [];
    for (var i = 0; i < spans.length; i++) {
      var sp = spans[i];
      if (sp.t !== "say") continue;
      var prev = spans[i - 1], next = spans[i + 1];
      var who = (prev && prev.t === "narr") ? tagName(prev.x, true) : null;
      if (!who && next && next.t === "narr") who = tagName(next.x, false);
      if (who && PRON[who] != null) { ctx.pron = who; who = null; }     /* 「他说道」→ 记为代词 */
      if (!who && prev && prev.t === "narr") {                          /* 旁白点过的名字：先记下，供代词回指 */
        var mn = mentionName(prev.x);
        if (mn) { ctx.mentioned = mn; if (!ctx.gender[mn]) ctx.gender[mn] = genderHint(mn, prev.x) || ""; }
      }
      if (!who && ctx.pron) {
        var g = PRON[ctx.pron] || "";
        var hit = null;
        for (var k = 0; k < ctx.recent.length; k++) {
          var nm = ctx.recent[k];
          if (!g || (ctx.gender[nm] || "") === g) { hit = nm; break; }
        }
        /* recent 里没有 → 用旁白刚点过的名字（「张三走了进来。他说道：…」正是这一型） */
        if (!hit && ctx.mentioned && (!g || (ctx.gender[ctx.mentioned] || "") === g)) hit = ctx.mentioned;
        who = hit || null;
        ctx.pron = null;                                                /* 代词只用一次 */
      }
      if (!who && ctx.recent.length === 2) {                            /* 两人轮转 */
        who = ctx.recent[0] === ctx.lastName ? ctx.recent[1] : ctx.recent[0];
      }
      if (who) { ctx.lastName = who; ctx.recent = recentPush(ctx.recent, who); }
      said.push({ i: i, who: who });
    }
    return said;
  }

  /* ---------------- ⑤ 全书过一遍：角色表 + 每句台词的归属 ----------------
     入参 blocks = [{type, x}]；出参 {chars, lines, spans}。
     lines 与闭包外的消费方（角色表 UI / 播放单元）共用同一份编号 (bi, si)。 */
  function build(blocks, prev) {
    var ctx = { lastName: "", pron: "", recent: [], gender: {} };
    var chars = {}, lines = [], spansOf = {};
    (blocks || []).forEach(function (b, bi) {
      var type = String((b && b.type) || "");
      if (!/^(p|h1|h2|h3|quote|abstract)$/.test(type)) return;
      var text = String((b && b.x) || "");
      if (!text.trim()) return;
      var spans = splitSpans(text);
      spansOf[bi] = spans;
      var said = attrLine(spans, ctx);
      said.forEach(function (it) {
        var sp = spans[it.i];
        var who = it.who;
        lines.push({ bi: bi, si: it.i, text: sp.x, speaker: who || "" });
        if (who) {
          if (!chars[who]) chars[who] = { name: who, count: 0, gender: genderHint(who, text) };
          chars[who].count++;
          if (!ctx.gender[who]) ctx.gender[who] = chars[who].gender || "";
        }
      });
    });
    /* 上一版角色表里的性别/音色/手动指派要带过来（重识别不该把用户的吩咐冲掉） */
    if (prev && prev.chars) {
      Object.keys(chars).forEach(function (n) {
        var old = prev.chars[n];
        if (!old) return;
        if (old.gender) chars[n].gender = old.gender;
        if (old.voiceK) chars[n].voiceK = old.voiceK;
        if (old.locked) chars[n].locked = true;
      });
    }
    var out = { chars: chars, lines: lines };
    out.spans = spansOf;
    if (prev && prev.lines) {           /* 用户改过的归属保留（按 (bi,si) 对齐） */
      var idx = {};
      prev.lines.forEach(function (l) { idx[l.bi + ":" + l.si] = l; });
      out.lines.forEach(function (l) {
        var old = idx[l.bi + ":" + l.si];
        if (old && old.user) { l.speaker = old.speaker; l.user = true; }
      });
    }
    return out;
  }

  /* ---------------- ⑥ L2 模型归属 ----------------
     模型给 [{i, speaker}]（i = lines 的下标），只认**已知角色名或空**：
     别的名字一律丢掉（白名单校验在本地做，不能把模型编的名字写进角色表）。 */
  function applyModel(cast, pairs) {
    if (!cast || !Array.isArray(pairs)) return cast;
    var known = {};
    Object.keys(cast.chars || {}).forEach(function (n) { known[n] = 1; });
    pairs.forEach(function (p) {
      var i = p && Number(p.i);
      var nm = String((p && p.speaker) || "").trim();
      if (!(i >= 0 && i < cast.lines.length)) return;
      if (!nm) return;
      if (!known[nm]) {                 /* 模型点了个新名字：先不建角色，只记下留给用户看 */
        return;
      }
      if (cast.lines[i].user) return;   /* 用户改过的，模型不许覆盖 */
      cast.lines[i].speaker = nm;
      cast.lines[i].by = "model";
    });
    return cast;
  }

  /* ---------------- ⑦ 配音分配：给每个角色一款不同的音色 ----------------
     池子 = 已装音色（去重）。策略：性别已知的先在同性里挑一款没被占的；
     占完了就退回「没被占的任意一款」；再没有就复用（同款但换音高由播放层负责）。
     旁白不用这里的音色（旁白永远是用户当前选的那一款）。 */
  function assignVoices(chars, pool) {
    var list = Object.keys(chars).map(function (k) { return chars[k]; })
      .sort(function (a, b) { return b.count - a.count; });
    var used = {}, order = (pool || []).slice();
    list.forEach(function (c) {
      if (c.voiceK) { used[c.voiceK] = 1; return; }     /* 手动指定或继承来的，先占位 */
    });
    list.forEach(function (c) {
      if (c.voiceK) return;
      var g = c.gender || "";
      var pick = null, i;
      for (i = 0; i < order.length; i++) if (!used[order[i].k] && (!g || order[i].gender === g)) { pick = order[i]; break; }
      if (!pick) for (i = 0; i < order.length; i++) if (!used[order[i].k]) { pick = order[i]; break; }
      if (!pick) pick = order[list.indexOf(c) % Math.max(1, order.length)] || null;
      if (pick) { c.voiceK = pick.k; c.voiceName = pick.name; used[pick.k] = 1; }
    });
    return chars;
  }

  /* ---------------- ⑧ 播放单元：旁白一段 + 每句台词一段 ----------------
     不把相邻的旁白与台词合并 —— 合并会让同一段里两种音色打架。
     每单元带 cast=角色名（旁白为 null）：播放层据此解析音色。 */
  function unitsFor(blocks, cast) {
    var byKey = {};
    ((cast && cast.lines) || []).forEach(function (l) { byKey[l.bi + ":" + l.si] = l; });
    var out = [];
    (blocks || []).forEach(function (b, bi) {
      var type = String((b && b.type) || "");
      if (!/^(p|h1|h2|h3|quote|abstract)$/.test(type)) return;
      var text = String((b && b.x) || "");
      if (!text.trim()) return;
      splitSpans(text).forEach(function (sp, si) {
        var x = String(sp.x || "");
        if (!x.trim()) return;
        var l = byKey[bi + ":" + si];
        out.push({ bi: bi, si: si, say: sp.t === "say", text: x, cast: (l && l.speaker) || "" });
      });
    });
    return out;
  }

  window.InkCast = {
    splitSpans: splitSpans, tagName: tagName, build: build, applyModel: applyModel,
    assignVoices: assignVoices, unitsFor: unitsFor,
    SAY_RE: SAY_RE, PAIRS: PAIRS
  };
})();
