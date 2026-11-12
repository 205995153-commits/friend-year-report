#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
好友年报 · 真实数据预览构建脚本（通用版）
用法：python3 scripts/build_demo.py 聊天记录.json [--me 我的昵称] [--friend TA的昵称] [--my-key 我的发送者标识]
1) 用 macOS 自带 JavaScriptCore（osascript JXA）运行小程序同款分析引擎（utils/analyzer.js）做分析；
2) 用 Pillow 绘制与小程序 Canvas 海报同款设计的 PNG 海报；
3) 生成浏览器可直接打开的 HTML 预览（海报以 base64 内嵌）。
聊天记录文件支持微信导出的 JSON 或 TXT，不会上传任何数据。
"""
import argparse
import base64
import json
import os
import subprocess
import sys

parser = argparse.ArgumentParser(description='用同源引擎对微信聊天记录生成 HTML 预览与海报')
parser.add_argument('chat', help='微信导出的聊天记录文件路径（JSON 或 TXT）')
parser.add_argument('--me', default='我', help='我的昵称（默认：我）')
parser.add_argument('--friend', default='TA', help='对方的昵称（默认：TA）')
parser.add_argument('--my-key', default=None, help='我的发送者标识（不填则自动识别）')
args = parser.parse_args()

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

WORDS_JS = open('friend-year-report/utils/words.js', encoding='utf8').read()
ANALYZER_JS = open('friend-year-report/utils/analyzer.js', encoding='utf8').read()
CHAT_JSON = open(args.chat, encoding='utf8').read()

ME_NAME = args.me
FRIEND_NAME = args.friend
MY_KEY = args.my_key

# ---------------------------------------------------------------- 1) 运行引擎
JXA = """// 好友年报引擎验证脚本（由 build_demo.py 生成）
var module = {exports:{}};
var require = function(n){ return module.exports; };
%s

%s

