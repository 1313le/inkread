/* ============================================================
   layout.js · 墨读 InkRead 智能排版引擎（v1.1-S5d，M3）
   ------------------------------------------------------------
   定案 §六 的取舍：排版改的是 **blocks 结构**而不是 CSS —— 标题层级是真的
   标题级，目录才「便于生成」（S5b 的目录派生只认 h1/h2/h3）。
   三步：detect（判文体）→ plan（出可撤销 diff）→ apply（确认才落库）。
   本文件只放**纯函数**与预览面板；落库、重渲染、改账都归调用方（reader-app.js），
   理由与 srs.js 同一套：调度/改写逻辑要能脱离页面单测，页面只管接线。

   硬约束（写在这里是因为它看不见）：
     · diff 里存的 from 是**原对象**，撤销靠它逐条倒放回原位 —— 不靠重算，
       所以「撤销后字节级还原」是构造保证，不是近似；
     · 改写过的块把原文塞进 x0，原字段一个不删（§六「原文字段不删」）；
     · 判据宁可漏不许错：拿不准的一律不动，正文被动过一次就够用户骂人了。
   ============================================================ */
(function () {
  "use strict";

  /* ---- 一、标题层级正则（定案给的三档：第X章 / 1. / 一、） ----
     T1 章级、T2 节级、T3 小节级。结构名（摘要/参考文献…）单独一档：
     它们在论文里就是顶级节，跟「第X章」同级。

     两条形状规矩是这一档最容易犯错的地方，写清楚：
       · 「第三章 机械结构与传动」这种**编号 + 题名**才是书里最常见的标题写法，
         只认「第三章」这种孤零零一行等于认不出整本书的章；
       · 但「第三章讲了传动结构」是一句正文，不是标题。两者的差别只在**分隔符**：
         标题在编号后面留了空白或顿点，句子不留。所以带「第X」的字样必须
         后面接分隔符或到此为止；纯数字编号（1. / 一、 /（一））自己就带标点，不必再要求。 */
  var CHNUM = "[0-9〇一二三四五六七八九十百千两]+";
  var SEELK = "(?=\\s|$|[、.．·:：—–\\-])";
  var T1W = new RegExp("^(?:第\\s*" + CHNUM + "\\s*[章篇卷部回讲])" + SEELK);
  var T2W = new RegExp("^(?:第\\s*" + CHNUM + "\\s*[节课单元])" + SEELK);
  var T1N = new RegExp("^(?:上编|下编|上册|下册|摘\\s*要|abstract|摘\\s*录|参考文献|引用文献|推荐阅读|书目"
    + "|致\\s*谢|附\\s*录|前\\s*言|序\\s*言|引\\s*言|后\\s*记|导\\s*语|作者简介|缩略语表|contents|table\\s+of\\s+contents)" + SEELK, "i");
  /* 「1.2」这种小数编号后面同样要跟分隔符：「1.2倍于原来的强度」是句子；
     「1.」/「1、」后面跟什么由那颗标点说话 —— 但点号后面紧跟数字时它是数值的小数点
     （「1.2倍」），不是编号，所以那颗 `(?![0-9])` 不能省。 */
  var T2N = new RegExp("^(?:[0-9]+\\.[0-9]+(?:\\.[0-9]+)*)" + SEELK + "|^[0-9]+\\s*[、.．](?![0-9])");
  var T3N = new RegExp("^(?:[一二三四五六七八九十百千]+、|[(（][0-9一二三四五六七八九十]+[)）]|[0-9]+[)）])");

  var TERM = /[。！？；!?;…]$/;                 /* 句末标点：标题不该有 */
  var INNER_TERM = /[。！？；!?;…]/;            /* 句中也不该有：「第三章。本节先说」这种是段落 */
  var COMMA = /[，,、：:；]$/;                  /* 行末悬着的逗号/冒号：多半是被切开的正文 */
  var START_BAD = /^[·•●○▪—_*#>》」』”’"（(【[\-]/; /* 段首是项目符号或引号：不是标题、也不该并到上一段 */
  /* 合段另有一道闸，比 START_BAD 宽窄都不同：下一起手是**开引号**（「『“‘）时绝不当续行吃掉。
     小说里「第二节 房东的问题」下一行就是「「你来了。」她说……」—— 对白开新段，
     标题后面不可能跟一句引号开头的话。这一条只管合段：正文重拼照旧允许并到对白前，
     那是正常的行文，不是标题。 */
  var QUOTE_OPEN = /^[「『“‘]/;

  var MAX_H = 40;      /* 标题长度上限：超过就不是标题，是正好以编号开头的句子 */
  var MAX_KEEP = 30;   /* 伪标题续行的长度上限 */
  /* 下一行以结构名开头时不许当续行吃掉：「一、研究背景」/「摘要：……」是两节，
     合成一节就把摘要从目录里抹掉了。 */
  var LEAD_STRUCT = /^(摘\s*要|abstract|参考文献|引用文献|致\s*谢|附\s*录|前\s*言|序\s*言|引\s*言|后\s*记|导\s*语|目\s*录|作者简介|缩略语表)/i;

  function isTerm(s) { return TERM.test(String(s || "").trim()); }
  function txt(b) { return String((b && b.x) || "").trim(); }

  /* 编号 → 该当第几级标题（0 = 不像标题） */
  function tierOf(s) {
    var x = String(s || "").trim();
    if (!x || x.length > MAX_H || isTerm(x)) return 0;
    if (INNER_TERM.test(x)) return 0;                       /* 标题里不会夹整句标点 */
    if (/[：:]\s*\S{12,}$/.test(x)) return 0;               /* 「摘要：本文提出……」是正文不是标题 */
    if (T1W.test(x) || T1N.test(x)) return 1;
    if (T2W.test(x) || T2N.test(x)) return 2;
    if (T3N.test(x)) return 3;
    return 0;
  }

  /* ---- 二、拼接：中日韩之间不补空格，其余补一个 ---- */
  var CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\u3040-\u30ff\uac00-\ud7af]/;
  /* 伪标题合段专用的「要留一格」收尾：第X章 与 点号/括号编号后面题名惯于空一格，
     「第三章机械结构与传动」比留格的读着别扭；顿号（一、二、）后面反而不留。
     只用在合段，不用在正文重拼 —— 正文那侧「…完成，」+「从而…」拼上是不该有缝的。 */
  var FUSE_SP = /[章篇卷部回节课单元.．)）]$/;
  function joinF(a, b) { return FUSE_SP.test(a) ? a + " " + b : join2(a, b); }
  function join2(a, b) {
    a = String(a || ""); b = String(b || "");
    if (!a) return b; if (!b) return a;
    var lastCjk = CJK.test(a.charAt(a.length - 1)), firstCjk = CJK.test(b.charAt(0));
    return (lastCjk && firstCjk) ? a + b : a + " " + b;
  }

  /* ---- 三、诗歌/清单护栏：整本书多半是短行时，正文重拼整条规则不开 ----
     「零误伤正文」里最容易被误伤的就是诗和目录残行：它们本来就一行一句。 */
  function shortDoc(blocks) {
    var p = 0, s = 0;
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].type !== "p") continue;
      p++; if (txt(blocks[i]).length < 15) s++;
    }
    return p >= 12 && s / p > 0.35;
  }

  /* ---- 四、id 分配：新建标题要有渲染期 id，且不能跟书里已有的撞 ---- */
  function newId(used, seed) {
    var n = seed;
    while (used["h-" + n] || used["l-" + n]) n++;
    used["l-" + n] = 1;
    return "l-" + n;
  }

  /* ============================================================
     plan：blocks → 可撤销 diff + 统计
     ------------------------------------------------------------
     diff 项 `{bi, from, to}` 按定案 §六；from/to 用数组承载，一条 diff
     吃掉连续几块、吐出几块，都能用同一套回放下标（apply/undo 各一遍 splice）。
     ============================================================ */
  function plan(blocks, o) {
    o = o || {};
    var B = Array.isArray(blocks) ? blocks : [];
    var used = {}, i;
    for (i = 0; i < B.length; i++) if (B[i] && B[i].id) used[B[i].id] = 1;

    var off = o.off || {};               /* 规则包开关：面板上那三颗勾 */
    var diffs = [], nType = 0, nFuse = 0, nJoin = 0;
    var skipJoin = shortDoc(B) || o.kind === "comic" || !!off.join;
    var taken = {};                 /* 已被上一条 diff 吃掉的块，不再参与本轮匹配 */

    for (i = 0; i < B.length; i++) {
      var b = B[i];
      if (!b || taken[i] || (b.type !== "p" && !/^h[123]$/.test(String(b.type)))) continue;
      var x = txt(b);
      var tier = tierOf(x);

      /* (1) 伪标题合段：编号行被硬回车切开（「第三章」/「机械结构」）。
             必须在「层级归一」之前判 —— 归一会把「第三章」单独做成一个标题，
             剩下那半行就永远是正文了。 */
      if (!off.fuse && b.type === "p" && tier > 0 && x.length <= 20 && !COMMA.test(x) && i + 1 < B.length) {
        var nb = B[i + 1];
        if (nb && nb.type === "p" && !taken[i + 1]) {
          var y = txt(nb);
          if (y && y.length <= MAX_KEEP && !isTerm(y) && !tierOf(y) && !START_BAD.test(y)
            && !QUOTE_OPEN.test(y) && !LEAD_STRUCT.test(y) && x.length + y.length <= MAX_H) {
            var hid = newId(used, i + 1);
            diffs.push({ bi: i, from: [b, nb],
              to: { type: "h" + tier, x: joinF(x, y), id: hid, x0: [txt(b), txt(nb)].join("\n"), lay: "fuse" } });
            taken[i] = taken[i + 1] = 1; i++; nFuse++; continue;
          }
        }
      }

      /* (2) 正文段重拼：上一段没说完（不以句末标点收尾）且够长，下一段不是标题、
             不以项目符号开头 —— 典型是 PDF/TXT 按视觉行切出来的碎段。 */
      if (b.type === "p" && !skipJoin && x.length >= 25 && !isTerm(x) && i + 1 < B.length) {
        var pb = B[i + 1];
        if (pb && pb.type === "p" && !taken[i + 1]) {
          var py = txt(pb);
          if (py.length >= 8 && !tierOf(py) && !START_BAD.test(py) && !LEAD_STRUCT.test(py)) {
            diffs.push({ bi: i, from: [b, pb],
              to: { type: "p", x: join2(x, py), x0: [txt(b), txt(pb)].join("\n"), lay: "join" } });
            taken[i] = taken[i + 1] = 1; i++; nJoin++; continue;
          }
        }
      }

      /* (3) 标题层级归一：p→hN，或既有 hN 的编号说明它该在另一级。
             已经同级的不动（幂等：再排一次不会把 x0 越叠越长）。 */
      if (tier > 0 && !off.type) {
        var want = "h" + tier;
        if (b.type === want) continue;
        var to = {};
        for (var k in b) if (b.hasOwnProperty(k) && k !== "x0" && k !== "lay") to[k] = b[k];
        to.type = want;
        to.x = x;
        if (!to.id) to.id = newId(used, i + 1);
        to.x0 = txt(b); to.lay = "type";
        diffs.push({ bi: i, from: [b], to: to });
        taken[i] = 1; nType++;
      }
    }

    var count = { type: nType, fuse: nFuse, join: nJoin, total: diffs.length };
    return { diffs: diffs, count: count, skipJoin: skipJoin };
  }

  /* ---- apply / undo：diff 列表按 bi 升序、互不重叠（plan 与 mergeAI 都保证） ----
     apply 从后往前放：改高位不动低位，bi 就是当前数组里的下标。
     undo 不能照抄这个下标 —— 数组已是排版后的，前面每条「吃掉几块吐一块」的净增减
     都会把后面那条挪位。所以先按升序算出「这条 diff 的成品落在排版后数组的第几格」，
     再照着那个格从后往前还原。少了这层换算，多条 diff 时撤销会删错块、长度也对不上
     （只有一条 diff 时恰好重合，所以单条测不出来）。
     契约：undo 收的必须是 apply 吐出的那个数组（预览态在内存里成对持有）。 */
  function toArr(t) { return Array.isArray(t) ? t : [t]; }
  function splice(list, at, del, rep) {
    var arr = list.slice();
    Array.prototype.splice.apply(arr, [at, del].concat(rep));
    return arr;
  }
  function sorted(diffs) {
    return (diffs || []).slice().sort(function (a, b) { return a.bi - b.bi; });
  }
  function apply(blocks, diffs) {
    var out = Array.isArray(blocks) ? blocks.slice() : [];
    var ds = sorted(diffs);
    for (var i = ds.length - 1; i >= 0; i--) out = splice(out, ds[i].bi, ds[i].from.length, toArr(ds[i].to));
    return out;
  }
  function undo(blocks, diffs) {
    var out = Array.isArray(blocks) ? blocks.slice() : [];
    var ds = sorted(diffs), pos = [], shift = 0, i;
    for (i = 0; i < ds.length; i++) {
      pos.push(ds[i].bi + shift);
      shift += toArr(ds[i].to).length - ds[i].from.length;
    }
    for (i = ds.length - 1; i >= 0; i--) out = splice(out, pos[i], toArr(ds[i].to).length, ds[i].from);
    return out;
  }

  /* ---- detect：先问本地规则（API.classifyHeuristic 已在），拿不准才交给模型 ----
     返回 {kind, conf, why, by}。by=rule|learned|ai。低置信度是给调用方的信号，
     不是给用户的道歉：规则说「没证据」时 conf 就该低，模型说了也不算数（要本地回认）。 */
  function detect(blocks, meta) {
    var B = Array.isArray(blocks) ? blocks : [], m = meta || {};
    var head = "", n = 0;
    for (var i = 0; i < B.length && n < 8; i++) {
      var t = B[i] && B[i].type;
      if (t === "p" || /^h[123]$/.test(String(t))) { head += txt(B[i]) + "\n"; n++; }
    }
    var r = (window.API && API.classifyHeuristic)
      ? API.classifyHeuristic(m.fileName || "", head, m.fmt || "")
      : { kind: "book", reason: "取不到分类器，按书籍处理", by: "rule" };
    var conf = r.by === "learned" ? 0.8 : (r.by === "ai" ? 0.7 : 0.45);
    /* 结构信号能抬置信度：论文几乎必然同时有「摘要」与「参考文献」两个标题 */
    var all = B.map(txt).join("\n");
    var paperish = /摘\s*要/.test(all) && /参考文献|references/i.test(all);
    if (paperish) { if (r.kind !== "paper") conf = Math.min(conf, 0.4); else conf = Math.max(conf, 0.75); }
    return { kind: r.kind, conf: Math.round(conf * 100) / 100, why: r.reason || "", by: r.by || "rule", paperish: paperish };
  }

  /* ---- AI 那一腿的本地回认（判据来自 S5c：模型说的编号必须对得上本地存在的块） ----
     回认不过 → ok:false，调用方整单不落地。绝不在这里「挑能用的用」：
     半张处方比不开药更危险，排版改错一处要用户逐块找回来。 */
  function vetAI(blocks, edits) {
    var B = Array.isArray(blocks) ? blocks : [];
    if (!Array.isArray(edits)) return { ok: false, why: "回话里没有 edits 数组" };
    var seen = {}, out = [];
    for (var i = 0; i < edits.length; i++) {
      var e = edits[i] || {}, bi = e.bi, ty = String(e.type || "");
      if (typeof bi !== "number" || bi < 0 || bi >= B.length || !B[bi]) return { ok: false, why: "edits 里有不存在的块号 " + bi };
      if (B[bi].type !== "p" && !/^h[123]$/.test(String(B[bi].type))) return { ok: false, why: "块 " + bi + " 不是段落，改不了层级" };
      if (ty !== "p" && ty !== "h1" && ty !== "h2" && ty !== "h3") return { ok: false, why: "块 " + bi + " 的类型「" + ty + "」不在四档之内" };
      if (seen[bi]) return { ok: false, why: "同一个块被改了两次（块 " + bi + "）" };
      seen[bi] = 1;
      out.push({ bi: bi, type: ty });
    }
    return { ok: true, edits: out };
  }

  /* 把回认过的 AI 层级并进本地 plan 的产物。
     同一条命中的块被 AI 点名：以 AI 的档位为准（它看语义，本地正则只看形状），
     AI 说「这是正文」就整条作废本地那条 —— 形状像标题而语义是正文，正是本地规则
     最容易犯、也只有模型能纠的那一类。合并/重拼吃掉的块不再让 AI 插手：一条 diff
     只能有一个归属，两处都改同一块，撤销时就说不清该还给谁。 */
  function mergeAI(blocks, p, aiEdits) {
    var B = Array.isArray(blocks) ? blocks : [];
    var used = {}, i, k;
    for (i = 0; i < B.length; i++) if (B[i] && B[i].id) used[B[i].id] = 1;
    var byBi = {};
    for (i = 0; i < aiEdits.length; i++) byBi[aiEdits[i].bi] = aiEdits[i];

    var diffs = [], done = {};       /* done[bi] = 这个块已经有归属（本地或 AI） */
    for (i = 0; i < p.diffs.length; i++) {
      var d = p.diffs[i], ai = byBi[d.bi];
      for (k = d.bi; k < d.bi + d.from.length; k++) done[k] = 1;
      if (!ai || d.from.length !== 1 || !d.to) { diffs.push(d); continue; }
      done["ai" + d.bi] = 1;
      if (ai.type === "p") continue;                                  /* AI 判它是正文：本地那条不落地 */
      if (d.to.type === ai.type) { diffs.push(d); continue; }         /* 两边档位一致：本地这条原样保留 */
      var nd = { bi: d.bi, from: d.from, to: {} };
      for (k in d.to) if (d.to.hasOwnProperty(k)) nd.to[k] = d.to[k];
      nd.to.type = ai.type;
      if (!nd.to.id) nd.to.id = newId(used, d.bi + 1);
      nd.to.lay = "ai";
      diffs.push(nd);
    }
    /* AI 点名了、本地压根没动的块：只有「改成不同一级」才值得补一条 */
    for (i = 0; i < aiEdits.length; i++) {
      var a = aiEdits[i];
      if (done[a.bi] || done["ai" + a.bi] || !B[a.bi]) continue;
      done[a.bi] = 1; done["ai" + a.bi] = 1;
      if (B[a.bi].type === a.type) continue;
      var to = {};
      for (k in B[a.bi]) if (B[a.bi].hasOwnProperty(k) && k !== "x0" && k !== "lay") to[k] = B[a.bi][k];
      to.type = a.type;
      to.x = txt(B[a.bi]);
      if (a.type !== "p") to.id = to.id || newId(used, a.bi + 1);
      to.x0 = txt(B[a.bi]); to.lay = "ai";
      diffs.push({ bi: a.bi, from: [B[a.bi]], to: to });
    }
    diffs.sort(function (x, y) { return x.bi - y.bi; });
    var c = { type: 0, fuse: 0, join: 0 };
    for (i = 0; i < diffs.length; i++) {
      var lay = diffs[i].to && diffs[i].to.lay;
      if (lay === "fuse") c.fuse++; else if (lay === "join") c.join++; else c.type++;
    }
    c.total = diffs.length;
    return { diffs: diffs, count: c, skipJoin: p.skipJoin };
  }

  window.InkLayout = {
    tierOf: tierOf,
    plan: plan,
    apply: apply,
    undo: undo,
    detect: detect,
    vetAI: vetAI,
    mergeAI: mergeAI,
    shortDoc: shortDoc
  };
})();
