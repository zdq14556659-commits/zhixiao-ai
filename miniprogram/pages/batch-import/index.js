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

  async submitImport(event) {
    const rows = String(event.detail.value.rows || "").trim();
    if (!rows) {
      wx.showToast({ title: "请粘贴客户数据", icon: "none" });
      return;
    }
    const stage = this.data.stages[this.data.stageIndex];
    const owner = this.data.owners[this.data.ownerIndex];
    const ownerUser = this.data.ownerUsers[this.data.ownerIndex] || {};
    wx.showLoading({ title: "导入中" });
    try {
      const result = await app.requestApi("/import/customers", {
        method: "POST",
        data: {
          rows,
          stage,
          owner,
          ownerId: ownerUser.id || "",
          unitId: ownerUser.unitId || "",
          unit: ownerUser.unit || "",
          zone: ownerUser.zone || "",
          createdBy: app.getCurrentUser().name || "未记录",
          followPerson: owner,
          channelSource: this.data.channelSources[this.data.channelIndex] || "其他"
        }
      });
      await new Promise((resolve) => app.loadRemoteState(resolve));
      this.showImportResult(result);
    } catch (error) {
      wx.showToast({ title: error.message || "导入失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
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
          if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(data.error || `导入失败 ${res.statusCode}`);
          app.loadRemoteState(() => {
            this.showImportResult(data);
          });
        } catch (error) {
          wx.showToast({ title: error.message || "导入失败", icon: "none" });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: "上传失败", icon: "none" });
      }
    });
  },

  showImportResult(result) {
    const content = `共${result.total || 0}行，成功${result.imported || 0}行，重复${result.duplicates || 0}行，失败${result.failed || 0}行。`;
    const reportUrl = result.reportUrl
      ? `${app.globalData.apiBase.replace(/\/api$/, "")}${result.reportUrl}`
      : "";
    wx.showModal({
      title: "导入完成",
      content: reportUrl ? `${content}\n点击“复制报告”可在浏览器下载未导入明细。` : content,
      confirmText: reportUrl ? "复制报告" : "知道了",
      cancelText: "返回客户",
      showCancel: true,
      success: (res) => {
        if (res.confirm && reportUrl) wx.setClipboardData({ data: reportUrl });
        if (res.cancel || (!reportUrl && res.confirm)) wx.navigateBack();
      }
    });
  }
});
