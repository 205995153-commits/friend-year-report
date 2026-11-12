#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
网页版「好友年报」构建脚本
- 把小程序同源分析引擎（friend-year-report/utils/words.js + analyzer.js）内嵌进网页，
  保证网页版与小程序的分析结果完全一致（单一来源，避免两份代码漂移）；
- 生成一份确定性的演示聊天记录数据集（微信导出 JSON 格式），供"没有文件也能体验"使用；
- 输出单文件 web/index.html：纯前端、零依赖、本地分析，可直接双击打开或托管到任意静态空间。

用法：python3 scripts/build_web.py
"""
import datetime
import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def build_engine_block():
    words = open('friend-year-report/utils/words.js', encoding='utf8').read()
    analyzer = open('friend-year-report/utils/analyzer.js', encoding='utf8').read()
    block = (
        'var module = {exports:{}};\n'
        'var require = function(){ return module.exports; };\n'
        + words + '\n' + analyzer + '\n'
        + 'var Engine = module.exports;\n'
    )
    # 防止内嵌代码中出现的 "</" 提前终止 <script> 标签
    return block.replace('</', '<\\/')


def build_sample_data():
    """生成确定性演示数据：45 天、780 条、深夜活跃、TA 更话痨、笑声/甜蜜用语充足。"""
    rng = random.Random(20261112)
    me = 'wxid_demo_aaaaaa22'
    friend = 'wxid_demo_bbbbbb22'

    topics = ['吃饭', '睡觉', '电影', '游戏', '上课', '作业', '奶茶', '火锅', '唱歌',
              '下雨', '天气', '周末', '回家', '考试', '快递', '外卖', '猫', '狗', '逛街', '加班']
    fillers = ['真的吗', '那必须的', '好耶', '冲', '收到', '嗯嗯', '在干嘛', '出来玩',
               '几点睡', '晚安', '早安', '爱你', '想你', '贴贴', '哈哈哈哈', '2333',
               '😂', '🤣', '😘', '🥰', '🌙', '🍚', '☕', '冲鸭', '好耶好耶', '笑死',
               '没毛病', '谁懂啊', '绝了', '救命', '就是说', '困了', '醒了没', '吃饭没']
    love = ['爱你', '想你', '宝贝', '亲亲', '晚安', '早安', '贴贴', '😘', '🥰', '心心']
    laugh = ['哈哈哈', '哈哈哈哈', '笑死', '2333', '😂', '🤣', '鹅鹅鹅']

    base = int(datetime.datetime(2026, 10, 1, 0, 0).timestamp())  # 10-01 00:00（整日基准，hour 即墙钟小时）
    total = 780
    days = 45
    hour_weights = []
    for h in range(24):
        if h in (0, 1, 2, 23):
            hour_weights.append(13)
        elif h in (3, 22):
            hour_weights.append(7)
        elif 8 <= h <= 21:
            hour_weights.append(4)
        else:
            hour_weights.append(1)

    def make_text(sender):
        parts = []
        # 真实聊天的高频词第一名往往是对方的名字
        if rng.random() < 0.18:
            parts.append('小曦' if sender == me else '阿晚')
        if rng.random() < 0.30:
            parts.append(rng.choice(laugh))
        if rng.random() < 0.55:
            parts.append(rng.choice(topics))
        if rng.random() < 0.45:
            parts.append(rng.choice(fillers))
        if rng.random() < 0.10 and sender == friend:
            parts.append(rng.choice(love))
        if not parts:
            parts.append(rng.choice(['在吗', '嗯', '好', '哦', '哈哈哈哈']))
        return ''.join(parts)

    msgs = []
    last_t = None
    last_sender = None
    i = 0
    end_t = base + days * 86400
    while i < total:
        # 15% 概率开启一个新时段（时间按深夜权重随机），其余接续上一条形成对话流
        if last_t is None or rng.random() < 0.15:
            day = rng.randint(0, days - 1)
            hour = rng.choices(range(24), weights=hour_weights, k=1)[0]
            minute = rng.randint(0, 59)
            t = base + day * 86400 + hour * 3600 + minute * 60 + rng.randint(0, 59)
        else:
            gap = rng.randint(5, 90) if rng.random() < 0.82 else rng.randint(120, 600)
            t = last_t + gap
        if t > end_t:
            continue
        sender = friend if rng.random() < 0.74 else me
        # 70% 概率回应上一条（换人），模拟真实对话
        if last_sender is not None and rng.random() < 0.7:
            sender = friend if last_sender == me else me
        if rng.random() < 0.05:
            text = ''
        else:
            text = make_text(sender)
        msgs.append({
            'local_id': str(i + 1),
            'server_id': str(9000000000000000000 + i),
            'local_type': '1' if text else '3',
            'create_time': str(t),
            'sender_id': sender,
            'from_self': None,
            'text': text if text else None,
        })
        last_t = t
        last_sender = sender
        i += 1

    # 开头补一条好友验证消息（也是引擎自动识别"我是谁"的依据）
    first_t = base + 60
    msgs.insert(0, {
        'local_id': '0',
        'server_id': '8999999999999999999',
        'local_type': '1',
        'create_time': str(first_t),
        'sender_id': me,
        'from_self': None,
        'text': '我通过了你的朋友验证请求，现在我们可以开始聊天了',
    })
    msgs.sort(key=lambda m: int(m['create_time']))
    return json.dumps(msgs, ensure_ascii=False, separators=(',', ':'))


def main():
    template_path = 'web/index.template.html'
    out_path = 'web/index.html'
    if not os.path.exists(template_path):
        print('[!] 找不到模板:', template_path, file=sys.stderr)
        sys.exit(1)
    template = open(template_path, encoding='utf8').read()

    engine = build_engine_block()
    sample = build_sample_data().replace('</', '<\\/')

    if '/*__ENGINE__*/' not in template or '/*__SAMPLE_DATA__*/' not in template:
        print('[!] 模板缺少占位符', file=sys.stderr)
        sys.exit(1)

    html = template.replace('/*__ENGINE__*/', engine)
    html = html.replace('/*__SAMPLE_DATA__*/', "var SAMPLE_DATA = " + sample + ";\n")

    os.makedirs('web', exist_ok=True)
    with open(out_path, 'w', encoding='utf8') as f:
        f.write(html)
    print('[OK] 网页版已生成 →', out_path, '(%.1f KB)' % (len(html) / 1024))
    print('    引擎与小程序同源：friend-year-report/utils/{words,analyzer}.js')
    print('    内置演示数据：45 天 × 780 条消息')


if __name__ == '__main__':
    main()
