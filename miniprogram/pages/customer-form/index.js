const app = getApp();

Page({
  data: {
    stages: ["名单", "线索", "商机", "成交"],
    stageIndex: 0,
    owners: [],
    ownerUsers: [],
    ownerIndex: 0,
    paymentOwners: [],
    paymentOwnerNames: [],
    paymentOwnerIndex: 0,
    channelSources: [],
    channelIndex: 0,
    nextFollow: "",
    demoAt: "",
    expectedDealDate: "",
    paymentDate: "",
    editingId: 0,
    editingOpportunityId: 0,
    products: [],
    productIndex: 0,
    identityLocked: false,
    metadataLocked: false,
    contacts: [],
    competitorProfiles: [],
    competitorNames: [],
    form: {}
  },

  onLoad(options) {
    if (!app.ensureLogin()) return;
    const state = app.getState();
    const ownerUsers = app.visibleSales();
    const owners = ownerUsers.map((user) => user.name);
    const currentUser = app.getCurrentUser();
    const currentRole = app.getRole(currentUser);
    const paymentOwners = currentRole.customerScope === "self" ? [currentUser] : app.visibleUsers();
    const master = options.id ? (state.customers || []).find((item) => Number(item.id) === Number(options.id)) : null;
    const opportunity = options.opportunityId ? (state.opportunities || []).find((item) => Number(item.id) === Number(options.opportunityId)) : null;
    const customer = master ? { ...master, ...(opportunity || {}), id: master.id, customerId: master.id } : null;
    const stageIndex = Math.max(0, this.data.stages.indexOf(customer?.stage || options.stage || "名单"));
    const ownerIndex = Math.max(0, owners.indexOf(customer?.owner || customer?.followPerson || owners[0]));
    const channelSources = app.globalData.channelSources;
    const channelIndex = Math.max(0, channelSources.indexOf(app.normalizeChannelSource(customer?.channelSource || "其他")));
    const paymentOwnerIndex = Math.max(0, paymentOwners.findIndex((user) => Number(user.id) === Number(customer?.paymentOwnerId || currentUser.id)));
    const contacts = customer?.contacts?.length
      ? customer.contacts.map((item) => ({ ...item }))
      : [{ name: "", phone: customer?.phone || "", position: "", wechat: "", decisionRole: "", note: "", isPrimary: true }];
    const competitorProfiles = customer?.competitorProfiles?.length
      ? customer.competitorProfiles.map((item, index) => ({ ...item, isPrimary: index === 0, expanded: false }))
      : [{ competitorId: state.competitors?.[0]?.id || "", brand: state.competitors?.[0]?.name || "其他", isPrimary: true, expanded: false }];
    const products = (state.products || []).filter((item) => item.active !== false).map((item) => ({ ...item }));
    let productIndex = products.findIndex((item) => item.id === opportunity?.productId);
    if (opportunity?.productId && productIndex < 0) {
      products.push({ id: opportunity.productId, name: opportunity.productName || "历史产品（待补充）", active: true, legacy: true });
      productIndex = products.length - 1;
    }
    productIndex = Math.max(0, productIndex);
    this.setData({
      owners,
      ownerUsers,
      stageIndex,
      ownerIndex,
      paymentOwners,
      paymentOwnerNames: paymentOwners.map((user) => user.name),
      paymentOwnerIndex,
      channelSources,
      channelIndex,
      editingId: customer ? Number(customer.id) : 0,
      editingOpportunityId: opportunity ? Number(opportunity.id) : 0,
      products,
      productIndex,
      identityLocked: Boolean(customer) && !app.canAdmin(),
      metadataLocked: Boolean(customer) && !app.canAdmin(),
      contacts,
      competitorProfiles,
      competitorNames: (state.competitors || []).map((item) => item.name),
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

  onProduct(event) {
    this.setData({ productIndex: Number(event.detail.value) });
  },

  onPaymentOwner(event) {
    this.setData({ paymentOwnerIndex: Number(event.detail.value) });
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

  updateContact(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    this.setData({ [`contacts[${index}].${field}`]: event.detail.value });
  },

  addContact() {
    this.setData({ contacts: [...this.data.contacts, { name: "", phone: "", position: "", wechat: "", decisionRole: "", note: "", isPrimary: false }] });
  },

  removeContact(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (this.data.contacts[index]?.isPrimary) {
      wx.showToast({ title: "主联系人不能删除", icon: "none" });
      return;
    }
    this.setData({ contacts: this.data.contacts.filter((_, itemIndex) => itemIndex !== index) });
  },

  callContact(event) {
    const phone = String(event.currentTarget.dataset.phone || "").trim();
    if (phone) wx.makePhoneCall({ phoneNumber: phone });
  },

  setPrimaryContact(event) {
    if (this.data.identityLocked) {
      wx.showToast({ title: "当前角色不能修改主联系人", icon: "none" });
      return;
    }
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ contacts: this.data.contacts.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })) });
  },

  updateCompetitor(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    this.setData({ [`competitorProfiles[${index}].${field}`]: event.detail.value });
  },

  toggleCompetitorDetails(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ [`competitorProfiles[${index}].expanded`]: !this.data.competitorProfiles[index].expanded });
  },

  onCompetitorBrand(event) {
    const index = Number(event.currentTarget.dataset.index);
    const competitor = app.getState().competitors?.[Number(event.detail.value)] || {};
    this.setData({
      [`competitorProfiles[${index}].competitorId`]: competitor.id || "",
      [`competitorProfiles[${index}].brand`]: competitor.name || "其他"
    });
  },

  addCompetitorProfile() {
    const first = app.getState().competitors?.[0] || {};
    this.setData({ competitorProfiles: [...this.data.competitorProfiles, { competitorId: first.id || "", brand: first.name || "其他", version: "", price: "", expiresAt: "", satisfaction: "", switchingBarrier: "", note: "", isPrimary: false, expanded: false }] });
  },

  removeCompetitorProfile(event) {
    const index = Number(event.currentTarget.dataset.index);
    const next = this.data.competitorProfiles.filter((_, itemIndex) => itemIndex !== index);
    if (next.length && !next.some((item) => item.isPrimary)) next[0].isPrimary = true;
    this.setData({ competitorProfiles: next });
  },

  setPrimaryCompetitor(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ competitorProfiles: this.data.competitorProfiles.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })) });
  },

  openCustomerAi() {
    if (!this.data.editingId) return;
    wx.navigateTo({ url: `/pages/assistant/index?opportunityId=${this.data.editingOpportunityId}` });
  },

  archiveCustomer() {
    if (!this.data.editingId) return;
    wx.showActionSheet({
      itemList: ["标记为无效客户", "标记为工厂倒闭"],
      success: async (res) => {
        try {
          await app.requestApi(`/customers/${this.data.editingId}/archive`, { method: "POST", data: { reason: res.tapIndex === 1 ? "closed" : "invalid" } });
          await new Promise((resolve) => app.loadRemoteState(resolve));
          wx.showToast({ title: "客户已归档", icon: "success" });
          setTimeout(() => wx.navigateBack(), 500);
        } catch (error) {
          wx.showToast({ title: error.message || "归档失败", icon: "none" });
        }
      }
    });
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
      contacts: this.data.contacts.map((item) => ({ ...item, phone: item.isPrimary ? phone : item.phone })).filter((item) => item.isPrimary || item.name || item.phone),
      competitorProfiles: this.data.competitorProfiles.filter((item) => item.brand),
      opportunityId: this.data.editingOpportunityId || undefined,
      productId: (this.data.products[this.data.productIndex] || {}).id || "",
      channelSource: this.data.metadataLocked
        ? previous.channelSource
        : this.data.channelSources[this.data.channelIndex] || "其他",
      createdBy: this.data.metadataLocked
        ? previous.createdBy
        : String(form.createdBy || previous.createdBy || app.getCurrentUser().name || "未记录").trim(),
      followPerson: ownerUser.name || this.data.owners[this.data.ownerIndex],
      address: form.address || "",
      city: form.city || previous.city || "",
      stage,
      owner: this.data.owners[this.data.ownerIndex],
      ownerId: ownerUser.id || "",
      unitId: ownerUser.unitId || "",
      unit: ownerUser.unit || "",
      zone: ownerUser.zone || "",
      region: form.region || "待分区",
      amount: Number(form.amount) || 150000,
      demoAt,
      quoteAmount: Number(form.quoteAmount || 0),
      expectedDealDate: this.data.expectedDealDate,
      contractAmount,
      paymentAmount,
      paymentDate: this.data.paymentDate,
      paymentOwnerId: (this.data.paymentOwners[this.data.paymentOwnerIndex] || app.getCurrentUser()).id,
      lossReason: form.lossReason || "",
      createdAt: previous.createdAt || app.globalData.today,
      lastFollow: app.globalData.today,
      nextFollow: this.data.nextFollow,
      lastNote: String(form.note || "").trim() || (this.data.editingId ? undefined : "新增客户。")
    };
    wx.showLoading({ title: "保存中" });
    try {
      await this.saveCustomerRequest(customer);
      app.loadRemoteState(() => {
        wx.hideLoading();
        wx.showToast({ title: this.data.editingId ? "已更新" : "已保存", icon: "success" });
        setTimeout(() => wx.navigateBack(), 500);
      });
    } catch (error) {
      wx.hideLoading();
      if (error.code === "SIMILAR_CUSTOMER_WARNING") {
        const confirmed = await this.confirm("疑似重复客户", `${error.message}\n确认仍要继续保存吗？`);
        if (!confirmed) return;
        customer.confirmSimilar = true;
        wx.showLoading({ title: "保存中" });
        try {
          await this.saveCustomerRequest(customer);
          await new Promise((resolve) => app.loadRemoteState(resolve));
          wx.showToast({ title: "已保存", icon: "success" });
          setTimeout(() => wx.navigateBack(), 500);
        } catch (retryError) {
          wx.showToast({ title: retryError.message || "保存失败", icon: "none" });
        } finally {
          wx.hideLoading();
        }
        return;
      }
      if (!this.data.editingId && error.code === "CUSTOMER_CLAIMABLE") {
        const confirmed = await this.confirm("客户可认领", "该客户已释放，是否认领并接手原客户资料？");
        if (!confirmed) return;
        wx.showLoading({ title: "认领中" });
        try {
          await app.requestApi("/customers/claim", { method: "POST", data: { phone } });
          await new Promise((resolve) => app.loadRemoteState(resolve));
          wx.showToast({ title: "认领成功", icon: "success" });
          setTimeout(() => wx.navigateBack(), 600);
        } catch (claimError) {
          wx.showToast({ title: claimError.message || "认领失败", icon: "none" });
        } finally {
          wx.hideLoading();
        }
        return;
      }
      wx.showToast({ title: error.code === "DUPLICATE_CUSTOMER" ? "该客户已存在" : (error.message || "保存失败"), icon: "none" });
    }
  },

  saveCustomerRequest(customer) {
    return this.data.editingId
      ? app.requestApi(`/customers/${this.data.editingId}`, { method: "PUT", data: customer })
      : app.requestApi("/customers", { method: "POST", data: customer });
  },

  confirm(title, content) {
    return new Promise((resolve) => {
      wx.showModal({ title, content, confirmText: "确认", success: (res) => resolve(Boolean(res.confirm)), fail: () => resolve(false) });
    });
  }
});
