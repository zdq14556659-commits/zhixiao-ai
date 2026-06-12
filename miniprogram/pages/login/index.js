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
      .then((data) => {
        wx.showToast({ title: "登录成功" });
        setTimeout(() => {
          if (!data.user?.passwordChangeRecommended) {
            wx.switchTab({ url: "/pages/dashboard/index" });
            return;
          }
          wx.showModal({
            title: "建议修改密码",
            content: "当前账号仍在使用初始或管理员重置的密码，建议现在修改。",
            confirmText: "现在修改",
            cancelText: "本次跳过",
            success: (result) => {
              if (result.confirm) wx.setStorageSync("zhixiao_password_prompt", true);
              wx.switchTab({ url: result.confirm ? "/pages/profile/index" : "/pages/dashboard/index" });
            }
          });
        }, 350);
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "登录失败", icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});
