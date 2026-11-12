// 好友年报 · 分析引擎
// 纯 JS 实现，无任何依赖，可同时用于小程序与浏览器预览
const WORDS = require('./words');

/* ================= 工具函数 ================= */
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
function fmtDate(t) {
  const d = new Date(t);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function fmtTime(t) {
  const d = new Date(t);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function fmtFull(t) {
  return fmtDate(t) + ' ' + fmtTime(t);
}
function isNightHour(h) {
  return h >= 23 || h <= 5;
}

/* ================= 输入解析 ================= */

// 尝试解析 JSON（微信电脑版导出格式 / 通用消息数组）
function tryParseJSON(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  if (s[0] === '[') {
    try {
      const v = JSON.parse(s);
      if (Array.isArray(v)) return v;
    } catch (e) {}
  }
  if (s[0] === '{') {
    try {
      const v = JSON.parse(s);
      if (Array.isArray(v.messages)) return v.messages;
      if (Array.isArray(v.data)) return v.data;
      if (Array.isArray(v.list)) return v.list;
    } catch (e) {}
  }
  return null;
}

// 解析微信导出 TXT（———— 2026-10-24 ———— / 01:02 她：内容）
function parseTxt(str) {
  const lines = String(str || '').split(/\r?\n/);
  const msgs = [];
  const labelCount = {};
  let curDate = null;
  let header = null;
  for (const raw of lines) {
    const line = raw.trim();
    const dm = line.match(/^————\s*(\d{4})-(\d{2})-(\d{2})\s*————$/);
    if (dm) {
      curDate = dm[1] + '-' + dm[2] + '-' + dm[3];
      continue;
    }
    const hm = line.match(/^《(.+?)》\s*微信聊天记录/);
    if (hm) {
      header = hm[1];
      continue;
    }
    const m = line.match(/^(\d{2}):(\d{2})(?::(\d{2}))?\s+([^：:]+)[：:](.*)$/);
    if (!m || !curDate) continue;
    const t = new Date(curDate + 'T' + m[1] + ':' + m[2] + ':' + (m[3] || '00')).getTime();
    if (isNaN(t)) continue;
    const who = (m[4] || '').trim();
    const text = (m[5] || '').trim();
    labelCount[who] = (labelCount[who] || 0) + 1;
    if (!who) continue;
    if (!text || text === '[系统消息]') {
      msgs.push({ t, sender: who, text: '', other: true });
    } else {
      msgs.push({ t, sender: who, text });
    }
  }
  const labels = Object.keys(labelCount).sort((a, b) => labelCount[b] - labelCount[a]);
  return { msgs, header, labels, labelCount };
}

// 时间值 → 毫秒时间戳（兼容秒/毫秒/日期字符串）
function toMs(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') {
    return v < 1e11 ? v * 1000 : v;
  }
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (!isNaN(n) && /^\d+$/.test(v.trim())) return n < 1e11 ? n * 1000 : n;
    return new Date(v).getTime();
  }
  return new Date(v).getTime();
}

// 单条 JSON 消息 → 内部消息对象（无法识别的返回 null）
function msgFromRaw(item) {
  const rawText = item.text != null ? String(item.text).trim() : '';
  let t = item.create_time != null ? toMs(item.create_time) : NaN;
  if (isNaN(t)) {
    t = toMs(item.createTime != null ? item.createTime : item.time != null ? item.time : item.ts != null ? item.ts : item.timestamp);
  }
  if (!t || isNaN(t)) return null;
  let sender = item.sender_id || item.senderId || item.sender || item.from || item.fromUser || '';
  sender = String(sender);
  if (!sender && item.from_self != null) sender = item.from_self ? '__me__' : '__other__';
  let fromSelf = null;
  if (item.from_self != null) fromSelf = !!item.from_self;
  else if (item.isSend != null) fromSelf = !!item.isSend;
  else if (item.fromSelf != null) fromSelf = !!item.fromSelf;
  else if (item.self != null) fromSelf = !!item.self;
  if (!rawText) {
    return { t, sender, text: '', other: true, fromSelf };
  }
  return { t, sender, text: rawText, fromSelf };
}

// 原始消息数组 → { msgs, meta } 或 { error }
function arrayToResult(arr) {
  const msgs = [];
  for (const it of arr) {
    const m = msgFromRaw(it);
    if (m) msgs.push(m);
  }
  if (!msgs.length) return { error: '没有解析到任何消息，请检查内容格式' };
  const counts = {};
  msgs.forEach((m) => (counts[m.sender] = (counts[m.sender] || 0) + 1));
  const senderIds = Object.keys(counts)
    .filter((s) => s)
    .sort((a, b) => counts[b] - counts[a]);
  return { msgs, meta: { type: 'json', senderIds, counts } };
}

