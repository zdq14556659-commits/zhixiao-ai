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
    app.updateCustomer(this.data.id, (customer) => ({
      ...customer,
      lastFollow: app.globalData.today,
      nextFollow: this.data.nextFollow,
      lastNote: note
    }));
    wx.showToast({ title: "已保存" });
    setTimeout(() => wx.navigateBack(), 500);
  }
});
