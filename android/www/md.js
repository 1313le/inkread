/* ============================================================
   md.js · 墨读自研排版引擎（零依赖、离线可用）
   支持：Markdown 常用语法 + LaTeX 数学（行内 $..$ / 独立 $$..$$）
   ============================================================ */

(function () {
  var esc = function (s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  var GREEK = {
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
    zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ",
    mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ",
    phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
    Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ",
    Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω"
  };

  var SYM = {
    times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", ast: "∗",
    le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠",
    approx: "≈", equiv: "≡", sim: "∼", simeq: "≃", propto: "∝", cong: "≅",
    to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐",
    leftrightarrow: "↔", mapsto: "↦", implies: "⟹",
    infty: "∞", partial: "∂", nabla: "∇", in: "∈", notin: "∉",
    subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇",
    cup: "∪", cap: "∩", setminus: "\\", forall: "∀", exists: "∃", nexists: "∄",
    emptyset: "∅", angle: "∠", perp: "⊥", parallel: "∥", therefore: "∴", because: "∵",
    sum: "∑", prod: "∏", int: "∫", oint: "∮", lim: "lim", log: "log", ln: "ln",
    sin: "sin", cos: "cos", tan: "tan", exp: "exp", max: "max", min: "min",
    deg: "°", prime: "′", ldots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱",
    langle: "⟨", rangle: "⟩", lceil: "⌈", rceil: "⌉", lfloor: "⌊", rfloor: "⌋",
    circ: "∘", bullet: "•", star: "⋆", oplus: "⊕", otimes: "⊗", aleph: "ℵ", hbar: "ℏ", ell: "ℓ", Re: "ℜ", Im: "ℑ"
  };

  var BIGOP = { sum: 1, prod: 1, int: 1, oint: 1, lim: 1, max: 1, min: 1, bigcup: 1, bigcap: 1 };

  /* ---------- LaTeX 解析器 ---------- */
  function Tex(src) { this.s = String(src || ""); this.i = 0; }

  Tex.prototype.skipSpace = function () { while (this.i < this.s.length && this.s[this.i] === " ") this.i++; };

  Tex.prototype.group = function () {
    this.i++; // 跳过 {
    var depth = 1, start = this.i;
    while (this.i < this.s.length && depth > 0) {
      var c = this.s[this.i];
      if (c === "\\") { this.i += 2; continue; }
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) break; }
      this.i++;
    }
    var inner = this.s.slice(start, this.i);
    this.i++;
    return inner;
  };

  Tex.prototype.arg = function () {
    this.skipSpace();
    if (this.s[this.i] === "{") return this.group();
    if (this.s[this.i] === undefined) return "";
    if (this.s[this.i] === "\\") {
      var st = this.i++;
      while (this.i < this.s.length && /[a-zA-Z]/.test(this.s[this.i])) this.i++;
      return this.s.slice(st, this.i);
    }
    return this.s[this.i++];
  };

  Tex.prototype.parse = function () {
    var parts = [];
    var push = function (html, op) { parts.push({ html: html, op: !!op }); };
    var last = function () { return parts.length ? parts[parts.length - 1] : null; };

    while (this.i < this.s.length) {
      var c = this.s[this.i];

      if (c === " ") { this.i++; push(" "); continue; }
      if (c === "{") { push(this.render(this.group())); continue; }
      if (c === "}") { this.i++; continue; }
      if (c === "&") { this.i++; continue; }
      if (c === "~") { this.i++; push("\u00a0"); continue; }

      if (c === "^" || c === "_") {
        this.i++;
        var a = this.arg();
        var h = this.render(a);
        var p = last();
        if (!p) { push(""); p = last(); }
        if (p.op) { if (c === "^") p.limSup = h; else p.limSub = h; }
        else { if (c === "^") p.sup = h; else p.sub = h; }
        continue;
      }

      if (c === "\\") {
        this.i++;
        var name = "";
        if (/[a-zA-Z]/.test(this.s[this.i] || "")) {
          while (this.i < this.s.length && /[a-zA-Z]/.test(this.s[this.i])) name += this.s[this.i++];
        } else { name = this.s[this.i++] || ""; }
        var r = this.command(name);
        if (r !== null) push(r.html, r.op);
        continue;
      }

      this.i++;
      push(c === "-" ? "\u2212" : esc(c));
    }

    return parts.map(function (p) {
      if (p.op && (p.limSup || p.limSub)) {
        return '<span class="bigop"><span class="op">' + p.html + "</span><span class=\"lims\">" +
          (p.limSup ? '<span class="lsup">' + p.limSup + "</span>" : "") +
          (p.limSub ? '<span class="lsub">' + p.limSub + "</span>" : "") + "</span></span>";
      }
      return p.html + (p.sup ? "<sup>" + p.sup + "</sup>" : "") + (p.sub ? "<sub>" + p.sub + "</sub>" : "");
    }).join("");
  };

  Tex.prototype.render = function (s) { return new Tex(s).parse(); };

  Tex.prototype.command = function (name) {
    var self = this;
    var wrap = function (html, op) { return { html: html, op: op }; };

    if (GREEK[name]) return wrap('<span class="mi">' + GREEK[name] + "</span>", false);
    if (SYM[name] && !BIGOP[name]) return wrap('<span class="mo">' + SYM[name] + "</span>", false);
    if (BIGOP[name]) return wrap(SYM[name] || esc(name), true);

    switch (name) {
      case "frac": case "dfrac": case "tfrac": {
        var n = this.render(this.arg()), d = this.render(this.arg());
        return wrap('<span class="frac"><span class="num">' + n + '</span><span class="den">' + d + "</span></span>");
      }
      case "sqrt": {
        var inner = this.render(this.arg());
        return wrap('<span class="sqrt"><span class="rad">' + inner + "</span></span>");
      }
      case "bar": case "overline": case "hat": case "widehat": case "vec": case "dot": case "ddot": case "tilde": case "underline": {
        var b = this.render(this.arg());
        return wrap('<span class="acc ' + name + '">' + b + "</span>");
      }
      case "text": case "textrm": case "mathrm": case "operatorname": case "mbox": {
        return wrap('<span class="mtext">' + esc(this.arg()) + "</span>");
      }
      case "textbf": case "mathbf": case "bm": {
        return wrap('<span class="mtext mbf">' + esc(this.arg()) + "</span>");
      }
      case "textit": case "mathit": case "mathcal": case "mathbb": case "mathsf": {
        return wrap('<span class="mtext mit">' + esc(this.arg()) + "</span>");
      }
      case "left": case "right": case "big": case "Big": case "bigg": case "Bigg":
      case "displaystyle": case "textstyle": case "limits": case "nolimits": case "quad": case "qquad": {
        if (name === "quad") return wrap("\u2003");
        if (name === "qquad") return wrap("\u2003\u2003");
        if (name === "left" || name === "right") {
          this.skipSpace();
          var d = this.s[this.i];
          if (d === "\\") { this.i++; var dn = this.s[this.i++]; return wrap('<span class="delim">' + esc(dn) + "</span>"); }
          if (d === ".") { this.i++; return wrap(""); }
          this.i++;
          return wrap('<span class="delim">' + esc(d) + "</span>");
        }
        return null;
      }
      case "begin": return this.env();
      case "end": return wrap("");
      case " ": case ",": return wrap("\u2009");
      case ";": case ":": return wrap("\u2005");
      case "!": return wrap("");
      case "%": return wrap("%");
      case "&": return wrap("&amp;");
      case "#": return wrap("#");
      case "$": return wrap("$");
      case "{": return wrap("{");
      case "}": return wrap("}");
      case "_": return wrap("_");
      case "\\": return wrap("<br>");
      case "|": return wrap("‖");
      default: return wrap('<span class="mtext">' + esc(name) + "</span>");
    }
  };

  /* 环境：矩阵 / 分段函数 */
  Tex.prototype.env = function () {
    var env = this.arg();
    var endTag = "\\end{" + env + "}";
    var idx = this.s.indexOf(endTag, this.i);
    var body = idx >= 0 ? this.s.slice(this.i, idx) : this.s.slice(this.i);
    this.i = idx >= 0 ? idx + endTag.length : this.s.length;

    var rows = body.split("\\\\").map(function (r) { return r.trim(); }).filter(function (r) { return r.length; });
    var delimL = env === "bmatrix" ? "[" : env === "vmatrix" ? "|" : env === "cases" ? "{" : "(";
    var delimR = env === "bmatrix" ? "]" : env === "vmatrix" ? "|" : env === "cases" ? "" : ")";
    var cls = env === "cases" ? "mat cases" : "mat";

    var html = '<span class="mat-wrap"><span class="mat-delim">' + esc(delimL) + "</span>" +
      '<span class="' + cls + '">' +
      rows.map(function (r) {
        return '<span class="mat-row">' + r.split("&").map(function (c) {
          return '<span class="mat-cell">' + new Tex(c.trim()).parse() + "</span>";
        }).join("") + "</span>";
      }).join("") +
      "</span>" + (delimR ? '<span class="mat-delim">' + esc(delimR) + "</span>" : "") + "</span>";
    return { html: html, op: false };
  };

  /* ---------- Markdown 解析 ---------- */
  var mathStore = [];

  function stashMath(html) { mathStore.push(html); return "\u0000" + (mathStore.length - 1) + "\u0000"; }

  function inline(s) {
    // 1. 行内公式先入仓（避免被 markdown 语法误伤）
    s = s.replace(/\$([^$\n]+?)\$/g, function (_, e) { return stashMath('<span class="math-inline">' + new Tex(e).parse() + "</span>"); });
    s = s.replace(/\\\((.+?)\\\)/g, function (_, e) { return stashMath('<span class="math-inline">' + new Tex(e).parse() + "</span>"); });

    // 2. 代码跨行内代码
    s = s.replace(/`([^`]+)`/g, function (_, c) { return stashMath("<code>" + esc(c) + "</code>"); });

    // 3. 转义
    s = esc(s);

    // 4. 行内标记
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    s = s.replace(/==([^=]+)==/g, '<mark class="mk">$1</mark>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, t, h) {
      var href = /^(#|https?:\/\/|mailto:)/.test(h) ? h : "#";
      return '<a href="' + href + '" class="md-link">' + t + "</a>";
    });
    s = s.replace(/\[\^(\d+)\]/g, '<sup class="fnref">[$1]</sup>');

    // 5. 还原
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return mathStore[+i] || ""; });
    return s;
  }

  function render(src) {
    mathStore = [];
    var lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      var t = line.trim();

      if (!t) { i++; continue; }

      // 围栏代码
      if (/^```/.test(t)) {
        var lang = t.slice(3).trim(), buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
        i++;
        out.push('<div class="md-code"' + (lang ? ' data-lang="' + esc(lang) + '"' : "") + "><pre><code>" + esc(buf.join("\n")) + "</code></pre></div>");
        continue;
      }

      // 独立公式 $$ ... $$
      if (t === "$$" || /^\$\$/.test(t)) {
        var body = t === "$$" ? [] : [t.replace(/^\$\$/, "")];
        i++;
        while (i < lines.length && !/\$\$$/.test(lines[i])) { body.push(lines[i]); i++; }
        if (i < lines.length) { body.push(lines[i].replace(/\$\$$/, "")); i++; }
        out.push('<div class="math-block">' + new Tex(body.join(" ")).parse() + "</div>");
        continue;
      }

      // 表格
      if (/\|/.test(t) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        var head = splitRow(t);
        i += 2;
        var rows = [];
        while (i < lines.length && /\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        out.push('<table class="md-table"><thead><tr>' + head.map(function (h) { return "<th>" + inline(h) + "</th>"; }).join("") +
          "</tr></thead><tbody>" + rows.map(function (r) {
            return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
          }).join("") + "</tbody></table>");
        continue;
      }

      // 标题
      var h = t.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push("<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"); i++; continue; }

      // 分隔线
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { out.push('<hr class="md-hr">'); i++; continue; }

      // 引用
      if (/^>\s?/.test(t)) {
        var qb = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) { qb.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
        out.push("<blockquote>" + render(qb.join("\n")) + "</blockquote>");
        continue;
      }

      // 列表（含任务清单）
      if (/^([-*+]|\d+\.)\s+/.test(t)) {
        var ordered = /^\d+\./.test(t);
        var items = [];
        while (i < lines.length && /^([-*+]|\d+\.)\s+/.test(lines[i].trim())) {
          var raw = lines[i].trim().replace(/^([-*+]|\d+\.)\s+/, "");
          items.push(raw); i++;
        }
        out.push("<" + (ordered ? "ol" : "ul") + ' class="md-list">' + items.map(function (it) {
          var task = it.match(/^\[( |x|X)\]\s*(.*)$/);
          if (task) {
            var on = task[1].toLowerCase() === "x";
            return '<li class="md-task' + (on ? " on" : "") + '"><span class="md-box">' + (on ? "✓" : "") + "</span>" + inline(task[2]) + "</li>";
          }
          return "<li>" + inline(it) + "</li>";
        }).join("") + "</" + (ordered ? "ol" : "ul") + ">");
        continue;
      }

      // 段落
      var para = [t];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|```|\$\$|([-*+]|\d+\.)\s)/.test(lines[i].trim()) && !/\|/.test(lines[i])) {
        para.push(lines[i].trim()); i++;
      }
      /* 段内软换行：必须**先 inline 再拼 <br>**。
         反过来（先拼 <br> 再 inline）会让 inline 的转义步骤把 <br> 变成
         &lt;br&gt; 直接印在正文里 —— 曾经所有多行段落都这样漏出标签。 */
      out.push("<p>" + para.map(function (l) { return inline(l); }).join("<br>") + "</p>");
    }

    return out.join("\n");
  }

  function splitRow(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
  }

  function plain(src) {
    return String(src || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\$\$[\s\S]*?\$\$/g, " ")
      .replace(/\$[^$\n]*\$/g, " ")
      .replace(/[#>*`_~\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  window.MD = { render: render, inline: inline, tex: function (s) { return new Tex(s).parse(); }, plain: plain, esc: esc };
})();
