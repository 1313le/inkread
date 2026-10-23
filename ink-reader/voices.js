/* ============================================================
   voices.js · 墨读 InkRead 音色系统
   职责：音色注册表 / 主题×音色配对 / 安装态 / 当前音色 / 声线挑选 / 合成地址
   —— 与 fonts.js 同构，自包含、不依赖 app.js，须在 api.js 之前引入。

   v11 重构：目录换成 Microsoft Edge TTS 神经语音（ink-reader/voices-data.js，
   32 款：普通话 / 东北·陕西方言 / 美音 / 英音 / 日语）。
   朗读与试听走同一条链路：本地服务 /api/tts → Edge 神经合成 → MP3。

   为什么必须换（用户反馈「名字不同听着一样」「英文男声出女声」「全是冰冷机器音」）：
     ① 上一版目录取自 Mossland Studio 公开库，那些样音是「上传者自己的录音」，
        只能用来试听；真正朗读任意正文时仍退回本机 Web Speech —— Windows 上
        中文系统声线只有两三条，于是 24 款音色听着完全一样，且都是机械音。
     ② 本版是神经 TTS：同一款音色朗读与试听一致，任意文本都自然有起伏。
     ③ 本机声线仅作为「离线兜底」保留（断网时仍能出声），挑选逻辑仍是
        「语言池 → 关键词 → 性别」三级，绝不跨语言乱配。
   ============================================================ */
