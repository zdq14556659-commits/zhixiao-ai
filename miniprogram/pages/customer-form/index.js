const app = getApp();

Page({
  data: {
    stages: ["名单", "线索", "商机", "成交"],
    stageIndex: 0,
    owners: [],
    ownerUsers: [],
    ownerIndex: 0,
    channelSources: [],
    channelIndex: 0,
    nextFollow: "",
    demoAt: "",
    expectedDealDate: "",
    paymentDate: "",
    editingId: 0,
    identityLocked: false,
    form: {}
  },

  onLoad(options) {
    if (!app.ensureLogin()) return;
    const state = app.getState();
    const ownerUsers = app.visibleSales();
    const owners = ownerUsers.map((user) => user.name);
    const customer = options.id ? (state.customers || []).find((item) => Number(item.id) === Number(options.id)) : null;
    const stageIndex = Math.max(0, this.data.stages.indexOf(customer?.stage || options.stage || "名单"));
    const ownerIndex = Math.max(0, owners.indexOf(customer?.owner || customer?.followPerson || owners[0]));
    const channelSources = app.globalData.channelSources;
    const channelIndex = Math.max(0, channelSources.indexOf(app.normalizeChannelSource(customer?.channelSource || "其他")));
    this.setData({
      owners,
      ownerUsers,
      stageIndex,
      ownerIndex,
      channelSources,
      channelIndex,
      editingId: customer ? Number(customer.id) : 0,
      identityLocked: Boolean(customer) && !app.canAdmin(),
      nextFollow: customer?.nextFollow || app.globalData.today,
      demoAt: customer?.demoAt || "",
      expectedDealDate: customer?.expectedDealDate || "",
      paymentDate: customer?.paymentDate || "",
      form: customer || {}
    });
    wx.setNavigationBarTitle({ title: customer ? "编辑客户" : "新增客户" });
  },

  onStage(event) {
    this.setData({ stageIndex: Number(event.detail.value) });
  },

  onOwner(event) {
    this.setData({ ownerIndex: Number(event.detail.value) });
  },

  onChannel(event) {
    this.setData({ channelIndex: Number(event.detail.value) });
  },

  onNextFollow(event) {
    this.setData({ nextFollow: event.detail.value });
  },

  onDemoAt(event) {
    this.setData({ demoAt: event.detail.value });
  },

  onExpectedDealDate(event) {
    this.setData({ expectedDealDate: event.detail.value });
  },

  onPaymentDate(event) {
    this.setData({ paymentDate: event.detail.value });
  },

  async submitForm(event) {
    const form = event.detail.value;
    const previous = this.data.form || {};
    const name = this.data.identityLocked ? previous.name : form.name;
    const phone = this.data.identityLocked ? previous.phone : form.phone;
    if (!name || !phone) {
      wx.showToast({ title: "请填写客户和手机号", icon: "none" });
      return;
    }
    const stage = this.data.stages[this.data.stageIndex];
    const demoAt = this.data.demoAt;
    const contractAmount = Number(form.contractAmount || 0);
    const paymentAmount = Number(form.paymentAmount || 0);
    if (["商机", "成交"].includes(stage) && !demoAt) {
      wx.showToast({ title: "进入商机前请填写有效演示时间", icon: "none" });
      return;
    }
    if (stage === "成交" && contractAmount <= 0) {
      wx.showToast({ title: "进入成交前请填写合同金额", icon: "none" });
      return;
    }
    if (paymentAmount > 0 && !this.data.paymentDate) {
      wx.showToast({ title: "填写进款后请选择进款日期", icon: "none" });
      return;
    }
    if (this.data.paymentDate && paymentAmount <= 0) {
      wx.showToast({ title: "请选择进款金额", icon: "none" });
      return;
    }
    const ownerUser = this.data.ownerUsers[this.data.ownerIndex] || {};
    const customer = {
      ...previous,
      id: this.data.editingId || Date.now(),
      name,
      phone,
      channelSource: this.data.channelSources[this.data.channelIndex] || "其他",
      createdBy: previous.createdBy || app.getCurrentUser().name || "未记录",
      followPerson: ownerUser.name || this.data.owners[this.data.ownerIndex],
      address: form.address || "",
      stage,
      owner: this.data.owners[this.data.ownerIndex],
      ownerId: ownerUser.id || "",
      unitId: ownerUser.unitId || "",
      unit: ownerUser.unit || "",
      zone: ownerUser.zone || "",
      region: form.region || "待分区",
      amount: Number(form.amount) || 15,
      demoAt,
      quoteAmount: Number(form.quoteAmount || 0),
      expectedDealDate: this.data.expectedDealDate,
      contractAmount,
      paymentAmount,
      paymentDate: this.data.paymentDate,
      lossReason: form.lossReason || "",
      software: form.software || "待补充",
      createdAt: previous.createdAt || app.globalData.today,
      lastFollow: app.globalData.today,
      nextFollow: this.data.nextFollow,
      lastNote: form.note || (this.data.editingId ? undefined : "新增客户。")
    };
    wx.showLoading({ title: "保存中" });
    try {
      if (this.data.editingId) {
        await app.requestApi(`/customers/${this.data.editingId}`, { method: "PUT", data: customer });
      } else {
        await app.requestApi("/customers", { method: "POST", data: customer });
      }
      app.loadRemoteState(() => {
        wx.hideLoading();
        wx.showToast({ title: this.data.editingId ? "已更新" : "已保存", icon: "success" });
        setTimeout(() => wx.navigateBack(), 500);
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  }
});
