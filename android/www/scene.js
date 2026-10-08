/* ============================================================
   scene.js · 墨读 InkRead 场景引擎（v16）
   职责：为主题绘制一幅「静态」水墨长卷；动效只在交互那一刻播放一次。

   v16 变更：用户看过 v15 的截图仍嫌「图画粗糙简陋、拉低软件的档次」，并明确
   要求「换成名画，比如清明上河图 / 富春山居图」。逐层重画已经到头了 —— 一条
   44–88px 高的横幅，SVG 再精细也画不出真迹的笔意。于是换思路：
     **直接用真·国画手卷做底**（ink-reader/assets/ 两幅 16:1 长卷），SVG 版
     降级为「画卷取不到时」的兜底。
   三件事让「真迹」与 26 套主题共存：
     ① **同化**：主墨层 multiply —— 白宣纸在乘法里等于透明，只剩墨留在本主题
        自己的纸色上；宣纸、羊皮纸、杏仁黄于是各有各的调子。
     ② **晕染**：同一幅画再糊一层压一次 multiply —— 笔痕四周洇开的淡墨，
        这是 SVG 版怎么调高斯模糊都学不像的。
     ③ **边缘光**：反相 + 冷调重染 + screen —— 只沿墨线发亮，山脊上那一线冷光；
        比在 48 高的画布上描 0.6px 的线可靠得多。
   深色主题整套反转（invert + screen）：墨线在暗纸上发白，像月光下的拓片。

   v15 变更：接着 v14 那版继续改 —— 用户看过 v14 的截图仍嫌「粗糙简陋、拉低档次」。
   对着 v14 的放大截图逐条找病根：
     ① **没有峰**。v14 五层全是「基高 + 小正弦」，振幅合计不到 3 个单位
        （画布高 48），于是每条脊线都是一根几乎水平的直线 —— 远看是四条
        色带叠在一起，不是山。国画立命的「主峰 / 客峰 / 坡脚」一概没有。
     ② **近坡是一块黑板**。近坡填 w5（最浓），而披麻皴与苔点用 currentColor
        —— 同色盖同色，等于没画。整条下缘于是糊成一块无肌理的深色板。
     ③ **留白不够**。江面只有 4–9 个单位高，山脚几乎贴着岸线，画面不透气。
     ④ **树太稀太齐**。8 棵等距排开、每棵两三根枝，像插在土里的钉子。
     ⑤ **边缘光看不见**。stroke 0.5 / opacity .6 描在 48 高的画布上，缩到
        46px 的手机条里只剩 0.24px —— 有等于没有。

   v15 的画法：
     一、**给山立骨**：profile() 新增 `peaks` 参数（高斯峰），每层明确给
         「主峰 + 客峰」，脊线从此有高低、有起落，缩到一条横幅上仍读得出山。
     二、**皴与苔换色**：近坡底色降到 w4，披麻皴/苔点/树升到 w5；中山底色
         w3、肌理 w4。同色盖同色 → 变成「淡墨打底、浓墨醒笔」，肌理终于看得见。
     三、**把江面撑开**：水线 28.6、岸线 36.4，中间空出 6–10 个单位的纸色，
        并加一道最深的「近岸」（w5，压在最下缘）把画面钉住。
     四、**树成丛**：六丛、每丛 2–3 棵，高矮错落；远岸再加一排极小的树影。
     五、**湿墨渗开**：主峰后垫一层模糊的同形剪影（w2），模拟墨在纸上洇开；
        边缘光重新配比，脊线上留一线看得见的冷光。

   为什么走「富春山居图」而不是「清明上河图」：
     清明上河图是市井长卷，靠人物、舟桥、铺面的密集细节立命；天幕条只有
     44–88px 高、十几比一的横条，任何人物细节都会糊成一团墨点。富春山居图是
     「平远」山水手卷——远山、云气、坡岸、疏树，全靠轮廓与留白说话，天然
     就是这个比例，缩到一条横幅上仍然成立。

   画法（守住设计契约的两条硬线）：
     ① 「禁用装饰性渐变」→ 全程零 <linearGradient>/<radialGradient>；
        墨色是**平涂 + 高斯模糊**（真·晕染），不是渐变。
     ② 「配色零新增色值」→ 色阶仍只由 --sc-air(纸) / --sc-earth(墨) 两点
        插值，强调色只用于印章与山脊边缘光。

   取景框：viewBox 900×48（18.75:1）。窄屏（手机 390px）只看到 x∈[246,654]
     这一窗 —— 所以主峰、渔舟、树丛、印章全部压进这条「永远可见」的核心里。

   硬约束（照旧）：默认完全静止（无循环 @keyframes、无常驻 rAF）；
   只占工具栏与纸页之间的天幕条，正文纸页永不参与；确定性伪随机，形状不跳。
   ============================================================ */
