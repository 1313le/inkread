/* ============================================================
   api.js · API 桩层（形状即未来真实 API，接入时仅替换实现）
   ============================================================ */

(function () {
  var delay = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var nowHM = function () {
    var d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };

  /* ------------------------------------------------------------
     称呼（本机档案）：单机应用没有账号，但界面确实需要知道「怎么称呼你」。
     原先各处硬填演示人设「林知夏」，切来切去没有任何作用 —— 改成一个可改的
     本机称呼：默认「读者」，在「本机数据」面板里改一次，七页与主脑问候同步。
     键 inkread.profile.v1 走通用导出/恢复（一切以 inkread. 开头的键都算本机数据）。
     ------------------------------------------------------------ */
  var K_PROFILE = "inkread.profile.v1";
  var DEFAULT_NAME = "读者";
  window.InkProfile = {
    name: function () {
      try {
        var v = JSON.parse(localStorage.getItem(K_PROFILE) || "null");
        var n = v && String(v.name || "").trim();
        return n ? n.slice(0, 12) : DEFAULT_NAME;
      } catch (e) { return DEFAULT_NAME; }
    },
    /* 头像取称呼首字；「读者」这类通用称呼用「读」，用户自定义则用其首字 */
    initial: function () { return String(window.InkProfile.name()).slice(0, 1); },
    isDefault: function () { return window.InkProfile.name() === DEFAULT_NAME; },
    set: function (raw) {
      var n = String(raw == null ? "" : raw).trim().slice(0, 12);
      var rec = { name: n, updatedAt: Date.now() };
      try {
        if (n && n !== DEFAULT_NAME) localStorage.setItem(K_PROFILE, JSON.stringify(rec));
        else localStorage.removeItem(K_PROFILE);      /* 改回默认 = 不留键，备份更干净 */
      } catch (e) {
        window.InkLog && InkLog.add("store", "称呼没能存进本机", "在「本机数据」里删掉几本已读完的书或旧封面，再改一次");
        return null;
      }
      return n || DEFAULT_NAME;
    }
  };

/* INK_SCHEMA —— 键级版本轨（v1.1-S6 G5）。只覆盖 localStorage 键；
   会话键见 INK_SESSION_KEYS，两颗靠「不带 inkread. 前缀」躲枚举的哨兵键见 INK_SENTINEL_KEYS。
   sync:false 的八颗＝红线三键 + 同步自身三本内部账 + 本机异常账 + 排算引擎回退档，
   **不得因进了表就接进同步账**：表与 app.js 的 InkSync SKIP 是两份名册，加键要同加两处（#249）。*/
window.INK_SCHEMA = {
  "inkread.ai.cap.v1": { ver: 1, kind: "pref", store: "local", sync: true, label: "模型能力位" },
  "inkread.ai.model.v1": { ver: 1, kind: "private", store: "local", sync: false },
  "inkread.ai.prompts.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "AI 提示词" },
  "inkread.autoread.v1": { ver: 1, kind: "ui", store: "local", sync: true },
  "inkread.brain.seeded.v1": { ver: 1, kind: "derived", store: "local", sync: true },
  "inkread.cards.gone.v1": { ver: 1, kind: "ledger", store: "local", sync: true },
  "inkread.cards.search.v1": { ver: 1, kind: "ui", store: "local", sync: true },
  "inkread.cards.ui.v1": { ver: 1, kind: "ui", store: "local", sync: true },
  "inkread.cards.v1": { ver: 2, kind: "ledger", store: "local", sync: true, label: "闪卡" },
  /* v1.4-S3：角色表多写句级标记（at/via/depth/run/hold/reach）与分配账（assign/merges），
     见 INK_MIGRATIONS 下方那条 ver 1 → 2。 */
  "inkread.cast.v1": { ver: 2, kind: "pref", store: "local", sync: true, label: "多角色角色表" },
  "inkread.checkins.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "打卡" },
  "inkread.contents.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "导入正文" },
  "inkread.covers.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "封面" },
  "inkread.decks.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "卡组" },
  "inkread.docs.edit.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "正文修改" },
  "inkread.errors.v1": { ver: 1, kind: "derived", store: "local", sync: false, label: "本机异常" },
  "inkread.fonts.enabled.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.glossary.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "生词本" },
  "inkread.kindmap.v1": { ver: 1, kind: "pref", store: "local", sync: true, label: "类别映射" },
  "inkread.mdfocus.v1": { ver: 1, kind: "ui", store: "local", sync: true },
  "inkread.mdsplit.v1": { ver: 1, kind: "ui", store: "local", sync: true },
  "inkread.memory.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "主脑记忆" },
  "inkread.milestones.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "里程碑" },
  "inkread.notefs.v1": { ver: 1, kind: "derived", store: "local", sync: true },
  "inkread.noteImPreview.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.notes.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "笔记" },
  "inkread.notewin.v1": { ver: 1, kind: "ui", store: "local", sync: true },
  "inkread.nwmeasure.v1": { ver: 1, kind: "ui", store: "local", sync: true },
  /* v1.4 顶格修复 R3：值里多了 h（悬浮球是否显示）。老备份没写过 h，见下面的迁移。 */
  "inkread.orb.v1": { ver: 2, kind: "ui", store: "local", sync: true },
  "inkread.pad.v1": { ver: 1, kind: "ui", store: "local", sync: true },
  "inkread.panel.v1": { ver: 1, kind: "ui", store: "local", sync: true },
  "inkread.paper.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.profile.v1": { ver: 1, kind: "ledger", store: "local", sync: true },
  "inkread.progress.v1": { ver: 1, kind: "pref", store: "local", sync: true, label: "阅读进度" },
  "inkread.read.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.shelf.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "书架" },
  "inkread.signals.v1": { ver: 1, kind: "ledger", store: "local", sync: true },
  "inkread.speedmap.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.srs.engine.v1": { ver: 1, kind: "pref", store: "local", sync: false },
  "inkread.stats.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "阅读统计" },
  "inkread.syncinit.v1": { ver: 1, kind: "derived", store: "local", sync: false },
  "inkread.synclog.v1": { ver: 1, kind: "derived", store: "local", sync: true, label: "同步日志" },
  "inkread.syncmeta.v1": { ver: 1, kind: "derived", store: "local", sync: false },
  "inkread.syncseen.v1": { ver: 1, kind: "derived", store: "local", sync: false },
  /* v1.4 顶格修复 R1：点字/点空白的分工换过一次（旧版按纸面坐标分带，带子吞了半张版心）。
     这一枚记「这套规矩有没有讲给过这个人」——空=没讲过，told=-toast 过一次，
     seen=他自己已经点出过朗读气泡（不用讲了）。跨设备共用是对的：换台机器不必再教一遍。 */
  "inkread.tapHint.v1": { ver: 1, kind: "ui", store: "local", sync: true },
  "inkread.tasks.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "任务" },
  "inkread.theme.v1": { ver: 1, kind: "pref", store: "local", sync: true, label: "主题", fromKey: "inkread.theme" },
  "inkread.themes.custom.v1": { ver: 1, kind: "ledger", store: "local", sync: true },
  "inkread.themes.installed.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "已装主题" },
  "inkread.toc.v1": { ver: 1, kind: "ledger", store: "local", sync: true, label: "目录" },
  "inkread.tts.speed.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.tts.sysfallback.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.tts.sysvoice.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.tts.v1": { ver: 1, kind: "private", store: "local", sync: false },
  "inkread.tts.vol.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.ttspos.v1": { ver: 1, kind: "private", store: "local", sync: false },
  "inkread.voice.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.voices.cloud.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.voices.on.v1": { ver: 1, kind: "pref", store: "local", sync: true },
  "inkread.wheel.v1": { ver: 1, kind: "ui", store: "local", sync: true },
  "inkread.win.v1": { ver: 1, kind: "ui", store: "local", sync: true },
};

/* 会话键：不入 SCHEMA、不入备份、不入同步；出现在任何一侧即闸红。*/
window.INK_SESSION_KEYS = {
  "inkread.nav.v1": { store: "session", label: "导航" },
  "inkread.boot.v1": { store: "session", label: "启动记录" },
  "inkread.sceneArt": { store: "session", label: "本会话随机画" },
  "inkread.sceneCeremony.v1": { store: "session", label: "开卷仪式" }
};

/* 哨兵键：故意不带 `inkread.` 前缀才躲开全部 keys() 统计/导出/清空/同步。
   进 INK_SCHEMA 或被写进备份 data，即破坏语义 —— 闸反向钉红。*/
window.INK_SENTINEL_KEYS = ["inkread-cleared.v1", "lsprobe.v0"];

  /* ------------------------------------------------------------
     G4 · 本机异常账：只记「用户做了一件什么具体的事、没成、下一步能干什么」。
     cat 三值定死（import / cloud / store），hint 必须是动作而不是安慰。
     记账本身可能因配额失败——那一层再没有别处可记，只能哑掉，这是自指的极限。
     ------------------------------------------------------------ */
  var K_ERR = "inkread.errors.v1", ERR_CAP = 200;
  window.InkLog = {
    all: function () {
      try {
        var l = JSON.parse(localStorage.getItem(K_ERR));
        return Array.isArray(l) ? l.slice(0, ERR_CAP) : [];
      } catch (e) { return []; }
    },
    add: function (cat, msg, hint) {
      try {
        var l = window.InkLog.all();
        l.unshift({ t: Date.now(), cat: cat, msg: String(msg).slice(0, 200), hint: String(hint).slice(0, 200) });
        localStorage.setItem(K_ERR, JSON.stringify(l.slice(0, ERR_CAP)));
      } catch (e) {}
    }
  };

  /* ver 升高时的升键迁移挂载点：INK_MIGRATIONS[键][备份里的旧 ver] = function(旧值){return 新值}。
     主题键改名那类同值搬家走 INK_SCHEMA[k].fromKey，不走这里。 */
  window.INK_MIGRATIONS = {};

  /* ------------------------------------------------------------
     v1.4-S1 · 闪卡排算引擎 SM-2 → FSRS-5（#249）的 ver 1 → 2
     ------------------------------------------------------------
     这条迁移是「原样收下」，不是偷懒：新形状只是往每个条目里多写
     s / d / lapses 三个字段，旧字段一个没删、一个没改语义 ——
     ver 2 的读者完全能读 ver 1 的数据，所以备份恢复不必就地改写。
     为什么不在此处补算 s/d：公式属于 srs.js（调度单一事实源），而
     srs.js 只挂在 cards.html 与 reader.html；若在恢复路径里复述一遍
     公式，就成了注释里那种「改一处需两处同步」的债。补算改由读取侧
     惰性做（srs.js 的 fsSeed：评第一次分的那一刻把老账折算进来），
     到期日始终一分不挪 —— 换内核不该把今天该复习的卡挪走或提前。
     真正需要就地改写的形状变化（删字段、改类型）出现时再回来写实体。
     ------------------------------------------------------------ */
  window.INK_MIGRATIONS["inkread.cards.v1"] = {
    1: function (old) {
      if (!old || typeof old !== "object" || Array.isArray(old)) return;
      return old;
    }
  };
  /* ------------------------------------------------------------
     v1.4 顶格修复 R3 · 悬浮球位置键 inkread.orb.v1 的 ver 1 → 2
     ------------------------------------------------------------
     ver 1 的值是 {x, y}，ver 2 多写一个 h（1 = 用户把球收起来了）。
     老备份里没有 h —— 而读侧把 `d.h === 1` 之外的任何值（含 undefined）
     一律当「显示」，所以 ver 2 的读者原样能吃 ver 1 的账，不必就地补字段。
     这条迁移存在的意义不是改写，是**别让人跳过这一项**：恢复路径遇到
     备份 ver ≠ 当前 ver 且查不到迁移函数时，会 skipped++ 后直接 return，
     于是用户装好新版再恢复旧备份，悬浮球位置会**静默丢失**（toast 只剩一句
     「版本不合跳过 N 项」）。升 ver 不配迁移 = 丢数据，这一条就是那把锁。
     ------------------------------------------------------------ */
  window.INK_MIGRATIONS["inkread.orb.v1"] = {
    1: function (old) {
      if (!old || typeof old !== "object" || Array.isArray(old)) return;
      return old;
    }
  };
  /* ------------------------------------------------------------
     v1.4-S3 · 角色表 inkread.cast.v1 的 ver 1 → 2（#287）
     ------------------------------------------------------------
     ver 2 给角色表多写句级标记（at/via/depth/run/hold/reach）与分配账
     （chain / breaks），旧字段一个没删、语义也没改 —— ver 2 的读者原样
     能吃 ver 1 的账：缺标记的行由 cast.js 的 normalizeCast 在读取侧惰性
     补成 via="legacy"，不批量改写磁盘。这条迁移与 cards.v1 一样是「原样
     收下」；它存在的意义同 orb.v1 —— 恢复路径查不到迁移函数就会把整份
     角色表当「版本不合」静默跳过，升 ver 不配迁移 = 丢数据。
     ------------------------------------------------------------ */
  window.INK_MIGRATIONS["inkread.cast.v1"] = {
    1: function (old) {
      if (!old || typeof old !== "object" || Array.isArray(old)) return;
      return old;
    }
  };
  /* ------------------------------------------------------------
     朗读（TTS）辅助：等声线就绪 / 长文分段 / 逐段朗读 + 无声看门狗 / 无头回退
     —— 声线挑选交给 voices.js 的 InkVoice.candidates（语言池 + 关键词 + 性别
        三级约束，永不跨语言乱配），这里只负责「把候选挨个试过去、哑火就换下一条」。
     ------------------------------------------------------------ */
  /* 系统声线是异步列出来的，首次取常常是空数组 —— 等一次 voiceschanged，超时就放弃 */
  function waitVoices(synth, ms) {
    return new Promise(function (resolve) {
      if ((synth.getVoices() || []).length) { resolve(synth.getVoices()); return; }
      var done = false;
      var fin = function () {
        if (done) return; done = true;
        try { synth.removeEventListener("voiceschanged", on); } catch (e) {}
        resolve(synth.getVoices() || []);
      };
      var on = function () { fin(); };
      try { synth.addEventListener("voiceschanged", on); } catch (e) {}
      setTimeout(fin, ms || 1200);
    });
  }
  /* 整段喂给系统容易被截断或卡死；按句切到 cap 字以内，逐段排队朗读 */
  function chunkText(s, cap) {
    var parts = String(s || "").match(/[^。！？；.!?;]+[。！？；.!?;]?/g) || [];
    var out = [], buf = "";
    parts.forEach(function (sent) {
      if (buf && (buf + sent).length > cap) { out.push(buf); buf = ""; }
      buf += sent;
      while (buf.length > cap) { out.push(buf.slice(0, cap)); buf = buf.slice(cap); }
    });
    if (buf) out.push(buf);
    return out.length ? out : [String(s || "")];
  }
  /* 没有可用声线（无头浏览器 / 精简系统）时的计时模拟：
     进度与停止按钮行为与真声一致，界面不必分叉。 */
  async function simulateSpeech(body, onTick, v) {
    var rate = (v && v.rate) || 1;
    var total = Math.min(12, Math.max(3, Math.round(String(body || "").length / (40 * rate))));
    for (var i = 1; i <= total; i++) { await delay(700 / rate); onTick(i / total); }
    return { code: 0, data: { mode: "sim", voice: "" } };
  }
  /* 全局朗读中止旗标：stopSpeak() 置位，各朗读循环逐句检查后立即收队 */
  var _ttsAbort = false;
  /* 上一轮验证过的好声线（voiceURI），持久化 —— 下次直接命中，不再挨个轮换 */
  var K_SYSVOICE = "inkread.tts.sysvoice.v1";
  function rememberSysVoice(sv) {
    try { localStorage.setItem(K_SYSVOICE, String((sv && (sv.voiceURI || sv.name)) || "")); } catch (e) {}
  }
  /* 候选封顶 4 条、好声线排最前 —— 旧版把整个语言池全排进去，一条哑火
     就挨个试过去，是「读完一段就换下一条音色」无限轮换的温床。 */
  function limitCands(cands) {
    var last = "";
    try { last = localStorage.getItem(K_SYSVOICE) || ""; } catch (e) {}
    if (last && cands.length > 1) {
      for (var g = 1; g < cands.length; g++) {
        if (String(cands[g].voiceURI || cands[g].name || "") === last) {
          cands = [cands[g]].concat(cands.slice(0, g), cands.slice(g + 1));
          break;
        }
      }
    }
    return cands.slice(0, 4);
  }
  /* 念一段。返回 {ok, started}：
     —— 看门狗只管「开口前」：2.5s 内没派 onstart 判为「声线哑火」
        （Windows 桌面声线在 Chromium 里、或语言不匹配的声线，会这样静默失败），
        立刻 cancel 并换下一条候选。一旦开口看门狗立即解除 ——
        旧版从不解除，长句一律被中途掐死判哑火，正是「读完就换声线重读」
        无限轮换的病根。
     —— onend 一律算成功（有的引擎不派 onstart）；onerror 带 interrupted /
        canceled 视为主动停止，不算失败。 */
  function speakOne(synth, U, text, sys, v) {
    return new Promise(function (resolve) {
      var u = new U(text);
      u.voice = sys;
      u.lang = (sys && sys.lang) || (v && v.lang === "en" ? "en-US" : v && v.lang === "ja" ? "ja-JP" : "zh-CN");
      u.rate = Math.max(0.5, Math.min(3, (v && v.rate) || 1));
      u.pitch = Math.max(0.1, Math.min(2, (v && v.pitch) || 1));
      u.volume = ttsVol();
      var done = false, started = false, t = null;
      var fin = function (ok, why) {
        if (done) return; done = true;
        if (t) clearTimeout(t);
        resolve({ ok: ok, started: started, why: why || "" });
      };
      t = setTimeout(function () {
        try { synth.cancel(); } catch (e) {}
        fin(false, "silent");
      }, 2500);
      u.onstart = function () { started = true; if (t) clearTimeout(t); };
      u.onend = function () { fin(true, "end"); };
      u.onerror = function (e) {
        var err = String((e && (e.error || e.elt)) || "");
        fin(/interrupt|cancel|not-allowed/i.test(err), err || "error");
      };
      try { synth.speak(u); } catch (e) { fin(false, "throw"); }
    });
  }
  /* 逐段朗读：
     —— 首句「开口前」哑火才整条声线作废（调用方换下一条候选）；
     —— 中途失败重试一次，再哑就跳过这句继续 —— 一旦出过声，绝不从头重读。 */
  async function speakChunks(synth, U, chunks, sys, v, onTick) {
    for (var i = 0; i < chunks.length; i++) {
      if (_ttsAbort) return { ok: false, started: true, why: "aborted" };
      var r = await speakOne(synth, U, chunks[i], sys, v);
      if (!r.ok && r.why === "aborted") return r;
      if (!r.ok && i === 0 && !r.started) return r;
      if (!r.ok) {
        r = await speakOne(synth, U, chunks[i], sys, v);
        if (!r.ok && !r.started) { onTick((i + 1) / chunks.length); continue; }
      }
      onTick((i + 1) / chunks.length);
    }
    return { ok: true, started: true };
  }

  /* ------------------------------------------------------------
     Moss 云音色（/v1/audio/speech）：音质最好，需在「模型配置」里填 Moss 密钥。
     未配置或调用失败一律返回 null，调用方无缝退回本机声线 —— 绝不因为云不通就哑掉。
     ------------------------------------------------------------ */
  var K_TTS = "inkread.tts.v1";
  var TTS_DEF = { baseUrl: "https://api.mosi.cn/v1", key: "", model: "moss-tts-1.5-flash" };
  function ttsCfg() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(K_TTS)) || {}; } catch (e) { s = {}; }
    var o = {};
    Object.keys(TTS_DEF).forEach(function (k) { o[k] = s[k] == null ? TTS_DEF[k] : s[k]; });
    return o;
  }
  function setTtsCfg(c) {
    var n = Object.assign(ttsCfg(), c || {});
    try { localStorage.setItem(K_TTS, JSON.stringify(n)); } catch (e) {}
    return n;
  }
  var _cloudAudio = null;
  function playAudio(src, onTick) {
    return new Promise(function (resolve) {
      try { if (_cloudAudio) { _cloudAudio.pause(); _cloudAudio = null; } } catch (e) {}
      var a = new Audio(src);
      a.volume = ttsVol();
      _cloudAudio = a;
      var settled = false;
      var fin = function () { if (settled) return; settled = true; if (_cloudAudio === a) _cloudAudio = null; resolve(); };
      a.onended = fin; a.onerror = fin;
      a.ontimeupdate = function () { if (a.duration) onTick(Math.min(1, a.currentTime / a.duration)); };
      try { a.play().catch(fin); } catch (e) { fin(); }
      /* 3s 内既没播起来也没结束 —— 判为拿不到声，交给调用方降级 */
      setTimeout(function () { if (!settled && a.paused) fin(); }, 3000);
    });
  }
  async function cloudSpeak(body, v, onTick, tc) {
    try {
      /* 桌面/本地服务环境下走 /api/mossapi 代理（api.mosi.cn 不开放浏览器 CORS，
         且「JSON 带 URL」的交付也要二次跨域——代理一并代取归一为音频字节）；
         仅 file:// 直开才尝试直连，失败由调用方无缝退回本机声线。 */
      if (location.protocol !== "file:") {
        var rp = await fetch("/api/mossapi/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl: tc.baseUrl, key: tc.key, model: tc.model,
            input: body, voice_id: v.moss
          })
        });
        if (!rp.ok) return null;
        var ctp = rp.headers.get("content-type") || "";
        if (ctp.indexOf("audio/") !== 0) return null;
        var srcp = URL.createObjectURL(await rp.blob());
        await playAudio(srcp, onTick);
        return { code: 0, data: { mode: "cloud", voice: v.name } };
      }
      var res = await fetch(String(tc.baseUrl).replace(/\/+$/, "") + "/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tc.key },
        body: JSON.stringify({
          model: tc.model || "moss-tts-1.5-flash",
          input: body, voice_id: v.moss,
          response_format: "mp3", delivery_method: "url"
        })
      });
      if (!res.ok) return null;
      var ct = res.headers.get("content-type") || "";
      var src;
      if (ct.indexOf("audio/") === 0) src = URL.createObjectURL(await res.blob());
      else {
        var j = await res.json();
        src = j.url || (j.data && j.data.url) || j.audio_url || "";
      }
      if (!src) return null;
      await playAudio(src, onTick);
      return { code: 0, data: { mode: "cloud", voice: v.name } };
    } catch (e) {
      window.InkLog && InkLog.add("cloud", "云端朗读没合成出来，已退回本机声线",
        "在「设置 → 朗读」里核对 Moss 密钥与接口地址；本机声线不受影响");
      return null;
    }
  }

  /* ------------------------------------------------------------
     Edge 神经语音（本地服务 /api/tts）：桌面端与浏览器的主朗读链路。
     —— 同一款音色「朗读」与「试听」完全同源，任意正文都是真·神经语音，
        不再是 Windows 系统那两三条 SAPI 机械音。
     —— 长文按句切到 220 字一段，段间「边播边预取」，听感连续。
     —— 拿不到（离线 / 静态托管无该路由）一律返回 null，无缝退回本机声线。
     ------------------------------------------------------------ */
  /* 代际令牌：每开一轮朗读 /api/tts +1，在飞的旧循环恢复后发现自己不是当前代，
     就自行退出。用布尔量做不到这点——新一轮把标志清回 false 时，旧循环的
     await 还没恢复，恢复后读到的仍是 false，于是两轮抢同一张声卡（叠声）。 */
  var _neuralAudio = null, _neuralGen = 0, _neuralFin = null;
  function stopNeural() {
    _neuralGen++;
    try { if (_neuralAudio) _neuralAudio.pause(); } catch (e) {}
    try { if (_neuralFin) _neuralFin(); } catch (e) {}
    _neuralAudio = null; _neuralFin = null;
  }
  /* 单次合成上限 900 字（服务端 TTS_MAX）；v1.1-S3 D1 后单元已是 ≤250 字的句子，
     这里切到 250：最长句恰好一条 clip，不再为 221~250 字的句子白拆两段各请求一次 */
  function neuralChunks(s) {
    var parts = String(s || "").match(/[^。！？；.!?;]+[。！？；.!?;]?/g) || [];
    var out = [], buf = "";
    parts.forEach(function (sent) {
      if (buf && (buf + sent).length > 250) { out.push(buf); buf = ""; }
      buf += sent;
      while (buf.length > 250) { out.push(buf.slice(0, 250)); buf = buf.slice(250); }
    });
    if (buf) out.push(buf);
    return out.length ? out : [String(s || "")];
  }
  function fetchClip(url) {
    return fetch(url, { cache: "force-cache" })
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) { return b && b.size > 256 ? URL.createObjectURL(b) : null; })
      .catch(function () { return null; });
  }
  function playClip(src) {
    return new Promise(function (resolve) {
      /* 两轮朗读交叠（换页重起队列 / 朗读与试听同时按）时，旧clip还在出声：
         先把上一条真正按停并结掉它的 Promise，绝不两段神经音频叠在一起放。 */
      var prev = _neuralAudio, prevFin = _neuralFin;
      if (prev) { try { prev.pause(); } catch (e) {} }
      if (prevFin) { try { prevFin(); } catch (e) {} }
      var a = new Audio(src);
      a.volume = ttsVol();
      _neuralAudio = a;
      var settled = false, began = false;
      var fin = function () {
        if (settled) return; settled = true;
        if (_neuralAudio === a) _neuralAudio = null;
        if (_neuralFin === fin) _neuralFin = null;
        try { URL.revokeObjectURL(src); } catch (e) {}
        resolve();
      };
      _neuralFin = fin;
      a.onended = fin; a.onerror = fin;
      a.onplay = function () { began = true; };
      try { a.play().catch(fin); } catch (e) { fin(); }
      /* 4s 还没出声（且从未开播）—— 判为拿不到声，结束本段交给上层。
         开播过就不再掐：暂停/缓冲中的正常音频不能被看门狗误杀。 */
      setTimeout(function () { if (!settled && !began && a.paused) fin(); }, 4000);
    });
  }
  async function neuralSpeak(body, v, onTick) {
    if (!v || !v.edge || !window.InkVoice || !InkVoice.ttsUrl) return null;
    var chunks = neuralChunks(body);
    var urls = chunks.map(function (c) { return InkVoice.ttsUrl(v, c); });
    stopNeural();                       /* 上一轮还在放：先收声，再认领本轮代际 */
    var my = _neuralGen;
    /* 先取第一段：拿不到就整体放弃，交给本机声线（不做半截朗读）。
       失败先原地重试一次 —— 上游 429 是零星抖动，隔一秒就过去的事。 */
    var cur = await fetchClip(urls[0]);
    if (!cur) { await delay(900); cur = await fetchClip(urls[0]); }
    if (!cur) return null;
    var next = urls.length > 1 ? fetchClip(urls[1]) : Promise.resolve(null);
    for (var i = 0; i < urls.length; i++) {
      var src = (i === 0) ? cur : await next;
      if (my !== _neuralGen) { try { if (src) URL.revokeObjectURL(src); } catch (e) {} return { code: 0, data: { mode: "neural", voice: v.name } }; }
      next = (i + 2 < urls.length) ? fetchClip(urls[i + 2]) : Promise.resolve(null);
      if (!src) { onTick((i + 1) / urls.length); continue; }  /* 中途一句取声失败只跳过这句，不整体作废 —— 旧版在这里整段放弃、退回系统声线从文章开头重读，正是「读完又换声线再读一遍」的另一根源 */
      await playClip(src);
      onTick((i + 1) / urls.length);
      if (my !== _neuralGen) break;
    }
    return { code: 0, data: { mode: "neural", voice: v.name } };
  }

  /* ------------------------------------------------------------
     听书引擎（v2 · 段落队列）—— reader.html 听书面板的底层。
     调研对齐：起点读书（0.5~3× 语速 / 换音色 / 定时）、@Voice（点击任意段落起读）、
     华为阅读（边听边看：朗读进度驱动阅读页）。引擎只管「按段落播」，视图归页面。
     —— 段落为单位排队，段内按句切块；神经链路边播边预取；语速/换嗓从当前段重合成；
        系统声线兜底沿用「好声线优先、封顶 4 条、出过声绝不从头重读」；
        一条声线在队列里播成功后就锁定（换段不再重新挑声线，避免中途变声）。
     ------------------------------------------------------------ */
  /* 神经链路的语速合成：音色基准 er（如 "+0%"）+ 用户倍速偏移，服务端按 ±N% 接受 */
  function composeRate(erPct, speed) {
    var n = parseInt(String(erPct || "0%").replace(/[^\d+-]/g, ""), 10) || 0;
    var r = Math.round(n + (speed - 1) * 100);
    r = Math.max(-50, Math.min(100, r));
    return (r >= 0 ? "+" : "") + r + "%";
  }
  /* 音高合成：音色自带基准 ep（如 "+6Hz"）+ 角色共用人偏移，服务端按 ±NHz 接受。
     v1.1-S5a A4：cast.js 早就承诺「池子不够用时共用一款、共用者换音高」，但播放层发的
     一直是音色自带的 ep —— 承诺没兑现，两个角色听起来就是同一个人。Edge 的 pitch
     有效区间到 ±100Hz，钳在这里（偏移给歪了会整段 400，退化成没有声）。 */
  function composePitch(epHz, hz) {
    var n = parseInt(String(epHz || "0Hz").replace(/[^\d+-]/g, ""), 10) || 0;
    var p = Math.round(n + (Number(hz) || 0));
    p = Math.max(-100, Math.min(100, p));
    return (p >= 0 ? "+" : "") + p + "Hz";
  }
  /* 断网兜底开关（默认关）：神经合成拿不到声时，是否允许退到本机系统声线。
     默认关 —— 用户要的是「要么神经语音、要么说清为什么没有」，不是悄悄换个机械音。
     真离线（飞机上 / 静态托管没有 /api/tts 路由）时，打开它就能继续听。 */
  var K_SYSFB = "inkread.tts.sysfallback.v1";
  var K_VOL = "inkread.tts.vol.v1";
  /* 朗读音量（0–1，缺省 1）：只留本机、不进同步 —— 音量是这台设备/这副耳机的事。
     神经（Edge）与云声线（Moss）走 Audio.volume，本机声线走 utterance.volume，三路同一真源。 */
  function ttsVol() {
    try {
      var v = parseFloat(localStorage.getItem(K_VOL));
      return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
    } catch (e) { return 1; }
  }
  function ttsVolSet(v) {
    v = Math.max(0, Math.min(1, parseFloat(v)));
    if (!isFinite(v)) v = 1;
    try { localStorage.setItem(K_VOL, String(v)); } catch (e) {}
    return v;
  }
  function sysFallbackOn() { try { return localStorage.getItem(K_SYSFB) === "1"; } catch (e) { return false; } }
