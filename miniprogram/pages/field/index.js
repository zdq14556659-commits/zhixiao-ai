const app = getApp();

Page({
  data: {
    latitude: 35.86166,
    longitude: 104.195397,
    currentCity: "",
    currentAddress: "",
    locationReady: false,
    statuses: ["名单", "线索", "商机", "成交"],
    statusIndex: 1,
    visits: [],
    markers: [],
    photos: [],
    cityStats: [],
    currentUser: {}
  },

  onShow() {
    if (!app.ensureLogin()) return;
    app.loadRemoteState(() => {
      this.setData({ currentUser: app.getCurrentUser() });
      this.loadVisits();
    });
  },

  loadVisits() {
    const state = app.getState();
    const currentUser = app.getCurrentUser();
    const allVisits = state.visits || [];
    const visits = currentUser.role === "销售"
      ? allVisits.filter((item) => item.ownerId === currentUser.id || item.owner === currentUser.name)
      : allVisits;
    const cityMap = visits.reduce((map, item) => {
      const city = item.city || "未知城市";
      map[city] = (map[city] || 0) + 1;
      return map;
    }, {});
    this.setData({
      visits,
      cityStats: Object.entries(cityMap).map(([city, count]) => ({ city, count })),
      markers: visits
        .filter((item) => item.latitude && item.longitude)
        .map((item) => ({
          id: item.id,
          latitude: item.latitude,
          longitude: item.longitude,
          title: item.factory,
          iconPath: this.isSold(item.status) ? "/assets/marker-red.png" : "/assets/marker-green.png",
          width: 18,
          height: 18,
          callout: {
            content: `${item.factory}\n${item.city || ""}`,
            color: "#1f2d3d",
            fontSize: 12,
            borderRadius: 6,
            bgColor: "#ffffff",
            padding: 8,
            display: "BYCLICK"
          }
        }))
    });
  },

  onStatus(event) {
    this.setData({ statusIndex: Number(event.detail.value) });
  },

  choosePhotos() {
    wx.chooseMedia({
      count: 6 - this.data.photos.length,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const selected = res.tempFiles.map((item) => item.tempFilePath);
        this.setData({ photos: [...this.data.photos, ...selected].slice(0, 6) });
      }
    });
  },

  previewPhoto(event) {
    const current = event.currentTarget.dataset.src;
    const urls = this.data.photos.includes(current)
      ? this.data.photos
      : this.data.visits.flatMap((item) => item.photos || []);
    wx.previewImage({ current, urls });
  },

  chooseLocation() {
    wx.chooseLocation({
      latitude: this.data.latitude,
      longitude: this.data.longitude,
      success: (res) => {
        const latitude = Number(res.latitude.toFixed(6));
        const longitude = Number(res.longitude.toFixed(6));
        const address = res.address || res.name || "";
        this.setData({
          latitude,
          longitude,
          locationReady: true,
          currentCity: this.extractCity(address) || res.name || "已选位置",
          currentAddress: address || res.name || "已选择地图位置"
        });
        wx.showToast({ title: "位置已选择" });
      },
      fail: () => {
        wx.showToast({ title: "未选择位置", icon: "none" });
      }
    });
  },

  extractCity(address) {
    const text = String(address || "");
    const municipality = text.match(/^(北京市|上海市|天津市|重庆市)/);
    if (municipality) return municipality[1];
    const city = text.match(/([\u4e00-\u9fa5]{2,12}市)/);
    return city ? city[1] : "";
  },

  isSold(status) {
    return status === "成交" || status === "已成交";
  },

  buildDeviceLine(form) {
    const cutting = `开料设备${form.cuttingCount || "0"}台${form.cuttingBrand ? ` · ${form.cuttingBrand}` : ""}`;
    const drilling = `打孔设备${form.drillingCount || "0"}台${form.drillingBrand ? ` · ${form.drillingBrand}` : ""}`;
    return `${cutting} / ${drilling}`;
  },

  async submitVisit(event) {
    const form = event.detail.value;
    if (!form.factory) {
      wx.showToast({ title: "请填写工厂名称", icon: "none" });
      return;
    }
    if (!this.data.photos.length) {
      wx.showToast({ title: "请至少上传1张现场图片", icon: "none" });
      return;
    }
    if (!this.data.locationReady || !this.data.currentAddress) {
      wx.showModal({
        title: "未选择位置",
        content: "请先点“选择位置”，在地图上确认工厂位置后再上传打卡。",
        showCancel: false
      });
      return;
    }

    try {
      wx.showLoading({ title: "上传中" });
      const photoUrls = await this.uploadPhotos(this.data.photos);
      const visit = {
        factory: form.factory,
        cuttingCount: form.cuttingCount || "",
        cuttingBrand: form.cuttingBrand || "待补充",
        drillingCount: form.drillingCount || "",
        drillingBrand: form.drillingBrand || "待补充",
        software: form.software || "待补充",
        softwarePrice: form.softwarePrice || "待补充",
        line: this.buildDeviceLine(form),
        status: this.data.statuses[this.data.statusIndex],
        latitude: this.data.latitude,
        longitude: this.data.longitude,
        city: this.data.currentCity,
        address: this.data.currentAddress,
        owner: this.data.currentUser.name,
        ownerId: this.data.currentUser.id,
        photos: photoUrls,
        date: app.globalData.today
      };
      await app.requestApi("/visits", {
        method: "POST",
        data: visit
      });
      app.loadRemoteState(() => {
        this.setData({ photos: [] });
        this.loadVisits();
      });
      wx.showToast({ title: "已上传" });
    } catch (error) {
      wx.showModal({
        title: "上传失败",
        content: error.message || "请确认图片和位置都已选择后再上传。",
        showCancel: false
      });
    } finally {
      wx.hideLoading();
    }
  },

  uploadPhotos(paths) {
    return Promise.all(
      paths.map(
        (filePath) =>
          new Promise((resolve, reject) => {
            if (/^https?:\/\//.test(filePath)) return resolve(filePath);
            wx.uploadFile({
              url: `${app.globalData.apiBase}/uploads`,
              filePath,
              name: "file",
              formData: { scene: "field-visit" },
              success: (res) => {
                if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                  let message = `上传接口返回 ${res.statusCode}`;
                  try {
                    const data = JSON.parse(res.data || "{}");
                    if (data.error) message = data.error;
                  } catch {}
                  reject(new Error(message));
                  return;
                }
                try {
                  const data = JSON.parse(res.data || "{}");
                  if (!data.url) throw new Error("后端未返回图片地址");
                  const origin = app.globalData.apiBase.replace(/\/api$/, "");
                  resolve(data.url.startsWith("http") ? data.url : `${origin}${data.url}`);
                } catch (error) {
                  reject(error);
                }
              },
              fail: (error) => {
                reject(new Error(error.errMsg || "wx.uploadFile 调用失败"));
              }
            });
          })
      )
    );
  }
});
