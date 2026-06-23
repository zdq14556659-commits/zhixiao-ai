const app = getApp();

Page({
  data: {
    id: "",
    opportunityId: "",
    customer: null,
    history: [],
    nextFollow: "2026-06-05",
    products: [],
    productIndex: -1,
    productName: "",
    needsProduct: false,
    followNote: "",
    purchasedOpen: false,
    purchasedProduct: "",
    purchasedBrand: "",
    purchasedAt: "",
    purchasedRevisitAt: ""
  },

  onLoad(options) {
    if (!app.ensureLogin()) return;
    const id = Number(options.id);
    const customer = app.getState().customers.find((item) => item.id === id);
    const opportunityId = Number(options.opportunityId || 0);
    const opportunity = app.getState().opportunities?.find((item) => Number(item.id) === opportunityId);
    const products = (app.getState().products || [])
      .filter((item) => item.active !== false && !this.isPlaceholderProduct(item))
      .sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0) || String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans-CN"));
    const needsProduct = this.isPlaceholderProduct(opportunity || customer || {});
    const productIndex = needsProduct ? -1 : Math.max(0, products.findIndex((item) => item.id === opportunity?.productId));
    const product = productIndex >= 0 ? products[productIndex] : null;
    const history = [...(opportunity?.followUps || customer?.followUps || [])].reverse().map((item) => ({
      ...item,
      displayTime: this.formatFollowTime(item)
    }));
    this.setData({
      id,
      opportunityId,
      customer: { ...customer, ...(opportunity || {}) },
      history,
      nextFollow: opportunity?.nextFollow || customer?.nextFollow || app.globalData.today,
      products,
      needsProduct,
      productIndex,
      productName: product?.name || ""
    });
  },

  isPlaceholderProduct(product = {}) {
    const name = String(product.name || product.productName || "").trim();
    return !name || name === "待确认产品";
  },

  onProduct(event) {
    const productIndex = Number(event.detail.value);
    const product = this.data.products[productIndex];
    this.setData({ productIndex, productName: product?.name || "" });
  },

  formatFollowTime(item = {}) {
    if (item.createdAt) {
      const time = new Date(item.createdAt);
      if (!Number.isNaN(time.getTime())) {
        const pad = (value) => String(value).padStart(2, "0");
        return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
      }
    }
    return item.date || "时间未记录";
  },

  onNextFollow(event) {
    this.setData({ nextFollow: event.detail.value });
  },

  onFollowNote(event) {
    this.setData({ followNote: event.detail.value });
  },

  togglePurchased() {
    this.setData({ purchasedOpen: !this.data.purchasedOpen });
  },

  onPurchasedField(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  onPurchasedAt(event) {
    this.setData({ purchasedAt: event.detail.value });
  },

  onPurchasedRevisitAt(event) {
    this.setData({ purchasedRevisitAt: event.detail.value });
  },

  submitFollow(event) {
    const note = String(this.data.followNote || event.detail.value.note || "").trim();
    if (!note) {
      wx.showToast({ title: "请填写跟进内容", icon: "none" });
      return;
    }
    const product = this.data.products[this.data.productIndex];
    if (this.data.needsProduct && !product?.id) {
      wx.showToast({ title: "请选择意向产品", icon: "none" });
      return;
    }
    wx.showLoading({ title: "保存中" });
    app
      .requestApi(`/opportunities/${this.data.opportunityId}/follow`, {
        method: "POST",
        data: {
          date: app.globalData.today,
          note,
          nextFollow: this.data.nextFollow,
          ...(product?.id ? { productId: product.id } : {})
        }
      })
      .then(() => {
        app.loadRemoteState(() => {
          wx.hideLoading();
          wx.showToast({ title: "已保存" });
          setTimeout(() => wx.navigateBack(), 500);
        });
      })
      .catch((error) => {
        wx.hideLoading();
        wx.showToast({ title: error.message || "保存失败", icon: "none" });
      });
  },

  submitPurchased() {
    const note = String(this.data.followNote || "").trim();
    if (!note) {
      wx.showToast({ title: "请先填写本次跟进记录", icon: "none" });
      return;
    }
    wx.showLoading({ title: "保存中" });
    app.requestApi(`/opportunities/${this.data.opportunityId}/mark-purchased`, {
      method: "POST",
      data: {
        note,
        product: this.data.purchasedProduct,
        brand: this.data.purchasedBrand,
        purchasedAt: this.data.purchasedAt,
        revisitAt: this.data.purchasedRevisitAt
      }
    })
      .then(() => {
        app.loadRemoteState(() => {
          wx.hideLoading();
          wx.showToast({ title: "已标记为已购", icon: "success" });
          setTimeout(() => wx.navigateBack(), 500);
        });
      })
      .catch((error) => {
        wx.hideLoading();
        wx.showToast({ title: error.message || "标记失败", icon: "none" });
      });
  }
});
