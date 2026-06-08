const app = getApp();

Page({
  data: {
    latitude: 35.86166,
    longitude: 104.195397,
    currentCity: "",
    currentAddress: "",
    locationReady: false,
    locating: false,
    statuses: ["待攻克", "跟进中", "已成交"],
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
      if (!this.data.locationReady) this.locate({ silent: true });
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
          iconPath: item.status === "已成交" ? "/assets/marker-red.png" : "/assets/marker-green.png",
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

  locate(options = {}) {
    const silent = Boolean(options.silent);
    this.setData({ locating: true });
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: "gcj02",
        isHighAccuracy: true,
        highAccuracyExpireTime: 5000,
        success: async (res) => {
          const latitude = Number(res.latitude.toFixed(6));
          const longitude = Number(res.longitude.toFixed(6));
          this.setData({ latitude, longitude, locationReady: true });
          await this.reverseGeocode(longitude, latitude);
          if (!silent) wx.showToast({ title: "定位成功" });
          resolve({ latitude, longitude });
        },
        fail: (error) => {
          if (!silent) wx.showToast({ title: "定位失败，请检查权限", icon: "none" });
          reject(error);
        },
        complete: () => {
          this.setData({ locating: false });
        }
      });
    });
  },

  reverseGeocode(longitude, latitude) {
    return new Promise((resolve) => {
      wx.request({
        url: `${app.globalData.apiBase}/amap/regeo`,
        data: { longitude, latitude },
        success: (res) => {
          this.setData({
            currentCity: res.data.city || "",
            currentAddress: res.data.address || ""
          });
          resolve(res.data || {});
        },
        fail: () => {
          wx.showToast({ title: "地址解析失败", icon: "none" });
          resolve({});
        }
      });
    });
  },

  async submitVisit(event) {
    const form = event.detail.value;
    if (!form.factory) {
      wx.showToast({ title: "请填写工厂名头", icon: "none" });
      return;
    }
    if (!this.data.photos.length) {
      wx.showToast({ title: "请至少上传1张现场图片", icon: "none" });
      return;
    }

    wx.showLoading({ title: "定位中" });
    try {
      if (!this.data.locationReady) {
        await this.locate({ silent: true });
      }
      wx.showLoading({ title: "上传中" });
      const photoUrls = await this.uploadPhotos(this.data.photos);
      const visit = {
        factory: form.factory,
        line: form.line || "待补充",
        software: form.software || "待补充",
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
        title: this.data.locationReady ? "图片上传失败" : "定位失败",
        content: this.data.locationReady
          ? error.message || "请确认后端已启动，体验版需配置 HTTPS 合法域名。"
          : "请打开手机定位权限后重新打卡，不能使用默认城市位置。",
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
