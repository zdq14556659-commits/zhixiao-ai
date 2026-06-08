const app = getApp();

Page({
  data: {
    currentUser: {},
    canAdmin: false
  },

  onShow() {
    if (!app.ensureLogin()) return;
    app.loadRemoteState(() => {
      this.setData({
        currentUser: app.getCurrentUser(),
        canAdmin: app.canAdmin()
      });
    });
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
