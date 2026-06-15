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
    importResult: null,
    targetPublicPool: false,
    geocodeProgressText: ""
  },

  onLoad(options) {
    if (!app.ensureLogin()) return;
    const ownerUsers = app.visibleFollowUsers();
    const owners = ownerUsers.map((user) => user.name);
    const stageIndex = Math.max(0, this.data.stages.indexOf(options.stage || "名单"));
    this.setData({ owners, ownerUsers, stageIndex, channelSources: app.globalData.channelSources, targetPublicPool: options.target === "public_pool" });
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
      const endpoint = this.data.targetPublicPool ? "/import/customers?target=public_pool" : "/import/customers";
      const data = {
        rows,
        stage,
        createdBy: app.getCurrentUser().name || "未记录",
        channelSource: this.data.channelSources[this.data.channelIndex] || "其他"
      };
      if (!this.data.targetPublicPool) {
        Object.assign(data, {
          owner,
          ownerId: ownerUser.id || "",
          unitId: ownerUser.unitId || "",
          unit: ownerUser.unit || "",
          zone: ownerUser.zone || "",
          followPerson: owner
        });
      }
      const result = await app.requestApi(endpoint, {
        method: "POST",
        data
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
    const formData = {
      stage: this.data.stages[this.data.stageIndex],
      createdBy: app.getCurrentUser().name || "未记录",
      channelSource: this.data.channelSources[this.data.channelIndex] || "其他",
      moneyUnit: "yuan"
    };
    if (!this.data.targetPublicPool) {
      Object.assign(formData, {
        owner: this.data.owners[this.data.ownerIndex],
        ownerId: (this.data.ownerUsers[this.data.ownerIndex] || {}).id || "",
        unitId: (this.data.ownerUsers[this.data.ownerIndex] || {}).unitId || "",
        unit: (this.data.ownerUsers[this.data.ownerIndex] || {}).unit || "",
        zone: (this.data.ownerUsers[this.data.ownerIndex] || {}).zone || "",
        followPerson: this.data.owners[this.data.ownerIndex]
      });
    }
    wx.uploadFile({
      url: `${app.globalData.apiBase}/import/customers${this.data.targetPublicPool ? '?target=public_pool' : ''}`,
      filePath,
      name: "file",
      header: session && session.token ? { Authorization: `Bearer ${session.token}` } : {},
      formData,
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
      pendingLocation: Number(result.pendingLocation || 0),
      skipped: Array.isArray(result.skipped) ? result.skipped : [],
      failures: Array.isArray(result.failures) ? result.failures : []
    };
    const reportUrl = result.reportUrl
      ? `${app.globalData.apiBase.replace(/\/api$/, "")}${result.reportUrl}`
      : "";
    normalizedResult.reportUrl = reportUrl;
    this.setData({ importResult: normalizedResult });
    if (this.data.targetPublicPool && normalizedResult.pendingLocation) this.refreshGeocodeProgress();
    if (normalizedResult.duplicates) {
      wx.showToast({ title: `发现${normalizedResult.duplicates}条重复客户，已跳过`, icon: "none", duration: 2600 });
    } else {
      wx.showToast({ title: "导入完成", icon: "success" });
    }
  },

  async refreshGeocodeProgress() {
    try {
      const progress = await app.requestApi("/geocode/status");
      const counts = progress.counts || {};
      this.setData({ geocodeProgressText: progress.configured ? `地址解析剩余${progress.remaining || 0}条，成功${counts.resolved || 0}条，失败${counts.failed || 0}条` : "服务器尚未配置腾讯地图服务Key，地址解析任务会保留等待执行" });
    } catch (error) {
      this.setData({ geocodeProgressText: error.message || "定位进度读取失败" });
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
