// 词典与规则：停用字、表情、高频口头禅、甜蜜用语
// 全部为静态数据，不依赖任何网络或第三方库

// 单字停用字（用于二元组提取高频词）
const STOP_CHARS = new Set(
  (
    '的了是在我有和就不人都一他她它这那们着没到说要去上会么很再还又也而但或与及并之其可以' +
    '啊哦嗯呃呀吧呢吗嘛哈咯昂诶嘿哟哇哈哈' +
    '你我他她它我们你们他们自己什么怎么为什么怎么样知道觉得时候现在今天明天昨天然后所以因为但是' +
    '一个一下一点有些没有不是就是还是只是不过如果虽然已经这样那样这么那么多少'
  ).split('')
);

// 表情符号范围（Unicode）
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}]/gu;

// 大笑表达
const LAUGH_RE = /哈{2,}|hhh+|233+|笑死|笑不活|笑死我了|嘎嘎|鹅鹅鹅|ㅋㅋ|😂|🤣/gi;

// 甜蜜用语
const LOVE_RE = /爱你|喜欢你|想你|宝贝|宝宝|么么|亲亲|抱抱|晚安|早安|午安|心心|比心|❤|🥰|😘|💕/gi;

// 高频词黑名单（直接剔除的完整词）
const WORD_BLACKLIST = new Set([
  '聊天记录', '消息', '图片', '语音', '视频', '表情', '系统', '微信', '撤回',
  'http', 'https', 'com', 'www', '哈哈', '哈哈哈', '哈哈哈哈',
]);

// 根据文本提取二元组高频词
function extractBigrams(texts, topN) {
  const counter = {};
  for (let t of texts) {
    t = String(t || '')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(EMOJI_RE, ' ')
      .replace(/[^\u4e00-\u9fff]/g, '');
    const chars = t.split('').filter((c) => c && !STOP_CHARS.has(c));
    for (let i = 0; i < chars.length - 1; i++) {
      const w = chars[i] + chars[i + 1];
      if (WORD_BLACKLIST.has(w)) continue;
      counter[w] = (counter[w] || 0) + 1;
    }
  }
  return Object.keys(counter)
    .map((w) => ({ w, n: counter[w] }))
    .sort((a, b) => b.n - a.n)
    .slice(0, topN || 18);
}

module.exports = {
  STOP_CHARS,
  EMOJI_RE,
  LAUGH_RE,
  LOVE_RE,
  WORD_BLACKLIST,
  extractBigrams,
};
