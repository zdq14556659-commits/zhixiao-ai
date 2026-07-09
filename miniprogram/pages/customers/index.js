const app = getApp();

Page({
  data: {
    currentStage: "名单",
    stageTabs: [],
    customers: [],
    filtered: [],
    filteredCount: 0,
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
    pageSizeInput: "10",
    jumpPageInput: "1",
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
    productIndex: 0,
    rollbackOpen: false,
    rollbackItem: null,
    rollbackReasons: ["误推进", "客户未达到阶段标准", "资料录入错误", "其他"],
    rollbackReasonIndex: 0,
    rollbackNote: "",
    serverPaged: true
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
    this.invalidItems = [];
    this.publicPoolCount = 0;
    this.invalidCount = 0;
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
    const customers = this.currentBoardItems || (this.data.currentStage === "无效"
      ? (this.invalidItems || [])
      : this.data.currentStage === "公海" ? (this.publicPoolItems || [])
      : this.data.currentStage === "已购" ? (this.purchasedItems || []) : privateCustomers);
    this.customerItems = customers;
    const channelSources = ["全部", ...app.globalData.channelSources];
    const canFilterOwner = role.customerScope !== "self" && !["公海", "已购", "无效"].includes(this.data.currentStage);
    const ownerOptions = this.boardFilterOptions?.followPerson || this.boardFilterOptions?.followPersons || app.visibleFollowUsers().map((user) => user.name);
    const owners = canFilterOwner ? ["全部", ...ownerOptions] : ["全部"];
    const assignOwners = app.visibleFollowUsers();
    const regions = ["全部", ...(this.boardFilterOptions?.units || Array.from(new Set(customers.map((item) => item.region || item.unit).filter(Boolean))))];
    const cities = ["全部", ...(this.boardFilterOptions?.cities || Array.from(new Set(customers.map((item) => item.city).filter(Boolean))))];
    const channelIndex = Math.min(this.data.channelIndex, channelSources.length - 1);
    const ownerIndex = Math.min(this.data.ownerIndex, owners.length - 1);
    const regionIndex = Math.min(this.data.regionIndex, regions.length - 1);
    const cityIndex = Math.min(this.data.cityIndex, cities.length - 1);
    const stageCounts = this.stageCounts || {};
    const stageTabs = [...state.stages, "公海", "已购", "无效"].map((stage) => ({
      name: stage,
      count: Number(stageCounts[stage] ?? (stage === "无效"
        ? this.invalidCount || 0
        : stage === "公海"
          ? this.publicPoolCount || 0
          : stage === "已购"
            ? this.purchasedCount || 0
            : privateCustomers.filter((customer) => customer.stage === stage && customer.outcomeStatus !== "purchased_existing").length))
    }));
    const currentStageTotal = stageTabs.find((item) => item.name === this.data.currentStage)?.count || 0;
    this.setData({
      channelSources,
      channelIndex,
      owners,
      assignOwners,
      regions,
      cities,
      ownerIndex,
      regionIndex,
      cityIndex,
      products: (state.products || [])
        .filter((item) => item.active !== false && !this.isPlaceholderProduct(item))
        .sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0) || String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans-CN")),
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
    this.setData({ customerBoardLoading: true, customerBoardError: "", publicPoolLoading: this.data.currentStage === "公海", publicPoolLoaded: false, publicPoolError: "", publicPoolFilteredOut: false });
    return app.requestApi(`/customer-board?${this.customerBoardQuery()}`)
      .then((result) => {
        if (result.backendVersion !== "backend-v9") throw new Error("后端版本尚未更新，请等待部署完成后重试");
        this.currentBoardItems = Array.isArray(result.items) ? result.items : [];
        this.privateOpportunityItems = this.currentBoardItems;
        this.purchasedItems = this.data.currentStage === "已购" ? this.currentBoardItems : [];
        this.publicPoolItems = this.data.currentStage === "公海" ? this.currentBoardItems : [];
        this.invalidItems = this.data.currentStage === "无效" ? this.currentBoardItems : [];
        this.stageCounts = result.stageCounts || {};
        this.boardFilterOptions = result.filterOptions || {};
        this.boardTotal = Number(result.total || 0);
        this.boardTotalPages = Number(result.totalPages || 1);
        this.publicPoolCount = Number(this.stageCounts["公海"] ?? result.publicPool?.count ?? 0);
        this.invalidCount = Number(this.stageCounts["无效"] ?? this.stageCounts.invalid ?? result.invalid?.count ?? 0);
        this.purchasedCount = Number(this.stageCounts["已购"] ?? result.purchased?.count ?? 0);
        this.setData({
          customerBoardLoading: false,
          customerBoardError: "",
          publicPoolLoading: false,
          publicPoolLoaded: true,
          publicPoolTotal: this.publicPoolCount,
          publicPoolError: "",
          page: Number(result.page || this.data.page || 1),
          totalPages: Number(result.totalPages || 1)
        }, () => this.loadData());
      })
      .catch((error) => {
        this.privateOpportunityItems = [];
        this.purchasedItems = [];
        this.publicPoolItems = [];
        this.invalidItems = [];
        this.publicPoolCount = 0;
        this.invalidCount = 0;
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

  customerBoardQuery() {
    const params = [];
    const setParam = (key, value) => {
      if (value === undefined || value === null || value === "") return;
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    };
    setParam("paginated", "1");
    setParam("stage", this.data.currentStage);
    setParam("page", this.data.page || 1);
    setParam("pageSize", this.data.pageSize || 10);
    const keyword = String(this.data.keyword || "").trim();
    const channel = this.data.channelSources[this.data.channelIndex];
    const owner = this.data.owners[this.data.ownerIndex];
    const unit = this.data.regions[this.data.regionIndex];
    const city = this.data.cities[this.data.cityIndex];
    const status = this.data.followStatuses[this.data.followStatusIndex];
    if (keyword) setParam("keyword", keyword);
    if (channel && channel !== "全部") setParam("channelSource", channel);
    if (this.data.canFilterOwner && owner && owner !== "全部") setParam("followPerson", owner);
    if (unit && unit !== "全部") setParam("unit", unit);
    if (city && city !== "全部") setParam("city", city);
    if (status === "未设置") setParam("followStatus", "unfollowed");
    if (this.dashboardCustomerIds?.length) setParam("ids", this.dashboardCustomerIds.join(","));
    if (this.data.stageStartDate) setParam("stageStart", this.data.stageStartDate);
    if (this.data.stageEndDate) setParam("stageEnd", this.data.stageEndDate);
    if (this.data.lastStartDate) setParam("lastStart", this.data.lastStartDate);
    if (this.data.lastEndDate) setParam("lastEnd", this.data.lastEndDate);
    if (this.data.nextStartDate) setParam("nextStart", this.data.nextStartDate);
    if (this.data.nextEndDate) setParam("nextEnd", this.data.nextEndDate);
    return params.join("&");
  },

  retryPublicPool() {
    this.loadPublicPool();
  },

  switchStage(event) {
    const currentStage = event.currentTarget.dataset.stage;
    this.dashboardCustomerIds = [];
    const next = { currentStage, stageTimeLabel: this.stageTimeConfig(currentStage).label, page: 1, ...this.emptyFilters() };
    this.setData(next, () => {
      this.loadCustomerBoard();
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
    this.setData({ ownerIndex: Number(event.detail.value), page: 1 }, () => this.loadCustomerBoard());
  },

  onChannel(event) {
    this.setData({ channelIndex: Number(event.detail.value), page: 1 }, () => this.loadCustomerBoard());
  },

  onRegion(event) {
    this.setData({ regionIndex: Number(event.detail.value), page: 1 }, () => this.loadCustomerBoard());
  },

  onCity(event) {
    this.setData({ cityIndex: Number(event.detail.value), page: 1 }, () => this.loadCustomerBoard());
  },

  onStageStartDate(event) {
    this.setData({ stageStartDate: event.detail.value, page: 1 }, () => this.loadCustomerBoard());
  },

  onStageEndDate(event) {
    this.setData({ stageEndDate: event.detail.value, page: 1 }, () => this.loadCustomerBoard());
  },

  onLastStartDate(event) {
    this.setData({ lastStartDate: event.detail.value, page: 1 }, () => this.loadCustomerBoard());
  },

  onLastEndDate(event) {
    this.setData({ lastEndDate: event.detail.value, page: 1 }, () => this.loadCustomerBoard());
  },

  onNextStartDate(event) {
    this.setData({ nextStartDate: event.detail.value, page: 1 }, () => this.loadCustomerBoard());
  },

  onNextEndDate(event) {
    this.setData({ nextEndDate: event.detail.value, page: 1 }, () => this.loadCustomerBoard());
  },

  onFollowStatus(event) {
    this.setData({ followStatusIndex: Number(event.detail.value), page: 1 }, () => this.loadCustomerBoard());
  },

  stageTimeConfig(stage) {
    if (stage === "全部") return { label: "阶段时间", field: "createdAt" };
    if (stage === "公海") return { label: "进入公海", field: "publicPoolAt" };
    if (stage === "已购") return { label: "标记已购", field: "purchasedAt" };
    if (stage === "无效") return { label: "归档时间", field: "archivedAt" };
    if (stage === "名单") return { label: "录入时间", field: "createdAt" };
    if (stage === "成交") return { label: "成交时间", field: "dealAt" };
    return { label: "转化时间", field: stage === "商机" ? "opportunityAt" : "leadAt" };
  },

  customerStageTime(customer, stage = this.data.currentStage) {
    if ((stage === "已购" || customer.outcomeStatus === "purchased_existing") && customer.purchasedInfo) {
      return String(customer.purchasedInfo.purchasedAt || customer.purchasedInfo.revisitAt || customer.effectiveFollowUpAt || customer.lastFollow || "").slice(0, 10);
    }
    const config = this.stageTimeConfig(stage === "全部" ? customer.stage : stage);
    return String(customer[config.field] || "").slice(0, 10);
  },

  displayRow(item = {}) {
    const firstPhoto = String(item.firstPhoto || "");
    const safePhoto = firstPhoto && firstPhoto.length < 500 && !firstPhoto.startsWith("data:") ? firstPhoto : "";
    const note = String(item.lastNote || "");
    return {
      id: item.id,
      customerId: item.customerId,
      name: String(item.name || "未命名客户").slice(0, 40),
      phone: item.phone || "",
      stage: item.stage || "名单",
      ownershipStatus: item.ownershipStatus || "",
      ownershipLabel: item.ownershipLabel || "",
      isPublicPool: Boolean(item.isPublicPool),
      isInvalid: Boolean(item.isInvalid),
      isPurchased: Boolean(item.isPurchased),
      canClaim: Boolean(item.canClaim),
      canAssign: Boolean(item.canAssign),
      channelLabel: item.channelLabel || "其他",
      productName: item.productName || "待确认产品",
      city: item.city || "待识别",
      followPerson: item.followPerson || "",
      owner: item.owner || "",
      stageDate: item.stageDate || "",
      primarySoftware: item.primarySoftware || "软件待补充",
      nextFollow: item.nextFollow || "",
      lastNote: note.length > 80 ? `${note.slice(0, 80)}...` : note,
      poolHint: item.poolHint || "",
      publicPoolAt: item.publicPoolAt || "",
      archivedAt: item.archivedAt || "",
      photoCount: item.photoCount || 0,
      firstPhoto: safePhoto
    };
  },

  inDateRange(value, start, end) {
    if (start && (!value || value < start)) return false;
    if (end && (!value || value > end)) return false;
    return true;
  },

  applyFilters(event) {
    if (event && event.type) {
      this.setData({ page: 1 }, () => this.loadCustomerBoard());
      return;
    }
    const currentUser = app.getCurrentUser();
    const sourceCustomers = Array.isArray(this.customerItems) ? this.customerItems : [];
    const rows = sourceCustomers.map((item) => {
      const primarySoftware = item.competitorProfiles?.find((profile) => profile.isPrimary)?.brand || item.software || "";
      return {
        ...item,
        isPublicPool: item.ownershipStatus === "public_pool" && item.lifecycleStatus !== "archived",
        isInvalid: item.lifecycleStatus === "archived",
        isPurchased: item.outcomeStatus === "purchased_existing",
        canClaim: item.ownershipStatus === "public_pool" && app.canOwnCustomer(currentUser),
        channelLabel: app.normalizeChannelSource(item.channelSource),
        stageDate: this.customerStageTime(item),
        rollbackTarget: this.rollbackTargetForStage(item.stage),
        ownershipLabel: item.lifecycleStatus === "archived"
          ? (item.archiveReason === "closed" ? "倒闭客户" : "无效客户")
          : item.outcomeStatus === "purchased_existing"
          ? "已购客户"
          : item.ownershipStatus === "public_pool" || item.ownershipStatus === "claimable"
          ? "公海客户"
          : Number(item.claimDaysRemaining || 0) > 0 ? `保护期剩${item.claimDaysRemaining || 0}天` : "",
        canAssign: item.outcomeStatus !== "purchased_existing" && this.data.canAssign && app.canSeePrivateRecord(item) && this.isCustomerAssignable(item),
        poolHint: app.canOwnCustomer(currentUser) ? "公海客户需先认领" : "不在您的分配范围",
        photoCount: Array.isArray(item.photos) ? item.photos.length : 0,
        firstPhoto: Array.isArray(item.photos) && item.photos.length ? item.photos[0] : "",
        primarySoftware: primarySoftware || "软件待补充"
      };
    });
    const total = Number.isFinite(Number(this.boardTotal)) ? Number(this.boardTotal) : rows.length;
    const totalPages = Number.isFinite(Number(this.boardTotalPages)) ? Math.max(Number(this.boardTotalPages), 1) : Math.max(Math.ceil(total / this.data.pageSize), 1);
    const page = Math.min(Math.max(Number(this.data.page || 1), 1), totalPages);
    const pagedRows = rows.map((item) => this.displayRow(item));
    const hasActiveFilters = this.hasActiveFilters();
    const filteredOut = this.data.currentStageTotal > 0 && total === 0;
    this.filteredItems = rows;
    this.setData({
      filtered: [],
      filteredCount: total,
      page,
      totalPages,
      paged: pagedRows,
      jumpPageInput: String(page),
      pageSizeInput: String(this.data.pageSize),
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
    this.setData({ ...this.emptyFilters(), page: 1 }, () => this.loadCustomerBoard());
  },

  findVisibleItem(id) {
    const itemId = Number(id);
    return (this.filteredItems || []).find((item) => Number(item.id) === itemId)
      || (this.data.paged || []).find((item) => Number(item.id) === itemId)
      || (this.publicPoolItems || []).find((item) => Number(item.id) === itemId);
  },

  prevPage() {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 }, () => this.loadCustomerBoard());
  },

  nextPage() {
    if (this.data.page >= this.data.totalPages) return;
    this.setData({ page: this.data.page + 1 }, () => this.loadCustomerBoard());
  },

  onPageSize(event) {
    const pageSizeIndex = Number(event.detail.value);
    const pageSize = this.data.pageSizes[pageSizeIndex] || 10;
    this.setData({ pageSizeIndex, pageSize, pageSizeInput: String(pageSize), page: 1 }, () => this.loadCustomerBoard());
  },

  onPageSizeInput(event) {
    this.setData({ pageSizeInput: event.detail.value });
  },

  applyPageSizeInput() {
    const size = Math.min(Math.max(Math.round(Number(this.data.pageSizeInput || 10)), 10), 500);
    const pageSizeIndex = this.data.pageSizes.indexOf(size);
    this.setData({ pageSize: size, pageSizeInput: String(size), pageSizeIndex: pageSizeIndex >= 0 ? pageSizeIndex : -1, page: 1 }, () => this.loadCustomerBoard());
  },

  onJumpPageInput(event) {
    this.setData({ jumpPageInput: event.detail.value });
  },

  jumpPage() {
    const page = Math.min(Math.max(Math.round(Number(this.data.jumpPageInput || 1)), 1), this.data.totalPages || 1);
    this.setData({ page, jumpPageInput: String(page) }, () => this.loadCustomerBoard());
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
    const customer = this.findVisibleItem(id);
    if (customer?.isInvalid || customer?.lifecycleStatus === "archived") {
      wx.showToast({ title: "无效客户仅可查看归档状态", icon: "none" });
      return;
    }
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
    const customer = this.findVisibleItem(id);
    const urls = customer && customer.photos && customer.photos.length ? customer.photos : [current];
    wx.previewImage({ current, urls });
  },

  goFollow(event) {
    const opportunity = this.findVisibleItem(event.currentTarget.dataset.id);
    if (!opportunity) return;
    this.preserveFiltersOnNextShow = true;
    wx.navigateTo({ url: `/pages/follow/index?id=${opportunity.customerId}&opportunityId=${opportunity.id}` });
  },

  advanceCustomer(event) {
    const id = Number(event.currentTarget.dataset.id);
    const customer = this.findVisibleItem(id);
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
    const item = this.findVisibleItem(event.currentTarget.dataset.id);
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
    if (customer.lifecycleStatus === "archived") return false;
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

  rollbackTargetForStage(stage = "") {
    if (stage === "线索") return "名单";
    if (stage === "商机") return "线索";
    return "";
  },

  openRollback(event) {
    const item = this.findVisibleItem(event.currentTarget.dataset.id);
    if (!item) return;
    const target = this.rollbackTargetForStage(item.stage);
    if (!target) return wx.showToast({ title: "当前阶段不支持回撤", icon: "none" });
    this.setData({ rollbackOpen: true, rollbackItem: { ...item, rollbackTarget: target }, rollbackReasonIndex: 0, rollbackNote: "" });
  },

  closeRollback() {
    this.setData({ rollbackOpen: false, rollbackItem: null, rollbackNote: "" });
  },

  onRollbackReason(event) {
    this.setData({ rollbackReasonIndex: Number(event.detail.value) });
  },

  onRollbackNote(event) {
    this.setData({ rollbackNote: event.detail.value });
  },

  submitRollback() {
    const item = this.data.rollbackItem;
    if (!item?.id) return wx.showToast({ title: "客户机会不存在", icon: "none" });
    const reason = this.data.rollbackReasons[this.data.rollbackReasonIndex] || "";
    if (!reason) return wx.showToast({ title: "请选择申请原因", icon: "none" });
    wx.showLoading({ title: "提交中" });
    app.requestApi(`/opportunities/${item.id}/rollback-request`, {
      method: "POST",
      data: { reason, note: this.data.rollbackNote }
    })
      .then(() => app.loadRemoteState(() => {
        this.setData({ rollbackOpen: false, rollbackItem: null, rollbackNote: "" });
        this.loadCustomerBoard().then(() => {
          wx.hideLoading();
          wx.showToast({ title: "回撤申请已提交", icon: "success" });
        });
      }))
      .catch((error) => {
        wx.hideLoading();
        wx.showToast({ title: error.message || "提交失败", icon: "none" });
      });
  },

  claimCustomer(event) {
    const id = Number(event.currentTarget.dataset.id);
    const item = this.findVisibleItem(id);
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
    wx.showLoading({ title: "认领中" });
    app.requestApi(`/opportunities/${item.id}/claim`, { method: "POST", data: product?.id ? { productId: product.id } : {} })
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
