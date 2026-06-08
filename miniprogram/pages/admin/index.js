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
    saving: false
  },

  onShow() {
    if (!app.ensureLogin()) return;
    if (!app.canAdmin()) {
      wx.showToast({ title: "无后台权限", icon: "none" });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    app.loadRemoteState(() => {
      const state = app.getState();
      this.setData({
        users: app.visibleUsers(),
        roles: app.getRoles(),
        units: app.getUnits()
      });
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
        app.loadRemoteState(() => {
          this.setData({ users: app.visibleUsers(), roles: app.getRoles(), units: app.getUnits(), roleIndex: 0, unitIndex: 0 });
          wx.showToast({ title: "已开通" });
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
        app.loadRemoteState(() => {
          this.setData({ units: app.getUnits(), zoneIndex: 0 });
          wx.showToast({ title: "单位已添加" });
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
        app.loadRemoteState(() => {
          this.setData({ roles: app.getRoles(), scopeIndex: 1 });
          wx.showToast({ title: "角色已添加" });
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "添加失败", icon: "none" }));
  }
});
