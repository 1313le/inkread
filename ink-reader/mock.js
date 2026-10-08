/* ============================================================
   mock.js · 墨读 InkRead 唯一数据源（所有页面只读 window.DB）
   ============================================================ */

window.DB = {
  /* 原为 user: { name:"林知夏", streak:21, readToday:46, weekWords:12480 } 一组演示常量。
     称呼改由本机档案 InkProfile（inkread.profile.v1）提供；三个统计数字全部改读
     InkStats（inkread.stats.v1 真实阅读/打卡记录）—— 界面上不再出现凭空写死的坚持度。 */

  /* 原为「林知夏 / 阿岚 / 晨读小组」三个演示负责人。单机工具里没有可指派的对象，
     而这个数组还会被当成真实导入任务的默认负责人 —— 每条自己导的任务都挂上了
     一个虚构人名。负责人控件已换成「加入今日」，这里留空数组保持 DB 形状不变。 */
  assignees: [],

  /* ---------- 书架 ---------- */
  shelf: [
    {
      id: "plan-01", type: "plan", theme: "plan",
      title: "2026 考研英语备考全程规划",
      author: "林知夏", meta: "3 月 2 日 · 导入 · 2.1 版",
      tone: ["#e7e0cb", "#9e3b2b"], motif: "seal",
      progress: 62, pages: 14, words: 2340, minutes: 18,
      tags: ["计划", "备考", "已解析 15 项任务"],
      desc: "覆盖 3–6 月英语一备考全程，含阶段总览、每月清单与每日例行任务。"
    },
    {
      id: "paper-01", type: "paper", theme: "academic",
      title: "电子墨水显示的阅读认知负荷研究",
      author: "周聿 等", meta: "《人机交互学报》· 2025 年第 4 期",
      tone: ["#dfe2df", "#3f5872"], motif: "grid",
      progress: 38, pages: 22, words: 8600, minutes: 34,
      tags: ["论文", "双栏", "含公式"],
      desc: "对比墨水屏与 LCD 在长文阅读中的认知负荷差异，含回归模型与显著性检验。"
    },
    {
      id: "book-01", type: "book", theme: "novel",
      title: "墨色山河 · 第一卷",
      author: "沈砚舟", meta: "散文体长篇 · 共 42 章",
      tone: ["#e4ddc9", "#2a2722"], motif: "mountain",
      progress: 12, pages: 386, words: 218000, minutes: 9,
      tags: ["文学", "散文体"],
      desc: "以一条江的流向写三代人的迁徙，文字疏淡，适合夜读。"
    },
    {
      id: "book-02", type: "book", theme: "novel",
      title: "认知觉醒 · 读书笔记",
      author: "摘录整理", meta: "5 月 14 日 · 导入",
      tone: ["#e8e2d2", "#4c6b45"], motif: "wave",
      progress: 0, pages: 96, words: 15200, minutes: 0,
      tags: ["摘录"],
      desc: "扫描版 PDF，等待 OCR 解析后进入阅读。", status: "pending"
    },
    {
      id: "paper-02", type: "paper", theme: "academic",
      title: "Attention Is All You Need（精读批注版）",
      author: "Vaswani 等", meta: "NeurIPS 2017 · 精读",
      tone: ["#e0e0e6", "#2f3a52"], motif: "grid",
      progress: 74, pages: 15, words: 6400, minutes: 26,
      tags: ["论文", "经典", "已批注"],
      desc: "Transformer 原始论文，含架构图与注意力公式推导。"
    },
    {
      id: "plan-02", type: "plan", theme: "plan",
      title: "每周外刊精读 · 春季卷",
      author: "晨读小组", meta: "2 月 14 日 · 导入",
      tone: ["#e6e2d0", "#a2702e"], motif: "seal",
      progress: 45, pages: 60, words: 12400, minutes: 22,
      tags: ["外刊", "共读"],
      desc: "十二周外刊选段合订，每周含精读任务与生词表。"
    },
    {
      id: "comic-01", type: "comic", theme: "comic",
      title: "山与灯 · 第一话",
      author: "岑野", meta: "条漫 · 全 24 话 · 日式分格",
      tone: ["#e9e6df", "#33313a"], motif: "mountain",
      progress: 8, pages: 42, words: 320, minutes: 6,
      tags: ["漫画", "条漫", "分格"],
      desc: "少年挑筐翻过垭口，在山口第一次看见那条江；木刻式黑白分格，适合分格引导逐格读。"
    }
  ],

  /* ---------- 全文内容（block 数组） ---------- */
  contents: {
    "plan-01": [
      { type: "h1", x: "2026 考研英语备考全程规划" },
      { type: "meta", x: "制定人：林知夏 · 2026 年 2 月 26 日 · 第 2.1 版" },
      { type: "h2", id: "sec-1", x: "一、总述与目标" },
      { type: "p", x: "本规划覆盖 2026 年 3 月至 6 月的英语一备考全程，目标为 12 月初考取得 75 分以上。全程遵循「词汇先行、阅读为本、真题为纲」的原则，并以每日例行任务保证执行密度，以每月任务清单校准方向。" },
      { type: "list", items: [
        "目标分数：英语一 75+（阅读 ≥ 36，作文 ≥ 22）",
        "每日投入：工作日 2.5 小时，周末 4 小时",
        "核心方法：真题精读 + 词汇循环记忆 + 每周模考"
      ] },
      { type: "h2", id: "sec-2", x: "二、阶段总览" },
      { type: "table", head: ["阶段", "时间", "阶段目标", "关键动作"], rows: [
        ["基础阶段", "3 月 – 4 月", "词汇第一轮全覆盖，阅读基本功过关", "核心词 3000 背诵；早年真题精析"],
        ["强化阶段", "5 月 – 6 月", "套题节奏建立，正确率稳定 60%+", "近十年真题套题训练；写作语料积累"],
        ["真题阶段", "7 月 – 9 月", "二刷真题，题型专项突破", "错题归因；翻译与新题型专项"],
        ["冲刺阶段", "10 月 – 12 月", "模考实战，作文模板成型", "全真模考；作文背诵与默写"]
      ] },
      { type: "h2", id: "sec-3", x: "三、每月任务清单" },
      { type: "p", x: "每月任务于月末最后一日复盘；未完成项按第六章弹性规则顺延，顺延不超过 5 天。" },
      { type: "h3", id: "mon-3", x: "三月 · 基础阶段" },
      { type: "list", items: [
        { id: "m-t1", x: "完成考研核心词汇第一轮背诵（3000 词），月末错词率 ≤ 30%" },
        { id: "m-t2", x: "精析 2005–2010 年真题阅读 12 篇，逐篇完成逐句翻译" },
        { id: "m-t3", x: "建立生词本与错题本，并确定每周日的复盘模板" }
      ] },
      { type: "h3", id: "mon-4", x: "四月 · 基础阶段" },
      { type: "list", items: [
        { id: "m-t4", x: "核心词汇第二轮巩固，月末错词率降至 20% 以下" },
        { id: "m-t5", x: "精析 2011–2015 年真题阅读 18 篇" },
        { id: "m-t6", x: "完成长难句专项训练 30 组，并整理句型卡片" }
      ] },
      { type: "h3", id: "mon-5", x: "五月 · 强化阶段" },
      { type: "list", items: [
        { id: "m-t7", x: "启动 2016–2020 年真题套题训练，每周 1 套并限时完成" },
        { id: "m-t8", x: "写作语料积累：背诵大小作文范文共 8 篇" }
      ] },
      { type: "h3", id: "mon-6", x: "六月 · 强化阶段" },
      { type: "list", items: [
        { id: "m-t9", x: "完成近十年真题第一轮全覆盖，输出题型错误率报告" },
        { id: "m-t10", x: "参加半年模拟测评 2 次，并各出具一份复盘报告" }
      ] },
      { type: "h2", id: "sec-4", x: "四、每日例行任务" },
      { type: "p", x: "以下条目为每日固定任务，已同步生成打卡清单；每周日任务替代当日常规安排。" },
      { type: "list", items: [
        { id: "d-t1", x: "07:00–08:00 晨读背词：背诵核心词汇 50 词，并复盘昨日错词" },
        { id: "d-t2", x: "12:30–13:00 午间泛读：精读外刊选段 1 段，圈出熟词僻义" },
        { id: "d-t3", x: "19:00–20:30 真题精读：精析阅读 1 篇，逐句翻译并整理生词" },
        { id: "d-t4", x: "21:00–21:30 复盘打卡：整理当日错题，勾选明日任务清单" },
        { id: "d-t5", x: "每周日 14:00–17:00 周测模考：限时完成真题 1 套并评分归档" }
      ] },
      { type: "h2", id: "sec-5", x: "五、参考资料与工具" },
      { type: "list", items: [
        "《考研核心词汇 5500》（第 3 版）",
        "张剑黄皮书 · 历年真题解析",
        "《经济学人》双语精读合订本",
        "墨读 InkRead · 学习模式（本文档阅读器）"
      ] },
      { type: "h2", id: "sec-6", x: "六、弹性规则与备注" },
      { type: "quote", x: "如遇加班或身体不适，当日任务可整体顺延一日，但每周至少保证 5 个完整执行日；连续中断超过 3 天，须先完成半量恢复日再回到常规节奏。计划服务于人，而非人服务于计划。" }
    ],

    "paper-01": [
      { type: "h1", x: "电子墨水显示的阅读认知负荷研究" },
      { type: "meta", x: "周聿 · 陈屿 · 沈迟 ｜ 《人机交互学报》2025 年第 4 期 ｜ 收稿 2025-01-14" },
      { type: "abstract", label: "摘要", x: "为厘清电子墨水屏（E-Ink）与液晶屏（LCD）在长文阅读中的认知负荷差异，本研究以 48 名被试开展对照实验，记录注视时长、回视次数与主观负荷量表得分。结果显示，墨水屏组平均回视次数降低 23.4%，主观负荷显著更低（p < 0.01），且在超过 40 分钟的连续阅读中差异进一步扩大。研究进一步构建了以亮度对比与刷新频率为自变量的回归模型，拟合优度 R² = 0.87。" },
      { type: "kw", items: ["电子墨水", "认知负荷", "长文阅读", "回归模型"] },
      { type: "h2", id: "sec-1", x: "1 引言" },
      { type: "p", x: "长文阅读对显示设备的诉求与短视频消费截然不同：它要求低干扰、低闪烁与稳定的视觉锚点。既往研究多聚焦于屏幕尺寸与字体可读性，对显示介质本身（反射式 vs 透射式）的认知代价讨论不足。本文以对照实验补足这一空缺。" },
      { type: "p", x: "我们将认知负荷操作化为三个可测指标：单页平均注视时长 t、跨行回视率 r，以及 NASA-TLX 主观得分 L。" },
      { type: "formula", x: "C_{total} = \\alpha \\cdot \\bar{t} + \\beta \\cdot r + \\gamma \\cdot L, \\quad \\alpha + \\beta + \\gamma = 1" },
      { type: "h2", id: "sec-2", x: "2 方法" },
      { type: "p", x: "实验采用被试内设计，每位被试在两种设备上各完成两篇等难度长文，篇目顺序做拉丁方平衡。" },
      { type: "list", items: [
        "被试：48 名（女 26，男 22），平均年龄 24.3 岁，裸眼或矫正视力正常",
        "设备：E-Ink 300ppi 反射式阅读器 与 264ppi LCD 平板，亮度统一校准至 120 cd/m²",
        "任务：每篇约 4200 字，阅读后完成 6 题理解测验",
        "采集：眼动仪 120Hz 采样，记录注视、回视与扫视轨迹"
      ] },
      { type: "fig", cap: "图 1 两种显示介质下的注视热区对比（左：E-Ink，右：LCD）", note: "热区越集中表示视觉锚点越稳定。" },
      { type: "h2", id: "sec-3", x: "3 结果与讨论" },
      { type: "table", head: ["指标", "E-Ink 组", "LCD 组", "差异"], rows: [
        ["平均注视时长 t (ms)", "248", "231", "+7.4%"],
        ["跨行回视率 r (%)", "11.2", "14.6", "−23.4%"],
        ["NASA-TLX 得分 L", "38.5", "47.9", "−19.6%"],
        ["理解测验正确率 (%)", "82.3", "81.1", "+1.2%"]
      ] },
      { type: "p", x: "如表 1 所示，墨水屏组的回视率与主观负荷均显著更低，而理解正确率无显著差异，说明负荷下降并非以牺牲理解为代价。" },
      { type: "formula", x: "r = \\frac{n_{regress}}{n_{lines}} \\times 100\\%, \\quad p < 0.01" },
      { type: "p", x: "回归模型显示，刷新频率对负荷的边际贡献远大于亮度对比（系数比约 3.1:1），这与反射式显示无背光频闪的假设一致。" },
      { type: "h2", id: "sec-4", x: "4 结论" },
      { type: "p", x: "墨水屏在 40 分钟以上的长文阅读中具有稳定的认知收益。对阅读器设计而言，与其追求更高刷新率，不如优先保证无闪烁与稳定的版面锚点。" },
      { type: "refs", items: [
        "Benedetto S, et al. E-readers and visual fatigue. PLoS ONE, 2013.",
        "Siegenthaler E, et al. Reading on LCD vs e-ink. Ergonomics, 2014.",
        "周聿. 反射式显示的阅读工效学. 人机交互学报, 2024."
      ] }
    ],

    "book-01": [
      { type: "h1", id: "sec-1", x: "第一章 · 上游" },
      { type: "p", x: "祖父说，江是从石头里长出来的。那年他十七岁，挑着两只空筐翻过垭口，看见谷底一条银线在雾里翻卷，像谁把一段天光揉碎了，随手丢在山里。" },
      { type: "p", x: "他放下筐，蹲在崖边看了很久。风从谷底上来，带着水汽和草木的腥气。他后来常讲，那一刻他听见江在说话——不是水声，是一种更低的东西，像是大地在缓慢地翻身。" },
      { type: "quote", x: "「你若顺着它走，它会告诉你所有人的去处。」" },
      { type: "p", x: "他确实顺着它走了。先是走了三天，然后是三个月，再后来是一辈子。江把他带到一个叫青桠的小镇，镇上有一家染坊，染坊的院子里晾着长长的蓝布，风一吹，整院子的蓝都在动。" },
      { type: "h2", id: "sec-2", x: "第二章 · 染坊" },
      { type: "p", x: "染坊的老板娘姓柳，人称柳三娘。她看人极准，一眼便说祖父的手适合搅染缸——稳，且不怕蓝。祖父便在染坊住了下来，一住六年。" },
      { type: "p", x: "那六年里，江水涨了三次，退了三次。镇上的孩子长高了，老人的背驼了，只有染缸里的蓝一直没变过。祖父说，蓝是最守信的颜色。" },
      { type: "p", x: "我出生的时候，祖父已经老了。他把我抱到江边，指着水说：你听。我听不见。他说，再听。我还是听不见。他便笑了，说，不急，这条江等你很久了。" }
    ],

    /* 漫画：以整幅图版为主（fig 占 8/10 个块），主脑据此判为「漫画」。
       每格自带 art（木刻画法的内联 SVG），与正文同一套 --ink 描边，不新增色值。 */
    "comic-01": [
      { type: "h1", x: "山与灯 · 第一话" },
      { type: "fig", cap: "第一格 · 垭口之外",
        art: '<path d="M2 74 L38 30 L60 54 L86 20 L148 74" opacity=".7"/><path d="M2 78h146" opacity=".3"/><path d="M52 78c12-9 34-9 46 0" opacity=".45"/>' },
      { type: "fig", cap: "第二格 · 挑筐的少年",
        art: '<circle cx="76" cy="22" r="8" opacity=".7"/><path d="M76 30v24" opacity=".7"/><path d="M76 38l-14 10M76 38l14 8" opacity=".55"/><path d="M76 54l-9 20M76 54l10 20" opacity=".55"/><path d="M46 34h60" opacity=".6"/><path d="M48 34v12M104 34v12" opacity=".45"/>' },
      { type: "p", x: "他在崖边站了很久，直到谷底那条银线开始发亮。" },
      { type: "fig", cap: "第三格 · 江在下面",
        art: '<path d="M4 32c14-9 28-9 42 0s28 9 42 0 28-9 54 0" opacity=".55"/><path d="M4 50c14-9 28-9 42 0s28 9 42 0 28-9 54 0" opacity=".4"/><path d="M4 68c14-9 28-9 42 0s28 9 42 0 28-9 54 0" opacity=".28"/><circle cx="112" cy="20" r="7" opacity=".45"/>' },
      { type: "fig", cap: "第四格 · 「你若顺着它走」",
        art: '<path d="M20 12h78a7 7 0 0 1 7 7v26a7 7 0 0 1-7 7H58l-15 13V52H20a7 7 0 0 1-7-7V19a7 7 0 0 1 7-7z" opacity=".65"/><path d="M32 28h54M32 38h34" opacity=".32"/>' },
      { type: "fig", cap: "第五格 · 青桠镇的屋檐",
        art: '<path d="M4 40 L32 20 L60 40 L88 20 L116 40 L146 22" opacity=".65"/><path d="M4 40v36h142V40" opacity=".45"/><path d="M22 48v28M46 48v28M70 48v28M94 48v28M118 48v28" opacity=".25"/><path d="M4 58c22 8 44 8 66 0s44-8 66 0" opacity=".35"/>' },
      { type: "fig", cap: "第六格 · 搅染缸的手",
        art: '<ellipse cx="74" cy="54" rx="46" ry="20" opacity=".5"/><path d="M28 54c0-11 20-19 46-19s46 8 46 19" opacity=".4"/><path d="M94 34l20-14" opacity=".55"/><circle cx="118" cy="16" r="5" opacity=".45"/>' },
      { type: "fig", cap: "第七格 · 夜里的灯",
        art: '<rect x="54" y="14" width="44" height="54" rx="4" opacity=".55"/><path d="M62 28h28M62 40h28M62 52h16" opacity=".28"/><path d="M16 78c8-15 16-15 24 0" opacity=".35"/><circle cx="122" cy="18" r="9" opacity=".3"/>' },
      { type: "fig", cap: "第八格 · 江与灯，都在等他",
        art: '<path d="M0 66h150" opacity=".45"/><path d="M0 66c22-13 44-13 66 0s44 13 66 0" opacity=".4"/><circle cx="120" cy="24" r="11" opacity=".45"/><path d="M120 6v-5M120 47v-4M102 24h-5M143 24h-5" opacity=".3"/><path d="M30 66V42l13-9 13 9v24" opacity=".5"/>' }
    ]
  },

  /* ---------- 笔记 / 高亮 / 书签 ----------
     ntype：md（Markdown·LaTeX）| outline（文字大纲）| mindmap（思维导图）
     kind ：语义分类，用于筛选（highlight 高亮 / note 笔记 / bookmark 书签） */
  notes: [
    { id: "n-1", docId: "paper-01", ntype: "md", kind: "highlight", color: "accent", text: "墨水屏组平均回视次数降低 23.4%，主观负荷显著更低（p < 0.01）", body: "", anchor: "sec-1", page: 1, at: "10-05 21:12" },
    { id: "n-2", docId: "paper-01", ntype: "md", kind: "note", color: "blue", title: "认知负荷加权模型的三个疑点", text: "C_{total} = \\alpha \\cdot \\bar{t} + \\beta \\cdot r + \\gamma \\cdot L", body: "## 认知负荷加权模型\n\n权重满足 $\\alpha + \\beta + \\gamma = 1$，作者默认三者等权，但**未给出敏感性分析**。\n\n可补充：\n\n- 用 $\\lambda$ 调节 $\\gamma$，观察 $C_{total}$ 的秩变化\n- 交叉验证 $R^2 = 0.87$ 是否过拟合\n\n> 待读：第 3 节回归表", anchor: "sec-2", page: 2, at: "10-05 21:40" },
    { id: "n-3", docId: "plan-01", ntype: "md", kind: "note", color: "green", title: "真题精读执行要点", text: "19:00–20:30 真题精读：精析阅读 1 篇，逐句翻译并整理生词", body: "**执行要点**\n\n1. 先计时 25 分钟做完，再看解析\n2. 逐句翻译，长句拆到 $\\ge 2$ 个从句\n3. 生词只记「熟词僻义」\n\n$$ \\text{效率} = \\frac{\\text{有效精读篇数}}{\\text{投入小时}} $$", anchor: "d-t3", page: 5, at: "10-04 19:55" },
    { id: "n-4", docId: "book-01", ntype: "md", kind: "highlight", color: "amber", text: "蓝是最守信的颜色。", body: "", anchor: "sec-1", page: 4, at: "10-03 22:18" },
    { id: "n-5", docId: "book-01", ntype: "md", kind: "bookmark", color: "ink", text: "第二章 · 染坊", body: "", anchor: "sec-2", page: 5, at: "10-03 22:30" },
    { id: "n-6", docId: "paper-01", ntype: "md", kind: "highlight", color: "green", text: "与其追求更高刷新率，不如优先保证无闪烁与稳定的版面锚点", body: "", anchor: "sec-4", page: 4, at: "10-06 08:02" },
    { id: "n-7", docId: "plan-01", ntype: "md", kind: "highlight", color: "accent", text: "计划服务于人，而非人服务于计划。", body: "", anchor: "sec-6", page: 6, at: "10-06 08:20" },
    /* 随笔（kind: margin）——书籍模式的独有工具产物，只属于被锚定的那一页 */
    { id: "n-10", docId: "book-01", ntype: "md", kind: "margin", color: "accent", text: "「只有染缸里的蓝一直没变过」和第一章那句「这条江等你很久了」说的是同一件事：不变的东西才等得起。", body: "「只有染缸里的蓝一直没变过」和第一章那句「这条江等你很久了」说的是同一件事：不变的东西才等得起。", anchor: "sec-2", page: 5, at: "10-04 23:02" },
    {
      id: "n-8", docId: "paper-01", ntype: "outline", kind: "note", color: "accent",
      title: "论文论证骨架", text: "认知负荷研究的论证骨架", body: "", anchor: "sec-1", page: 1, at: "10-06 09:10",
      outline: [
        { id: "o1", lv: 0, text: "研究问题", done: false },
        { id: "o2", lv: 1, text: "墨水屏与 LCD 的长文认知负荷差异", done: false },
        { id: "o3", lv: 2, text: "既往研究偏重屏幕尺寸与字体可读性", done: false },
        { id: "o4", lv: 2, text: "忽略显示介质（反射式 / 透射式）本身", done: false },
        { id: "o5", lv: 0, text: "方法", done: false },
        { id: "o6", lv: 1, text: "被试内设计 · 48 人 · 拉丁方平衡", done: true },
        { id: "o7", lv: 1, text: "三指标操作化", done: false },
        { id: "o8", lv: 2, text: "单页平均注视时长 t", done: false },
        { id: "o9", lv: 2, text: "跨行回视率 r", done: false },
        { id: "o10", lv: 2, text: "NASA-TLX 主观负荷 L", done: false },
        { id: "o11", lv: 0, text: "结论与可补之处", done: false },
        { id: "o12", lv: 1, text: "回视率 −23.4%，主观负荷显著更低", done: false },
        { id: "o13", lv: 1, text: "未做权重敏感性分析（待补）", done: false }
      ]
    },
    {
      id: "n-9", docId: "paper-01", ntype: "mindmap", kind: "note", color: "blue",
      title: "认知负荷研究 · 脑图", text: "由论证骨架展开的关系图", body: "", anchor: "sec-3", page: 3, at: "10-06 09:24",
      mind: {
        root: "m0",
        nodes: [
          { id: "m0", text: "认知负荷研究", x: 0, y: 0, parent: null },
          { id: "m1", text: "显示介质", x: 210, y: -104, parent: "m0" },
          { id: "m2", text: "反射式 E-Ink", x: 430, y: -156, parent: "m1" },
          { id: "m3", text: "透射式 LCD", x: 430, y: -56, parent: "m1" },
          { id: "m4", text: "测量指标", x: 210, y: 34, parent: "m0" },
          { id: "m5", text: "注视时长 t", x: 430, y: -4, parent: "m4" },
          { id: "m6", text: "回视率 r", x: 430, y: 62, parent: "m4" },
          { id: "m7", text: "主观负荷 L", x: 430, y: 128, parent: "m4" },
          { id: "m8", text: "待补：权重敏感性", x: 210, y: 176, parent: "m0" }
        ]
      }
    }
  ],

  /* ---------- 学习模式：解析出的任务 ---------- */
  tasks: [
    { id: "d-t1", kind: "daily", week: "每日", time: "07:00–08:00", title: "晨读背词 · 核心词汇 50 词", anchor: "d-t1", docId: "plan-01", src: "第四章 · 每日例行任务", quote: "07:00–08:00 晨读背词：背诵核心词汇 50 词，并复盘昨日错词", assignee: "林知夏" },
    { id: "d-t2", kind: "daily", week: "每日", time: "12:30–13:00", title: "午间泛读 · 外刊选段 1 段", anchor: "d-t2", docId: "plan-01", src: "第四章 · 每日例行任务", quote: "12:30–13:00 午间泛读：精读外刊选段 1 段，圈出熟词僻义", assignee: "林知夏" },
    { id: "d-t3", kind: "daily", week: "每日", time: "19:00–20:30", title: "真题精读 · 阅读 1 篇逐句翻译", anchor: "d-t3", docId: "plan-01", src: "第四章 · 每日例行任务", quote: "19:00–20:30 真题精读：精析阅读 1 篇，逐句翻译并整理生词", assignee: "林知夏" },
    { id: "d-t4", kind: "daily", week: "每日", time: "21:00–21:30", title: "复盘打卡 · 错题整理", anchor: "d-t4", docId: "plan-01", src: "第四章 · 每日例行任务", quote: "21:00–21:30 复盘打卡：整理当日错题，勾选明日任务清单", assignee: "阿岚" },
    { id: "d-t5", kind: "daily", week: "每周日", time: "14:00–17:00", title: "周测模考 · 真题 1 套限时", anchor: "d-t5", docId: "plan-01", src: "第四章 · 每日例行任务", quote: "每周日 14:00–17:00 周测模考：限时完成真题 1 套并评分归档", assignee: "林知夏" },

    { id: "m-t1", kind: "monthly", month: "2026-03", monthLabel: "三月", phase: "基础阶段", title: "核心词汇第一轮背诵 3000 词", anchor: "m-t1", docId: "plan-01", src: "第三章 · 三月任务清单", quote: "完成考研核心词汇第一轮背诵（3000 词），月末错词率 ≤ 30%", assignee: "林知夏" },
    { id: "m-t2", kind: "monthly", month: "2026-03", monthLabel: "三月", phase: "基础阶段", title: "精析早年真题阅读 12 篇", anchor: "m-t2", docId: "plan-01", src: "第三章 · 三月任务清单", quote: "精析 2005–2010 年真题阅读 12 篇，逐篇完成逐句翻译", assignee: "林知夏" },
    { id: "m-t3", kind: "monthly", month: "2026-03", monthLabel: "三月", phase: "基础阶段", title: "建立生词本与错题本", anchor: "m-t3", docId: "plan-01", src: "第三章 · 三月任务清单", quote: "建立生词本与错题本，并确定每周日的复盘模板", assignee: "阿岚" },
    { id: "m-t4", kind: "monthly", month: "2026-04", monthLabel: "四月", phase: "基础阶段", title: "词汇第二轮 · 错词率 ≤ 20%", anchor: "m-t4", docId: "plan-01", src: "第三章 · 四月任务清单", quote: "核心词汇第二轮巩固，月末错词率降至 20% 以下", assignee: "林知夏" },
    { id: "m-t5", kind: "monthly", month: "2026-04", monthLabel: "四月", phase: "基础阶段", title: "精析 2011–2015 真题阅读 18 篇", anchor: "m-t5", docId: "plan-01", src: "第三章 · 四月任务清单", quote: "精析 2011–2015 年真题阅读 18 篇", assignee: "林知夏" },
    { id: "m-t6", kind: "monthly", month: "2026-04", monthLabel: "四月", phase: "基础阶段", title: "长难句专项训练 30 组", anchor: "m-t6", docId: "plan-01", src: "第三章 · 四月任务清单", quote: "完成长难句专项训练 30 组，并整理句型卡片", assignee: "晨读小组" },
    { id: "m-t7", kind: "monthly", month: "2026-05", monthLabel: "五月", phase: "强化阶段", title: "真题套题训练 · 每周 1 套", anchor: "m-t7", docId: "plan-01", src: "第三章 · 五月任务清单", quote: "启动 2016–2020 年真题套题训练，每周 1 套并限时完成", assignee: "林知夏" },
    { id: "m-t8", kind: "monthly", month: "2026-05", monthLabel: "五月", phase: "强化阶段", title: "背诵大小作文范文 8 篇", anchor: "m-t8", docId: "plan-01", src: "第三章 · 五月任务清单", quote: "写作语料积累：背诵大小作文范文共 8 篇", assignee: "阿岚" },
    { id: "m-t9", kind: "monthly", month: "2026-06", monthLabel: "六月", phase: "强化阶段", title: "近十年真题第一轮全覆盖", anchor: "m-t9", docId: "plan-01", src: "第三章 · 六月任务清单", quote: "完成近十年真题第一轮全覆盖，输出题型错误率报告", assignee: "林知夏" },
    { id: "m-t10", kind: "monthly", month: "2026-06", monthLabel: "六月", phase: "强化阶段", title: "半年模拟测评 2 次", anchor: "m-t10", docId: "plan-01", src: "第三章 · 六月任务清单", quote: "参加半年模拟测评 2 次，并各出具一份复盘报告", assignee: "晨读小组" }
  ],

  months: [
    { key: "2026-03", label: "三月", phase: "基础阶段" },
    { key: "2026-04", label: "四月", phase: "基础阶段" },
    { key: "2026-05", label: "五月", phase: "强化阶段" },
    { key: "2026-06", label: "六月", phase: "强化阶段" }
  ],

  /* ---------- 记忆 ----------
     刻意不放预置记忆：记忆由主脑（brain.js）从读者的真实行为里学出来，
     存 inkread.memory.v1，每条带证据与置信度。预置的「六条规则」已删除。 */

  syncLog: [
    { t: "今日 08:12", dir: "桌面端 → 手机端", x: "同步打卡记录 3 项、阅读进度 62%" },
    { t: "昨日 23:05", dir: "手机端 → 桌面端", x: "同步晚间复盘笔记 1 条" },
    { t: "昨日 07:40", dir: "双向同步", x: "同步任务清单变更 2 项、分配调整 1 项" }
  ]
};