// 统一入口：接受字符串（JSON/TXT）或原始消息数组 → { msgs, meta } 或 { error }
function parseInput(str) {
  if (Array.isArray(str)) {
    return arrayToResult(str);
  }
  const json = tryParseJSON(str);
  if (json) {
    return arrayToResult(json);
  }
  const t = parseTxt(str);
  if (t && t.msgs.length > 1) {
    return { msgs: t.msgs, meta: { type: 'txt', senderIds: t.labels, counts: t.labelCount, header: t.header } };
  }
  return { error: '无法识别聊天记录格式（支持微信导出的 JSON 或 TXT）' };
}

/* ================= 身份识别 ================= */

// 自动猜测"我"：好友验证消息的发送者
function guessMe(msgs) {
  for (const m of msgs) {
    if (m.text && m.text.indexOf('我通过了你的朋友验证请求') >= 0) return m.sender;
  }
  for (const m of msgs) {
    if (m.fromSelf === true) return m.sender;
  }
  return null;
}

// TXT 里的称呼推断：我 → me；她/他 → friend
function guessTxtRole(labels) {
  const me = labels.find((l) => l === '我');
  const friend = labels.find((l) => l === '她' || l === '他');
  return { me: me || null, friend: friend || null };
}

/* ================= 核心分析 ================= */