(function () {
  "use strict";

  /* ------------------------------------------------------------
     0. 本机声线挑选（离线兜底；api.js 与本页试听共用同一套逻辑）
     ------------------------------------------------------------ */
  var MALE = ["david", "mark", "kangkang", "yunyang", "yunxi", "yunjian", "yunfeng",
    "zhiwei", "guy", "daniel", "alex", "george", "james", "ryan", "liam", "fred",
    "male", "man", "男"];
  var FEMALE = ["zira", "aria", "jenny", "samantha", "michelle", "huihui", "yaoyao",
    "xiaoxiao", "xiaoyi", "tingting", "xiaomeng", "meijia", "lili",
    "female", "woman", "女"];

  /* 声线名里的性别判定 —— 必须整词命中，不能用子串。
     「female」里嵌着「male」、「alexandra」里嵌着「alex」、「woman」里嵌着「man」：
     子串判定会把女声认成男声。这不是理论风险，Google 系声线的正式名就叫
     “Google UK English Female / Male”，Windows 上真有 “Alexandra”。
     判不出性别的名字返回 ""，交给上层当「未标性别」的中性兜底 —— 
     宁可不知道，也不能知道错。 */
  function sexOf(hay) {
    hay = String(hay || "").toLowerCase();
    /* 拉丁按词切，CJK 按字切（关键词里的「男」「女」是单字） */
    var toks = hay.match(/[a-z0-9]+|[^\x00-\xff]/g) || [];
    function whole(keys) {
      for (var j = 0; j < toks.length; j++) {
        for (var i = 0; i < keys.length; i++) if (toks[j] === String(keys[i]).toLowerCase()) return j;
      }
      return -1;
    }
    var mi = whole(MALE), fi = whole(FEMALE);
    if (mi < 0 && fi < 0) return "";
    if (mi < 0) return "f";
    if (fi < 0) return "m";
    return mi <= fi ? "m" : "f";      /* 极少见：名字里两种性别词都有，按先出现的那个判 */
  }
  /* 文本语言：假名 > 汉字 > 拉丁 —— 日文含汉字，必须先判假名 */
  function langOf(text) {
    var s = String(text || "");
    if (/[\u3040-\u30ff]/.test(s)) return "ja";
    if (/[\u4e00-\u9fff]/.test(s)) return "zh";
    return "en";
  }
  function langPool(list, want) {
    var p = want === "en" ? "en" : want === "ja" ? "ja" : "zh";
    var same = list.filter(function (x) { return String(x.lang || "").toLowerCase().indexOf(p) === 0; });
    if (same.length) return same;
    /* 日文无日文声线时退中文（汉字可读）；英文绝不退中文 —— 那正是「男声变女声」的病根 */
    if (p === "ja") return list.filter(function (x) { return /^zh/i.test(x.lang || ""); });
    return [];
  }
  /* 神经端点的实测行为（v2.23 取证，非推测）：非中日韩音色拿到「一个拉丁字母都没有」的正文时，
     服务端不报错，直接回 0 字节空音频。于是 32 款目录里的 17 款英文音色在中文书上「静静失败」，
     界面只能写成「神经合成未响应」—— 读者以为是服务器挂了，其实是选了念不出中文的音色。
     中英混排是能念的（实测 16KB），所以判据只看「这段有没有该音色能发的音素」，
     不看语言标签是否严格相等：宁可按实测边界判，不按下拉框里的名字判。 */
  function canSpeak(v, text) {
    var s = String(text || "");
    if (!s.trim()) return false;
    /* 多语种音色（名字里带 Multilingual）一款能念几十种语言 —— 别按它挂靠的 locale 拦死。
       实测（真打 /api/tts）：en-US-AndrewMultilingualNeural 念 中/日/韩/法/德/西/俄/意/葡 全部有声，
       而普通音色喂外语只回 0 字节。 */
    if (/Multilingual/i.test(String((v && v.id) || ""))) return true;
    var fam = String((v && v.lang) || (v && v.id) || "").toLowerCase().slice(0, 2);
    if (fam === "zh" || fam === "ja" || fam === "ko") return true;   /* 汉字／假名都念得出，中英混排实测有声 */
    return /[A-Za-z]/.test(s);                                        /* 其余音色没有拉丁字母就只剩静音 */
  }
  /* 给一段「当前音色念不出」的正文找一位念得出来的人：
     ① 多语种音色（一款能念几十种语言，正是为这种场面造的）→ ② 同语言的音色；
     性别尽量跟着原音色（找不到就退回不挑性别）；已装的优先 —— 用户装过谁就先用谁。
     段落语言换回来时无需回切：朗读引擎每一段都重算这一次，选定的音色天然接着生效。 */
  function pickForText(text, v) {
    var lang = langOf(text);
    var pool = (VOICES || []).filter(function (x) { return x.edge && x.id; });
    var inst = installed();
    function best(list) {
      var cands = list.filter(function (x) { return x.k !== (v && v.k); });
      if (!cands.length) return null;
      var on = cands.filter(function (x) { return inst.indexOf(x.k) >= 0; });
      var use = on.length ? on : cands;
      var g = (v && v.gender) || "";
      var byG = use.filter(function (x) { return !g || x.gender === g; });
      return byG[0] || use[0];
    }
    return best(pool.filter(function (x) { return /Multilingual/i.test(x.id); }))
        || best(pool.filter(function (x) { return x.lang === lang && !/Multilingual/i.test(x.id); }));
  }
  /* 兜底声线按「正文语言」挑，不按所选音色的语言 ——
     读的是中文书、手上却选了款英文音色时，要的是「能把这段念出来的人」，
     不是「和那款音色同语言、同样念不出的人」。试听路径两者等价（样文本就是该语言写的），
     所以这条只改朗读侧的行为。 */
  function wantLang(v, text) {
    var s = String(text || "");
    if (/[A-Za-z\u3040-\u30ff\u4e00-\u9fff]/.test(s)) return langOf(s);
    return (v && v.lang) || "en";        /* 整段一个字母/汉字都没有（纯数字标点）→ 回落到音色自己的语言 */
  }
  /* 挑声线：返回 {voice, exact}。exact=false 表示本机没有该语言的声线 */
  function pickSys(v, text, voices) {
    var list = voices || (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
    if (!list.length) return { voice: null, exact: false };
    var want = wantLang(v, text);
    var pool = langPool(list, want);
    if (!pool.length) {
      /* 本机没有目标语言的声线：只允许「同为拉丁语系」的兜底，绝不拿中文声线硬念英文 */
      if (want === "en") pool = list.filter(function (x) { return /^[a-z]{2}(-|$)/i.test(x.lang || "") && !/^zh|^ja|^ko/i.test(x.lang || ""); });
      if (!pool.length) return { voice: null, exact: false };
    }
    var exact = pool.some(function (x) { return String(x.lang || "").toLowerCase().indexOf(want) === 0; });
    /* 口音优先：英式音色别落到美式声线上（v.accent = british / american） */
    if (v && v.accent) {
      var ac = v.accent === "british" ? /gb|uk/i : v.accent === "american" ? /us/i : null;
      if (ac) {
        var byAcc = pool.filter(function (x) { return ac.test(String(x.lang || "")); });
        if (byAcc.length) pool = byAcc.concat(pool.filter(function (x) { return byAcc.indexOf(x) < 0; }));
      }
    }
    if (v && v.sys && v.sys.length) {
      for (var i = 0; i < v.sys.length; i++) {
        var w = String(v.sys[i]).toLowerCase();
        for (var j = 0; j < pool.length; j++) {
          var nm = String(pool[j].name || "").toLowerCase();
          var id = String(pool[j].voiceURI || "").toLowerCase();
          if (nm.indexOf(w) >= 0 || id.indexOf(w) >= 0) return { voice: pool[j], exact: exact };
        }
      }
    }
    var want = (v && v.gender === "m") ? "m" : "f";
    var bySex = [], unlabeled = [];
    pool.forEach(function (x) {
      var s = sexOf(String(x.name || "") + " " + String(x.voiceURI || ""));
      if (s === want) bySex.push(x);
      else if (!s) unlabeled.push(x);
    });
    /* 性别绝不跨：宁可返回 null 让上层如实说「本机没有这款性别的声线」，
       也不拿标了另一性别的声音顶上去 —— 旧版这里的 pool[0] 兜底，
       正是用户反馈「男声念成女声」的直接来源。没标性别的声线不算跨。 */
    return { voice: bySex[0] || unlabeled[0] || null, exact: exact };
  }
  /* 候选声线序列：主选 + 同池同性别的其它声线 + 未标性别的（主选哑火时挨个试）。
     明确标了另一性别的声线一律不进候选 —— 跨性别不是「兜底」，是「读错了」。 */
  function candidates(v, text, voices) {
    var list = voices || (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
    var out = [];
    function push(x) { if (x && out.indexOf(x) < 0) out.push(x); }
    var pool = langPool(list, wantLang(v, text));
    var want = (v && v.gender === "m") ? "m" : "f";
    var bySex = [], unlabeled = [];
    pool.forEach(function (x) {
      var s = sexOf(String(x.name || "") + " " + String(x.voiceURI || ""));
      if (s === want) bySex.push(x);
      else if (!s) unlabeled.push(x);
    });
    push(pickSys(v, text, list).voice);
    bySex.forEach(push);
    unlabeled.forEach(push);
    return out;
  }

  /* ------------------------------------------------------------
     1. 音色目录 —— Edge TTS 神经语音（voices-data.js 为内置目录）
     ------------------------------------------------------------ */
  var DEMO = {
    zh: "墨读，让每一页都值得慢慢读。",
    en: "InkRead — make every page worth reading slowly.",
    ja: "墨読、すべてのページをゆっくり味わう。"
  };

  var AGE_MAP = { juvenile: "少年", teen: "少年", child: "少年", adult: "青年", young: "青年", middle_aged: "中年", middle: "中年", senior: "老年", old: "老年" };
  function normLang(x) {
    var s = String(x || "").toLowerCase();
    if (s.indexOf("ja") === 0) return "ja";
    if (s.indexOf("en") === 0) return "en";
    return "zh";
  }
  function normGender(x) {
    var s = String(x || "").toLowerCase().trim();
    /* 短码（内置目录用 m/f）与全称（云端返回 male/female）都要认 ——
       只认全称会把 "m" 全判成女声，朗读时男声挑到女声线。 */
    if (/^(m|male|man|男|男声)$/.test(s)) return "m";
    if (/^(f|female|woman|女|女声)$/.test(s)) return "f";
    if (/女/.test(s) && !/男/.test(s)) return "f";
    if (/男/.test(s) && !/女/.test(s)) return "m";
    return /female|woman/.test(s) ? "f" : "m";
  }
  function sceneList(x) {
    var vt = x.voice_tags || [];
    var out = vt.filter(function (t) { return t.taxonomy_key === "scene"; })
      .map(function (t) { return t.label_zh || t.label || ""; });
    if (!out.length && x.scene) out = [x.scene];
    return out.filter(Boolean);
  }
  /* 口音：从 locale 推，供本机声线兜底时对齐英音/美音 */
  function accentOf(locale) {
    var s = String(locale || "");
    if (/-GB$/i.test(s)) return "british";
    if (/-US$/i.test(s)) return "american";
    return "";
  }

  /* 语速 / 音高（本机声线兜底的倍数）：从气质标签与年龄推出来 */
  function feelOf(tags, age) {
    var t = (tags || []).join(" ");
    var rate = 1, pitch = 1;
    if (/轻快|活泼|明快|动感|搞笑|少年感|童声/.test(t)) { rate = 1.14; pitch = 1.12; }
    if (/温润|温柔|轻缓|甜美|治愈|自然|亲和/.test(t)) { rate = 0.94; pitch = 1.06; }
    if (/沉稳|磁性|低磁|克制|专业|权威|厚重|冷静/.test(t)) { rate = 0.9; pitch = 0.84; }
    if (/浑厚|激昂|有力/.test(t)) { rate = 0.92; pitch = 0.8; }
    if (age === "少年") { pitch = Math.min(1.5, pitch + 0.12); rate += 0.06; }
    if (age === "老年") { pitch = Math.max(0.4, pitch - 0.14); rate -= 0.1; }
    return { rate: Math.round(rate * 100) / 100, pitch: Math.round(pitch * 100) / 100 };
  }
  /* 本机声线关键词：按语言 + 性别 + 口音给一组名字线索 */
  function sysOf(lang, gender, accent) {
    if (lang === "en") {
      var en = accent === "british" ? ["George", "Ryan", "Daniel", "Sonia", "Libby"]
        : ["David", "Mark", "Guy", "Zira", "Aria", "Jenny", "Samantha"];
      return gender === "m" ? en.filter(function (x) { return !/Sonia|Libby|Zira|Aria|Jenny|Samantha/.test(x); })
        : en.filter(function (x) { return /Sonia|Libby|Zira|Aria|Jenny|Samantha/.test(x); });
    }
    if (lang === "ja") return gender === "m" ? ["Ichiro", "Keita", "Kangkang"] : ["Ayumi", "Haruka", "Nanami", "Huihui"];
    return gender === "m" ? ["Kangkang", "Yunyang", "Yunxi", "Yunjian"] : ["Huihui", "Xiaoxiao", "Yaoyao", "Xiaoyi"];
  }

  /* 一条原始记录（内置目录 / 云端返回）→ 目录条目 */
  function shape(x) {
    if (!x) return null;
    var id = x.id || x.voice_id || x.k;
    if (!id) return null;
    var locale = x.locale || x.language || "";
    var name = x.name || x.voice_name || "未命名音色";
    var lang = normLang(x.lang || locale);
    var gender = normGender(x.gender || x.gender_raw);
    var age = x.age || AGE_MAP[String(x.age_range || "").toLowerCase()] || "青年";
    var tags = (x.tags || []).slice(0, 4);
    var scenes = (Array.isArray(x.scenes) && x.scenes.length) ? x.scenes.slice()
      : (x.scene ? [x.scene] : sceneList(x));
    var accent = x.accent || accentOf(locale);
    var feel = feelOf(tags, age);
    /* 是 Edge 神经音色：必须有 locale（合成要用它当 voice short-name） */
    var edge = !!(x.locale || /Neural$/.test(String(id)));
    return {
      k: (edge ? "edge:" : "cloud:") + id,
      id: id,
      name: name,
      mood: (scenes[0] || "音色") + " · " + (gender === "m" ? "男声" : "女声") + " · " + age,
      d: String(x.d || x.description || "").trim() || "神经语音 · Microsoft Edge TTS",
      lang: lang, gender: gender, age: age,
      accent: accent,
      cat: x.cat || scenes[0] || "音色", scenes: scenes,
      tags: tags,
      /* 本机声线兜底用的倍数 */
      rate: typeof x.rate === "number" ? x.rate : feel.rate,
      pitch: typeof x.pitch === "number" ? x.pitch : feel.pitch,
      /* Edge 合成参数：语速偏移(%) 与音高偏移(Hz) */
      er: x.er || "0%", ep: x.ep || "0Hz",
      edge: edge, locale: locale,
      sys: sysOf(lang, gender, accent),
      demo: x.demo || DEMO[lang] || DEMO.zh,
      /* 配了 Moss 密钥后，云端音色可用 voice_id 走真·云端合成 */
      moss: x.moss != null ? x.moss : (edge ? null : id),
      cloud: !edge,
      use: x.use || x.usage_count || 0
    };
  }

  var VOICES = [], MAP = {};

  function load(list) {
    VOICES = [];
    MAP = {};
    (list || []).forEach(function (x) {
      var v = shape(x);
      if (!v || !v.id) return;
      if (MAP[v.k]) return;
      VOICES.push(v);
      MAP[v.k] = v;
    });
  }
  load(window.INK_VOICE_DATA || []);

  /* 用户自配的 Moss API 拉回来的云音色（叠加在神经音色之上） */
  var K_CLOUD = "inkread.voices.cloud.v1";
  var CLOUD = [];
  function addCloudVoices(list) {
    var raw = (list || []).slice();
    CLOUD = raw.map(shape).filter(Boolean);
    CLOUD.forEach(function (v) { v.cloud = true; if (!MAP[v.k]) { MAP[v.k] = v; VOICES.push(v); } });
    try { localStorage.setItem(K_CLOUD, JSON.stringify(raw)); } catch (e) {}
    return CLOUD;
  }
  (function () {
    try {
      var raw = JSON.parse(localStorage.getItem(K_CLOUD) || "null");
      if (Array.isArray(raw) && raw.length) {
        CLOUD = raw.map(shape).filter(Boolean);
        CLOUD.forEach(function (v) { v.cloud = true; if (!MAP[v.k]) { MAP[v.k] = v; VOICES.push(v); } });
      }
    } catch (e) {}
  })();

  function allVoices() { return VOICES; }

  /* ------------------------------------------------------------
     本地音色（v1.5-S5c）：用户自机 TTS 服务，清单在 voices-local.js。
     不进 VOICES / MAP —— 它们既不是 Edge 也不是云款，音色商城的「启用 / 设为朗读」
     对它们不成立；只有朗读引擎、多角色面板与试听按需取用。
     meta() 必须认得它们：引擎拿 meta(voiceK) 判「这款是不是本地」（api.js localMeta）。
     ------------------------------------------------------------ */
  function localVoices() {
    try { return (window.InkVoiceLocal && window.InkVoiceLocal.list) ? window.InkVoiceLocal.list() : []; }
    catch (e) { return []; }
  }
  function localMeta(k) {
    var ks = String(k || "");
    if (ks.indexOf("local:") !== 0) return null;
    var all = localVoices();
    for (var i = 0; i < all.length; i++) if (all[i].k === ks) return all[i];
    return null;
  }

  /* ------------------------------------------------------------
     2. 主题 × 音色配对（预装 8 款，按 id 点名 —— 目录换代也不散）
     ------------------------------------------------------------ */
  var ALIAS = {
    qing:  { id: "zh-CN-XiaoxiaoNeural" },   /* 温润女声 */
    yi:    { id: "zh-CN-XiaoyiNeural" },     /* 明快女声 */
    yunxi: { id: "zh-CN-YunxiNeural" },      /* 清朗男声 */
    jian:  { id: "zh-CN-YunjianNeural" },    /* 浑厚男声 */
    yang:  { id: "zh-CN-YunyangNeural" },    /* 播音男声 */
    ava:   { id: "en-US-AvaNeural" },        /* 温暖女声 */
    guy:   { id: "en-US-GuyNeural" },        /* 激昂男声 */
    sonia: { id: "en-GB-SoniaNeural" },      /* 英音优雅女声 */
    /* 全能音色（v2.24.2）：多语种音色一款能念几十种语言（实测 中/日/韩/法/德/西/俄/意/葡 全有声），
       中文书夹英文段、外文原著都用得上 —— 预装一男一女两款，读者在下拉里直接挑得到。
       它们同时也是「所选音色念不出这段」时的自动替身（见 InkVoice.pickForText）。 */
    andrew:   { id: "en-US-AndrewMultilingualNeural" },   /* 多语沉稳男声 */
    avamulti: { id: "en-US-AvaMultilingualNeural" }       /* 多语温暖女声 */
  };
  var AKEY = {};
  Object.keys(ALIAS).forEach(function (a) {
    var t = ALIAS[a];
    var hit = VOICES.filter(function (v) { return v.id === t.id; })[0] || VOICES[0];
    if (hit) AKEY[a] = hit.k;
  });

  var PAIR_SRC = {
    paper: "qing", white: "qing", sepia: "jian", cream: "jian",
    leaf: "yi", bean: "qing", herb: "yi", lilac: "yi",
    night: "yunxi", charcoal: "yang", ember: "yunxi", black: "yunxi",
    contrast: "qing", contrastNight: "yang", bauhaus: "guy", swiss: "qing",
    riso: "guy", brutal: "guy", memphis: "ava", neonwashi: "guy",
    magazine: "qing", cyberink: "yang", nocturne: "sonia", terminal: "yang",
    abyss: "yunxi", vermilion: "jian",
    clay: "ava", sage: "yi", clayNight: "sonia"
  };
  var PAIR = {};
  Object.keys(PAIR_SRC).forEach(function (t) { PAIR[t] = AKEY[PAIR_SRC[t]] || PAIR_SRC[t]; });

  var K_ON = "inkread.voices.on.v1";     /* 已安装音色 */
  var K_CUR = "inkread.voice.v1";        /* 当前音色 */
  var PRELOAD = Object.keys(ALIAS).map(function (a) { return AKEY[a]; }).filter(Boolean);
  /* 去重（兜底可能把几款别名指到同一条） */
  PRELOAD = PRELOAD.filter(function (k, i) { return PRELOAD.indexOf(k) === i; });
  var _on = null;

  function lsGet(k, fb) {
    try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); }
    catch (e) { return fb; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function installed() {
    if (_on) return _on;
    var v = lsGet(K_ON, null);
    var kept = Array.isArray(v) ? v.filter(function (k) { return !!MAP[k]; }) : null;
    /* 目录换代（旧 k 全部失效）→ 回到预装 8 款；用户主动清空（[]）则尊重 */
    if (!kept || (v && v.length && !kept.length)) { _on = PRELOAD.slice(); lsSet(K_ON, _on); return _on; }
    _on = kept;
    return _on;
  }
  function setInstalled(v) { _on = v; lsSet(K_ON, v); return v; }
  function isOn(k) { return installed().indexOf(k) >= 0 || PRELOAD.indexOf(k) >= 0; }
  function install(k) {
    if (!MAP[k]) return installed();
    var v = installed();
    if (v.indexOf(k) < 0) { v.push(k); setInstalled(v); }
    return v;
  }
  function uninstall(k) { return setInstalled(installed().filter(function (x) { return x !== k; })); }

  function current() {
    var k = lsGet(K_CUR, null);
    if (typeof k === "string" && MAP[k] && isOn(k)) return k;
    return PRELOAD[0] || (VOICES[0] && VOICES[0].k) || "";
  }
  function setCurrent(k) {
    if (!MAP[k]) return current();
    install(k);
    lsSet(K_CUR, k);
    return k;
  }

  /* 已安装 + 全部（音色商城两栏共用） */
  function list() {
    var on = installed();
    return allVoices().map(function (v) {
      return { k: v.k, name: v.name, mood: v.mood, d: v.d,
        lang: v.lang, gender: v.gender, age: v.age, accent: v.accent,
        cat: v.cat, scenes: v.scenes, tags: v.tags,
        rate: v.rate, pitch: v.pitch, er: v.er, ep: v.ep,
        edge: v.edge, locale: v.locale, demo: v.demo,
        cloud: !!v.cloud, moss: !!v.moss,
        installed: on.indexOf(v.k) >= 0 || PRELOAD.indexOf(v.k) >= 0 };
    });
  }
  function meta(k) { return MAP[k] || localMeta(k); }
  function pairFor(themeK) { return PAIR[themeK] || PAIR.paper || ""; }
  function pairName(themeK) {
    var k = pairFor(themeK);
    return { k: k, name: MAP[k] ? MAP[k].name : k, mood: MAP[k] ? MAP[k].mood : "" };
  }
  function usedBy(k) {
    return Object.keys(PAIR).filter(function (t) { return PAIR[t] === k; });
  }

  /* ------------------------------------------------------------
     3. 合成地址：/api/tts?voice=…&rate=…&pitch=…&text=…
     本地服务代取（Edge 的 WebSocket 不适合浏览器直连），并做磁盘缓存。
     —— voice 必须是 Edge 的「音色短名」(v.id，如 zh-CN-XiaoxiaoNeural)，
        不是 locale（zh-CN）—— 只有短名才能点到具体那一条声线。
     ------------------------------------------------------------ */
  function ttsUrl(v, text) {
    if (!v || !v.edge || !v.id) return "";
    return "/api/tts?voice=" + encodeURIComponent(v.id) +
      "&rate=" + encodeURIComponent(v.er || "0%") +
      "&pitch=" + encodeURIComponent(v.ep || "0Hz") +
      "&text=" + encodeURIComponent(String(text == null ? "" : text));
  }
  function ttsUrlOf(k, text) { return ttsUrl(MAP[k], text); }

  window.InkVoice = {
    VOICES: VOICES, MAP: MAP, PAIR: PAIR, PRELOAD: PRELOAD, DEMO: DEMO,
    installed: installed, isOn: isOn, install: install, uninstall: uninstall,
    current: current, setCurrent: setCurrent,
    list: list, meta: meta, all: allVoices, local: localVoices,
    pairFor: pairFor, pairName: pairName, usedBy: usedBy,
    /* 声线挑选：api.js 与试听共用 */
    langOf: langOf, pickSys: pickSys, candidates: candidates, sexOf: sexOf, canSpeak: canSpeak,
    pickForText: pickForText,
    /* 神经合成地址 */
    ttsUrl: ttsUrl, ttsUrlOf: ttsUrlOf,
    /* 云音色（Moss） */
    addCloudVoices: addCloudVoices, cloud: function () { return CLOUD; }
  };
})();
