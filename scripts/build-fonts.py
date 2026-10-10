#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""墨读 InkRead · 核心字体本地化构建（v2.19.6 P0-2）

为什么要有这个脚本：fonts.js 注册表里 25 款字体原先全部挂在
fonts.googleapis.com / cdn.jsdelivr.net 上，境内无代理时一个都下不来，
首屏只能用系统字兜底 —— 量测过：断掉三个 CDN 后 document.fonts.size
== 0。正文（思源宋体）、界面（思源黑体）、引注（霞鹜文楷）这三款是渲染
面积最大的中文字面，标题的拉丁展示体 Crimson Pro 是中文本地化之后仅剩的
一处在线/离线可见差异，所以这四款子集化后随包发出去；其余 21 款（代码块
的 Noto Sans Mono + 20 款商城体）继续走 CDN。

子集范围（charset）四层：
  1) GB2312 全部字符（6763 汉字 + 符号）—— 中文书籍正文底线
  2) 应用自有文案 —— ink-reader/ 下每个 html/js/css 里出现过的字符，
     保证界面永不回落
  3) 常用标点符号区 —— CJK 标点与全角、通用标点、数学算子、箭头、
     带圈数字、几何图形、假名、注音、竖排兼容形式
  4) 拉丁 —— Basic Latin + Latin-1 + Latin Extended-A（书名、人名、单位）

跑法（需要 fonttools + brotli，建议临时 venv，不进全局）：
  python -m venv .venv-fonts && .venv-fonts/Scripts/pip install -i \\
    https://pypi.tuna.tsinghua.edu.cn/simple fonttools brotli
  .venv-fonts/Scripts/python scripts/build-fonts.py            # 构建全部
  .venv-fonts/Scripts/python scripts/build-fonts.py --verify   # 只校验产物

