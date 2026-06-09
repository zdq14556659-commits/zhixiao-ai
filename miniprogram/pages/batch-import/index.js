const app = getApp();

Page({
  data: {
    stages: ["名单", "线索", "商机", "成交"],
    stageIndex: 0,
    owners: [],
    ownerUsers: [],
    ownerIndex: 0,
    channelSources: [],
    channelIndex: 0,
    filePath: "",
    fileName: ""
  },

  onLoad(options) {
    if (!app.ensureLogin()) return;
    const ownerUsers = app.visibleSales();
    const owners = ownerUsers.map((user) => user.name);
    const stageIndex = Math.max(0, this.data.stages.indexOf(options.stage || "名单"));
    this.setData({ owners, ownerUsers, stageIndex, channelSources: app.globalData.channelSources });
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
    const ownerUser = this.data.ownerUsers[this.data.ownerIndex] || {};
    const defaultChannel = this.data.channelSources[this.data.channelIndex] || "其他";
    rows.forEach((line, index) => {
      const parts = line.split(/,|，|\t/).map((item) => item.trim());
      const [name, phone = "待补充"] = parts;
      const third = parts[2] || "";
      const usesNewTemplate = app.globalData.channelSources.includes(third) || parts.length >= 6;
      const channelSource = usesNewTemplate ? app.normalizeChannelSource(third) : defaultChannel;
      const address = usesNewTemplate ? parts[3] || "" : "";
      const region = usesNewTemplate ? address || "待分区" : third || "待分区";
      const amount = usesNewTemplate ? parts[5] || "15" : parts[3] || "15";
      const software = usesNewTemplate ? parts[4] || "待补充" : parts[4] || "待补充";
      state.customers.unshift({
        id: Date.now() + index,
        name,
        phone,
        channelSource,
        createdBy: app.getCurrentUser().name || "未记录",
        followPerson: owner,
        address,
        stage,
        owner,
        ownerId: ownerUser.id || "",
        unitId: ownerUser.unitId || "",
        unit: ownerUser.unit || "",
        zone: ownerUser.zone || "",
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
      extension: ["xlsx", "csv", "txt"],
      success: (res) => {
        const file = res.tempFiles[0];
        this.setData({ filePath: file.path, fileName: file.name });
        this.uploadImportFile(file.path);
      }
    });
  },

  uploadImportFile(filePath) {
    wx.showLoading({ title: "导入中" });
    const session = app.getSession();
    wx.uploadFile({
      url: `${app.globalData.apiBase}/import/customers`,
      filePath,
      name: "file",
      header: session && session.token ? { Authorization: `Bearer ${session.token}` } : {},
      formData: {
        stage: this.data.stages[this.data.stageIndex],
        owner: this.data.owners[this.data.ownerIndex],
        ownerId: (this.data.ownerUsers[this.data.ownerIndex] || {}).id || "",
        unitId: (this.data.ownerUsers[this.data.ownerIndex] || {}).unitId || "",
        unit: (this.data.ownerUsers[this.data.ownerIndex] || {}).unit || "",
        zone: (this.data.ownerUsers[this.data.ownerIndex] || {}).zone || "",
        createdBy: app.getCurrentUser().name || "未记录",
        followPerson: this.data.owners[this.data.ownerIndex],
        channelSource: this.data.channelSources[this.data.channelIndex] || "其他"
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
