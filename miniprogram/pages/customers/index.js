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
    cities: ["全部"],
    cityIndex: 0,
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
    canAssign: false,
    canImportPublic: false,
    publicPoolLoading: false,
    publicPoolLoaded: false,
    publicPoolTotal: 0,
    publicPoolFilteredOut: false,
    publicPoolError: "",
    customerBoardLoading: false,
    customerBoardError: "",
    currentStageTotal: 0,
    filteredOut: false,
    hasActiveFilters: false,
    canFilterOwner: false,
    advanceOpen: false,
    advanceItem: null,
    advanceTargetStage: "",
    advanceDemoAt: "",
    advanceContractAmount: "",
    advancePaymentAmount: "",
    advancePaymentDate: "",
    advanceNote: "",
    advanceNextFollow: "",
    newOpportunityOpen: false,
    newOpportunityCustomerId: 0,
    newOpportunityNote: "",
    newOpportunityNextFollow: "",
    claimOpen: false,
    claimItem: null,
    claimProductIndex: -1,
    claimProductName: "",
    products: [],
    productIndex: 0
  },

  onLoad(options) {
    if (options.stage) this.setData({ currentStage: options.stage });
  },

  onShow() {
    if (!app.ensureLogin()) return;
    const preserveFilters = Boolean(this.preserveFiltersOnNextShow);
    this.preserveFiltersOnNextShow = false;
    this.privateOpportunityItems = [];
    this.publicPoolItems = [];
    this.publicPoolCount = 0;
    const drilldown = this.consumeDashboardDrilldown();
    const next = {};
    if (drilldown.stage) Object.assign(next, { currentStage: drilldown.stage, page: 1 });
    if (!preserveFilters && !drilldown.hasDrilldown) {
      this.dashboardCustomerIds = [];
      Object.assign(next, this.emptyFilters(), { page: 1, filtered: [], paged: [], filteredOut: false, publicPoolFilteredOut: false });
    }
    const load = () => app.loadRemoteState(() => this.loadCustomerBoard());
    if (Object.keys(next).length) this.setData(next, load);
    else load();
  },

  consumeDashboardDrilldown() {
    const drilldown = wx.getStorageSync("zhixiao_dashboard_drilldown") || {};
    this.dashboardCustomerIds = Array.isArray(drilldown.customerIds) ? drilldown.customerIds.map(Number) : [];
    wx.removeStorageSync("zhixiao_dashboard_drilldown");
    return { stage: drilldown.stage || "", hasDrilldown: Boolean(drilldown.stage || this.dashboardCustomerIds.length) };
  },

  loadData() {
    const state = app.getState();
    const currentUser = app.getCurrentUser();
    const role = app.getRole(currentUser);
    const privateCustomers = Array.isArray(this.privateOpportunityItems)
      ? this.privateOpportunityItems
      : app.scopeOpportunityRows();
    const customers = this.data.currentStage === "公海" ? (this.publicPoolItems || []) : privateCustomers;
    const channelSources = ["全部", ...app.globalData.channelSources];
    const canFilterOwner = role.customerScope !== "self" && this.data.currentStage !== "公海";
    const owners = canFilterOwner ? ["全部", ...app.visibleFollowUsers().map((user) => user.name)] : ["全部"];
    const assignOwners = app.visibleFollowUsers();
    const regions = ["全部", ...Array.from(new Set(customers.map((item) => item.region).filter(Boolean)))];
    const cities = ["全部", ...Array.from(new Set(customers.map((item) => item.city).filter(Boolean)))];
    const channelIndex = Math.min(this.data.channelIndex, channelSources.length - 1);
    const ownerIndex = Math.min(this.data.ownerIndex, owners.length - 1);
    const regionIndex = Math.min(this.data.regionIndex, regions.length - 1);
    const cityIndex = Math.min(this.data.cityIndex, cities.length - 1);
    const stageTabs = [...state.stages, "公海"].map((stage) => ({
      name: stage,
      count: stage === "公海"
        ? this.publicPoolCount || 0
        : privateCustomers.filter((customer) => customer.stage === stage).length
    }));
    const currentStageTotal = stageTabs.find((item) => item.name === this.data.currentStage)?.count || 0;
    this.setData({
      customers,
      channelSources,
      channelIndex,
      owners,
      assignOwners,
      regions,
      cities,
      ownerIndex,
      regionIndex,
      cityIndex,
      products: (state.products || []).filter((item) => item.active !== false && !this.isPlaceholderProduct(item)),
      stageTimeLabel: this.stageTimeConfig(this.data.currentStage).label,
      canAssign: this.canAssignCustomers(),
      canImportPublic: app.canImportPublicPool(),
      canFilterOwner,
      publicPoolTotal: this.publicPoolCount || 0,
      currentStageTotal,
      stageTabs
    }, () => this.applyFilters());
  },

  loadCustomerBoard() {
    this.setData({ customerBoardLoading: true, customerBoardError: "", publicPoolLoading: true, publicPoolLoaded: false, publicPoolError: "", publicPoolFilteredOut: false });
    return app.requestApi("/customer-board")
      .then((result) => {
        if (result.backendVersion !== "backend-v8") throw new Error("后端版本尚未更新，请等待部署完成后重试");
        this.privateOpportunityItems = Array.isArray(result.items) ? result.items : [];
        this.publicPoolItems = Array.isArray(result.publicPool?.items) ? result.publicPool.items : [];
        this.publicPoolCount = Number(result.publicPool?.count ?? this.publicPoolItems.length);
        this.setData({
          customerBoardLoading: false,
          customerBoardError: "",
          publicPoolLoading: false,
          publicPoolLoaded: true,
          publicPoolTotal: this.publicPoolCount,
          publicPoolError: ""
        }, () => this.loadData());
      })
      .catch((error) => {
        this.privateOpportunityItems = [];
        this.publicPoolItems = [];
        this.publicPoolCount = 0;
        this.setData({
          customerBoardLoading: false,
          customerBoardError: error.message || "客户数据加载失败，请重新加载",
          publicPoolLoading: false,
          publicPoolLoaded: false,
          publicPoolTotal: 0,
          publicPoolError: error.message || "公海加载失败，请检查网络后重试"
        }, () => this.loadData());
      });
  },

  loadPublicPool() {
    return this.loadCustomerBoard();
  },

  retryPublicPool() {
    this.loadPublicPool();
  },

  switchStage(event) {
    const currentStage = event.currentTarget.dataset.stage;
    this.dashboardCustomerIds = [];
    const next = { currentStage, stageTimeLabel: this.stageTimeConfig(currentStage).label, page: 1, ...this.emptyFilters() };
    this.setData(next, () => {
      this.loadData();
    });
  },

  emptyFilters() {
    return {
      keyword: "",
      channelIndex: 0,
      ownerIndex: 0,
      regionIndex: 0,
      cityIndex: 0,
      stageStartDate: "",
      stageEndDate: "",
      lastStartDate: "",
      lastEndDate: "",
      nextStartDate: "",
      nextEndDate: "",
      followStatusIndex: 0
    };
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

  onCity(event) {
    this.setData({ cityIndex: Number(event.detail.value) });
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
    const city = this.data.cities[this.data.cityIndex];
    const status = this.data.followStatuses[this.data.followStatusIndex];
    const filtered = this.data.customers.filter((item) => {
      const itemChannel = app.normalizeChannelSource(item.channelSource);
      const primarySoftware = item.competitorProfiles?.find((profile) => profile.isPrimary)?.brand || item.software || "";
      const source = `${item.name} ${item.phone} ${primarySoftware} ${item.productName || ""} ${item.lastNote || ""}`.toLowerCase();
      const isPublicPool = item.ownershipStatus === "public_pool";
      if (this.data.currentStage === "公海" ? !isPublicPool : (isPublicPool || item.stage !== this.data.currentStage)) return false;
      if (this.dashboardCustomerIds?.length && !this.dashboardCustomerIds.includes(Number(item.id)) && !this.dashboardCustomerIds.includes(Number(item.customerId))) return false;
      if (keyword && !source.includes(keyword)) return false;
      if (channel !== "全部" && itemChannel !== channel) return false;
      if (this.data.canFilterOwner && owner !== "全部" && item.owner !== owner) return false;
      if (region !== "全部" && item.region !== region) return false;
      if (city !== "全部" && item.city !== city) return false;
      if (!this.inDateRange(this.customerStageTime(item), this.data.stageStartDate, this.data.stageEndDate)) return false;
      if (!this.inDateRange(String(item.lastFollow || "").slice(0, 10), this.data.lastStartDate, this.data.lastEndDate)) return false;
      if (!this.inDateRange(String(item.nextFollow || "").slice(0, 10), this.data.nextStartDate, this.data.nextEndDate)) return false;
      if (status === "今日待跟进" && item.nextFollow !== app.globalData.today) return false;
      if (status === "已逾期" && (!item.nextFollow || item.nextFollow >= app.globalData.today)) return false;
      if (status === "未设置" && item.nextFollow) return false;
      return true;
    }).map((item) => {
      const primarySoftware = item.competitorProfiles?.find((profile) => profile.isPrimary)?.brand || item.software || "";
      return {
        ...item,
        isPublicPool: item.ownershipStatus === "public_pool",
        canClaim: item.ownershipStatus === "public_pool" && app.canOwnCustomer(currentUser),
        channelLabel: app.normalizeChannelSource(item.channelSource),
        stageDate: this.customerStageTime(item),
        ownershipLabel: item.ownershipStatus === "public_pool" || item.ownershipStatus === "claimable"
          ? "公海客户"
          : item.ownershipStatus === "pending_followup" ? `待有效跟进·${item.claimDaysRemaining || 0}天` : "",
        canAssign: this.data.canAssign && app.canSeePrivateRecord(item) && this.isCustomerAssignable(item),
        poolHint: app.canOwnCustomer(currentUser) ? "公海客户需先认领" : "不在您的分配范围",
        photoCount: Array.isArray(item.photos) ? item.photos.length : 0,
        firstPhoto: Array.isArray(item.photos) && item.photos.length ? item.photos[0] : "",
        primarySoftware: primarySoftware || "软件待补充"
      };
    });
    const totalPages = Math.max(Math.ceil(filtered.length / this.data.pageSize), 1);
    const page = Math.min(this.data.page, totalPages);
    const start = (page - 1) * this.data.pageSize;
    const hasActiveFilters = this.hasActiveFilters();
    const filteredOut = this.data.currentStageTotal > 0 && filtered.length === 0;
    this.setData({
      filtered,
      page,
      totalPages,
      paged: filtered.slice(start, start + this.data.pageSize),
      hasActiveFilters,
      filteredOut,
      publicPoolFilteredOut: this.data.currentStage === "公海" && this.data.publicPoolLoaded && filteredOut
    });
  },

  hasActiveFilters() {
    return Boolean(
      this.dashboardCustomerIds?.length
      || String(this.data.keyword || "").trim()
      || this.data.channelIndex
      || (this.data.canFilterOwner && this.data.ownerIndex)
      || this.data.regionIndex
      || this.data.cityIndex
      || this.data.stageStartDate
      || this.data.stageEndDate
      || this.data.lastStartDate
      || this.data.lastEndDate
      || this.data.nextStartDate
      || this.data.nextEndDate
      || this.data.followStatusIndex
    );
  },

  resetFilters() {
    this.dashboardCustomerIds = [];
    this.setData({ ...this.emptyFilters(), page: 1 }, () => this.applyFilters());
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
    this.preserveFiltersOnNextShow = true;
    wx.navigateTo({ url: `/pages/customer-form/index?stage=${stage}` });
  },

  goBatchImport() {
    const stage = ["名单", "线索", "商机", "成交"].includes(this.data.currentStage) ? this.data.currentStage : "名单";
    const target = this.data.currentStage === "公海" ? "&target=public_pool" : "";
    this.preserveFiltersOnNextShow = true;
    wx.navigateTo({ url: `/pages/batch-import/index?stage=${stage}${target}` });
  },

  editCustomer(event) {
    const id = Number(event.currentTarget.dataset.id);
    const customer = this.data.filtered.find((item) => Number(item.id) === id);
    if (customer?.isPublicPool) {
      wx.showToast({ title: "请先认领公海客户", icon: "none" });
      return;
    }
    this.preserveFiltersOnNextShow = true;
    wx.navigateTo({ url: `/pages/customer-form/index?id=${customer.customerId || id}&opportunityId=${id}` });
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
    const opportunity = this.data.filtered.find((item) => Number(item.id) === Number(event.currentTarget.dataset.id));
    if (!opportunity) return;
    this.preserveFiltersOnNextShow = true;
    wx.navigateTo({ url: `/pages/follow/index?id=${opportunity.customerId}&opportunityId=${opportunity.id}` });
  },

  advanceCustomer(event) {
    const id = Number(event.currentTarget.dataset.id);
    const customer = this.data.filtered.find((item) => Number(item.id) === id);
    if (!customer) return;
    const stages = app.getState().stages;
    const stageIndex = stages.indexOf(customer.stage);
    if (stageIndex >= stages.length - 1) {
      this.openNewOpportunity(event);
      return;
    }
    const nextStage = stages[stageIndex + 1];
    this.setData({
      advanceOpen: true,
      advanceItem: customer,
      advanceTargetStage: nextStage,
      advanceDemoAt: customer.demoAt || app.globalData.today,
      advanceContractAmount: customer.contractAmount || "",
      advancePaymentAmount: customer.paymentAmount || "",
      advancePaymentDate: customer.paymentDate || "",
      advanceNote: "",
      advanceNextFollow: customer.nextFollow || ""
    });
  },

  closeAdvance() { this.setData({ advanceOpen: false, advanceItem: null }); },
  onAdvanceDemoAt(event) { this.setData({ advanceDemoAt: event.detail.value }); },
  onAdvancePaymentDate(event) { this.setData({ advancePaymentDate: event.detail.value }); },
  onAdvanceNextFollow(event) { this.setData({ advanceNextFollow: event.detail.value }); },
  onAdvanceField(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },

  submitAdvanceForm() {
    const item = this.data.advanceItem;
    if (!item) return;
    const nextStage = this.data.advanceTargetStage;
    const note = String(this.data.advanceNote || "").trim();
    const nextFollow = String(this.data.advanceNextFollow || "");
    const contractAmount = Number(this.data.advanceContractAmount || 0);
    if (!note) return wx.showToast({ title: "请填写本次跟进内容", icon: "none" });
    if (nextStage === "商机" && !this.data.advanceDemoAt) return wx.showToast({ title: "请选择有效演示日期", icon: "none" });
    if (nextStage === "成交" && contractAmount <= 0) return wx.showToast({ title: "请填写合同金额", icon: "none" });
    if (nextStage !== "成交" && !nextFollow) return wx.showToast({ title: "请选择下次跟进时间", icon: "none" });
    if (Number(this.data.advancePaymentAmount || 0) > 0 && !this.data.advancePaymentDate) return wx.showToast({ title: "请选择进款日期", icon: "none" });
    this.submitAdvanceRequest(item, this.data.advanceTargetStage, {
      demoAt: this.data.advanceDemoAt,
      contractAmount,
      paymentAmount: Number(this.data.advancePaymentAmount || 0),
      paymentDate: this.data.advancePaymentDate,
      paymentOwnerId: app.getCurrentUser().id,
      note,
      nextFollow
    });
  },

  submitAdvanceRequest(item, nextStage, data) {
    wx.showLoading({ title: "推进中" });
    app.requestApi(`/opportunities/${item.id}/advance`, { method: "POST", data })
      .then(() => app.loadRemoteState(() => {
        this.setData({ currentStage: nextStage, page: 1, advanceOpen: false, advanceItem: null });
        this.loadCustomerBoard().then(() => {
          wx.hideLoading();
          wx.showToast({ title: `已推进至${nextStage}`, icon: "success" });
        });
      }))
      .catch((error) => { wx.hideLoading(); wx.showToast({ title: error.message || "推进失败", icon: "none" }); });
  },

  openNewOpportunity(event) {
    const item = this.data.filtered.find((row) => Number(row.id) === Number(event.currentTarget.dataset.id));
    if (!item) return;
    this.setData({ newOpportunityOpen: true, newOpportunityCustomerId: item.customerId, productIndex: 0, newOpportunityNote: "", newOpportunityNextFollow: app.globalData.today });
  },
  closeNewOpportunity() { this.setData({ newOpportunityOpen: false }); },
  onProduct(event) { this.setData({ productIndex: Number(event.detail.value) }); },
  onNewOpportunityField(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  onNewOpportunityNextFollow(event) { this.setData({ newOpportunityNextFollow: event.detail.value }); },
  isPlaceholderProduct(product = {}) {
    const name = String(product.name || product.productName || "").trim();
    return !name || name === "待确认产品";
  },
  submitNewOpportunity() {
    const product = this.data.products[this.data.productIndex];
    if (!product) return wx.showToast({ title: "请选择产品", icon: "none" });
    const note = String(this.data.newOpportunityNote || "").trim();
    if (!note) return wx.showToast({ title: "请填写首次跟进备注", icon: "none" });
    if (!this.data.newOpportunityNextFollow) return wx.showToast({ title: "请选择下次跟进时间", icon: "none" });
    wx.showLoading({ title: "创建中" });
    app.requestApi(`/customers/${this.data.newOpportunityCustomerId}/opportunities`, { method: "POST", data: { productId: product.id, amount: app.productDefaultAmount(product.id), note, nextFollow: this.data.newOpportunityNextFollow } })
      .then(() => app.loadRemoteState(() => {
        this.setData({ newOpportunityOpen: false, currentStage: "线索", page: 1 });
        this.loadCustomerBoard().then(() => {
          wx.hideLoading();
          wx.showToast({ title: "新机会已创建", icon: "success" });
        });
      }))
      .catch((error) => { wx.hideLoading(); wx.showToast({ title: error.message || "创建失败", icon: "none" }); });
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
    const item = this.data.filtered.find((row) => Number(row.id) === id) || (this.publicPoolItems || []).find((row) => Number(row.id) === id);
    const productIndex = item && !this.isPlaceholderProduct(item)
      ? this.data.products.findIndex((product) => product.id === item.productId)
      : -1;
    const product = productIndex >= 0 ? this.data.products[productIndex] : null;
    this.setData({
      claimOpen: true,
      claimItem: item || { id },
      claimProductIndex: productIndex,
      claimProductName: product?.name || ""
    });
  },

  closeClaim() {
    this.setData({ claimOpen: false, claimItem: null, claimProductIndex: -1, claimProductName: "" });
  },

  onClaimProduct(event) {
    const claimProductIndex = Number(event.detail.value);
    const product = this.data.products[claimProductIndex];
    this.setData({ claimProductIndex, claimProductName: product?.name || "" });
  },

  submitClaimCustomer() {
    const item = this.data.claimItem;
    const product = this.data.products[this.data.claimProductIndex];
    if (!item?.id) return wx.showToast({ title: "公海机会不存在", icon: "none" });
    if (!product?.id) return wx.showToast({ title: "请选择意向产品", icon: "none" });
    wx.showLoading({ title: "认领中" });
    app.requestApi(`/opportunities/${item.id}/claim`, { method: "POST", data: { productId: product.id } })
      .then((customer) => {
        app.loadRemoteState(() => {
          this.setData({ currentStage: customer.stage || "名单", page: 1, claimOpen: false, claimItem: null, claimProductIndex: -1, claimProductName: "" });
          this.loadCustomerBoard().then(() => {
            wx.hideLoading();
            wx.showToast({ title: "认领成功", icon: "success" });
            this.preserveFiltersOnNextShow = true;
            setTimeout(() => wx.navigateTo({ url: `/pages/follow/index?id=${customer.customerId}&opportunityId=${customer.id}` }), 500);
          });
        });
      })
      .catch((error) => {
        wx.hideLoading();
        app.loadRemoteState(() => this.loadCustomerBoard());
        wx.showToast({ title: error.message || "客户可能已被他人认领", icon: "none" });
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
          .requestApi(`/opportunities/${id}/assign`, {
            method: "POST",
            data: { ownerId: target.id, owner: target.name }
          })
          .then(() => {
            app.loadRemoteState(() => {
              this.loadCustomerBoard().then(() => {
                wx.hideLoading();
                wx.showToast({ title: "已分配", icon: "success" });
              });
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
