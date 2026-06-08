const app = getApp();

Page({
  data: {
    roles: ["销售", "主管", "区域经理", "运营", "管理员"],
    roleIndex: 0,
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
      this.setData({ users: app.getState().users });
    });
  },

  onRole(event) {
    this.setData({ roleIndex: Number(event.detail.value) });
  },

  submitUser(event) {
    const form = event.detail.value;
    const payload = {
      name: String(form.name || "").trim(),
      phone: String(form.phone || "").trim(),
      account: String(form.account || "").trim(),
      password: String(form.password || ""),
      role: this.data.roles[this.data.roleIndex],
      region: String(form.region || "待分区").trim(),
      unit: String(form.unit || form.region || "待分配").trim()
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
          this.setData({ users: app.getState().users, roleIndex: 0 });
          wx.showToast({ title: "已开通" });
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "开通失败", icon: "none" });
      })
      .finally(() => {
        this.setData({ saving: false });
      });
  }
});