var A = module.exports;
var res = A.parseInput(%s);
if (res.error) { 'PARSE-ERROR: ' + res.error; } else {
  var r = A.analyze(res.msgs, {myKey:%s, meName:%s, friendName:%s});
  if (!r) { 'ANALYZE-FAILED'; } else { JSON.stringify(r); }
}
""" % (
    WORDS_JS,
    ANALYZER_JS,
    json.dumps(CHAT_JSON, ensure_ascii=False),
    json.dumps(MY_KEY),
    json.dumps(ME_NAME, ensure_ascii=False),
    json.dumps(FRIEND_NAME, ensure_ascii=False),
)

jxa_path = 'scripts/_run_engine.jxa'
os.makedirs('scripts', exist_ok=True)
with open(jxa_path, 'w', encoding='utf8') as f:
    f.write(JXA)

proc = subprocess.run(
    ['osascript', '-l', 'JavaScript', jxa_path],
    capture_output=True, text=True, timeout=180,
)
if proc.returncode != 0:
    print('[!] 引擎运行失败:\n', proc.stderr, file=sys.stderr)
    sys.exit(1)
out = proc.stdout.strip()
if not out.startswith('{'):
    print('[!] 引擎输出异常:', out[:300], file=sys.stderr)
    sys.exit(1)

report = json.loads(out)
print('[1/3] 引擎运行成功 →', json.dumps({
    'spanDays': report['spanDays'],
    'total': report['total'],
    'myCount': report['myCount'],
    'friendCount': report['friendCount'],
    'nightPct': report['nightPct'],
    'peakHour': report['peakHour'],
    'words': report['words'][:8],
    'awards': [a['title'] for a in report['awards']],
    'replyMedian': report['replyMedian'],
    'streak': report['streak'],
}, ensure_ascii=False, indent=1))
os.remove(jxa_path)

# ---------------------------------------------------------------- 2) 海报 PNG
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

W, H = 640, 1000
img = Image.new('RGB', (W, H))
d = ImageDraw.Draw(img)
top, mid, bot = (255, 143, 166), (255, 95, 126), (240, 74, 112)
for y in range(H):
    t = y / H
    if t < 0.55:
        c = [top[i] + (mid[i] - top[i]) * (t / 0.55) for i in range(3)]
    else:
        c = [mid[i] + (bot[i] - mid[i]) * ((t - 0.55) / 0.45) for i in range(3)]
    d.line([(0, y), (W, y)], fill=tuple(int(x) for x in c))

overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
od = ImageDraw.Draw(overlay)
od.ellipse([410, -60, 750, 280], fill=(255, 255, 255, 26))
od.ellipse([-70, 800, 170, 1040], fill=(255, 255, 255, 26))
od.rounded_rectangle([36, 210, 604, 930], radius=36, fill=(255, 255, 255, 255))
img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
d = ImageDraw.Draw(img)

FONT_CANDIDATES = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
]
EMOJI_FONT = '/System/Library/Fonts/Apple Color Emoji.ttc'


def font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=0)
            except Exception:
                continue
    return ImageFont.load_default(size)


def center_text(y, text, f, fill, stroke=0):
    w = d.textlength(text, font=f)
    d.text((W / 2 - w / 2, y), text, font=f, fill=fill,
           stroke_width=stroke, stroke_fill=fill)


# 称号图标 → (徽章底色, 替代符号)。PIL 无法渲染彩色 emoji，改用彩色圆徽 + 白符号
ICON_STYLE = {
    '🌙': ('#6C8FD4', '☾'),
    '⚡': ('#F5A623', '⚡'),
    '💬': ('#4F8EF7', '❝'),
    '🚀': ('#E06C8F', '➤'),
    '😂': ('#F0A860', '☺'),
    '🍬': ('#F08C9A', '♥'),
    '🎭': ('#9B7ED6', '✿'),
    '📅': ('#5FA88F', '▦'),
    '⏱️': ('#8FA6C0', '◷'),
    '🏷️': ('#D6A060', '❖'),
    '🍜': ('#D89A6C', '♨'),
    '🏆': ('#FFC94D', '★'),
}
SYMBOL_FONT = None


def symbol_font(size):
    global SYMBOL_FONT
    if SYMBOL_FONT is None:
        p = '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
        if os.path.exists(p):
            try:
                SYMBOL_FONT = ImageFont.truetype(p, size, index=0)
                return SYMBOL_FONT
            except Exception:
                pass
        SYMBOL_FONT = font(size)
    return SYMBOL_FONT


def draw_icon(cx, cy, icon, radius):
    """在 (cx, cy) 画一个彩色圆徽（图标为 emoji 字符时映射到底色+符号）"""
    color, sym = ICON_STYLE.get(icon, ('#C9A6AF', '•'))
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=color)
    f = symbol_font(int(radius * 1.25))
    w = d.textlength(sym, font=f)
    asc, desc = f.getmetrics()
    th = asc + desc
    d.text((cx - w / 2, cy - th / 2 + 1), sym, font=f, fill=(255, 255, 255))


center_text(70, '好友年报', font(52), (255, 255, 255), stroke=2)
center_text(136, 'FRIEND YEAR REPORT · ' + str(report['year']), font(22), (255, 255, 255, 235))
center_text(262, report['meName'] + ' × ' + report['friendName'], font(44), (74, 43, 51), stroke=1)
center_text(306, report['startStr'] + ' ~ ' + report['endStr'], font(24), (150, 115, 125))
d.line([(80, 362), (560, 362)], fill=(243, 223, 228), width=2)

stats = [
    ('相识天数', str(report['spanDays']) + ' 天'),
    ('消息总数', (str(round(report['total'] / 1000, 1)) + 'k' if report['total'] > 999 else str(report['total'])) + ' 条'),
    ('深夜占比', str(report['nightPct']) + '%'),
    ('消息比', str(report['myPct']) + ' : ' + str(report['friendPct'])),
]
bw, bh = 224, 108
for i, (label, value) in enumerate(stats):
    x = 72 + (i % 2) * (bw + 16)
    y = 388 + (i // 2) * (bh + 16)
    d.rounded_rectangle([x, y, x + bw, y + bh], radius=20, fill=(255, 242, 245))
    center_text(y + 22, label, font(22), (150, 115, 125))
    center_text(y + 54, value, font(36), (224, 67, 104), stroke=1)

# 年度称号标题（含奖杯徽章）
title_f = font(28)
draw_icon(99, 682, '🏆', 19)
d.text((126, 674), '年度称号', font=title_f, fill=(74, 43, 51), stroke_width=1, stroke_fill=(74, 43, 51))

y = 716
f_title = font(25)
f_desc = font(20)
for a in report['awards'][:4]:
    draw_icon(99, y + 10, a['icon'], 19)
    tx = 128
    d.text((tx, y), a['title'], font=f_title, fill=(107, 74, 85))
    desc = a['desc'][:24] + ('…' if len(a['desc']) > 24 else '')
    d.text((tx, y + 30), desc, font=f_desc, fill=(150, 115, 125))
    y += 62

center_text(H - 62, '数据仅本地分析 · 由「好友年报」小程序生成', font(20), (201, 166, 175))

os.makedirs('demo', exist_ok=True)
poster_png = 'demo/分享海报-%s.png' % FRIEND_NAME
img.save(poster_png)
print('[2/3] 海报 PNG 已生成 →', poster_png)

# ---------------------------------------------------------------- 3) HTML 预览
def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


max_h = max(report['hours']) or 1
bars_html = []
for i, v in enumerate(report['hours']):
    h = max(4, round(v / max_h * 100))
    val = f'<span class="bar-val">{v}</span>' if v > 0 else ''
    label = f'<span class="bar-label">{i}</span>' if i % 6 == 0 else '<span class="bar-label"></span>'
    bars_html.append(
        f'<div class="bar-col"><div class="bar" style="height:{h}%">{val}</div>{label}</div>'
    )

max_n = report['words'][0]['n'] if report['words'] else 1
words_html = ''.join(
    f'<span class="word" style="font-size:{24 + round(w["n"] / max_n * 30)}px">{esc(w["w"])}</span>'
    for w in report['words']
)

awards_html = ''.join(
    f'<div class="award-card"><div class="award-icon">{a["icon"]}</div>'
    f'<div class="award-body"><div class="award-title">{esc(a["title"])}</div>'
    f'<div class="award-desc">{esc(a["desc"])}</div></div></div>'
    for a in report['awards']
)

talk_more_line = {
    'friend': f'{report["friendName"]} 是年度话痨担当 🗣️',
    'me': f'{report["meName"]} 是年度话痨担当 🗣️',
    'tie': '势均力敌，双向奔赴的话痨 🤝',
}[report['talkMore']]

poster_b64 = base64.b64encode(open(poster_png, 'rb').read()).decode()

HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>好友年报预览 · {{ME}} × {{FRIEND}}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background: linear-gradient(160deg,#ffe8ee 0%,#fff6f4 45%,#fff0e6 100%);
    font-family:-apple-system,"PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif;
    color:#4a2b33; min-height:100vh; padding-bottom:60px;
  }
  .wrap { max-width:430px; margin:0 auto; padding:28px 22px; }
  .cover { text-align:center; padding:40px 0 28px; }
  .badge { display:inline-block; background:rgba(255,95,126,.12); color:#e04368;
    border-radius:999px; padding:6px 20px; font-size:13px; font-weight:700; margin-bottom:20px; }
  .names { font-size:34px; font-weight:900; color:#3d2129; }
  .range { margin-top:10px; font-size:14px; color:#96737d; }
  .big-emoji { font-size:64px; margin-top:24px; animation:float 2.6s ease-in-out infinite; }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  .hint { margin-top:14px; font-size:12px; color:#c9a6af; }
  .sec { background:#fff; border-radius:18px; padding:22px; margin-top:18px;
    box-shadow:0 8px 30px rgba(224,67,104,.08); }
  .sec-title { font-size:21px; font-weight:900; color:#3d2129; margin-bottom:16px; }
  .big-grid { display:flex; gap:14px; margin-bottom:16px; }
  .big-cell { flex:1; background:#fff; border-radius:18px; padding:20px 0; text-align:center;
    box-shadow:0 8px 30px rgba(224,67,104,.08); }
  .big-num { font-size:38px; font-weight:900; color:#e04368; }
  .big-label { margin-top:6px; font-size:13px; color:#96737d; }
  .ratio-row { display:flex; align-items:center; margin-bottom:14px; }
  .ratio-name { width:88px; font-size:14px; font-weight:700; }
  .ratio-bar { flex:1; height:15px; background:#f7eef0; border-radius:999px; overflow:hidden; }
  .ratio-fill { height:100%; border-radius:999px; }
  .ratio-fill.me { background:linear-gradient(90deg,#ff9a76,#ff5f7e); }
  .ratio-fill.friend { background:linear-gradient(90deg,#6fc3ff,#4f8ef7); }
  .ratio-pct { width:48px; text-align:right; font-size:14px; font-weight:800; }
  .verdict { background:#fff; border-radius:14px; padding:14px 18px; font-size:14px; color:#6b4a55;
    line-height:1.6; box-shadow:0 6px 24px rgba(224,67,104,.06); text-align:center; margin-top:12px; }
  .chart-bars { display:flex; align-items:flex-end; height:180px; gap:3px; }
  .bar-col { flex:1; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; height:100%; }
  .bar { width:100%; border-radius:5px 5px 0 0; background:linear-gradient(180deg,#ff8fa6,#ff5f7e);
    position:relative; min-height:3px; }
  .bar-val { position:absolute; top:-16px; left:50%; transform:translateX(-50%);
    font-size:8px; color:#96737d; white-space:nowrap; }
  .bar-label { margin-top:4px; font-size:9px; color:#96737d; min-height:12px; }
  .word-cloud { display:flex; flex-wrap:wrap; align-items:center; justify-content:center;
    gap:14px; min-height:180px; padding:10px 0; }
  .word { color:#5b3a45; font-weight:700; line-height:1.2; }
  .moment { display:flex; align-items:flex-start; padding:12px 0; border-bottom:1px solid #faf0f2; }
  .moment:last-child { border-bottom:none; }
  .moment-icon { font-size:26px; margin-right:14px; }
  .moment-label { font-size:12px; color:#96737d; }
  .moment-text { margin-top:4px; font-size:15px; color:#4a2b33; font-weight:600; }
  .award-card { display:flex; align-items:center; background:#fff; border-radius:16px;
    padding:16px; margin-bottom:12px; box-shadow:0 8px 30px rgba(224,67,104,.08); }
  .award-icon { font-size:32px; margin-right:16px; }
  .award-title { font-size:16px; font-weight:800; color:#3d2129; }
  .award-desc { margin-top:4px; font-size:12.5px; color:#96737d; line-height:1.5; }
  .verdict-text { font-size:15.5px; line-height:2; color:#4a2b33; }
  .poster-box { text-align:center; margin-top:18px; }
  .poster-box img { width:80%; border-radius:18px; box-shadow:0 14px 44px rgba(224,67,104,.25); }
  .poster-cap { margin-top:10px; font-size:12px; color:#96737d; }
  footer { text-align:center; margin-top:30px; font-size:12px; color:#c9a6af; line-height:1.8; }
  .note { background:#fff7e6; border-radius:14px; padding:14px 16px; font-size:12.5px;
    color:#a0783c; line-height:1.7; margin-top:18px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="cover">
    <span class="badge">✨ 好友年报 · {{YEAR}}</span>
    <div class="names">{{ME}} × {{FRIEND}}</div>
    <div class="range">{{RANGE}}</div>
    <div class="big-emoji">💌</div>
    <div class="hint">以下为小程序同款引擎 · 真实数据预览</div>
  </div>

  <div class="sec">
    <div class="sec-title">这一年，你们聊了多少</div>
    <div class="big-grid">
      <div class="big-cell"><div class="big-num">{{SPAN}}</div><div class="big-label">相识天数</div></div>
      <div class="big-cell"><div class="big-num">{{TOTAL}}</div><div class="big-label">消息总数</div></div>
    </div>
    <div class="ratio-row"><div class="ratio-name">{{ME}}</div>
      <div class="ratio-bar"><div class="ratio-fill me" style="width:{{MYPCT}}%"></div></div>
      <div class="ratio-pct">{{MYPCT}}%</div></div>
    <div class="ratio-row"><div class="ratio-name">{{FRIEND}}</div>
      <div class="ratio-bar"><div class="ratio-fill friend" style="width:{{FRIENDPCT}}%"></div></div>
      <div class="ratio-pct">{{FRIENDPCT}}%</div></div>
    <div class="verdict">{{TALKMORE}}</div>
  </div>

  <div class="sec">
    <div class="sec-title">你们几点在线</div>
    <div class="chart-bars">{{BARS}}</div>
    <div class="verdict">🌙 深夜消息占 {{NIGHTPCT}}%，高峰在 {{PEAK}}:00{{NIGHTNOTE}}</div>
  </div>

  <div class="sec">
    <div class="sec-title">你们的高频关键词</div>
    <div class="word-cloud">{{WORDS}}</div>
    <div class="verdict">😂 大笑 {{LAUGH}} 次 · 🍬 甜蜜用语 {{LOVE}} 次 · 🎭 斗图 {{EMOJI}} 次</div>
  </div>

  <div class="sec">
    <div class="sec-title">亲密瞬间</div>
    <div class="moment"><div class="moment-icon">💬</div><div>
      <div class="moment-label">第一条消息 · {{FIRSTTIME}}</div>
      <div class="moment-text">{{FIRSTTEXT}}</div></div></div>
    <div class="moment"><div class="moment-icon">🔥</div><div>
      <div class="moment-label">最活跃的一天 · {{ACTIVEDATE}}</div>
      <div class="moment-text">单日 {{ACTIVECOUNT}} 条消息轰炸</div></div></div>
    <div class="moment"><div class="moment-icon">📅</div><div>
      <div class="moment-label">最长连续聊天</div>
      <div class="moment-text">连续 {{STREAKDAYS}} 天（{{STREAKSTART}} ~ {{STREAKEND}}）</div></div></div>
    <div class="moment"><div class="moment-icon">🚀</div><div>
      <div class="moment-label">互相回复速度</div>
      <div class="moment-text">平均 {{REPLY}} 秒，这就是双向奔赴</div></div></div>
  </div>

  <div class="sec">
    <div class="sec-title">年度称号颁奖典礼</div>
    {{AWARDS}}
  </div>

  <div class="sec">
    <div class="sec-title">写给你们</div>
    <div class="verdict-text">{{VERDICT}}</div>
  </div>

  <div class="poster-box">
    <img src="data:image/png;base64,{{POSTER}}" alt="分享海报">
    <div class="poster-cap">小程序内点「生成分享海报」即可得到这张图并保存到相册</div>
  </div>

  <div class="note">💡 这是网页预览版，数据由小程序同款分析引擎对
  「{{ME}} × {{FRIEND}}」的聊天记录（{{TOTAL}} 条）计算得出。</div>

  <footer>数据仅本地分析 · 由「好友年报」小程序生成<br>FRIEND YEAR REPORT · {{YEAR}}</footer>
</div>
</body>
</html>
"""

