/* ============================================================
   md.js · 墨读自研排版引擎（零依赖、离线可用）
   Markdown：标题（ATX + setext）/粗斜/删除线/高亮/链接/自动链接/图片/脚注
   (定义+锚点回链)/emoji 短代码/嵌套列表/任务清单/表格/引用/围栏与缩进代码，
   另支持 LaTeX 数学（行内 $..$ / 独立 $$..$$）与代码语法高亮。

   v2.15 换的是「容错」而不是「引擎」：导入型阅读器的源文由别人（AI / Word 导出 /
   网页复制）产生，畸形表格是常态而非例外 —— GFM 明文「The table is broken at the
   first empty line」，规范上确实不算表格，可用户不管规范，显示不出来就是本软件的失败。
   详见《墨读InkRead-v2.15-Markdown语法库补全方案.md》。
   ============================================================ */

(function () {
  var esc = function (s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  /* ---------- 导入源容错 · 行归一层 ----------
     render() 与 parseBlocks() 是两条并行分支（一条出 HTML、一条出块 JSON），
     容错若各自实现必然走偏；放在共用的行数组入口，一次归一两条链路同时受益。 */

  /* 全角竖线「｜」与制表横线族「─ ═ ┃」→ ASCII。中文文档从排版工具导出时高发。 */
  function toAsciiTable(s) {
    return s.replace(/[\uFF5C\u2502\u2503]/g, "|")
      .replace(/[\u2500-\u250B\u254C-\u257F]/g, "-")
      .replace(/\uFF1A/g, ":")
      .replace(/\uFF1D/g, "=");
  }
  function cellCount(t) {
    return t.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").length;
  }
  /* 分隔行：| --- | :--: | —— 必须含竖线（单列的 --- 是分隔线，不是表格）。
     等号串「| === |」规范上不算表格，但 Word / 表格工具导出常见 —— 收。 */
  function isDelimLine(s) {
    var t = String(s).trim();
    if (!t || t.indexOf("|") < 0) return false;
    if (!/[-=]/.test(t)) return false;
    return /^[\s|:=-]+$/.test(t);
  }
  /* 分隔片段：被硬折行的分隔行残段（可能整段都没有竖线） */
  function isDelimFrag(s) {
    var t = String(s).trim();
    return !!t && /^[\s|:=-]+$/.test(t) && /[-=]/.test(t);
  }
  function isPipeRow(s) {
    var t = String(s).trim();
    if (!t || isDelimLine(t) || t.indexOf("|") < 0) return false;
    return cellCount(t) >= 2;
  }

  function normPipeLines(lines) {
    return lines.map(function (l) {
      var t = l.trim();
      if (!t) return l;
      /* 整行只由表格构造字符组成，且确实含待替换字符 → 换 ASCII。
         双重限定是为了不碰正文：中文句子里的全角冒号不该被改写。 */
      if (/^[\s|:=\-\uFF5C\u2500-\u257F\uFF1A\uFF1D]+$/.test(t) && /[\u2500-\u257F\uFF5C\uFF1A\uFF1D]/.test(t)) return toAsciiTable(l);
      /* 正文行里有 ≥2 个全角竖线且没有 ASCII 竖线：判定为用全角画的表格行 */
      if (l.indexOf("|") < 0 && (l.match(/\uFF5C/g) || []).length >= 2) return l.replace(/\uFF5C/g, "|");
      return l;
    });
  }
  /* 把折成两三行的分隔行缝回一行。只缝「紧跟在管道行之后的」片段 ——
     否则相邻的两条 --- 分隔线会被误并成一条。 */
  function stitchDelimLines(lines) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var cur = lines[i], prev = out.length ? out[out.length - 1] : "";
      if (out.length > 1 && isDelimFrag(cur) && isDelimFrag(prev) && prev.trim() && isPipeRow(out[out.length - 2])) {
        out[out.length - 1] = prev + cur;
        continue;
      }
      out.push(cur);
    }
    return out;
  }
  /* 松散表格：表头 / 分隔行 / 数据行之间夹了空行 —— 压回紧凑形态。
     安全阀：区间内每一非空行都得是管道行或分隔行，表头必须存在，长度封顶 200。 */
  function tightenLooseTables(lines) {
    var res = lines.slice();
    for (var d = 0; d < res.length; d++) {
      if (!isDelimLine(res[d])) continue;
      if (d > 0 && isPipeRow(res[d - 1])) continue;
      var h = d - 1;
      while (h >= 0 && !res[h].trim()) h--;
      if (h < 0 || !isPipeRow(res[h])) continue;
      var k = d + 1, last = d;
      while (k < res.length) {
        if (!res[k].trim()) { k++; continue; }
        if (isPipeRow(res[k]) || isDelimLine(res[k])) { last = k; k++; continue; }
        break;
      }
      if (last - h > 200) continue;
      var kept = [];
      for (var m = h; m <= last; m++) if (res[m].trim()) kept.push(res[m]);
      res.splice.apply(res, [h, last - h + 1].concat(kept));
      d = h + kept.length;
    }
    return res;
  }
  function normalizeLines(src) {
    var lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
    return tightenLooseTables(stitchDelimLines(normPipeLines(lines)));
  }

  /* 围栏闭合行：整行只有同种围栏字符且不短于开启长度（CommonMark §4.5）。 */
  function isFenceClose(line, mark, len) {
    var t = String(line).trim();
    if (t.length < len) return false;
    for (var k = 0; k < t.length; k++) if (t.charAt(k) !== mark) return false;
    return true;
  }
  /* 分隔线：--- *** ___ 及其空格变体（- - -）。`==` 与 `--` 不在这里判，
     它们要先给 setext 标题做过一遍才轮到分隔线。 */
  var HR_RE = /^(?:-\s*){3,}$|^(?:\*\s*){3,}$|^(?:_\s*){3,}$/;

  /* 段落何时收摊：空行、下一个块起点、表格表头、setext 下划线、分隔线。
     含竖线的行**只有在下一行是分隔行时**才算表格开头 —— 否则「他说 | 她说」
     这种带竖线的散文会被无缘无故拆段。
     setext 与分隔线的区分靠「前面有没有段落」，所以这里只管停下，不负责定性。 */
  function paraBreak(line, next) {
    var t = String(line).trim();
    if (!t) return true;
    if (/^(#{1,6}\s|>|```|~~~|\$\$|([-*+]|\d+[.)])\s|\[\^)/.test(t)) return true;
    if (/\|/.test(t) && isDelimLine(next == null ? "" : next)) return true;
    if (/^=+$/.test(t) || /^-{2,}$/.test(t)) return true;
    return HR_RE.test(t);
  }

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

  /* ---------- Emoji 短代码（gemoji 通用命名，:smile: → 😄） ----------
     覆盖高频表情 / 手势 / 自然 / 食物 / 出行 / 物件等 ~150 款；未登记的
     :name: 原样保留，不会误伤「比例 3:2」「时间 12:30」这类正文冒号。 */
  var EMOJI = {
    smile: "😄", smiley: "😃", grinning: "😀", grin: "😁", laughing: "😆", joy: "😂",
    rofl: "🤣", sweat_smile: "😅", upside_down: "🙃", wink: "😉", blush: "😊",
    innocent: "😇", slightly_smiling_face: "🙂", yum: "😋", relieved: "😌",
    heart_eyes: "😍", kissing_heart: "😘", kissing: "😗", stuck_out_tongue: "😛",
    stuck_out_tongue_winking_eye: "😜", zany_face: "🤪", raised_eyebrow: "🤨",
    neutral_face: "😐", expressionless: "😑", no_mouth: "😶", smirk: "😏",
    unamused: "😒", roll_eyes: "🙄", grimacing: "😬", pensive: "😔",
    confused: "😕", worried: "😟", slightly_frowning_face: "🙁", frowning: "😦",
    persevere: "😣", confounded: "😖", tired_face: "😫", weary: "😩",
    pleading_face: "🥺", cry: "😢", sob: "😭", angry: "😠", rage: "😡",
    triumphant: "😤", sleepy: "😪", sleeping: "😴", mask: "😷",
    cold_sweat: "😰", dizzy_face: "😵", exploding_head: "🤯", cowboy_hat_face: "🤠",
    partying_face: "🥳", sunglasses: "😎", nerd_face: "🤓", face_with_monocle: "🧐",
    thinking: "🤔", shushing_face: "🤫", face_with_hand_over_mouth: "🤭",
    scream: "😱", flushed: "😳", zipper_mouth_face: "🤐", nauseated_face: "🤢",
    face_vomiting: "🤮", ghost: "👻", skull: "💀",
    alien: "👽", space_invader: "👾", robot: "🤖", jack_o_lantern: "🎃",
    clown_face: "🤡", poop: "💩", zzz: "💤", baby: "👶", angel: "👼",
    thumbsup: "👍", "+1": "👍", thumbsdown: "👎", "-1": "👎", ok_hand: "👌",
    punch: "👊", fist: "✊", wave: "👋", clap: "👏", raised_hands: "🙌",
    pray: "🙏", handshake: "🤝", muscle: "💪", point_up: "☝️", point_right: "👉",
    point_left: "👈", point_down: "👇", eyes: "👀", brain: "🧠", ear: "👂",
    heart: "❤️", yellow_heart: "💛", green_heart: "💚", blue_heart: "💙",
    purple_heart: "💜", black_heart: "🖤", broken_heart: "💔",
    sparkling_heart: "💖", two_hearts: "💕", heartpulse: "💗", gift_heart: "💝",
    love_letter: "💌", kiss: "💋", wedding: "💒", sunny: "☀️", cloud: "☁️",
    umbrella: "☔", snowflake: "❄️", zap: "⚡", fire: "🔥", rainbow: "🌈",
    star: "⭐", star2: "🌟", sparkles: "✨", boom: "💥", comet: "💫",
    crescent_moon: "🌙", sun_with_face: "🌞", full_moon_with_face: "🌝",
    earth_asia: "🌏", globe_with_meridians: "🌐", dog: "🐶", cat: "🐱",
    mouse: "🐭", hamster: "🐹", rabbit: "🐰", fox_face: "🦊", bear: "🐻",
    panda_face: "🐼", koala: "🐨", tiger: "🐯", lion_face: "🦁", cow: "🐮",
    pig: "🐷", frog: "🐸", monkey_face: "🐵", see_no_evil: "🙈",
    hear_no_evil: "🙉", speak_no_evil: "🙊", chicken: "🐔", penguin: "🐧",
    bird: "🐦", baby_chick: "🐤", wolf: "🐺", horse: "🐴", bee: "🐝",
    bug: "🐛", butterfly: "🦋", snail: "🐌", beetle: "🐞", ant: "🐜",
    spider: "🕷️", scorpion: "🦂", crab: "🦀", snake: "🐍", turtle: "🐢",
    tropical_fish: "🐠", fish: "🐟", dolphin: "🐬", whale: "🐳", octopus: "🐙",
    shell: "🐚", seedling: "🌱", herb: "🌿", four_leaf_clover: "🍀",
    maple_leaf: "🍁", fallen_leaf: "🍂", leaves: "🍃", cherry_blossom: "🌸",
    rose: "🌹", hibiscus: "🌺", sunflower: "🌻", tulip: "🌷", bouquet: "💐",
    palm_tree: "🌴", cactus: "🌵", ear_of_rice: "🌾", mushroom: "🍄",
    chestnut: "🌰", apple: "🍎", green_apple: "🍏", pear: "🍐",
    tangerine: "🍊", lemon: "🍋", banana: "🍌", watermelon: "🍉",
    grapes: "🍇", strawberry: "🍓", cherries: "🍒", peach: "🍑",
    mango: "🥭", pineapple: "🍍", coconut: "🥥", kiwi_fruit: "🥝",
    tomato: "🍅", eggplant: "🍆", avocado: "🥑", carrot: "🥕", corn: "🌽",
    hot_pepper: "🌶️", bread: "🍞", croissant: "🥐", cheese: "🧀", egg: "🥚",
    fried_egg: "🍳", bacon: "🥓", pancake: "🥞", poultry_leg: "🍗",
    meat_on_bone: "🍖", hotdog: "🌭", hamburger: "🍔", fries: "🍟",
    pizza: "🍕", sandwich: "🥪", taco: "🌮", spaghetti: "🍝", ramen: "🍜",
    stew: "🍲", curry: "🍛", sushi: "🍣", bento: "🍱", rice: "🍚",
    rice_ball: "🍙", shrimp: "🦐", icecream: "🍦", ice_cream: "🍧",
    doughnut: "🍩", cookie: "🍪", birthday: "🎂", cake: "🍰",
    chocolate_bar: "🍫", candy: "🍬", lollipop: "🍭", custard: "🍮",
    honey_pot: "🍯", coffee: "☕", tea: "🍵", beer: "🍺", beers: "🍻",
    wine_glass: "🍷", cocktail: "🍸", tropical_drink: "🍹", milk_glass: "🥛",
    sake: "🍶", champagne: "🍾", gift: "🎁", balloon: "🎈", tada: "🎉",
    confetti_ball: "🎊", christmas_tree: "🎄", santa: "🎅", firecracker: "🧨",
    lantern: "🏮", red_envelope: "🧧", calendar: "📅", date: "📅",
    alarm_clock: "⏰", hourglass: "⌛", watch: "⌚", book: "📖",
    open_book: "📖", books: "📚", notebook: "📓", ledger: "📒",
    page_facing_up: "📄", newspaper: "📰", bookmark: "🔖", label: "🏷️",
    pencil: "✏️", pen: "🖊️", memo: "📝", clipboard: "📋", pushpin: "📌",
    paperclip: "📎", locked: "🔒", unlocked: "🔓", key: "🔑", hammer: "🔨",
    wrench: "🔧", gear: "⚙️", link: "🔗", bulb: "💡", mag: "🔍",
    mag_right: "🔎", flashlight: "🔦", candle: "🕯️", house: "🏠",
    house_with_garden: "🏡", office: "🏢", school: "🏫", hospital: "🏥",
    bank: "🏦", hotel: "🏨", church: "⛪", castle: "🏰", tent: "⛺",
    rocket: "🚀", airplane: "✈️", car: "🚗", taxi: "🚕", bus: "🚌",
    train: "🚃", railway_car: "🚃", bullettrain_front: "🚅", subway: "🚇",
    ship: "🚢", sailboat: "⛵", bike: "🚲", scooter: "🛴",
    traffic_light: "🚥", mount_fuji: "🗻", camping: "🏕️", beach: "🏖️",
    island: "🏝️", mountain: "🏔️", volcano: "🌋", desert: "🏜️",
    city_sunset: "🌆", night: "🌃", milky_way: "🌌", tokyo_tower: "🗼",
    statue_of_liberty: "🗽", school_satchel: "🎒", graduation_cap: "🎓",
    medal: "🏅", trophy: "🏆", soccer: "⚽", basketball: "🏀",
    football: "🏈", baseball: "⚾", tennis: "🎾", volleyball: "🏐",
    rugby_football: "🏉", "8ball": "🎱", ping_pong: "🏓", badminton: "🏸",
    dart: "🎯", game_die: "🎲", slot_machine: "🎰", bowling: "🎳",
    video_game: "🎮", musical_note: "🎵", notes: "🎶", guitar: "🎸",
    violin: "🎻", drum: "🥁", microphone: "🎤", headphones: "🎧",
    radio: "📻", saxophone: "🎷", trumpet: "🎺", piano: "🎹",
    iphone: "📱", telephone: "☎️", fax: "📠", battery: "🔋",
    computer: "💻", desktop_computer: "🖥️", printer: "🖨️", keyboard: "⌨️",
    floppy_disk: "💾", cd: "💿", dvd: "📀", camera: "📷",
    video_camera: "📹", movie_camera: "🎥", tv: "📺", clock1: "🕐",
    moneybag: "💰", dollar: "💵", yen: "💴", euro: "💶", pound: "💷",
    credit_card: "💳", gem: "💎", balance_scale: "⚖️", bomb: "💣",
    knife: "🔪", pill: "💊", syringe: "💉", microbe: "🦠", dna: "🧬",
    microscope: "🔬", telescope: "🔭", satellite_antenna: "📡",
    droplet: "💧", sweat_drops: "💦", dash: "💨", hole: "🕳️",
    bell: "🔔", no_bell: "🔕", mega: "📣", loudspeaker: "📢",
    speech_balloon: "💬", thought_balloon: "💭", checkered_flag: "🏁",
    white_check_mark: "✅", heavy_check_mark: "✔️", x: "❌", o: "⭕",
    question: "❓", exclamation: "❗", warning: "⚠️", no_entry: "⛔",
    recycling: "♻️", infinity: "♾️", hundred: "💯"
  };

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

  /* 占位仓：把「不能再被语法碰」的片段（公式 / 行内代码 / emoji / 图片 / 转义字）
     换成 \u0000N\u0000，inline() 末尾统一还原。所有保护都走这一条道。 */
  function stash(html) { mathStore.push(html); return "\u0000" + (mathStore.length - 1) + "\u0000"; }

  /* 行内代码跨度（CommonMark §6.4）：定界长度须长于内容里最长的反引号串，
     所以 ``a`b`` 是合法的；两侧各有一个空格时剥掉一个。 */
  function codeSpans(s) {
    var out = "", i = 0, n = s.length;
    while (i < n) {
      if (s.charAt(i) !== "`") { out += s.charAt(i++); continue; }
      var len = 0; while (s.charAt(i + len) === "`") len++;
      var j = i + len, close = -1;
      while (j < n) {
        if (s.charAt(j) === "`") {
          var m = 0; while (s.charAt(j + m) === "`") m++;
          if (m === len) { close = j; break; }
          j += m;
        } else j++;
      }
      if (close < 0) { out += s.substr(i, len); i += len; continue; }
      var body = s.slice(i + len, close);
      if (body.length > 1 && body.charAt(0) === " " && body.charAt(body.length - 1) === " ") body = body.slice(1, -1);
      out += stash("<code>" + esc(body) + "</code>");
      i = close + len;
    }
    return out;
  }

  /* 脚注定义表：render() 开头从正文收集 [^label]: 文本；inline() 查它决定
     引用是否带锚点回链。内层 render（引文递归）不得清空它。 */
  var fnDefs = {};

  function inline(s) {
    // 1. 行内公式先入仓（避免被 markdown 语法误伤）
    s = s.replace(/\$([^$\n]+?)\$/g, function (_, e) { return stash('<span class="math-inline">' + new Tex(e).parse() + "</span>"); });
    s = s.replace(/\\\((.+?)\\\)/g, function (_, e) { return stash('<span class="math-inline">' + new Tex(e).parse() + "</span>"); });

    // 2. 行内代码（多反引号定界）
    s = codeSpans(s);

    // 2.5 反斜杠转义（CommonMark §5.1）：ASCII 标点前加 \ 取字面义。
    //     必须排在公式与代码之后（这两处转义不生效）、其余一切标记之前 ——
    //     否则 \*星号\* 会被斜体规则吃掉，转义符反而触发了语法。
    s = s.replace(/\\([\\`*_{}\[\]()#+\-.!>~|=:])/g, function (_, c) { return stash(c); });

    // 3. emoji 短代码 :smile: 入仓——占位符不参与后续任何替换，
    //    也就不会误伤链接 href、代码块里的冒号（时间 12:30 这类
    //    未登记的名字原样保留）。
    s = s.replace(/:([a-z0-9_+-]{1,40}):/gi, function (all, n) {
      var e = EMOJI[n.toLowerCase()];
      return e ? stash(e) : all;
    });

    // 4. 图片 ![alt](src)：先于一切文本标记入仓（alt 里的 *、_ 不能被
    //    加粗斜体误伤）。图源仅放行 http(s) / data:image；本地相对路径
    //    在阅读器里取不到，降级为 alt 文本而不是裂图。
    s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)/g, function (_, alt, src) {
      if (!/^(https?:\/\/|data:image\/)/i.test(src)) return alt;
      return stash('<img class="md-img" src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy" referrerpolicy="no-referrer">');
    });

    // 5. 转义
    s = esc(s);

    // 6. 行内标记
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    s = s.replace(/==([^=]+)==/g, '<mark class="mk">$1</mark>');
    /* 链接：目标取第一个空白之前的部分 —— 尾随的 "title" 与折行残留的空格
       一并丢掉，否则 href 会带着 &quot;title&quot; 变成点不动的死链。
       站外链接补 target/rel：Electron 里没有它会在当前窗口跳走。 */
    s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)/g, function (_, t, h) {
      if (/^#/.test(h)) return '<a href="' + h + '" class="md-link">' + t + "</a>";
      if (!/^(?:https?:\/\/|mailto:)/i.test(h)) return '<a href="#" class="md-link">' + t + "</a>";
      return '<a href="' + h + '" class="md-link" target="_blank" rel="noopener noreferrer">' + t + "</a>";
    });

    // 7. 自动链接：<https://…> 形式（转义后呈 &lt;…&gt;）；
    //    再扫裸 URL。放在 markdown 链接之后：此时生成的 href 前面是
    //    引号，不在裸链起始字符之列，不会被二次命中。
    s = s.replace(/&lt;((?:https?:\/\/|mailto:)[^\s<>]+?)&gt;/g, function (_, u) {
      return '<a href="' + u + '" class="md-link" target="_blank" rel="noopener noreferrer">' + u + "</a>";
    });
    /* 裸链主体限定可打印 ASCII（除括号）：中文、全角标点天然截断，
       尾随的英文句读剥还给正文。 */
    s = s.replace(/(^|[\s(（【「])(https?:\/\/[!-'*-~]+)/g, function (all, pre, u) {
      var tail = "";
      u = u.replace(/[.,;:!?]+$/, function (tp) { tail = tp; return ""; });
      if (!/^https?:\/\/.+$/.test(u)) return all;
      return pre + '<a href="' + u + '" class="md-link" target="_blank" rel="noopener noreferrer">' + u + "</a>" + tail;
    });

    // 8. 脚注引用 [^label]：有定义的挂锚点（点击跳文末），无定义的照旧展示
    s = s.replace(/\[\^([^\]\s]+)\]/g, function (_, lb) {
      if (fnDefs[lb] != null) {
        return '<sup class="fnref"><a class="md-fnref" id="fnref-' + esc(lb) + '" href="#fn-' + esc(lb) + '">[' + lb + "]</a></sup>";
      }
      return '<sup class="fnref">[' + lb + "]</sup>";
    });

    // 9. 还原
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return mathStore[+i] || ""; });
    return s;
  }

  /* ---------- 表格构件 ---------- */
  function splitRow(line) {
    var s = String(line).trim().replace(/\\\|/g, "\u0001");   // 保护单元格里的转义竖线
    s = s.replace(/^\|/, "").replace(/\|$/, "");
    return s.split("|").map(function (c) { return c.replace(/\u0001/g, "|").trim(); });
  }
  /* 分隔行的冒号 → 对齐：:--- 左、---: 右、:---: 中（GFM §4.10） */
  function splitAlign(line) {
    return splitRow(line).map(function (c) {
      var l = c.charAt(0) === ":", r = c.charAt(c.length - 1) === ":" && c.length > 1;
      return l && r ? "c" : r ? "r" : l ? "l" : "";
    });
  }
  function tableHTML(head, rows, align) {
    var n = head.length;
    function cell(tag, txt, j) {
      var a = align && align[j];
      return "<" + tag + (a ? ' class="al-' + a + '"' : "") + ">" + inline(txt) + "</" + tag + ">";
    }
    var body = rows.map(function (r) {
      var x = r.slice(0, n);
      while (x.length < n) x.push("");           // 列数不足补空格子（GFM 口径）
      return "<tr>" + x.map(function (c, j) { return cell("td", c, j); }).join("") + "</tr>";
    }).join("");
    return '<div class="md-tablebox"><table class="md-table"><thead><tr>' +
      head.map(function (h, j) { return cell("th", h, j); }).join("") +
      "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  /* ---------- 代码语法高亮（自研，零依赖，离线） ----------
     不引 highlight.js：它自带配色，与 29 套主题天然打架，common 集还要 vendor ~300KB。
     这里只吐语义 class，颜色一律从主题 token 派生 —— 换主题即刻跟色。 */
  var KW = {
    js: "async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof interface let new of return set static super switch this throw try typeof var void while with yield true false null undefined",
    ts: "abstract as asserts bigint declare enum implements infer is keyof namespace never readonly satisfies type keyof typeof var void public private protected override optional",
    java: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws transient try var void volatile while record sealed permits yield true false null",
    c: "auto break case char _Complex const continue default do double else enum extern float for goto inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Bool true false NULL",
    cpp: "bool catch class constexpr delete dynamic_cast explicit friend mutable namespace new nullptr operator private protected public reinterpret_cast static_assert template this throw true try typeid typename using virtual override final false",
    go: "chan defer fallthrough func map package range select struct type nil iota make new len cap append close copy delete panic recover",
    rust: "as crate dyn else enum extern false fn impl in let match mod move mut pub ref return self static struct super trait true type unsafe use where while",
    python: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise try while with yield True False None self cls lambda",
    sql: "select from where insert into values update set delete create table drop alter add column primary key foreign references index view join inner left right full outer cross on group by having order asc desc limit offset distinct union all case when then else end count sum avg min max coalesce cast and or not null like in between exists as",
    bash: "if then else elif fi for while until do done case esac function return break continue export local readonly declare unset shift exec eval echo printf read source alias cd set trap sudo apt npm npx node git curl",
    powershell: "function param return if else elseif foreach for while do switch break continue try catch finally begin process end trap in true false null",
    css: "important media supports keyframes import charset font-face page property scope layer container",
    misc: "true false null yes no on off nil none"
  };
  var LANGCFG = {
    js: { lc: ["//"], bc: ["/*", "*/"], sq: ['"', "'", "`"], kw: KW.js + " " + KW.ts },
    java: { lc: ["//"], bc: ["/*", "*/"], sq: ['"', "'"], kw: KW.java },
    c: { lc: ["//"], bc: ["/*", "*/"], sq: ['"', "'"], kw: KW.c },
    cpp: { lc: ["//"], bc: ["/*", "*/"], sq: ['"', "'"], kw: KW.c + " " + KW.cpp },
    go: { lc: ["//"], bc: ["/*", "*/"], sq: ['"', "`"], kw: KW.go + " " + KW.c },
    rust: { lc: ["//"], bc: ["/*", "*/"], sq: ['"', "'"], kw: KW.rust },
    python: { lc: ["#"], sq: ['"', "'"], kw: KW.python },
    json: { sq: ['"'], kw: "true false null" },
    sql: { lc: ["--"], bc: ["/*", "*/"], sq: ["'", '"'], kw: KW.sql, ci: true },
    bash: { lc: ["#"], sq: ['"', "'"], kw: KW.bash },
    powershell: { lc: ["#"], bc: ["<#", "#>"], sq: ['"', "'"], kw: KW.powershell, ci: true },
    css: { bc: ["/*", "*/"], sq: ['"', "'"], kw: KW.css, at: 1, sel: 1, prop: 1 },
    yaml: { lc: ["#"], sq: ['"', "'"], kw: KW.misc, prop: 1 },
    ini: { lc: [";", "#"], sq: ['"', "'"], kw: KW.misc, prop: 1, sect: 1 },
    html: { tag: 1 },
    xml: { tag: 1 },
    diff: { diff: 1 },
    any: { lc: ["//", "#"], bc: ["/*", "*/"], sq: ['"', "'", "`"], kw: KW.misc }
  };
  var ALIAS = {
    javascript: "js", jsx: "js", mjs: "js", cjs: "js", node: "js", typescript: "ts", tsx: "js",
    "c++": "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", h: "c", objc: "c",
    py: "python", python3: "python", rb: "any", php: "any", swift: "java", kotlin: "java", scala: "java",
    sh: "bash", shell: "bash", zsh: "bash", console: "bash", bat: "bash", cmd: "bash",
    ps: "powershell", ps1: "powershell", pwsh: "powershell",
    yml: "yaml", toml: "ini", conf: "ini", cfg: "ini", properties: "ini", dotenv: "ini",
    htm: "html", vue: "html", svg: "xml", xsl: "xml", plist: "xml",
    scss: "css", less: "css", stylus: "css",
    postgres: "sql", mysql: "sql", sqlite: "sql", plsql: "sql", tsql: "sql", udsql: "sql",
    "c#": "java", cs: "java", dockerfile: "bash", makefile: "bash", cmake: "bash",
    text: "", txt: "", plain: "", code: "", md: "", markdown: ""
  };

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function strAlt(q) {
    var e = escRe(q);
    return e + "(?:\\\\.|[^" + e + "\\\\" + (q === "`" ? "" : "\n") + "])*" + e;
  }
  function tk(cls, txt) { return '<span class="' + cls + '">' + esc(txt) + "</span>"; }

  function hlGeneric(code, cfg) {
    var parts = [], cls = [];
    function add(c, re) { parts.push("(" + re + ")"); cls.push(c); }
    if (cfg.bc) add("tk-com", escRe(cfg.bc[0]) + "[\\s\\S]*?" + escRe(cfg.bc[1]));
    if (cfg.lc) add("tk-com", "(?:" + cfg.lc.map(escRe).join("|") + ")[^\\n]*");
    if (cfg.sq) add("tk-str", cfg.sq.map(strAlt).join("|"));
    if (cfg.at) add("tk-kw", "@[A-Za-z][\\w-]*");
    if (cfg.sel) add("tk-fn", "[.#][A-Za-z][\\w-]*");
    if (cfg.sect) add("tk-fn", "^\\[[^\\]\\n]*\\]");
    if (cfg.prop) add("tk-attr", "^[ \\t]*[\\w.$\\[\\]-]+(?=\\s*[:=])");
    add("tk-num", "\\b\\d[\\w.]*\\b");
    add("tk-id", "[A-Za-z_$][\\w$]*");
    add("tk-op", "[+\\-*/%=<>!&|^~?:]+");
    var RE = new RegExp(parts.join("|"), "gm");
    var set = {}, kc = (cfg.kw || "").split(/\s+/);
    for (var q = 0; q < kc.length; q++) if (kc[q]) set[cfg.ci ? kc[q].toLowerCase() : kc[q]] = 1;
    var out = "", last = 0, m;
    while ((m = RE.exec(code))) {
      if (m[0] === "") { RE.lastIndex++; continue; }
      out += esc(code.slice(last, m.index));
      var g = 0; while (g < cls.length && m[g + 1] == null) g++;
      var t = m[0], c = cls[g];
      if (c === "tk-id") {
        var probe = cfg.ci ? t.toLowerCase() : t;
        if (set[probe]) c = "tk-kw";
        else if (code.charAt(RE.lastIndex) === "(") c = "tk-fn";
        else c = "";
      }
      out += c ? tk(c, t) : esc(t);
      last = RE.lastIndex;
    }
    return out + esc(code.slice(last));
  }

  /* HTML / XML：标签名、属性名、字符串、注释四类，够读又不会跟主题打架 */
  function hlTag(code) {
    var out = "", i = 0, n = code.length;
    while (i < n) {
      if (code.charAt(i) !== "<") {
        var nx = code.indexOf("<", i); nx = nx < 0 ? n : nx;
        out += esc(code.slice(i, nx)); i = nx; continue;
      }
      if (code.substr(i, 4) === "<!--") {
        var e = code.indexOf("-->", i); e = e < 0 ? n : e + 3;
        out += tk("tk-com", code.slice(i, e)); i = e; continue;
      }
      var g = code.indexOf(">", i); g = g < 0 ? n : g + 1;
      out += hlTagInner(code.slice(i, g)); i = g;
    }
    return out;
  }
  function hlTagInner(seg) {
    var m = seg.match(/^<\/?[A-Za-z_][\w:.-]*/);
    var out = m ? tk("tk-tag", m[0]) : "", i = m ? m[0].length : 0;
    while (i < seg.length) {
      var ch = seg.charAt(i);
      if (ch === '"' || ch === "'") {
        var j = seg.indexOf(ch, i + 1); j = j < 0 ? seg.length : j + 1;
        out += tk("tk-str", seg.slice(i, j)); i = j; continue;
      }
      if (/[A-Za-z_:]/.test(ch)) {
        var k = i; while (k < seg.length && /[\w:.-]/.test(seg.charAt(k))) k++;
        var w = seg.slice(i, k);
        out += tk(/^\s*=/.test(seg.slice(k)) ? "tk-attr" : "tk-fn", w); i = k; continue;
      }
      if (ch === "/" || ch === ">") { out += tk("tk-tag", ch); i++; continue; }
      out += esc(ch); i++;
    }
    return out;
  }
  function hlDiff(code) {
    return code.split("\n").map(function (l) {
      var a = l.charAt(0);
      var c = /^(\+\+\+|---)/.test(l) ? "tk-op" : a === "+" ? "tk-str" : a === "-" ? "tk-com"
        : a === "@" ? "tk-kw" : "";
      return c ? tk(c, l) : esc(l);
    }).join("\n");
  }
  function hl(code, lang) {
    var key = lang ? (ALIAS.hasOwnProperty(lang) ? ALIAS[lang] : lang) : "";
    var cfg = LANGCFG[key] || LANGCFG.any;
    if (cfg.diff) return hlDiff(code);
    if (cfg.tag) return hlTag(code);
    return hlGeneric(code, cfg);
  }

  /* 代码块外壳：语言条 + 复制钮 + 行号槽 + 横向可滚的正文。
     行号单独一列而不是逐行 span —— 块注释会跨行，逐行切会把高亮切断。 */
  function codeHTML(text, lang) {
    var body = String(text == null ? "" : text).replace(/^\n/, "").replace(/\n$/, "");
    var n = body.split("\n").length, gut = "";
    for (var i = 1; i <= n; i++) gut += (i > 1 ? "<br>" : "") + i;
    return '<div class="md-code"' + (lang ? ' data-lang="' + esc(lang) + '"' : "") + ">" +
      '<div class="md-code-bar"><span class="md-code-lang">' + esc(lang || "code") + "</span>" +
      '<button type="button" class="md-copy" aria-label="复制代码">复制</button></div>' +
      '<div class="md-code-body"><div class="md-gut" aria-hidden="true">' + gut + "</div>" +
      "<pre><code>" + hl(body, lang) + "</code></pre></div></div>";
  }

  /* 复制：事件委托挂在 document 上，一次绑定全站生效（笔记预览 / AI 回答 / 正文都吃这一份） */
  function fallbackCopy(txt) {
    try {
      var ta = document.createElement("textarea");
      ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("click", function (e) {
      var el = e.target;
      if (!el || el.nodeType !== 1 || !el.closest) return;
      var btn = el.closest(".md-copy");
      if (!btn) return;
      var box = btn.closest(".md-code"), code = box && box.querySelector("pre code");
      if (!code) return;
      var txt = code.textContent, done = function (ok) {
        btn.textContent = ok ? "已复制" : "复制失败";
        btn.classList.add("done");
        setTimeout(function () { btn.textContent = "复制"; btn.classList.remove("done"); }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(fallbackCopy(txt)); });
      } else done(fallbackCopy(txt));
    });
  }

  /* 列表块解析（支持嵌套与任务清单）：以首个条目的缩进为基准层，
     更深的缩进递归成子表挂到前一条目内，回到基准层继续收兄弟条目。
     有序/无序按基准层首个标记定性，层内混用则断开成相邻两表。 */
  var LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

  function listBlock(lines, i) {
    var m0 = lines[i].match(LIST_RE);
    var base = m0[1].replace(/\t/g, "  ").length;
    var ordered = /^\d/.test(m0[2]);
    var start = ordered ? parseInt(m0[2], 10) || 1 : 1;
    var items = [];
    while (i < lines.length) {
      var m = lines[i].match(LIST_RE);
      if (!m) break;
      var ind = m[1].replace(/\t/g, "  ").length;
      if (ind < base) break;
      if (ind > base) {
        var sub = listBlock(lines, i);
        if (items.length) items[items.length - 1].sub.push(sub.html);
        i = sub.next;
        continue;
      }
      if (/^\d/.test(m[2]) !== ordered) break;
      items.push({ x: m[3], sub: [] });
      i++;
    }
    var tag = ordered ? "ol" : "ul";
    var html = "<" + tag + (ordered && start !== 1 ? ' start="' + start + '"' : "") + ' class="md-list">' +
      items.map(function (it) {
      var task = it.x.match(/^\[( |x|X)\]\s*(.*)$/);
      var done = task && task[1].toLowerCase() === "x";
      var body = task
        ? '<span class="md-box">' + (done ? "✓" : "") + "</span>" + inline(task[2])
        : inline(it.x);
      return "<li" + (task ? ' class="md-task' + (done ? " on" : "") + '"' : "") + ">" +
        body + it.sub.join("") + "</li>";
    }).join("") + "</" + tag + ">";
    return { html: html, next: i };
  }

  function render(src, inner) {
    mathStore = [];
    if (!inner) fnDefs = {};
    var lines = normalizeLines(src);

    /* 脚注定义先行登记（引用常出现在定义之前）：inline() 要靠它决定
       [^label] 是否挂锚点；定义正文等主循环走到该行再摘出。 */
    lines.forEach(function (l) {
      var f = l.match(/^\s{0,3}\[\^([^\]\s]+)\]:\s/);
      if (f && fnDefs[f[1]] == null) fnDefs[f[1]] = true;
    });

    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      var t = line.trim();

      if (!t) { i++; continue; }

      // 脚注定义 [^label]: 文本 —— 从正文流摘出，文末集中渲染
      var fd = t.match(/^\[\^([^\]\s]+)\]:\s*(.*)$/);
      if (fd) { fnDefs[fd[1]] = fd[2]; i++; continue; }

      // 围栏代码（``` 或 ~~~，闭合须不短于开启）
      var fm = t.match(/^(`{3,}|~{3,})/);
      if (fm) {
        var mark = fm[1].charAt(0), flen = fm[1].length, lang = t.slice(flen).trim(), buf = [];
        i++;
        while (i < lines.length && !isFenceClose(lines[i], mark, flen)) { buf.push(lines[i]); i++; }
        i++;
        out.push(codeHTML(buf.join("\n"), lang));
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

      // 表格：管道行 + 下一行分隔行（GFM §4.10），对齐从分隔行的冒号取
      if (isPipeRow(t) && i + 1 < lines.length && isDelimLine(lines[i + 1])) {
        var thead = splitRow(t), align = splitAlign(lines[i + 1]), trows = [];
        i += 2;
        while (i < lines.length && isPipeRow(lines[i])) { trows.push(splitRow(lines[i])); i++; }
        out.push(tableHTML(thead, trows, align));
        continue;
      }

      // 标题
      var h = t.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push("<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"); i++; continue; }

      // 分隔线
      if (HR_RE.test(t)) { out.push('<hr class="md-hr">'); i++; continue; }

      // 引用
      if (/^>\s?/.test(t)) {
        var qb = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) { qb.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
        out.push("<blockquote>" + render(qb.join("\n"), true) + "</blockquote>");
        continue;
      }

      // 列表（含任务清单、嵌套）
      if (LIST_RE.test(line)) {
        var lb = listBlock(lines, i);
        out.push(lb.html);
        i = lb.next;
        continue;
      }

      // 缩进代码（§4.5）：4 空格 / Tab。必须排在列表之后 —— 列表项解释优先。
      if (/^(?: {4}|\t)/.test(line)) {
        var ic = [];
        while (i < lines.length && /^(?: {4}|\t)/.test(lines[i])) { ic.push(lines[i].replace(/^(?: {4}|\t)/, "")); i++; }
        while (ic.length && !ic[ic.length - 1].trim()) ic.pop();
        out.push(codeHTML(ic.join("\n"), ""));
        continue;
      }

      // 段落（含 setext 标题：段尾跟 === / --- 时整段升格为 h1 / h2）
      var para = [t];
      i++;
      while (i < lines.length && !paraBreak(lines[i], lines[i + 1])) { para.push(lines[i].trim()); i++; }
      var sx = i < lines.length ? lines[i].trim() : "";
      if (/^=+$/.test(sx)) {
        i++;
        out.push("<h1>" + para.map(function (l) { return inline(l); }).join(" ") + "</h1>");
        continue;
      }
      if (/^-{2,}$/.test(sx)) {
        i++;
        out.push("<h2>" + para.map(function (l) { return inline(l); }).join(" ") + "</h2>");
        continue;
      }
      /* 段内软换行：必须**先 inline 再拼 <br>**。
         反过来（先拼 <br> 再 inline）会让 inline 的转义步骤把 <br> 变成
         &lt;br&gt; 直接印在正文里 —— 曾经所有多行段落都这样漏出标签。 */
      out.push("<p>" + para.map(function (l) { return inline(l); }).join("<br>") + "</p>");
    }

    /* 脚注区（只在外层渲染一次）：定义按正文出现顺序编号，
       每条带 ↩ 回链跳回首次引用处。 */
    if (!inner) {
      var ks = Object.keys(fnDefs).filter(function (k) { return typeof fnDefs[k] === "string"; });
      if (ks.length) {
        out.push('<div class="md-fns"><div class="md-fns-t">脚注</div><ol class="md-fns-l">' +
          ks.map(function (k) {
            return '<li id="fn-' + esc(k) + '"><span class="md-fn-x">' + inline(fnDefs[k]) +
              ' <a class="md-fnback" href="#fnref-' + esc(k) + '">↩</a></span></li>';
          }).join("") + "</ol></div>");
      }
    }

    return out.join("\n");
  }

  /* 纯文本化（摘要 / 检索 / 朗读用）：语法剥壳但保内容——
     图片留 alt、链接留文字、脚注引用留编号、emoji 短代码转真表情。
     表格：分隔行整行丢弃，数据行的竖线折成「 · 」—— 否则朗读和搜索里
     会念出「竖线 三横线 竖线」（D12）。 */
  function plain(src) {
    return String(src || "").replace(/\r\n?/g, "\n").split("\n").map(function (l) {
      var t = l.trim();
      if (isDelimLine(t)) return "";
      if (isPipeRow(t)) return splitRow(t).join(" · ");
      return l;
    }).join("\n")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/~~~[\s\S]*?~~~/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<((?:https?:\/\/|mailto:)[^<>\s]+)>/g, "$1")
      .replace(/\$\$[\s\S]*?\$\$/g, " ")
      .replace(/\$[^$\n]*\$/g, " ")
      .replace(/^\s*\[\^([^\]]+)\]:.*$/gm, " ")
      .replace(/\[\^([^\]]+)\]/g, "[$1]")
      .replace(/:([a-z0-9_+-]{1,40}):/gi, function (all, n) { return EMOJI[n.toLowerCase()] || all; })
      .replace(/[#>*`_~\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* ---------- 块结构解析（导入链路用）：把 Markdown 解成 JSON 块数组，
     与 render() 同一套分支口径。阅读器拿到块后正文用 MD.inline 渲染，
     保证导入文档的行内语法（加粗/链接/图片…）不露源码。 */
  function listObj(lines, i) {
    var m0 = lines[i].match(LIST_RE);
    var base = m0[1].replace(/\t/g, "  ").length;
    var ordered = /^\d/.test(m0[2]);
    var start = ordered ? parseInt(m0[2], 10) || 1 : 1;
    var items = [];
    while (i < lines.length) {
      var m = lines[i].match(LIST_RE);
      if (!m) break;
      var ind = m[1].replace(/\t/g, "  ").length;
      if (ind < base) break;
      if (ind > base) {
        var sub = listObj(lines, i);
        if (items.length) items[items.length - 1].sub.push(sub.block);
        i = sub.next;
        continue;
      }
      if (/^\d/.test(m[2]) !== ordered) break;
      var raw = m[3];
      var task = raw.match(/^\[( |x|X)\]\s*(.*)$/);
      items.push(task ? { td: task[2], on: task[1].toLowerCase() === "x", sub: [] } : { x: raw, sub: [] });
      i++;
    }
    var flat = [];
    items.forEach(function (it) {
      if (!it.x && !it.td && !it.sub.length) return;
      if (it.td != null) flat.push(it.sub.length ? { td: it.td, on: it.on, sub: it.sub } : { td: it.td, on: it.on });
      else flat.push(it.sub.length ? { x: it.x, sub: it.sub } : it.x);
    });
    var lblock = { type: ordered ? "olist" : "list", items: flat };
    if (ordered && start !== 1) lblock.start = start;   // 块契约新增字段，旧数据无此字段按 1 处理
    return { block: lblock, next: i };
  }

  function parseBlocks(src) {
    var lines = normalizeLines(src);
    var blocks = [];
    var hn = 0;
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      var t = line.trim();

      if (!t) { i++; continue; }

      /* 脚注定义行：导入链路没有脚注区，按普通段落就地保留 */
      var fd = t.match(/^\[\^([^\]\s]+)\]:\s*(.*)$/);
      if (fd) { blocks.push({ type: "p", x: "[" + fd[1] + "]: " + fd[2] }); i++; continue; }

      var fm = t.match(/^(`{3,}|~{3,})/);
      if (fm) {
        var mark = fm[1].charAt(0), flen = fm[1].length, lang = t.slice(flen).trim(), buf = [];
        i++;
        while (i < lines.length && !isFenceClose(lines[i], mark, flen)) { buf.push(lines[i]); i++; }
        i++;
        blocks.push({ type: "code", lang: lang, x: buf.join("\n") });
        continue;
      }

      if (t === "$$" || /^\$\$/.test(t)) {
        var body = t === "$$" ? [] : [t.replace(/^\$\$/, "")];
        i++;
        while (i < lines.length && !/\$\$$/.test(lines[i])) { body.push(lines[i]); i++; }
        if (i < lines.length) { body.push(lines[i].replace(/\$\$$/, "")); i++; }
        blocks.push({ type: "formula", x: body.join(" ") });
        continue;
      }

      if (isPipeRow(t) && i + 1 < lines.length && isDelimLine(lines[i + 1])) {
        var thead = splitRow(t), align = splitAlign(lines[i + 1]), trows = [];
        i += 2;
        while (i < lines.length && isPipeRow(lines[i])) { trows.push(splitRow(lines[i])); i++; }
        blocks.push({ type: "table", head: thead, rows: trows, align: align });
        continue;
      }

      var h = t.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var lv = Math.min(h[1].length, 3);
        blocks.push({ type: "h" + lv, x: h[2], id: "h-" + (++hn) });
        i++;
        continue;
      }

      if (HR_RE.test(t)) { i++; continue; }

      if (/^>\s?/.test(t)) {
        var qb = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) { qb.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
        blocks.push({ type: "quote", x: qb.join("\n") });
        continue;
      }

      if (LIST_RE.test(line)) {
        var lb = listObj(lines, i);
        blocks.push(lb.block);
        i = lb.next;
        continue;
      }

      if (/^(?: {4}|\t)/.test(line)) {
        var ic = [];
        while (i < lines.length && /^(?: {4}|\t)/.test(lines[i])) { ic.push(lines[i].replace(/^(?: {4}|\t)/, "")); i++; }
        while (ic.length && !ic[ic.length - 1].trim()) ic.pop();
        blocks.push({ type: "code", lang: "", x: ic.join("\n") });
        continue;
      }

      var para = [t];
      i++;
      while (i < lines.length && !paraBreak(lines[i], lines[i + 1])) { para.push(lines[i].trim()); i++; }
      var sx = i < lines.length ? lines[i].trim() : "";
      if (/^=+$/.test(sx)) { i++; blocks.push({ type: "h1", x: para.join("\n"), id: "h-" + (++hn) }); continue; }
      if (/^-{2,}$/.test(sx)) { i++; blocks.push({ type: "h2", x: para.join("\n"), id: "h-" + (++hn) }); continue; }
      blocks.push({ type: "p", x: para.join("\n") });
    }

    return blocks;
  }

  /* ---------- 存量文档救活 ----------
     已导入文档的 blocks 是导入当时算出来的，解析器修好了也不会自动重算。
     书签 / 朗读 / 编辑覆盖层全部按块序号 bi 寻址，所以这里必须**索引保持**：
     表格区间的首块改写为 table 块，其余块改写为空段落占位（mdx 标记），
     渲染侧遇 mdx 出空串 —— 块数与顺序一个都不变。 */
  /* 候选判定：段落块的**每一**非空行都像表格行 —— 才可能被拆散了。
     松散表格在存量数据里常是一行一个 p 块，所以这里不要求块内多行；
     真正的把关在后面的重新解析（必须正好解出一个表格块才改）。
     判定前先过归一层，全角竖线 / 制表横线的存量块同样能救。 */
  function storedTableish(x) {
    var ls = normalizeLines(x), rows = 0, good = 0;
    for (var k = 0; k < ls.length; k++) {
      if (!ls[k].trim()) continue;
      rows++;
      if (isPipeRow(ls[k]) || isDelimLine(ls[k])) good++;
    }
    return rows >= 1 && good === rows;
  }

  function fixStoredTables(blocks) {
    if (!Array.isArray(blocks)) return blocks;
    var out = blocks.slice();
    var i = 0;
    while (i < out.length) {
      var b = out[i];
      if (!b || b.type !== "p" || !storedTableish(b.x)) { i++; continue; }
      var j = i, parts = [];
      while (j < out.length && j - i < 200 && out[j] && out[j].type === "p" && !out[j].mdx && storedTableish(out[j].x)) {
        parts.push(out[j].x); j++;
      }
      var nb = parseBlocks(parts.join("\n"));
      var t1 = nb.filter(function (x) { return x.type === "table"; });
      if (nb.length === 1 && t1.length === 1) {
        out[i] = t1[0];
        for (var k = i + 1; k < j; k++) out[k] = { type: "p", x: "", mdx: 1 };
      }
      i = j;
    }
    return out;
  }

  /* 渲染缓存：AI 页每来一个流式 chunk 就重渲整条消息（ai.html:533/540），
     同一串前缀反复解析是最大的一笔重复开销。按源文本记忆，容量 60 环形淘汰。 */
  var renderCache = new Map();
  function renderCached(src, inner) {
    if (inner) return render(src, true);          // 递归内层不缓存（fnDefs 状态跨调用）
    var key = String(src || "");
    if (renderCache.has(key)) return renderCache.get(key);
    var html = render(key, false);
    if (renderCache.size >= 60) {
      var oldest = renderCache.keys().next().value;
      renderCache.delete(oldest);
    }
    renderCache.set(key, html);
    return html;
  }

  window.MD = {
    render: renderCached, inline: inline, tex: function (s) { return new Tex(s).parse(); },
    plain: plain, esc: esc, blocks: parseBlocks,
    /* code / table 暴露给阅读器：块 JSON 走的是另一条渲染入口，
       外壳与表格构造必须和这里同一份，否则两处口径又会分叉。 */
    code: codeHTML, table: tableHTML, fixTables: fixStoredTables
  };
})();
