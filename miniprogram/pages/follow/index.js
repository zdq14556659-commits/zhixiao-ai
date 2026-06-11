const app = getApp();

Page({
  data: {
    id: "",
    customer: null,
    history: [],
    nextFollow: "2026-06-05"
  },

  onLoad(options) {
    if (!app.ensureLogin()) return;
    const id = Number(options.id);
    const customer = app.getState().customers.find((item) => item.id === id);
    const history = [...(customer?.followUps || [])].reverse().map((item) => ({
      ...item,
      displayTime: this.formatFollowTime(item)
    }));
    this.setData({ id, customer, history, nextFollow: customer?.nextFollow || app.globalData.today });
  },

  formatFollowTime(item = {}) {
    if (item.createdAt) {
      const time = new Date(item.createdAt);
      if (!Number.isNaN(time.getTime())) {
        const pad = (value) => String(value).padStart(2, "0");
        return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
      }
    }
    return item.date || "时间未记录";
  },

  onNextFollow(event) {
    this.setData({ nextFollow: event.detail.value });
  },

  submitFollow(event) {
    const note = event.detail.value.note || "更新了下次跟进时间。";
    wx.showLoading({ title: "保存中" });
    app
      .requestApi(`/customers/${this.data.id}/follow`, {
        method: "POST",
        data: {
          date: app.globalData.today,
          note,
          nextFollow: this.data.nextFollow
        }
      })
      .then(() => {
        app.loadRemoteState(() => {
          wx.hideLoading();
          wx.showToast({ title: "已保存" });
          setTimeout(() => wx.navigateBack(), 500);
        });
      })
      .catch((error) => {
        wx.hideLoading();
        wx.showToast({ title: error.message || "保存失败", icon: "none" });
      });
  }
});
