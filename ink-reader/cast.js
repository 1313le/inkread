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

  /* ---------------- 交替的边界（v1.1-S5a A1）----------------
     「两人乒乓」只在**同一场景内**有效，且只撑 ALT_MAX 句无提示语的对白。
     旧版没有这条边界：recent 攒够两个人之后，全书每一句无归属引语都被强行分给这两人 ——
     这是「认不准」的头号根因（长篇里绝大多数无标签引语其实是第三方或旁白式内心独白）。
     超限一律归旁白：宁可少配一个角色音，也不要把不相干的人念成张三。 */
  var ALT_MAX = 6;
  /* 换场信号：标题块，以及「———」「＊＊＊」这类纯分隔行。 */
  var BREAK_RE = /^[\s—–―\-*＊＊＿_·・＃#*=～~]{1,24}$/;

  function newCtx() { return { lastName: "", pron: "", recent: [], gender: {}, mentioned: "", gap: 0 }; }
  function resetScene(ctx) { ctx.lastName = ""; ctx.pron = ""; ctx.recent = []; ctx.mentioned = ""; ctx.gap = 0; }

  /* ---------------- ① 切台词 ----------------
     返回 [{t:"narr"|"say", x:文本, q:引号, at:内容在原文里的字符起点}]。
     at 是给播放层直给 cs 用的（v1.1-S5a A5：旧版靠 indexOf 回填坐标，重复句会错位）。
     未闭合的引号当普通字符（小说里破损的引号不该吞掉后半段）。 */
  function splitSpans(text) {
    var s = String(text || ""), out = [], buf = "", bufAt = -1, i = 0;
    while (i < s.length) {
      var ch = s.charAt(i), close = null, p;
      for (p = 0; p < PAIRS.length; p++) if (ch === PAIRS[p][0]) { close = PAIRS[p][1]; break; }
      if (!close) { if (bufAt < 0) bufAt = i; buf += ch; i++; continue; }
      var j = s.indexOf(close, i + 1);
      if (j < 0) { if (bufAt < 0) bufAt = i; buf += ch; i++; continue; }
      if (buf) { out.push({ t: "narr", x: buf, at: bufAt }); buf = ""; bufAt = -1; }
      out.push({ t: "say", x: s.slice(i + 1, j), q: ch, at: i + 1 });
      i = j + 1; bufAt = i;
    }
    if (buf) out.push({ t: "narr", x: buf, at: bufAt });
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
    var m, hits = [], ends = [];
    while ((m = SAY_RE.exec(seg))) {
      hits.push(m.index); ends.push(m.index + m[0].length);
      if (hits.length > 6) break;
    }
    /* 合并「同一句提示语被拆成两击」：SAY 里既收「低声说」这类复合动词，也收「道」这类单字，
       于是「他低声说道」会打出 14（低声说）与 17（道）两击。旧写法只并「起点 +1」的相邻，
       三字动词之后那一记「道」就漏了网 —— 动词位落到 17，名字窗口取到「他低声说」，
       角色表里凭空多出一行（v1.1-S5a 成对截图目视抓到的）。
       改成按**上一动词的结尾**判同一击，动词位取整段的开头。 */
    var merged = [], mend = [];
    for (var q = 0; q < hits.length; q++) {
      if (merged.length && hits[q] <= mend[mend.length - 1]) continue;
      merged.push(hits[q]); mend.push(ends[q]);
    }
    hits = merged;
    if (!hits.length) return null;
    var at = tail ? hits[hits.length - 1] : hits[0];
    var before = seg.slice(Math.max(0, at - 6), at).replace(TAIL_RE, "");
    /* 先试 2–4 字的名字；再试单字代词（「他说道」也带信息：性别指向 + 回指信号）。
       match 的结果没有捕获组，取 [0] —— 这行踩过：写成 [1] 会永远拿到 undefined。 */
    var nm = before.match(/[\u4e00-\u9fff]{2,4}$/);
    if (nm) {
      var name = nm[0];
      /* 剥尾巴后仍不足 2 字（「小/大」单字）就当没认出来；NOT_NAME 与「心里/忽然」这类
         纯副词接着兜一道 —— 宁缺勿错，凭空多一个角色比少一个更刺耳。 */
      if (NOT_NAME.test(name)) return null;
      if (/^(心里|心中|暗自|默默|连忙|急忙|于是|接着|然后|只是|不过|忽然|突然)$/.test(name)) return null;
      return name;
    }
    var pr = before.match(/[他她我你您咱]$/);
    return pr ? pr[0] : null;
  }

  /* 动词前的「神态/动作/状语尾巴」：小说里提示语极少只有一个动词，总拖着「摇头」「抬起头」「低声」
     这类尾巴。它们必须在**取名字窗口之前**剥掉 —— 旧版先取「动词前 2–4 字」再剥，
     于是「李四摇头道」取到的是「李四摇头」（同一个人两个键两款声，A3），
     「他抬起头说」取到「他抬起」（凭空多出一个不存在的角色，比认错人更糟）。
     只收公认的神态/动作/副词，不收「说/道」这类动词本体 —— 免得把「小道」这种名字削没。 */
  var TAIL_RE = new RegExp("(?:" + [
    "低着头", "抬起头", "抬起", "低头", "摇头", "点头", "回头", "转身", "皱眉", "眯眼", "瞪眼",
    "撇嘴", "抿嘴", "摆手", "挥手", "拍手", "跺脚", "拍桌", "抱臂", "叉腰", "摊手", "耸肩",
    "冷笑", "冷哼", "苦笑", "干笑", "嘿嘿", "呵呵", "哈哈", "叹息", "叹气", "沉吟", "喃喃",
    "嘟囔", "嘀咕", "笑着", "笑道", "低声", "轻声", "小声", "大声", "高声", "扬声", "沉声",
    "厉声", "柔声", "急声", "一面", "一边", "连忙", "急忙", "赶紧", "马上", "立刻", "轻轻",
    "缓缓", "慢慢", "冷冷", "淡淡", "也", "都", "就", "便", "才", "又", "还", "再", "忙"
  ].join("|") + ")+$");
  /* ---------------- ②b 名字归一与变体合并（v1.1-S5a A3）----------------
     同一个人常被写成两个样子：「李小红说道」与「小红说」，还有「他的母亲」「那个母亲」。
     每个写法在角色表里成一个键、分一款音色，听起来就是**同一个人换声**（读者投诉的第一名）。
     只收两种最稳的合并：
       · 剥掉限定语前缀（他的/那个/年轻的…）与复数尾「们」；
       · 一个名字是另一个的**后缀**、且多出来的部分 ≤2 字（典型是姓：李小红 / 小红）。
     「老张」vs「小张」、「王二」vs「王三」都不并 —— 并错人比并漏更糟。
     合并结果记进 alt，面板看得见、可拆回。 */
  var NAME_PREFIX = /^(他的|她的|它的|他们的|她们的|那个|这个|那位|这位|那两个|这两个|那|这|一个|年轻的|年老的|漂亮的|善良的)/;
  function normName(raw) {
    var n = String(raw || "").trim();
    if (!n) return null;
    if (PRON[n] != null) return n;                  /* 代词原样交回上层判，别在这儿吞了 */
    n = n.replace(NAME_PREFIX, "").replace(/们$/, "");
    if (n.length < 2 || NOT_NAME.test(n)) return null;
    return n;
  }
  function samePerson(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var long = a.length > b.length ? a : b, short = a.length > b.length ? b : a;
    if (short.length < 2 || long.length - short.length > 2) return false;
    return long.slice(long.length - short.length) === short;
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
     ctx 跨段传递：lastName / pron / recent（最近两位说话人，供轮转）/ gap（距上次明示归属几句）。
     优先级：提示语 → 代词回指 → **有界**两人轮转 → 归旁白。 */
  function attrLine(spans, ctx) {
    var said = [];
    for (var i = 0; i < spans.length; i++) {
      var sp = spans[i];
      if (sp.t !== "say") continue;
      var prev = spans[i - 1], next = spans[i + 1];
      var who = (prev && prev.t === "narr") ? tagName(prev.x, true) : null;
      if (!who && next && next.t === "narr") who = tagName(next.x, false);
      var explicit = false;
      if (who && PRON[who] != null) {
        /* A2：只有**带性别**的代词（他/她）才值得回指。我/你/咱/它在 PRON 里的值是空串，
           旧写法 `if (!g || …)` 把空串当「匹配通过」，于是「我走了」直接判给上一个说话人 ——
           第一人称叙事的书里，这句式几乎每段都有，错得成片。
           现在性别不明的代词既不回指也不记 pron，让它落到有界交替或直接归旁白。 */
        if (PRON[who]) ctx.pron = who;
        who = null;
      } else if (who) {
        who = normName(who);
        if (who) explicit = true;
      }
      if (!who && prev && prev.t === "narr") {                          /* 旁白点过的名字：先记下，供代词回指 */
        var mn = normName(mentionName(prev.x));
        if (mn) { ctx.mentioned = mn; if (!ctx.gender[mn]) ctx.gender[mn] = genderHint(mn, prev.x) || ""; }
      }
      if (!who && ctx.pron) {
        var g = PRON[ctx.pron] || "";
        var hit = null;
        for (var k = 0; k < ctx.recent.length; k++) {
          var nm = ctx.recent[k];
          if (g && (ctx.gender[nm] || "") === g) { hit = nm; break; }   /* 性别必须实打实对上 */
        }
        /* recent 里没有 → 用旁白刚点过的名字（「张三走了进来。他说道：…」正是这一型） */
        if (!hit && ctx.mentioned && g && (ctx.gender[ctx.mentioned] || "") === g) hit = ctx.mentioned;
        who = hit || null;
        if (who) explicit = true;
        ctx.pron = null;                                                /* 代词只用一次 */
      }
      if (!who && ctx.recent.length === 2 && ctx.gap < ALT_MAX) {        /* A1 有界两人轮转 */
        who = ctx.recent[0] === ctx.lastName ? ctx.recent[1] : ctx.recent[0];
      }
      if (who) { ctx.lastName = who; ctx.recent = recentPush(ctx.recent, who); }
      ctx.gap = explicit ? 0 : ctx.gap + 1;
      said.push({ i: i, who: who });
    }
    return said;
  }

  /* ---------------- ⑤ 全书过一遍：角色表 + 每句台词的归属 ----------------
     入参 blocks = [{type, x}]；出参 {chars, lines, spans}。
     lines 与闭包外的消费方（角色表 UI / 播放单元）共用同一份编号 (bi, si)。
     A1：标题块与纯分隔行都算换场，换场即 resetScene —— 「乒乓交替」从此只在当幕有效。 */
  function build(blocks, prev) {
    var ctx = newCtx();
    var chars = {}, lines = [], spansOf = {};
    (blocks || []).forEach(function (b, bi) {
      var type = String((b && b.type) || "");
      if (!/^(p|h1|h2|h3|quote|abstract)$/.test(type)) return;
      var text = String((b && b.x) || "");
      if (!text.trim()) return;
      if (/^h[1-3]$/.test(type) || BREAK_RE.test(text.trim())) resetScene(ctx);
      var spans = splitSpans(text);
      spansOf[bi] = spans;
      var said = attrLine(spans, ctx);
      said.forEach(function (it) {
        var sp = spans[it.i];
        var who = it.who;
        lines.push({ bi: bi, si: it.i, text: sp.x, speaker: who || "" });
        if (who) {
          if (!chars[who]) chars[who] = { name: who, count: 0, gender: genderHint(who, text), alt: [] };
          chars[who].count++;
          if (!ctx.gender[who]) ctx.gender[who] = chars[who].gender || "";
        }
      });
    });
    /* A3 变体合并：把「小红 / 李小红」这类同人的两个写法并成一个键，规范名取**更长**的那个
       （更具体），短名记进 alt。先并再谈继承，否则上一版按「李小红」存的音色指派会落在被
       合并掉的键上，用户的吩咐就丢了。 */
    var names = Object.keys(chars).sort(function (a, b) { return b.length - a.length || (a < b ? -1 : 1); });
    var canon = {};
    names.forEach(function (n) { canon[n] = n; });
    for (var x = 0; x < names.length; x++) {
      for (var y = x + 1; y < names.length; y++) {
        var a = names[x], bb = names[y];
        if (!samePerson(a, bb)) continue;
        var keep = a.length >= bb.length ? a : bb;
        var drop = keep === a ? bb : a;
        names.forEach(function (n) { if (canon[n] === drop) canon[n] = keep; });
      }
    }
    var merged = {};
    names.forEach(function (n) {
      var c = canon[n], t = merged[c];
      if (!t) { t = merged[c] = { name: c, count: 0, gender: "", alt: [], voiceK: "", locked: false }; }
      t.count += chars[n].count;
      if (!t.gender && chars[n].gender) t.gender = chars[n].gender;
      if (chars[n].voiceK && !t.voiceK) { t.voiceK = chars[n].voiceK; t.locked = !!chars[n].locked; }
      if (n !== c && t.alt.indexOf(n) < 0) t.alt.push(n);
    });
    Object.keys(merged).forEach(function (c) {
      if (!merged[c].voiceK) delete merged[c].voiceK; else merged[c].locked = !!merged[c].locked;
      if (!merged[c].alt.length) delete merged[c].alt;
    });
    chars = merged;
    lines.forEach(function (l) {
      if (l.speaker && canon[l.speaker] && canon[l.speaker] !== l.speaker) { l.variant = l.speaker; l.speaker = canon[l.speaker]; }
    });
    /* 上一版角色表里的性别/音色/手动指派要带过来（重识别不该把用户的吩咐冲掉）。
       键可能对不上（并人之后规范名变了），所以拿 alt 再兜一次。 */
    if (prev && prev.chars) {
      var prevKeys = Object.keys(prev.chars);
      Object.keys(chars).forEach(function (n) {
        var old = prev.chars[n];
        if (!old) {
          var probe = [n].concat(chars[n].alt || []);
          for (var z = 0; z < probe.length && !old; z++) {
            for (var k = 0; k < prevKeys.length; k++) {
              if (samePerson(probe[z], prevKeys[k])) { old = prev.chars[prevKeys[k]]; break; }
            }
          }
        }
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
    var known = Object.keys(cast.chars || {});
    var set = {}; known.forEach(function (n) { set[n] = 1; });
    /* 模型爱写全称（「李小红」），角色表里可能是并人后的规范名或对不上大小写。
       直接丢掉就白问一次模型 —— 先按同人后缀关系兜一道，兜不到才丢（白名单仍在本地，
       模型编的新名字一律不进角色表）。 */
    function resolve(nm) {
      if (set[nm]) return nm;
      for (var z = 0; z < known.length; z++) if (samePerson(nm, known[z])) return known[z];
      return null;
    }
    pairs.forEach(function (p) {
      var i = p && Number(p.i);
      var nm = String((p && p.speaker) || "").trim();
      if (!(i >= 0 && i < cast.lines.length)) return;
      if (!nm) return;
      var hit = resolve(nm);
      if (!hit) return;                   /* 点了个真不认识的：不建角色，只留给用户看 */
      if (cast.lines[i].user) return;     /* 用户改过的，模型不许覆盖 */
      cast.lines[i].speaker = hit;
      cast.lines[i].by = "model";
    });
    return cast;
  }

  /* ---------------- ⑦ 配音分配：给每个角色一款尽量不撞的音色 ----------------
     A4 的两处病：
       · 旧写法「按计数排序后依次抢池子里第一个空位」，池子内容一变（换旁白音会重算
         castPool，那款声线就从池子里消失了）→ 全员重新分配，听起来像整本书换了配音组；
       · cast.js 注释早就承诺「同款但换音高由播放层负责」，而播放层发的是固定 pitch
         （api.js 只认音色自带的 ep）—— 承诺没兑现。
     现在：已指派且仍可用的声线**一律不动**（只有被旁白抢走或已下架的那一两个才重排）；
     起点按角色名散列（与池子顺序无关，稳定）；同性别优先；池子不够用时才复用一款，
     复用者按次序拿到递进音高偏移（c.pitch，Hz），由播放层真的并进 &pitch=。
     旁白不参与这里的音色分配（旁白永远是用户当前选的那一款）。 */
  function hashName(n) {
    var h = 2166136261, s = String(n || "");
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  var PITCH_STEPS = [0, 30, -30, 60, -60, 90, -90];
  function assignVoices(chars, pool, narrK) {
    var order = (pool || []).slice();
    var avail = narrK ? order.filter(function (v) { return v.k !== narrK; }) : order;
    if (avail.length < 2) avail = order;          /* 池子小到只剩一款：宁可用，不可空 */
    var byK = {};
    avail.forEach(function (v) { byK[v.k] = v; });
    var list = Object.keys(chars).map(function (k) { return chars[k]; });
    var used = {}, i, c;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (c.voiceK && (c.locked || byK[c.voiceK])) { used[c.voiceK] = (used[c.voiceK] || 0) + 1; continue; }
      if (c.voiceK) c.voiceK = "";                /* 自动挑的款已不可用 → 只重排这一个 */
    }
    /* 重排的先后仍按戏份多少定序（多给主角留同性别的选择权），但结果不随池子顺序改变而漂移 */
    var need = list.filter(function (x) { return !x.voiceK; })
      .sort(function (a, b) { return (b.count || 0) - (a.count || 0) || (a.name < b.name ? -1 : 1); });
    need.forEach(function (cc) {
      var g = cc.gender || "";
      var start = order.length ? hashName(cc.name) % order.length : 0;
      var pick = null, z, v;
      for (z = 0; pick == null && z < avail.length; z++) { v = avail[(start + z) % avail.length]; if (v.gender === g && !used[v.k]) pick = v; }
      if (!pick && !g) for (z = 0; pick == null && z < avail.length; z++) { v = avail[(start + z) % avail.length]; if (!used[v.k]) pick = v; }
      if (!pick && g) for (z = 0; pick == null && z < avail.length; z++) { v = avail[(start + z) % avail.length]; if (v.gender === g) pick = v; }
      if (!pick) pick = avail[start % Math.max(1, avail.length)] || avail[0] || null;
      if (!pick) return;
      cc.voiceK = pick.k; cc.voiceName = pick.name;
      used[pick.k] = (used[pick.k] || 0) + 1;      /* 占位：后面的角色先找空位，找不到才共用（I1） */
    });
    /* 音高偏移最后统一按「共用同一款声线的第几个」递进 —— 手动指派、重识别继承来的指派
       也算进同一款。只在分配当场给偏移会漏一种情况：用户在面板里把某角色指到别人正在用的
       那一款，两个人听起来完全是同一个人。 */
    var byVoice = {};
    list.forEach(function (cc) {
      if (!cc.voiceK) { cc.pitch = 0; return; }
      var n = byVoice[cc.voiceK] || 0;
      cc.pitch = n === 0 ? 0 : PITCH_STEPS[n % PITCH_STEPS.length];
      byVoice[cc.voiceK] = n + 1;
    });
    return chars;
  }

  /* ---------------- ⑧ 播放单元：旁白一段 + 每句台词一段 ----------------
     不把相邻的旁白与台词合并 —— 合并会让同一段里两种音色打架。
     每单元带 cast=角色名（旁白为空）：播放层据此解析音色。
     A5：归属表是按**原文 b.x** 扫出来的，播放与高亮用的却是渲染文本 blockRT（普通朗读即如此）。
     旧版在两套坐标之间用 indexOf 猜位（重复句会错位、找不到就退 0），且块级单元丢掉了
     v1.1-S3 D1 的句级切分。现在 unitsFor 接受 opts.textOf 走**同一把尺**：
     cs = span.at + 句在 span 内的起点，直给，不再猜；span 也细到句，和普通朗读对齐。
     文本对不上时（md 改写引号等）宁可归旁白，也不猜一个角色音。 */
  function unitsFor(blocks, cast, opts) {
    opts = opts || {};
    var textOf = opts.textOf || function (b) { return String((b && b.x) || ""); };
    var byKey = {}, byBlock = {};
    ((cast && cast.lines) || []).forEach(function (l) {
      byKey[l.bi + ":" + l.si] = l;
      if (!byBlock[l.bi]) byBlock[l.bi] = [];
      byBlock[l.bi].push(l);
    });
    function match(bi, si, x) {
      var l = byKey[bi + ":" + si];
      if (l && l.text === x) return l;
      var arr = byBlock[bi] || [];
      for (var z = 0; z < arr.length; z++) if (arr[z].text === x) return arr[z];
      return null;
    }
    var out = [];
    (blocks || []).forEach(function (b, bi) {
      var type = String((b && b.type) || "");
      if (!/^(p|h1|h2|h3|quote|abstract)$/.test(type)) return;
      var text = String(textOf(b, bi) || "");
      if (!text.trim()) return;
      splitSpans(text).forEach(function (sp, si) {
        var x = String(sp.x || "");
        if (!x.trim()) return;
        var l = match(bi, si, x);
        var who = (l && l.speaker) || "";
        sentences(x, opts.cap, opts.floor).forEach(function (sn) {
          out.push({ bi: bi, si: si, cs: sp.at + sn.cs, say: sp.t === "say", text: sn.text, cast: who });
        });
      });
    });
    return out;
  }

  /* ---------------- ⑦ 切句（v1.1-S3 D1）：朗读单元的句级切分 ----------------
     按 CLTL 句末标点（。！？…‥⋯．!?;）断句，句末紧跟的闭引号/闭括号随前句、
     句尾空白随前句 —— 拼回必须逐字等于原文。短句贪心合并到 floor 以上：
     一句一单元会让对话体每两三秒一停（每单元至少一次取声），floor 是听感与
     句粒度的折中；cap 是硬上限，只有单句本身超 cap 才按字硬切（保底不丢字）。
     返回 [{text, cs}]：cs 是该句在原文里的字符起点。 */
  function sentences(text, cap, floor) {
    var s = String(text == null ? "" : text);
    cap = Math.max(1, cap || 250);
    floor = Math.max(1, floor || 80);
    var END = "。！？…‥⋯．!?;", CLOSE = "\"'”’」』）)]】》";
    var segs = [], n = s.length, i = 0, a = 0;
    while (i < n) {
      if (END.indexOf(s.charAt(i)) >= 0) {
        var j = i + 1;
        while (j < n && (END.indexOf(s.charAt(j)) >= 0 || CLOSE.indexOf(s.charAt(j)) >= 0)) j++;
        while (j < n && /\s/.test(s.charAt(j))) j++;
        segs.push([a, j]); a = i = j;
      } else i++;
    }
    if (a < n) segs.push([a, n]);
    var out = [], bs = -1, be = -1;
    function flush() { if (be > bs) out.push({ text: s.slice(bs, be), cs: bs }); bs = be = -1; }
    for (var k = 0; k < segs.length; k++) {
      var x = segs[k][0], y = segs[k][1], len = y - x;
      if (len > cap) {
        flush();
        for (var p = x; p < y; p += cap) out.push({ text: s.slice(p, Math.min(y, p + cap)), cs: p });
        continue;
      }
      if (bs < 0) { bs = x; be = y; continue; }
      if (be - bs + len > cap) { flush(); bs = x; be = y; }
      else if (be - bs >= floor) { flush(); bs = x; be = y; }
      else be = y;
    }
    flush();
    return out;
  }

  window.InkCast = {
    splitSpans: splitSpans, tagName: tagName, build: build, applyModel: applyModel,
    assignVoices: assignVoices, unitsFor: unitsFor, sentences: sentences,
    normName: normName, samePerson: samePerson, hashName: hashName,
    ALT_MAX: ALT_MAX, SAY_RE: SAY_RE, PAIRS: PAIRS
  };
})();
