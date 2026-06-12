const app = getApp();

Page({
  data: {
    currentUser: {},
    canAdmin: false,
    showPasswordForm: false,
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    changingPassword: false
  },

  onShow() {
    if (!app.ensureLogin()) return;
    app.loadRemoteState(() => {
      const showPasswordForm = Boolean(wx.getStorageSync("zhixiao_password_prompt"));
      if (showPasswordForm) wx.removeStorageSync("zhixiao_password_prompt");
      this.setData({
        currentUser: app.getCurrentUser(),
        canAdmin: app.canAdmin(),
        showPasswordForm: showPasswordForm || this.data.showPasswordForm
      });
    });
  },

  togglePasswordForm() {
    this.setData({ showPasswordForm: !this.data.showPasswordForm });
  },

  onCurrentPassword(event) {
    this.setData({ currentPassword: event.detail.value });
  },

  onNewPassword(event) {
    this.setData({ newPassword: event.detail.value });
  },

  onConfirmPassword(event) {
    this.setData({ confirmPassword: event.detail.value });
  },

  changePassword() {
    const currentPassword = String(this.data.currentPassword || "");
    const newPassword = String(this.data.newPassword || "");
    if (!currentPassword) return wx.showToast({ title: "请输入原密码", icon: "none" });
    if (newPassword.length < 6) return wx.showToast({ title: "新密码至少6位", icon: "none" });
    if (newPassword !== this.data.confirmPassword) return wx.showToast({ title: "两次新密码不一致", icon: "none" });
    this.setData({ changingPassword: true });
    app
      .requestApi("/auth/change-password", { method: "POST", data: { currentPassword, newPassword } })
      .then(() => {
        wx.showModal({
          title: "密码修改成功",
          content: "请使用新密码重新登录，其他设备上的旧登录也已失效。",
          showCancel: false,
          success: () => {
            app.logout();
            wx.reLaunch({ url: "/pages/login/index" });
          }
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "修改失败", icon: "none" }))
      .finally(() => this.setData({ changingPassword: false }));
  },

  goAdmin() {
    wx.navigateTo({ url: "/pages/admin/index" });
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后需要重新输入账号密码。",
      confirmText: "退出",
      confirmColor: "#f56c6c",
      success: (res) => {
        if (!res.confirm) return;
        app.logout();
        wx.reLaunch({ url: "/pages/login/index" });
      }
    });
  }
});
