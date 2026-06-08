const app = getApp();

Page({
  data: {
    account: "",
    password: "",
    loading: false
  },

  onLoad() {
    if (app.isLoggedIn()) {
      wx.switchTab({ url: "/pages/dashboard/index" });
    }
  },

  onAccount(event) {
    this.setData({ account: event.detail.value });
  },

  onPassword(event) {
    this.setData({ password: event.detail.value });
  },

  submitLogin(event) {
    const account = String(event.detail.value.account || this.data.account || "").trim();
    const password = String(event.detail.value.password || this.data.password || "");
    if (!account || !password) {
      wx.showToast({ title: "请输入账号和密码", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    app
      .login(account, password)
      .then(() => {
        wx.showToast({ title: "登录成功" });
        setTimeout(() => wx.switchTab({ url: "/pages/dashboard/index" }), 350);
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "登录失败", icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});