源字体（OFL 1.1，可自由子集化与再分发）放在 --src 目录，缺失时脚本会
尝试按 FACES 里的 url 下载；本机若被网络工具拦截，手动放文件即可。
"""
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

try:  # Windows 控制台默认 cp1252，中文计数会直接抛 UnicodeEncodeError
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(ROOT, "ink-reader", "fonts")
SRCDIR_DEFAULT = os.path.join(ROOT, ".work", "fonts-src")

# 子集时保留的 OpenType 排版特性。全要（--layout-features=*）会把 aalt 等
# 「全部备选」字形也拖进子集，体积翻倍；这份名单只留正文真正用得上的：
# 字距/连写/地区形变/上下标/分数/竖排替换（读者有竖排模式）/比例宽度。
LAYOUT_FEATURES = ",".join([
    "kern", "liga", "clig", "calt", "ccmp", "locl", "mark", "mkmk",
    "zero", "lnum", "onum", "pnum", "tnum", "frac", "sups", "subs", "sinf",
    "vert", "vrt2", "ruby", "palt", "halt", "abvf", "abvm", "blwf", "blwm",
    "jp78", "jp83", "jp90", "jp04",
])
# name 记录留 0/13/14（版权 + 许可说明与网址）：OFL 要求再分发时保留版权与
# 许可声明，这两条只占几百字节。1/2/3/4/6 由 rename_out 换成 InkRead 自有名。
NAME_IDS = "0,1,2,3,4,6,13,14"

# 每个本地族对应的上游字体（写进 name 10 说明，也方便日后核对版本）
SOURCE_LABEL = {
    "InkRead Serif": "Noto Serif SC / 思源宋体（Google Fonts v36）",
    "InkRead Sans": "Noto Sans SC / 思源黑体（Google Fonts v41）",
    "InkRead Kai": "LXGW WenKai / 霞鹜文楷 v1.312",
    "InkRead Latin": "Crimson Pro（Google Fonts v28）",
}
# 老 Mac 平台的 name 记录只能存 mac_roman，中文进不去，另备一份纯 ASCII 说法
SOURCE_LABEL_ASCII = {
    "InkRead Serif": "Noto Serif SC (Google Fonts v36)",
    "InkRead Sans": "Noto Sans SC (Google Fonts v41)",
    "InkRead Kai": "LXGW WenKai v1.312",
    "InkRead Latin": "Crimson Pro (Google Fonts v28)",
}


def rename_out(out, family, weight):
    """把子集的内部族名换成 InkRead 自有名。

    OFL 1.1 第 (3) 条：改作后的字体不得使用原字体的 Reserved Font Name。
    子集属于改作，所以内部 name 记录与 CSS 族名都不能再叫 "Noto Serif SC"，
    否则推到公开仓库就是一次许可证违规。版权(0)与许可(13/14)原样保留。
    """
    from fontTools.ttLib import TTFont
    f = TTFont(out)
    # 子族名沿用原件：这批源字体只有 700 记 "Bold"，300/400/500/600/900 一律
    # "Regular"（多档字重靠 Typographic 名 16/17 表达）。自己按 <=500 判会
    # 把 600/900 也标成 Bold，等于给老式客户端报错档位。
    sub = f["name"].getDebugName(2) or ("Regular" if weight <= 500 else "Bold")
    tsub = f["name"].getDebugName(17) or str(weight)
    desc_cn = ("InkRead 子集：由 %s 经 pyftsubset 裁剪生成，字形未改动，"
               "仅删除未收录字符；原版权与 SIL OFL 1.1 许可保留。") % SOURCE_LABEL[family]
    desc_en = ("InkRead subset of %s, produced with pyftsubset: glyphs unchanged, "
               "only unused characters removed; original copyright and SIL OFL 1.1 "
               "license retained.") % SOURCE_LABEL_ASCII[family]
    names = {
        1: family,
        2: sub,
        3: "%s %d (InkRead subset)" % (family, weight),
        4: "%s %d" % (family, weight),
        6: "%s-%d" % (family.replace(" ", "-"), weight),
        16: family,
        17: tsub,
        10: desc_cn,
    }
    f["name"].names = [n for n in f["name"].names if n.nameID in (0, 13, 14)]
    # Windows 平台（3/1/0x409）走 UTF-16，中文说明放这里；老 Mac 平台（1/0）
    # 只能存 mac_roman，塞中文会直接编译失败，所以那条只写 ASCII，也不带说明。
    for plat, enc, lang in ((3, 1, 0x409), (1, 0, 0)):
        for nid, val in names.items():
            if plat == 1:
                if nid == 10:
                    val = desc_en
                elif not str(val).isascii():
                    continue
            f["name"].setName(val, nid, plat, enc, lang)
    f.save(out)
    f.close()

# (本地族名, 字重, 源文件名, 输出文件名, 源地址)
#
# 字重档位必须与 fonts.js 向 CDN 请求的那几档一模一样：本地族排在栈首，
# 子集里的字永远由本地族命中，浏览器按 CSS 字重匹配规则（CSS Fonts 4 §2.3：
# 目标 >500 时先向上取最近档，再向下）在「本地族已有的档位」里挑。档位不齐
# 就会和在线时选到不同的字面 —— 那才是真的观感漂移。
#   Noto Serif SC 在线档位 300/400/600/700/900
#   Noto Sans SC  在线档位 300/400/500/700/900（没有 600，所以界面里
#                 font-weight:600 在线离线都落到 700，本地跟着同一套即可）
#   LXGW WenKai   在线两档 400/700
FACES = [
    ("InkRead Serif", 300, "NotoSerifSC-300.ttf", "noto-serif-sc-300.woff2",
     "https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7TcqyWv.ttf"),
    ("InkRead Serif", 400, "NotoSerifSC-400.ttf", "noto-serif-sc-400.woff2",
     "https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7SCqyWv.ttf"),
    ("InkRead Serif", 600, "NotoSerifSC-600.ttf", "noto-serif-sc-600.woff2",
     "https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7RcrCWv.ttf"),
    ("InkRead Serif", 700, "NotoSerifSC-700.ttf", "noto-serif-sc-700.woff2",
     "https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7RlrCWv.ttf"),
    ("InkRead Serif", 900, "NotoSerifSC-900.ttf", "noto-serif-sc-900.woff2",
     "https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7QrrCWv.ttf"),
    ("InkRead Sans", 300, "NotoSansSC-300.ttf", "noto-sans-sc-300.woff2",
     "https://fonts.gstatic.com/s/notosanssc/v41/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG4HFnYw.ttf"),
    ("InkRead Sans", 400, "NotoSansSC-400.ttf", "noto-sans-sc-400.woff2",
     "https://fonts.gstatic.com/s/notosanssc/v41/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYw.ttf"),
    ("InkRead Sans", 500, "NotoSansSC-500.ttf", "noto-sans-sc-500.woff2",
     "https://fonts.gstatic.com/s/notosanssc/v41/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG-3FnYw.ttf"),
    ("InkRead Sans", 700, "NotoSansSC-700.ttf", "noto-sans-sc-700.woff2",
     "https://fonts.gstatic.com/s/notosanssc/v41/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaGzjCnYw.ttf"),
    ("InkRead Sans", 900, "NotoSansSC-900.ttf", "noto-sans-sc-900.woff2",
     "https://fonts.gstatic.com/s/notosanssc/v41/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG3bCnYw.ttf"),
    # 霞鹜文楷取 v1.312，两条理由：
    # ① CDN 那份（jsDelivr 的 lxgw-wenkai-webfont@1.7.0）内部版本实测是
    #    v1.250，v1.500 起重绘过字形；栈首若用 v1.520，同一行里「本地常用字
    #    + CDN 生僻字」会串成两套字形。
    # ② v1.520 起官方不再发 Bold；v1.320/v1.330 的 TTF cmap 有缺陷 —— 实测
    #    format 4 的 length 写 6694/6536，而它自己 1909/1917 段需要 ≥15288
    #    字节，fontTools 直接拒绝解析。v1.312 是「有 Bold 且 cmap 合法」的
    #    最早版本（实测 segCount 1338 / length 21986，自洽），也最贴近 v1.250。
    ("InkRead Kai", 400, "LXGWWenKai-v1.312-Regular.ttf", "lxgw-wenkai-400.woff2",
     "https://github.com/lxgw/LxgwWenKai/releases/download/v1.312/LXGWWenKai-Regular.ttf"),
    ("InkRead Kai", 700, "LXGWWenKai-v1.312-Bold.ttf", "lxgw-wenkai-700.woff2",
     "https://github.com/lxgw/LxgwWenKai/releases/download/v1.312/LXGWWenKai-Bold.ttf"),
    # 拉丁也进包，只进 Crimson Pro 这一款：它是 --font-crimson 栈首、全站标题
    # 都在用的展示体（v2.14 S1 定的），不是商城里可选的风格字体。离线时标题里
    # 的「2026」会掉到 Georgia，是这次中文字体本地化之后仅剩的一处在线/离线
    # 肉眼可见差异 —— 一款拉丁三个字重共 689 码位，整档几十 KB，补掉它比在
    # 台账里写「已知差异」划算。斜体 400 未进包（CDN 会请求）：标题不排斜体，
    # 正文斜体走 --font-serif，实测无影响。
    ("InkRead Latin", 400, "CrimsonPro-400.ttf", "crimson-pro-400.woff2",
     "https://fonts.gstatic.com/s/crimsonpro/v28/q5uUsoa5M_tv7IihmnkabC5XiXCAlXGks1WZzm18OA.ttf"),
    ("InkRead Latin", 600, "CrimsonPro-600.ttf", "crimson-pro-600.woff2",
     "https://fonts.gstatic.com/s/crimsonpro/v28/q5uUsoa5M_tv7IihmnkabC5XiXCAlXGks1WZEGp8OA.ttf"),
    ("InkRead Latin", 700, "CrimsonPro-700.ttf", "crimson-pro-700.woff2",
     "https://fonts.gstatic.com/s/crimsonpro/v28/q5uUsoa5M_tv7IihmnkabC5XiXCAlXGks1WZKWp8OA.ttf"),
]

RANGES = [
    (0x0020, 0x007E),  # Basic Latin
    (0x00A0, 0x017F),  # Latin-1 Supplement + Latin Extended-A
    (0x02B0, 0x02FF),  # 修饰字母（声调、上下标）
    (0x0370, 0x03FF),  # 希腊字母（公式/术语）
    (0x2000, 0x206F),  # General Punctuation：引号、破折号、省略号
    (0x2070, 0x209F),  # 上下标
    (0x20A0, 0x20BF),  # 货币符号
    (0x2100, 0x214F),  # 字母式符号（™ Ⅲ）
    (0x2150, 0x218F),  # 数字形式（分数、罗马数字）
    (0x2190, 0x21FF),  # 箭头
    (0x2200, 0x22FF),  # 数学算子
    (0x2300, 0x23FF),  # 技术符号
    (0x2460, 0x24FF),  # 带圈/带括号数字
    (0x2500, 0x257F),  # 制表符
    (0x2580, 0x259F),  # 方块元素
    (0x25A0, 0x25FF),  # 几何图形（项目符号）
    (0x2600, 0x267F),  # 杂项符号
    (0x2700, 0x27BF),  # 印刷符号
    (0x2E80, 0x2EFF),  # CJK 部首补充
    (0x2F00, 0x2FDF),  # 康熙字典部首
    (0x3000, 0x303F),  # CJK 标点与符号
    (0x3040, 0x30FF),  # 平假名 / 片假名
    (0x3105, 0x312F),  # 注音符号
    (0x3200, 0x33FF),  # CJK 兼容字符/方块
    (0xFE30, 0xFE4F),  # CJK 兼容形式（竖排标点）
    (0xFF00, 0xFFEF),  # 半角/全角形式
]
CJK_RE = re.compile(u"[\\u2e80-\\u9fff\\u3000-\\u303f\\u3040-\\u30ff\\uf900-\\ufaff]")


def gb2312_chars():
    out = set()
    for b1 in range(0xA1, 0xF8):
        for b2 in range(0xA1, 0xFF):
            try:
                out.update(bytes([b1, b2]).decode("gb2312"))
            except Exception:
                pass
    return out


def app_chars():
    """应用源码里真实出现过的每个字符 —— 界面文案永不回落到系统字。"""
    out = set()
    base = os.path.join(ROOT, "ink-reader")
    for name in sorted(os.listdir(base)):
        if not name.endswith((".html", ".js", ".css")):
            continue
        txt = io.open(os.path.join(base, name), encoding="utf-8", errors="ignore").read()
        for ch in txt:
            o = ord(ch)
            if o < 0x20:
                continue
            if CJK_RE.match(ch) or o >= 0x2000:
                out.add(ch)
    return out


def build_charset():
    s = gb2312_chars() | {chr(c) for lo, hi in RANGES for c in range(lo, hi + 1)} | app_chars()
    return {c for c in s if not (0xD800 <= ord(c) <= 0xDFFF)}


def fetch(url, dest):
    """先写 .part 再改名：下载中断留下的半截字体会被当成「源已就绪」，
    之后每次构建都静默用坏文件，所以不能让半途的文件落在最终路径上。"""
    print("  下载 %s" % url)
    req = urllib.request.Request(url, headers={"User-Agent": "InkRead-fonts-build"})
    tmp = dest + ".part"
    with urllib.request.urlopen(req, timeout=180) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    os.replace(tmp, dest)


def cmap_of(path):
    from fontTools.ttLib import TTFont
    f = TTFont(path, lazy=True)
    try:
        return set(f.getBestCmap().keys())
    finally:
        f.close()


def subset(src, out, chars_file):
    cmd = [sys.executable, "-m", "fontTools.subset", src,
           "--text-file=%s" % chars_file,
           "--flavor=woff2",
           "--layout-features=%s" % LAYOUT_FEATURES,
           "--ignore-missing-unicodes",
           "--name-IDs=%s" % NAME_IDS,
           "--output-file=%s" % out]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise SystemExit("子集化失败 %s:\n%s" % (src, p.stderr[-800:]))


def emit_css(built):
    """生成 fonts/local.css：只写实际产出成功的档位，免得引一个 404 的空族。"""
    lines = [
        "/* 自动生成：scripts/build-fonts.py（v2.19.6 P0-2 字体本地化）",
        "   请勿手改此文件；改字重/换字体请改脚本里的 FACES 再重跑。",
        "   三款核心中文体 + 标题拉丁展示体（Crimson Pro）的子集，随包离线可用。",
        "   族名刻意与 CDN 的 \"Noto Serif SC\" 等区分开：栈里排在最前，",
        "   子集里没有的生僻字才会继续回落到 CDN 那份全量字体。",
        "   字重档位与 fonts.js 向 CDN 请求的档位一致，离线在线选到同一字面。",
        "   字体许可证：SIL Open Font License 1.1（见 fonts/OFL.txt）。 */",
    ]
    for family, weight, out in built:
        lines.append(
            "@font-face{font-family:\"%s\";font-style:normal;font-weight:%d;"
            "font-display:swap;src:url(%s) format(\"woff2\")}" % (family, weight, out))
    dest = os.path.join(OUTDIR, "local.css")
    io.open(dest, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    return dest


def main():
    args = sys.argv[1:]
    srcdir = SRCDIR_DEFAULT
    for i, a in enumerate(args):
        if a == "--src":
            srcdir = args[i + 1]
    verify_only = "--verify" in args

    os.makedirs(OUTDIR, exist_ok=True)
    chars = build_charset()
    cps = sorted(ord(c) for c in chars)
    han = [c for c in cps if 0x4E00 <= c <= 0x9FFF]
    print("目标字符集：%d 码位（其中汉字 %d）" % (len(cps), len(han)))

    tmp = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")
    tmp.write("".join(chr(c) for c in cps))
    tmp.close()

    os.makedirs(srcdir, exist_ok=True)
    total = 0
    rows = []
    built = []                     # 实际产出成功的 (family, weight, woff2 文件名)
    for family, weight, srcname, outname, url in FACES:
        src = os.path.join(srcdir, srcname)
        out = os.path.join(OUTDIR, outname)
        if not verify_only and not os.path.exists(src):
            try:
                fetch(url, src)
            except Exception as e:
                print("  ! 取不到源字体 %s（%s）——手动放到 %s 后重跑" % (srcname, e, srcdir))
                continue
        if not os.path.exists(src):
            print("  跳过 %-28s 缺源文件" % outname)
            continue
        if not verify_only:
            subset(src, out, tmp.name)
            rename_out(out, family, weight)
        if not os.path.exists(out):
            print("  跳过 %-28s 无产物" % outname)
            continue
        src_cmap, out_cmap = cmap_of(src), cmap_of(out)
        want = set(cps) & src_cmap
        missing = sorted(want - out_cmap)          # 源里有、子集却漏了：构建缺陷
        absent = len(cps) - len(want)              # 源字体本身就没这个字：版本覆盖差
        size = os.path.getsize(out)
        total += size
        built.append((family, weight, outname))
        rows.append((outname, size, len(out_cmap), len(missing), absent))
        if missing:
            print("  ✗ %s 漏字 %d 个：%s" % (outname, len(missing),
                                            "".join(chr(c) for c in missing[:40])))
    os.unlink(tmp.name)

    print("\n%-30s %12s %8s %6s %6s" % ("产物", "bytes", "字形", "漏字", "缺字"))
    for n, s, g, m, a in rows:
        print("%-30s %12s %8d %6d %6d" % (n, format(s, ","), g, m, a))
    print("合计新增体积：%s bytes（%.2f MB）/ %d 个文件" % (format(total, ","), total / 1048576.0, len(rows)))
    print("「漏字」= 源字体有而子集丢了（构建缺陷，必须为 0）；"
          "「缺字」= 目标字符集里源字体本身没有的码位（继续回落 CDN/系统字）。")

    if not verify_only and built:
        print("CSS →", emit_css(built))


if __name__ == "__main__":
    main()
