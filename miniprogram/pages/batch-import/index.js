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
    fileName: "",
    importing: false,
    importResult: null
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
    this.setData({ importing: true, importResult: null });
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
      wx.hideLoading();
      this.showImportResult(result);
    } catch (error) {
      wx.showToast({ title: error.message || "导入失败", icon: "none" });
    } finally {
      wx.hideLoading();
      this.setData({ importing: false });
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
    this.setData({ importing: true, importResult: null });
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
            this.setData({ importing: false });
            this.showImportResult(data);
          });
        } catch (error) {
          this.setData({ importing: false });
          wx.showToast({ title: error.message || "导入失败", icon: "none" });
        }
      },
      fail: () => {
        wx.hideLoading();
        this.setData({ importing: false });
        wx.showToast({ title: "上传失败", icon: "none" });
      }
    });
  },

  showImportResult(result) {
    const normalizedResult = {
      total: Number(result.total || 0),
      imported: Number(result.imported || 0),
      duplicates: Number(result.duplicates || 0),
      failed: Number(result.failed || 0),
      skipped: Array.isArray(result.skipped) ? result.skipped : [],
      failures: Array.isArray(result.failures) ? result.failures : []
    };
    const reportUrl = result.reportUrl
      ? `${app.globalData.apiBase.replace(/\/api$/, "")}${result.reportUrl}`
      : "";
    normalizedResult.reportUrl = reportUrl;
    this.setData({ importResult: normalizedResult });
    if (normalizedResult.duplicates) {
      wx.showToast({ title: `发现${normalizedResult.duplicates}条重复客户，已跳过`, icon: "none", duration: 2600 });
    } else {
      wx.showToast({ title: "导入完成", icon: "success" });
    }
  },

  copyReport() {
    const reportUrl = this.data.importResult?.reportUrl;
    if (reportUrl) wx.setClipboardData({ data: reportUrl });
  },

  backToCustomers() {
    wx.navigateBack();
  }
});
