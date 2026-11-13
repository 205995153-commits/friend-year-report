const analyzer = require('../../utils/analyzer');
const app = getApp();

Page({
  data: {
    pasted: '',
    step: 1, // 1=粘贴内容  2=确认身份
    error: '',
    parsed: null,
    senderOptions: [],
    myKey: null,
    meName: '',
    friendName: '',
  },

  onInput(e) {
    this.setData({ pasted: e.detail.value, error: '' });
  },

  // 隐私授权：调用隐私接口前主动触发官方隐私弹窗（老基础库降级直接执行）
  ensurePrivacy(cb) {
    if (typeof wx.requirePrivacyAuthorize === 'function') {
      wx.requirePrivacyAuthorize({
        success: () => cb(),
        fail: () => {
          wx.showToast({ title: '需同意隐私协议后才能选择文件', icon: 'none' });
        },
      });
    } else {
      cb();
    }
  },

  // 从微信聊天里选择导出的文件（如发到"文件传输助手"的记录文件）
  chooseFile() {
    this.ensurePrivacy(() => {
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['txt', 'json'],
        success: (res) => {
          const file = res.tempFiles[0];
          try {
            const fs = wx.getFileSystemManager();
            const data = fs.readFileSync(file.path, 'utf8');
            this.setData({ pasted: String(data) });
            this.doParse();
          } catch (e) {
            wx.showToast({ title: '读取文件失败', icon: 'none' });
          }
        },
        fail: (e) => {
          if (e && e.errMsg && e.errMsg.indexOf('cancel') >= 0) return;
          wx.showToast({ title: '选择文件失败', icon: 'none' });
        },
      });
    });
  },

  doParse() {
    const pasted = this.data.pasted;
    if (!pasted.trim()) {
      this.setData({ error: '请先粘贴或选择聊天记录内容' });
      return;
    }
    const result = analyzer.parseInput(pasted);
    if (result.error) {
      this.setData({ error: result.error });
      return;
    }
    const meta = result.meta;
    let myKey = null;
    let meName = '我';
    let friendName = 'TA';
    let senderOptions;
    if (meta.type === 'txt') {
      const role = analyzer.guessTxtRole(meta.senderIds);
      senderOptions = meta.senderIds.map((k, i) => ({
        key: k,
        label: k,
        count: meta.counts[k],
      }));
      if (role.me) {
        myKey = role.me;
      }
      if (role.friend) {
        friendName = role.friend === '她' || role.friend === '他' ? 'TA' : role.friend;
      }
      if (meta.header) {
        const parts = meta.header.split(/[×xX]/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          if (meName === '我') meName = parts[0];
          friendName = parts[1];
        }
      }
    } else {
      senderOptions = meta.senderIds.map((k, i) => ({
        key: k,
        label: '发送者' + (i + 1),
        count: meta.counts[k],
      }));
      myKey = analyzer.guessMe(result.msgs);
    }
    this.setData({
      step: 2,
      parsed: result,
      senderOptions,
      myKey,
      meName,
      friendName,
      error: '',
    });
  },

  pickMe(e) {
    this.setData({ myKey: e.currentTarget.dataset.key });
  },

  onMeName(e) {
    this.setData({ meName: e.detail.value });
  },
  onFriendName(e) {
    this.setData({ friendName: e.detail.value });
  },

  generate() {
    const { parsed, myKey, meName, friendName } = this.data;
    if (!myKey) {
      wx.showToast({ title: '请先选择"我"是哪一位', icon: 'none' });
      return;
    }
    const report = analyzer.analyze(parsed.msgs, {
      myKey,
      meName: meName.trim() || '我',
      friendName: friendName.trim() || 'TA',
    });
    if (!report) {
      wx.showToast({ title: '分析失败，请检查内容', icon: 'none' });
      return;
    }
    app.globalData.report = report;
    wx.navigateTo({ url: '/pages/report/report?mode=data' });
  },

  back() {
    this.setData({ step: 1, parsed: null, error: '' });
  },
});
