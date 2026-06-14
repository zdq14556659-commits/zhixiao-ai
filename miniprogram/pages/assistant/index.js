const app = getApp();

Page({
  data: {
    question: "",
    customers: [],
    customerNames: [],
    customerIndex: 0,
    selectedCustomerId: 0,
    selectedOpportunityId: 0,
    result: null,
    followDraft: "",
    savingDraft: false
  },

  onLoad(options) {
    this.pendingOpportunityId = Number(options.opportunityId || 0);
  },

  onShow() {
    if (!app.ensureLogin()) return;
    app.loadRemoteState(() => {
      const customers = app.scopeOpportunityRows();
      const selectedOpportunityId = this.pendingOpportunityId || this.data.selectedOpportunityId || customers[0]?.id || 0;
      const customerIndex = Math.max(0, customers.findIndex((item) => Number(item.id) === Number(selectedOpportunityId)));
      this.setData({
        customers,
        customerNames: customers.map((item) => `${item.name} · ${item.productName || "待确认产品"} · ${item.stage}`),
        customerIndex,
        selectedCustomerId: customers[customerIndex]?.customerId || 0,
        selectedOpportunityId: customers[customerIndex]?.id || 0
      });
      this.pendingOpportunityId = 0;
    });
  },

  onQuestion(event) {
    this.setData({ question: event.detail.value });
  },

  onCustomer(event) {
    const customerIndex = Number(event.detail.value);
    this.setData({ customerIndex, selectedCustomerId: this.data.customers[customerIndex]?.customerId || 0, selectedOpportunityId: this.data.customers[customerIndex]?.id || 0, result: null, followDraft: "" });
  },

  onDraftInput(event) {
    this.setData({ followDraft: event.detail.value });
  },

  async recommend() {
    if (!this.data.selectedCustomerId) {
      wx.showToast({ title: "请先选择客户", icon: "none" });
      return;
    }
    wx.showLoading({ title: "小智分析中" });
    try {
      const result = await app.requestApi(`/ai/customers/${this.data.selectedCustomerId}/advice`, {
        method: "POST",
        data: { question: this.data.question.trim(), opportunityId: this.data.selectedOpportunityId }
      });
      this.setData({ result, followDraft: result.advice?.followUpDraft || "" });
    } catch (error) {
      wx.showModal({ title: "分析失败", content: error.message || "请稍后重试", showCancel: false });
    } finally {
      wx.hideLoading();
    }
  },

  async saveFollowDraft() {
    const note = this.data.followDraft.trim();
    if (!note) {
      wx.showToast({ title: "请先完善跟进草稿", icon: "none" });
      return;
    }
    this.setData({ savingDraft: true });
    try {
      await app.requestApi(`/opportunities/${this.data.selectedOpportunityId}/follow`, {
        method: "POST",
        data: { note, nextFollow: app.globalData.today }
      });
      await new Promise((resolve) => app.loadRemoteState(resolve));
      wx.showToast({ title: "已写入跟进历史", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ savingDraft: false });
    }
  }
});
