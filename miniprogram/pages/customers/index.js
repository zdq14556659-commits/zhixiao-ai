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
    stageTimeLabel: "录入时间",
    stageStartDate: "",
    stageEndDate: "",
    lastStartDate: "",
    lastEndDate: "",
    nextStartDate: "",
    nextEndDate: "",
    followStatuses: ["全部", "今日待跟进", "已逾期", "未设置"],
    followStatusIndex: 0,
    filtersOpen: false,
    assignOwners: [],
    paged: [],
    page: 1,
    pageSize: 10,
    pageSizes: [10, 20],
    pageSizeIndex: 0,
    totalPages: 1,
    canAssign: false
  },

  onLoad(options) {
    if (options.stage) this.setData({ currentStage: options.stage });
  },

  onShow() {
    if (!app.ensureLogin()) return;
    this.consumeDashboardDrilldown();
    app.loadRemoteState(() => this.loadData());
  },

  consumeDashboardDrilldown() {
    const drilldown = wx.getStorageSync("zhixiao_dashboard_drilldown") || {};
    if (drilldown.stage) this.setData({ currentStage: drilldown.stage, page: 1 });
    this.dashboardCustomerIds = Array.isArray(drilldown.customerIds) ? drilldown.customerIds.map(Number) : [];
    wx.removeStorageSync("zhixiao_dashboard_drilldown");
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
    const stageTabs = [...state.stages, "公海"].map((stage) => ({
      name: stage,
      count: stage === "公海"
        ? customers.filter((customer) => customer.ownershipStatus === "public_pool").length
        : customers.filter((customer) => customer.stage === stage && customer.ownershipStatus !== "public_pool").length
    }));
    this.setData({
      customers,
      channelSources,
      channelIndex,
      owners,
      assignOwners,
      regions,
      ownerIndex,
      regionIndex,
      stageTimeLabel: this.stageTimeConfig(this.data.currentStage).label,
      canAssign: this.canAssignCustomers(),
      stageTabs
    }, () => this.applyFilters());
  },

  switchStage(event) {
    const currentStage = event.currentTarget.dataset.stage;
    this.dashboardCustomerIds = [];
    this.setData({ currentStage, stageTimeLabel: this.stageTimeConfig(currentStage).label, page: 1 });
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

  onStageStartDate(event) {
    this.setData({ stageStartDate: event.detail.value });
    this.applyFilters();
  },

  onStageEndDate(event) {
    this.setData({ stageEndDate: event.detail.value });
    this.applyFilters();
  },

  onLastStartDate(event) {
    this.setData({ lastStartDate: event.detail.value });
    this.applyFilters();
  },

  onLastEndDate(event) {
    this.setData({ lastEndDate: event.detail.value });
    this.applyFilters();
  },

  onNextStartDate(event) {
    this.setData({ nextStartDate: event.detail.value });
    this.applyFilters();
  },

  onNextEndDate(event) {
    this.setData({ nextEndDate: event.detail.value });
    this.applyFilters();
  },

  onFollowStatus(event) {
    this.setData({ followStatusIndex: Number(event.detail.value) });
    this.applyFilters();
  },

  stageTimeConfig(stage) {
    if (stage === "全部") return { label: "阶段时间", field: "createdAt" };
    if (stage === "公海") return { label: "进入公海", field: "publicPoolAt" };
    if (stage === "名单") return { label: "录入时间", field: "createdAt" };
    if (stage === "成交") return { label: "成交时间", field: "dealAt" };
    return { label: "转化时间", field: stage === "商机" ? "opportunityAt" : "leadAt" };
  },

  customerStageTime(customer, stage = this.data.currentStage) {
    const config = this.stageTimeConfig(stage === "全部" ? customer.stage : stage);
    return String(customer[config.field] || "").slice(0, 10);
  },

  inDateRange(value, start, end) {
    if (start && (!value || value < start)) return false;
    if (end && (!value || value > end)) return false;
    return true;
  },

  applyFilters() {
    const role = app.getRole(app.getCurrentUser());
    const keyword = this.data.keyword.trim().toLowerCase();
    const channel = this.data.channelSources[this.data.channelIndex];
    const owner = this.data.owners[this.data.ownerIndex];
    const region = this.data.regions[this.data.regionIndex];
    const status = this.data.followStatuses[this.data.followStatusIndex];
    const filtered = this.data.customers.filter((item) => {
      const itemChannel = app.normalizeChannelSource(item.channelSource);
      const source = `${item.name} ${item.phone} ${item.software} ${item.lastNote}`.toLowerCase();
      const isPublicPool = item.ownershipStatus === "public_pool";
      if (this.data.currentStage === "公海" ? !isPublicPool : (isPublicPool || item.stage !== this.data.currentStage)) return false;
      if (this.dashboardCustomerIds?.length && !this.dashboardCustomerIds.includes(Number(item.id))) return false;
      if (keyword && !source.includes(keyword)) return false;
      if (channel !== "全部" && itemChannel !== channel) return false;
      if (owner !== "全部" && item.owner !== owner) return false;
      if (region !== "全部" && item.region !== region) return false;
      if (!this.inDateRange(this.customerStageTime(item), this.data.stageStartDate, this.data.stageEndDate)) return false;
      if (!this.inDateRange(String(item.lastFollow || "").slice(0, 10), this.data.lastStartDate, this.data.lastEndDate)) return false;
      if (!this.inDateRange(String(item.nextFollow || "").slice(0, 10), this.data.nextStartDate, this.data.nextEndDate)) return false;
      if (status === "今日待跟进" && item.nextFollow !== app.globalData.today) return false;
      if (status === "已逾期" && (!item.nextFollow || item.nextFollow >= app.globalData.today)) return false;
      if (status === "未设置" && item.nextFollow) return false;
      return true;
    }).map((item) => ({
      ...item,
      isPublicPool: item.ownershipStatus === "public_pool",
      canClaim: item.ownershipStatus === "public_pool" && role.customerScope === "self",
      channelLabel: app.normalizeChannelSource(item.channelSource),
      stageDate: this.customerStageTime(item),
      ownershipLabel: item.ownershipStatus === "public_pool" || item.ownershipStatus === "claimable"
        ? "公海客户"
        : item.ownershipStatus === "pending_followup" ? `待有效跟进·${item.claimDaysRemaining || 0}天` : "",
      canAssign: this.data.canAssign && app.canSeePrivateRecord(item) && this.isCustomerAssignable(item),
      poolHint: role.customerScope === "self" ? "公海客户需先认领" : "不在您的分配范围",
      photoCount: Array.isArray(item.photos) ? item.photos.length : 0,
      firstPhoto: Array.isArray(item.photos) && item.photos.length ? item.photos[0] : ""
    }));
    const totalPages = Math.max(Math.ceil(filtered.length / this.data.pageSize), 1);
    const page = Math.min(this.data.page, totalPages);
    const start = (page - 1) * this.data.pageSize;
    this.setData({ filtered, page, totalPages, paged: filtered.slice(start, start + this.data.pageSize) });
  },

  resetFilters() {
    this.dashboardCustomerIds = [];
    this.setData({
      keyword: "",
      channelIndex: 0,
      ownerIndex: 0,
      regionIndex: 0,
      stageStartDate: "",
      stageEndDate: "",
      lastStartDate: "",
      lastEndDate: "",
      nextStartDate: "",
      nextEndDate: "",
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

  onPageSize(event) {
    const pageSizeIndex = Number(event.detail.value);
    const pageSize = this.data.pageSizes[pageSizeIndex] || 10;
    this.setData({ pageSizeIndex, pageSize, page: 1 });
    this.applyFilters();
  },

  goAdd() {
    const stage = ["名单", "线索", "商机", "成交"].includes(this.data.currentStage) ? this.data.currentStage : "名单";
    wx.navigateTo({ url: `/pages/customer-form/index?stage=${stage}` });
  },

  goBatchImport() {
    const stage = ["名单", "线索", "商机", "成交"].includes(this.data.currentStage) ? this.data.currentStage : "名单";
    wx.navigateTo({ url: `/pages/batch-import/index?stage=${stage}` });
  },

  editCustomer(event) {
    const id = Number(event.currentTarget.dataset.id);
    const customer = this.data.filtered.find((item) => Number(item.id) === id);
    if (customer?.isPublicPool) {
      wx.showToast({ title: "请先认领公海客户", icon: "none" });
      return;
    }
    wx.navigateTo({ url: `/pages/customer-form/index?id=${id}` });
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
    if (nextStage === "商机" && !customer.demoAt) {
      wx.showToast({ title: "请先填写有效演示时间", icon: "none" });
      setTimeout(() => wx.navigateTo({ url: `/pages/customer-form/index?id=${id}` }), 500);
      return;
    }
    if (nextStage === "成交" && Number(customer.contractAmount || 0) <= 0) {
      wx.showToast({ title: "请先填写合同金额", icon: "none" });
      setTimeout(() => wx.navigateTo({ url: `/pages/customer-form/index?id=${id}` }), 500);
      return;
    }
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
    if (customer.ownershipStatus === "public_pool") return customer.stage !== "成交";
    if (customer.stage === "名单") return true;
    if (!["线索", "商机"].includes(customer.stage)) return false;
    const latest = customer.lastFollow || customer.createdAt || "";
    if (!latest) return true;
    const latestTime = Date.parse(latest);
    const todayTime = Date.parse(app.globalData.today);
    if (!Number.isFinite(latestTime) || !Number.isFinite(todayTime)) return true;
    return Math.floor((todayTime - latestTime) / (24 * 60 * 60 * 1000)) >= 30;
  },

  claimCustomer(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "认领公海客户",
      content: "认领后获得3天临时保护，请及时提交有效跟进。",
      success: (result) => {
        if (!result.confirm) return;
        wx.showLoading({ title: "认领中" });
        app.requestApi(`/customers/${id}/claim`, { method: "POST" })
          .then((customer) => {
            app.loadRemoteState(() => {
              wx.hideLoading();
              this.setData({ currentStage: customer.stage || "名单", page: 1 });
              this.loadData();
              wx.showToast({ title: "认领成功", icon: "success" });
              setTimeout(() => wx.navigateTo({ url: `/pages/follow/index?id=${customer.id}` }), 500);
            });
          })
          .catch((error) => {
            wx.hideLoading();
            app.loadRemoteState(() => this.loadData());
            wx.showToast({ title: error.message || "客户可能已被他人认领", icon: "none" });
          });
      }
    });
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
