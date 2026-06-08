const app = getApp();

Page({
  data: {
    stages: ["名单", "线索", "商机", "成交"],
    stageIndex: 0,
    owners: [],
    ownerIndex: 0,
    filePath: "",
    fileName: ""
  },

  onLoad(options) {
    if (!app.ensureLogin()) return;
    const state = app.getState();
    const currentUser = app.getCurrentUser();
    const owners = currentUser.role === "销售"
      ? [currentUser.name]
      : state.users.filter((user) => user.role === "销售").map((user) => user.name);
    const stageIndex = Math.max(0, this.data.stages.indexOf(options.stage || "名单"));
    this.setData({ owners, stageIndex });
  },

  onStage(event) {
    this.setData({ stageIndex: Number(event.detail.value) });
  },

  onOwner(event) {
    this.setData({ ownerIndex: Number(event.detail.value) });
  },

  submitImport(event) {
    const rows = String(event.detail.value.rows || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!rows.length) {
      wx.showToast({ title: "请粘贴客户数据", icon: "none" });
      return;
    }
    const state = app.getState();
    const stage = this.data.stages[this.data.stageIndex];
    const owner = this.data.owners[this.data.ownerIndex];
    rows.forEach((line, index) => {
      const [name, phone = "待补充", region = "待分区", amount = "15", software = "待补充"] = line.split(/,|，|\t/).map((item) => item.trim());
      state.customers.unshift({
        id: Date.now() + index,
        name,
        phone,
        stage,
        owner,
        region,
        amount: Number(amount) || 15,
        software,
        createdAt: app.globalData.today,
        lastFollow: app.globalData.today,
        nextFollow: app.globalData.today,
        lastNote: "批量导入客户。"
      });
    });
    app.setState(state);
    wx.showToast({ title: `已导入${rows.length}个` });
    setTimeout(() => wx.navigateBack(), 600);
  },

  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["csv", "txt"],
      success: (res) => {
        const file = res.tempFiles[0];
        this.setData({ filePath: file.path, fileName: file.name });
        this.uploadImportFile(file.path);
      }
    });
  },

  uploadImportFile(filePath) {
    wx.showLoading({ title: "导入中" });
    wx.uploadFile({
      url: `${app.globalData.apiBase}/import/customers`,
      filePath,
      name: "file",
      formData: {
        stage: this.data.stages[this.data.stageIndex],
        owner: this.data.owners[this.data.ownerIndex]
      },
      success: (res) => {
        wx.hideLoading();
        try {
          const data = JSON.parse(res.data);
          app.loadRemoteState(() => {
            wx.showToast({ title: `导入${data.imported}个` });
            setTimeout(() => wx.navigateBack(), 700);
          });
        } catch {
          wx.showToast({ title: "导入失败", icon: "none" });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: "上传失败", icon: "none" });
      }
    });
  }
});
