/* ============================================================
   voices-data.js · 墨读音色库（内置目录）
   —— 数据来源：Microsoft Edge TTS「Read Aloud」神经语音
      （https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list）
      共 32 款，覆盖 普通话 / 东北·陕西方言 / 美音 / 英音 / 日语。
   —— 为什么换掉上一版：上一版目录取自 Mossland Studio 公开音色库，但那些
      试听样音是「上传者自己的录音」，朗读任意正文时仍只能退回本机 Web Speech，
      于是在 Windows 上听感就是同一条冰冷机械音。本版改用神经 TTS，
      朗读与试听走同一条云端合成链路（/api/tts），任意文本都是真·神经语音。
   —— 字段：er / ep 为 Edge SSML 的语速偏移（%）与音高偏移（Hz）；
      rate / pitch 为退回本机声线时用的倍数（由 voices.js 按标签推算）。
   —— 想增删音色：直接改本表；想刷新可用清单，跑 scripts/list-edge-voices.js。
   ============================================================ */
window.INK_VOICE_DATA = [
  /* ---------- 普通话 ---------- */
  {
    id: "zh-CN-XiaoxiaoNeural", name: "晓晓 · 温润女声",
    d: "温润亲和，气息自然，长文与散文朗读最耐听。",
    lang: "zh", locale: "zh-CN", gender: "f", age: "青年",
    cat: "小说", scenes: ["小说", "散文"], tags: ["温润", "亲和", "自然"],
    er: "0%", ep: "0Hz", demo: "墨读，让每一页都值得慢慢读。"
  },
  {
    id: "zh-CN-XiaoyiNeural", name: "晓伊 · 明快女声",
    d: "明快俏皮，句尾上扬，适合轻小说与生活随笔。",
    lang: "zh", locale: "zh-CN", gender: "f", age: "少年",
    cat: "动画", scenes: ["动画", "轻小说"], tags: ["明快", "俏皮", "灵动"],
    er: "+6%", ep: "+6Hz", demo: "墨读，让每一页都值得慢慢读。"
  },
  {
    id: "zh-CN-YunxiNeural", name: "云希 · 清朗男声",
    d: "清朗阳光，叙事感强，小说正文的稳妥之选。",
    lang: "zh", locale: "zh-CN", gender: "m", age: "青年",
    cat: "小说", scenes: ["小说", "叙事"], tags: ["清朗", "阳光", "少年感"],
    er: "0%", ep: "0Hz", demo: "墨读，让每一页都值得慢慢读。"
  },
  {
    id: "zh-CN-YunjianNeural", name: "云健 · 浑厚男声",
    d: "浑厚有力，气势足，适合史诗、武侠与历史长篇。",
    lang: "zh", locale: "zh-CN", gender: "m", age: "中年",
    cat: "小说", scenes: ["小说", "武侠"], tags: ["浑厚", "有力", "激昂"],
    er: "-4%", ep: "-6Hz", demo: "墨读，让每一页都值得慢慢读。"
  },
  {
    id: "zh-CN-YunxiaNeural", name: "云夏 · 少年男声",
    d: "少年气清亮，轻快不油，适合青春与动画题材。",
    lang: "zh", locale: "zh-CN", gender: "m", age: "少年",
    cat: "动画", scenes: ["动画", "青春"], tags: ["少年", "轻快", "可爱"],
    er: "+4%", ep: "+8Hz", demo: "墨读，让每一页都值得慢慢读。"
  },
  {
    id: "zh-CN-YunyangNeural", name: "云扬 · 播音男声",
    d: "沉稳专业，字正腔圆，新闻与学术文本首选。",
    lang: "zh", locale: "zh-CN", gender: "m", age: "中年",
    cat: "新闻", scenes: ["新闻", "学术"], tags: ["沉稳", "专业", "可信"],
    er: "-6%", ep: "-4Hz", demo: "墨读，让每一页都值得慢慢读。"
  },
  {
    id: "zh-CN-liaoning-XiaobeiNeural", name: "小北 · 东北方言",
    d: "东北口音，爽利幽默，方言小说与乡土题材有味道。",
    lang: "zh", locale: "zh-CN-liaoning", gender: "f", age: "青年",
    cat: "方言", scenes: ["方言", "乡土"], tags: ["东北", "幽默", "爽利"],
    er: "0%", ep: "0Hz", demo: "墨读，让每一页都值得慢慢读。"
  },
  {
    id: "zh-CN-shaanxi-XiaoniNeural", name: "小妮 · 陕西方言",
    d: "陕西口音，亮堂亲切，适合地方志与乡土文学。",
    lang: "zh", locale: "zh-CN-shaanxi", gender: "f", age: "青年",
    cat: "方言", scenes: ["方言", "乡土"], tags: ["陕西", "亮堂", "亲切"],
    er: "0%", ep: "0Hz", demo: "墨读，让每一页都值得慢慢读。"
  },

  /* ---------- 美音 ---------- */
  {
    id: "en-US-AvaNeural", name: "Ava · 温暖女声",
    d: "温暖有表现力，像有人在耳边说话，适合回忆与散文。",
    lang: "en", locale: "en-US", gender: "f", age: "青年",
    cat: "对话", scenes: ["对话", "散文"], tags: ["温暖", "亲切", "表现力"],
    er: "0%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-AndrewNeural", name: "Andrew · 沉稳男声",
    d: "沉稳自信，音色厚实，长篇小说与传记都稳。",
    lang: "en", locale: "en-US", gender: "m", age: "中年",
    cat: "对话", scenes: ["对话", "传记"], tags: ["沉稳", "自信", "真诚"],
    er: "-2%", ep: "-2Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-EmmaNeural", name: "Emma · 明澈女声",
    d: "明澈愉快，吐字清楚，适合说明文与实用读物。",
    lang: "en", locale: "en-US", gender: "f", age: "青年",
    cat: "对话", scenes: ["对话", "说明"], tags: ["明澈", "愉快", "清楚"],
    er: "0%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-BrianNeural", name: "Brian · 随和男声",
    d: "随和诚恳，语流松弛，像朋友闲谈。",
    lang: "en", locale: "en-US", gender: "m", age: "青年",
    cat: "对话", scenes: ["对话", "随笔"], tags: ["随和", "诚恳", "轻松"],
    er: "0%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-AnaNeural", name: "Ana · 童声",
    d: "童声稚气，适合童话与儿童读物。",
    lang: "en", locale: "en-US", gender: "f", age: "少年",
    cat: "动画", scenes: ["动画", "童话"], tags: ["童声", "可爱", "稚气"],
    er: "+6%", ep: "+8Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-AriaNeural", name: "Aria · 播音女声",
    d: "播音腔，自信积极，新闻与评论最合适。",
    lang: "en", locale: "en-US", gender: "f", age: "青年",
    cat: "新闻", scenes: ["新闻", "评论"], tags: ["播音", "自信", "积极"],
    er: "-2%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-ChristopherNeural", name: "Christopher · 权威男声",
    d: "权威可靠，声音有分量，适合史书与纪实。",
    lang: "en", locale: "en-US", gender: "m", age: "中年",
    cat: "新闻", scenes: ["新闻", "纪实"], tags: ["权威", "可靠", "厚重"],
    er: "-4%", ep: "-4Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-EricNeural", name: "Eric · 理性男声",
    d: "理性克制，适合论文、技术文档与教科书。",
    lang: "en", locale: "en-US", gender: "m", age: "中年",
    cat: "新闻", scenes: ["学术", "技术"], tags: ["理性", "克制", "清晰"],
    er: "-2%", ep: "-2Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-GuyNeural", name: "Guy · 激昂男声",
    d: "激昂热情，叙事推进感强，适合冒险与科幻。",
    lang: "en", locale: "en-US", gender: "m", age: "青年",
    cat: "小说", scenes: ["小说", "科幻"], tags: ["激昂", "热情", "叙事"],
    er: "+2%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-JennyNeural", name: "Jenny · 亲和女声",
    d: "亲和体贴，语速平稳，陪伴式朗读最舒服。",
    lang: "en", locale: "en-US", gender: "f", age: "青年",
    cat: "对话", scenes: ["对话", "陪伴"], tags: ["亲和", "体贴", "舒适"],
    er: "-2%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-MichelleNeural", name: "Michelle · 悦耳女声",
    d: "悦耳亲切，音色柔亮，适合散文与书信。",
    lang: "en", locale: "en-US", gender: "f", age: "青年",
    cat: "小说", scenes: ["小说", "散文"], tags: ["悦耳", "亲切", "柔亮"],
    er: "0%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-RogerNeural", name: "Roger · 活泼男声",
    d: "活泼生动，起伏明显，适合青少年读物。",
    lang: "en", locale: "en-US", gender: "m", age: "青年",
    cat: "小说", scenes: ["小说", "青少年"], tags: ["活泼", "生动", "起伏"],
    er: "+2%", ep: "+2Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-SteffanNeural", name: "Steffan · 冷静男声",
    d: "冷静理性，句读干净，适合法律与报告。",
    lang: "en", locale: "en-US", gender: "m", age: "中年",
    cat: "新闻", scenes: ["新闻", "报告"], tags: ["冷静", "理性", "干净"],
    er: "-4%", ep: "-4Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-AvaMultilingualNeural", name: "Ava · 多语温暖女声",
    d: "多语种神经女声，中英混排也不跳戏。",
    lang: "en", locale: "en-US", gender: "f", age: "青年",
    cat: "多语种", scenes: ["多语种", "对话"], tags: ["多语种", "温暖", "表现力"],
    er: "0%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-AndrewMultilingualNeural", name: "Andrew · 多语沉稳男声",
    d: "多语种神经男声，外文原著与译本都稳。",
    lang: "en", locale: "en-US", gender: "m", age: "中年",
    cat: "多语种", scenes: ["多语种", "对话"], tags: ["多语种", "沉稳", "自信"],
    er: "-2%", ep: "-2Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-BrianMultilingualNeural", name: "Brian · 多语随和男声",
    d: "多语种神经男声，语气松弛，适合播客式读物。",
    lang: "en", locale: "en-US", gender: "m", age: "青年",
    cat: "多语种", scenes: ["多语种", "随笔"], tags: ["多语种", "随和", "轻松"],
    er: "0%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-US-EmmaMultilingualNeural", name: "Emma · 多语明澈女声",
    d: "多语种神经女声，吐字清楚，跨语种切换自然。",
    lang: "en", locale: "en-US", gender: "f", age: "青年",
    cat: "多语种", scenes: ["多语种", "说明"], tags: ["多语种", "明澈", "清楚"],
    er: "0%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },

  /* ---------- 英音 ---------- */
  {
    id: "en-GB-SoniaNeural", name: "Sonia · 英音优雅女声",
    d: "英式优雅，端庄克制，适合古典文学与传记。",
    lang: "en", locale: "en-GB", gender: "f", age: "中年",
    cat: "新闻", scenes: ["新闻", "古典"], tags: ["英音", "优雅", "端庄"],
    er: "-2%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-GB-LibbyNeural", name: "Libby · 英音女声",
    d: "英音友善，语调温和，日常叙事很自然。",
    lang: "en", locale: "en-GB", gender: "f", age: "青年",
    cat: "对话", scenes: ["对话", "叙事"], tags: ["英音", "友善", "温和"],
    er: "0%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-GB-MaisieNeural", name: "Maisie · 英音少女",
    d: "英音少女感，轻快明亮，适合成长小说。",
    lang: "en", locale: "en-GB", gender: "f", age: "少年",
    cat: "对话", scenes: ["对话", "成长"], tags: ["英音", "少女", "轻快"],
    er: "+4%", ep: "+6Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-GB-RyanNeural", name: "Ryan · 英音男声",
    d: "英音友好，语流顺畅，通用叙事稳妥。",
    lang: "en", locale: "en-GB", gender: "m", age: "青年",
    cat: "对话", scenes: ["对话", "叙事"], tags: ["英音", "友好", "顺畅"],
    er: "0%", ep: "0Hz", demo: "InkRead — make every page worth reading slowly."
  },
  {
    id: "en-GB-ThomasNeural", name: "Thomas · 英音绅士男声",
    d: "英音绅士，稳重克制，适合历史与纪实。",
    lang: "en", locale: "en-GB", gender: "m", age: "中年",
    cat: "新闻", scenes: ["新闻", "历史"], tags: ["英音", "绅士", "稳重"],
    er: "-4%", ep: "-4Hz", demo: "InkRead — make every page worth reading slowly."
  },

  /* ---------- 日语 ---------- */
  {
    id: "ja-JP-NanamiNeural", name: "Nanami · 日语女声",
    d: "日语女声，亲切自然，适合日文原著与随笔。",
    lang: "ja", locale: "ja-JP", gender: "f", age: "青年",
    cat: "对话", scenes: ["对话", "随笔"], tags: ["日语", "亲切", "自然"],
    er: "0%", ep: "0Hz", demo: "墨読、すべてのページをゆっくり読む価値があります。"
  },
  {
    id: "ja-JP-KeitaNeural", name: "Keita · 日语男声",
    d: "日语男声，友善平稳，叙事与说明都好用。",
    lang: "ja", locale: "ja-JP", gender: "m", age: "青年",
    cat: "对话", scenes: ["对话", "叙事"], tags: ["日语", "友善", "平稳"],
    er: "0%", ep: "0Hz", demo: "墨読、すべてのページをゆっくり読む価値があります。"
  }
];
