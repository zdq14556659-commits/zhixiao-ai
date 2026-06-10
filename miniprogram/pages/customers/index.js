const app = getApp();

Page({
  data: {
    currentStage: "名单",
    stageTabs: [],
    customers: [],
    filtered: [],
    keyword: "",
    channelSources: ["全部"],
    channelIndex: 0,
    owners: ["全部"],
    ownerIndex: 0,
    regions: ["全部"],
    regionIndex: 0,
    startDate: "",
    endDate: "",
    followStatuses: ["全部", "今日待跟进", "已逾期", "未设置"],
    followStatusIndex: 0,
    filtersOpen: false,
    assignOwners: [],
    paged: [],
    page: 1,
    pageSize: 10,
    totalPages: 1,
    canAssign: false
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
    const channelSources = ["全部", ...app.globalData.channelSources];
    const owners = role.customerScope === "self" ? [currentUser.name] : ["全部", ...app.visibleSales().map((user) => user.name)];
    const assignOwners = app.visibleSales();
    const regions = ["全部", ...Array.from(new Set(customers.map((item) => item.region).filter(Boolean)))];
    const channelIndex = Math.min(this.data.channelIndex, channelSources.length - 1);
    const ownerIndex = Math.min(this.data.ownerIndex, owners.length - 1);
    const regionIndex = Math.min(this.data.regionIndex, regions.length - 1);
    this.setData({
      customers,
      channelSources,
      channelIndex,
      owners,
      assignOwners,
      regions,
      ownerIndex,
      regionIndex,
      canAssign: this.canAssignCustomers(),
      stageTabs: state.stages.map((stage) => ({
        name: stage,
        count: customers.filter((customer) => customer.stage === stage).length
      }))
    }, () => this.applyFilters());
  },

  switchStage(event) {
    this.setData({ currentStage: event.currentTarget.dataset.stage, page: 1 });
    this.applyFilters();
  },

  onKeyword(event) {
    this.setData({ keyword: event.detail.value });
  },

  toggleFilters() {
    this.setData({ filtersOpen: !this.data.filtersOpen });
  },

  onOwner(event) {
    this.setData({ ownerIndex: Number(event.detail.value) });
    this.applyFilters();
  },

  onChannel(event) {
    this.setData({ channelIndex: Number(event.detail.value) });
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
    const channel = this.data.channelSources[this.data.channelIndex];
    const owner = this.data.owners[this.data.ownerIndex];
    const region = this.data.regions[this.data.regionIndex];
    const status = this.data.followStatuses[this.data.followStatusIndex];
    const filtered = this.data.customers.filter((item) => {
      const itemChannel = app.normalizeChannelSource(item.channelSource);
      const source = `${item.name} ${item.phone} ${item.software} ${item.lastNote}`.toLowerCase();
      if (item.stage !== this.data.currentStage) return false;
      if (keyword && !source.includes(keyword)) return false;
      if (channel !== "全部" && itemChannel !== channel) return false;
      if (owner !== "全部" && item.owner !== owner) return false;
      if (region !== "全部" && item.region !== region) return false;
      if (this.data.startDate && item.createdAt < this.data.startDate) return false;
      if (this.data.endDate && item.createdAt > this.data.endDate) return false;
      if (status === "今日待跟进" && item.nextFollow !== app.globalData.today) return false;
      if (status === "已逾期" && (!item.nextFollow || item.nextFollow >= app.globalData.today)) return false;
      if (status === "未设置" && item.nextFollow) return false;
      return true;
    }).map((item) => ({
      ...item,
      channelLabel: app.normalizeChannelSource(item.channelSource),
      canAssign: this.data.canAssign && this.isCustomerAssignable(item),
      photoCount: Array.isArray(item.photos) ? item.photos.length : 0,
      firstPhoto: Array.isArray(item.photos) && item.photos.length ? item.photos[0] : ""
    }));
    const totalPages = Math.max(Math.ceil(filtered.length / this.data.pageSize), 1);
    const page = Math.min(this.data.page, totalPages);
    const start = (page - 1) * this.data.pageSize;
    this.setData({ filtered, page, totalPages, paged: filtered.slice(start, start + this.data.pageSize) });
  },

  resetFilters() {
    this.setData({
      keyword: "",
      channelIndex: 0,
      ownerIndex: 0,
      regionIndex: 0,
      startDate: "",
      endDate: "",
      followStatusIndex: 0,
      page: 1
    });
    this.applyFilters();
  },

  prevPage() {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 });
    this.applyFilters();
  },

  nextPage() {
    if (this.data.page >= this.data.totalPages) return;
    this.setData({ page: this.data.page + 1 });
    this.applyFilters();
  },

  goAdd() {
    wx.navigateTo({ url: `/pages/customer-form/index?stage=${this.data.currentStage}` });
  },

  goBatchImport() {
    wx.navigateTo({ url: `/pages/batch-import/index?stage=${this.data.currentStage}` });
  },

  editCustomer(event) {
    wx.navigateTo({ url: `/pages/customer-form/index?id=${event.currentTarget.dataset.id}` });
  },

  callCustomer(event) {
    wx.makePhoneCall({ phoneNumber: event.currentTarget.dataset.phone });
  },

  previewCustomerPhoto(event) {
    const id = Number(event.currentTarget.dataset.id);
    const current = event.currentTarget.dataset.src;
    const customer = this.data.filtered.find((item) => Number(item.id) === id);
    const urls = customer && customer.photos && customer.photos.length ? customer.photos : [current];
    wx.previewImage({ current, urls });
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
    const nextStage = stages[stageIndex + 1];
    const nextCustomer = {
      ...customer,
      stage: nextStage,
      lastFollow: app.globalData.today,
      nextFollow: app.globalData.today,
      lastNote: `客户推进至${nextStage}阶段。`
    };
    wx.showLoading({ title: "推进中" });
    app
      .requestApi(`/customers/${id}`, { method: "PUT", data: nextCustomer })
      .then(() => {
        app.loadRemoteState(() => {
          wx.hideLoading();
          this.setData({ currentStage: nextStage, page: 1 });
          this.loadData();
          wx.showToast({ title: "已推进" });
        });
      })
      .catch((error) => {
        wx.hideLoading();
        wx.showToast({ title: error.message || "推进失败", icon: "none" });
      });
  },

  canAssignCustomers() {
    const role = app.getRole(app.getCurrentUser());
    return role.customerScope !== "self" || app.hasPermission("admin");
  },

  isCustomerAssignable(customer) {
    if (customer.stage === "名单") return true;
    if (!["线索", "商机"].includes(customer.stage)) return false;
    const latest = customer.lastFollow || customer.createdAt || "";
    if (!latest) return true;
    const latestTime = Date.parse(latest);
    const todayTime = Date.parse(app.globalData.today);
    if (!Number.isFinite(latestTime) || !Number.isFinite(todayTime)) return true;
    return Math.floor((todayTime - latestTime) / (24 * 60 * 60 * 1000)) > 30;
  },

  assignCustomer(event) {
    const id = Number(event.currentTarget.dataset.id);
    const owners = this.data.assignOwners;
    if (!owners.length) {
      wx.showToast({ title: "当前没有可分配销售", icon: "none" });
      return;
    }
    wx.showActionSheet({
      itemList: owners.map((user) => user.name),
      success: (res) => {
        const target = owners[res.tapIndex];
        wx.showLoading({ title: "分配中" });
        app
          .requestApi(`/customers/${id}/assign`, {
            method: "POST",
            data: { ownerId: target.id, owner: target.name }
          })
          .then(() => {
            app.loadRemoteState(() => {
              wx.hideLoading();
              this.loadData();
              wx.showToast({ title: "已分配", icon: "success" });
            });
          })
          .catch((error) => {
            wx.hideLoading();
            wx.showToast({ title: error.message || "分配失败", icon: "none" });
          });
      }
    });
  }
});