night_note = '，认证夜猫子组合 🦉' if report['nightPct'] >= 25 else ''

replacements = {
    '{{ME}}': esc(report['meName']),
    '{{FRIEND}}': esc(report['friendName']),
    '{{YEAR}}': str(report['year']),
    '{{RANGE}}': esc(report['startStr'] + ' ～ ' + report['endStr']),
    '{{SPAN}}': str(report['spanDays']),
    '{{TOTAL}}': str(report['total']),
    '{{MYPCT}}': str(report['myPct']),
    '{{FRIENDPCT}}': str(report['friendPct']),
    '{{TALKMORE}}': esc(talk_more_line),
    '{{BARS}}': ''.join(bars_html),
    '{{NIGHTPCT}}': str(report['nightPct']),
    '{{PEAK}}': str(report['peakHour']),
    '{{NIGHTNOTE}}': night_note,
    '{{WORDS}}': words_html,
    '{{LAUGH}}': str(report['laughCount']),
    '{{LOVE}}': str(report['loveCount']),
    '{{EMOJI}}': str(report['emojiCount']),
    '{{FIRSTTIME}}': esc(report['firstMsg']['time']),
    '{{FIRSTTEXT}}': esc(report['firstMsg']['text']),
    '{{ACTIVEDATE}}': esc(report['activeDay']['date']),
    '{{ACTIVECOUNT}}': str(report['activeDay']['count']),
    '{{STREAKDAYS}}': str(report['streak']['days']),
    '{{STREAKSTART}}': esc(report['streak']['start']),
    '{{STREAKEND}}': esc(report['streak']['end']),
    '{{REPLY}}': str(report['replyMedian']),
    '{{AWARDS}}': awards_html,
    '{{VERDICT}}': esc(report['verdict']),
    '{{POSTER}}': poster_b64,
}
for k, v in replacements.items():
    HTML = HTML.replace(k, v)

os.makedirs('demo', exist_ok=True)
html_path = 'demo/好友年报预览-%s.html' % FRIEND_NAME
with open(html_path, 'w', encoding='utf8') as f:
    f.write(HTML)
print('[3/3] HTML 预览已生成 →', html_path)