/*__ENGINE_SLOT__*/
  function ttsEngine() {
    /* gen = 代际令牌：start / seekIdx / 换速换嗓都会令旧队列的全部 pending
       恢复后 halt(id) 为真而自行退出，杜绝新旧两条队列并行抢声卡的竞态。 */
    var st = { units: [], i: 0, speed: 1, voice: "", dead: true, paused: false, gen: 0,
               stopAt: 0, stopBi: null, sysLock: null, neuralWhy: "" };
    var ev = { onSegment: null, onTick: null, onState: null, onMode: null };
    function emit(name, a, b) { try { if (ev[name]) ev[name](a, b); } catch (e) {} }
    function curVoice() {
      return (window.InkVoice && window.InkVoice.meta(st.voice || window.InkVoice.current())) || null;
    }
    function halt(id) { return st.dead || id !== st.gen; }
    async function waitWhilePaused(id) {
      while (st.paused && !halt(id)) await delay(120);
    }
    async function simSegment(text, id, note) {
      var secs = Math.min(10, Math.max(2, Math.round(String(text || "").length / (60 * st.speed))));
      for (var k = 1; k <= secs; k++) {
        if (halt(id)) return;
        await waitWhilePaused(id);
        if (halt(id)) return;
        await delay(650 / st.speed);
        emit("onTick", (st.i + k / secs) / st.units.length);
      }
      /* note 非空 = 这一轮其实一句声音都没出（计时模拟只为让界面行为一致）：
         带着原因发给上层显示，不能让用户以为「在朗读」而屏幕前一片安静。 */
      emit("onMode", { mode: note ? "none" : "sim", voice: "", note: note || "" });
    }
    async function sysSegment(text, id) {
      var synth = window.speechSynthesis, U = window.SpeechSynthesisUtterance;
      if (!synth || typeof U !== "function") { await simSegment(text, id, "本机没有语音合成接口"); return; }
      var voices = await waitVoices(synth, 1200);
      if (halt(id)) return;
      if (!voices.length) { await simSegment(text, id, "本机未列出任何声线"); return; }
      var v = curVoice();
      /* 语速叠加到系统声线上（神经链路走 rate 参数，这里走 utterance.rate） */
      var vv = v ? Object.assign({}, v, { rate: Math.max(0.5, Math.min(3, ((v.rate) || 1) * st.speed)) }) : { rate: st.speed };
      var cands = st.sysLock ? [st.sysLock]
        : limitCands(window.InkVoice ? window.InkVoice.candidates(vv, text, voices) : []);
      var chunks = chunkText(text, 160);
      for (var c = 0; c < cands.length; c++) {
        if (halt(id)) return;
        try { synth.cancel(); } catch (e) {}
        var r = await speakChunks(synth, U, chunks, cands[c], vv, function (f) {
          emit("onTick", (st.i + f) / st.units.length);
        });
        if (halt(id)) return;
        if (r.why === "aborted") return;
        if (r.ok || r.started) {
          if (r.ok) rememberSysVoice(cands[c]);
          st.sysLock = cands[c];           /* 一条声线播成功就锁定，换段不再重新挑（避免中途变声） */
          emit("onMode", { mode: "speech", voice: cands[c].name || "", note: st.neuralWhy });
          return;
        }
      }
      await simSegment(text, id, cands.length ? "本机声线全部哑火" : "本机没有该语言或性别的声线");
    }
    async function neuralSegment(text, id, u) {
      /* 多角色朗读：单元自带 voiceK 时用它（角色音），否则用用户选的音色（旁白） */
      var v = (u && u.voiceK && window.InkVoice && InkVoice.meta(u.voiceK)) || curVoice();
      st.neuralWhy = "";
      if (!v || !v.edge || !v.id) return false;   /* 这款音色本来就没有神经版本，不算故障 */
      /* 音色念不出这段正文时，端点不报错、直接回 0 字节空音频（实测：英文音色 + 纯中文段落）。
         先在本机判掉：省一次注定为空的往返，更把原因说准 ——
         「这款音色念不出中文」是可以换个音色解决的，「神经合成未响应」会让读者去查网络。 */
      var swappedFrom = "";
      if (window.InkVoice && InkVoice.canSpeak && !InkVoice.canSpeak(v, text)) {
        /* 先找替身：用户选的是「一位朗读者」，不是「一种语言」。
           中文书里夹一段英文、或者随手点了一款日文音色，都该自己找到念得出来的人继续读，
           而不是停下来报错（那是「选了错音色就一直报错」的病根）。
           多语种音色优先 —— 一款能念几十种语言。段落语言切回时天然切回原音色（每段都重算）。 */
        var alt = InkVoice.pickForText ? InkVoice.pickForText(text, v) : null;
        if (!alt) { st.neuralWhy = "这款音色念不出正文语言"; return false; }
        swappedFrom = v.name;
        v = alt;
      }
      var chunks = neuralChunks(text);
      var pHz = composePitch(v.ep, u && u.pitch);
      var url = function (t) {
        return "/api/tts?voice=" + encodeURIComponent(v.id) +
          "&rate=" + encodeURIComponent(composeRate(v.er, st.speed)) +
          "&pitch=" + encodeURIComponent(pHz) +
          "&text=" + encodeURIComponent(String(t == null ? "" : t));
      };
      var urls = chunks.map(url);
      /* 首段取声：原地重试一次（隔 1.2s）。上游 429 是零星抖动
         （服务端已有 4 次退避重试，这里再兜一道），隔一秒就过去的事，
         不该让整段朗读吃亏 —— 旧版在这里置永久 noNeural，一次抖动毁掉整本书。 */
      var first = await fetchClip(urls[0]);
      if (halt(id)) return true;
      if (!first) {
        await delay(1200);
        if (halt(id)) return true;
        first = await fetchClip(urls[0]);
        if (halt(id)) return true;
      }
      if (!first) { st.neuralWhy = "神经合成未响应"; return false; }
      var next = urls.length > 1 ? fetchClip(urls[1]) : Promise.resolve(null);
      for (var i = 0; i < urls.length; i++) {
        var src = i === 0 ? first : await next;
        if (halt(id)) return true;
        await waitWhilePaused(id);
        if (halt(id)) return true;
        next = i + 2 < urls.length ? fetchClip(urls[i + 2]) : Promise.resolve(null);
        if (!src) { emit("onTick", (st.i + (i + 1) / chunks.length) / st.units.length); continue; }
        await playClip(src);
        emit("onTick", (st.i + (i + 1) / chunks.length) / st.units.length);
        if (halt(id)) return true;
      }
      emit("onMode", { mode: "neural", voice: v.name, cast: (u && u.cast) || "",
        note: swappedFrom ? "该段语言与所选音色不同 · 已自动换声（原音色：" + swappedFrom + "）" : "" });
      return true;
    }
    async function playSegment(u, id) {
      var text = String((u && u.text) || "");
      var okNeural = await neuralSegment(text, id, u);
      if (halt(id)) return;
      if (okNeural) return;
      /* 神经链路没拿到声：默认就此停住并把原因说清。
         悄悄换成系统机械音顶替，是「名字不同听着一样、全是冰冷机器音」的病根，
         读者甚至察觉不到自己在听降级音，只会觉得「这个软件音色就是这么差」。
         只有用户显式打开「本机声线兜底」才走系统声线（离线 / 静态托管时的活路）。 */
      if (sysFallbackOn()) { await sysSegment(text, id); return; }
      /* 与音色有关的停机：**不关朗读条**。条子一关，换音色的下拉跟着消失，
         用户只能重按朗读、拿同一款念不出的音色再错一次（实测复现过）。
         改发 halted：徽标留下原因、播放键拨回 ▶，换一款音色再点 ▶ 即续读。 */
      st.dead = true; st.paused = false;
      emit("onMode", { mode: "none", note: st.neuralWhy || "神经合成未响应" });
      emit("onState", "halted", (st.neuralWhy || "神经合成未响应") + " · 换一款音色再点播放");
    }
    async function run(id) {
      while (st.i < st.units.length) {
        if (halt(id)) return;
        if (st.stopBi != null && st.units[st.i].bi >= st.stopBi) { finish("本章读完"); return; }
        if (st.stopAt && Date.now() >= st.stopAt) { finish("定时时间到"); return; }
        emit("onSegment", st.units[st.i].bi, st.i);
        await playSegment(st.units[st.i], id);
        if (halt(id)) return;
        st.i++;
      }
      finish("全文读完");
    }
    function finish(why) {
      st.dead = true; st.paused = false;
      emit("onState", "done", why || "朗读结束");
    }
    var eng = {
      /* units: [{bi, text}]；fromIdx 起始段序。可随时重复调用（旧队列自动作废）。 */
      start(units, fromIdx) {
        st.gen++;
        st.units = units || [];
        st.i = Math.max(0, Math.min(st.units.length - 1, fromIdx || 0));
        st.dead = false; st.paused = false; st.stopAt = 0; st.stopBi = null;
        st.sysLock = null;
        if (!st.voice && window.InkVoice) st.voice = window.InkVoice.current();
        _ttsAbort = false;
        emit("onState", "playing");
        run(st.gen);
      },
      pause() {
        if (st.dead || st.paused) return;
        st.paused = true;
        try { if (_neuralAudio) _neuralAudio.pause(); } catch (e) {}
        try { window.speechSynthesis && window.speechSynthesis.pause(); } catch (e) {}
        emit("onState", "paused");
      },
      resume() {
        if (st.dead || !st.paused) return;
        st.paused = false;
        try { if (_neuralAudio) _neuralAudio.play(); } catch (e) {}
        try { window.speechSynthesis && window.speechSynthesis.resume(); } catch (e) {}
        emit("onState", "playing");
      },
      toggle() { if (st.paused) eng.resume(); else eng.pause(); },
      stop() {
        if (st.dead) return;
        st.dead = true; st.paused = false;
        try { if (_neuralAudio) _neuralAudio.pause(); } catch (e) {}
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
        emit("onState", "done", "已停止");
        emit("onState", "stopped");
      },
      /* 跳段 / 换嗓：从指定段重起队列；正在播的音频作废，听感即换即生效。
         v1.1-S5a A6：第二个参数可换整条队列。旧写法只能在 start() 时给队列，
         st.units 抓住的是那个旧数组的引用 —— 外面把 SPEAK_UNITS 重新赋值它根本看不见，
         于是「改完角色表听上去毫无反应、句高亮倒是按新表画」（两套坐标错位）。
         只换队列、**不碰** stopAt/stopBi/sysLock（那些是 D3 定时与本章读完的目标，重起会丢）。 */
      seekIdx(i, units) {
        st.gen++;
        try { if (_neuralAudio) _neuralAudio.pause(); } catch (e) {}
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
        if (units && units.length) st.units = units;
        st.i = Math.max(0, Math.min(st.units.length - 1, i || 0));
        st.dead = false; st.paused = false; _ttsAbort = false;
        emit("onState", "playing");
        run(st.gen);
      },
      /* v1.1-S3 D3：换速**不**重起队列。神经 clip 的 rate 在建 URL 时读 st.speed、
         本机声线每段重挂 utterance.rate —— 两者都是「下一句生效」，当前句以旧速
         念完自然对齐句边界；seekIdx 会把进度打回当前句开头，那正是要治的回退。 */
      setSpeed(x) {
        st.speed = Math.max(0.5, Math.min(3, Number(x) || 1));
      },
      setVoice(k) {
        st.voice = k; st.sysLock = null;
        if (!st.dead) eng.seekIdx(st.i);
      },
      /* 定时：到点收队；读完本章 = 到 stopBi（下一章标题所在段）即停 */
      setDeadline(ts) { st.stopAt = ts || 0; },
      setStopBi(bi) { st.stopBi = bi; },
      playing() { return !st.dead; },
      paused() { return st.paused; },
      idx() { return st.i; },
      speed() { return st.speed; },
      voice() { return st.voice; },
      on(name, cb) { if (name in ev) ev[name] = cb; }
    };
    return eng;
  }

  /* ------------------------------------------------------------
     导入文档的本机数据（不进 mock，接入服务端时改走 API，形状不变）
     inkread.contents.v1 —— { docId: blocks[] } 导入文档的结构化正文；
       没有它，导入的文档在阅读页只能是一片空白（mock 里根本没有这本书）。
     inkread.tasks.v1 —— { taskId: 记录 }，一个键两种记录：
       ① mock 任务的分配覆盖：{assignee}（刷新后分配不丢）；
       ② 导入任务的完整记录：带 x / docId / src 等（x 的存在即「这是一条独立任务」）。
     ------------------------------------------------------------ */
  var K_CONTENTS = "inkread.contents.v1";
  var K_TASKS = "inkread.tasks.v1";
  /* 写不进去只可能是两种实情：配额满了，或这台设备根本不让写（无痕模式 / 站点数据被禁）。
     旧版把 setItem 包在 catch (e) {} 里 —— 撞墙也当没事，用户以为书存住了，
     下次开书是一片空白。现在一律把原因如实报给调用方，由界面说清楚。 */
  var memContents = {};              /* 落库失败的正文留本轮会话引用，不把对象直接丢掉 */
  var LS_CEIL = 8 * 1024 * 1024;     /* 预检上限：整库序列化超过它就不做无用功（真配额各浏览器更低，由 catch 兜） */
  function lsWrite(key, str) {
    try { localStorage.setItem(key, str); return ""; }
    catch (e) {
      var name = String((e && e.name) || "");
      var code = e && e.code;
      if (/^QuotaExceeded|^NS_ERROR_DOM_QUOTA/.test(name) || code === 22 || code === 1014) return "quota";
      /* 不认识的异常：探一个跟业务无关的键位 —— 探针写得进就是体积问题，写不进就是禁写 */
      try { localStorage.setItem("lsprobe.v0", "1"); localStorage.removeItem("lsprobe.v0"); return "quota"; }
      catch (e2) { return "blocked"; }
    }
  }
  function contentsGet() {
    try {
      var v = JSON.parse(localStorage.getItem(K_CONTENTS));
      return v && typeof v === "object" ? v : {};
    } catch (e) { return {}; }
  }
  /* 返回 {ok, why, bytes}：ok=false 时 blocks 已转存 memContents，
     调用方（importDoc）据此在书架条目上打 stored:"none"。 */
  function contentsSet(docId, blocks) {
    var adding = Array.isArray(blocks) && blocks.length > 0;
    var all = contentsGet();
    if (adding) all[docId] = blocks; else delete all[docId];
    var str = JSON.stringify(all);
    var why = str.length > LS_CEIL ? "quota" : lsWrite(K_CONTENTS, str);
    if (why) { if (adding) memContents[docId] = blocks; return { ok: false, why: why, bytes: str.length }; }
    delete memContents[docId];
    return { ok: true, why: "", bytes: str.length };
  }
  /* ------------------------------------------------------------
     目录账（v1.1-S5b）inkread.toc.v1 = { docId: { rev:1, src, nodes:[], links:[] } }
     —— 目录原先是渲染期现算的（阅读页扫一遍 h1–h3 就当大纲）。「书里自带的目录要点得动」
        需要一份存下来的账：哪一项对应哪个块、正文哪一段字是目录条目，都得有个地方记账。
     —— nodes 是面板上那棵树（人工更正也存这里，src 转 manual 后重扫只提建议不覆写）；
        links 是正文里的可点区间（服务端解出的 EPUB 内链 + 读侧按文本认领的目录行）。
     —— 它是派生数据，不是第二份正文：块的字节仍然只有 inkread.contents.v1 一处真源，
        删了这份顶多退回「按标题生成大纲」，不会丢一个字。
     ------------------------------------------------------------ */
  var K_TOC = "inkread.toc.v1";
  function tocGet() {
    try {
      var v = JSON.parse(localStorage.getItem(K_TOC));
      return v && typeof v === "object" ? v : {};
    } catch (e) { return {}; }
  }
  function tocOf(docId) {
    var r = tocGet()[docId];
    return r && typeof r === "object" && Array.isArray(r.nodes) ? r : null;
  }
  /* 写回整本账：位置字段（bi / cs / len / bs）由阅读页绑定后盖上。落库失败不算错 ——
     目录是加速结构，丢了下次开面板重新派生，不像正文那样是用户资产。 */
  function tocSave(docId, rec) {
    if (!docId || !rec) return false;
    var all = tocGet();
    all[docId] = rec;
    var str = JSON.stringify(all);
    if (str.length > LS_CEIL) return false;
    return lsWrite(K_TOC, str) === "";
  }
  /* 服务端 /api/book 的 toc → 本机账的形状。bi = -1 表示还没绑到块上，
     由阅读页首次开面板时按 anchor / 文本认领并补 bs（与批注 S2-C2 同一口径的块指纹）。 */
  function tocFromServer(t) {
    if (!t || typeof t !== "object") return null;
    var nodes = (Array.isArray(t.entries) ? t.entries : []).map(function (e) {
      return { lv: Math.min(Math.max(+e.lv || 1, 1), 3), x: String(e.x || ""),
               bi: -1, cs: 0, len: 0, bs: 0, anchor: String(e.anchor || ""), kids: [], open: true };
    });
    var links = (Array.isArray(t.links) ? t.links : []).map(function (l) {
      return { m: "r", bi: +l.bi || 0, cs: +l.cs || 0, len: +l.len || 0, x: String(l.x || ""),
               anchor: String(l.anchor || ""), tbi: l.tbi == null ? -1 : (+l.tbi || 0) };
    });
    if (!nodes.length && !links.length) return null;
    return { rev: 1, src: String(t.src || "nav"), nodes: nodes, links: links };
  }

  function taskStoreGet() {
    try {
      var v = JSON.parse(localStorage.getItem(K_TASKS));
      return v && typeof v === "object" ? v : {};
    } catch (e) { return {}; }
  }
  function taskStoreSet(all) {
    var str = JSON.stringify(all || {});
    if (str.length > LS_CEIL) return false;
    return lsWrite(K_TASKS, str) === "";
  }
  /* 演示任务 + 本机覆盖 / 导入任务的合并视图。
     一律返回副本：覆盖只改副本的 assignee，导入任务按 mock 同款字段补齐，
     DB.tasks 原对象从头到尾不被污染。
     v2.22：演示任务的合并同样问清空哨兵 —— 与 getShelf/getNotes 同一约定，
     用户主动清空后（哨兵在）即使 DB.tasks 还有演示条目也不再回播。 */
  function mergedTasks() {
    var ov = taskStoreGet();
    var demo = InkStore.isCleared() ? [] : DB.tasks;
    var out = demo.map(function (t) {
      var c = Object.assign({}, t);
      if (ov[t.id] && ov[t.id].assignee) c.assignee = ov[t.id].assignee;
      if (ov[t.id] && ov[t.id].today) c.today = true;
      return c;
    });
    Object.keys(ov).forEach(function (id) {
      var r = ov[id];
      if (!r || !r.x) return;                       /* 无 x = 只是分配覆盖，不是独立任务 */
      if (out.some(function (t) { return t.id === id; })) return;
      /* 整条记录铺底再补展示字段：白名单拷贝会把 month / monthLabel / phase
         这类「任务页分组要用、DB.tasks 里有」的字段静默洗掉。 */
      var c = Object.assign({ kind: "daily", week: "", time: "", anchor: "", docId: "",
                              src: "本地导入", assignee: "", month: "", monthLabel: "", phase: "" }, r);
      /* 标题在出口再过一次去符号：抽取期洗过一遍是幂等的，但库里躺着的是 v2.23 之前
         写入的裸 markdown（- [ ] 与 ** 都还在字里），老用户的清单不能等到重导一次才干净。
         过的是同一条链（先剥前缀再拆标记），否则显示层与抽取层会给出两种标题。 */
      var title = taskTitle(stripTaskPrefix(r.x));
      c.id = id; c.title = title; c.quote = title; c.today = !!r.today;
      out.push(c);
    });
    return out;
  }
  /* 任务抽取规则（见 parseDocument 注释）：剥掉列表前缀后按长度 + 前缀 / 关键词判定 */
  var TASK_KW = /周|月|日|每天|每周|每月|完成|背|做|复习|提交|整理/;
  /* 关键词命中不等于「这是待办」：报告 / 论文正文里「先整理…再…」这类叙述句同样带动词，
     整段被抽成任务比漏抽更糟 —— 它直接进用户的清单。条目身份以显式结构为准（列表行无条件算），
     非列表行再加两道散文判定：句末标点、或连着一串顿读子句。真条目一般一个逗号就到头，
     像「背完词汇，做完真题，整理错题本」仍收；「本报告围绕…展开，先…，再…，最后…。」不收。 */
  function isProseLine(s) {
    if (/[。！？!?…]$/.test(s)) return true;
    return (s.match(/[，,；;、]/g) || []).length >= 3;
  }
  /* 列表前缀可以叠（`> - 1. …`），GFM 的复选框紧跟其后（`- [ ] 背书`）。
     一次剥干净，别把 `[ ]` 留在标题里当字 —— 读者要的是「背完第一遍词汇」这一句。 */
  var TASK_PREFIX = /^(?:\s*>+\s*|\s*[-*+]\s+|\s*\d+[.、)]\s*)+/;
  var TASK_MARK = /^\s*\[( |x|X)\]\s+/;
  function stripTaskPrefix(s) {
    return String(s || "").replace(TASK_PREFIX, "").trim();
  }
  /* 复选框行的身份不靠关键词：勾没勾都是「作者明确列的一条」，比动词命中更硬。 */
  function taskMarkOf(s) {
    var m = TASK_MARK.exec(String(s || ""));
    return m ? (m[1] === " " ? 0 : 1) : null;
  }
  /* 标题去符号：只拆「确定是标记」的结构，不做 MD.plain 那种字符级扫射 ——
     plain() 把 #>*_~- 一律换成空格，2024-11-05 提交 会被洗成 2024 11 05 提交，
     而任务标题里最常见的恰恰是日期。所以宁可少拆几样，也不能吃掉内容。 */
  function taskTitle(s) {
    var t = String(s || "").replace(/\s+/g, " ").trim();
    t = t.replace(TASK_MARK, "");
    t = t.replace(/`([^`]*)`/g, "$1");                       /* 行内代码 */
    t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");          /* 图片 → alt */
    t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");           /* 链接 → 锚字（[1] 这类裸编号不动） */
    t = t.replace(/<\/?(?:br|span|b|i|em|strong|u|s|code|kbd|sub|sup)\b[^>]*>/gi, " ");
    t = t.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, "$2")
         .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
         .replace(/(^|[\s(（《「『【])([*_])(?=\S)([^*_]*?\S)\2(?=[\s)）》」』】，。、；：！？,.!?;:|$])/g, "$1$3")
         .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1");
    t = t.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, "$1");    /* 反斜杠转义 */
    return t.replace(/\s+/g, " ").trim();
  }
  /* 月份只在标题行里认：条目正文的「近 12 月」「每月」是数量与频率，不是时点，
     从条目猜日期会把计划读乱，宁缺毋滥。 */
  var CN_MONTH = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
  var CN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  function monthOf(head, defYear) {
    var t = String(head || "").replace(/\s+/g, ""), m, n;
    m = t.match(/(20\d{2})[年\-/.](\d{1,2})月/);
    if (m) { n = +m[2]; if (n >= 1 && n <= 12) return { year: +m[1], num: n }; }
    m = t.match(/(?:^|[^\d])(\d{1,2})月/);
    if (m) { n = +m[1]; if (n >= 1 && n <= 12) return { year: defYear, num: n }; }
    m = t.match(/(十[一二]|[一二三四五六七八九十])月/);
    if (m && CN_MONTH[m[1]]) return { year: defYear, num: CN_MONTH[m[1]] };
    return null;
  }
  function phaseOf(head) {
    var m = String(head || "").match(/[一-龥]{2,4}阶段/);
    return m ? m[0] : "";
  }
  /* 一次抽取给出 { tasks, checked }：勾掉的条目不当待办导入（清单里混着已完成的，
     读者第一件事是删），但也不静默丢 —— 条数在导入预览里如实报出来。 */
  function extractTasks(text, fileName) {
    var lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    var out = [], checked = 0, inFence = false, n = 0, defYear = new Date().getFullYear();
    var ctx = { month: "", monthLabel: "", phase: "" };
    lines.forEach(function (raw) {
      var line = String(raw).trim();
      if (/^```/.test(line)) { inFence = !inFence; return; }   /* 围栏代码整体跳过 */
      if (inFence || !line) return;
      if (/^#{1,6}\s/.test(line)) {                             /* 标题不是任务，但带着分组依据 */
        var lvl = line.match(/^#+/)[0].length, mo = monthOf(line, defYear), ph = phaseOf(line);
        if (lvl === 1) ctx = { month: "", monthLabel: "", phase: "" };
        if (mo) {
          ctx.month = mo.year + "-" + (mo.num < 10 ? "0" + mo.num : mo.num);
          /* 当年只写月份，跨年补年份 —— 分组键带年份，标题按墨读的语气用中文数字 */
          ctx.monthLabel = (mo.year === defYear ? "" : mo.year + " · ") + CN_NUM[mo.num] + "月";
          ctx.phase = ph;                                        /* 换月即重读阶段，不沿用上月 */
        } else if (ph) {
          ctx.phase = ph;
        }
        return;
      }
      var bare = stripTaskPrefix(line);
      var mark = taskMarkOf(bare);
      if (mark === 1) { checked++; return; }
      var body = taskTitle(bare);
      if (body.length < 8 || body.length > 60) return;
      /* 复选框行和列表行一样，是作者明确列出的条目，无条件算；关键词命中只服务非条目行。 */
      var isItem = mark !== null || TASK_PREFIX.test(line);
      if (!isItem && !TASK_KW.test(body)) return;
      if (!isItem && isProseLine(body)) return;
      n++;
      var t = { id: "t-" + n, x: body, docId: "", src: fileName || "" };
      if (ctx.month) { t.kind = "monthly"; t.month = ctx.month; t.monthLabel = ctx.monthLabel; t.phase = ctx.phase; }
      out.push(t);
    });
    return { tasks: out, checked: checked };
  }

  /* ------------------------------------------------------------
     类别体系（8 类）· 导入时识别推荐 · kindmap「记住学习」
     ------------------------------------------------------------
     受控类别集（v2.6 要求三 · 决策）：8 类与 4 个阅读模式一一映射，内部 key 用英文；
     book / paper / plan / comic 四个旧 key 保持不变（mock 与已导入数据继续可显示），
     新增 textbook / report / note / other。
     kindmap（inkread.kindmap.v1 = {关键词: kind}）把「文件名 → 用户最终选的类别」
     沉淀成本机映射：离线也能先按映射推荐，并作个性化上下文注入 AI 分类 prompt。 */
  var KINDS = ["book", "textbook", "paper", "report", "plan", "note", "comic", "other"];
  var KIND_CN = { book: "书籍", textbook: "教材", paper: "论文", report: "报告", plan: "计划", note: "笔记", comic: "漫画", other: "其他" };
  /* 类别 → 阅读模式：与 modes.js / guessMode 的模式 key 对齐（book / study / paper / comic） */
  var KIND_MODE = { book: "book", textbook: "study", paper: "paper", report: "paper", plan: "study", note: "study", comic: "comic", other: "study" };
  function isKind(k) { return KINDS.indexOf(k) >= 0; }
  function kindCN(k) { return KIND_CN[k] || KIND_CN.other; }

  var K_KINDMAP = "inkread.kindmap.v1";
  var KINDMAP_MAX = 200;                 /* 上限：超限淘汰最旧的键，映射表不无限膨胀 */
  function kindmapGet() {
    try {
      var v = JSON.parse(localStorage.getItem(K_KINDMAP));
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
  }
  function kindmapSet(m) {
    try { localStorage.setItem(K_KINDMAP, JSON.stringify(m || {})); } catch (e) {}
    return m || {};
  }
  /* 务实切法：取「文件名去扩展名」全文 + 「前 4 字」两个键 —— 简单、可解释；
     下次同类命名的文件至少能靠前 4 字命中（书名 / 前缀习惯通常是稳定的）。
     纯数字的键（年份 / 编号，如「2026」「001」）语义太弱，一律不收 ——
     否则「2026 年度报告」会给「2026 考研规划」乱推荐（E2E 实测踩到过）。 */
  function baseName(name) {
    return String(name == null ? "" : name).replace(/\.[^.\\/]+$/, "").replace(/\s+/g, " ").trim();
  }
  function kindmapKeys(name) {
    var base = baseName(name), out = [];
    if (base && !/^\d+$/.test(base)) out.push(base);
    var head = base.slice(0, 4);
    if (head && head !== base && !/^\d+$/.test(head)) out.push(head);
    return out;
  }
  function kindmapLearn(fileName, kind) {
    if (!isKind(kind)) return kindmapGet();
    var m = kindmapGet();
    kindmapKeys(fileName).forEach(function (k) {
      if (k.length < 2) return;                    /* 单字键噪声太大，不收 */
      delete m[k];                                 /* 重学即移到最近位：值以最新一次为准 */
      m[k] = kind;
    });
    var ks = Object.keys(m);
    if (ks.length > KINDMAP_MAX) ks.slice(0, ks.length - KINDMAP_MAX).forEach(function (k) { delete m[k]; });
    return kindmapSet(m);
  }
  /* 查询：命中「最长的、包含在新文件名里的」键 —— 越长越具体，优先采信；
     同长时取更靠后的一次出现（更贴近文件名里真正有区分度的那一段，且不受
     JS 对象「整数样键排最前」的键序影响）。 */
  function kindmapLookup(name) {
    var base = baseName(name);
    if (base.length < 2) return null;
    var m = kindmapGet(), hit = null, hitAt = -1;
    Object.keys(m).forEach(function (k) {
      if (k.length < 2 || !isKind(m[k])) return;
      var at = base.indexOf(k);
      if (at < 0) return;
      if (!hit || k.length > hit.key.length || (k.length === hit.key.length && at > hitAt)) {
        hit = { key: k, kind: m[k] };
        hitAt = at;
      }
    });
    return hit;
  }
  /* 最近 8 条映射 —— 作为 AI 分类的个性化上下文（越新的越贴近当前习惯） */
  function kindmapPromptList() {
    var m = kindmapGet(), ks = Object.keys(m);
    return ks.slice(-8).map(function (k) { return "含「" + k + "」的文件 → " + kindCN(m[k]); });
  }

  /* 启发式分类（无模型 / 模型失败时的规则路径，自旧 guessKind 扩表而来）：
     ① 先查 kindmap（命中即回「依据你的历史归类」）；
     ② 文件名 → 正文节选前 600 字 → 扩展名兜底，逐级取证据。 */
  var KIND_KW = [
    { k: "comic",    re: /漫画|条漫|连环画|绘本|画册|图集|manga|comic|webtoon/i },
    { k: "plan",     re: /计划|规划|待办|清单|日程|备考安排|todo|checklist|roadmap/i },
    { k: "paper",    re: /论文|期刊|学报|会议|学位|文献|精读|paper|thesis|journal|arxiv|doi/i },
    { k: "report",   re: /报告|白皮书|年报|调研|报表|汇编|综述|report|whitepaper|white\s*paper/i },
    { k: "note",     re: /笔记|手稿|草稿|随笔|摘录|随记|备忘录|note|draft|manuscript|memo/i },
    { k: "textbook", re: /教材|教程|讲义|课本|教辅|习题|试卷|大纲|textbook|lecture|tutorial|syllabus/i }
  ];
  function kindByHeuristic(fileName, text, fmt) {
    var name = String(fileName == null ? "" : fileName);
    var body = String(text == null ? "" : text).slice(0, 600);   /* 文首的标题 / 摘要最能定型 */
    var hit = kindmapLookup(name);
    if (hit) {
      return { kind: hit.kind, reason: "你以前把含「" + hit.key + "」的文件归为「" + kindCN(hit.kind) + "」",
               by: "rule", learned: true };
    }
    for (var i = 0; i < KIND_KW.length; i++) {
      var m = name.match(KIND_KW[i].re);
      if (m) return { kind: KIND_KW[i].k, reason: "文件名含「" + m[0] + "」", by: "rule" };
    }
    for (var j = 0; j < KIND_KW.length; j++) {
      var b = body.match(KIND_KW[j].re);
      if (b) return { kind: KIND_KW[j].k, reason: "正文开头含「" + b[0] + "」", by: "rule" };
    }
    /* 服务端魔数识别出的真实格式优先于扩展名兜底：解析器真读出了字节，比文件名后缀可靠 */
    if (fmt === "pptx") return { kind: "textbook", reason: "PPT 演示按讲义归类", by: "rule" };
    if (fmt === "docx") return { kind: "book", reason: "Word 文档默认按书籍归类", by: "rule" };
    if (fmt === "pdf") return { kind: "paper", reason: "PDF 文档默认按论文归类", by: "rule" };
    if (fmt === "image") return { kind: "comic", reason: "图片文件默认按漫画 / 图册归类", by: "rule" };
    if (fmt === "epub") return { kind: "book", reason: "EPUB 是成书格式，按书籍归类", by: "rule" };
    var n = name.toLowerCase();
    if (/\.pdf$/.test(n)) return { kind: "paper", reason: "PDF 文档默认按论文归类", by: "rule" };
    if (/\.(png|jpe?g|webp|gif|bmp|avif)$/.test(n)) return { kind: "comic", reason: "图片文件默认按漫画 / 图册归类", by: "rule" };
    return { kind: "book", reason: "未命中任何规则，默认按书籍归类", by: "rule" };
  }

  /* AI 分类：给模型 8 个候选做「选择题」（闭合标签空间：可靠、可校验、可映射），
     并把 kindmap 的个性化映射（限 8 条）注入 system —— 用户的历史归类作参考。 */
  async function classifyAI(fileName, text, cfg) {
    var head = String(text == null ? "" : text).slice(0, 1200);
    var mem = kindmapPromptList();
    var usr = "文件名：" + String(fileName == null ? "" : fileName) +
      "\n正文节选（前 1200 字）：" + (head || "（二进制文档，拿不到正文）");
    var r = await Prompt.run("classify", usr, {
      cfg: cfg,
      vars: { memory: mem.length ? "这位读者以往的归类习惯（供参考，不是硬性规则）：\n- " + mem.join("\n- ") : "" }
    });
    /* 闭合标签空间是这条路的护栏：结构再完整，kind 不在八类里就算失败 */
    if (!isKind(r.j.kind)) {
      var er = new Error("模型给的类别不在八类之内");
      er.name = "UnstructuredError";
      er.raw = r.raw;
      throw er;
    }
    return { kind: r.j.kind, reason: String(r.j.reason || "").slice(0, 120), via: r.via };
  }
  function hasModelNow() { var c = getModelCfg(); return !!(c.baseUrl && c.key && c.model); }

  /* ------------------------------------------------------------
     v2.7 阅读统计（inkread.stats.v1）—— 全在本机、可见即计
     ------------------------------------------------------------
     形状：{ days: { "YYYY-MM-DD": { sec, words, checks } }, total: { sec, words }, updatedAt }
       · 日期键一律按本机时区算（ymd()），绝不用 toISOString —— 那是 UTC 日，
         UTC+8 的凌晨会被记到「昨天」，统计与日期显示对不上（方案 F）；
       · 时长以秒存储（微信读书官方文档专门警告单位陷阱），显示时才折算分钟 / 小时；
       · checks 只记当日 —— 打卡总条数在 inkread.checkins.v1 里，不重复存一份；
       · 防抖落库：内存累加 + 2 秒防抖 / 每 5 次写一次，页面隐藏 / 离开立即 flush，
         避免 5 秒心跳每跳都写盘。
     汇总口径（方案 A）：
       · week 自本周一 00:00 起（微信读书口径）；month / year 为本月 / 本年；
       · 有效阅读天数 = 单日满 60 秒（微信读书口径）。
     ------------------------------------------------------------ */
  var K_STATS = "inkread.stats.v1";
  var K_MILESTONES = "inkread.milestones.v1";
  var K_CHECKINS_RAW = "inkread.checkins.v1";      /* app.js InkStore.K_CK 同键；这里只读不写 */

  function pad2(n) { return ("0" + n).slice(-2); }
  /* 本机时区的 YYYY-MM-DD（勿用 toISOString：UTC 日会跨时区记错天） */
  function ymd(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  /* "YYYY-MM-DD" → 本机时区当日 00:00（勿用 new Date(str)：那按 UTC 解析） */
  function ymdDate(key) {
    var m = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  var ST = null;          /* 内存工作副本（唯一真源；落库只是它的投影） */
  var ST_BASE = null;     /* 上次与库对齐时的快照 —— 落库时用「现库 + (ST - ST_BASE)」合并，
                             即只叠加本页尚未落库的增量。防止「另一页写过库、本页缓存陈旧」
                             时整份覆盖把对方的新数据抹掉（v2.7 修复，验收组复现过写空）。 */
  var ST_TIMER = null;    /* 防抖落库定时器 */
  var ST_WRITES = 0;      /* 自上次落库以来累积的写次数 */

  function statsBlank() { return { days: {}, total: { sec: 0, words: 0 }, updatedAt: 0 }; }
  function statsNum(v) { v = Number(v); return isFinite(v) && v > 0 ? v : 0; }
  function statsNormalize(v) {
    var s = statsBlank();
    if (v && typeof v === "object") {
      if (v.days && typeof v.days === "object" && !Array.isArray(v.days)) s.days = v.days;
      s.total.sec = statsNum(v.total && v.total.sec);
      s.total.words = statsNum(v.total && v.total.words);
      s.updatedAt = Number(v.updatedAt) || 0;
    }
    Object.keys(s.days).forEach(function (k) {
      var r = s.days[k];
      if (!r || typeof r !== "object") { delete s.days[k]; return; }
      r.sec = statsNum(r.sec); r.words = statsNum(r.words); r.checks = statsNum(r.checks);
    });
    return s;
  }
  function statsSave(s) {
    s.updatedAt = Date.now();
    try { localStorage.setItem(K_STATS, JSON.stringify(s)); } catch (e) {}
    return s;
  }
  /* 迁移（首次接触 stats 时跑一次）：老用户的 inkread.checkins.v1 只有 {taskId:"HH:MM"}，
     没有日期 —— 无从还原历史分布。保守回填：把现有打卡条数记到「今天」，过去的日子留空。
     宁可少记，不编造。跑过一次 days 即非空，天然不会重复跑。 */
  function statsMigrate(s) {
    if (Object.keys(s.days).length) return s;
    var ck = {};
    try { ck = JSON.parse(localStorage.getItem(K_CHECKINS_RAW)) || {}; } catch (e) { ck = {}; }
    var n = (ck && typeof ck === "object" && !Array.isArray(ck)) ? Object.keys(ck).length : 0;
    if (!n) return s;
    var t = ymd();
    var rec = s.days[t] || (s.days[t] = { sec: 0, words: 0, checks: 0 });
    rec.checks = Math.max(rec.checks, n);
    return statsSave(s);
  }
  function statsRead() {
    if (ST) return ST;
    var v = null;
    try { v = JSON.parse(localStorage.getItem(K_STATS)); } catch (e) { v = null; }
    ST = statsMigrate(statsNormalize(v));
    ST_BASE = JSON.parse(JSON.stringify(ST));
    return ST;
  }
  function statsDayOf(s) {
    var t = ymd();
    return s.days[t] || (s.days[t] = { sec: 0, words: 0, checks: 0 });
  }
  function statsSnap(r) { return { sec: r.sec || 0, words: r.words || 0, checks: r.checks || 0 }; }

  /* 落库 = 现库（别人可能刚写过） + 本页未落库增量（ST − ST_BASE），按天/总额逐字段叠加。
     单页使用时与旧行为等价；双页同开（书架 + 阅读）任何一页 flush 都不会覆盖对方。
     增量取 Math.max(0, …) 防负数（外部把库重置为更小值时只补增量、不倒退）。 */
  function statsFlush() {
    if (ST_TIMER) { clearTimeout(ST_TIMER); ST_TIMER = null; }
    ST_WRITES = 0;
    if (ST) {
      var cur = statsBlank();
      try { cur = statsNormalize(JSON.parse(localStorage.getItem(K_STATS))); } catch (e) {}
      var base = ST_BASE || statsBlank();
      var merged = statsBlank();
      var keys = {};
      Object.keys(cur.days).forEach(function (k) { keys[k] = 1; });
      Object.keys(ST.days).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) {
        var a = cur.days[k] || { sec: 0, words: 0, checks: 0 };
        var b = ST.days[k] || { sec: 0, words: 0, checks: 0 };
        var z = base.days[k] || { sec: 0, words: 0, checks: 0 };
        merged.days[k] = {
          sec: statsNum(a.sec) + Math.max(0, statsNum(b.sec) - statsNum(z.sec)),
          words: statsNum(a.words) + Math.max(0, statsNum(b.words) - statsNum(z.words)),
          checks: statsNum(a.checks) + Math.max(0, statsNum(b.checks) - statsNum(z.checks))
        };
      });
      merged.total = {
        sec: statsNum(cur.total.sec) + Math.max(0, statsNum(ST.total.sec) - statsNum(base.total.sec)),
        words: statsNum(cur.total.words) + Math.max(0, statsNum(ST.total.words) - statsNum(base.total.words))
      };
      /* v2.11：全零日键是合并残渣（本页内存缓存 × 已清空/空白的库做并集的产物）。
         留着它，「清空全部」后旧页面的最后一次 flush 会写出一串 0 日壳，
         同步还会把它当活数据推上快照、反超墓碑，让清空后的统计"复活"。
         剪掉：有值才算有一天。 */
      Object.keys(merged.days).forEach(function (k) {
        var d = merged.days[k];
        if (!d.sec && !d.words && !d.checks) delete merged.days[k];
      });
      statsSave(merged);
      ST = merged;
      ST_BASE = JSON.parse(JSON.stringify(merged));
    }
    return statsToday();
  }
  function statsDebounce() {
    ST_WRITES++;
    if (ST_WRITES >= 5) { statsFlush(); return; }      /* 写得密：攒够 5 次就落库 */
    if (ST_TIMER) return;
    ST_TIMER = setTimeout(function () { statsFlush(); }, 2000);
  }
  /* 记一笔当日 / 累计。kind ∈ "sec"|"words"|"checks"（checks 只写当日）。
     返回更新后的当日对象 {sec, words, checks}（副本，外部改不到内部状态）。 */
  function statsBump(kind, amount) {
    var s = statsRead();
    var day = statsDayOf(s);
    var n = Number(amount);
    if (!isFinite(n) || n <= 0) return statsSnap(day);
    if (kind === "sec") { day.sec += n; s.total.sec += n; }
    else if (kind === "words") { day.words += n; s.total.words += n; }
    else if (kind === "checks") { day.checks += n; }
    else return statsSnap(day);
    statsDebounce();
    return statsSnap(day);
  }
  function statsToday() {
    var s = statsRead();
    var r = s.days[ymd()];
    return r ? statsSnap(r) : { sec: 0, words: 0, checks: 0 };
  }
  /* 区间起点（本机时区 00:00）：week=本周一（周日算上周最后一天）；total 无起点 */
  function statsStart(kind) {
    var d = new Date();
    if (kind === "week") {
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      return x;
    }
    if (kind === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
    if (kind === "year") return new Date(d.getFullYear(), 0, 1);
    return null;                                       /* day / total 由调用处另行处理 */
  }
  function statsEffDays(s, from) {
    var n = 0;
    Object.keys(s.days).forEach(function (k) {
      if (from) { var d = ymdDate(k); if (!d || d < from) return; }
      if ((s.days[k].sec || 0) >= 60) n++;             /* 有效阅读天数 = 单日满 60 秒 */
    });
    return n;
  }
  /* 汇总：kind ∈ "day"(今天) | "week" | "month" | "year" | "total"，返回 {sec, words, days} */
  function statsRange(kind) {
    var k = ["day", "week", "month", "year", "total"].indexOf(kind) >= 0 ? kind : "day";
    var s = statsRead();
    if (k === "day") {
      var t = statsToday();
      return { sec: t.sec, words: t.words, days: t.sec >= 60 ? 1 : 0 };
    }
    if (k === "total") return { sec: s.total.sec, words: s.total.words, days: statsEffDays(s, null) };
    var from = statsStart(k), sec = 0, words = 0, days = 0;
    Object.keys(s.days).forEach(function (key) {
      var d = ymdDate(key);
      if (!d || d < from) return;
      var r = s.days[key];
      sec += r.sec || 0; words += r.words || 0;
      if ((r.sec || 0) >= 60) days++;
    });
    return { sec: sec, words: words, days: days };
  }
  /* 连续打卡：从今天（今天没有打卡就从昨天）往回数 days[d].checks > 0 的连续天数；
     activeDays = 有任意 sec>0 或 checks>0 的天数（读过才算日子）。 */
  function statsStreak() {
    var s = statsRead();
    var activeDays = 0;
    Object.keys(s.days).forEach(function (k) {
      var r = s.days[k];
      if ((r.sec || 0) > 0 || (r.checks || 0) > 0) activeDays++;
    });
    var cur = new Date();
    if (!(((s.days[ymd(cur)] || {}).checks || 0) > 0)) cur.setDate(cur.getDate() - 1);
    var streak = 0;
    while (streak < 10000) {
      if (!(((s.days[ymd(cur)] || {}).checks || 0) > 0)) break;
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
    return { streak: streak, activeDays: activeDays };
  }

  /* ---------- 按文档类别的速度样本（v2.8） ----------
     读论文与读小说的速度天然不同：分别累积 words/sec，readSpeed(kind) 优先取该类别的
     实测值 —— 用得越多，各类型的估算各自收敛、逐渐稳定到你的真实习惯，互不干扰。 */
  var K_SPEEDMAP = "inkread.speedmap.v1";
  function speedMapRead() {
    try {
      var v = JSON.parse(localStorage.getItem(K_SPEEDMAP));
      return (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
  }
  function speedBump(docKind, kind, amount) {
    var k = String(docKind || "");
    var n = Number(amount);
    if (!k || !isFinite(n) || n <= 0) return;
    if (kind !== "sec" && kind !== "words") return;
    var m = speedMapRead();
    var r = m[k] || (m[k] = { words: 0, sec: 0 });
    r[kind] = statsNum(r[kind]) + n;
    try { localStorage.setItem(K_SPEEDMAP, JSON.stringify(m)); } catch (e) {}
  }

  /* 实测阅读速度（字/分钟）——剩余时间估算从此有真实依据（v2.8）。
     口径：近 14 天的 words/sec 比值（贴合当前状态）；样本不足（< 600 字或 < 120 秒）
     退全量累计；仍不足回退默认 300 字/分（并在调用处标明"估算"）。
     clamp 到 80–1200 字/分，防异常数据（旧口径抖动、挂机残留）把估算带偏。
     返回 {wpm, source:"recent14"|"total"|"default", sample}。 */
  function readSpeed(docKind) {
    var k = String(docKind || "");
    if (k) {
      var mr = speedMapRead()[k];
      if (mr && statsNum(mr.words) >= 600 && statsNum(mr.sec) >= 120) {
        var wpmK = Math.round(statsNum(mr.words) / statsNum(mr.sec) * 60);
        return { wpm: Math.max(80, Math.min(1200, wpmK)), source: "kind", kind: k, sample: Math.round(statsNum(mr.words)) };
      }
    }
    var s = statsRead();
    var w = 0, sec = 0;
    var today = new Date();
    for (var i = 0; i < 14; i++) {
      var dd = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      var r = s.days[ymd(dd)];
      if (r) { w += statsNum(r.words); sec += statsNum(r.sec); }
    }
    var src = "recent14";
    if (!(w >= 600 && sec >= 120)) {
      w = statsNum(s.total.words); sec = statsNum(s.total.sec);
      src = "total";
    }
    if (!(w >= 600 && sec >= 120)) return { wpm: 300, source: "default", sample: Math.round(w) };
    var wpm = Math.round(w / sec * 60);
    wpm = Math.max(80, Math.min(1200, wpm));
    return { wpm: wpm, source: src, sample: Math.round(w) };
  }
  function msGet() {
    try {
      var v = JSON.parse(localStorage.getItem(K_MILESTONES));
      return (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
  }
  function msSet(m) { try { localStorage.setItem(K_MILESTONES, JSON.stringify(m || {})); } catch (e) {} }
  /* 里程碑：streak 新到达 30 的倍数（初级 basic，round=streak/30）
     或 365 的倍数（高级 advanced，round=streak/365，isAnniversary）时命中一次。
     inkread.milestones.v1 = {"30": ts, "365": ts…} 防重复触发（同一节点只庆祝一次）。
     365 的倍数永远不是 30 的倍数（365%30=5），两条分支不会撞车。 */
  function statsMilestone() {
    var days = statsStreak().streak;
    if (days <= 0) return { hit: false };
    var level = days % 365 === 0 ? "advanced" : (days % 30 === 0 ? "basic" : "");
    if (!level) return { hit: false };
    var ms = msGet();
    var key = String(days);
    if (ms[key]) return { hit: false };
    var hit = {
      hit: true, level: level, days: days,
      round: level === "advanced" ? days / 365 : days / 30,
      isAnniversary: level === "advanced"
    };
    ms[key] = Date.now();
    msSet(ms);
    return hit;
  }
  /* 兜底：任何载入 api.js 的页面（含不归本组管的书架页）在隐藏 / 离开前立即落库，
     最后不到 2 秒的挂账不丢；别的标签页写了 stats 就丢掉本页缓存，下次读到新的。 */
  try {
    document.addEventListener("visibilitychange", function () { if (document.hidden) statsFlush(); });
    window.addEventListener("pagehide", function () { statsFlush(); });
    window.addEventListener("storage", function (e) {
      if (e && e.key === K_STATS && !ST_TIMER && !ST_WRITES) { ST = null; ST_BASE = null; }
    });
  } catch (e) {}

  /* 书仓正文的内存缓存（v2.21 E5）：EPUB 整本落在 userData/ebooks，
     绝不进 localStorage（4MB 快照墙装不下一本书）。阅读页要的是「同步取块」，
     所以开书前先 await diskContent 预取进这里，localContent 命中即返回。
     键用书架条目 id —— 同一本书分两次导入是两个条目、同一个 bookId，
     各存一份引用即可，页面生命周期内不会泄漏。 */
  var diskCache = {};
  async function diskFetch(doc) {
    var id = doc && doc.bookId;
    if (!id) throw new Error("条目没有书仓编号");
    var r = await fetch("/api/book/" + encodeURIComponent(id));
    if (r.status === 404) throw new Error("本机书仓里没有这本书（可能是在别的设备上导入的）");
    if (!r.ok) throw new Error("书仓读取失败（HTTP " + r.status + "）");
    var blocks = await r.json();
    if (!Array.isArray(blocks) || !blocks.length) throw new Error("书仓里的正文是空的");
    diskCache[doc.id] = blocks;
    return blocks;
  }

  window.API = {
    /* 同步读取导入文档的本机正文块（阅读页打开即用，不该等桩层延迟）。
       拿不到返回 null，由调用方回退 DB.contents。 */
    localContent(docId) {
      /* 落库成功读库；失败的书在本轮会话里仍可从 memContents 读到 ——
         跨页面（导入页 → 阅读页）就没了，那由阅读页按 stored:"none" 如实说明。 */
      var local = diskCache[docId] || memContents[docId] || contentsGet()[docId];
      return (Array.isArray(local) && local.length) ? local : null;
    },

    /* 一键排版落库（v1.1-S5d）：把重排后的 blocks 写回本机正文，返回值原样透传
       contentsSet 的 {ok, why, bytes} —— 空间满了要说得出来，不能假装排好了。
       只有正文存在 inkread.contents.v1 的书适用；书仓书（EPUB）的正文在磁盘书仓里，
       写这份键等于盖不住原书仓，调用方须先看 doc.src。 */
    contentSave(docId, blocks) { return contentsSet(docId, blocks); },

    /* 文体清单与中文名：排版面板要说「判成了论文」，模型回话也要拿这份清单验档 ——
       阅读页自己再抄一份八个词，就成了改一处漏一处的第二真源。 */
    kinds() { return KINDS.slice(); },
    kindCN(k) { return kindCN(k); },

    /* 目录账（v1.1-S5b）：读一份存下来的 nodes / links，没有就返回 null 由阅读页派生。
       tocSave 写回时整本替换 —— 记账的是这一本书，多书各占一键。 */
    tocOf(docId) { return tocOf(docId); },
    tocSave(docId, rec) { return tocSave(docId, rec); },

    /* 落库失败的原因说人话：书架徽标的悬浮说明、阅读页空态、导入提示共用一份措辞，
       免得三个地方三种说法。 */
    storedNote(why) {
      return why === "blocked" ? "本机不允许保存数据（无痕模式或站点数据被禁用）"
        : why === "shelf" ? "书架没能写入本机存储"
        : "本机存储空间已满";
    },

    /* 模型请求异常里给用户看的那半句。浏览器抛的多是英文（Failed to fetch、
       abort），直接拼进文案等于把堆栈碎片端到人话界面上。按错型归成人话：
       abort 在本机只由超时计时器触发（见 chatRun/chatMsgs），与「测试连接」
       的判定口径一致；HTTP 状态翻成能行动的措辞；已是中文的原样透传。 */
    netErrPhrase(err) {
      var m = String((err && err.message) || err || "");
      if (!m) return "网络不通";
      if (/abort|timed out|timeout/i.test(m)) return "响应超时";
      if (/failed to fetch|networkerror|load failed|net::/i.test(m)) return "连不上模型服务（网络不通或被跨域拦截）";
      var st = /\bHTTP\s*(\d{3})\b/i.exec(m);
      if (st) return { "401": "接口密钥无效（HTTP 401）", "403": "接口拒绝访问（HTTP 403）", "429": "请求太频繁，稍后再试（HTTP 429）" }[st[1]]
        || "模型服务返回 HTTP " + st[1];
      return m;
    },

    /* 「上游忙」这笔账怎么说，只在这一处（v1.3 D3）：api 内部与阅读页、助手都说同一句，
       免得「重问 / 重试 / 退避」三种说法在不同文件里各长一半。
       retryTail 接在长句中段（带分隔点），retryNote 给行内短账用（裸句）。 */
    retryTail: retryTail,
    retryNote: retryNote,

    /* 书仓书（EPUB）：开书前把正文取进内存，之后 localContent 同步可读。
       失败如实抛出，由阅读页给出「回书架重新导入」的出口，不假装是一本空书。 */
    async diskContent(doc) {
      if (!doc || doc.src !== "disk" || !doc.bookId) return null;
      if (diskCache[doc.id]) return diskCache[doc.id];
      return diskFetch(doc);
    },

    /* 同步读取合并后的任务清单（任务页首屏用） */
    localTasks() { return mergedTasks(); },

    /* GET /api/notes?docId= —— 笔记 / 高亮 / 书签 */
    async fetchNotes(docId) {
      await delay(200);
      var all = InkStore.getNotes();
      return { code: 0, data: docId ? all.filter(function (n) { return n.docId === docId; }) : all };
    },

    /* POST /api/notes —— 新建或更新笔记（含高亮、批注、大纲、脑图） */
    async saveNote(note) {
      await delay(320);
      note.id = note.id || "n-" + Date.now();
      note.at = note.at || new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      note.ntype = note.ntype || "md";
      /* stored=false：存储满/禁写，条目只在本会话内存里 —— 展示层据此换掉「已保存」的说法 */
      var stored = InkStore.upsertNote(note);
      return { code: 0, data: note, stored: stored };
    },

    /* DELETE /api/notes/{id} —— 只在已存储底表上删，演示列表不整份入库（v2.11 B3） */
    async deleteNote(id) {
      await delay(200);
      InkStore.setNotes(InkStore.storedNotes().filter(function (n) { return n.id !== id; }));
      return { code: 0 };
    },
    /* POST /api/tasks/{id}/checkin —— 打卡并双端同步 */
    async checkin(taskId) {
      await delay(380);
      var time = nowHM();
      /* stored=false：打卡没写进存储（配额满/禁写）—— 展示层不许再说「已本地保存」 */
      var stored = InkStore.setCheckin(taskId, time);
      /* v2.7 统计埋点：打卡成功即记当日 checks，并查里程碑 —— 新到节点广播
         ink:milestone 事件，由展示层（InkCheer 弹窗）监听；纯 API 环境（无组件 /
         无 document）下 dispatch 必须静默失败，绝不因没有弹窗而让打卡报错。 */
      try {
        statsBump("checks", 1);
        var ms = statsMilestone();
        if (ms.hit) {
          try { document.dispatchEvent(new CustomEvent("ink:milestone", { detail: ms })); } catch (e2) {}
        }
      } catch (e) {}
      return { code: 0, data: { taskId: taskId, time: time, synced: true, stored: stored } };
    },

    /* DELETE /api/tasks/{id}/checkin
       口径（v2.7）：撤销打卡不回退 stats 的 checks —— 统计层只记「这一天打过卡」这个事实，
       历史留痕、简单口径；连续的断与续由 milestones 记录，不做时间旅行式回滚
       （否则「打了又撤、撤了又打」能反复刷里程碑）。 */
    async undoCheckin(taskId) {
      await delay(200);
      InkStore.removeCheckin(taskId);
      return { code: 0 };
    },

    /* ------------------------------------------------------------
       v2.7 阅读统计出口
       ------------------------------------------------------------ */
    /* 记一笔：kind ∈ "sec"|"words"|"checks"（checks 只写当日，sec/words 同时记 total）。
       内存累加 + 防抖落库（2 秒 / 每 5 次），返回更新后的当日对象。 */
    statsBump(kind, amount) { return statsBump(kind, amount); },
    /* 今日 {sec, words, checks}（含尚未落库的内存挂账） */
    statsToday() { return statsToday(); },
    /* 区间汇总 {sec, words, days}；kind ∈ "day"|"week"(周一起)|"month"|"year"|"total"，
       days = 该区间有效阅读天数（单日满 60 秒，微信读书口径） */
    statsRange(kind) { return statsRange(kind); },
    /* {streak, activeDays}：streak 从今天（今天无打卡则昨天）回数的连续打卡天数；
       activeDays = 有阅读时长或打卡的天数 */
    statsStreak() { return statsStreak(); },
    /* {wpm, source, sample}：实测阅读速度（字/分钟）——剩余时间估算的真实依据。
       传 docKind（8 类别 key）优先取该类别的实测值（source:"kind"）。 */
    readSpeed(docKind) { return readSpeed(docKind); },
    /* 按类别累积速度样本（阅读页计时/字数埋点同步调用） */
    speedBump(docKind, kind, amount) { speedBump(docKind, kind, amount); },
    /* 里程碑检测：新到 30 / 365 的倍数返回 {hit:true, level, days, round, isAnniversary}
       并记账防重复；未到节点返回 {hit:false} */
    statsMilestone() { return statsMilestone(); },
    /* 立即落库（页面隐藏 / 离开前调用，不丢挂账）；返回今日对象 */
    statsFlush() { return statsFlush(); },

    /* PATCH /api/tasks/{id} —— 分配任务
       落 inkread.tasks.v1（{taskId:{assignee}}），刷新后仍在；
       DB.tasks 里的内存副本同步一份，让当次会话立即生效（mock 原对象不动）。 */
    /* PATCH /api/tasks/{id}/today —— 「加入今日」：只加一个布尔标记，
       任务仍留在它自己的清单里（今日聚焦是筛选视图，不是搬家的容器）。 */
    async setToday(taskId, on) {
      await delay(120);
      var all = taskStoreGet();
      var rec = all[taskId] || {};
      if (on) rec.today = 1; else delete rec.today;
      all[taskId] = rec;
      taskStoreSet(all);
      return { code: 0 };
    },

    /* POST /api/docs/parse —— 解析文档抽取任务（分阶段回调 onStep）
       本地规则引擎（真的在解析文本，不再返回预置清单）：逐行扫描，命中任一规则的行视为任务条目 ——
       ① 行首为列表前缀（- / * / 1.）；② 行内含时间词或任务动词
         （周 / 月 / 日 / 每天 / 每周 / 每月 / 完成 / 背 / 做 / 复习 / 提交 / 整理…）。
       长度限定 8–60 字；标题行（#）与围栏代码块只作结构、不算任务。
       ② 只用于「一行一条」的清单文本：非列表行若带句末标点（。，！？…）或连着三个以上
       顿读子句，按散文段落丢弃，避免报告 / 论文正文被整段抽成待办。
       无命中时返回空数组，由调用方提示「未识别到任务条目」。 */
    async parseDocument(fileName, text, onStep) {
      var steps = [
        { name: "读取文档结构", note: "按行扫描 · 跳过代码块与空行" },
        { name: "识别条目前缀", note: "- / * / 1. 列表行 · - [ ] 复选框" },
        { name: "匹配动词与时间词", note: "完成 · 复习 · 提交 · 每日 / 每周 / 每月" },
        { name: "归组生成清单", note: "命中条数在下方如实给出" }
      ];
      for (var i = 0; i < steps.length; i++) {
        onStep && onStep(i, "doing");
        await delay(560 + Math.random() * 300);
        onStep && onStep(i, "done");
      }
      var ex = extractTasks(text, fileName);
      return { code: 0, data: { fileName: fileName, tasks: ex.tasks, count: ex.tasks.length, checked: ex.checked } };
    },

    /* POST /api/docs/import —— 导入文档
       入参 payload：{kind: book|textbook|paper|report|plan|note|comic|other, group, tags:[…], fileName, title,
                      blocks:[…可选，结构化正文块，形状与 mock DB.contents 一致],
                      words: 字数（可选）,
                      tasks:[{x, today, kind, month, monthLabel, phase}]（可选，解析确认后的任务条目）}
       落一条真实书架记录（inkread.shelf.v1），书架与分组筛选即时可见；
       正文块落 inkread.contents.v1（阅读页直接可读，导入的不再是空书）；
       任务落 inkread.tasks.v1（任务页合并可见）；
       并在这一刻把「文件名 → 用户最终选的类别」沉淀进 kindmap（inkread.kindmap.v1）。 */
    async importDoc(payload) {
      await delay(500);
      var o = payload || {};
      var kind = isKind(o.kind) ? o.kind : "book";
      var themeMap = { book: "novel", paper: "academic", plan: "plan", comic: "comic",
                       textbook: "academic", report: "academic", note: "novel", other: "plan" };
      var motifMap = { book: "seal", paper: "rule", plan: "seal", comic: "panel",
                       textbook: "grid", report: "wave", note: "seal", other: "mountain" };
      var tones = [
        ["#e7e0cb", "#9e3b2b"], ["#dfe5dc", "#5d6b54"], ["#e3dccb", "#6b5a33"], ["#dde2e6", "#4a6472"]
      ];
      var words = Math.max(0, Number(o.words) || 0);
      var disk = o.src === "disk";     /* 书仓书：正文与插图落在本机 ebooks，条目只留指针 */
      var entry = {
        id: "imp-" + Date.now().toString(36),
        type: kind, theme: themeMap[kind] || "novel",
        title: o.title || o.fileName || "未命名导入文档",
        author: (disk && o.author) || "本地导入", meta: "刚导入" + (o.group ? " · " + o.group : ""),
        tone: tones[Math.floor(Math.random() * tones.length)],
        motif: motifMap[kind] || "seal",
        progress: 0,
        pages: words ? Math.max(1, Math.ceil(words / 800)) : 1,   /* 按每页约 800 字估 */
        words: words, minutes: 0,
        tags: (o.tags || []).slice(),
        group: o.group || "",
        desc: o.fileName ? "导入文件：" + o.fileName : "本地导入文档。"
      };
      /* 封面用服务端探明的那张图（/e/<id>/assets/…），不压成 dataURL 挤进 localStorage；
         书仓端点随书落盘，离线也在。没有封面时 coverImg 留空 → 书架回退平涂纹样。 */
      if (disk) {
        entry.src = "disk";
        entry.bookId = o.bookId || "";
        entry.coverImg = o.cover || "";
        entry.lang = o.lang || "";
        entry.chapters = Number(o.chapters) || 0;
        entry.desc = "EPUB 藏书" + (o.fileName ? " · 原文件 " + o.fileName : "") +
          " · 正文与插图存在本机书仓，不占浏览器快照空间";
      }
      /* 正文落库赶在写书架之前：stored 是条目上的字段，晚一步就得再改一次库。
         写不进去不再假装成功 —— 条目留在书架并打 stored:"none"，界面显示
         「仅本机 · 正文未落库」，而不是让用户下次开书撞上一片空白。 */
      var readable = disk ? !!entry.bookId : (Array.isArray(o.blocks) && o.blocks.length > 0);
      var cSt = null;
      if (readable && !disk) {
        cSt = contentsSet(entry.id, o.blocks);
        entry.stored = cSt.ok ? "local" : "none";
        if (!cSt.ok) entry.storedWhy = cSt.why;
      } else if (disk) {
        entry.stored = "disk";      /* 正文在本机书仓，不占快照空间 */
      }
      if (window.InkStore) {
        InkStore.setShelf([entry].concat(InkStore.getShelf()));
        /* 书架这一键也可能撞同一堵墙：写完回读一次，库里查不到这条
           就说明它只活在当前页面 —— 与其骗用户「已导入」，不如标成未落库让他看得见。 */
        if (entry.stored !== "none" && !InkStore.getDoc(entry.id)) {
          entry.stored = "none";
          entry.storedWhy = "shelf";
        }
      } else {
        DB.shelf.unshift(entry);
      }
      /* 目录账随书落地（v1.1-S5b 路径 C）：nav/ncx 在服务端已经解好（含每条的锚点与
         正文内链的位置），导入即入册 —— 开书第一页就能点书里自带的目录，不必等用户
         先打开一次面板。解不出条目也不建空账：没有记录时阅读页照旧按标题生成大纲。 */
      var tocRec = tocFromServer(o.toc);
      if (tocRec) tocSave(entry.id, tocRec);
      /* 学习时刻：用户确认导入 = 「这个文件名属于这个类别」的一次真实标注。
         用户改过推荐也照存（按最终选的类别沉淀），下次同类命名优先按映射推荐。 */
      kindmapLearn(o.fileName || entry.title, kind);

      /* 确认导入的任务：逐条落 inkread.tasks.v1（形状与 mock DB.tasks 对齐，缺省字段留空）。
         解析期 id（t-1、t-2…）只在弹窗内用 —— 落库时换成全局唯一 id，多次导入互不覆盖。 */
      var nTasks = 0, tasksStored = true;
      if (Array.isArray(o.tasks)) {
        var all = taskStoreGet();
        o.tasks.forEach(function (t) {
          var x = String((t && t.x) || "").trim();
          if (!x) return;
          nTasks++;
          /* 月度项按解析出的月份落库（kind/month/monthLabel/phase 一路带过来）；
             时间位交给月份本身 —— taskCard 读 time || monthLabel、week || phase。 */
          var isM = t.kind === "monthly" && !!t.month;
          all["t-" + entry.id.slice(4) + "-" + nTasks] = {
            assignee: "",
            today: (t && t.today) ? 1 : 0,
            x: x, docId: entry.id, kind: isM ? "monthly" : "daily",
            week: isM ? "" : "导入", time: isM ? "" : "—",
            month: isM ? String(t.month) : "",
            monthLabel: isM ? String(t.monthLabel || "") : "",
            phase: isM ? String(t.phase || "") : "",
            src: o.fileName || "本地导入",
            at: new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
          };
        });
        if (nTasks) tasksStored = taskStoreSet(all);
      }
      return {
        code: 0,
        data: {
          docId: entry.id, tasks: nTasks, tasksStored: tasksStored,
          readable: readable, stored: entry.stored || "", storedWhy: entry.storedWhy || ""
        }
      };
    },

    /* 主脑对话不在这里 —— 走 brain.js 的 Brain.ask()：
       在线交给你接入的模型（多轮 + 流式），离线只用离线库。
       曾经那条「按关键词命中预置回复」的桩已删除 —— 主脑不该答预设题。 */

    /* POST /api/ai/explain —— 辅助阅读 · 解析选中文本
       入参：text 选中文字；ctx{doc,chapter,page,anchor}
       出参：{kind,title,lead,items:[{k,v}],terms:[{w,pos,mean}],engine,note}
       主脑在线时由模型拆解（真正读得懂这段在讲什么）；离线或失败时退回本地词表解析，
       并在 note 里说清是哪一种。 */
    async aiExplain(text, ctx) {
      var src = String(text || "").trim();
      var cfg = getModelCfg();
      if (src && cfg.baseUrl && cfg.key && cfg.model) {
        /* 缓存键必须带文档标识：同一句话在两本书里，上下文包不同，答案不该复用 */
        var ck = cacheKey("explain", src + "|" + (ctxDocId(ctx) || "") + "|" + ((ctx && ctx.chapter) || ""), cfg);
        var hit = cacheGet(ck);
        if (hit) return { code: 0, data: Object.assign({}, hit, { cached: true }) };
        try {
          var d = await callExplain(src, ctx, cfg);
          cacheSet(ck, d);
          return { code: 0, data: d };
        } catch (e) {
          var st = explainStub(src, ctx);
          /* 结构化那一栏是本地词表给的 —— 模型的原文只作附件，来源账不能记成 ai */
          st.by = "rule";
          if (e && e.name === "UnstructuredError") {
            /* 模型说了话、只是没成结构：话如实交出去，别把它按进「解析失败」里 */
            st.unstructured = true;
            st.raw = String(e.raw || "").slice(0, 4000);
            st.note = "模型的回复没有成为可分栏的结构，下面附上它的原话；本地词表解析垫底。";
          } else {
            st.note = "主脑解析失败：" + window.API.netErrPhrase(e) +
              retryTail(e && e.netRetried) + "，已改用本地词表解析。";
          }
          return { code: 0, data: st };
        }
      }
      /* 无模型这一路：本机词表 + 句式规则垫底。v1.3 D2 删掉了这里那颗 560ms 假延迟，
         并把「是谁算的」写进 note —— 界面（reader-app 的 aux-note）如实显示。 */
      var st0 = explainStub(src, ctx);
      st0.by = "rule";
      st0.note = "未配置模型，以下由本机词表与句式规则给出，未调用主脑。" +
        (st0.note ? "（" + st0.note + "）" : "");
      return { code: 0, data: st0 };
    },

    /* POST /api/ai/trace —— 辅助阅读 · 溯源（出处考证）
       溯源 = 对一切事物溯清来源：事、物、人、时、地皆可溯。
       事件 / 典故 / 节日 / 文献内容……只是举例，凡「它从哪来、谁先说、原话是什么」皆属溯源。
       因此分两层作答：
       ① 主层（需模型）—— 先辨类，再考据：类别 / 一句话定性 / 最早出处 / 原始表述 /
          含义与本末 / 后世沿用 / 存疑。要求模型宁可写「未详」也不许编造。
       ② 附层（本地即时）—— 它在本书正文里的落点，供读者回看上下文。
       未配置模型时：附层照常给出，主层明说「未接模型，无法考据」，绝不假装。
       入参：text；corpus 正文块数组（{bi,anchor,chapter,text,page,pct}）；ctx 当前上下文
       出参：{query,kind,title,lead,facts,origin,meaning,related,refs,doubt,hits,count,exact,engine,note} */
    async aiTrace(text, corpus, ctx) {
      var src = String(text || "").trim();
      var local = traceStub(src, corpus, ctx);       /* 附层：本地即可给，先算出来垫底 */
      var blank = {
        kind: "", title: "", lead: "", facts: [], origin: null,
        meaning: "", related: [], refs: [], doubt: "", engine: ""
      };
      if (!src) return { code: 0, data: Object.assign({}, blank, local, { by: "rule" }) };

      var cfg = getModelCfg();
      if (!cfg.baseUrl || !cfg.key || !cfg.model) {
        /* v1.3 D2：删掉这里那颗 200ms 假延迟 —— 本地落点本机即时就有，不必装成在等云端 */
        return { code: 0, data: Object.assign({}, blank, local, {
          by: "rule",
          note: "未配置模型，暂时只能给出「在本文中的落点」。到「主脑 · 模型配置」填好接口地址与密钥，即可考据它的出处与本原。"
        }) };
      }

      var ck = cacheKey("trace", src + "|" + (ctxDocId(ctx) || ""), cfg);
      var hit = cacheGet(ck);
      if (hit) return { code: 0, data: Object.assign({}, hit, { hits: local.hits, count: local.count, exact: local.exact, query: src, cached: true }) };

      try {
        var d = await callTrace(src, ctx, cfg);
        cacheSet(ck, d);
        return { code: 0, data: Object.assign({}, d, {
          hits: local.hits, count: local.count, exact: local.exact, query: src,
          note: local.hits.length ? "" : "正文里没有它的落点，以下为出处考据。"
        }) };
      } catch (e) {
        var un = e && e.name === "UnstructuredError";
        return { code: 0, data: Object.assign({}, blank, local, {
          by: "rule",
          unstructured: un, raw: un ? String(e.raw || "").slice(0, 4000) : "",
          note: un
            ? "模型的回复没有成为可分栏的结构，下面如实附上它的原话。"
            : "考据请求失败：" + window.API.netErrPhrase(e) +
              retryTail(e && e.netRetried) + "，已退回「在本文中的落点」。"
        }) };
      }
    },

    /* POST /api/ai/search —— 书中模糊检索：粗略描述 → 最接近的段落
       入参：query 自然语句；corpus 正文块数组（{bi,anchor,chapter,text,page,pct}）
       出参：{ mode:"ai", count, note, hits:[{bi,anchor,chapter,page,pct,text,at,term,reason}] }
       主脑在线时由模型重排（真正读得懂「粗略描述」）；离线或失败时退回本地字符 shingle 加权，
       并在 note 里说清是哪一种 —— 检索结果的可信度取决于是否诚实标注来源。 */
    async aiSearch(query, corpus) {
      var list = Array.isArray(corpus) ? corpus : [];
      var q = String(query || "").trim();
      var cfg = getModelCfg();
      if (q && list.length && cfg.baseUrl && cfg.key && cfg.model) {
        var ck = cacheKey("search", q + "|" + list.length + "|" + (ctxDocId({}) || ""), cfg);
        var hit = cacheGet(ck);
        if (hit) return { code: 0, data: Object.assign({}, hit, { cached: true }) };
        try {
          var d = await callSearch(q, list, cfg);
          cacheSet(ck, d);
          return { code: 0, data: d };
        } catch (e) {
          var loc = localSearch(q, list);
          var un = e && e.name === "UnstructuredError";
          if (un) { loc.unstructured = true; loc.raw = String(e.raw || "").slice(0, 2000); }
          loc.by = "rule";
          loc.why = "failed";
          /* fail 是给界面那一行短账用的（「主脑没成 · 超时」），note 才是完整说明 */
          loc.fail = String(un ? "回复没成结构" : window.API.netErrPhrase(e)).slice(0, 40);
          loc.note = (un ? "主脑的回复没有成为可分栏的结构" : "主脑检索失败：" + window.API.netErrPhrase(e))
            + "，已改用本地字符检索。";
          return { code: 0, data: loc };
        }
      }
      /* 走到这里 = 主脑没参与（没配模型 / 没描述 / 正文没有块）。v1.3 D2 删掉了这颗 560ms 假延迟，
         并把来源写成 by:"rule" 交给界面说真话 —— 旧界面拿 hasModel() 反推来源，
         模型配了但这一次没打成时会被错标成「未接模型」。 */
      var loc0 = localSearch(q, list);
      loc0.by = "rule";
      if (q && list.length && !(cfg.baseUrl && cfg.key && cfg.model)) {
        loc0.why = "no-model";
        loc0.note = "未配置模型，以下由本机字符片匹配给出，未调用主脑。" +
          (loc0.note ? " " + loc0.note : "");
      }
      return { code: 0, data: loc0 };
    },

    /* POST /api/sync —— 演示同步：原型没有云端，所有数据本机即时落盘（localStorage），
       这里只做节奏演示并如实说明，不假装发生过双端传输。 */
    /* POST /api/ai/model —— 保存模型配置（接口地址 / 密钥 / 模型名 / 高级参数）
       存本机 localStorage；接入真实服务时改为写服务端配置，请求体与响应形状不变。 */
    async saveModelConfig(cfg) { await delay(420); return { code: 0, data: setModelCfg(cfg) }; },
    /* POST /api/themes/{k}/install —— 下载并安装主题 */
    async installTheme(k) {
      await delay(520);
      if (window.InkTheme) InkTheme.install(k);
      return { code: 0, data: { k: k, installed: true } };
    },

    /* DELETE /api/themes/{k}/install —— 卸载主题（删除本地副本，色值仍可重新下载） */
    async uninstallTheme(k) {
      await delay(260);
      if (window.InkTheme) InkTheme.uninstall(k);
      return { code: 0 };
    },

    /* POST /api/themes —— 保存自建主题 */
    async saveTheme(t) {
      await delay(360);
      if (window.InkTheme) InkTheme.customSave(t);
      return { code: 0, data: t };
    },

    /* DELETE /api/themes/{k} —— 删除自建主题 */
    async deleteTheme(k) {
      await delay(220);
      if (window.InkTheme) InkTheme.customRemove(k);
      return { code: 0 };
    },

    /* POST /api/tts —— 朗读（真声）
       入参：text；opts{voice:音色 k, onTick(0..1)}
       链路：① Edge 神经语音（本地 /api/tts，音质最好、朗读与试听同源）
            ② 自配 Moss 云音色（有密钥时）
            ③ 本机系统声线（离线兜底，逐候选试、哑火就换）
            ④ 计时模拟（无头 / 无声线环境，界面行为一致）
       出参：{code, data:{mode:"neural"|"cloud"|"speech"|"sim", voice}} */
    async speak(text, opts) {
      var o = opts || {};
      var body = String(text || "").trim();
      var onTick = typeof o.onTick === "function" ? o.onTick : function () {};
      var v = (window.InkVoice && window.InkVoice.meta(o.voice || window.InkVoice.current())) || null;
      if (!body) return { code: 0, data: { mode: "sim", voice: "" } };

      /* ① Edge 神经语音：默认链路，任意文本都自然有起伏 */
      var neural = await neuralSpeak(body, v, onTick);
      if (neural) return neural;

      /* ② 云音色：配了密钥就走真·云端合成。
         当前音色若没有 voice_id（内置神经音色在 APK / 静态托管下拿不到本机
         /api/tts），退用账号里的第一款云音色 —— 安卓端只填一次密钥即可朗读，
         不必再回音色商城挑一遍。 */
      var tc = ttsCfg();
      if (tc.key && tc.baseUrl) {
        var cv = (v && v.moss) ? v
          : (window.InkVoice ? InkVoice.cloud().filter(function (x) { return x.moss; })[0] : null);
        if (cv) {
          var cloud = await cloudSpeak(body, cv, onTick, tc);
          if (cloud) return cloud;
        }
      }

      /* ③ 本机声线：好声线优先 + 候选封顶 4 条；只在一句都没读出来时才换声线。
         默认不走到这里 —— 机械音顶替神经音读者察觉不到，等于「音色坏了」；
         只有显式打开断网兜底才用它（离线 / 静态托管的活路）。 */
      if (!sysFallbackOn()) return { code: 0, data: { mode: "none", voice: "", note: "神经合成未响应 · 可在朗读设置里开本机声线兜底" } };
      var synth = window.speechSynthesis;
      var U = window.SpeechSynthesisUtterance;
      if (!synth || typeof U !== "function") return simulateSpeech(body, onTick, v);
      var voices = await waitVoices(synth, 1200);
      if (!voices.length) return simulateSpeech(body, onTick, v);
      _ttsAbort = false;
      var cands = limitCands(window.InkVoice ? window.InkVoice.candidates(v, body, voices) : []);
      var chunks = chunkText(body, 160);
      for (var i = 0; i < cands.length; i++) {
        try { synth.cancel(); } catch (e) {}
        var r = await speakChunks(synth, U, chunks, cands[i], v, onTick);
        if (_ttsAbort) return { code: 0, data: { mode: "speech", voice: cands[i].name || "" } };
        if (r.ok) { rememberSysVoice(cands[i]); return { code: 0, data: { mode: "speech", voice: cands[i].name || "" } }; }
      }
      return simulateSpeech(body, onTick, v);
    },

    /* DELETE /api/tts —— 停止朗读 */
    stopSpeak() {
      _ttsAbort = true;
      stopNeural();
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
      try { if (_cloudAudio) { _cloudAudio.pause(); _cloudAudio = null; } } catch (e) {}
      return { code: 0 };
    },

    /* GET /api/tts/engine —— 听书引擎（段落队列，见 ttsEngine 注释） */
    ttsEngine: ttsEngine,

    /* GET/POST /api/tts/sysfallback —— 断网兜底开关（见 sysFallbackOn 注释） */
    ttsSysFallback(on) {
      if (on === undefined) return sysFallbackOn();
      try { on ? localStorage.setItem(K_SYSFB, "1") : localStorage.removeItem(K_SYSFB); } catch (e) {}
      return sysFallbackOn();
    },

    /* GET/POST /api/tts/volume —— 朗读音量（0–1，缺省 1；仅本机，不进同步）。
       写值时顺手把「正在放的那条」也改掉 —— 否则要等下一段才生效，读长段落时会像「没反应」。 */
    ttsVol(v) {
      if (v === undefined) return ttsVol();
      var nv = ttsVolSet(v);
      try { if (_cloudAudio) _cloudAudio.volume = nv; } catch (e) {}
      try { if (_neuralAudio) _neuralAudio.volume = nv; } catch (e) {}
      return nv;
    },

    /* 等系统声线列出来（首次取常是空数组）—— 试听与朗读共用这一份实现 */
    waitVoices: waitVoices,

    /* GET /api/tts/config · POST /api/tts/config —— 云音色（Moss）配置 */
    ttsConfig() { var c = ttsCfg(); return { code: 0, data: { baseUrl: c.baseUrl, model: c.model, hasKey: !!c.key } }; },
    saveTtsConfig(cfg) { var c = setTtsCfg(cfg); return { code: 0, data: { baseUrl: c.baseUrl, model: c.model, hasKey: !!c.key } }; },

    /* 试听自证：对指定云音色直接真合成一次（内部取 Moss 配置，走 /api/mossapi 代理）。
       resolve 合成结果（{code:0,...}）；无密钥或合成失败 resolve null ——
       调用方（音色商城试听）以此明示成败，不悄悄降级。 */
    cloudAudition(text, voice) {
      var tc = ttsCfg();
      if (!tc.key || !tc.baseUrl || !voice) return Promise.resolve(null);
      return cloudSpeak(String(text || ""), voice, null, tc);
    },

    /* GET /api/tts/cloud-voices —— 拉取 Moss 账号可用音色，并入音色目录
       出参：{code, data:{count, voices:[{k,name,mood,lang,gender,age,cat}]}} */
    async mossVoices() {
      var c = ttsCfg();
      if (!c.key || !c.baseUrl) return { code: 1, msg: "未配置 Moss 密钥", data: { count: 0, voices: [] } };
      try {
        /* 走 /api/mossapi 本机代理（CORS 集中解决，见 serve.js）；file:// 直开才直连 */
        var res = location.protocol !== "file:"
          ? await fetch("/api/mossapi/voices", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ baseUrl: c.baseUrl, key: c.key })
            })
          : await fetch(String(c.baseUrl).replace(/\/+$/, "") + "/audio/voices", {
              headers: { "Authorization": "Bearer " + c.key }
            });
        if (!res.ok) {
          var em = "";
          try { var ej = await res.json(); em = ej.message || ej.msg || ""; } catch (e) {}
          return { code: 1, msg: "拉取失败 · HTTP " + res.status + (em ? " · " + em : ""), data: { count: 0, voices: [] } };
        }
        var j = await res.json();
        var arr = j.data || j.voices || j.items || (Array.isArray(j) ? j : []);
        if (!Array.isArray(arr)) arr = [];
        var merged = window.InkVoice ? window.InkVoice.addCloudVoices(arr) : [];
        return { code: 0, data: { count: merged.length, voices: merged.map(function (x) {
          return { k: x.k, name: x.name, mood: x.mood, lang: x.lang, gender: x.gender, age: x.age, cat: x.cat };
        }) } };
      } catch (e) { return { code: 1, msg: "拉取失败 · " + window.API.netErrPhrase(e), data: { count: 0, voices: [] } }; }
    },
    /* POST /api/ai/classify —— 文档类别识别（8 类候选的「选择题」）
       入参：{fileName, text}
       出参：{kind, reason, by:"ai"|"rule"}（kindmap 命中时另带 learned:true）
       有模型 → 走 callChat 真 AI 分类（system 里附 kindmap 个性化上下文，限 8 条）；
       无模型 / 请求失败 / 模型输出不可解析 → 本地启发式回退（by:"rule"），绝不假装是 AI。 */
    async classifyDoc(input) {
      var o = input || {};
      var fileName = String(o.fileName || "");
      var text = String(o.text == null ? "" : o.text);
      if (hasModelNow()) {
        try {
          var ai = await classifyAI(fileName, text, getModelCfg());
          return { kind: ai.kind, reason: ai.reason, by: "ai" };
        } catch (e) { /* 网络 / 输出非法：落到规则路径，by 如实标 rule */ }
      }
      return kindByHeuristic(fileName, text, o.fmt);
    },

    /* 本地启发式分类（纯函数，不打网络）—— 无模型时的规则路径，页面可单独调用 */
    classifyHeuristic(fileName, text, fmt) { return kindByHeuristic(fileName, text, fmt); },
    /* POST /api/ai/mode —— 内容类别识别：返回推荐阅读模式 + 依据
       入参：doc（书架元数据）、blocks（正文块）
       出参：{mode, conf, why:[…], scores:{book,paper,study,comic}, alt, by:"ai"|"rule", note}
       双轨（v1.3 D1）：
       ① kindmap 命中（书名含用户历史归类过的关键词）→ 本机账就够定，不打网络，by:"rule"；
       ② 其余先算本机打分表（guessMode），配了模型就把这张表交给主脑判（mode.suggest 槽）：
          模式键落在白名单内才认，标 by:"ai"；未配 / 失败 / 越界一律退回本机打分表并如实标 by:"rule"。
       以前这里只有 ② 的本地那一半，外面还包着一颗 400ms 假延迟装「正在识别」—— 那颗已删。 */
    async suggestMode(doc, blocks) {
      var d = doc || {};
      var hit = kindmapLookup(d.title || "");
      if (hit) {
        var mode = KIND_MODE[hit.kind] || "study";
        var sc = { book: 0, paper: 0, study: 0, comic: 0 };
        sc[mode] = 72;
        return { code: 0, data: {
          mode: mode, conf: 82, learned: true, by: "rule",
          why: ["依据你的历史归类：含「" + hit.key + "」的文档你归为「" + kindCN(hit.kind) + "」"],
          scores: sc, alt: null, ambiguous: false,
          note: "依据你的历史归类推荐（kindmap 本机学习所得，未调用模型）。"
        } };
      }
      var r = guessMode(doc, blocks);
      r.by = "rule";
      r.note = "本机打分：依据书架归类与正文排版特征逐项加权，未调用模型。";
      var cfg = getModelCfg();
      if (!(cfg.baseUrl && cfg.key && cfg.model)) return { code: 0, data: r };

      /* 模型只看本机算好的证据下结论：正文不必重发给它，本机也不假装没参与 */
      try {
        var p = await Prompt.run("mode.suggest", modeEvidence(d, r),
          { cfg: cfg, vars: { modeKeys: MODE_DESC } });
        var mk = String((p.j || {}).mode || "").trim();
        if (MODE_KEYS.indexOf(mk) < 0) {
          r.note = "主脑回了一个不在名册里的模式键「" + (mk || "空") + "」，已改用本机打分。";
          return { code: 0, data: r };
        }
        var localTop = r.mode;
        var mc = Math.round(Number((p.j || {}).conf));
        r.by = "ai";
        r.mode = mk;
        r.conf = (isFinite(mc) && mc >= 0 && mc <= 100) ? mc : null;
        r.ambiguous = r.conf === null ? (mk !== localTop) : r.conf < 55;
        r.alt = mk === localTop ? r.alt : localTop;
        r.why = ["主脑判读：" + String((p.j || {}).reason || "未给出理由").slice(0, 60)]
          .concat(r.why).slice(0, 4);
        r.note = "由你接入的模型判读（" + p.model + "），本机打分表列在下面各条依据里" +
          (p.retried ? " · 格式纠正重试过 1 次" : "") + retryTail(p.net) + "。";
        return { code: 0, data: r };
      } catch (e) {
        r.note = (e && e.name === "UnstructuredError")
          ? "主脑的回复没有成为可解析的 JSON，以下为本机打分结果。"
          : "主脑判读失败：" + window.API.netErrPhrase(e) + retryTail(e && e.netRetried) +
            "，以下为本机打分结果。";
        return { code: 0, data: r };
      }
    },

    /* POST /api/translate —— 翻译（多语言互译）
       入参：text；opts{mode:"word"|"para"|"hover", from:"auto"|语种, to:语种|"ai"}；onDelta(增量文字) 可选
       出参：{src,dst,from,to,toName,engine,terms:[…],note}
       from 默认 auto（由模型判断原文语言）；to 默认 zh（中文读者）；
       to="ai" 时由主脑按原文内容判断该译成什么语言 —— 中文书里的英文引文，默认该译回中文。
       结果按「原文 + 语向 + 模型」缓存：同一段反复划选不再打网络（命中即回，卡片标注「取自缓存」）。
       传了 onDelta 则走流式：译文逐字落到浮层上，首字即显。 */
    async translate(text, opts, onDelta) {
      var o = opts || {};
      var src = String(text || "").trim();
      var from = o.from || "auto";
      var to = o.to || "zh";
      if (!src) return { code: 0, data: translateStub(src, o) };
      var cfg = getModelCfg();
      if (!cfg.baseUrl || !cfg.key || !cfg.model) {
        await delay(180 + Math.random() * 160);
        var d0 = translateStub(src, o);
        if (!d0.note) d0.note = "未配置模型，当前为原型译文；在「主脑 · 模型配置」填好接口地址与密钥后即为真实翻译";
        d0.from = from; d0.to = to; d0.toName = langName(to) || to;
        return { code: 0, data: d0 };
      }
      var ck = cacheKey("tr", src + "|" + from + ">" + to, cfg);
      var hit = cacheGet(ck);
      if (hit) return { code: 0, data: Object.assign({}, hit, { cached: true }) };
      try {
        var d = await callTranslate(src, o, cfg, from, to, onDelta);
        cacheSet(ck, d);
        return { code: 0, data: d };
      } catch (e) {
        await delay(120);
        var d1 = translateStub(src, o);
        d1.from = from; d1.to = to; d1.toName = langName(to) || to;
        d1.note = "模型请求失败：" + window.API.netErrPhrase(e) + "，已回退原型译文";
        return { code: 0, data: d1 };
      }
    },

    /* GET /api/translate/langs —— 语言表：源（含自动检测）+ 目标（含 AI 智能） */
    async fetchLangs() {
      return { code: 0, data: {
        src: [{ k: LANG_AUTO.k, n: LANG_AUTO.n }].concat(LANGS.map(function (l) { return { k: l.k, n: l.n }; })),
        dst: [{ k: "ai", n: "AI 智能" }].concat(LANGS.map(function (l) { return { k: l.k, n: l.n }; })),
        defSrc: "auto", defDst: "zh"
      } };
    },

    /* GET /api/ai/model —— 读取模型配置（含预设与已填项） */
    async fetchModelConfig() {
      await delay(180);
      return { code: 0, data: getModelCfg() };
    },
    /* 归一化与预设识别：界面与本机共用一套规则，免得两处各判各的 */
    modelBaseNorm(u) { return normBase(u); },
    modelPresetKey(u) { return presetKeyOfBase(u); },

    /* GET /api/ai/models —— 只做「把可用模型名拉回来」这一件事。
       不兼职测连通：拉列表与测通的失败原因不同，混在一起就会把「没有列表端点」
       说成「连通失败」，再把一次 ping 的结论当成模型列表（问题一的一条根因）。
       出参 data.kind ∈ ok | auth | network | cors | unsupported。 */
    async fetchModels(cfg) { return fetchModelsRun(cfg || {}); },

    /* POST /api/ai/model/test —— 连通性测试：真发请求（v2.4 起，不再是桩）。
       ① 先走 fetchModels（GET {base}/models）—— 实测延迟 + 真实模型列表；
       ② 仅当服务不支持 /models（404/405/501）才回退一次最小 chat completion
          （max_tokens:1 的 ping）—— 「真的能对话」比「能列模型」更贴近可用性；
       ③ 一切失败如实回报并按 kind 分类，界面据此给可操作的下一步。
       与真实对话链路同规范：baseUrl 去尾斜杠 + Bearer 头 + 12 秒超时。 */
    async testModel(cfg) { return testModelRun(cfg || {}); },

    /* ------------------------------------------------------------
       主脑出口（brain.js 专用）
       全程序的 AI 能力都从这里出网：主脑对话 / 溯源 / 翻译 / 解析 / 检索。
       业务侧只负责「说什么」，超时、错误、流式、缓存全在这一层收口。
       ------------------------------------------------------------ */
    /* 单轮：sys 为系统前言，user 为这一轮的用户内容；传 onDelta 即流式。
       opts.cfg 给调用点自带的那份配置（提示词注册表按功能路由模型时用）。 */
    llm(sys, user, opts) {
      var o = opts || {};
      return callChat(o.cfg || getModelCfg(), sys, user, o);
    },
    /* 多轮：messages 为 [{role,content}]（不含 system），用于主脑对话 */
    llmMsgs(messages, opts) {
      var o = opts || {};
      return chatMsgs(o.cfg || getModelCfg(), messages, o, typeof o.onDelta === "function");
    },
    hasModel() { var c = getModelCfg(); return !!(c.baseUrl && c.key && c.model); },
    modelCfg() { return getModelCfg(); },
    /* 主脑注册上下文提供者：此后每个 AI 功能的系统前言都会带上它给的
       记忆、行为摘要与当前文档 —— 主脑在任何入口都认识这位读者。 */
    setContextProvider(fn) { CTX_PROVIDER = fn; },
    /* 主脑订阅「用户手动改了记忆」这件事（开关 / 忘掉）——
       让所有显示记忆的界面立刻跟着变，不必轮询。 */
    setMemoryNotifier(fn) { MEM_CHANGED = typeof fn === "function" ? fn : null; },
    /* PATCH /api/ai/memory/{id} —— 开关一条记忆 */
    async saveMemoryToggle(id, on) {
      await delay(160);
      var list = getMem().map(function (m) { return m.id === id ? Object.assign({}, m, { on: !!on }) : m; });
      setMem(list);
      if (MEM_CHANGED) MEM_CHANGED({ source: "toggle", id: id });
      return { code: 0, data: list };
    },
    /* DELETE /api/ai/memory/{id} —— 忘掉一条（不是关掉，是真的删） */
    async forgetMemory(id) {
      await delay(200);
      var list = getMem().filter(function (m) { return m.id !== id; });
      setMem(list);
      if (MEM_CHANGED) MEM_CHANGED({ source: "forget", id: id });
      return { code: 0, data: list };
    },
    /* 同步读写：学习引擎（brain.js）每轮都要读旧表、写新表，不该被 await 拖住。 */
    memList() { return getMem(); },
    memWrite(list) { return setMem(list); },
    /* 术语表同步快照（内置 + 用户自建，用户优先）—— 离线库检索要用 */
    fetchGlossarySync() { return allTerms(); },

    /* GET /api/glossary —— 术语表：内置（只读）+ 用户自建（可增删） */
    async fetchGlossary() {
      await delay(160);
      return {
        code: 0,
        data: {
          builtin: Object.keys(GLOSS).map(function (w) { return { src: w, dst: GLOSS[w].en, pos: GLOSS[w].pos }; }),
          user: getUserGloss()
        }
      };
    },

    /* POST /api/glossary —— 覆盖保存用户术语（内置表不动，避免读者把自己加的词删没了内置表） */
    async saveGlossary(list) {
      await delay(280);
      return { code: 0, data: setUserGloss(list) };
    },

    /* POST /api/glossary/parse —— 解析导入文本（纯函数，不打网络）
       入参：text；opts{delim, header}
       出参：{delim,delimName,rows:[{src,dst,pos}],bad,skippedHeader}
       调研依据（DeepL 术语表导入 / Anki CSV 导入）：分隔符自动识别 + 表头自动跳过 +
       列映射（原词 / 译名 / 可选词性）—— 让读者直接丢一个 CSV 进来，不必先整理格式。 */
    parseGlossary(text, opts) { return parseGlossary(text, opts); },

    /* POST /api/glossary/import —— 批量导入并合并进用户表
       入参：rows[{src,dst,pos}]；policy:"skip"|"over"
       出参：{user,added,over,skip,total}
       同名以 policy 裁定：skip 保留现有、over 覆盖；覆盖内置 = 写一条同 src 的用户条目
       （内置表本身不动，allTerms 里用户优先）。 */
    async importGlossary(rows, policy) {
      await delay(240);
      var bset = {};
      Object.keys(GLOSS).forEach(function (w) { bset[w] = 1; });
      var bySrc = {};
      getUserGloss().forEach(function (t) { bySrc[t.src] = t; });
      var added = 0, over = 0, skip = 0, list = Array.isArray(rows) ? rows : [];
      list.forEach(function (r) {
        var src = String((r && r.src) || "").trim().slice(0, 40);
        var dst = String((r && r.dst) || "").trim().slice(0, 60);
        if (!src || !dst) return;
        var exists = !!bySrc[src] || !!bset[src];
        if (exists && policy !== "over") { skip++; return; }
        if (exists) over++; else added++;
        bySrc[src] = { src: src, dst: dst, pos: String((r && r.pos) || "").trim().slice(0, 12) };
      });
      var saved = setUserGloss(Object.keys(bySrc).map(function (k) { return bySrc[k]; }));
      return { code: 0, data: { user: saved, added: added, over: over, skip: skip, total: list.length } };
    },

    /* GET /api/cards —— 闪卡间隔重复状态，按笔记 id 索引 {id:{ef,ivl,reps,due,last}} */
    async fetchCards() {
      await delay(180);
      return { code: 0, data: getCards() };
    },

    /* POST /api/cards —— 写一张卡的复习状态（SM-2 结算后调用） */
    async saveCard(id, st) {
      await delay(140);
      return { code: 0, data: setCard(id, st) };
    },

    /* DELETE /api/cards/{id} —— 抹掉一张卡的复习记录（助手「暂停→收回」要用它把
       本来不存在的记录还原成不存在）。只删这一个键，不整表覆盖 ——
       整表覆盖要先把全表读进内存，并发复习结算时会把别人刚写的那条洗掉。 */
    async deleteCard(id) {
      await delay(120);
      var all = getCards();
      if (!id || all[id] === undefined) return { code: 1, msg: "not-found" };
      delete all[id];
      try { localStorage.setItem(K_CARDS, JSON.stringify(all)); } catch (e) { return { code: 1, msg: "save-failed" }; }
      return { code: 0, removed: String(id) };
    },

    /* POST /api/tasks —— 新建一条独立任务（v2.23 W1d′：助手「变成任务」的落点）。
       与导入任务同一口径：只有带 x 的整条记录才算独立任务（mergedTasks 按 x 判别），
       演示任务住在 DB.tasks、本机库里没有整条记录，删不掉也不该假装删得掉。
       id 在这里生成，不接受调用方自带 —— 让外面塞 id 等于允许它写进别人的键。 */
    async saveTask(task) {
      await delay(200);
      /* 助手回的是模型写的字符串，常带 `- ` 与 **：先按导入那条路同款洗一遍再落库，
         否则任务页标题里就留着裸符号。 */
      var title = taskTitle(stripTaskPrefix(String((task && (task.x || task.title)) || ""))).slice(0, 120);
      if (!title) return { code: 1, msg: "empty-title" };
      var all = taskStoreGet();
      var now = new Date();
      var id = "t-ai-" + now.getTime().toString(36) + "-" + Object.keys(all).length;
      var rec = {
        assignee: "",
        today: (task && task.today) ? 1 : 0,
        x: title, docId: (task && task.docId) || "", anchor: (task && task.anchor) || "",
        kind: "daily", week: "助手", time: "—",
        month: String(now.getMonth() + 1), monthLabel: (now.getMonth() + 1) + " 月", phase: "",
        src: (task && task.src) || "AI 助手",
        at: now.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      };
      all[id] = rec;
      var ok = taskStoreSet(all);
      return { code: ok ? 0 : 1, data: Object.assign({ id: id }, rec), stored: ok };
    },

    /* DELETE /api/tasks/{id} —— 删一条独立任务（助手撤销走这里）。
       notFound 如实返回：撤销一条没写成的任务不该报「已撤销」。 */
    async deleteTask(id) {
      await delay(160);
      var all = taskStoreGet();
      if (!id || !all[id]) return { code: 1, msg: "not-found" };
      delete all[id];
      return { code: taskStoreSet(all) ? 0 : 1, removed: String(id) };
    },

    /* 主脑工具层（ink-agent.js）复用的两条结构化出口 ——
       解析器与「要一份 JSON」的梯子（能力位 + 一次纠错重试）在 api.js 只此一份，
       工具层再抄一份就会和溯源/解析走出两套容错口径。 */
    aiJson(sys, usr, o) { return askJson(getModelCfg(), sys, usr, o || {}); },
    aiParse(txt, keys) { return parseStructured(txt, keys); },
    /* 降级通路（循环里那一半）自己从一段话里取 JSON —— 用同一把扫括号的手，
       别在循环里再写一套「找第一个 { 到最后一个 }」，那套会把围栏里的注释一起吞进去。 */
    pickJson(txt) { return pickJson(txt); },
    /* v1.1-S5c 提示词注册表的公开口 —— 表在本文件下方，这里只是梯子。
       run() 是所有 AI 功能的唯一入口：调用点只交材料与占位符，不再自带系统提示词。 */
    run(feature, input, opts) { return Prompt.run(feature, input, opts); },
    promptSys(feature, vars) { return promptText(feature, vars); },
    promptList() { return Prompt.list(); },
    promptSave(key, patch) { return Prompt.save(key, patch); },
    promptReset(key) { return Prompt.reset(key); },
    promptHas(key) { return Prompt.has(key); },
    promptParams(key, opts) { return Prompt.params(key, opts); },
    promptSecretHit(text) { return Prompt.secretHit(text); },
    /* 能力位读写（inkread.ai.cap.v1，按「接口地址 + 模型」记）：
       工具层用它记「这一家认不认原生 tool_calls」，字段里只有 0/1 与时间戳，不含密钥。 */
    capGet(field) {
      var e = capMap()[capKeyOf(getModelCfg())];
      return !e || e[field] !== 0;
    },
    capSet(field, ok) {
      var m = capMap(), k = capKeyOf(getModelCfg()), patch = {};
      patch[field] = ok ? 1 : 0; patch.at = Date.now();
      m[k] = Object.assign({}, m[k], patch);      /* 只动这一位：不能把 json 位的记账洗掉 */
      try { localStorage.setItem(K_CAP, JSON.stringify(m)); } catch (e) {}
      return m[k];
    }
  };

  /* ============================================================
     v1.1-S5c 提示词注册表（inkread.ai.prompts.v1）
     ============================================================
     内置模板一律写在下面这对哨兵之间 —— 哨兵之外再出现整句人设字面就是漏收编，
     闸按这条计数（定案 §五 / 排期第 1 刀判据①）。
     解析链：用户覆盖 → 内置默认 → 调用点参数 → callChat / askJson。
     覆盖只存改过的那几枚；没改过的跟着内置一起升级，不冻在旧版本上。
     红线：这张表要进同步，所以它不是密钥的容身之处 —— 模板里出现
     key / token 字样，保存与上行两道各拦一次（上行那道在 app.js）。 */
  var K_PROMPTS = "inkread.ai.prompts.v1";
  var PROMPT_SECRET_RE = /(sk-[A-Za-z0-9_\-]{6,}|api[\s_-]?key|apikey|secret|[a-z]?token|password|passwd|Bearer\s|Authorization)/i;
  function promptSecretHit(s) { var m = String(s == null ? "" : s).match(PROMPT_SECRET_RE); return m ? String(m[0]) : ""; }

  /* >>> 内置模板哨兵（起）：闸以「此区间之外 你是… 计数为 0」判定收编完成 */
  var PROMPT_DEFS = [
    { k: "classify", n: "导入识别 · 文档分类", g: "导入", json: 1, temp: 0.1, maxTokens: 300, timeout: 12000,
      fields: ["kind", "reason"],
      ph: { memory: "读者以往的归类习惯（kindmap 最近 8 条，无则留空）" },
      t: "你是文档分类器。只输出 JSON：{\"kind\":\"<八类之一>\",\"reason\":\"<一句话>\"}，kind 必须是：book/textbook/paper/report/plan/note/comic/other\n" +
        "对应关系：book=书籍（小说 / 文学 / 散文），textbook=教材（教材 / 教程 / 讲义），paper=论文（期刊 / 会议 / 学位论文），report=报告（报告 / 白皮书 / 资料汇编），plan=计划（规划 / 待办 / 清单），note=笔记（手稿 / 笔记 / 草稿），comic=漫画（画册 / 图示 / 绘本），other=其他（兜底）。\n" +
        "只输出 JSON，不要 markdown 围栏，不要任何多余解释；拿不准就归 other，并在 reason 里说清依据。\n" +
        "{{memory}}" },

    { k: "translate", n: "翻译 · 指定语言", g: "阅读", json: 0, temp: null, maxTokens: null, timeout: 20000,
      ph: { preamble: "主脑上下文（记忆 / 当前文档）", toName: "目标语言名", fromNote: "原文语言说明", glossary: "术语表（必须遵守的译名，无则留空）" },
      t: "{{preamble}}你是严谨的翻译引擎。把用户给出的文本译成{{toName}}。{{fromNote}}只输出译文本身，不要解释、不要加引号、不要保留原文。{{glossary}}" },

    { k: "translate.auto", n: "翻译 · AI 智能判定", g: "阅读", json: 0, temp: null, maxTokens: null, timeout: 20000,
      ph: { preamble: "主脑上下文", glossary: "术语表（无则留空）" },
      t: "{{preamble}}你是严谨的翻译引擎。先判断用户给出的文本是什么语言，再判断一位以中文为母语的读者最需要把它译成什么语言" +
        "（通常是中文；若原文已是中文而其中夹有外文，则把外文部分译回中文），然后完成翻译。" +
        "只输出译文本身，不要解释、不要加引号、不要保留原文。{{glossary}}" },

    { k: "trace", n: "溯源 · 出处考证", g: "阅读", json: 1, temp: 0.2, maxTokens: 1400, timeout: 22000,
      fields: ["kind", "title", "lead", "meaning", "doubt"],
      ph: { preamble: "主脑上下文" },
      t: "{{preamble}}你是考据学者，替读者追溯一段文字的来源与本原。\n" +
        "溯源对象是一切事物 —— 事、物、人、时、地皆可溯其来源，不限于典故；成语典故、历史事件、人物、节日、地名、名物、术语、诗句、文献引文、制度风俗、俗语、器物、机构等只是举例。凡「它从哪来、谁先说、原话是什么」皆可考。\n" +
        "工作顺序：①先判断它属于哪一类；②再给一句话定性；③再考最早出处（典籍 / 文献 / 事件 / 年代 / 作者，能确定才写，不确定就写「未详」并说明为何不确定）；④给原文或原始表述（有则引，无则写「未见原始表述」）；⑤说清含义与本末（它指什么、怎么来的）；⑥如有，给后世沿用或相近说法；⑦最后单列存疑与不确定之处。\n" +
        "只输出 JSON，不要 markdown 围栏，不要任何多余解释。字段如下：\n" +
        "{\"kind\":\"类别，如 典故 / 历史事件 / 节日 / 文献引文 / 术语 / 地名 / 名物 / 人物 / 风俗\",\"title\":\"一句话定性，20字内\",\"lead\":\"30-80字概述\",\"facts\":[{\"k\":\"出处\",\"v\":\"…\"},{\"k\":\"年代\",\"v\":\"…\"},{\"k\":\"作者\",\"v\":\"…\"}],\"origin\":{\"quote\":\"原文或原始表述\",\"note\":\"版本、异文或说明\"},\"meaning\":\"含义与本末，80-200字\",\"related\":[\"后世沿用或相近说法\"],\"refs\":[{\"t\":\"文献或条目名\",\"u\":\"链接，不确定则留空字符串\"}],\"doubt\":\"存疑与不确定之处\"}\n" +
        "facts 的 k 可自由取（如 出处 / 年代 / 作者 / 流行时期 / 地域 / 相关人物），2-5 条即可。\n" +
        "宁可写「未详」也不要编造。年代、作者、原话拿不准，一律标注不确定 —— 读者要的是可靠，不是好听。" },

    { k: "search", n: "检索 · AI 模糊", g: "阅读", json: 1, temp: 0.2, maxTokens: 800, timeout: 18000,
      fields: ["note"],
      ph: { preamble: "主脑上下文" },
      t: "{{preamble}}你是检索助手。读者给一句粗略的描述，你要指出下面候选段落里哪些最相关。\n" +
        "只输出 JSON，不要 markdown 围栏：\n" +
        "{\"hits\":[{\"i\":段号,\"reason\":\"为什么相关，20字内\"}],\"note\":\"补充说明，可空\"}\n" +
        "最多 5 条，按相关度降序。宁少勿滥 —— 没有真正相关的就返回空数组，并在 note 里直说没有。" },

    { k: "explain", n: "解析 · 拆解一段文字", g: "阅读", json: 1, temp: 0.3, maxTokens: 900, timeout: 18000,
      fields: ["kind", "title", "lead"],
      ph: { preamble: "主脑上下文" },
      t: "{{preamble}}你是阅读助教，替读者拆解一段文字。\n" +
        "只输出 JSON，不要 markdown 围栏：\n" +
        "{\"kind\":\"phrase|sentence|formula|paragraph\",\"title\":\"一句话定性，18字内\",\"lead\":\"30-80字：这段在讲什么\",\"items\":[{\"k\":\"关键点\",\"v\":\"…\"}],\"terms\":[{\"w\":\"术语原词\",\"pos\":\"词性，可空\",\"mean\":\"一句释义\"}]}\n" +
        "items 给 2-4 条；terms 只列这段里真正需要解释的术语，没有就给空数组 —— 不确定的术语宁可不说。" },

    { k: "assistant", n: "阅读助手 · 书页旁问答", g: "阅读", json: 0, temp: 0.6, maxTokens: null, timeout: 60000,
      ph: { cite: "引用编号说明（有检索结果时才有）", material: "随问附上的原文与上下文", preamble: "主脑上下文" },
      t: "你是墨读里的阅读助手，正陪着读者读这一本书。回答贴着下面给出的原文，别泛泛而谈；" +
        "原文里没有的就直说没有，不要编。{{cite}}" +
        /* 排版约束：这扇窗只有 396px 宽、正文 13px。模型默认按「一页文档」的写法答，
           三级标题套大表格在窄栏里必然挤成一团 —— 让它按一栏的尺子写，比事后用 CSS 硬压有效。 */
        "回答是贴在书页旁的一小段话，不是整篇文章：控制在几句之内，" +
        "要列举就用一层短列表，一条一句；不要多级标题、不要表格、不要代码块（读者点名要除外）；" +
        "术语解释用「术语：解释」这样的行，别另起标题。" +
        "\n\n{{material}}\n\n{{preamble}}" },

    { k: "assistant.cards", n: "助手 · 从原文挑闪卡句", g: "助手", json: 1, temp: null, maxTokens: null, timeout: 40000,
      ph: { material: "随问附上的原文与上下文" },
      t: "从下面给出的原文里挑 5 句最值得记住的话。要求：逐字照抄原文，不改写、不拼接、不加引号、不缩略，" +
        "长短以 8-60 字为宜；只能从给的原文里挑，原文不够 5 句就少给几条。只回 JSON，不要解释。" +
        "\n\n{{material}}" },

    { k: "assistant.tasks", n: "助手 · 生成本章任务", g: "助手", json: 1, temp: null, maxTokens: null, timeout: 40000,
      ph: { material: "随问附上的原文与上下文" },
      t: "针对读者正在读的这一章，拟 4-6 条可执行的学习任务。要求：每条不超过 20 字、动词开头" +
        "（如「复述…」「整理…」「对照…」），彼此不重复，不要写「阅读本章」这类空话。只回 JSON，不要解释。" +
        "\n\n{{material}}" },

    { k: "cast.assign", n: "朗读 · 对白归属", g: "朗读", json: 0, temp: 0.1, maxTokens: 2000, timeout: 45000,
      ph: {},
      t: "你是中文小说的对白归属标注器。每次会收到一块对白：块头有【角色表】（正名、别名、已出场句数）、" +
        "【锚】（最近由提示语/代词确认的说话人，旧→新）、【链状态】（交替链周期 p 与本块首句距锚深度）、" +
        "【衔接】（上一块末几句的归属），随后每行是「全局句号. [本地规则提示] 「台词」｜上文…｜下文…」。" +
        "只输出一个 JSON 对象：{\"chars\":[],\"merge\":[],\"lines\":[]}。" +
        "lines 给每句判说话人：优先写角色表里的正名（别名会自动归到正名），判不出就 null。每句必须给 basis 与 conf：" +
        "basis 只取 tag（提示语明示）/ alternation（按交替轮次）/ pronoun（代词回指）/ mention（旁白刚点过名）/ " +
        "new（本块新建的角色）/ aside（引号里不是对白：内心独白、转述、引文）；conf 是 0 到 1 的数。" +
        "本地规则提示只是猜测，可以推翻。若【链状态】说首句距锚超过 24 句，这一段不要按 alternation 外推，判不出就 null。" +
        "i 必须原样抄回收到的全局句号（不是块内序号）。quote 抄一句支持判断的原文（不超过 16 字），why 不超过 12 字。" +
        "chars 只放角色表里没有、但确实在出场的新角色：{name 正名, alias 别名数组, gender m/f/空, role 一句话身份, " +
        "evidence 支持他出场的全局句号数组（1-3 个，必须落在本块内）}；没有新角色给 []。没有 evidence 的新名字会被丢弃。" +
        "merge 只放你怀疑是同一个人的两条表内名字：{a 别名, b 正名, conf, why}；这只是给读者看的建议，不会自动执行，" +
        "lines 里请直接写你判断的正名。不要解释、不要代码块。" },

    { k: "cast.voices", n: "朗读 · 音色方案", g: "朗读", json: 0, temp: 0.2, maxTokens: 600, timeout: 30000,
      ph: { roster: "角色表（名字 / 性别 / 戏份 / 身份 / 是否锁定）", pool: "本机音色池（键 · 显示名 · 语言 · 性别）" },
      t: "你是中文有声书的配音导演。给下面每个角色从**本机音色池**里挑一款声线。\n\n" +
        "角色表：\n{{roster}}\n\n本机音色池（voice 只能填第一列的键，不许编）：\n{{pool}}\n\n" +
        "只输出一个 JSON 对象：{\"plan\":[{\"char\":\"角色名\",\"voice\":\"池内键\",\"why\":\"一句话，20字内\"}]}。\n" +
        "规则：char 照抄角色表里的正名；voice 只能取自音色池清单；标着「已锁定」的角色不要写进 plan；" +
        "同性别优先；池子不够时允许两名角色共用一款，但要在 why 里如实写「池子里男声只有 N 款，共用换音高」；" +
        "不要选旁白正在用的那款（它已从池子里排除）。不要解释、不要代码块。" },

    { k: "density.suggest", n: "版式 · 一键推荐疏密", g: "阅读", json: 0, temp: 0.2, maxTokens: 200, timeout: 15000,
      ph: { denKeys: "五档档位键（从紧到疏）" },
      t: "你是中文书刊的排版顾问。读者点「一键推荐疏密」时，你会拿到这本书在本机五档疏密下的实测排版表。" +
        "档位键从紧到疏：{{denKeys}}。只可从这些键里选一个。" +
        "取舍原则：页底空白率越低越好、跨页拆分越少越好；两档成本差在 1% 内时取接近适中的一档；" +
        "再结合文体（对话密集偏紧凑、散文诗歌偏疏朗）。" +
        "严格输出一行 JSON，不要任何多余文字：{\"den\":\"档位键\",\"reason\":\"一句话中文理由（不超过 40 字）\"}" },

    { k: "mode.suggest", n: "模式 · 内容类别识别", g: "阅读", json: 1, temp: 0.2, maxTokens: 320, timeout: 20000,
      fields: ["mode", "reason"],
      ph: { modeKeys: "四种阅读模式键与各自含义（产品内固定名册，改这里不改白名单）" },
      t: "你是中文读物的内容类别识别器。读者翻开一本书时，你会拿到这本书在本机的打分表：" +
        "书架归类加上正文排版特征，每一分都写了加分理由。打分表只是线索，不是结论 —— " +
        "你的活是读这些证据，判断这本书最适合用哪种阅读模式打开。" +
        "模式键只能从这些里选一个：{{modeKeys}}。" +
        "取舍原则：整幅图版为主而文字极少 → comic；有摘要 / 参考文献 / 独立公式 → paper；" +
        "含可打卡任务，或明显是教材讲义、计划清单 → study；连续长段落叙事说理 → book。" +
        "证据互相打架时按更硬的正文特征判，不要只顺从书架上那个可能填错了的分类。" +
        "证据不足也要选你更倾向的一档，并在 reason 里说清缺了什么。" +
        "严格输出一行 JSON，不要任何多余文字：" +
        "{\"mode\":\"模式键\",\"conf\":0到100的整数,\"reason\":\"一句话中文依据（不超过 40 字）\"}" },

    { k: "brain.chat", n: "主脑 · 人设", g: "主脑", json: 0, temp: 0.6, maxTokens: null, timeout: 60000,
      ph: { honor: "读者称呼（「读者希望被称为「×」。」，默认名时留空）" },
      t: "你是「墨读」的主脑 —— 这套水墨屏阅读器的中枢智能。{{honor}}\n" +
        "\n" +
        "【你的职责 · 边界照实说】\n" +
        "这里是对话入口：你读读者给的书与段落，负责答问、总结与提炼。你具备所接入模型应有的全部能力 —— 写作、编程、数学、翻译、常识、推理、创意，任何通用问题都直接、完整、认真地回答，不要因为「这是阅读器」就拒绝或敷衍与文档无关的问题。\n" +
        "其余用到模型的地方不在你这条对话里发生：翻译、溯源、解析、检索、内容模式识别、目录扫描、排版归一、朗读角色归属，各自在阅读页对应的面板里独立调用同一个模型，由那个面板负责把结果交给读者 —— 凡要改动读者东西的（改目录、重排正文、落地任务与闪卡），都必须读者点头才动手。别向读者宣称你能在这里替他们做完那些事。\n" +
        "\n" +
        "【作答要求】\n" +
        "1. 先直接给答案，再补理由；不要用「作为 AI」之类的空话开场。\n" +
        "2. 结合下面的读者记忆与文档上下文作答；引用原文时标明《书名》· 章节 · 页码。\n" +
        "3. 拿不准就说不确定，绝不编造出处、数据或引文。\n" +
        "4. 用中文回答（读者用其他语言提问时跟随其语言）。\n" +
        "5. 篇幅按问题需要，不为了显得详细而灌水。" },

    { k: "brain.cheer", n: "主脑 · 里程碑鼓励", g: "主脑", json: 0, temp: 0.85, maxTokens: 260, timeout: 20000,
      ph: { persona: "主脑人设（brain.chat 渲染结果）", memory: "读者记忆块（无则留空）", stat: "这一次达到的里程碑数据" },
      t: "{{persona}}\n{{memory}}【这次的任务 · 里程碑鼓励】\n" +
        "{{stat}}\n" +
        "请写 2-3 句真诚、有分寸、不油腻的鼓励：承认坚持本身的分量，但不夸张吹捧、不喊口号；\n" +
        "可以用一个和阅读、坚持有关的小意象；感叹号不超过两个；不用 emoji，不用 markdown 标题与列表。\n" +
        "只输出鼓励文本本身 —— 不要前后缀，不要解释你在做什么。" },

    { k: "toc.lint", n: "目录 · AI 模糊复核", g: "目录", json: 1, temp: 0.1, maxTokens: 1200, timeout: 30000,
      fields: ["note"],
      ph: { nodes: "目录条目与其当前绑定", heads: "正文里可挂靠的标题与位置" },
      t: "你是目录校对员。读者在更正一份「机器扫出来的章节目录」，你要指出哪几条对不上正文。\n" +
        "当前目录：\n{{nodes}}\n正文里认出来的标题：\n{{heads}}\n" +
        "只输出 JSON，不要 markdown 围栏：\n" +
        "{\"suspect\":[{\"i\":条目号,\"why\":\"一句话，20字内\"}],\"bind\":[{\"i\":条目号,\"h\":标题号}],\"note\":\"可空，一句话\"}\n" +
        "suspect 只列真正可疑的（标题与所指正文对不上、顺序颠倒、同一节挂了两处）；拿不准就不要列 —— 误报会让读者不再相信这条提示。\n" +
        "bind 只给「未绑定」的条目找正文标题，且只在字面明显是同一条时才给；对不上就不给，宁可空着也不要猜。" },

    { k: "toc.parse", n: "目录 · AI 认目录", g: "目录", json: 1, temp: 0.1, maxTokens: 1500, timeout: 30000,
      fields: ["note"],
      ph: { tocText: "正文里那张目录页的条目清单（行首是编号，末尾标着这一条挂上没挂上）", heads: "正文里可挂靠的标题与位置" },
      t: "你是目录解析器。下面第一段是书里自带的那张目录页的条目清单，第二段是正文里认出来的标题清单。\n" +
        "目录条目清单：\n{{tocText}}\n\n正文标题清单：\n{{heads}}\n" +
        "只输出 JSON，不要 markdown 围栏：\n" +
        "{\"nodes\":[{\"x\":\"章节名，照抄清单里的写法\",\"lv\":1,\"h\":标题号}],\"note\":\"可空，一句话\"}\n" +
        "lv 只有 1 / 2 / 3 三档，按目录的缩进与编号层级判。h 给这一条对应的标题号；认不出对应项就省略 h 字段。\n" +
        "标题号只能取自清单里给出的编号，不许自己编；章节名照抄目录清单里的写法，不要改写、不要补全。" },

    { k: "toc.extract", n: "目录 · AI 扫描全书结构", g: "目录", json: 1, temp: 0.1, maxTokens: 1800, timeout: 45000,
      fields: ["note"],
      ph: { cands: "本机按形状预筛出的候选标题行（行首是块号）", sample: "正文抽样" },
      t: "你是书籍结构编辑。这本书本机没能从正文里认出目录。下面第一段是**按形状预筛出的候选标题行**" +
        "（每行行首是块号），第二段是正文抽样，用来看这些行到底是标题还是普通句子。\n" +
        "候选行：\n{{cands}}\n\n正文抽样：\n{{sample}}\n" +
        "只输出 JSON，不要 markdown 围栏：\n" +
        "{\"toc\":[{\"bi\":块号,\"lv\":1,\"x\":\"照抄候选行里的标题文字\"}],\"note\":\"可空，一句话\"}\n" +
        "lv 只有 1 / 2 / 3 三档：章 / 篇给 1，节给 2，小节给 3。\n" +
        "bi 只能取自候选行里出现过的块号，同一块只许出现一次；x 照抄候选行的文字（去掉行尾的页码与点线），" +
        "不要改写、不要补全，更不要凭你对这本书的记忆添加候选里没有的章节。\n" +
        "候选行里不像标题的一律跳过（正文句子、图表题注、页眉页脚、参考文献条目）—— " +
        "漏一章只是目录少一行，多塞一行会把读者带到错的地方去。" },

    { k: "layout.detect", n: "排版 · 文体判定", g: "排版", json: 1, temp: 0.1, maxTokens: 300, timeout: 15000,
      fields: ["kind", "conf"],
      ph: { kinds: "可选文体清单", sample: "正文抽样（前若干块）" },
      t: "你是中文排版顾问，先判断这本书属于哪种文体，再谈怎么排。\n" +
        "正文抽样：\n{{sample}}\n" +
        "只输出 JSON，不要 markdown 围栏：{\"kind\":\"<文体之一>\",\"conf\":0到1的小数,\"reason\":\"一句话\"}\n" +
        "kind 必须是：{{kinds}} 之一。判据看版式特征（有无摘要 / 参考文献 / 图表编号、对话密度、段落长短），不看题材。\n" +
        "拿不准就把 conf 给低，不要为了显得有把握而编造依据。" },

    { k: "layout.apply", n: "排版 · 层级判定", g: "排版", json: 1, temp: 0.1, maxTokens: 2000, timeout: 45000,
      fields: ["edits"],
      ph: { kind: "文体判定结果", rules: "本次启用的规则包说明", blocks: "带块号的正文" },
      t: "你是中文书刊的结构编辑。文体是「{{kind}}」。{{rules}}\n" +
        "正文（每行前面是块号）：\n{{blocks}}\n" +
        "只输出 JSON，不要 markdown 围栏：\n" +
        "{\"edits\":[{\"bi\":块号,\"type\":\"h1|h2|h3|p\"}]}\n" +
        "只做一件事：判每一块该是标题还是正文；是标题的话是第几级。\n" +
        "第X章 / 第X篇 这类起头判 h1，第X节 / 1. / 1.2 判 h2，一、 /（一）/ 1) 判 h3，其余判 p。\n" +
        "不要重打任何文字，也不要在回话里带 x 字段 —— 正文由本机原样保留，你只给块号与类型。\n" +
        "同一块只许出现一次。拿不准的块干脆不要出现在 edits 里：少判一块只是少改一处，多判一块会挪走读者的正文。" }
  ];
  /* <<< 内置模板哨兵（止） */

  var PROMPT_DEF = Object.create(null);
  PROMPT_DEFS.forEach(function (d) { PROMPT_DEF[d.k] = d; });

  function promptOverrides() {
    try {
      var o = JSON.parse(localStorage.getItem(K_PROMPTS) || "{}");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }      /* 账本坏了当没有：功能要能跑，别因一处脏数据瘫掉 */
  }
  function promptWriteOverrides(m) {
    try { localStorage.setItem(K_PROMPTS, JSON.stringify(m)); return true; } catch (e) { return false; }
  }
  /* 取一枚功能的「当前生效定义」：文本走用户覆盖，参数走内置，用户改过的参数优先于内置。 */
  function promptOf(key) {
    var d = PROMPT_DEF[key];
    if (!d) return null;
    var o = promptOverrides()[key] || {};
    var out = { k: d.k, n: d.n, g: d.g, json: d.json, fields: d.fields || [], ph: d.ph || {},
      builtin: d.t, temp: d.temp, maxTokens: d.maxTokens, timeout: d.timeout, model: "" };
    Object.keys(Prompt.PARAMS).forEach(function (p) { if (o[p] != null && o[p] !== "") out[p] = o[p]; });
    out.model = String(o.model || "");
    out.t = typeof o.text === "string" && o.text.trim() ? o.text : d.t;
    out.overridden = typeof o.text === "string" && o.text.trim() ? 1 : 0;
    out.edited = Object.keys(o).filter(function (p) { return o[p] != null && o[p] !== ""; });
    return out;
  }
  /* 占位符替换：认不出的按空处理（用户删掉某个占位符 = 这一路少喂一样材料，功能照常跑），
     结尾空白一律削掉 —— 模板里写在末尾的 {{preamble}} 空值时不该留一串空行。 */
  function renderPrompt(tpl, vars) {
    var v = vars || {};
    return String(tpl == null ? "" : tpl).replace(/\{\{([A-Za-z0-9_.]+)\}\}/g, function (_, k) {
      return v[k] == null ? "" : String(v[k]);
    }).replace(/\s+$/, "");
  }
  function promptText(key, vars) {
    var d = promptOf(key);
    if (!d) { var e = new Error("注册表里没有这枚提示词功能：" + key); e.name = "NoPrompt"; throw e; }
    return renderPrompt(d.t, vars);
  }
  /* 参数解析：用户覆盖 > 调用点 > 内置 > 全局兜底；null 表示「跟着模型配置走」。
     调用点那份参数（如划词翻译的 temp 0.1）是功能作者定的默认，读者在管理页明确改过
     这一项时要以读者为准 —— 否则这张表上改温度对那几枚功能是空操作。
     base 是调用点带来的那一份模型配置（导入识别等自带 cfg，不等于全局），
     用户在这枚功能上填了模型名才替换，其余字段一律沿用 base —— 密钥永远不进这张表。 */
  function promptParams(d, o, base, raw) {
    var cfg = base || getModelCfg(), out = {}, send = {}, ed = d.edited || [];
    ["temp", "maxTokens", "timeout"].forEach(function (p) {
      var u = ed.indexOf(p) >= 0;
      var v = u ? d[p] : (o && o[p] != null ? o[p] : d[p]);
      var set = v != null;
      if (!set) v = p === "temp" ? (Number(cfg.temp) || 0.4)
        : p === "maxTokens" ? Math.min(Number(cfg.maxTokens) || 1024, 2048) : 20000;
      out[p] = Number(v);
      /* raw：只把「真的有人定过」的参数交给请求，其余留给 callChat / chatMsgs 按全局兜 —— 判据③ */
      if (!raw || set) send[p] = Number(v);
    });
    out.model = String((o && o.model) || d.model || cfg.model || "");
    out.cfg = Object.assign({}, cfg, { model: out.model });
    out.send = send;
    return out;
  }
  var Prompt = {
    PARAMS: { temp: 1, maxTokens: 1, timeout: 1 },
    DEFS: PROMPT_DEFS,
    has(key) { return !!PROMPT_DEF[key]; },
    /* 管理页用：内置 + 覆盖合并后的视图，按组分好 */
    list() {
      return PROMPT_DEFS.map(function (d) {
        var c = promptOf(d.k);
        return { k: d.k, n: d.n, g: d.g, json: !!d.json, ph: d.ph, fields: d.fields || [],
          t: c.t, builtin: d.t, overridden: c.overridden, edited: c.edited,
          temp: c.temp, maxTokens: c.maxTokens, timeout: c.timeout, model: c.model,
          bp: { temp: d.temp, maxTokens: d.maxTokens, timeout: d.timeout },
          globalModel: getModelCfg().model || "" };
      });
    },
    /* 保存覆盖：只落与内置不同的部分；模板里出现密钥字样一律拒收（红线第一道）。 */
    save(key, patch) {
      if (!PROMPT_DEF[key]) return { code: 1, msg: "注册表里没有这枚功能" };
      var p = patch || {}, m = promptOverrides(), cur = m[key] || {}, next = Object.assign({}, cur);
      if (typeof p.text === "string") {
        var hit = promptSecretHit(p.text);
        if (hit) return { code: 1, msg: "提示词里出现了「" + hit + "」—— 这张表会同步到别的设备，密钥不能写在这里" };
        if (!p.text.trim()) return { code: 1, msg: "模板不能是空的，要还原请点「恢复内置」" };
        var miss = String(p.text).match(/\{\{([A-Za-z0-9_.]+)\}\}/g) || [], known = Object.keys(PROMPT_DEF[key].ph || {});
        var bad = miss.filter(function (x) { return known.indexOf(x.slice(2, -2)) < 0; });
        if (bad.length) return { code: 1, msg: "模板里有不认识的占位符：" + bad.join(" ") + "（可用：" + (known.join(" / ") || "无") + "）" };
        /* 抄回来的文本与内置一字不差 = 这一枚其实没改：不钉住它，
           否则内置文案以后升级，这枚会永远停在用户那次「顺手点保存」时的旧版本。 */
        if (p.text === PROMPT_DEF[key].t) delete next.text; else next.text = p.text;
      }
      Object.keys(Prompt.PARAMS).forEach(function (f) {
        if (p[f] === null || p[f] === "") delete next[f];
        else if (p[f] != null) next[f] = Number(p[f]);
      });
      if (p.model != null) {
        var mh = promptSecretHit(p.model);
        if (mh) return { code: 1, msg: "模型名里出现了「" + mh + "」，这里只填模型名，不填密钥" };
        if (String(p.model).trim()) next.model = String(p.model).trim(); else delete next.model;
      }
      if (Object.keys(next).length) { next.at = Date.now(); m[key] = next; } else delete m[key];
      return promptWriteOverrides(m) ? { code: 0, edited: Object.keys(next) } : { code: 1, msg: "本机存储写入失败" };
    },
    /* 恢复内置：整枚覆盖删掉（文本与参数一起还），不是把文本抄一遍 */
    reset(key) {
      var m = promptOverrides();
      if (!PROMPT_DEF[key]) return { code: 1, msg: "注册表里没有这枚功能" };
      if (!m[key]) return { code: 0, cleared: 0 };
      delete m[key];
      return promptWriteOverrides(m) ? { code: 0, cleared: 1 } : { code: 1, msg: "本机存储写入失败" };
    },
    secretHit(text) { return promptSecretHit(text); },
    /* 唯一入口：解析链见本节抬头。opts.vars 填占位符，opts.json 决定走 askJson 还是纯文本，
       opts.cfg 给调用点自带的那份模型配置（没给就取全局）。
       没在管理页改过的参数保持「不写进请求」—— 由 callChat / chatMsgs 按全局配置兜底，
       这样「未配置」这条路发出去的字节与收编之前一字不差。 */
    async run(key, input, opts) {
      var o = opts || {}, d = promptOf(key);
      if (!d) { var e = new Error("注册表里没有这枚提示词功能：" + key); e.name = "NoPrompt"; throw e; }
      var sys = renderPrompt(d.t, o.vars);
      var pr = promptParams(d, o, o.cfg, true);
      var usr = String(input == null ? "" : input);
      if (d.json || o.json) {
        var r = await askJson(pr.cfg, sys, usr,
          Object.assign({ fields: o.fields || d.fields }, pr.send));
        return { text: r.raw, j: r.j, via: r.via, raw: r.raw, retried: r.retried, net: r.net, key: key, model: pr.model };
      }
      var st = { net: 0 };
      var txt = await callChat(pr.cfg, sys, usr,
        Object.assign({ onDelta: o.onDelta, signal: o.signal, stats: st }, pr.send));
      return { text: txt, j: null, via: "chat", raw: txt, retried: false, net: st.net, key: key, model: pr.model };
    },
    /* 只要文本、不要调用（流式多轮的两处自己拼 messages：主脑对话、书页旁助手） */
    sys(key, vars) { return promptText(key, vars); },
    /* 同上：把某一枚功能的参数与模型路由算出来，交给 llmMsgs 去发 */
    params(key, opts) {
      var d = promptOf(key);
      if (!d) { var e = new Error("注册表里没有这枚提示词功能：" + key); e.name = "NoPrompt"; throw e; }
      return promptParams(d, opts || {}, (opts && opts.cfg) || getModelCfg(), true);
    }
  };
  window.InkPrompts = Prompt;

  /* ------------------------------------------------------------
     模型配置：预设服务商 + 用户自定义导入
     存储键 inkread.ai.model.v1 —— 与 InkStore 无关，纯前端配置
     ------------------------------------------------------------ */
  var K_MODEL = "inkread.ai.model.v1";

  /* 预设只填「地址 + 常用模型名」，Key 与最终模型名始终由用户掌握 */
  var PRESETS = {
    openai:    { name: "OpenAI",        baseUrl: "https://api.openai.com/v1", models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"] },
    deepseek:  { name: "DeepSeek",      baseUrl: "https://api.deepseek.com/v1", models: ["deepseek-chat", "deepseek-reasoner"] },
    moonshot:  { name: "月之暗面 Kimi", baseUrl: "https://api.moonshot.cn/v1", models: ["moonshot-v1-8k", "moonshot-v1-32k", "kimi-k2"] },
    zhipu:     { name: "智谱 GLM",      baseUrl: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-4-plus", "glm-4-flash"] },
    dashscope: { name: "阿里百炼",      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen-max", "qwen-plus", "qwen-turbo"] },
    ollama:    { name: "本地 Ollama",   baseUrl: "http://localhost:11434/v1", models: ["qwen2.5:7b", "llama3.1:8b"] },
    custom:    { name: "自定义",        baseUrl: "", models: [] }
  };

  var MODEL_DEF = {
    preset: "openai", baseUrl: PRESETS.openai.baseUrl, key: "",
    model: "gpt-4o-mini", temp: 0.4, maxTokens: 2048, stream: true
  };

  function getModelCfg() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(K_MODEL)) || {}; } catch (e) { saved = {}; }
    var out = {};
    Object.keys(MODEL_DEF).forEach(function (k) {
      out[k] = saved[k] === undefined || saved[k] === null ? MODEL_DEF[k] : saved[k];
    });
    out.presets = Object.keys(PRESETS).map(function (k) {
      return { k: k, name: PRESETS[k].name, baseUrl: PRESETS[k].baseUrl, models: PRESETS[k].models };
    });
    return out;
  }

  function setModelCfg(cfg) {
    var cur = getModelCfg();
    delete cur.presets;
    var next = Object.assign(cur, cfg || {});
    try { localStorage.setItem(K_MODEL, JSON.stringify(next)); } catch (e) {}
    return next;
  }

  /* 归一化 Base URL：大小写、尾斜杠、尾部版本号（/v1 /v4）都不算差异 ——
     从服务商官网复制的地址带不带 /v1 常常随机，全等匹配会掉成「自定义」，
     预设芯片随之失去高亮、候选模型也空了（问题一的一条根因）。 */
  function normBase(u) {
    return String(u || "").trim().toLowerCase().replace(/\/+$/, "").replace(/\/v\d+$/, "");
  }
  function presetKeyOfBase(u) {
    var n = normBase(u);
    if (!n) return "";
    return Object.keys(PRESETS).filter(function (k) {
      return PRESETS[k].baseUrl && normBase(PRESETS[k].baseUrl) === n;
    })[0] || "";
  }

  /* ------------------------------------------------------------
     OpenAI 兼容出网唯一通路（模型列表 / 测试 ping / 对话共用）
     —— 桌面成品由 main.js 给所有响应补 Access-Control-Allow-Origin，
        普通浏览器没有这层：跨域拦住的是「读响应」，用户看到的却是
        「连通失败」。浏览器侧因此改走本机 /api/llm 透传，与成品对齐；
        透传只认回环地址，Key 只随请求体进、只进上游请求头。
     ------------------------------------------------------------ */
  var LLM_VIA = null;   /* null 未探明 / "proxy" 本机透传 / "direct" 直连 */
  async function llmVia() {
    if (LLM_VIA) return LLM_VIA;
    LLM_VIA = "direct";
    if (window.inkread) return LLM_VIA;
    try {
      var r = await fetch("/api/llm", { method: "GET", cache: "no-store" });
      var j = r.ok ? await r.json().catch(function () { return null; }) : null;
      if (j && j.data && j.data.ok) LLM_VIA = "proxy";
    } catch (e) {}
    return LLM_VIA;
  }
  /* o = {baseUrl, key, path, method, body, signal} → 标准 Response，
     直连与透传同一形状：res.ok / res.status / res.json() / res.body.getReader() 都照旧。 */
  async function llmFetch(o) {
    var base = String(o.baseUrl || "").replace(/\/+$/, "");
    var via = await llmVia();
    var sig = o.signal;
    try {
      if (via === "proxy") {
        /* await 不能省：return fetch(...) 把 Promise 直接交出去，
           网络层的 reject 就绕过了这个 catch —— 记账会静默漏掉。 */
        return await fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl: base, key: o.key || "", path: o.path, method: o.method, body: o.body || null }),
          signal: sig
        });
      }
      var h = { "Authorization": "Bearer " + (o.key || "") };
      if (o.body) h["Content-Type"] = "application/json";
      return await fetch(base + o.path, {
        method: o.method, headers: h,
        body: o.body ? JSON.stringify(o.body) : undefined, signal: sig
      });
    } catch (e) {
      var why = e && e.name === "AbortError" ? "等太久，已中断"
        : ((window.API && API.netErrPhrase) ? API.netErrPhrase(e) : String((e && e.message) || e));
      window.InkLog && InkLog.add("cloud", "模型请求没送出去：" + why,
        "在「设置 → 模型」里核对接口地址与 Key，或换本机透传再试");
      throw e;
    }
  }

  /* /models 的返回形状各家不一：data / models / 直接给数组，元素取 id / name / model */
  function pickModels(j) {
    var arr = j && (Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : Array.isArray(j) ? j : []);
    return (arr || []).map(function (m) {
      return m && (m.id || m.name || m.model);
    }).filter(function (x) { return typeof x === "string" && x; });
  }
  /* HTTP 状态 → 分类：界面按类给「下一步做什么」，而不是只报一个状态码 */
  function kindOfStatus(s) {
    if (s === 401 || s === 403) return "auth";
    if (s === 404 || s === 405 || s === 501) return "unsupported";
    return "network";
  }
  function failRes(kind, reason) {
    return { code: 1, data: { ok: false, kind: kind, models: [], reason: reason } };
  }

  async function fetchModelsRun(cfg) {
    var base = String(cfg.baseUrl || "").trim().replace(/\/+$/, "");
    var key = String(cfg.key || "").trim();
    if (!/^https?:\/\//i.test(base)) return failRes("network", "接口地址需以 http:// 或 https:// 开头");
    if (!key) return failRes("auth", "缺少 API Key");
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    var t0 = Date.now();
    try {
      var res = await llmFetch({ baseUrl: base, key: key, path: "/models", method: "GET", signal: ctl && ctl.signal });
      if (res.ok) {
        var ids = pickModels(await res.json().catch(function () { return null; }));
        return {
          code: 0,
          data: {
            ok: true, kind: "ok", latency: Date.now() - t0, models: ids,
            note: "经 GET /models 实测（HTTP " + res.status + "）" +
              (ids.length ? " · 模型名已入候选，可直接选用" : " · 该服务未返回列表，可在上方手填模型名")
          }
        };
      }
      var txt = "";
      try { txt = (await res.text()).slice(0, 160).replace(/\s+/g, " "); } catch (e) {}
      return failRes(kindOfStatus(res.status), "HTTP " + res.status + (txt ? " · " + txt : ""));
    } catch (e) {
      var msg = String((e && e.message) || e);
      if (/abort/i.test(msg)) return failRes("network", "请求超时（12 秒无响应）");
      return failRes(/Failed to fetch/i.test(msg) ? "cors" : "network", "请求失败：" + msg +
        (/Failed to fetch/i.test(msg) ? "（网络不通，或浏览器直连被跨域拦截——桌面版会自动补跨域头）" : ""));
    } finally { clearTimeout(timer); }
  }

  async function testModelRun(cfg) {
    var r = await fetchModelsRun(cfg);
    var d = r.data || {};
    if (d.ok) return { code: 0, data: d };
    /* 只有「没有 /models 端点」值得再试一次最小对话：拉不到列表并不等于不能聊。
       鉴权 / 网络 / 跨域三类错，ping 也一样撞墙 —— 把一种错说成另一种只会误导。 */
    if (d.kind !== "unsupported") return r;
    var base = String(cfg.baseUrl || "").trim().replace(/\/+$/, "");
    var key = String(cfg.key || "").trim();
    var model = cfg.model || (PRESETS[cfg.preset] && PRESETS[cfg.preset].models && PRESETS[cfg.preset].models[0]) || "gpt-4o-mini";
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    var t0 = Date.now();
    try {
      var res = await llmFetch({
        baseUrl: base, key: key, path: "/chat/completions", method: "POST", signal: ctl && ctl.signal,
        body: { model: model, messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false }
      });
      if (res.ok) {
        return {
          code: 0,
          data: {
            ok: true, kind: "ok", noList: true, latency: Date.now() - t0, models: [],
            note: "该服务无 /models 端点，已用最小对话实测通过（HTTP " + res.status + "）· 模型名 " + model + " 可用"
          }
        };
      }
      var body = "";
      try { body = (await res.text()).slice(0, 160).replace(/\s+/g, " "); } catch (e) {}
      return failRes(kindOfStatus(res.status), "HTTP " + res.status + (body ? " · " + body : ""));
    } catch (e) {
      var msg = String((e && e.message) || e);
      if (/abort/i.test(msg)) return failRes("network", "请求超时（12 秒无响应）");
      return failRes(/Failed to fetch/i.test(msg) ? "cors" : "network", "请求失败：" + msg);
    } finally { clearTimeout(timer); }
  }

  /* ------------------------------------------------------------
     一、AI 调用通路（全站唯一）
     翻译 / 溯源 / 解析 / 模式识别都走 callChat 一条路 ——
     超时、错误、缓存、结构化解析只在这里处理一次，业务侧不再各写各的。
     ------------------------------------------------------------ */

  /* 通用 OpenAI 兼容 /chat/completions。
     ① 超时即 abort、失败上抛 —— 绝不静默假装成功；
     ② 同一请求在飞时共享同一个 Promise —— 连点两下、语向抖一下，只打一次网络；
     ③ 传了 onDelta 就走流式：增量文字边到边交给调用方渲染，首字即显、长译文不必干等整段。
        流式请求不进共享 —— 两个调用方抢同一路增量，后到的那个会收不到字。 */
  var INFLIGHT = new Map();
  async function callChat(cfg, sys, user, opts) {
    var o = opts || {};
    var stream = typeof o.onDelta === "function";
    if (stream) return chatRun(cfg, sys, user, o, true);
    var ikey = (cfg.model || "") + "|" + sys + "|" + user;
    var fly = INFLIGHT.get(ikey);
    if (fly) return fly;
    var p = chatRun(cfg, sys, user, o, false);
    INFLIGHT.set(ikey, p);
    try { return await p; } finally { INFLIGHT.delete(ikey); }
  }

  /* 一次出网：请求体已由上层拼好，这里只管超时、发、把文字取回来。
     每次尝试自带一个超时控制器 —— 退避重问时旧计时器必须跟着作废，
     否则第一次的 15 秒会掐死第二次刚起的请求。 */
  async function llmAttempt(cfg, body, o, stream) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, o.timeout || 15000);
    /* 外部叫停（助手上的「停止」）：把调用方的 signal 接到内部控制器上。
       abort 出来的错误加一个 aborted 标记 —— 上层要分清「读者按了停止」与「模型答不上」，
       前者不该去兜离线库，也不该被当成上游忙而自动重问。 */
    if (o.signal && typeof o.signal.addEventListener === "function") {
      if (o.signal.aborted) {
        if (ctl) ctl.abort();
        else { clearTimeout(timer); throw mkAborted(); }
      } else o.signal.addEventListener("abort", function () { if (ctl) ctl.abort(); });
    }
    try {
      var res = await llmFetch({
        baseUrl: cfg.baseUrl, key: cfg.key, path: "/chat/completions", method: "POST",
        signal: ctl ? ctl.signal : undefined, body: body
      });
      if (!res.ok) {
        /* 状态码 + 一小段响应体 + Retry-After 留在错误上：上层要分清「这一家不认 response_format」
           和「密钥错了 / 限流」—— 前者该换请求形状，后者该退避重问，密钥错了重问一百次也是白。 */
        var snip = "";
        try { snip = String(await res.text()).slice(0, 200).replace(/\s+/g, " "); } catch (e) {}
        var er = new Error("HTTP " + res.status + (snip ? " · " + snip : ""));
        er.status = res.status; er.body = snip;
        er.retryAfter = retryAfterOf(res);
        throw er;
      }
      if (stream && res.body && res.body.getReader) {
        var sent = 0;
        /* raw 模式下多带一只 accumulator：流式里 tool_calls 是分片吐的，
           拼装的活在这儿干，循环只认拼好的整条调用。 */
        var acc = o.raw ? { calls: [] } : null;
        try {
          var stxt = await readStream(res, function (t) {
            sent += String(t || "").length;
            if (o.onDelta) o.onDelta(t);
          }, acc);
          if (o.raw) return rawMsg(stxt, acc);
          return stxt;
        } catch (se) { if (sent) se.partial = sent; throw se; }
      }
      var j = await res.json();
      var msg = ((((j.choices || [])[0] || {}).message) || {});
      /* raw：一条调用带 tool_calls 时 content 合法地是 null（OpenAI 就是这么发的），
         「响应为空」这句老判据会把整条循环掐死 —— 所以 raw 分支原样交出，不判空。
         不传 raw 的老调用方（翻译 / 解析 / 溯源）走的还是下面那两行，逐字节不变。 */
      if (o.raw) return rawMsg(String(msg.content == null ? "" : msg.content),
        Array.isArray(msg.tool_calls) ? { calls: msg.tool_calls } : null);
      var txt = String(msg.content || "").trim();
      if (!txt) throw new Error("响应为空");
      return txt;
    } catch (e) {
      if (o.signal && o.signal.aborted) e.aborted = true;
      throw e;
    } finally { clearTimeout(timer); }
  }

  /* 上游抖动自愈（v1.3 D3）：只对「等一会儿再问，可能就成了」的错重问 ——
     429 / 5xx / 超时 / 连接层失败；400（请求形状不认）与 401·403（密钥问题）不重问，
     「响应为空」也不重问（上游好意回了个空，重问是烧读者的额度）。
     预算两次：400ms → 1200ms；服务端给了 Retry-After 就听它的（上限 8 秒，别让人干等）。
     已经吐过字的流式请求不重问 —— 半句再重问，读者看到的是两遍话。 */
  var LLM_RETRY = 2;
  function retryableErr(e) {
    if (!e || e.aborted || e.partial) return false;
    var s = Number(e.status) || 0;
    if (s) return s === 429 || s >= 500;
    return /abort|timed out|timeout|failed to fetch|networkerror|net::|load failed|上游不可达/i
      .test(String((e && e.message) || ""));
  }
  function retryWaitMs(e, n) {
    var ra = e && e.retryAfter;
    if (typeof ra === "number" && isFinite(ra) && ra > 0) return Math.min(Math.round(ra * 1000), 8000);
    return n === 0 ? 400 : 1200;
  }
  function retryAfterOf(res) {
    try {
      var h = res && res.headers && res.headers.get ? String(res.headers.get("retry-after") || "") : "";
      var n = Number(h);
      return h && isFinite(n) && n > 0 ? n : null;   /* HTTP-date 形态不认：各家实现太乱 */
    } catch (e) { return null; }
  }
  function mkAborted() { var e = new Error("已停止"); e.aborted = true; return e; }

  /* 退避循环：单轮 / 多轮 / 流式都从这里出网，「重问几次、什么错才重问」只在这一处定。
     调用方可给一个 stats 空对象，回来时 stats.net 就是这一趟自动重问的次数 ——
     界面据此如实说「上游忙，自动重问过 1 次」，而不是把等待悄悄吞掉。 */
  async function llmChat(cfg, body, o, stream) {
    var st = o.stats || null;
    for (var at = 0; ; at++) {
      try {
        var txt = await llmAttempt(cfg, body, o, stream);
        if (st) st.net = (st.net || 0) + at;
        return txt;
      } catch (e) {
        if (at >= LLM_RETRY || !retryableErr(e)) {
          if (st) st.net = (st.net || 0) + at;
          e.netRetried = at;
          throw e;
        }
        await delay(retryWaitMs(e, at));
        if (o.signal && o.signal.aborted) {
          if (st) st.net = (st.net || 0) + at;
          throw mkAborted();
        }
      }
    }
  }

  /* 自动退避重问要留声（v1.3 D3）：那 400ms 与 1.2 秒是真等过的，
     把等待悄悄吞掉，界面就把一次云端抖动画成「模型秒回」。
     clause 给界面行内用，tail 给长句中段接用 —— 两处同词，不会长成「重问 / 重试 / 退避」三种方言。 */
  function retryNote(n) { return n > 0 ? "上游忙，已自动重问 " + n + " 次" : ""; }
  function retryTail(n) { var c = retryNote(n); return c ? " · " + c : ""; }

  async function chatRun(cfg, sys, user, o, stream) {
    var body = {
      model: cfg.model,
      temperature: o.temp == null ? (Number(cfg.temp) || 0.4) : o.temp,
      max_tokens: o.maxTokens || Math.min(Number(cfg.maxTokens) || 1024, 2048),
      stream: !!stream,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }]
    };
    /* response_format 是各家 OpenAI 兼容层里最不一致的一个字段：认的能显著提升结构命中，
       不认的直接 400（而不是忽略）。带不带由能力位决定，撞过一次就不再带（askJson 记）。 */
    if (o.jsonFormat) body.response_format = { type: "json_object" };
    return llmChat(cfg, body, o, stream);
  }

  /* 多轮通路：与 chatRun 同一套超时 / 退避 / 流式 / 错误处理，只是把 messages 交给调用方拼。
     主脑对话需要「人设 + 记忆 + 多轮上下文」，单轮拼不出这个形状，默认超时给到 30 秒。 */
  async function chatMsgs(cfg, messages, o, stream) {
    var body = {
      model: cfg.model,
      temperature: o.temp == null ? (Number(cfg.temp) || 0.6) : o.temp,
      max_tokens: o.maxTokens || Math.min(Number(cfg.maxTokens) || 1024, 2048),
      stream: !!stream,
      messages: messages
    };
    /* v1.4-S2：主脑循环在这一发里把工具名册交给上游。哪些参数必填由 InkAgent.toolsPayload
       按注册表的 "string?" 方言算好，这里只负责原样发出去。
       tool_choice 只在真有名册时才带 —— 空名册还挂 tool_choice，有些兼容层直接 400，
       而 400 会被上层认成「这一家不认工具」，把能力位悄悄翻成降级。 */
    if (Array.isArray(o.tools) && o.tools.length) {
      body.tools = o.tools;
      body.tool_choice = o.toolChoice || "auto";
    }
    if (o.jsonFormat) body.response_format = { type: "json_object" };
    return llmChat(cfg, body, Object.assign({}, o, { timeout: o.timeout || 30000 }), stream);
  }

  /* 上下文提供者：由 brain.js 注册。所有 AI 功能的系统前言都要先过它 ——
     记忆、行为摘要、当前文档由主脑统一供给，各功能只管自己的专业指令。 */
  var CTX_PROVIDER = null;
  /* 记忆变动通知：由 brain.js 注册，用户开关 / 忘掉一条记忆时广播出去 */
  var MEM_CHANGED = null;
  function brainPreamble(kind) {
    if (!CTX_PROVIDER) return "";
    var s = "";
    try { s = CTX_PROVIDER(kind) || ""; } catch (e) { s = ""; }
    return s ? s + "\n\n" : "";
  }

  /* 上游回来的调用可能缺 id（个别兼容层不给），补一个稳定的本地 id：
     回灌 role:tool 时要按 tool_call_id 对上号，缺了它下一轮模型就不知道哪条结果是哪条。 */
  function rawMsg(content, acc) {
    var calls = ((acc && acc.calls) || []).filter(function (c) { return c && ((c.function && c.function.name) || c.name); });
    calls.forEach(function (c, i) { if (!c.id) c.id = "call_local_" + (i + 1); });
    var out = { role: "assistant", content: String(content == null ? "" : content) };
    if (calls.length) out.tool_calls = calls;
    return out;
  }

  /* 流式里一枚调用分好几分片：第一片带 id 与 name，后面的片只带 arguments 的一截。
     按 index 归位而不是「看见就叫下一枚」—— 并行两枚时 index 会交替出现，
     认顺序就会把 B 的参数接到 A 上，拼出来一条谁也执行不了的调用。 */
  function mergeToolDelta(acc, frag) {
    if (!frag) return;
    var i = typeof frag.index === "number" ? frag.index : (acc.next || 0);
    if (typeof frag.index !== "number") acc.next = i + 1;
    var slot = acc.calls[i];
    if (!slot) slot = acc.calls[i] = { id: "", type: "function", "function": { name: "", arguments: "" } };
    if (frag.id) slot.id = String(frag.id);
    if (frag.type) slot.type = String(frag.type);
    if (frag.function) {
      if (frag.function.name) slot.function.name += String(frag.function.name);
      if (frag.function.arguments != null) slot.function.arguments += String(frag.function.arguments);
    }
  }

  /* SSE 增量：逐行取 `data: {...}`，`data: [DONE]` 收尾。
     网关若无视 stream 直接回整段 JSON（content-type 非 event-stream），此处兜底按整段解析 ——
     流式是「更快」，不该变成「更容易坏」。
     第三个参数 acc 只在 raw 模式下传进来：它顺手收 tool_calls 的分片，别的功能一个字节不经过它。 */
  async function readStream(res, onDelta, acc) {
    var ct = res.headers && res.headers.get ? String(res.headers.get("content-type") || "") : "";
    if (ct && ct.indexOf("text/event-stream") < 0) {
      var j = await res.json();
      var jm = ((((j.choices || [])[0] || {}).message) || {});
      var t = String(jm.content || "").trim();
      if (acc && Array.isArray(jm.tool_calls)) jm.tool_calls.forEach(function (c) { acc.calls.push(c); });
      if (!t && !(acc && acc.calls.length)) throw new Error("响应为空");
      if (t) onDelta(t);
      return t;
    }
    var reader = res.body.getReader();
    var dec = new TextDecoder("utf-8");
    var buf = "", all = "";
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      var lines = buf.split("\n");
      buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.indexOf("data:") !== 0) continue;
        var payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        var delta = {};
        try { delta = (((JSON.parse(payload).choices || [])[0] || {}).delta) || {}; } catch (e) { continue; }
        if (acc && Array.isArray(delta.tool_calls)) {
          for (var q = 0; q < delta.tool_calls.length; q++) mergeToolDelta(acc, delta.tool_calls[q]);
        }
        var piece = String(delta.content || "");
        if (piece) { all += piece; onDelta(piece); }
      }
    }
    var out = all.trim();
    /* 纯工具调用的一发流式里一个字都没有 —— 那不是「响应为空」，那是这一发的正事。 */
    if (!out && !(acc && acc.calls.length)) throw new Error("响应为空");
    return out;
  }

  /* 模型常把 JSON 包在 ```json 围栏里，或前后加一句客套话 —— 只取第一段平衡的花括号块。
     按字符扫，字符串里的花括号不计入深度，避免被引文里的 "{" 带偏。 */
  function pickJson(txt) {
    var s = String(txt || "").replace(/```[a-zA-Z]*/g, "");
    var i = s.indexOf("{");
    if (i < 0) return null;
    var d = 0, inStr = false, esc = false;
    for (var j = i; j < s.length; j++) {
      var c = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") d++;
      else if (c === "}") {
        d--;
        if (!d) { try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; } }
      }
    }
    return null;
  }

  /* ============================================================
     v2.23 W1c · 结构化契约
     实测过的旧行为：模型回一段散文（或 JSON 被 max_tokens 截断）时，
     一次请求、一句「模型未返回可解析的结构」，模型说过的话整段丢掉，读者什么也看不到。
     这里把「向模型要一份 JSON」做成一条有梯子的路：
       ① 带 response_format 请求（这一家明确不吃就不再带，见能力位）；
       ② 四级解析：整段 parse → 剥围栏取平衡块 → 截断补平 → 按字段重建；
       ③ 仍不行就把上次的原话摊回去，再要一次「只返回 JSON」；
       ④ 最终失败不再丢话：原话如实交出去，界面标「未结构化」并给出口。
     ============================================================ */

  /* provider 对 response_format 的态度只有试过才知道。按「接口地址 + 模型」记一位：
     1 认 / 0 不认 / 没记过当认（试一次）。里面只有 0/1 与时间戳，不含 Key，
     与模型配置同属设备本地数据 —— 但地址与模型名不是密钥，允许随同步走。 */
  var K_CAP = "inkread.ai.cap.v1";
  function capKeyOf(cfg) { return normBase(cfg && cfg.baseUrl) + "|" + String((cfg && cfg.model) || ""); }
  function capMap() {
    try { var m = JSON.parse(localStorage.getItem(K_CAP)); return (m && typeof m === "object") ? m : {}; } catch (e) { return {}; }
  }
  function capJsonOk(cfg) { var e = capMap()[capKeyOf(cfg)]; return !e || e.json !== 0; }
  function capMarkJson(cfg, ok) {
    var m = capMap(), k = capKeyOf(cfg);
    /* 只动 json 这一位：整条覆盖会把同一本上「这一家认不认原生工具调用」的记账一起洗掉，
       下一轮循环又去撞那个 400 —— 白烧读者一发请求，界面上「不认原生工具调用」那行还会改口。 */
    m[k] = Object.assign({}, m[k], { json: ok ? 1 : 0, at: Date.now() });
    try { localStorage.setItem(K_CAP, JSON.stringify(m)); } catch (e) {}
  }
  function capSnapshot() { return capMap(); }
  function capClear() { try { localStorage.removeItem(K_CAP); } catch (e) {} return {}; }

  /* 「这一家不认 response_format」的证据：4xx 且响应体明确点到这个字段 / json 模式。
     只按状态码判会把「密钥错、限流、上下文超长」也当成字段问题，
     记错能力位之后这条路就永久降级了 —— 宁可漏判，不可误判。 */
  function jsonFormatRejected(e) {
    var s = Number(e && e.status) || 0;
    var b = String((e && e.body) || "");
    if (!b) return false;
    if (!(s === 400 || s === 422 || s === 404)) return false;
    return /response_format|json[_-]?object|json_mode/i.test(b);
  }

  /* 括号成对检查：返回要补的收尾串；串里引号没闭合、括号错序 → null（补也补不出来） */
  function jsonClosers(s) {
    var st = [], inStr = false, esc = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") st.push(c);
      else if (c === "}" || c === "]") {
        if (!st.length) return null;
        var o = st.pop();
        if ((o === "{") !== (c === "}")) return null;
      }
    }
    if (inStr) return null;
    var out = "";
    for (var k = st.length - 1; k >= 0; k--) out += st[k] === "{" ? "}" : "]";
    return out;
  }

  /* 截断修复：从尾部往前找「值已完结」的位置（} ] , 三种收口），
     截到这里为止再补平剩下的括号。只回看尾部 60 个候选位 —— 
     截断只发生在尾巴上，整串回溯是白花的力气。 */
  function repairJson(s) {
    var src = String(s || "");
    var i0 = src.indexOf("{");
    if (i0 < 0) return null;
    src = src.slice(i0);
    var tried = 0;
    for (var end = src.length; end > 8 && tried < 60; end--) {
      var c = src[end - 1];
      if (c !== "}" && c !== "]" && c !== ",") continue;
      tried++;
      var head = src.slice(0, end).replace(/[,\s]+$/, "");
      var closers = jsonClosers(head);
      if (closers == null) continue;
      try {
        var j = JSON.parse(head + closers);
        if (j && typeof j === "object" && !Array.isArray(j)) return j;
      } catch (e) {}
    }
    return null;
  }

  /* 字段级重建：模型彻底讲成一段话时，按已知字段名把它能捞出来的那几句捞出来。
     只捞标量（数组 / 嵌套交给上面的 JSON 梯子），一条都不剩就返回 null。 */
  function softFields(txt, keys) {
    var s = String(txt || "");
    if (!s || !(keys || []).length) return null;
    var out = {}, got = 0;
    keys.forEach(function (k) {
      var pats = [
        new RegExp('"' + k + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'),
        new RegExp('[【\\[（(]?\\s*' + k + '\\s*[:：]\\s*([^\\n"，。;；]{2,120})')
      ];
      for (var i = 0; i < pats.length; i++) {
        var m = pats[i].exec(s);
        if (m && m[1]) {
          var v = String(m[1]).replace(/^\s*“|”\s*$/, "").trim();
          if (v) { out[k] = v.slice(0, 400); got++; break; }
        }
      }
    });
    return got ? out : null;
  }

  /* 四级解析：整段 parse → 剥围栏取平衡块 → 截断补平 → 按字段重建。
     返回 {j, via}，via 进数据形状，界面/闸门据此知道结构是哪一级捞回来的。 */
  function parseStructured(txt, keys) {
    var raw = String(txt || "").trim();
    if (!raw) return null;
    try {
      var direct = JSON.parse(raw);
      if (direct && typeof direct === "object" && !Array.isArray(direct)) return { j: direct, via: "direct" };
    } catch (e) {}
    var b = pickJson(raw);
    if (b) return { j: b, via: "braced" };
    var r = repairJson(raw);
    if (r) return { j: r, via: "repaired" };
    var f = softFields(raw, keys);
    if (f) return { j: f, via: "fields" };
    return null;
  }

  /* 要一份 JSON 的唯一入口。成功返回 {j, via, raw, retried, net}；
     拿不到结构抛 UnstructuredError（带 raw，由调用方按「未结构化」如实展示）；
     网络 / 鉴权 / 超时照常上抛 —— 那些不是格式问题，不该用纠错重试去掩盖。
     retried = 为「让它成结构」多问的那一次；net = 为「上游忙 / 断了」自动退避重问的次数。
     两笔账分开记：前者说明模型的话不好读，后者说明服务在抖，读者该看到的不是同一句话。 */
  async function askJson(cfg, sys, usr, o) {
    var opts = o || {};
    var useFmt = capJsonOk(cfg);
    var stats = { net: 0 };
    var raw = "";
    for (var guard = 0; guard < 3; guard++) {
      try {
        raw = await callChat(cfg, sys, usr, {
          temp: opts.temp, maxTokens: opts.maxTokens, timeout: opts.timeout,
          jsonFormat: useFmt, stats: stats
        });
        break;
      } catch (e) {
        if (useFmt && jsonFormatRejected(e)) {
          capMarkJson(cfg, false);
          useFmt = false;
          continue;                    /* 换掉请求形状重来一次，不消耗纠错重试的预算 */
        }
        throw e;
      }
    }
    var p = parseStructured(raw, opts.fields);
    if (p) return { j: p.j, via: p.via, raw: raw, retried: false, net: stats.net };

    var again = "";
    try {
      /* 补话只给证据，不复述格式要求 —— 「只输出 JSON、不要围栏」这类话在各功能自己的模板里
         已经写过一遍，在这儿重抄就是第二个真源：模板改了这里不跟着改，两处说法会打架。 */
      again = await callChat(cfg, sys, usr + "\n\n——\n上次你返回的内容不是合法 JSON：\n" +
        String(raw).slice(0, 600) +
        "\n请按上面规定的格式重发一次。", {
        temp: 0, maxTokens: opts.maxTokens, timeout: opts.timeout, jsonFormat: useFmt, stats: stats
      });
    } catch (e) {
      /* 纠正重试自己也没打成：不算新错误，模型第一次的话是真说过了 */
    }
    var p2 = parseStructured(again, opts.fields);
    if (p2) return { j: p2.j, via: p2.via, raw: again, retried: true, net: stats.net };

    var err = new Error("模型未返回可解析的结构");
    err.name = "UnstructuredError";
    err.raw = String(again || raw || "");
    err.net = stats.net;
    throw err;
  }

  /* 上下文提供者（v2.23 W1b）：书名、章、正文由 brain.js 的上下文包供给。
     Brain 没加载（纯 api.js 的页面）就退回「只带选中文本」的旧形状，功能不因此关掉。 */
  function contextForPrompt(o) {
    if (!window.Brain || !Brain.contextFor) return null;
    try { return Brain.contextFor(o) || null; } catch (e) { return null; }
  }
  /* ctx.doc 历史上既有人传书名、也有人传整条书架记录（reader.html 的 auxCtx 就是),
     拼进 prompt 就成了「《[object Object]》」：模型看到的是乱码，读者丢的是书名。 */
  function ctxDocName(ctx) {
    var d = ctx && ctx.doc;
    if (typeof d === "string") return d;
    if (d && d.title) return String(d.title);
    var id = (ctx && ctx.docId) || (d && d.id) || "";
    if (id && window.InkStore && InkStore.getDoc) {
      try { var e = InkStore.getDoc(id); if (e && e.title) return e.title; } catch (x) {}
    }
    return "";
  }
  function ctxDocId(ctx) {
    var d = ctx && ctx.doc;
    if (d && d.id) return d.id;
    if (ctx && ctx.docId) return ctx.docId;
    /* 只给了书名（字符串或 {title}）：先按书名反查书架 —— 当前阅读的书不是它时，
       直接回退到 currentDoc 会把 A 书的正文喂给 B 书的问题。 */
    var t = typeof d === "string" ? d : (d && d.title) || "";
    if (t && window.InkStore && InkStore.getShelf) {
      try {
        var hit = InkStore.getShelf().filter(function (x) { return x && x.title === t; })[0];
        if (hit) return hit.id;
      } catch (e) {}
    }
    if (window.Brain && Brain.currentDoc) { try { return Brain.currentDoc() || ""; } catch (e) {} }
    return "";
  }
  /* 一次请求的完整材料：正文包（W1b）+ 「它出现在《X》第 N 章」的定位行 */
  function ctxPrompt(ctx, query, budget) {
    var id = ctxDocId(ctx);
    var pack = contextForPrompt({
      docId: id, anchor: ctx && ctx.anchor, bi: ctx && ctx.bi, query: query, budget: budget
    });
    var head = pack && pack.text ? pack.text + "\n\n" : "";
    var name = ctxDocName(ctx) || (pack && pack.meta.title) || "";
    var loc = (ctx && ctx.chapter)
      ? "（它出现在《" + name + "》" + ctx.chapter + (ctx.page ? " · 第 " + ctx.page + " 页" : "") + "）" : "";
    return { text: head, loc: loc, chars: pack ? pack.chars : 0, cut: pack ? pack.cut : [], tier: pack ? pack.tierChars : null, docId: id };
  }

  /* 结果缓存：同一段文字反复划选、同一段反复翻译，不该每次都打网络。

     仅内存（刷新即空），上限 80 条、10 分钟过期 —— 只管「手一抖又划一次」这种重复。 */
  var AICACHE = new Map();
  function cacheKey(ns, s, cfg) { return ns + "|" + ((cfg && cfg.model) || "") + "|" + s; }
  function cacheGet(k) {
    var e = AICACHE.get(k);
    if (!e) return null;
    if (Date.now() - e.t > 600000) { AICACHE.delete(k); return null; }
    return e.v;
  }
  function cacheSet(k, v) {
    if (AICACHE.size >= 80) AICACHE.delete(AICACHE.keys().next().value);
    AICACHE.set(k, { t: Date.now(), v: v });
    return v;
  }

  /* ------------------------------------------------------------
     二、翻译语言表
     源语言可「自动检测」；目标语言除常见语种外，另给一条「AI 智能」——
     由主脑按原文内容判断该译成什么语言（中文书里的英文引文，默认该译回中文）。
     ------------------------------------------------------------ */
  var LANGS = [
    { k: "zh", n: "中文", ai: "中文（简体）" },
    { k: "zh-Hant", n: "繁體中文", ai: "中文（繁体）" },
    { k: "en", n: "英语", ai: "英语" },
    { k: "ja", n: "日语", ai: "日语" },
    { k: "ko", n: "韩语", ai: "韩语" },
    { k: "fr", n: "法语", ai: "法语" },
    { k: "de", n: "德语", ai: "德语" },
    { k: "es", n: "西班牙语", ai: "西班牙语" },
    { k: "ru", n: "俄语", ai: "俄语" },
    { k: "it", n: "意大利语", ai: "意大利语" },
    { k: "pt", n: "葡萄牙语", ai: "葡萄牙语" },
    { k: "ar", n: "阿拉伯语", ai: "阿拉伯语" }
  ];
  var LANG_AUTO = { k: "auto", n: "自动检测", ai: "自动检测" };
  var LANG_AI = { k: "ai", n: "AI 智能", ai: "" };
  function langOf(k) {
    if (k === "auto") return LANG_AUTO;
    if (k === "ai") return LANG_AI;
    var hit = null;
    LANGS.forEach(function (l) { if (l.k === k) hit = l; });
    return hit;
  }
  function langName(k) { var l = langOf(k); return l ? l.ai : String(k || ""); }

  /* 英文名只用于翻译结果的标签，让读者一眼知道「这是译成什么语」 */
  var LANG_EN = { zh: "Chinese", "zh-Hant": "Traditional Chinese", en: "English", ja: "Japanese", ko: "Korean",
    fr: "French", de: "German", es: "Spanish", ru: "Russian", it: "Italian", pt: "Portuguese", ar: "Arabic" };

  /* ------------------------------------------------------------
     术语表（inkread.glossary.v1）+ 闪卡 SRS 状态（inkread.cards.v1）
     都是「读者自己的数据」，与笔记同性质：本机优先，接入服务端时改走 API。
     ------------------------------------------------------------ */
  var K_GLOSS = "inkread.glossary.v1";
  var K_CARDS = "inkread.cards.v1";

  /* ------------------------------------------------------------
     记忆（inkread.memory.v1）
     主脑从真实行为里学到的结论，不是预置文案。每条都带证据与置信度：
       {id,key,kind,text,why,ev,conf,at,on,src}
     合并以 key 为准（同一件事只留一条），学习时更新证据与置信度，保留用户的开关选择。
     ------------------------------------------------------------ */
  var K_MEM = "inkread.memory.v1";
  function getMem() {
    try {
      var v = JSON.parse(localStorage.getItem(K_MEM));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function setMem(list) {
    var clean = (Array.isArray(list) ? list : []).filter(function (m) { return m && m.id && m.text; });
    try { localStorage.setItem(K_MEM, JSON.stringify(clean)); } catch (e) {}
    return clean;
  }

  function getUserGloss() {
    try {
      var v = JSON.parse(localStorage.getItem(K_GLOSS));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function setUserGloss(list) {
    var clean = (Array.isArray(list) ? list : [])
      .filter(function (t) { return t && String(t.src || "").trim() && String(t.dst || "").trim(); })
      .map(function (t) {
        return { src: String(t.src).trim().slice(0, 40), dst: String(t.dst).trim().slice(0, 60), pos: String(t.pos || "").trim().slice(0, 12) };
      });
    try { localStorage.setItem(K_GLOSS, JSON.stringify(clean)); } catch (e) {}
    return clean;
  }
  /* 内置表（GLOSS）+ 用户自建；同名以用户为准 —— 读者改过的译名不该被内置表盖回去 */
  function allTerms() {
    var out = Object.keys(GLOSS).map(function (w) { return { src: w, dst: GLOSS[w].en, pos: GLOSS[w].pos, builtin: true }; });
    var seen = {};
    Object.keys(GLOSS).forEach(function (w) { seen[w] = 1; });
    getUserGloss().forEach(function (t) {
      if (seen[t.src]) {
        out.forEach(function (o) { if (o.src === t.src) { o.dst = t.dst; o.pos = t.pos || o.pos; o.builtin = false; } });
      } else { out.push({ src: t.src, dst: t.dst, pos: t.pos, builtin: false }); }
    });
    return out;
  }
  function glossLookup(word) {
    var hit = null;
    allTerms().forEach(function (t) { if (t.src === word) hit = t; });
    return hit;
  }

  /* ---------- 术语导入解析（CSV / TSV / 纯文本） ----------
     分隔符候选按「首行出现次数取多」自动识别；引号包裹的字段按 CSV 处理
     （"a,b" 里的逗号不算分隔）。表头识别只看前两格，避免把「注意力,attention」误当表头。 */
  var DELIMS = ["\t", ",", ";", "|", "=", "："];
  var DELIM_NAME = { "\t": "制表符", ",": "逗号", ";": "分号", "|": "竖线", "=": "等号", "：": "全角冒号" };
  var HEAD_SRC = /^(原词|术语|词条|词汇|原文|source|term|src|word)s?$/i;
  var HEAD_DST = /^(译名|翻译|译文|释义|target|translation|dst|meaning)s?$/i;

  function pickDelim(line) {
    var best = "", n = 0;
    DELIMS.forEach(function (d) {
      var c = String(line || "").split(d).length - 1;
      if (c > n) { n = c; best = d; }
    });
    return n ? best : ",";
  }
  function splitLine(line, d) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
  }
  function looksHeader(cells) {
    return cells.length >= 2 && (HEAD_SRC.test(cells[0] || "") || HEAD_DST.test(cells[1] || ""));
  }
  function parseGlossary(text, opts) {
    var o = opts || {};
    var lines = String(text || "").split(/\r?\n/).filter(function (l) { return l.trim(); });
    var delim = o.delim || pickDelim(lines[0] || "");
    var rows = [], bad = 0, skippedHeader = false;
    for (var i = 0; i < lines.length; i++) {
      var cells = splitLine(lines[i], delim);
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      if (i === 0 && o.header !== false && looksHeader(cells)) { skippedHeader = true; continue; }
      if (cells.length < 2 || !cells[0] || !cells[1]) { bad++; continue; }
      rows.push({ src: cells[0].slice(0, 40), dst: cells[1].slice(0, 60), pos: (cells[2] || "").slice(0, 12) });
    }
    return { delim: delim, delimName: DELIM_NAME[delim] || delim, rows: rows, bad: bad, skippedHeader: skippedHeader };
  }

  function getCards() {
    try {
      var v = JSON.parse(localStorage.getItem(K_CARDS));
      return v && typeof v === "object" ? v : {};
    } catch (e) { return {}; }
  }
  function setCard(id, st) {
    var all = getCards();
    all[id] = st;
    try { localStorage.setItem(K_CARDS, JSON.stringify(all)); } catch (e) {}
    return st;
  }

  /* 真实翻译：走统一通路 callChat。
     术语表（内置 + 用户自建）作为「必须遵守的译名」写进系统提示 ——
     同一术语在全篇译法一致，是对照阅读能读下去的前提。
     目标语言为「AI 智能」时，请模型先按原文判断该译成什么语言。 */
  async function callTranslate(src, opts, cfg, from, to, onDelta) {
    var o = opts || {};
    var terms = allTerms();
    var gloss = terms.map(function (t) { return t.src + " = " + t.dst; }).join("; ");
    var vars = { preamble: brainPreamble("translate"),
      glossary: gloss ? "必须遵守以下术语译名：" + gloss + "。" : "" };
    /* 「整篇 / 单词」两档的参数差异留在调用点 —— 那是模式，不是提示词 */
    var prm = o.mode === "word" ? { temp: 0.1, maxTokens: 256, timeout: 10000 } : {};
    var r = await Prompt.run(to === "ai" ? "translate.auto" : "translate", src, Object.assign({
      cfg: cfg, onDelta: onDelta, vars: Object.assign(vars, {
        toName: langName(to),
        fromNote: from && from !== "auto" ? "原文语言为" + langName(from) + "。" : "原文语言请自行判断。"
      })
    }, prm));
    var dst = r.text;
    var rTo = to === "ai" ? guessTarget(dst) : to;
    return {
      src: src, dst: dst, from: from, to: rTo,
      toName: to === "ai" ? "AI 智能 · " + (langName(rTo) || rTo) : (langName(rTo) || rTo),
      engine: r.model, terms: termsIn(src), note: ""
    };
  }

  /* 「AI 智能」时回填语种：只看译文自身的字符构成 —— 只影响标签，不影响译文 */
  function guessTarget(dst) {
    var s = String(dst || "");
    var cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjk >= Math.max(2, s.length * 0.15)) return /[繁體臺灣]/.test(s) ? "zh-Hant" : "zh";
    if (/[\u3040-\u30ff]/.test(s)) return "ja";
    if (/[\uac00-\ud7af]/.test(s)) return "ko";
    if (/[\u0600-\u06ff]/.test(s)) return "ar";
    if (/[\u0400-\u04ff]/.test(s)) return "ru";
    return "en";
  }

  /* 溯源 · 真机调用：把选中文字交给模型做「出处考证」。
     溯源对象是一切事物 —— 事、物、人、时、地皆可溯其来源，不限于典故；
     事件、典故、节日、引文、术语、地名、风俗、人物……都只是举例。
     凡「它从哪来、谁先说、原话是什么」皆可考。
     故提示词按「先辨类，再考据」组织，并要求结构化 JSON，便于前端渲染成卡片而非一坨散文。
     反复强调「未详优于编造」—— 考据类回答最怕一本正经地胡说。 */
  async function callTrace(src, ctx, cfg) {
    var c = ctxPrompt(ctx, src, 2600);
    /* 材料在前、问题在后：模型对紧邻提问的内容最敏感，把「待溯源的句子」放在尾巴上，
       书的正文与目录作为背景垫在前面（2.1 的缺陷是背景整段被丢弃，只剩一句选中文本）。 */
    var usr = (c.text || "") + "待溯源的内容：\n" + src + (c.loc ? "\n" + c.loc : "");
    var r = await Prompt.run("trace", usr, {
      cfg: cfg, vars: { preamble: brainPreamble("trace") }
    });
    var j = r.j;
    return {
      kind: String(j.kind || "出处"),
      title: String(j.title || ""),
      lead: String(j.lead || ""),
      facts: Array.isArray(j.facts)
        ? j.facts.filter(function (f) { return f && f.k && f.v; }).slice(0, 6)
          .map(function (f) { return { k: String(f.k).slice(0, 12), v: String(f.v).slice(0, 200) }; })
        : [],
      origin: (j.origin && (j.origin.quote || j.origin.note))
        ? { quote: String(j.origin.quote || "").slice(0, 600), note: String(j.origin.note || "").slice(0, 200) }
        : null,
      meaning: String(j.meaning || ""),
      related: Array.isArray(j.related) ? j.related.filter(Boolean).slice(0, 5).map(String) : [],
      refs: Array.isArray(j.refs)
        ? j.refs.filter(function (r) { return r && r.t; }).slice(0, 4)
          .map(function (r) { return { t: String(r.t).slice(0, 80), u: /^https?:\/\//i.test(String(r.u || "")) ? String(r.u) : "" }; })
        : [],
      doubt: String(j.doubt || ""),
      engine: r.model,
      /* 走到这里 = 结构化的那一栏真出自模型；本地落点只是附层（v1.3 D2 来源账） */
      by: "ai",
      via: r.via, ctxChars: c.chars, retried: !!r.retried, net: r.net || 0
    };
  }

  /* ------------------------------------------------------------
     内容类别识别（本地启发式，可解释）
     依据来源：书架元数据（type/theme/tags）+ 正文块构成
     ------------------------------------------------------------ */
  var COMIC_TAG = /漫画|条漫|图册|绘本|manga|comic|webtoon|连环画/;

  /* 四种阅读模式：键是产品内的固定名册（modes.js 的 META 同一套），
     MODE_DESC 只负责把这几个键翻译给模型听 —— 白名单认的是键，不是这句话。 */
  var MODE_KEYS = ["book", "paper", "study", "comic"];
  var MODE_DESC = "book＝书籍（连续长段落叙事说理）/ paper＝文献（摘要、参考文献、公式）/ " +
    "study＝学习（教材讲义、可打卡任务、计划笔记）/ comic＝漫画（整幅图版为主，文字极少）";

  /* 递给主脑的证据 = 本机打分表本身：书名与归类、各模式得分、每一条加分理由、本机结论。
     正文不再重发一遍 —— 排版特征已经在这里量化过了。 */
  function modeEvidence(doc, r) {
    var d = doc || {}, s = r.scores || {};
    var order = Object.keys(s).sort(function (a, b) { return s[b] - s[a]; });
    return "书名《" + (d.title || "未命名") + "》· 书架归类 " + (d.type || "未分类") +
      (d.theme ? " · 主题 " + d.theme : "") + " · 标签 " + ((d.tags || []).join("、") || "无") +
      "\n本机打分（分值从高到低）：" + order.map(function (k) { return k + " " + s[k]; }).join(" / ") +
      "\n加分依据：" + (r.why.length
        ? "\n" + r.why.map(function (w) { return "- " + w; }).join("\n")
        : "无（书架元数据与正文特征都没给出硬证据）") +
      "\n本机结论：" + r.mode + "（置信 " + r.conf + "%，" +
      (r.ambiguous ? "与第二名咬得很近" : "领先第二名") + "）";
  }

  function guessMode(doc, blocks) {
    var d = doc || {}, list = Array.isArray(blocks) ? blocks : [];
    var s = { book: 0, paper: 0, study: 0, comic: 0 }, why = [];

    /* ① 书架元数据：先给一个基线分（8 类 → 4 模式的映射见 KIND_MODE：
         book→书籍 / textbook,plan,note,other→学习 / paper,report→文献 / comic→漫画） */
    if (d.type === "plan") { s.study += 46; why.push("书架上归类为「计划 / 学习资料」"); }
    if (d.type === "paper") { s.paper += 46; why.push("书架上归类为「论文」"); }
    if (d.type === "book") { s.book += 40; why.push("书架上归类为「书籍」"); }
    if (d.type === "textbook") { s.study += 46; why.push("书架上归类为「教材 / 讲义」"); }
    if (d.type === "report") { s.paper += 42; why.push("书架上归类为「报告 / 白皮书」"); }
    if (d.type === "note") { s.study += 42; why.push("书架上归类为「笔记 / 手稿」"); }
    if (d.type === "other") { s.study += 30; why.push("书架上归类为「其他」（按学习模式兜底）"); }
    if (d.type === "comic") { s.comic += 46; why.push("书架上归类为「漫画 / 图册」"); }
    if (d.theme === "academic") { s.paper += 18; }
    if (d.theme === "novel") { s.book += 14; }
    if (d.theme === "plan") { s.study += 12; }
    var tags = (d.tags || []).join(" ");
    if (COMIC_TAG.test(tags + " " + (d.title || ""))) { s.comic += 58; why.push("标题或标签含漫画 / 条漫字样"); }
    if (/论文|文献|精读|期刊|学报/.test(tags)) s.paper += 16;
    if (/备考|计划|任务|清单|教材|课程/.test(tags)) s.study += 16;

    /* ② 正文块构成：结构化的排版特征是比标签更硬的证据 */
    if (list.length) {
      var nFig = 0, nText = 0, chars = 0, nFormula = 0, nRefs = 0, nAbstract = 0, nTask = 0;
      list.forEach(function (b) {
        if (!b || !b.type) return;
        if (b.type === "fig") nFig++;
        if (b.type === "formula") nFormula++;
        if (b.type === "refs") nRefs++;
        if (b.type === "abstract") nAbstract++;
        if (b.type === "p" || b.type === "quote") { nText++; chars += String(b.x || "").length; }
        if (b.type === "list" || b.type === "olist") {
          var arr = b.items || [];
          chars += arr.length * 14;
          /* 条目里带任务 id 的，几乎可以断定是学习计划 */
          if (arr.some(function (it) { return it && typeof it === "object" && it.id; })) nTask += arr.length;
        }
      });
      var n = list.length;
      var figRatio = nFig / n;
      if (figRatio >= 0.5 && chars < n * 40) {
        s.comic += 62; why.push("正文以整幅图版为主（" + nFig + " 幅图、" + n + " 个块），符合漫画 / 图册特征");
      }
      if (nFormula >= 2) { s.paper += 26; why.push("含 " + nFormula + " 处独立公式"); }
      if (nAbstract) { s.paper += 22; why.push("含摘要块，符合论文体例"); }
      if (nRefs) { s.paper += 30; why.push("含参考文献表，可做引用摘录"); }
      if (nTask >= 3) { s.study += 40; why.push("正文含 " + nTask + " 条可打卡任务"); }
      if (nText >= 6 && chars > n * 90 && nFig <= 1 && !nRefs && !nTask) {
        s.book += 30; why.push("以连续长段落为主，无公式 / 参考文献 / 任务");
      }
    }

    var keys = Object.keys(s).sort(function (a, b) { return s[b] - s[a]; });
    var top = keys[0], second = keys[1];
    var total = keys.reduce(function (a, k) { return a + s[k]; }, 0) || 1;
    var conf = Math.max(0, Math.min(99, Math.round((s[top] - s[second] * 0.55) / total * 100)));
    return {
      mode: top, conf: conf, why: why.slice(0, 4), scores: s,
      alt: s[second] > 0 ? keys[1] : null,
      ambiguous: s[top] - s[second] < 12
    };
  }

  /* ------------------------------------------------------------
     翻译桩：词级走术语表，句级给「结构完整的原型译文」
     原型不假装是真机翻 —— 未命中术语表的句子会明确标注
     ------------------------------------------------------------ */
  var GLOSS = {
    "阅读": { pos: "n./v.", en: "reading" },
    "认知负荷": { pos: "n.", en: "cognitive load" },
    "电子墨水": { pos: "n.", en: "electronic ink / E-Ink" },
    "显著性": { pos: "n.", en: "statistical significance" },
    "回归模型": { pos: "n.", en: "regression model" },
    "注意力": { pos: "n.", en: "attention" },
    "回视": { pos: "n.", en: "regression (eye movement)" },
    "主观": { pos: "adj.", en: "subjective" },
    "对照组": { pos: "n.", en: "control group" },
    "被试": { pos: "n.", en: "participant / subject" },
    "任务": { pos: "n.", en: "task" },
    "打卡": { pos: "v.", en: "check in" },
    "词汇": { pos: "n.", en: "vocabulary" },
    "真题": { pos: "n.", en: "past exam papers" },
    "论文": { pos: "n.", en: "paper / article" }
  };

  /* 已备好的整句译文：覆盖演示文档的高频句子，让对照阅读看得出效果 */
  var SENT = {
    "本规划覆盖 2026 年 3 月至 6 月的英语一备考全程，目标为 12 月初考取得 75 分以上。":
      "This plan covers the entire preparation for English I from March to June 2026, targeting a score above 75 in the early-December exam.",
    "墨水屏组的跨行回视率显著低于液晶组，而理解正确率两组无显著差异。":
      "The E-Ink group showed a significantly lower cross-line regression rate than the LCD group, while reading comprehension accuracy did not differ significantly between the two groups.",
    "以一条江的流向写三代人的迁徙，文字疏淡，适合夜读。":
      "It traces three generations of migration along the course of a single river, in spare, quiet prose — well suited to night reading."
  };

  function termsIn(src) {
    var out = [];
    allTerms().forEach(function (t) {
      if (t.src && src.indexOf(t.src) >= 0) out.push({ w: t.src, pos: t.pos, mean: t.dst });
    });
    return out.slice(0, 6);
  }

  function translateStub(src, opts) {
    var terms = termsIn(src);
    var engine = "原型 · 术语表 + 句库";
    var dst;
    if (SENT[src]) {
      dst = SENT[src];
    } else if (opts.mode === "word" || src.length <= 8) {
      var hit = glossLookup(src.replace(/[。，、；：！？\s]/g, ""));
      dst = hit ? hit.dst : "—";
      if (!hit) engine = "原型 · 未收录";
    } else {
      /* 未命中句库：逐词给出术语，并明说这是原型译文 */
      dst = terms.length
        ? "（原型逐词直译）" + terms.map(function (t) { return t.mean; }).join(" / ")
        : "（原型未收录该句，接入真实翻译 API 后此处返回完整译文）";
      engine = "原型 · 逐词";
    }
    return {
      src: src, dst: dst, engine: engine, terms: terms,
      note: SENT[src] ? "" : "原型译文仅用于演示排版与交互，接入翻译 API 后即为真实结果"
    };
  }

  /* ---------- 模糊检索的本地模拟：自然语句 → 检索词 → 打分 ----------
     中文没有词间空格，「记不清原话」时靠 2-gram 字符片才能有重叠命中；
     因此先剥掉口语外壳（那个 / 关于 / 我记得 / 有一段…），再切 3-gram 与 2-gram。 */
  var AI_STOP = [
    "那个", "这个", "那种", "关于", "讲的是", "讲的", "说的", "说的那", "有一段", "有一处",
    "我记得", "记得", "好像", "似乎", "大概", "可能", "哪里", "哪儿", "怎么", "什么", "为什么",
    "请问", "帮我", "找一下", "找出", "搜一下", "查一下", "内容", "段落", "部分", "地方",
    "出现", "提到", "写到", "描述", "场景", "情节", "是不是", "一下", "一个", "一种", "里面",
    "其中", "然后", "以及", "或者", "还有", "就是", "说的", "那段", "这段", "书里", "文中"
  ];

  function aiTerms(q) {
    var s = String(q || "").toLowerCase().replace(/[，。！？、；：""''（）《》〈〉…—\s,.!?;:'"()\[\]<>]/g, "");
    AI_STOP.forEach(function (w) { s = s.split(w).join(""); });
    var out = [], seen = {};
    var push = function (t) { if (t.length >= 2 && !seen[t]) { seen[t] = 1; out.push(t); } };
    for (var n = 3; n >= 2; n--) {          /* 长片优先：长片命中比短片更有分量 */
      for (var i = 0; i + n <= s.length; i++) push(s.slice(i, i + n));
    }
    return out;
  }

  function aiJudge(text, chapter, terms) {
    var t = String(text || "").toLowerCase(), c = String(chapter || "").toLowerCase();
    var s = 0, n = 0, best = null;
    for (var i = 0; i < terms.length; i++) {
      var w = terms[i], at = t.indexOf(w);
      if (at >= 0) {
        s += w.length * w.length;
        n++;
        if (!best || w.length > best.term.length) best = { at: at, term: w };
      }
      if (c.indexOf(w) >= 0) s += w.length * 1.6;
    }
    if (n >= 2) s *= 1.25;                  /* 多点开花比单点长词更可信 */
    return { s: s / Math.sqrt(1 + t.length / 160), at: best ? best.at : 0, term: best ? best.term : "", n: n };
  }

  function aiReason(terms, e, n) {
    if (!n) return "与你描述的场景最接近的一段";
    var t = String(e.text || "").toLowerCase(), c = String(e.chapter || "").toLowerCase();
    var hit = terms.filter(function (w) {
      return w.length >= 2 && (t.indexOf(w) >= 0 || c.indexOf(w) >= 0);
    }).sort(function (a, b) { return b.length - a.length; }).slice(0, 3);
    if (!hit.length) return "与你描述的场景最接近的一段";
    return "命中「" + hit.join("」「") + "」，与描述语义接近";
  }

  /* 本地字符检索：中文没有词间空格，靠 3-gram 优先 / 2-gram 兜底的字符片重叠打分。
     这是「主脑不在线」时的兜底，不是主路径 —— 主路径是 callSearch 的模型重排。 */
  function localSearch(q, list) {
    var terms = aiTerms(q);
    var scored = list.map(function (e) {
      var j = aiJudge(e.text, e.chapter, terms);
      return { e: e, s: j.s, at: j.at, term: j.term, n: j.n };
    }).filter(function (x) { return x.n > 0; });
    scored.sort(function (a, b) { return b.s - a.s || a.e.bi - b.e.bi; });

    var top = scored.slice(0, 5), note = "";
    if (!top.length) {
      note = "未找到确切段落。以下两条最接近，试试把描述说得更宽泛一些，或改用关键词检索。";
      top = list.slice(0, 2).map(function (e) { return { e: e, s: 0, at: 0, term: "", n: 0 }; });
    }
    return {
      mode: "ai", by: "rule", count: top.length, query: q, note: note, local: true,
      hits: top.map(function (x) {
        return {
          bi: x.e.bi, anchor: x.e.anchor, chapter: x.e.chapter,
          page: x.e.page, pct: x.e.pct, text: x.e.text,
          at: x.at, term: x.term, reason: aiReason(terms, x.e, x.n)
        };
      })
    };
  }

  /* 主脑检索：把候选段落编号交给模型，让它按「读者的粗略描述」重排。
     只让模型给段号与理由，正文一律由本地回填 —— 模型不该有机会改写原文。
     候选段落本身已由 reader 的 corpus 给足（每块 120 字 + 章名 + 页码），
     这里补的是「这是哪本书」：模型知道书目，判断「写桃花林景色」这类描述时才不飘。 */
  async function callSearch(query, corpus, cfg) {
    var list = (Array.isArray(corpus) ? corpus : []).slice(0, 60);
    var lines = list.map(function (e, i) {
      return (i + 1) + ". [" + (e.chapter || "") + " · 第 " + (e.page || "?") + " 页] " + String(e.text || "").slice(0, 120);
    }).join("\n");
    var name = ctxDocName({ docId: ctxDocId({}) });
    var usr = "读者的描述：" + query +
      (name ? "\n这本书：《" + name + "》" : "") + "\n\n候选段落：\n" + lines;
    var r = await Prompt.run("search", usr, {
      cfg: cfg, vars: { preamble: brainPreamble("search") }
    });
    var j = r.j;
    var hits = [];
    (Array.isArray(j.hits) ? j.hits : []).forEach(function (h) {
      var idx = Number(h && h.i) - 1;
      var e = list[idx];
      if (!e) return;
      hits.push({
        bi: e.bi, anchor: e.anchor, chapter: e.chapter, page: e.page, pct: e.pct, text: e.text,
        at: 0, term: "", reason: String((h && h.reason) || "").slice(0, 60) || "主脑判断与描述相关"
      });
    });
    return {
      mode: "ai", by: "ai", count: hits.length, query: query, engine: r.model,
      via: r.via, retried: !!r.retried, net: r.net || 0,
      note: hits.length ? String(j.note || "").slice(0, 120) : (String(j.note || "").slice(0, 120) || "主脑认为正文里没有与描述相符的段落。"),
      hits: hits.slice(0, 5)
    };
  }

  /* 主脑解析：把一段文字拆成「讲什么 / 关键点 / 术语」。
     术语只列真正需要解释的，拿不准就不列 —— 解析的可信度比字数重要。 */
  async function callExplain(src, ctx, cfg) {
    var c = ctxPrompt(ctx, src, 3600);
    var usr = (c.text || "") + "待解析的文字：\n" + src + (c.loc ? "\n" + c.loc : "");
    var r = await Prompt.run("explain", usr, {
      cfg: cfg, vars: { preamble: brainPreamble("explain") }
    });
    var j = r.j;
    return {
      kind: String(j.kind || "sentence"),
      title: String(j.title || ""),
      lead: String(j.lead || ""),
      items: Array.isArray(j.items)
        ? j.items.filter(function (f) { return f && f.k && f.v; }).slice(0, 5)
          .map(function (f) { return { k: String(f.k).slice(0, 14), v: String(f.v).slice(0, 220) }; })
        : [],
      terms: Array.isArray(j.terms)
        ? j.terms.filter(function (t) { return t && t.w; }).slice(0, 8)
          .map(function (t) { return { w: String(t.w).slice(0, 24), pos: String(t.pos || "").slice(0, 10), mean: String(t.mean || "").slice(0, 120) }; })
        : [],
      engine: r.model, note: "",
      /* 这一栏的分段与术语真出自模型；退回本地词表的那两条路径各标自己的账（v1.3 D2） */
      by: "ai",
      via: r.via, ctxChars: c.chars, retried: !!r.retried, net: r.net || 0
    };
  }

  /* ---------- 辅助阅读 · 解析 ----------
     结构固定三段：这段在讲什么（lead）/ 关键点（items）/ 涉及术语（terms）。
     未收录的术语明说「未收录」，不编造释义 —— 解析的可信度比字数重要。
     这是主脑不在线时的兜底；在线路径是 callExplain。 */
  function explainStub(text, ctx) {
    var src = String(text || "").trim();
    var c = ctx || {};
    var terms = termsIn(src);
    var isFormula = /[=＝]|\\frac|\\sum|\$/.test(src);
    var isLong = src.length > 60;
    var kind = isFormula ? "formula" : isLong ? "sentence" : "phrase";

    var lead = isFormula
      ? "这是一个含变量的表达式，可读作「各分项按权重相加」，落点在正文的推导段中。"
      : isLong
        ? "这句话在陈述一个可检验的判断，是所在段落的论点句；前后句多为支撑材料。"
        : "这是一个术语性短语，通常承担概念指称，读它要先看它所在的定义或首次出现处。";

    var items = [
      { k: "句法", v: isLong ? "主从复合，主句在后半段，前半段为条件 / 限定。" : "偏正结构，中心词在后。" },
      { k: "作用", v: isFormula ? "给出可计算的量化关系，是后文结论的模型基础。"
        : isLong ? "提出观点，供后文举例或数据支撑。" : "指称一个概念，后文一般会展开定义。" },
      { k: "读法", v: c.chapter ? "先回到「" + c.chapter + "」的上一段，看它承接了什么。" : "先看它前面一段，确认指代对象。" }
    ];

    return {
      title: src.length > 26 ? src.slice(0, 26) + "…" : src,
      kind: kind, lead: lead, items: items,
      terms: terms,
      note: terms.length ? "" : "这段未命中术语表；接入模型后可由模型给出释义与背景。"
    };
  }

  /* ---------- 辅助阅读 · 溯源（附层：在本文中的落点） ----------
     考据主层由模型给（见 callTrace）；这里只管「它在本书正文里出现在哪儿」，
     先找「原句落点」（整串命中），再补「最接近的段」（字符片打分）。
     两类都只带原文位置与摘录，不掺解释 —— 落点是附赠，考据才是溯源本身。 */
  function traceStub(text, corpus, ctx) {
    var src = String(text || "").trim();
    var list = Array.isArray(corpus) ? corpus : [];
    var key = src.replace(/\s+/g, "");
    var hits = [], seen = {};

    /* ① 原句落点：整串（或去空白后的长片段）命中 */
    var probe = key.length >= 8 ? key.slice(0, 8) : key;
    if (probe.length >= 3) {
      list.forEach(function (e) {
        var t = String(e.text || "").replace(/\s+/g, "");
        var at = t.indexOf(probe);
        if (at >= 0 && !seen[e.bi]) {
          seen[e.bi] = 1;
          hits.push({ bi: e.bi, anchor: e.anchor, chapter: e.chapter, page: e.page, pct: e.pct,
            text: e.text, at: at, kind: "exact" });
        }
      });
    }

    /* ② 近邻段：字符片打分补齐（原句被改写 / 只记得大意时用得上） */
    if (hits.length < 3) {
      var terms = aiTerms(src);
      list.map(function (e) {
        var j = aiJudge(e.text, e.chapter, terms);
        return { e: e, s: j.s, at: j.at };
      }).filter(function (x) { return x.s > 0 && !seen[x.e.bi]; })
        .sort(function (a, b) { return b.s - a.s || a.e.bi - b.e.bi; })
        .slice(0, 3 - hits.length)
        .forEach(function (x) {
          seen[x.e.bi] = 1;
          hits.push({ bi: x.e.bi, anchor: x.e.anchor, chapter: x.e.chapter, page: x.e.page, pct: x.e.pct,
            text: x.e.text, at: x.at, kind: "near" });
        });
    }

    hits.sort(function (a, b) { return (a.kind === b.kind ? 0 : a.kind === "exact" ? -1 : 1) || a.bi - b.bi; });
    var exact = hits.filter(function (h) { return h.kind === "exact"; }).length;
    var note = "";
    if (!hits.length) note = "这段在正文里找不到对应落点，可能来自你的笔记或批注。";
    else if (!exact) note = "没有找到一字不差的原句，以下是最接近的段落。";

    return { query: src, count: hits.length, exact: exact, note: note, hits: hits.slice(0, 6) };
  }
})();
