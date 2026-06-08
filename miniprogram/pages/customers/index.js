const app = getApp();

Page({
  data: {
    currentStage: "名单",
    stageTabs: [],
    customers: [],
    filtered: [],
    keyword: "",
    owners: ["全部"],
    ownerIndex: 0,
    regions: ["全部"],
    regionIndex: 0,
    startDate: "",
    endDate: "",
    followStatuses: ["全部", "今日待跟进", "已逾期", "未设置"],
    followStatusIndex: 0
  },

  onLoad(options) {
    if (options.stage) this.setData({ currentStage: options.stage });
  },

  onShow() {
    if (!app.ensureLogin()) return;
    app.loadRemoteState(() => this.loadData());
  },

  loadData() {
    const state = app.getState();
    const currentUser = app.getCurrentUser();
    const role = app.getRole(currentUser);
    const customers = app.scopeCustomers();
    const owners = role.customerScope === "self" ? [currentUser.name] : ["全部", ...app.visibleSales().map((user) => user.name)];
    const regions = ["全部", ...Array.from(new Set(customers.map((item) => item.region).filter(Boolean)))];
    const ownerIndex = Math.min(this.data.ownerIndex, owners.length - 1);
    const regionIndex = Math.min(this.data.regionIndex, regions.length - 1);
    this.setData({
      customers,
      owners,
      regions,
      ownerIndex,
      regionIndex,
      stageTabs: state.stages.map((stage) => ({
        name: stage,
        count: customers.filter((customer) => customer.stage === stage).length
      }))
    });
    this.applyFilters();
  },

  switchStage(event) {
    this.setData({ currentStage: event.currentTarget.dataset.stage });
    this.applyFilters();
  },

  onKeyword(event) {
    this.setData({ keyword: event.detail.value });
  },

  onOwner(event) {
    this.setData({ ownerIndex: Number(event.detail.value) });
    this.applyFilters();
  },

  onRegion(event) {
    this.setData({ regionIndex: Number(event.detail.value) });
    this.applyFilters();
  },

  onStartDate(event) {
    this.setData({ startDate: event.detail.value });
    this.applyFilters();
  },

  onEndDate(event) {
    this.setData({ endDate: event.detail.value });
    this.applyFilters();
  },

  onFollowStatus(event) {
    this.setData({ followStatusIndex: Number(event.detail.value) });
    this.applyFilters();
  },

  applyFilters() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const owner = this.data.owners[this.data.ownerIndex];
    const region = this.data.regions[this.data.regionIndex];
    const status = this.data.followStatuses[this.data.followStatusIndex];
    const filtered = this.data.customers.filter((item) => {
      const source = `${item.name} ${item.phone} ${item.software} ${item.lastNote}`.toLowerCase();
      if (item.stage !== this.data.currentStage) return false;
      if (keyword && !source.includes(keyword)) return false;
      if (owner !== "全部" && item.owner !== owner) return false;
      if (region !== "全部" && item.region !== region) return false;
      if (this.data.startDate && item.createdAt < this.data.startDate) return false;
      if (this.data.endDate && item.createdAt > this.data.endDate) return false;
      if (status === "今日待跟进" && item.nextFollow !== app.globalData.today) return false;
      if (status === "已逾期" && (!item.nextFollow || item.nextFollow >= app.globalData.today)) return false;
      if (status === "未设置" && item.nextFollow) return false;
      return true;
    });
    this.setData({ filtered });
  },

  resetFilters() {
    this.setData({
      keyword: "",
      ownerIndex: 0,
      regionIndex: 0,
      startDate: "",
      endDate: "",
      followStatusIndex: 0
    });
    this.applyFilters();
  },

  goAdd() {
    wx.navigateTo({ url: `/pages/customer-form/index?stage=${this.data.currentStage}` });
  },

  goBatchImport() {
    wx.navigateTo({ url: `/pages/batch-import/index?stage=${this.data.currentStage}` });
  },

  callCustomer(event) {
    wx.makePhoneCall({ phoneNumber: event.currentTarget.dataset.phone });
  },

  goFollow(event) {
    wx.navigateTo({ url: `/pages/follow/index?id=${event.currentTarget.dataset.id}` });
  },

  advanceCustomer(event) {
    const id = Number(event.currentTarget.dataset.id);
    const state = app.getState();
    const stages = state.stages;
    const index = state.customers.findIndex((item) => item.id === id);
    if (index < 0) return;
    const customer = state.customers[index];
    const stageIndex = stages.indexOf(customer.stage);
    if (stageIndex >= stages.length - 1) {
      wx.showToast({ title: "已成交", icon: "none" });
      return;
    }
    customer.stage = stages[stageIndex + 1];
    customer.lastFollow = app.globalData.today;
    customer.nextFollow = app.globalData.today;
    customer.lastNote = `客户推进至${customer.stage}阶段。`;
    app.setState(state);
    this.setData({ currentStage: customer.stage });
    this.loadData();
    wx.showToast({ title: "已推进" });
  }
});
