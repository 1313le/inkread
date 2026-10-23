/* ============================================================
   voices-local.js · 本地音色清单（v1.5-S5c）
   —— 产品只做「接线」：安装包与仓库里没有任何第三方权重。
      用户在自己机器上起 TTS 服务，这里只记「怎么找它、它叫什么、许可是什么」。
   —— 一条清单 = 一个服务 = 一个 provider + 一个 endpoint（格式见方案 §9.8.1）。
   —— 三条硬边界（写死，闸会反向咬）：
      ① provider 只有 openai / gsv 两种形状，其它值整份拒收；
      ② endpoint 只许回环（127.0.0.1 / [::1]），本产品不做任意远程代理；
      ③ license 必填且原样上屏 —— 产品不替用户判断合法性，也不隐藏来源。
   —— 键 inkread.voices.local.v1 是 private / sync:false：
      本机配置不进同步（app.js 的 InkSync SKIP 与 INK_SCHEMA 两处同改，见 #249）。
   —— 读侧每次重新校验：手改 localStorage 弄坏的清单当没配，不让坏数据流进请求体。
   ============================================================ */
(function () {
  "use strict";

  var K = "inkread.voices.local.v1";
  var VER = 1;
  var LIMIT = 50;                       /* 一份清单最多落 50 条 */
  var PROVIDERS = { openai: 1, gsv: 1 };
  var AGES = { "少年": 1, "青年": 1, "中年": 1, "老年": 1 };
  var BAD_KEY = { "__proto__": 1, "constructor": 1, "prototype": 1 };

  function str(x) { return typeof x === "string" ? x : ""; }
  function trim(x, n) { var s = str(x).trim(); return s.length > n ? s.slice(0, n) : s; }
  function obj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }

  /* WHATWG URL 的 hostname 对 IPv6 带方括号（node 与浏览器一致）。
     localhost 不收：它不是字面回环地址，解析权在系统的 hosts 文件 ——
     用户愿意用，就请写 127.0.0.1，别让一条 DNS 规则把校验绕过去。 */
  function loopbackHost(h) {
    var s = String(h || "").toLowerCase();
    return s === "127.0.0.1" || s === "::1" || s === "[::1]";
  }
  function parseEndpoint(raw) {
    var s = str(raw).trim();
    if (!s) return { why: "缺少 endpoint" };
    var u;
    try { u = new URL(s); } catch (e) { return { why: "endpoint 不是合法地址：" + s.slice(0, 60) }; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return { why: "endpoint 只支持 http:// 或 https://" };
    if (u.username || u.password) return { why: "endpoint 里不许带账号密码" };
    if (!loopbackHost(u.hostname)) {
      return { why: "endpoint 只许本机回环（127.0.0.1 或 [::1]）；localhost 请改成 127.0.0.1" };
    }
    return { url: u.protocol + "//" + u.host + u.pathname.replace(/\/+$/, "") };
  }

  function normGender(x) {
    var s = String(x || "").toLowerCase().trim();
    if (/^(m|male|man|男|男声)$/.test(s)) return "m";
    if (/^(f|female|woman|女|女声)$/.test(s)) return "f";
    if (/女/.test(s) && !/男/.test(s)) return "f";
    if (/男/.test(s) && !/女/.test(s)) return "m";
    return "";                          /* 判不出就留空，绝不默认成男声 */
  }
  function strList(x, n, cap) {
    if (!Array.isArray(x)) return [];
    return x.map(function (t) { return trim(t, cap); }).filter(Boolean).slice(0, n);
  }
  function normParams(x, provider, where) {
    if (!obj(x)) return { why: where + "：缺少 params 对象" };
    var ks = Object.keys(x);
    if (ks.length > 12) return { why: where + "：params 字段过多（上限 12）" };
    var out = {};
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i];
      if (BAD_KEY[k]) return { why: where + "：params 含非法键 " + k };
      if (k.length > 24) return { why: where + "：params 键名过长（上限 24）" };
      var v = x[k];
      if (typeof v === "string") out[k] = v.length > 500 ? v.slice(0, 500) : v;
      else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
      else return { why: where + "：params." + k + " 只支持字符串/数字/布尔" };
    }
    /* 每家的最小可用集：缺了它合成必然失败，不能假装导入成功。
       openai 形状：一个服务多音色靠 voice 选；gsv 形状：一个音色 = 参考音频三件套。 */
    if (provider === "openai" && !str(out.voice).trim()) return { why: where + "：openai 形状必须带 params.voice" };
    if (provider === "gsv") {
      if (!str(out.refer_wav_path).trim()) return { why: where + "：gsv 形状必须带 params.refer_wav_path" };
      if (!str(out.prompt_text).trim()) return { why: where + "：gsv 形状必须带 params.prompt_text" };
    }
    return { params: out };
  }

  /* 校验一份清单。返回 { ok, why?, data?, dropped?, capped? }：
     - 结构性错误（ver/provider/endpoint/license/params）整份拒收，why 点名哪一条；
     - 条数超 LIMIT 只截断，不拒收（capped = 被截掉的条数）。 */
  function validate(raw) {
    if (!obj(raw)) return { ok: false, why: "清单必须是一个 JSON 对象" };
    if (raw.ver !== VER) return { ok: false, why: "清单版本必须是 ver: 1" };
    var provider = str(raw.provider).trim().toLowerCase();
    if (!PROVIDERS[provider]) return { ok: false, why: "provider 只支持 openai / gsv，收到：" + (provider || "（空）") };
    var ep = parseEndpoint(raw.endpoint);
    if (ep.why) return { ok: false, why: ep.why };
    if (!Array.isArray(raw.items) || !raw.items.length) return { ok: false, why: "清单里没有音色（items 为空）" };

    var seen = {}, items = [], dropped = 0;
    for (var i = 0; i < raw.items.length && items.length < LIMIT; i++) {
      var it = raw.items[i], where = "第 " + (i + 1) + " 条";
      if (!obj(it)) { dropped++; continue; }
      var id = trim(it.id, 80);
      if (!/^local:/.test(id)) return { ok: false, why: where + "：id 必须以 local: 开头（收到：" + (id || "（空）") + "）" };
      if (seen[id]) { dropped++; continue; }          /* 重名只留第一条，不整份作废 */
      var lic = trim(it.license, 200);
      if (!lic) return { ok: false, why: where + "（" + id + "）：license 必填 —— 来源与许可要原样上屏" };
      var np = normParams(it.params, provider, where + "（" + id + "）");
      if (np.why) return { ok: false, why: np.why };
      seen[id] = 1;
      var lang = trim(it.lang, 8).toLowerCase();
      if (!lang) lang = /^en/i.test(str(it.locale)) ? "en" : /^ja/i.test(str(it.locale)) ? "ja" : "zh";
      items.push({
        id: id,
        name: trim(it.name, 40) || id.slice(6),
        lang: lang.slice(0, 2), locale: trim(it.locale, 20),
        gender: normGender(it.gender),
        age: AGES[trim(it.age, 4)] ? trim(it.age, 4) : "",
        cat: trim(it.cat, 20) || "音色",
        tags: strList(it.tags, 4, 12), scenes: strList(it.scenes, 6, 12),
        license: lic,
        note: trim(it.note, 200),
        params: np.params
      });
    }
    if (!items.length) return { ok: false, why: "清单里没有可用的音色（全部条目无效或重复）" };
    var capped = raw.items.length > LIMIT ? raw.items.length - LIMIT : 0;
    return { ok: true, data: { ver: VER, provider: provider, endpoint: ep.url, items: items }, dropped: dropped, capped: capped };
  }

  function readRaw() {
    try { return JSON.parse(localStorage.getItem(K) || "null"); } catch (e) { return null; }
  }
  function read() {
    var raw = readRaw();
    if (!raw) return null;
    var r = validate(raw);
    return r.ok ? r.data : null;        /* 坏数据当没配：不删、不猜，面板会重新提示导入 */
  }
  function save(raw) {
    var r = validate(raw);
    if (!r.ok) return r;
    try { localStorage.setItem(K, JSON.stringify(r.data)); }
    catch (e) { return { ok: false, why: "写不进本机存储（可能已满）：" + (e && e.name || "QuotaExceeded") }; }
    return r;
  }
  function clear() { try { localStorage.removeItem(K); } catch (e) {} }
  /* 文本入口：导入面板与主题页共用一条「解析 → 校验 → 落库」，错误原样交给调用方上屏 */
  function saveText(text) {
    var raw;
    try { raw = JSON.parse(String(text || "")); }
    catch (e) { return { ok: false, why: "不是合法 JSON：" + ((e && e.message) || e) }; }
    return save(raw);
  }
  /* 选文件 → 读文本 → 落库；提示与重绘归调用页（这里不碰 DOM 文案） */
  function importFile(cb) {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,application/json";
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      if (!f) { cb && cb({ ok: false, why: "没有选文件" }); return; }
      var rd = new FileReader();
      rd.onload = function () { cb && cb(saveText(String(rd.result || ""))); };
      rd.onerror = function () { cb && cb({ ok: false, why: "读不了这个文件" }); };
      rd.readAsText(f, "utf-8");
    });
    inp.click();
  }
  function configured() { return !!read(); }
  function endpoint() { var d = read(); return d ? d.endpoint : ""; }
  function provider() { var d = read(); return d ? d.provider : ""; }

  /* 给 castPool / 面板用的扁平条目：与 voices.js 的 shape 同名词同语义，
     多出本地三件（provider / endpoint / params）与 local:true。
     edge:false 是死守：任何「Edge 合成」分支都不许接走本地款。 */
  function list() {
    var d = read();
    if (!d) return [];
    return d.items.map(function (it) {
      return {
        k: it.id, id: it.id, name: it.name,
        mood: it.cat + " · " + (it.gender === "m" ? "男声" : it.gender === "f" ? "女声" : "未标性别") + (it.age ? " · " + it.age : ""),
        d: it.note || "本地 TTS · " + d.provider,
        lang: it.lang, gender: it.gender, age: it.age,
        accent: "", cat: it.cat, scenes: it.scenes, tags: it.tags,
        rate: 1, pitch: 1, er: "0%", ep: "0Hz",
        edge: false, cloud: false, moss: null, local: true,
        locale: it.locale, license: it.license,
        provider: d.provider, endpoint: d.endpoint, params: it.params,
        demo: "墨读，让每一页都值得慢慢读。"
      };
    });
  }
  function isLocal(k) { return /^local:/.test(String(k || "")); }

  window.InkVoiceLocal = {
    K: K, LIMIT: LIMIT,
    validate: validate, read: read, save: save, saveText: saveText, importFile: importFile,
    clear: clear, configured: configured, endpoint: endpoint, provider: provider,
    list: list, isLocal: isLocal, loopbackHost: loopbackHost
  };
})();
