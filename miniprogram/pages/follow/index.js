const app = getApp();

Page({
  data: {
    id: "",
    customer: null,
    nextFollow: "2026-06-05"
  },

  onLoad(options) {
    if (!app.ensureLogin()) return;
    const id = Number(options.id);
    const customer = app.getState().customers.find((item) => item.id === id);
    this.setData({ id, customer, nextFollow: customer?.nextFollow || app.globalData.today });
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
