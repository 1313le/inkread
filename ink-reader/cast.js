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

  /* ---------------- 锚序列与链（v1.4-S3 A6-1/A6-2）----------------
     根因 1（cast.js 旧版 219 行）：`alt` 外推出来的名字与「提示语认出来的」被一视同仁
     推进 recent，而 recentPush 只留最近两个不同名字 —— 三人轮换（甲→乙→丙→甲…）
     从第 7 句起必然把丙念成乙，且错一句就跟着错一片。
     现在把状态拆成两本账：
       · anchors —— **只有 tag / pron 进**（确定性推得出的），窗口 ANCHOR_WIN；
       · chain   —— 外推指针（gap = 距锚几句），alt 的名字绝不回填锚。
     ANCHOR_WIN 与 ALT_MAX 都是 6，但语义不同：前者是「几个锚才够认周期」，后者是
     「一段无提示语的对白最多猜几句」。别把两个 6 合成一个常量。 */
  var ANCHOR_WIN = 6;
  /* 模型护栏 1：距锚深度超过 CHAIN_MAX 的外推，哪怕模型给 conf=0.99 也不收。 */
  var CHAIN_MAX = 24;
  /* 句级标记位：tag=提示语明示 / pron=带性别代词回指命中 / alt=外推 / none=判不出。
     模型条目另带 basis（枚举外整条拒收，见 applyModel）。 */
  var AT = ["tag", "pron", "alt", "none"];
  var BASIS = ["tag", "alternation", "pronoun", "mention", "new", "aside"];
  /* A3：规则侧的「把握」按判据分档（提示语 > 代词回指 > 交替外推）。
     模型给 conf 时两边比大小；模型输了也把冲突留在句子上（D3：界面必须显示冲突，不许静默）。
     CONF_LOW 是模型侧落地线：低于它的归属宁可不落 —— 错一句会把整段读成别人。 */
  var RULE_CONF = { tag: 0.95, pron: 0.8, alt: 0.6, none: 0 };
  var CONF_LOW = 0.5;

  function newCtx() {
    return { lastName: "", pron: "", recent: [], gender: {}, mentioned: "", gap: 0,
      anchors: [], runId: 0, chained: false, broken: false };
  }
  function resetScene(ctx) {
    ctx.lastName = ""; ctx.pron = ""; ctx.recent = []; ctx.mentioned = ""; ctx.gap = 0;
    ctx.anchors = []; ctx.chained = false; ctx.broken = false;
  }

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

  /* 名字变体（李小红 / 小红）在归属阶段还没并人，比较时先按同人兜一道 ——
     否则周期检测会把同一个人的两个写法当成两个人，一条链从头到尾都对不上。 */
  function sameName(a, b) {
    if (!a || !b) return false;
    return a === b || samePerson(a, b);
  }

  /* 锚序列里最短的周期 —— 只认 2 与 3（两人乒乓 / 三人轮换）。
     要求 len ≥ 2p 且逐位 round-robin 成立：只看到「A B A」不许认成 A B 循环，
     那可能只是偶然的两次回头；宁可少推一截，也不能把一条假循环顺下去。 */
  function cyclePeriod(seq) {
    for (var p = 2; p <= 3; p++) {
      if (seq.length < p * 2) continue;
      var ok = true;
      for (var i = 0; i + p < seq.length; i++) {
        if (!sameName(seq[i], seq[i + p])) { ok = false; break; }
      }
      if (ok) return p;
    }
    return 0;
  }

  /* 下一句该谁说。优先级：周期（2/3）→ 两人乒乓 → 不外推。
     · 周期：seq[(len + gap) % p]，gap = 距最近锚已经外推了几句；
     · 乒乓：锚窗口里只有两个人且 recent 也确实是这两位 —— 取「不是上一位」的那位；
     · 其余（锚不够、锚里有第三人、一次都没锚住）一律返回 null，交给旁白。
     alt 的名字**不进 anchors**（A6-1 根因 1）：外推只能消耗链，不能喂养链。 */
  function predictAt(ctx) {
    var seq = ctx.anchors || [], i;
    if (!seq.length) return null;
    var uniq = [];
    for (i = 0; i < seq.length; i++) {
      var dup = false;
      for (var u = 0; u < uniq.length; u++) if (sameName(uniq[u], seq[i])) { dup = true; break; }
      if (!dup) uniq.push(seq[i]);
    }
    if (uniq.length < 2) return null;
    var p = cyclePeriod(seq);
    if (p) return seq[(seq.length + ctx.gap) % p];
    if (uniq.length === 2 && ctx.recent.length === 2) {
      return sameName(ctx.lastName, uniq[0]) ? uniq[1] : uniq[0];
    }
    return null;
  }

  /* ---------------- ④ 一行（一段 blocks）里的归属 ----------------
     ctx 跨段传递：lastName / pron / recent（供代词回指）/ gap（距最近锚几句）/
     anchors（只有 tag·pron 进）/ chained（这一段外推过没有）/ broken（链被破口否掉）。
     优先级：提示语 → 代词回指 → **锚序列外推** → 归旁白。
     每句都带标记，便于面板把「推出来的」和「看出来的」分开显示：
       at=tag 提示语明示 / pron 代词回指 / alt 链外推 / none 判不出
       hold=true 破口段不落地 / reach=n 触顶后该 run 还有 n 句没判。 */
  function attrLine(spans, ctx, text) {
    var said = [];
    for (var i = 0; i < spans.length; i++) {
      var sp = spans[i];
      if (sp.t !== "say") continue;
      var gapBefore = ctx.gap;
      var prev = spans[i - 1], next = spans[i + 1];
      var who = (prev && prev.t === "narr") ? tagName(prev.x, true) : null;
      if (!who && next && next.t === "narr") who = tagName(next.x, false);
      var at = "none";
      if (who && PRON[who] != null) {
        /* A2：只有**带性别**的代词（他/她）才值得回指。我/你/咱/它在 PRON 里的值是空串，
           旧写法 `if (!g || …)` 把空串当「匹配通过」，于是「我走了」直接判给上一个说话人 ——
           第一人称叙事的书里，这句式几乎每段都有，错得成片。 */
        if (PRON[who]) ctx.pron = who;
        who = null;
      } else if (who) {
        who = normName(who);
        if (who) at = "tag";
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
        if (who) at = "pron";
        ctx.pron = null;                                                /* 代词只用一次 */
      }

      var runId = ctx.runId;
      if (at === "tag" || at === "pron") {
        /* 破口：外推期回来一个提示语，且它不是链上预期的下一位 —— 说明这条链早就断了，
           这一 run 外推出的名字全部收回（hold），从这一个锚重新起链。 */
        var breakRun = -1, breakExp = null;
        if (at === "tag" && gapBefore > 0 && ctx.chained) {
          var exp = predictAt(ctx);
          if (exp && !sameName(who, exp)) {
            breakRun = runId; breakExp = exp;
            ctx.anchors = [];
            ctx.broken = true;
          }
        }
        if (ctx.gender[who] == null) ctx.gender[who] = genderHint(who, text) || "";
        ctx.anchors.push(who);
        if (ctx.anchors.length > ANCHOR_WIN) ctx.anchors = ctx.anchors.slice(-ANCHOR_WIN);
        if (ctx.broken && cyclePeriod(ctx.anchors) >= 2) ctx.broken = false;
        ctx.lastName = who;
        ctx.recent = recentPush(ctx.recent, who);
        ctx.gap = 0; ctx.chained = false;
        ctx.runId = runId + 1;
        said.push({ i: i, who: who, at: at, depth: 0, run: ctx.runId,
          breakRun: breakRun, breakExp: breakExp });
        continue;
      }

      var pred = ctx.broken ? null : predictAt(ctx);
      var hold = false, reach = false;
      if (pred) {
        if (gapBefore < ALT_MAX) { who = pred; at = "alt"; ctx.chained = true; }
        else reach = true;                        /* 触顶：本地不猜，留给主脑（reach 在 build 里按 run 计数） */
      } else if (ctx.broken) {
        hold = true;                              /* 断链段的外推一律不落地 */
      }
      if (who) {
        if (ctx.gender[who] == null) ctx.gender[who] = genderHint(who, text) || "";
        ctx.lastName = who;
        ctx.recent = recentPush(ctx.recent, who);
      }
      ctx.gap = gapBefore + 1;
      said.push({ i: i, who: who || "", at: at, depth: gapBefore + 1, run: runId,
        hold: hold, reach: reach });
    }
    return said;
  }

  /* ---------------- ⑤ 全书过一遍：角色表 + 每句台词的归属 ----------------
     入参 blocks = [{type, x}]；出参 {chars, lines, spans}。
     lines 与闭包外的消费方（角色表 UI / 播放单元）共用同一份编号 (bi, si)。
     A1：标题块与纯分隔行都算换场，换场即 resetScene —— 「乒乓交替」从此只在当幕有效。 */
  function build(blocks, prev) {
    var ctx = newCtx();
    var chars = {}, lines = [], spansOf = {}, runMap = {}, breaks = [];
    (blocks || []).forEach(function (b, bi) {
      var type = String((b && b.type) || "");
      if (!/^(p|h1|h2|h3|quote|abstract)$/.test(type)) return;
      var text = String((b && b.x) || "");
      if (!text.trim()) return;
      if (/^h[1-3]$/.test(type) || BREAK_RE.test(text.trim())) resetScene(ctx);
      var spans = splitSpans(text);
      spansOf[bi] = spans;
      var said = attrLine(spans, ctx, text);
      said.forEach(function (it) {
        var sp = spans[it.i];
        var li = lines.length;
        lines.push({ bi: bi, si: it.i, text: sp.x, speaker: it.who || "",
          at: it.at, depth: it.depth, run: it.run, via: it.at, by: "rule" });
        if (it.hold) { lines[li].hold = true; lines[li].via = "hold"; }
        if (it.reach) lines[li].reach = true;
        if (!runMap[it.run]) runMap[it.run] = [];
        runMap[it.run].push(li);
        if (it.breakRun >= 0) breaks.push({ run: it.breakRun, line: li, exp: it.breakExp, got: it.who });
      });
    });
    /* 破口收回（A6-2）：该 run 里所有外推句清空归属、标 hold —— 链已经证明断了，
       这一截猜出来的名字一个都不许落地。提示语本身（tag/pron）是看出来的，不收回。 */
    breaks.forEach(function (br) {
      (runMap[br.run] || []).forEach(function (li) {
        if (lines[li].at === "tag" || lines[li].at === "pron") return;
        lines[li].speaker = "";
        lines[li].hold = true;
        lines[li].via = "hold";
      });
    });
    /* 触顶计数（A6-2）：每个 run 从**第一条**未判句数到 run 末尾，记在那一句的 reach 上。
       run 跨块也照数 —— 裸对白常常一段一句，run 天然横跨多个段。 */
    Object.keys(runMap).forEach(function (rid) {
      var arr = runMap[rid], first = -1;
      for (var z = 0; z < arr.length; z++) if (lines[arr[z]].reach) { first = z; break; }
      if (first < 0) return;
      for (var w = first; w < arr.length; w++) { delete lines[arr[w]].reach; lines[arr[w]].via = "cap"; }
      lines[arr[first]].reach = arr.length - first;
    });
    /* 角色表按**落地**的归属统计（破口收回的句子不进 count）。 */
    lines.forEach(function (l) {
      if (!l.speaker) return;
      var who = l.speaker;
      if (!chars[who]) chars[who] = { name: who, count: 0, gender: ctx.gender[who] || "", alt: [] };
      chars[who].count++;
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
      if (!t) { t = merged[c] = { name: c, count: 0, gender: "", alt: [], voiceK: "", locked: false, voiceLock: false }; }
      t.count += chars[n].count;
      if (!t.gender && chars[n].gender) t.gender = chars[n].gender;
      if (chars[n].voiceK && !t.voiceK) {
        t.voiceK = chars[n].voiceK; t.locked = !!chars[n].locked; t.voiceLock = !!chars[n].voiceLock;
      }
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
        if (old.voiceLock) chars[n].voiceLock = true;
        /* A2：上一版的别名、模型新建痕迹与证据也带过来，重识别不等于把人的来路冲掉。 */
        if (Array.isArray(old.alt) && old.alt.length) {
          if (!Array.isArray(chars[n].alt)) chars[n].alt = [];
          old.alt.forEach(function (x) { if (x && x !== n && chars[n].alt.indexOf(x) < 0) chars[n].alt.push(x); });
        }
        if (old.by === "model") chars[n].by = "model";
        if (old.role) chars[n].role = old.role;
        if (old.evidence) chars[n].evidence = old.evidence;
      });
    }
    var out = { chars: chars, lines: lines };
    out.spans = spansOf;
    /* 链的账：面板顶部「裸句率」与「交替链在第 x 句断裂」都读这一份。 */
    var chain = { bare: 0, alt: 0, landed: 0, none: 0, hold: 0, reach: 0, breaks: [] };
    lines.forEach(function (l) {
      if (l.at === "alt" || l.at === "none") chain.bare++;
      if (l.at === "alt") chain.alt++;
      if (l.at === "alt" && !l.hold) chain.landed++;
      if (l.at === "none") chain.none++;
      if (l.hold) chain.hold++;
      if (typeof l.reach === "number") chain.reach += l.reach;
    });
    chain.breaks = breaks.map(function (br) { return { run: br.run, say: br.line + 1, exp: br.exp, got: br.got }; });
    out.chain = chain;
    if (prev && prev.lines) {           /* 用户改过的归属保留（按 (bi,si) 对齐） */
      var idx = {};
      prev.lines.forEach(function (l) { idx[l.bi + ":" + l.si] = l; });
      out.lines.forEach(function (l) {
        var old = idx[l.bi + ":" + l.si];
        if (old && (old.user || old.derivedFrom >= 0)) {
          l.speaker = old.speaker; l.user = !!old.user;
          if (old.derivedFrom >= 0) l.derivedFrom = old.derivedFrom;
          delete l.hold;
          l.via = old.user ? "user" : "derived";
        }
      });
    }
    return out;
  }

  /* ---------------- ⑤c 块间衔接：从已判结果复原交替链（A6-3） ----------------
     分块问模型时，第二块起不能只给字面 —— 模型要知道「上面这条链走到哪、周期几位、
     本块首句离锚多远」。只认 tag/pron 进锚（与 ANCHOR_WIN 同源），跨标题/换场即断：
     换场之后旧链不成立，拿它当证据比不给更糟。 */
  function crossesScene(blocks, a, b) {
    for (var z = a; z <= b; z++) {
      var x = blocks[z];
      if (!x || /^h[1-3]$/.test(String(x.type || ""))) return true;
      if (BREAK_RE.test(String(x.x || "").trim())) return true;
    }
    return false;
  }
  function chainState(lines, upto, blocks) {
    var list = lines || [], seq = [], at = -1;
    var stop = Math.min(Math.max(0, Number(upto) || 0), list.length);
    var guardBi = -1;
    for (var i = stop - 1; i >= 0; i--) {
      var l = list[i];
      if (blocks && guardBi >= 0 && crossesScene(blocks, l.bi, guardBi)) break;
      guardBi = l.bi;
      if (l.at === "tag" || l.at === "pron") {
        if (!l.speaker) continue;
        seq.unshift(l.speaker);
        if (at < 0) at = i;
        if (seq.length >= ANCHOR_WIN) break;
      }
    }
    var first = stop < list.length ? list[stop] : null;
    return { seq: seq, p: cyclePeriod(seq), depth: first ? (Number(first.depth) || 0) : 0, last: at };
  }

  /* ---------------- ⑤d 成段改派与两锚重算（A6-4） ----------------
     面板把「连续同一说话人」压成链块（run）。两条边界：
       · 跨章节标题 / 分隔行即断 —— 一次点击不该把上一章的名字抄到下一章；
       · 同一锚派生出来的一整段交替链算**一块**（哪怕逐句换人）—— 人链改派同样要一次点完。
     改派走 reassignRange（整块 → 一个人 / 旁白），重算走 recomputeChain（两锚 → 交替），
     两条路都只动归属，不碰音色，也都不发网络请求。 */
  function sceneMarks(blocks, lines) {
    var out = [], scene = 0, bi = -1;
    (lines || []).forEach(function (l) {
      if (l.bi !== bi) {
        if (bi < 0 && blocks && blocks[l.bi]) {
          var b0 = blocks[l.bi];
          if (/^h[1-3]$/.test(String(b0.type || "")) || BREAK_RE.test(String(b0.x || "").trim())) scene++;
        } else if (bi >= 0 && blocks) {
          for (var z = bi + 1; z <= l.bi; z++) {
            var b = blocks[z];
            if (!b) continue;
            if (/^h[1-3]$/.test(String(b.type || "")) || BREAK_RE.test(String(b.x || "").trim())) scene++;
          }
        }
        bi = l.bi;
      }
      out.push(scene);
    });
    return out;
  }
  function runKey(l) {
    if (typeof l.derivedFrom === "number" && l.derivedFrom >= 0) return "d:" + l.derivedFrom;
    return "s:" + (l.speaker || "");
  }
  function runsOf(cast, blocks) {
    var lines = (cast && cast.lines) || [];
    var scenes = sceneMarks(blocks, lines);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var k = runKey(lines[i]), last = out[out.length - 1];
      if (last && last.key === k && scenes[i] === last.scene) last.to = i + 1;
      else out.push({ from: i, to: i + 1, key: k, who: lines[i].speaker || "", scene: scenes[i],
        derived: typeof lines[i].derivedFrom === "number" });
    }
    out.forEach(function (r) {
      r.n = r.to - r.from;
      if (r.derived) {
        r.names = [];
        for (var i = r.from; i < r.to && r.names.length < 3; i++) {
          var nm = lines[i].speaker || "";
          if (nm && r.names.indexOf(nm) < 0) r.names.push(nm);
        }
        r.alt = r.names.length >= 2;
      }
    });
    return out;
  }
  function recount(cast) {
    if (!cast || !cast.chars) return cast;
    var chars = cast.chars, lines = cast.lines || [];
    Object.keys(chars).forEach(function (n) { chars[n].count = 0; });
    lines.forEach(function (l) {
      if (!l.speaker) return;
      if (!chars[l.speaker]) chars[l.speaker] = { name: l.speaker, count: 0, gender: "", alt: [] };
      chars[l.speaker].count++;
    });
    return cast;
  }
  function createChar(cast, name) {
    if (!cast) return "";
    var nm = String(name || "").trim().replace(/\s+/g, " ").slice(0, 12);
    if (nm.length < 2 || PRON[nm] != null) return "";
    var chars = cast.chars || (cast.chars = {});
    if (chars[nm]) return nm;
    var keys = Object.keys(chars);
    for (var i = 0; i < keys.length; i++) if (samePerson(nm, keys[i])) return keys[i];
    chars[nm] = { name: nm, count: 0, gender: genderHint(nm, "") || "", alt: [], voiceK: "", locked: false };
    return nm;
  }
  function reassignRange(cast, from, to, who, opts) {
    var lines = (cast && cast.lines) || [];
    var a = Math.max(0, Math.min(lines.length, Number(from) || 0));
    var b = Math.max(a, Math.min(lines.length, Number(to) || 0));
    var aside = !!(opts && opts.aside);
    var nm = String(who || "");
    var n = 0;
    for (var i = a; i < b; i++) {
      var l = lines[i];
      l.speaker = nm; l.user = true; l.by = "user"; l.via = "user"; l.conf = 1;
      delete l.hold; delete l.uncertain; delete l.suggest; delete l.clash; delete l.why;
      delete l.reach; delete l.ruleWho; delete l.derivedFrom;
      if (aside) l.aside = true; else delete l.aside;
      n++;
    }
    if (n) recount(cast);
    return n;
  }
  /* 从 from 这一句起按 a ⇄ b 交替，直到下一个 tag/pron 锚或换场为止。
     起点是**人给的锚**（user），下游是派生句（by:"user" + derivedFrom=起点）——
     模型只认 derivedFrom 这条护栏，by 是给面板看的。两锚相同 / 空名一律不推。 */
  function recomputeChain(cast, blocks, from, a, b) {
    var lines = (cast && cast.lines) || [];
    var start = Number(from);
    if (!(start >= 0 && start < lines.length)) return { count: 0, from: start, to: start };
    var A = String(a || ""), B = String(b || "");
    if (!A || !B || sameName(A, B)) return { count: 0, from: start, to: start };
    var scenes = sceneMarks(blocks, lines), scene0 = scenes[start];
    var seq = [A, B], n = 0, end = start;
    for (var i = start; i < lines.length; i++) {
      if (i > start) {
        if (scenes[i] !== scene0) break;
        var cur = lines[i];
        if (cur.user && !(typeof cur.derivedFrom === "number")) break;
        if (cur.at === "tag" || cur.at === "pron") break;
      }
      var l = lines[i];
      var who = seq[n % 2];
      delete l.hold; delete l.uncertain; delete l.suggest; delete l.clash; delete l.why;
      delete l.reach; delete l.ruleWho; delete l.aside;
      l.speaker = who; l.by = "user"; l.conf = 1;
      if (i === start) {
        l.user = true; l.via = "user"; delete l.derivedFrom;
      } else {
        l.user = false; l.via = "derived"; l.derivedFrom = start;
      }
      n++;
      end = i + 1;
    }
    if (n) recount(cast);
    return { count: n, from: start, to: end };
  }

  /* ---------------- ⑤b 旧账惰性归一（v1.4-S3 #287）----------------
     ver 2 给角色表多写句级标记（at/via/depth/run/hold/reach）与分配账（chain）。
     旧账不批量改写：读的时候补形状，缺标记的行标 via="legacy"（面板据此提示
     「旧版识别、没有链账」），等下一次用户动作落盘时才顺带写成新形状。
     只补字段，**不动 speaker** —— 这是读旧账，不是替用户改归属。 */
  function normalizeCast(book) {
    if (!book || typeof book !== "object" || Array.isArray(book)) return null;
    var out = book;
    out.on = !!out.on;
    if (!out.chars || typeof out.chars !== "object" || Array.isArray(out.chars)) out.chars = {};
    if (!Array.isArray(out.lines)) out.lines = [];
    Object.keys(out.chars).forEach(function (k) {
      var c = out.chars[k];
      if (!c || typeof c !== "object" || Array.isArray(c)) {
        out.chars[k] = { name: k, count: 0, gender: "", alt: [] };
        return;
      }
      if (!c.name) c.name = k;
      c.count = Number(c.count) || 0;
      c.gender = String(c.gender || "");
      if (!Array.isArray(c.alt)) c.alt = [];
      c.alt = c.alt.filter(function (x) { return typeof x === "string" && x; });
      c.voiceK = String(c.voiceK || "");
      c.locked = !!c.locked;
      c.voiceLock = !!c.voiceLock;      /* A4：人亲手挑过的音色，任何重排都不碰 */
      /* A2：模型新建的角色带 by/role/evidence（面板据此单列一档、点开看凭什么）。 */
      if (c.by != null) c.by = String(c.by);
      if (c.role != null) c.role = String(c.role).slice(0, 20);
      if (!Array.isArray(c.evidence)) delete c.evidence;
      else c.evidence = c.evidence.filter(function (e) {
        return e && typeof e === "object" && typeof e.i === "number" && typeof e.text === "string";
      }).slice(0, 3);
    });
    /* 并人建议只是待办，形状不对就丢；不在这里替用户并人。 */
    if (!Array.isArray(out.merges)) out.merges = [];
    out.merges = out.merges.filter(function (m) {
      return m && typeof m === "object" && !Array.isArray(m) &&
        typeof m.a === "string" && typeof m.b === "string" && m.a && m.b && m.a !== m.b;
    });
    /* 坏条目直接丢掉：unitsFor / 面板都假定每条是对象，留着 null 会在下游炸整页。 */
    out.lines = out.lines.filter(function (l) { return l && typeof l === "object" && !Array.isArray(l); });
    out.lines.forEach(function (l) {
      if (typeof l.text !== "string") l.text = String(l.text || "");
      if (typeof l.speaker !== "string") l.speaker = "";
      if (AT.indexOf(l.at) < 0) { l.at = "none"; l.depth = 0; l.run = -1; }
      if (!l.via) l.via = l.user ? "user" : (l.hold ? "hold" : "legacy");
      if (!l.by) l.by = l.user ? "user" : "rule";
    });
    return out;
  }

  /* ---------------- ⑥ L2 模型归属 ----------------
     输入每条 = {i, speaker, conf?, quote?, basis?, why?}（i = lines 的下标）。
     A3 证据化：
       · conf 落账、quote 存原文（面板点开看凭什么）；
       · conf < CONF_LOW 不落地 —— speaker 清空、标 uncertain，候选留给面板两颗快捷钮；
       · 规则与模型不一致时两边比 conf（规则侧按 at 分档），输的一方不落地但冲突必须留在句子上。
     A6-3 合同（opts.strict）：basis 缺失或不在 BASIS 枚举内、conf 缺失 → 整条拒收。
     旧调用（v226 H 组等）不传 opts，保持宽松口径，既有契约一条不改。
     白名单仍在本地：模型编的新名字（A2 之前没有 new 通道）一律丢，并计入 rejected。 */
  /* 名字认人：精确名 → 别名表 → 同人后缀。表外一律 null —— 白名单永远在本地。
     模型爱写全称（「李小红」）或别名（「赵叔」），角色表里可能是并人后的规范名；
     直接丢掉就白问一次模型，但也不能让模型编的名字混进来。 */
  function findChar(cast, nm) {
    var chars = (cast && cast.chars) || {}, raw = String(nm == null ? "" : nm).trim();
    if (!raw) return null;
    if (chars[raw]) return raw;
    var keys = Object.keys(chars);
    for (var i = 0; i < keys.length; i++) {
      var alts = chars[keys[i]] && chars[keys[i]].alt;
      if (Array.isArray(alts) && alts.indexOf(raw) >= 0) return keys[i];
    }
    for (var z = 0; z < keys.length; z++) if (samePerson(raw, keys[z])) return keys[z];
    return null;
  }
  function applyModel(cast, pairs, opts) {
    var stats = { got: Array.isArray(pairs) ? pairs.length : 0, kept: 0, low: 0,
      rejected: 0, protected: 0, conflicts: 0, aside: 0, over: 0 };
    if (!cast || !Array.isArray(pairs)) return cast;
    var strict = !!(opts && opts.strict);
    pairs.forEach(function (p) {
      if (!p || typeof p !== "object") { stats.rejected++; return; }
      var i = Number(p.i);
      if (!(i >= 0 && i < cast.lines.length)) { stats.rejected++; return; }
      var l = cast.lines[i];
      /* 人给的锚（手改 / 派生）永远压过模型（红线一，D1/D4）。 */
      if (l.user || (typeof l.derivedFrom === "number" && l.derivedFrom >= 0)) { stats.protected++; return; }
      var basis = String(p.basis || "");
      if (basis && BASIS.indexOf(basis) < 0) { stats.rejected++; return; }
      if (strict && BASIS.indexOf(basis) < 0) { stats.rejected++; return; }
      /* 护栏 1（A6-3）：距锚深度超过 CHAIN_MAX 的外推不收 —— 哪怕模型给 conf=0.99。
         规则层已经说过「这么长的链本地不猜」，模型看不到累积误差，不能替它猜下去。 */
      if (strict && basis === "alternation" && Number(l.depth) > CHAIN_MAX) {
        stats.over++; stats.rejected++; return;
      }
      var hasConf = p.conf != null && isFinite(Number(p.conf));
      if (strict && !hasConf) { stats.rejected++; return; }
      /* 宽松调用（旧形状 / v226 契约）：模型结果是权威，与规则冲突时一律采纳 ——
         这是 v2.25 的既有行为，H2 钉着它；A3 的置信度比较只在 strict（主脑分配流程）里生效。 */
      var conf = hasConf ? Math.max(0, Math.min(1, Number(p.conf))) : 0.5;
      var effConf = strict ? conf : 1;
      var quote = String(p.quote == null ? "" : p.quote).slice(0, 200);
      var raw = String(p.speaker == null ? "" : p.speaker).trim();
      var hit = raw ? findChar(cast, raw) : null;
      if (raw && !hit) { stats.rejected++; return; }   /* 表外名字（A2 之前没有新建通道） */
      /* 「规则说的人」必须与「模型上轮改过的人」分开存：第二次再问模型时，
         l.speaker 可能已经是模型自己写的，拿它当规则基线会把自己的旧答案当证据。
         ruleWho 只在模型第一次覆盖规则时落一次，之后一直代表本地规则的原判。 */
      var rule = (l.by === "model" && l.ruleWho != null) ? String(l.ruleWho || "") : (l.speaker || "");
      var rc = RULE_CONF[l.at] || 0;
      /* 上一轮的犹豫 / 冲突 / 非对白标记随这一轮新判决作废，避免旧账挂在新结论上。 */
      delete l.uncertain; delete l.suggest; delete l.clash; delete l.aside;
      l.conf = conf;
      if (quote) l.quote = quote; else delete l.quote;
      if (basis) l.basis = basis; else delete l.basis;
      if (p.why) l.why = String(p.why).slice(0, 120); else delete l.why;
      function keepRule() {
        l.speaker = rule; l.by = "rule"; l.via = "rule";
        delete l.hold; delete l.uncertain; delete l.suggest;
      }
      if (rule && hit && !sameName(hit, rule)) {
        stats.conflicts++;
        l.clash = { rule: rule, model: hit, conf: conf, ruleConf: rc };
        if (effConf > rc) {
          if (l.ruleWho == null) l.ruleWho = rule;
          l.speaker = hit; l.by = "model"; l.via = "model";
          delete l.hold; delete l.uncertain; delete l.suggest;
        } else keepRule();
        return;
      }
      if (basis === "aside") {
        /* 引号里的独白 / 转述 / 书信：落地为旁白并标出来，让读者知道为什么这句没角色音。 */
        if (rule && effConf <= rc) { keepRule(); return; }
        if (!rule && effConf < CONF_LOW) {
          /* 拿不准的「非对白」也不许把一句台词悄悄吞成旁白：留给人和下一轮模型。 */
          l.uncertain = true; l.by = "model"; l.via = "model";
          stats.low++;
          return;
        }
        if (l.ruleWho == null && rule) l.ruleWho = rule;
        l.speaker = ""; l.by = "model"; l.via = "model"; l.aside = true;
        delete l.hold; delete l.uncertain; delete l.suggest;
        stats.kept++; stats.aside++;
        return;
      }
      if (rule && hit && sameName(hit, rule)) {
        /* 模型与规则同判：不因模型 conf 低去动规则已经看出来的归属。 */
        if (l.speaker !== rule) l.speaker = rule;
        l.by = "rule"; l.via = "rule";
        delete l.uncertain; delete l.suggest; delete l.hold;
        stats.kept++;
        return;
      }
      if (hit && effConf < CONF_LOW) {
        if (l.ruleWho == null && rule) l.ruleWho = rule;
        l.speaker = ""; l.uncertain = true; l.suggest = hit;
        l.by = "model"; l.via = "model";
        stats.low++;
        return;
      }
      if (!hit) {
        /* 模型说「判不出」只是弃权，不是反证：规则已经看出来的归属（提示语 / 代词）
           不因模型弃权被抹掉 —— 否则一句「拿不准」就能把「张三道：…」降回旁白。
           只有模型明确给了人（上面几条分支）或明确说不是对白（aside）才算主张。 */
        if (rule) { keepRule(); return; }
        l.speaker = ""; l.by = "model"; l.via = "model";
        delete l.uncertain; delete l.suggest;
        return;
      }
      if (l.ruleWho == null && rule) l.ruleWho = rule;
      l.speaker = hit; l.by = "model"; l.via = "model";
      delete l.uncertain; delete l.suggest; delete l.aside; delete l.hold; delete l.clash;
      stats.kept++;
    });
    cast.lastModel = stats;
    return cast;
  }

  /* ---------------- ⑥b 主脑提案落地（A2） ----------------
     入参 prop = {chars:[{name, alias:[…], gender, role, evidence:[全局句号…]}],
                  lines:[{i, speaker, basis, conf, quote, why}],
                  merge:[{a, b, conf, why}]}。
     三段各有各的口径：
       · chars —— **新建通道**。名字先归一（过短 / 代词 / 虚词一律不收）；能按
         「精确名 → alias 表 → 同人后缀」认出是表里已有的，就只补别名与缺的性别，不另起一行；
         真新的记 by:"model" 并带原文证据（evidence 是**全书从 1 起**的句号，必须落在本块内）。
         strict 下没有证据的新名字不收：模型编的人不许凭一句话进角色表。
       · lines —— 交给 applyModel（人定/派生保护、basis/conf 合同、链深上限都在那边）。
       · merge —— 只写进 cast.merges 作**建议**，不动角色表、不改归属；用户点「并」才走 mergeChars。
     返回本轮总账（并写进 cast.lastModel），面板与 toast 读它。 */
  function applyProposal(cast, prop, opts) {
    var stats = { got: 0, kept: 0, low: 0, rejected: 0, protected: 0, conflicts: 0, aside: 0, over: 0,
      newChars: 0, aliased: 0, newRejected: 0, merges: 0, mergeRejected: 0 };
    if (!cast || !prop || typeof prop !== "object") return stats;
    var strict = !!(opts && opts.strict);
    var total = (cast.lines || []).length;
    var from = opts && opts.from != null ? Math.max(0, Math.min(total, Number(opts.from) || 0)) : 0;
    var to = opts && opts.to != null ? Math.max(from, Math.min(total, Number(opts.to) || 0)) : total;
    function evid(list) {
      var out = [];
      (Array.isArray(list) ? list : []).forEach(function (e) {
        var i = Math.round(Number(e)) - 1;      /* 提示词给模型的是全书从 1 起的句号 */
        if (!(i >= from && i < to) || !cast.lines[i]) return;
        for (var z = 0; z < out.length; z++) if (out[z].i === i) return;
        out.push({ i: i, text: String(cast.lines[i].text || "").slice(0, 24) });
      });
      return out.slice(0, 3);
    }
    (Array.isArray(prop.chars) ? prop.chars : []).forEach(function (cd) {
      if (!cd || typeof cd !== "object") { stats.newRejected++; return; }
      var nm = String(cd.name || "").trim().replace(/\s+/g, " ").slice(0, 12);
      if (nm.length < 2 || PRON[nm] != null || NOT_NAME.test(nm)) { stats.newRejected++; return; }
      var ev = evid(cd.evidence);
      if (strict && !ev.length) { stats.newRejected++; return; }
      var aliases = (Array.isArray(cd.alias) ? cd.alias : []).map(function (a) {
        return String(a || "").trim().replace(/\s+/g, " ").slice(0, 12);
      }).filter(function (a) { return a.length >= 2 && a !== nm && PRON[a] == null; });
      var gender = cd.gender === "m" || cd.gender === "f" ? cd.gender : "";
      var hit = findChar(cast, nm);
      if (hit) {
        var ex = cast.chars[hit];
        aliases.forEach(function (a) {
          if (a === hit) return;
          if (!Array.isArray(ex.alt)) ex.alt = [];
          if (ex.alt.indexOf(a) < 0) ex.alt.push(a);
        });
        if (!ex.gender && gender) ex.gender = gender;
        if (!ex.role && cd.role) ex.role = String(cd.role).slice(0, 20);
        stats.aliased++;
        return;
      }
      cast.chars[nm] = { name: nm, count: 0, gender: gender || genderHint(nm, "") || "", alt: aliases,
        voiceK: "", locked: false, by: "model", role: String(cd.role || "").slice(0, 20), evidence: ev };
      stats.newChars++;
    });
    applyModel(cast, Array.isArray(prop.lines) ? prop.lines : [], { strict: strict });
    var ms = cast.lastModel || {};
    ["got", "kept", "low", "rejected", "protected", "conflicts", "aside", "over"].forEach(function (k) {
      stats[k] = Number(ms[k] || 0);
    });
    /* 并人建议：两边都得在表里（刚新建的也算）、不是同一个人；strict 下 conf 低于落地线的不收。
       只收不并 —— 模型不许替用户改人。 */
    (Array.isArray(prop.merge) ? prop.merge : []).forEach(function (m) {
      if (!m || typeof m !== "object") { stats.mergeRejected++; return; }
      var a = findChar(cast, m.a), b = findChar(cast, m.b);
      var conf = Number(m.conf);
      if (!isFinite(conf)) conf = 0.5;
      if (!a || !b || a === b || samePerson(a, b)) { stats.mergeRejected++; return; }
      if (strict && conf < CONF_LOW) { stats.mergeRejected++; return; }
      cast.merges = Array.isArray(cast.merges) ? cast.merges : [];
      var dup = cast.merges.some(function (x) {
        return x && ((x.a === a && x.b === b) || (x.a === b && x.b === a));
      });
      if (dup) return;
      if (cast.merges.length >= 12) { stats.mergeRejected++; return; }
      cast.merges.push({ a: a, b: b, conf: Math.max(0, Math.min(1, conf)),
        why: String(m.why || "").slice(0, 60), at: Date.now() });
      stats.merges++;
    });
    recount(cast);      /* 面板上的 ×N 与音色分档都读这份计数，模型改完就得对账 */
    cast.lastModel = stats;
    return stats;
  }
  /* 并人（只由用户点「并」触发）：保留 b，把 a 的句子、别名、音色与性别缺项并过去。
     返回改归的句数；-1 = 并不了（人不在表里 / 同一人）。0 句也能并 ——
     模型新建但还没分到句子的角色允许被并走。 */
  function mergeChars(cast, a, b) {
    var A = String(a || ""), B = String(b || "");
    if (!cast || !cast.chars || !A || !B || A === B) return -1;
    var ca = cast.chars[A], cb = cast.chars[B];
    if (!ca || !cb || samePerson(A, B)) return -1;
    var n = 0;
    (cast.lines || []).forEach(function (l) {
      if (l.speaker === A) { l.speaker = B; n++; }
      if (l.ruleWho === A) l.ruleWho = B;
      if (l.suggest === A) l.suggest = B;
      if (l.clash) {
        if (l.clash.rule === A) l.clash.rule = B;
        if (l.clash.model === A) l.clash.model = B;
      }
    });
    if (!cb.gender && ca.gender) cb.gender = ca.gender;
    if (!cb.voiceK && ca.voiceK) { cb.voiceK = ca.voiceK; cb.locked = !!ca.locked; }
    if (!cb.role && ca.role) cb.role = ca.role;
    if (!cb.evidence && ca.evidence) cb.evidence = ca.evidence;
    if (!Array.isArray(cb.alt)) cb.alt = [];
    [A].concat(Array.isArray(ca.alt) ? ca.alt : []).forEach(function (x) {
      if (x && x !== B && cb.alt.indexOf(x) < 0) cb.alt.push(x);
    });
    delete cast.chars[A];
    if (Array.isArray(cast.merges)) {
      cast.merges = cast.merges.filter(function (m) { return m && m.a !== A && m.b !== A; });
    }
    recount(cast);
    return n;
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
      if (c.voiceK && (c.locked || c.voiceLock || byK[c.voiceK])) { used[c.voiceK] = (used[c.voiceK] || 0) + 1; continue; }
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

  /* ---------------- ⑦b A4 音色方案（模型只提建议，本地硬校验） ----------------
     模型给的是 {char, voice, why}，这里只认三件：
       · char 必须是角色表里的人（别名按 findChar 归一）；
       · voice 必须是本机音色池里的键（池外 id / 显示名一律丢，模型不许凭空造声线）；
       · voiceLock 的角色不参与重排（行照留，标 locked，采用时跳过）。
     返回的是**预览行**（含本地算出的共用次数与音高偏移），不写任何字段。
     采用走 applyVoicePlan：写 voiceK、重算音高，再交给 assignVoices 统一收口。 */
  function planVoices(cast, plan, pool, narrK) {
    var out = { rows: [], rejected: 0, locked: 0 };
    if (!cast || !cast.chars) return out;
    var byK = {};
    (pool || []).forEach(function (v) { if (v && v.k) byK[v.k] = v; });
    var seen = {};
    (Array.isArray(plan) ? plan : []).forEach(function (p) {
      if (!p || typeof p !== "object") { out.rejected++; return; }
      var name = findChar(cast, p.char);
      var k = String(p.voice == null ? "" : p.voice);
      if (!name || !cast.chars[name] || !byK[k] || seen[name]) { out.rejected++; return; }
      seen[name] = 1;
      var c = cast.chars[name];
      if (c.voiceLock) {
        out.locked++;
        out.rows.push({ char: name, voice: c.voiceK || "", name: c.voiceName || (byK[c.voiceK] && byK[c.voiceK].name) || "原音色",
          why: "已锁定 · 不参与重排", locked: true, pitch: Number(c.pitch) || 0, reuse: false });
        return;
      }
      out.rows.push({ char: name, voice: k, name: byK[k].name, why: String(p.why || "").slice(0, 40),
        locked: false, pitch: 0, reuse: false });
    });
    /* 预览音高：照 assignVoices 的同一套规则算（可用池、已占用、Object.keys 顺序），
       面板上看到「共用 +30Hz」，采用后播放层拿到的就是同一个数。 */
    var avail = (pool || []).slice();
    if (narrK) {
      var keep = avail.filter(function (v) { return v.k !== narrK; });
      if (keep.length >= 2) avail = keep;
    }
    var availK = {};
    avail.forEach(function (v) { availK[v.k] = 1; });
    var sim = {};
    Object.keys(cast.chars).forEach(function (n) {
      var cc = cast.chars[n], k = cc.voiceK || "";
      if (k && !(cc.locked || cc.voiceLock || availK[k])) k = "";
      sim[n] = k;
    });
    out.rows.forEach(function (r) { if (!r.locked) sim[r.char] = r.voice; });
    var byVoice = {}, pitch = {};
    Object.keys(cast.chars).forEach(function (n) {
      var k = sim[n];
      if (!k) { pitch[n] = 0; return; }
      var idx = byVoice[k] || 0;
      pitch[n] = idx === 0 ? 0 : PITCH_STEPS[idx % PITCH_STEPS.length];
      byVoice[k] = idx + 1;
    });
    out.rows.forEach(function (r) {
      r.pitch = pitch[r.char] || 0;
      r.reuse = (byVoice[r.voice] || 0) > 1;
    });
    return out;
  }
  /* 采用方案：只改 voiceK / voiceName（不把模型挑的声线升成 voiceLock —— 那是人的意图），
     随后 assignVoices 统一重算音高。locked 行与已锁角色一律跳过并计入 skipped。 */
  function applyVoicePlan(cast, rows, pool, narrK) {
    var res = { applied: 0, skipped: 0, pitched: 0 };
    if (!cast || !cast.chars) return res;
    var byK = {};
    (pool || []).forEach(function (v) { if (v && v.k) byK[v.k] = v; });
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r || r.locked) return;
      var c = cast.chars[r.char];
      if (!c || c.voiceLock || !byK[r.voice]) { res.skipped++; return; }
      c.voiceK = r.voice;
      c.voiceName = byK[r.voice].name;
      c.locked = false;
      res.applied++;
    });
    assignVoices(cast.chars, pool, narrK);
    Object.keys(cast.chars).forEach(function (k) { if (cast.chars[k].pitch) res.pitched++; });
    return res;
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
    splitSpans: splitSpans, tagName: tagName, build: build, applyModel: applyModel, normalizeCast: normalizeCast,
    applyProposal: applyProposal, mergeChars: mergeChars, findChar: findChar,
    assignVoices: assignVoices, planVoices: planVoices, applyVoicePlan: applyVoicePlan,
    unitsFor: unitsFor, sentences: sentences,
    normName: normName, samePerson: samePerson, hashName: hashName,
    cyclePeriod: cyclePeriod, predictAt: predictAt, chainState: chainState,
    runsOf: runsOf, recount: recount, createChar: createChar,
    reassignRange: reassignRange, recomputeChain: recomputeChain,
    ALT_MAX: ALT_MAX, ANCHOR_WIN: ANCHOR_WIN, CHAIN_MAX: CHAIN_MAX,
    AT: AT, BASIS: BASIS, RULE_CONF: RULE_CONF, CONF_LOW: CONF_LOW, SAY_RE: SAY_RE, PAIRS: PAIRS
  };
})();