function analyze(msgs, opts) {
  opts = opts || {};
  if (!msgs || !msgs.length) return null;
  const list = msgs.slice().sort((a, b) => a.t - b.t);

  // 双方身份
  const counts = {};
  list.forEach((m) => (counts[m.sender] = (counts[m.sender] || 0) + 1));
  const ids = Object.keys(counts)
    .filter((s) => s)
    .sort((a, b) => counts[b] - counts[a]);
  let myKey = opts.myKey != null ? opts.myKey : guessMe(list);
  if (!myKey || counts[myKey] == null) myKey = ids[0];
  const friendKey = ids.filter((k) => k !== myKey).sort((a, b) => counts[b] - counts[a])[0] || myKey;
  const meName = opts.meName || '我';
  const friendName = opts.friendName || 'TA';
  const isMine = (m) => m.sender === myKey;
  const isFriend = (m) => m.sender === friendKey;

  const mineArr = list.filter(isMine);
  const friendArr = list.filter(isFriend);
  const textMsgs = list.filter((m) => m.text);
  const start = list[0].t;
  const end = list[list.length - 1].t;
  const spanDays = Math.max(1, Math.round(((end - start) / 86400000) * 10) / 10);
  const total = list.length;
  const textCount = textMsgs.length;

  // 24 小时活跃分布
  const hours = new Array(24).fill(0);
  const myHours = new Array(24).fill(0);
  const friendHours = new Array(24).fill(0);
  list.forEach((m) => {
    const h = new Date(m.t).getHours();
    hours[h]++;
    if (isMine(m)) myHours[h]++;
    else if (isFriend(m)) friendHours[h]++;
  });
  let peakHour = 0;
  hours.forEach((v, i) => {
    if (v > hours[peakHour]) peakHour = i;
  });
  const nightCount = hours.reduce((s, v, i) => s + (isNightHour(i) ? v : 0), 0);
  const nightPct = Math.round((nightCount / total) * 100);

  // 高频词（仅文字消息）
  const allTexts = textMsgs.map((m) => m.text);
  const words = WORDS.extractBigrams(allTexts, 18);

  // 口头禅 / 表情 / 甜蜜度
  let laughCount = 0;
  let loveCount = 0;
  let emojiCount = 0;
  allTexts.forEach((t) => {
    const lm = t.match(WORDS.LAUGH_RE);
    if (lm) laughCount += lm.length;
    const vm = t.match(WORDS.LOVE_RE);
    if (vm) loveCount += vm.length;
    const em = t.match(WORDS.EMOJI_RE);
    if (em) emojiCount += em.length;
  });

  // 平均消息长度
  const avgLen = (arr) =>
    arr.length ? Math.round(arr.reduce((s, m) => s + m.text.length, 0) / arr.length) : 0;
  const avgLenMe = avgLen(mineArr.filter((m) => m.text));
  const avgLenFriend = avgLen(friendArr.filter((m) => m.text));

  // 秒回统计（相邻两条来自不同人、间隔 ≤ 2 小时）
  const replyGaps = [];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1];
    const b = list[i];
    if (a.sender === b.sender) continue;
    const gap = (b.t - a.t) / 1000;
    if (gap >= 0 && gap <= 7200) replyGaps.push(gap);
  }
  let replyMedian = null;
  if (replyGaps.length) {
    replyGaps.sort((x, y) => x - y);
    const mid = Math.floor(replyGaps.length / 2);
    replyMedian =
      replyGaps.length % 2
        ? replyGaps[mid]
        : Math.round((replyGaps[mid - 1] + replyGaps[mid]) / 2);
  }

  // 每日消息数 → 最活跃一天 / 最长连续聊天
  const dayCount = {};
  list.forEach((m) => {
    const d = fmtDate(m.t);
    dayCount[d] = (dayCount[d] || 0) + 1;
  });
  let activeDay = null;
  Object.keys(dayCount).forEach((d) => {
    if (!activeDay || dayCount[d] > activeDay.count) activeDay = { date: d, count: dayCount[d] };
  });
  const sortedDays = Object.keys(dayCount).sort();
  let streak = { days: 0, start: null, end: null };
  let cur = { days: 0, start: null, end: null };
  for (let i = 0; i < sortedDays.length; i++) {
    const d = new Date(sortedDays[i] + 'T00:00:00').getTime();
    if (i > 0) {
      const prev = new Date(sortedDays[i - 1] + 'T00:00:00').getTime();
      if (d - prev === 86400000) {
        cur.days++;
        cur.end = sortedDays[i];
      } else {
        cur = { days: 1, start: sortedDays[i], end: sortedDays[i] };
      }
    } else {
      cur = { days: 1, start: sortedDays[i], end: sortedDays[i] };
    }
    if (cur.days > streak.days) streak = { days: cur.days, start: cur.start, end: cur.end };
  }

  // 第一条消息
  const first = textMsgs[0] || list[0];

  // 占比
  const myPct = Math.round((mineArr.length / total) * 100);
  const friendPct = Math.round((friendArr.length / total) * 100);
  const talkMore =
    mineArr.length > friendArr.length * 1.1
      ? 'me'
      : friendArr.length > mineArr.length * 1.1
      ? 'friend'
      : 'tie';

  // 年度称号
  const awards = [];
  if (nightPct >= 25) {
    awards.push({
      icon: '🌙',
      title: '夜猫子组合',
      desc: '深夜消息占 ' + nightPct + '%，凌晨 ' + peakHour + ':00 是你们的主场',
    });
  }
  if (total >= 1000 && spanDays <= 60) {
    awards.push({
      icon: '⚡',
      title: '一见如故',
      desc: spanDays + ' 天聊了 ' + total + ' 条，平均每天 ' + Math.round(total / spanDays) + ' 条',
    });
  }
  if (talkMore === 'friend') {
    awards.push({
      icon: '💬',
      title: '话痨担当',
      desc: friendName + ' 贡献了 ' + friendPct + '% 的消息',
    });
  } else if (talkMore === 'me') {
    awards.push({ icon: '💬', title: '话痨担当', desc: meName + ' 贡献了 ' + myPct + '% 的消息' });
  }
  if (replyMedian != null && replyMedian <= 60) {
    awards.push({
      icon: '🚀',
      title: '秒回搭档',
      desc: '互相回复平均只需 ' + replyMedian + ' 秒',
    });
  } else if (replyMedian != null && replyMedian <= 300) {
    awards.push({
      icon: '⏱️',
      title: '从不冷场',
      desc: '互相回复平均 ' + Math.round(replyMedian / 60) + ' 分钟',
    });
  }
  if (laughCount >= 50) {
    awards.push({ icon: '😂', title: '哈哈怪', desc: '累计大笑 ' + laughCount + ' 次，快乐源泉' });
  }
  if (loveCount >= 30) {
    awards.push({ icon: '🍬', title: '甜度超标', desc: '出现 ' + loveCount + ' 次甜蜜用语' });
  }
  if (emojiCount >= 50) {
    awards.push({ icon: '🎭', title: '表情包大师', desc: '累计斗图 ' + emojiCount + ' 次' });
  }
  if (streak.days >= 10) {
    awards.push({
      icon: '📅',
      title: '每日打卡',
      desc: '连续 ' + streak.days + ' 天保持联系',
    });
  }
  const cappedAwards = awards.slice(0, 5);

  // 总评语
  let verdict;
  const tml = talkMore === 'friend' ? friendName : talkMore === 'me' ? meName : '你们俩';
  if (spanDays <= 60 && total >= 1000) {
    verdict =
      '认识 ' + spanDays + ' 天，聊了 ' + total + ' 条消息——有些人一出现，就把别人的聊天置顶了。' +
      (nightPct >= 25 ? ' 你们尤其擅长在深夜交换心事，月亮都困了，你们还没聊完。' : '') +
      (laughCount >= 50 ? ' 满屏的"哈哈哈"就是这段关系最好的背景音。' : '') +
      ' 新的一年，继续把' + tml + '的置顶占满吧。';
  } else {
    verdict =
      '这一年，你们用 ' + total + ' 条消息堆出了一部专属连续剧。' +
      (nightPct >= 25 ? ' 深夜档主播非你们莫属。' : '') +
      (laughCount >= 50 ? ' 笑点共享，快乐加倍。' : '') +
      ' 这份年报送给最懂彼此的你们。';
  }

  return {
    mode: 'data',
    year: new Date(end).getFullYear(),
    meName,
    friendName,
    myKey,
    friendKey,
    start,
    end,
    startStr: fmtDate(start),
    endStr: fmtDate(end),
    spanDays,
    total,
    textCount,
    myCount: mineArr.length,
    friendCount: friendArr.length,
    myPct,
    friendPct,
    talkMore,
    avgLenMe,
    avgLenFriend,
    hours,
    myHours,
    friendHours,
    peakHour,
    nightPct,
    words,
    laughCount,
    loveCount,
    emojiCount,
    firstMsg: { time: fmtFull(first.t), text: first.text ? first.text.slice(0, 40) : '（一条图片/语音消息）', mine: isMine(first) },
    activeDay,
    streak,
    replyMedian,
    awards: cappedAwards,
    verdict,
  };
}

