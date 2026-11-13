const app = getApp();

Page({
  data: {
    r: null,
    bars: [],
    wordList: [],
    posterPath: '',
    saving: false,
    showPoster: false,
    current: 0,
    totalPages: 7,
  },

  onLoad() {
    const r = app.globalData.report;
    if (!r) {
      wx.reLaunch({ url: '/pages/index/index' });
      return;
    }
    // 24 小时活跃柱状图（含夜色高亮与峰值标记）
    const maxH = Math.max.apply(null, r.hours || [1]);
    const bars = (r.hours || []).map((v, i) => ({
      h: Math.max(4, Math.round((v / maxH) * 100)),
      v,
      label: i,
      showLabel: i % 6 === 0,
      night: i >= 23 || i <= 5,
      peak: i === r.peakHour,
    }));
    // 高频词：彩色 + 微旋转
    const WORD_COLORS = [
      '#FF5F7E', '#F04A70', '#FF8A5C', '#FFB347', '#B983E0',
      '#5C9DF0', '#4FC3A1', '#E06C8F', '#FF5F7E', '#FF8A5C',
    ];
    const maxN = r.words && r.words.length ? r.words[0].n : 1;
    const wordList = (r.words || []).map((w, idx) => ({
      ...w,
      size: 24 + Math.round((w.n / maxN) * 30),
      color: WORD_COLORS[idx % WORD_COLORS.length],
      rot: ((idx * 7) % 13) - 6,
    }));
    // 称号图标彩色气泡
    const AWARD_BG = {
      '🌙': 'linear-gradient(135deg,#EAF1FF,#DCE8FF)',
      '⚡': 'linear-gradient(135deg,#FFF3E0,#FFE7C2)',
      '💬': 'linear-gradient(135deg,#E8F0FF,#D5E5FF)',
      '🚀': 'linear-gradient(135deg,#FFE9EF,#FFD6E2)',
      '😂': 'linear-gradient(135deg,#FFF0E2,#FFE3C7)',
      '🍬': 'linear-gradient(135deg,#FFEBF0,#FFD9E4)',
      '🎭': 'linear-gradient(135deg,#F0EBFF,#E2D9FF)',
      '📅': 'linear-gradient(135deg,#E9F5F0,#D7EEE6)',
      '⏱️': 'linear-gradient(135deg,#EEF2F7,#DFE7F0)',
      '🏷️': 'linear-gradient(135deg,#FBF1E4,#F5E5CB)',
      '🍜': 'linear-gradient(135deg,#FBEFE4,#F6DFC9)',
    };
    r.awards = (r.awards || []).map((a) => ({
      ...a,
      bg: AWARD_BG[a.icon] || AWARD_BG['🏷️'],
    }));
    this.setData({ r, bars, wordList });
    wx.setNavigationBarTitle({
      title: r.meName + ' × ' + r.friendName + ' 的年报',
    });
  },

  onShareAppMessage() {
    const r = this.data.r;
    return {
      title: '来看看「' + r.meName + ' × ' + r.friendName + '」的年度报告 👀',
      path: '/pages/index/index',
      imageUrl: '/assets/sharecard.png',
    };
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  /* ================= 点击翻页 ================= */

  onSwiperChange(e) {
    this.setData({ current: e.detail.current });
  },

  nextPage() {
    if (this.data.current < this.data.totalPages - 1) {
      this.setData({ current: this.data.current + 1 });
    }
  },

  prevPage() {
    if (this.data.current > 0) {
      this.setData({ current: this.data.current - 1 });
    }
  },

  // 底部导航按钮：最后一页 → 生成海报，其余 → 下一页
  onNavTap() {
    if (this.data.current >= this.data.totalPages - 1) {
      this.makePoster();
    } else {
      this.nextPage();
    }
  },

  /* ================= 分享海报 ================= */

  makePoster() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '生成海报中…' });
    this.drawPoster()
      .then((path) => {
        this.setData({ posterPath: path, saving: false, showPoster: true });
        wx.hideLoading();
      })
      .catch(() => {
        this.setData({ saving: false });
        wx.hideLoading();
        wx.showToast({ title: '生成失败，请重试', icon: 'none' });
      });
  },

  closePoster() {
    this.setData({ showPoster: false });
  },

  noop() {},

  savePoster() {
    const p = this.data.posterPath;
    if (!p) return;
    wx.saveImageToPhotosAlbum({
      filePath: p,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: () => {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许「保存到相册」，才能保存海报',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) wx.openSetting();
          },
        });
      },
    });
  },

  drawPoster() {
    return new Promise((resolve, reject) => {
      const r = this.data.r;
      wx.createSelectorQuery()
        .select('#poster')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            reject(new Error('no canvas'));
            return;
          }
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const W = 640;
          const H = 1000;
          const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
          canvas.width = W * dpr;
          canvas.height = H * dpr;
          ctx.scale(dpr, dpr);

          // 背景
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#FF8FA6');
          g.addColorStop(0.55, '#FF5F7E');
          g.addColorStop(1, '#F04A70');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);

          // 装饰圆
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.beginPath();
          ctx.arc(580, 140, 170, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(50, 920, 120, 0, Math.PI * 2);
          ctx.fill();

          // 白色卡片
          this._roundRect(ctx, 36, 210, 568, 720, 36);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();

          // 顶部标题
          ctx.textAlign = 'center';
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 52px sans-serif';
          ctx.fillText('好友年报', W / 2, 110);
          ctx.font = '22px sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.fillText('FRIEND YEAR REPORT · ' + r.year, W / 2, 152);

          // 双方昵称
          ctx.fillStyle = '#4A2B33';
          ctx.font = 'bold 44px sans-serif';
          ctx.fillText(r.meName + ' × ' + r.friendName, W / 2, 292);
          ctx.font = '24px sans-serif';
          ctx.fillStyle = '#96737D';
          const range = r.startStr
            ? r.startStr + ' ~ ' + r.endStr
            : '由 ' + r.meName + ' 亲手填写生成';
          ctx.fillText(range, W / 2, 330);

          // 分隔线
          ctx.strokeStyle = '#F3DFE4';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(80, 360);
          ctx.lineTo(560, 360);
          ctx.stroke();

          // 数据格子 2×2
          const stats = [
            ['相识天数', r.spanDays + ' 天'],
            ['消息总数', (r.total > 999 ? (r.total / 1000).toFixed(1) + 'k' : r.total) + ' 条'],
            ['深夜占比', r.nightPct + '%'],
            ['消息比', r.myPct + ' : ' + r.friendPct],
          ];
          const boxW = 224;
          const boxH = 108;
          const boxY = [388, 512];
          stats.forEach((s, i) => {
            const x = 72 + (i % 2) * (boxW + 16);
            const y = boxY[Math.floor(i / 2)];
            this._roundRect(ctx, x, y, boxW, boxH, 20);
            ctx.fillStyle = '#FFF2F5';
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#96737D';
            ctx.font = '22px sans-serif';
            ctx.fillText(s[0], x + boxW / 2, y + 38);
            ctx.fillStyle = '#E04368';
            ctx.font = 'bold 36px sans-serif';
            ctx.fillText(s[1], x + boxW / 2, y + 84);
          });

          // 年度称号
          ctx.textAlign = 'left';
          ctx.font = 'bold 28px sans-serif';
          ctx.fillStyle = '#4A2B33';
          ctx.fillText('🏆 年度称号', 80, 672);
          let y = 714;
          ctx.font = '25px sans-serif';
          ctx.fillStyle = '#6B4A55';
          const list = r.awards.slice(0, 4);
          for (const a of list) {
            ctx.fillText(a.icon + '  ' + a.title, 80, y);
            ctx.font = '20px sans-serif';
            ctx.fillStyle = '#96737D';
            const desc = a.desc.length > 24 ? a.desc.slice(0, 24) + '…' : a.desc;
            ctx.fillText('　　' + desc, 80, y + 30);
            ctx.font = '25px sans-serif';
            ctx.fillStyle = '#6B4A55';
            y += 62;
          }

          // 底部
          ctx.textAlign = 'center';
          ctx.font = '20px sans-serif';
          ctx.fillStyle = '#C9A6AF';
          ctx.fillText('数据仅本地分析 · 由「好友年报」小程序生成', W / 2, H - 42);

          wx.canvasToTempFilePath({
            canvas,
            success: (res) => resolve(res.tempFilePath),
            fail: reject,
          });
        });
    });
  },

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },
});
