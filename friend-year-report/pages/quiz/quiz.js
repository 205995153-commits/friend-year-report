const analyzer = require('../../utils/analyzer');
const app = getApp();

Page({
  data: {
    knownDaysList: ['不到一个月', '1-3个月', '半年左右', '一年左右', '两三年', '三年以上', '十年以上'],
    knownDaysIndex: 1,
    timeList: ['深夜', '早上', '中午', '下午', '晚上', '随时'],
    timeIndex: 4,
    talkMore: 'TA',
    meName: '',
    friendName: '',
    topic: '',
    word: '',
    memory: '',
  },

  onKnownDays(e) {
    this.setData({ knownDaysIndex: Number(e.detail.value) });
  },
  onTime(e) {
    this.setData({ timeIndex: Number(e.detail.value) });
  },
  onTalk(e) {
    this.setData({ talkMore: e.currentTarget.dataset.v });
  },
  onInput(e) {
    this.setData({ [e.currentTarget.dataset.f]: e.detail.value });
  },

  generate() {
    const d = this.data;
    const report = analyzer.analyzeQuiz({
      meName: d.meName.trim() || '我',
      friendName: d.friendName.trim() || 'TA',
      knownDays: d.knownDaysList[d.knownDaysIndex],
      time: d.timeList[d.timeIndex],
      talkMore: d.talkMore,
      topic: d.topic.trim(),
      word: d.word.trim(),
      memory: d.memory.trim(),
    });
    app.globalData.report = report;
    wx.navigateTo({ url: '/pages/report/report?mode=quiz' });
  },
});