/* ================= 问答模式 ================= */

const KNOWN_DAYS_MAP = {
  不到一个月: 14,
  '1-3个月': 60,
  '半年左右': 182,
  '一年左右': 365,
  '两三年': 900,
  '三年以上': 1500,
  十年以上: 3650,
};

function analyzeQuiz(ans) {
  ans = ans || {};
  const meName = ans.meName || '我';
  const friendName = ans.friendName || 'TA';
  const knownDays = KNOWN_DAYS_MAP[ans.knownDays] || 60;
  const perDay =
    ans.talkMore === '我' ? 26 : ans.talkMore === 'TA' ? 42 : 34;
  const seed = (meName + friendName).length % 5;
  const total = Math.round(knownDays * perDay * (0.85 + seed * 0.08));
  const myCount = Math.round(total * (ans.talkMore === '我' ? 0.6 : ans.talkMore === 'TA' ? 0.4 : 0.5));
  const timeText = {
    深夜: '深夜档常驻嘉宾，越夜越清醒',
    早上: '早安专业户，一天从互相招呼开始',
    中午: '饭点必现，干饭也要同步汇报',
    下午: '摸鱼搭子，下午茶时间准时上线',
    晚上: '黄金档主播，晚上是你们的舞台',
    随时: '全天候在线，随叫随到',
  }[ans.time] || '全天候在线，随叫随到';
  const nightPct = ans.time === '深夜' ? 42 : 18;
  const talkMoreText =
    ans.talkMore === '我'
      ? meName + ' 更爱分享，是话题发动机'
      : ans.talkMore === 'TA'
      ? friendName + ' 更爱分享，是话题发动机'
      : '你们五五开，双向奔赴的话痨';
  const awards = [
    { icon: '📅', title: '老友记', desc: '相识 ' + (ans.knownDays || '') + '，时间是最好的滤镜' },
  ];
  if (ans.time === '深夜') {
    awards.push({ icon: '🌙', title: '夜猫子组合', desc: '深夜消息占 ' + nightPct + '%，月亮都困了你们还没聊完' });
  }
  awards.push({
    icon: '💬',
    title: '话痨担当',
    desc: talkMoreText,
  });
  if (ans.word) {
    awards.push({ icon: '🏷️', title: '专属标签', desc: 'TA 在你心里 = 「' + ans.word + '」' });
  }
  if (ans.topic) {
    awards.push({ icon: '🍜', title: '灵魂话题', desc: '最常聊：「' + ans.topic + '」' });
  }
  const verdict =
    '这篇年报由 ' + meName + ' 亲手填写。相识 ' + (ans.knownDays || '未知') +
    '，最常聊「' + (ans.topic || '说不完的话') + '」。' + timeText + '。' +
    (ans.memory ? ' 最难忘的是：「' + ans.memory + '」。' : '') +
    ' 故事还在继续，明年年报见。';

  return {
    mode: 'quiz',
    year: new Date().getFullYear(),
    meName,
    friendName,
    spanDays: knownDays,
    total,
    myCount,
    friendCount: total - myCount,
    myPct: ans.talkMore === '我' ? 60 : ans.talkMore === 'TA' ? 40 : 50,
    friendPct: ans.talkMore === '我' ? 40 : ans.talkMore === 'TA' ? 60 : 50,
    talkMore: ans.talkMore === '我' ? 'me' : ans.talkMore === 'TA' ? 'friend' : 'tie',
    timeText,
    talkMoreText,
    nightPct,
    peakHour: 0,
    words: [],
    topic: ans.topic || '',
    word: ans.word || '',
    memory: ans.memory || '',
    awards: awards.slice(0, 5),
    verdict,
    quiz: true,
  };
}

module.exports = {
  parseInput,
  analyze,
  analyzeQuiz,
  guessMe,
  guessTxtRole,
  fmtDate,
  fmtTime,
  fmtFull,
  isNightHour,
};
