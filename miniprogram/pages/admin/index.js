const app = getApp();

Page({
  data: {
    roles: [],
    units: [],
    zones: ["东部战区", "南部战区", "西部战区", "北部战区", "中部战区"],
    scopes: ["仅本人客户", "本单位客户", "本战区客户", "全部客户"],
    scopeValues: ["self", "unit", "zone", "all"],
    roleIndex: 0,
    unitIndex: 0,
    zoneIndex: 0,
    scopeIndex: 1,
    users: [],
    knowledge: [],
    saving: false
  },

  onShow() {
    if (!app.ensureLogin()) return;
    if (!app.canAdmin()) {
      wx.showToast({ title: "无后台权限", icon: "none" });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.reload();
  },

  reload(callback) {
    app.loadRemoteState(() => {
      const state = app.getState();
      this.setData({
        users: app.visibleUsers(),
        roles: app.getRoles(),
        units: app.getUnits(),
        knowledge: state.knowledge || []
      });
      if (callback) callback();
    });
  },

  onRole(event) {
    this.setData({ roleIndex: Number(event.detail.value) });
  },

  onUnit(event) {
    this.setData({ unitIndex: Number(event.detail.value) });
  },

  onZone(event) {
    this.setData({ zoneIndex: Number(event.detail.value) });
  },

  onScope(event) {
    this.setData({ scopeIndex: Number(event.detail.value) });
  },

  submitUser(event) {
    const form = event.detail.value;
    const account = String(form.account || "").trim();
    const role = this.data.roles[this.data.roleIndex] || {};
    const unit = this.data.units[this.data.unitIndex] || {};
    const payload = {
      name: String(form.name || "").trim(),
      phone: account,
      account,
      password: String(form.password || ""),
      roleId: role.id,
      role: role.name,
      unitId: unit.id,
      region: unit.zone || "待分区",
      unit: unit.name || "待分配"
    };
    if (!payload.name || !payload.account || !payload.password) {
      wx.showToast({ title: "姓名、账号、密码必填", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    app
      .requestApi("/users", {
        method: "POST",
        data: payload
      })
      .then(() => {
        this.reload(() => {
          this.setData({ roleIndex: 0, unitIndex: 0 });
          wx.showToast({ title: "员工添加成功" });
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "开通失败", icon: "none" });
      })
      .finally(() => {
        this.setData({ saving: false });
      });
  },

  submitUnit(event) {
    const name = String(event.detail.value.name || "").trim();
    if (!name) {
      wx.showToast({ title: "请填写单位名称", icon: "none" });
      return;
    }
    app
      .requestApi("/units", {
        method: "POST",
        data: { name, zone: this.data.zones[this.data.zoneIndex] }
      })
      .then(() => {
        this.reload(() => {
          this.setData({ zoneIndex: 0 });
          wx.showToast({ title: "单位添加成功" });
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "添加失败", icon: "none" }));
  },

  submitRole(event) {
    const name = String(event.detail.value.name || "").trim();
    if (!name) {
      wx.showToast({ title: "请填写角色名称", icon: "none" });
      return;
    }
    app
      .requestApi("/roles", {
        method: "POST",
        data: {
          name,
          customerScope: this.data.scopeValues[this.data.scopeIndex],
          permissions: ["dashboard", "customers", "field", "assistant"]
        }
      })
      .then(() => {
        this.reload(() => {
          this.setData({ scopeIndex: 1 });
          wx.showToast({ title: "角色添加成功" });
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "添加失败", icon: "none" }));
  },

  submitKnowledge(event) {
    const question = String(event.detail.value.question || "").trim();
    const answer = String(event.detail.value.answer || "").trim();
    if (!question || !answer) {
      wx.showToast({ title: "问题和话术必填", icon: "none" });
      return;
    }
    app
      .requestApi("/knowledge", {
        method: "POST",
        data: { question, answer }
      })
      .then(() => {
        this.reload(() => wx.showToast({ title: "知识添加成功" }));
      })
      .catch((error) => wx.showToast({ title: error.message || "添加失败", icon: "none" }));
  },

  deleteUser(event) {
    const id = event.currentTarget.dataset.id;
    const user = this.data.users.find((item) => Number(item.id) === Number(id));
    if (!user) return;
    wx.showModal({
      title: "删除员工",
      content: `确认删除员工：${user.name}？`,
      confirmText: "删除",
      confirmColor: "#f56c6c",
      success: (res) => {
        if (!res.confirm) return;
        app
          .requestApi(`/users/${id}`, { method: "DELETE" })
          .then(() => this.reload(() => wx.showToast({ title: "员工已删除" })))
          .catch((error) => wx.showToast({ title: error.message || "删除失败", icon: "none" }));
      }
    });
  },

  deleteUnit(event) {
    const id = event.currentTarget.dataset.id;
    const unit = this.data.units.find((item) => item.id === id);
    if (!unit) return;
    wx.showModal({
      title: "删除单位",
      content: `确认删除单位：${unit.name}？`,
      confirmText: "删除",
      confirmColor: "#f56c6c",
      success: (res) => {
        if (!res.confirm) return;
        app
          .requestApi(`/units/${encodeURIComponent(id)}`, { method: "DELETE" })
          .then(() => this.reload(() => wx.showToast({ title: "单位已删除" })))
          .catch((error) => wx.showToast({ title: error.message || "删除失败", icon: "none" }));
      }
    });
  }
});
