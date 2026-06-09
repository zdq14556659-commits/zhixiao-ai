const app = getApp();

Page({
  data: {
    stages: ["名单", "线索", "商机", "成交"],
    stageIndex: 0,
    owners: [],
    ownerUsers: [],
    ownerIndex: 0,
    nextFollow: "2026-06-05"
  },

  onLoad(options) {
    if (!app.ensureLogin()) return;
    const state = app.getState();
    const currentUser = app.getCurrentUser();
    const ownerUsers = app.visibleSales();
    const owners = ownerUsers.map((user) => user.name);
    const stageIndex = Math.max(0, this.data.stages.indexOf(options.stage || "名单"));
    this.setData({ owners, ownerUsers, stageIndex, nextFollow: app.globalData.today });
  },

  onStage(event) {
    this.setData({ stageIndex: Number(event.detail.value) });
  },

  onOwner(event) {
    this.setData({ ownerIndex: Number(event.detail.value) });
  },

  onNextFollow(event) {
    this.setData({ nextFollow: event.detail.value });
  },

  submitForm(event) {
    const form = event.detail.value;
    if (!form.name || !form.phone) {
      wx.showToast({ title: "请填写客户和手机号", icon: "none" });
      return;
    }
    const ownerUser = this.data.ownerUsers[this.data.ownerIndex] || {};
    const customer = {
      id: Date.now(),
      name: form.name,
      phone: form.phone,
      channelSource: form.channelSource || "手动录入",
      createdBy: app.getCurrentUser().name || "未记录",
      followPerson: ownerUser.name || this.data.owners[this.data.ownerIndex],
      address: form.address || "",
      stage: this.data.stages[this.data.stageIndex],
      owner: this.data.owners[this.data.ownerIndex],
      ownerId: ownerUser.id || "",
      unitId: ownerUser.unitId || "",
      unit: ownerUser.unit || "",
      zone: ownerUser.zone || "",
      region: form.region || "待分区",
      amount: Number(form.amount) || 15,
      software: form.software || "待补充",
      createdAt: app.globalData.today,
      lastFollow: app.globalData.today,
      nextFollow: this.data.nextFollow,
      lastNote: form.note || "新增客户。"
    };
    app.addCustomer(customer);
    wx.showToast({ title: "已保存" });
    setTimeout(() => wx.navigateBack(), 500);
  }
});
