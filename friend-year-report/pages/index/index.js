const app = getApp();

Page({
  data: {
    year: new Date().getFullYear(),
  },

  onLoad() {
    app.globalData.report = null;
  },

  goImport() {
    wx.navigateTo({ url: '/pages/import/import' });
  },

  goQuiz() {
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  },

  onShareAppMessage() {
    return {
      title: '来生成你们的好友年报吧 ✨',
      path: '/pages/index/index',
      imageUrl: '/assets/sharecard.png',
    };
  },
});