(function () {
  "use strict";

  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function reduced() {
    return document.documentElement.dataset.reduce === "on" || !!(mq && mq.matches);
  }

  /* 确定性伪随机：同一 seed 永远画出同一座山，避免每次渲染形状乱跳 */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 画布是「一条横幅」而非整屏：场景只在纸页上方露出一条天幕。
     viewBox 取 900×48（18.75:1）—— 比 25:1 窄，是为了让窄屏也能看到大半个画面：
       · 1440 宽：可见 x 约 57–843（几乎整幅）
       · 390 宽（手机）：可见 x 约 246–654（核心构图仍在）
     且横向裁切优先发生，像素永不被纵向拉伸。 */
  var VB_W = 900, VB_H = 48;

  function f2(n) { return Math.round(n * 10) / 10; }

  /* 折线 → 三次贝塞尔（Catmull-Rom）：山脊圆润无折角，这是水墨的第一口气 */
  function smooth(pts) {
    var d = "M" + f2(pts[0][0]) + " " + f2(pts[0][1]);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += "C" + f2(p1[0] + (p2[0] - p0[0]) / 6) + " " + f2(p1[1] + (p2[1] - p0[1]) / 6) +
        " " + f2(p2[0] - (p3[0] - p1[0]) / 6) + " " + f2(p2[1] - (p3[1] - p1[1]) / 6) +
        " " + f2(p2[0]) + " " + f2(p2[1]);
    }
    return d;
  }

  /* 山脊采样点：基高 + 若干正弦（定调子）+ 若干高斯峰（立骨）+ 一点伪随机。
     peaks 的每一项是 [峰位 x, 峰高 h, 半宽 w]：h 越大峰越高，w 越小峰越尖。
     这是 v15 的关键 —— v14 只有正弦，画出来是一根水平线，不是山。 */
  function profile(seed, base, amp, waves, peaks) {
    var r = rng(seed), n = 34, step = VB_W / n, pts = [];
    for (var i = 0; i <= n; i++) {
      var x = i * step, y = base;
      for (var w = 0; w < waves.length; w++) {
        y += Math.sin((x / VB_W) * Math.PI * 2 * waves[w][0] + waves[w][1]) * waves[w][2];
      }
      if (peaks) {
        for (var p = 0; p < peaks.length; p++) {
          var dx = (x - peaks[p][0]) / peaks[p][2];
          y -= peaks[p][1] * Math.exp(-dx * dx);
        }
      }
      y += (r() * 2 - 1) * amp;
      pts.push([x, y]);
    }
    return pts;
  }
  function yAt(pts, x) {
    var seg = VB_W / (pts.length - 1);
    var i = Math.max(0, Math.min(pts.length - 2, Math.floor(x / seg)));
    return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * ((x - pts[i][0]) / seg);
  }
  /* 山体：山脊一路拉到底边闭合 */
  function hillBody(pts) {
    return smooth(pts) + "L" + VB_W + " " + VB_H + "L0 " + VB_H + "Z";
  }
  /* 江面：上缘是水线、下缘是岸线 —— 一条纸色的留白带，不是又一座山 */
  function river(top, bot) {
    var rev = bot.slice().reverse();
    return smooth(top) + smooth(rev).replace(/^M/, "L") + "Z";
  }
  /* 山脊带：沿脊线往下一条厚薄不均的浓墨带 —— 国画的「轮廓重笔」。
     一根 0.5 宽的描边缩到手机条里只剩 0.24px（v14 的毛病），而一条 2–5 单位
     厚的墨带在任何尺寸下都还在，山于是有了「顶」。 */
  function ridge(pts, seed, hBase, hVar) {
    var r = rng(seed);
    var low = pts.map(function (p) {
      return [p[0], p[1] + hBase * (0.5 + r() * hVar)];
    });
    return smooth(pts) + smooth(low.slice().reverse()).replace(/^M/, "L") + "Z";
  }

  /* 六层的骨架（y 越小越高）。主峰一律压在 x∈[246,654] 的「永远可见」窗里。
     远山二重 6–16，中山 14–25，水线 28 上下，近坡 34–40，近岸 42–45 ——
     留白（天 + 江）占掉一半以上，这是国画的呼吸。 */
  var LAYERS = {
    /* 远山二重：三重主峰，是整幅的「天际线」 */
    far2: { seed: 19, base: 11.8, amp: 0.42, waves: [[0.7, 2.4, 1.4], [1.9, 0.7, 0.8]],
            peaks: [[292, 3.4, 108], [486, 2.9, 92], [648, 3.2, 104]] },
    /* 远山：压在前者之上，峰位错开，于是「远山二重」看得出前后 */
    far:  { seed: 11, base: 15.0, amp: 0.46, waves: [[1.0, 0.4, 1.6], [2.4, 1.9, 0.9]],
            peaks: [[368, 3.3, 96], [578, 2.7, 84]] },
    /* 中山：画面主体，一座主峰带两侧客峰，肌理最丰富 */
    mid:  { seed: 27, base: 21.6, amp: 0.5, waves: [[0.8, 2.2, 2.1], [2.1, 0.6, 1.0]],
            peaks: [[402, 4.6, 80], [266, 2.9, 64], [578, 3.1, 68]] },
    /* 水线：江面上缘，几乎平直 —— 水不能像山 */
    wtop: { seed: 63, base: 28.6, amp: 0.32, waves: [[0.5, 1.0, 0.9], [1.3, 3.3, 0.5]] },
    /* 近坡：最浓最实，坡上站树、坡下是岸 */
    near: { seed: 41, base: 36.4, amp: 0.56, waves: [[0.6, 1.4, 1.3], [1.7, 4.1, 0.55]],
            peaks: [[302, 2.7, 128], [566, 2.3, 116]] },
    /* 近岸：最下缘一道最深的坡脚，把画面钉在纸页上 */
    bank: { seed: 77, base: 43.4, amp: 0.3, waves: [[0.9, 2.0, 0.7], [2.2, 0.5, 0.4]] }
  };

  /* 披麻皴：顺山势披下来的长笔，起笔重、收笔轻 —— 山体的肌理就靠它。
     笔画跟着脊线斜率走（slope），所以不会像雨一样垂直下落。
     v15：**贴着脊线**起笔（y0 只在脊下 0.2–1.8），笔画加粗到 0.4–0.74。
     旧版把笔散落在整个山体上，大半被山挡住、剩下的缩到手机条里细如发丝，
     看着就是一层浮在色块上的绒毛，不是皴。 */
  function cun(seed, pts, n, len, op) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) {
      var x = r() * VB_W;
      var y = yAt(pts, x);
      var slope = (yAt(pts, Math.min(VB_W, x + 10)) - yAt(pts, Math.max(0, x - 10))) / 20;
      var l = len * (0.4 + r() * 0.85);
      var lean = slope * 0.62 + (r() * 2 - 1) * 0.42;
      var y0 = y + 0.2 + r() * 1.6;
      out.push('<path d="M' + f2(x) + " " + f2(y0) + "q" + f2(lean * l * 0.45) + " " + f2(l * 0.5) +
        " " + f2(lean * l) + " " + f2(l) + '" fill="none" stroke="currentColor" stroke-width="' +
        f2(0.4 + r() * 0.34) + '" stroke-linecap="round" opacity="' +
        f2((op || 0.3) * (0.5 + r() * 0.7)) + '"/>');
    }
    return out.join("");
  }

  /* 点苔：山脊上的一撮撮墨点，山水画的「醒笔」——大小错落才不呆。
     贴着脊线落（脊下 0.2–2.0），尺寸抬到 1.0–2.6 —— 小于 1 个单位的点在
     手机条里连一个像素都不到，点了也白点。 */
  function moss(seed, pts, n) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) {
      var x = r() * VB_W;
      var y = yAt(pts, x) + 0.2 + r() * 1.8;
      var w = 1.0 + r() * 1.6;
      out.push('<ellipse cx="' + f2(x) + '" cy="' + f2(y) + '" rx="' + f2(w) + '" ry="' +
        f2(w * 0.62) + '" opacity="' + f2(0.4 + r() * 0.46) + '"/>');
    }
    return out.join("");
  }

  /* 树（点叶法）：干一笔带弧，冠是一簇墨点，另有两条斜枝探出 ——
     这样才像树。v13 只有一根杆加三粒点，远看是枯枝。 */
  function tree(x, y, h, r) {
    var s = '<path d="M' + f2(x) + " " + f2(y) + "q" + f2((r() - 0.5) * 1.4) + " " +
      f2(-h * 0.5) + " " + f2((r() - 0.5) * 2.0) + " " + f2(-h) +
      '" fill="none" stroke="currentColor" stroke-width="0.62" stroke-linecap="round"/>';
    /* 两条斜枝 */
    for (var b = 0; b < 2; b++) {
      var dir = b ? 1 : -1;
      var by = y - h * (0.44 + 0.22 * b);
      s += '<path d="M' + f2(x) + " " + f2(by) + "q" + f2(dir * h * 0.3) + " " + f2(-h * 0.1) +
        " " + f2(dir * h * 0.5) + " " + f2(-h * 0.3) +
        '" fill="none" stroke="currentColor" stroke-width="0.44" stroke-linecap="round"/>';
    }
    /* 树冠：一簇点叶，靠近冠心密、边缘疏 */
    var cx = x + (r() - 0.5) * 1.5, cy = y - h * 0.78;
    var n = 11 + Math.floor(r() * 6);
    for (var i = 0; i < n; i++) {
      var a = r() * Math.PI * 2, rad = Math.sqrt(r());
      s += '<ellipse cx="' + f2(cx + Math.cos(a) * rad * h * 0.46) + '" cy="' +
        f2(cy + Math.sin(a) * rad * h * 0.34) + '" rx="' + f2(0.4 + r() * 0.44) + '" ry="' +
        f2(0.3 + r() * 0.3) + '" opacity="' + f2(0.5 + r() * 0.44) + '"/>';
    }
    return s;
  }
  /* 疏树：近坡上的六丛。位置钉死在「永远可见」的核心区（x 246–654）里，
     窄屏也不落空；每丛 2–3 棵、高矮错落，成丛才像树林，等距排开像钉子。 */
  var CLUMPS = [[262, 5.6, 3], [318, 4.4, 2], [372, 7.2, 2], [498, 5.0, 3], [556, 6.4, 2], [612, 4.8, 3]];
  function grove(pts) {
    var r = rng(83), out = [];
    CLUMPS.forEach(function (c) {
      for (var i = 0; i < c[2]; i++) {
        var x = c[0] + (i - (c[2] - 1) / 2) * (7 + r() * 5);
        var h = c[1] * (0.7 + r() * 0.62);
        out.push(tree(x, yAt(pts, x) + 0.6, h, r));
      }
    });
    return out.join("");
  }
  /* 远岸树影：中山脊上一排极小的树，只为把「远」说清楚（近大远小） */
  function farWoods(seed, pts, n) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) {
      var x = 250 + r() * 400;
      var h = 1.5 + r() * 1.3;
      var y = yAt(pts, x) + 0.3;
      out.push('<path d="M' + f2(x) + " " + f2(y) + "l" + f2((r() - 0.5) * 0.5) + " " + f2(-h) +
        '" fill="none" stroke="currentColor" stroke-width="0.4" stroke-linecap="round" opacity="0.6"/>' +
        '<ellipse cx="' + f2(x) + '" cy="' + f2(y - h - 0.2) + '" rx="' + f2(0.75 + r() * 0.4) +
        '" ry="' + f2(0.55 + r() * 0.3) + '" opacity="' + f2(0.45 + r() * 0.3) + '"/>');
    }
    return out.join("");
  }

  /* 云气：贴着山腰横贯的留白条 —— 富春山居图最认得出的一笔。
     取纸色、糊得开，读起来就是「云从谷里升起来」，而不是一条白杠。 */
  function mist(seed, yBase, n, wMin, wMax) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) {
      var x = -90 + r() * (VB_W + 180);
      var y = yBase + (r() * 2 - 1) * 1.8;
      var w = wMin + r() * (wMax - wMin), h = 1.6 + r() * 2.2;
      out.push('<rect x="' + f2(x) + '" y="' + f2(y - h / 2) + '" width="' + f2(w) +
        '" height="' + f2(h) + '" rx="' + f2(h / 2) + '" opacity="' + f2(0.5 + r() * 0.4) + '"/>');
    }
    return out.join("");
  }

  /* 水纹：江面上几笔极淡的横波，点出「水」而不画水 */
  function ripples(seed, pts, n) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) {
      var x = 160 + r() * (VB_W - 320);
      var y = yAt(pts, x) + 1.4 + r() * 4.4;
      var w = 24 + r() * 58;
      out.push('<path d="M' + f2(x) + " " + f2(y) + "q" + f2(w * 0.25) + " -0.5 " + f2(w * 0.5) +
        " 0q" + f2(w * 0.25) + " 0.5 " + f2(w * 0.5) + ' 0" fill="none" stroke="currentColor" stroke-width="0.4" stroke-linecap="round" opacity="' +
        f2(0.18 + r() * 0.24) + '"/>');
    }
    return out.join("");
  }

  /* 渔舟：富春山居图里那叶小船 —— 一线船身、一根篙、一个人影。
     船身用「下弧」而非上弧，才像浮在水上而不是扣在水里。 */
  function boat(x, y, s) {
    return '<g class="sc-boat">' +
      '<path d="M' + f2(x - s) + " " + f2(y) + "q" + f2(s) + " " + f2(s * 0.55) + " " + f2(s * 2) +
      ' 0" fill="none" stroke="currentColor" stroke-width="0.58" stroke-linecap="round"/>' +
      '<path d="M' + f2(x + s * 0.55) + " " + f2(y + 0.1) + "l" + f2(-s * 0.16) + " " + f2(-s * 0.72) +
      '" fill="none" stroke="currentColor" stroke-width="0.46" stroke-linecap="round"/>' +
      '<path d="M' + f2(x + s * 0.3) + " " + f2(y - s * 0.16) + "q" + f2(s * 0.34) + " " + f2(-s * 0.4) +
      " " + f2(s * 0.72) + " " + f2(-s * 0.44) +
      '" fill="none" stroke="currentColor" stroke-width="0.36" stroke-linecap="round"/>' +
      "</g>";
  }

  /* 飞鸟：几个小小的「人」字 —— 只落在能被看到的中间段 */
  function birds(seed, n) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) {
      var x = 290 + r() * 320, y = 3.4 + r() * 6.2, s = 1.4 + r() * 1.2;
      out.push('<path d="M' + f2(x - s) + " " + f2(y) + "Q" + f2(x - s * 0.5) + " " + f2(y - s * 0.9) +
        " " + f2(x) + " " + f2(y) + "Q" + f2(x + s * 0.5) + " " + f2(y - s * 0.9) + " " + f2(x + s) + " " + f2(y) +
        '" fill="none" stroke="currentColor" stroke-width="0.52" stroke-linecap="round" opacity="0.75"/>');
    }
    return out.join("");
  }

  /* 朱砂印：一方小印，是整条天幕唯一的强调色 —— 国画的「款」。
     压在近坡上（深底红印最醒目），且落在核心可见区。 */
  function seal() {
    return '<g class="sc-seal">' +
      '<rect x="612" y="40.2" width="6.6" height="6.6" rx="0.6"/>' +
      '<path d="M614.2 42.1h2.4M614.2 45.1h2.4M616.1 42.1v3M617.6 42.1v3" fill="none" stroke-width="0.46"/>' +
      "</g>";
  }

  /* 边缘光：把山脊线单独拎出来描两遍 —— 一遍锐、一遍糊。
     锐的那道是「光」，糊的那道是「晕」；合起来才是国画里山与天交界处
     那一圈极淡的冷光。v14 是 blur .7 / stroke .5，缩到手机条里只剩 0.24px，
     等于没画；v15 抬到 stroke .6 + 一圈 1.7 宽的晕，才留得住一口气。 */
  function rim(pts) {
    var d = smooth(pts);
    return '<g class="sc-rim">' +
      '<path class="sc-glowline-soft" d="' + d + '"/>' +
      '<path class="sc-glowline" d="' + d + '"/>' +
      "</g>";
  }

  function svg(inner, cls) {
    return '<svg class="sc-ink' + (cls ? " " + cls : "") + '" viewBox="0 0 ' + VB_W + " " + VB_H +
      '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' + inner + "</svg>";
  }

  /* ---------- 真·国画手卷（v16）----------
     两幅 16:1 的宣纸长卷铺满天幕。三层同一张图，各司其职：
       .sc-art-bleed  糊一层再乘法 —— 笔痕四周洇开的淡墨（真·晕染）
       .sc-art        本体乘法 —— 白纸消失、墨留在本主题的纸色上
       .sc-art-rim    反相 + 冷调重染 + screen —— 只沿墨线发亮的边缘光
     --sc-art / --sc-art-pos 由内联 style 下发；取景框随画卷不同而微调
     （富春的主峰在中上，清明上河图的重心居中，所以两者的 background-position 不同）。 */
  var ART = {
    fuchun:   { src: "assets/scene-fuchun.jpg",   pos: "50% 56%" },
    qingming: { src: "assets/scene-qingming.jpg", pos: "50% 50%" }
  };

  /* ---------- v2.1 · 名画画库（要求三）----------
     画库 = 两幅真迹手卷 + 四幅「名画意境」的程序化变体（共享 v15 的 SVG 长卷引擎，
     换构图人格：峰骨 / 水线 / 雾量 / 点景 / 设色）。sceneArt=auto（默认）时
     每次进入程序随机展卷一幅，同一次会话内保持不变（sessionStorage 记住）。
     「活起来」：雾带横移、飞鸟掠空、整卷缓推 —— 全部 CSS 动画，尊重减少动效。
     「装裱」：画卷按手卷制式包一层裱边（上下隔水 + 描金线 + 轴头），见 build()。 */
  var GALLERY = [
    { k: "fuchun",    name: "富春山居图" },
    { k: "qingming",  name: "清明上河图" },
    { k: "qianli",    name: "千里江山图" },
    { k: "xiaoxiang", name: "潇湘烟雨" },
    { k: "hanjiang",  name: "寒江独钓" },
    { k: "wanhe",     name: "万壑松风" }
  ];
  function galleryKey() {
    var k = document.documentElement.dataset.sceneArt || "auto";
    if (k !== "auto" && GALLERY.some(function (g) { return g.k === k; })) return k;
    /* auto：本会话随机定一幅；没有 sessionStorage（打包内 file:// 之外都有）就每次启动随机 */
    var pick;
    try {
      pick = sessionStorage.getItem("inkread.sceneArt");
      if (!pick || !GALLERY.some(function (g) { return g.k === pick; })) {
        pick = GALLERY[Math.floor(Math.random() * GALLERY.length)].k;
        sessionStorage.setItem("inkread.sceneArt", pick);
      }
    } catch (e) {
      pick = GALLERY[Math.floor(Math.random() * GALLERY.length)].k;
    }
    return pick;
  }
  function galleryName(k) {
    for (var i = 0; i < GALLERY.length; i++) if (GALLERY[i].k === k) return GALLERY[i].name;
    return "";
  }
  function artKey() {
    var k = galleryKey();
    return (ART[k] || k === "qianli" || k === "xiaoxiang" || k === "hanjiang" || k === "wanhe") ? k : "fuchun";
  }
  /* 程序化变体是否可走真迹位图管线（真迹才有 jpg 源） */
  function isBitmapArt(k) { return !!ART[k]; }

  function artScroll(key) {
    if (!isBitmapArt(key)) return null;
    var a = ART[key] || ART.fuchun;
    return '<div class="sc-inkart" style="--sc-art:url(' + a.src + ');--sc-art-pos:' + a.pos + '">' +
      '<div class="sc-art-bleed"></div>' +
      '<div class="sc-art"></div>' +
      '<div class="sc-art-rim"></div>' +
      "</div>" +
      '<div class="sc-tint"></div>';
  }
  /* SVG 版长卷：画卷取不到时（打包漏了 assets / 路径不对）顶上来，不留空条；
     传入画库变体键时按该构图人格绘制（千里江山 / 潇湘 / 寒江 / 万壑） */
  function svgScroll(k) {
    var v = k && VARIANTS[k];
    var inner = '<div class="sc-sky"></div><div class="sc-stars"></div><div class="sc-orb"></div>' +
      svg(scroll(v), v && v.cls) + '<div class="sc-glow"></div><div class="sc-vig"></div>';
    return inner;
  }

  /* 本机时段：四时流转据此离散换色（不流动） */
  function phase() {
    var h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h < 4.5) return "night";
    if (h < 7.5) return "dawn";
    if (h < 16.5) return "day";
    if (h < 19.5) return "dusk";
    return "night";
  }

  /* 水墨长卷：远山二重 → 云气 → 中山(渗墨·皴·苔) → 江水 → 近坡(皴·苔·树丛)
     → 近岸 → 渔舟 · 飞鸟 · 朱砂印。八层叠出一幅平远山水。
     四时流转只换天色与印色（data-phase 由 CSS 换色），构图完全一致 —— 换色是离散的。
     v2.1：接受构图人格 v（名画画库的变体）—— 各层可覆写骨架（peaks/base），
     另配雾带表、飞鸟数、舟位、皴苔密度与设色类名。不传 v 即经典的富春构图。 */
  function scroll(v) {
    var L = LAYERS;
    if (v && v.layers) {
      L = {};
      Object.keys(LAYERS).forEach(function (k) {
        L[k] = v.layers[k] ? Object.assign({}, LAYERS[k], v.layers[k]) : LAYERS[k];
      });
    }
    var far2 = profile(L.far2.seed, L.far2.base, L.far2.amp, L.far2.waves, L.far2.peaks);
    var far = profile(L.far.seed, L.far.base, L.far.amp, L.far.waves, L.far.peaks);
    var mid = profile(L.mid.seed, L.mid.base, L.mid.amp, L.mid.waves, L.mid.peaks);
    var wtop = profile(L.wtop.seed, L.wtop.base, L.wtop.amp, L.wtop.waves);
    var near = profile(L.near.seed, L.near.base, L.near.amp, L.near.waves, L.near.peaks);
    var bank = profile(L.bank.seed, L.bank.base, L.bank.amp, L.bank.waves);
    /* 渔舟浮在江心：取该处水线与岸线的中点，永远不搁浅也不悬空 */
    var bx = (v && v.boatX) || 452, by = (yAt(wtop, bx) + yAt(near, bx)) / 2 - 0.2;
    /* 雾带表：默认两道山腰云气；变体可整表替换（潇湘的雾要占掉半个画面） */
    var mistG = (v && v.mist) ? v.mist : [[31, 17.2, 4, 250, 560], [37, 19.6, 3, 200, 430]];
    var clouds = mistG.map(function (m) { return mist(m[0], m[1], m[2], m[3], m[4]); }).join("");
    var cunMul = (v && v.cun) || 1, mossMul = (v && v.moss) || 1;
    var inner =
      /* 远山二重：越远越淡、晕得越开（空气透视） */
      '<g class="sc-far2 sc-haze-far2"><path d="' + hillBody(far2) + '"/></g>' +
      '<g class="sc-far sc-haze-far"><path d="' + hillBody(far) + '"/></g>' +
      /* 云气横贯山腰：留白，把远山与中山断开 */
      '<g class="sc-cloud">' + clouds + "</g>" +
      /* 中山：先垫一层渗开的湿墨（同形·模糊·更淡），再压上本体与肌理 ——
         墨在纸上洇开的那一圈，是水墨最像水墨的地方 */
      '<g class="sc-bleed"><path d="' + hillBody(mid) + '"/></g>' +
      '<g class="sc-mid sc-haze-mid"><path d="' + hillBody(mid) + '"/>' +
      '<g class="sc-tex">' + cun(53, mid, Math.round(62 * cunMul), 4.8, 0.4) + moss(59, mid, Math.round(34 * mossMul)) + farWoods(43, mid, 22) + "</g></g>" +
      /* 轮廓重笔：沿山脊压一道厚薄不均的浓墨带 —— 山的「顶」立起来（v2.1 接线） */
      '<g class="sc-ridge sc-ridge-mid"><path d="' + ridge(mid, 67, 3.4, 0.5) + '"/></g>' +
      rim(mid) +
      /* 江水：纸色留白带，上缘水线、下缘岸线 —— 这一条空出来，画面才透气 */
      '<g class="sc-water"><path class="sc-river" d="' + river(wtop, near) + '"/>' +
      ripples(67, wtop, 10) + "</g>" +
      /* 近坡：淡墨打底（w4），披麻皴 / 苔点 / 树丛用浓墨（w5）醒上去 ——
         同色盖同色就是 v14 那块黑板，改色之后肌理才看得见 */
      '<g class="sc-near"><path d="' + hillBody(near) + '"/>' +
      '<g class="sc-tex">' + cun(71, near, Math.round(52 * cunMul), 3.6, 0.34) + moss(89, near, Math.round(34 * mossMul)) + grove(near) + "</g></g>" +
      '<g class="sc-ridge sc-ridge-near"><path d="' + ridge(near, 73, 3.0, 0.55) + '"/></g>' +
      rim(near) +
      /* 近岸：最下缘一道最深的坡脚，把整幅画钉在纸页上 */
      '<g class="sc-bank"><path d="' + hillBody(bank) + '"/></g>' +
      ((v && v.boat === false) ? "" : boat(bx, by, 5.6)) +
      '<g class="sc-birds">' + birds(97, v && v.birds != null ? v.birds : 5) + "</g>" +
      seal();
    return inner;
  }

  /* 几何色带（宣言 · 大胆）：硬边楔形叠印，与包豪斯 / 瑞士 / 新粗野同源 */
  function aurora() {
    return '<div class="sc-sky"></div>' +
      '<div class="sc-layer sc-b1"></div>' +
      '<div class="sc-layer sc-b2"></div>' +
      '<div class="sc-layer sc-b3"></div>' +
      '<div class="sc-stars"></div>' +
      '<div class="sc-vig"></div>';
  }

  /* 四幅「名画意境」的程序化变体：与真迹共用一套长卷引擎，换的是构图人格 ——
     峰骨（peaks）、水线与坡岸的基高（base）、雾带表（mist）、点景（舟/鸟/雾量）、
     皴苔密度（cun/moss 倍率）。青绿设色走容器类名（.scv-qianli，styles.css 用
     主题 accent 同化设色，画卷永远跟着当前主题走）。 */
  var VARIANTS = {
    /* 千里江山：峰更高更密更重叠，青绿设色，无舟有雁阵 */
    qianli: {
      cls: "scv-qianli", boat: false, birds: 7,
      layers: {
        far2: { peaks: [[262, 5.2, 88], [420, 6.4, 96], [586, 5.6, 92], [700, 4.2, 80]] },
        far:  { peaks: [[330, 4.6, 76], [520, 5.2, 84], [662, 4.0, 70]] },
        mid:  { peaks: [[300, 5.8, 72], [452, 6.8, 84], [610, 5.4, 76]] }
      },
      mist: [[31, 14.6, 5, 220, 480], [37, 17.8, 3, 200, 420]]
    },
    /* 潇湘烟雨：山极低平，雾占掉半个画面，雁阵斜掠 —— 平远与留白的极致 */
    xiaoxiang: {
      cls: "scv-xiaoxiang", boat: false, birds: 9,
      layers: {
        far2: { base: 14.5, waves: [[0.7, 1.6, 1.2]], peaks: [[320, 1.6, 140], [560, 1.9, 120]] },
        far:  { base: 17.5, waves: [[1.0, 1.2, 1.4]], peaks: [[420, 1.5, 110]] },
        mid:  { base: 22.5, waves: [[0.8, 1.4, 1.6]], peaks: [[360, 1.7, 96], [600, 1.4, 88]] },
        wtop: { base: 27.2 }, near: { base: 35.2 }
      },
      mist: [[31, 13.4, 7, 320, 620], [37, 18.4, 5, 260, 540], [43, 24.2, 4, 240, 500]]
    },
    /* 寒江独钓：边角构图 —— 山石聚在右半，左半大面留白，一舟一翁居中偏右 */
    hanjiang: {
      cls: "scv-hanjiang", boat: true, boatX: 430, birds: 2, moss: 0.6,
      layers: {
        far2: { base: 10.2, waves: [[0.7, 2.2, 1.2]], peaks: [[640, 4.2, 96], [760, 3.4, 84]] },
        far:  { base: 14.0, waves: [[1.0, 1.6, 1.4]], peaks: [[680, 3.6, 88], [796, 2.6, 72]] },
        mid:  { base: 20.4, waves: [[0.8, 2.0, 1.8]], peaks: [[700, 4.4, 84], [820, 3.2, 70]] },
        near: { base: 35.0, waves: [[0.6, 1.2, 1.1]], peaks: [[660, 2.6, 108], [800, 2.2, 90]] }
      },
      mist: [[37, 16.8, 3, 200, 420]]
    },
    /* 万壑松风：近中两重浓墨高压，皴苔密布，气势最沉 */
    wanhe: {
      cls: "scv-wanhe", boat: false, birds: 3, cun: 1.35, moss: 1.5,
      layers: {
        far2: { base: 8.6, peaks: [[300, 5.8, 92], [470, 7.0, 100], [640, 6.2, 96]] },
        far:  { base: 13.2, peaks: [[350, 5.4, 84], [540, 6.0, 92]] },
        mid:  { base: 19.4, peaks: [[320, 6.6, 80], [500, 7.4, 88], [660, 6.0, 80]] },
        near: { base: 33.8, peaks: [[380, 4.2, 120], [600, 3.8, 112]] }
      },
      mist: [[31, 13.2, 4, 240, 460]]
    }
  };

  /* 手卷装裱：画心外包一层裱边 —— 上下隔水绫边、描金细线、左右轴头、引首题名。
     结构对照真手卷的「天头—隔水—画心—隔水—拖尾」，天幕条取其意而不照搬尺寸。 */
  function mountWrap(inner, title) {
    return '<div class="sc-mount">' +
      '<i class="sc-mount-gold" aria-hidden="true"></i>' +
      '<div class="sc-mount-heart">' + inner + "</div>" +
      (title ? '<span class="sc-mount-title">' + title + "</span>" : "") +
      '<i class="sc-mount-knob sc-knob-l" aria-hidden="true"></i>' +
      '<i class="sc-mount-knob sc-knob-r" aria-hidden="true"></i>' +
      "</div>";
  }

  function build(key, art) {
    var p = phase();
    var inner;
    if (key === "aurora") inner = aurora();
    else if (key === "seasons") {
      /* 名画画库：真迹走位图管线，程序化变体走 SVG 管线；统一进手卷装裱 */
      var k = art || artKey();
      var artPart = artScroll(k) || svgScroll(k);
      inner = '<div class="sc-sky"></div>' + artPart +
        '<div class="sc-orb"></div><div class="sc-glow"></div><div class="sc-vig"></div>';
      inner = mountWrap(inner, galleryName(k));
    } else inner = svgScroll();
    return '<div class="scene" data-scene="' + key + '" data-phase="' + p + '" aria-hidden="true">' + inner + "</div>";
  }

  /* 画卷可用性：只探一次。取不到就把所有 seasons 天幕换成 SVG 版 —— 宁可差一点，不留空条 */
  var _artOK = null;
  function probeArt(host, art) {
    if (_artOK === false) { host.innerHTML = svgScroll(); return; }
    if (_artOK === true) return;
    var im = new Image();
    im.onload = function () { _artOK = true; };
    im.onerror = function () {
      _artOK = false;
      var list = document.querySelectorAll("[data-scene-host]");
      for (var i = 0; i < list.length; i++) {
        if (list[i].dataset.scene === "seasons") list[i].innerHTML = svgScroll();
      }
    };
    im.src = (ART[art] || ART.fuchun).src;
  }

  /* 场景总开关与母题由 theme.js 落在 <html> 上；本函数把场景铺进所有 [data-scene-host] */
  function sync() {
    var hosts = document.querySelectorAll("[data-scene-host]");
    if (!hosts.length) return;
    var root = document.documentElement;
    var key = root.dataset.scene || "";
    var on = root.dataset.sceneOn !== "off" && !!key;
    var p = phase();
    var art = artKey();
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      if (!on) {
        if (host.dataset.scene) {
          host.innerHTML = "";
          host.dataset.scene = ""; host.dataset.phase = ""; host.dataset.art = "";
        }
        continue;
      }
      if (host.dataset.scene === key && host.dataset.phase === p && host.dataset.art === art) continue;
      host.dataset.scene = key;
      host.dataset.phase = p;
      host.dataset.art = art;
      host.innerHTML = build(key, art);
      if (key === "seasons" && isBitmapArt(art)) probeArt(host, art);
    }
  }

  /* 交互触发的一次性动效：加 class → 走到位 → 摘 class 归位。
     flip 翻页 / chapter 换章跳转 / immerse 进出沉浸。 */
  var HOLD = { flip: 170, chapter: 230, immerse: 200 };

  function pulse(kind) {
    if (reduced() || !HOLD[kind]) return;
    var list = document.querySelectorAll(".scene");
    for (var i = 0; i < list.length; i++) {
      (function (el) {
        var cls = "run-" + kind;
        if (el._scT) clearTimeout(el._scT);
        el.classList.remove(cls);
        void el.offsetWidth;             /* 强制回流，保证连翻时每次都重新走一遍 */
        el.classList.add(cls);
        el._scT = setTimeout(function () { el.classList.remove(cls); el._scT = 0; }, HOLD[kind]);
      })(list[i]);
    }
  }

  window.InkScene = {
    build: build, sync: sync, pulse: pulse, reduced: reduced, phase: phase
  };

  /* 时段跨越（日出 / 日落）时换色：离散一次，不做流动 */
  if (mq && mq.addEventListener) mq.addEventListener("change", sync);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) sync(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
})();
