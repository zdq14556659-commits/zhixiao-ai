const app = getApp();

Page({
  data: {
    latitude: 35.86166,
    longitude: 104.195397,
    scale: 5,
    currentCity: "",
    currentAddress: "",
    locationReady: false,
    hasCurrentLocation: false,
    statuses: ["名单", "线索", "商机", "成交"],
    statusIndex: 1,
    visits: [],
    points: [],
    markers: [],
    photos: [],
    cityStats: [],
    currentUser: {},
    editingVisitId: 0,
    selectedPoint: null,
    canRestoreSelected: false,
    nearbyPoints: [],
    radiusOptions: [5, 10, 20, 50],
    radiusIndex: 2,
    routeSelectedIds: [],
    todayRoute: null,
    form: {}
  },

  onShow() {
    if (!app.ensureLogin()) return;
    app.loadRemoteState(() => {
      this.setData({ currentUser: app.getCurrentUser(), visits: app.scopeVisits() });
      this.centerOnSelf(() => this.refreshMapData());
    });
  },

  centerOnSelf(callback) {
    wx.getLocation({
      type: "gcj02",
      isHighAccuracy: true,
      success: (result) => {
        this.setData({ latitude: Number(result.latitude.toFixed(6)), longitude: Number(result.longitude.toFixed(6)), scale: 13, hasCurrentLocation: true });
        if (callback) callback();
      },
      fail: () => {
        wx.showToast({ title: "未获取当前位置，可手动选择位置", icon: "none" });
        if (callback) callback();
      }
    });
  },

  async refreshMapData() {
    try {
      const [mapResult, routes] = await Promise.all([
        app.requestApi("/map/points"),
        app.requestApi(`/routes?date=${app.globalData.today}`)
      ]);
      const points = mapResult.points || [];
      const cityMap = points.reduce((map, item) => {
        const city = item.city || "未知城市";
        map[city] = (map[city] || 0) + 1;
        return map;
      }, {});
      this.setData({
        points,
        markers: points.map((item) => this.pointMarker(item)),
        cityStats: Object.entries(cityMap).map(([city, count]) => ({ city, count })),
        todayRoute: routes[0] || null,
        routeSelectedIds: (routes[0]?.stops || []).map((item) => Number(item.customerId)),
        visits: app.scopeVisits()
      });
      this.loadNearby();
    } catch (error) {
      wx.showToast({ title: error.message || "地图数据加载失败", icon: "none" });
    }
  },

  pointMarker(point) {
    const iconMap = {
      pending: "/assets/marker-gray.png",
      visited: "/assets/marker-green.png",
      sold: "/assets/marker-red.png",
      archived: "/assets/marker-black.png"
    };
    return {
      id: Number(point.customerId),
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      title: point.name,
      iconPath: iconMap[point.pointStatus] || iconMap.pending,
      width: 22,
      height: 22,
      callout: {
        content: `${point.name}\n${this.pointStatusLabel(point.pointStatus)}`,
        color: "#1f2d3d",
        fontSize: 11,
        borderRadius: 6,
        bgColor: "#ffffff",
        padding: 7,
        display: "BYCLICK"
      }
    };
  },

  pointStatusLabel(status) {
    return { pending: "待拜访", visited: "已拜访未成交", sold: "已成交", archived: "无效或倒闭" }[status] || "待拜访";
  },

  onMarkerTap(event) {
    const id = Number(event.detail.markerId);
    const point = this.data.points.find((item) => Number(item.customerId) === id);
    if (!point) return;
    this.setData({ selectedPoint: point, canRestoreSelected: point.pointStatus === "archived" && app.getRole().customerScope !== "self" });
  },

  closePointDetail() {
    this.setData({ selectedPoint: null, canRestoreSelected: false });
  },

  async restoreSelectedCustomer() {
    const id = Number(this.data.selectedPoint?.customerId || 0);
    if (!id) return;
    try {
      await app.requestApi(`/customers/${id}/restore`, { method: "POST", data: {} });
      await new Promise((resolve) => app.loadRemoteState(resolve));
      this.setData({ selectedPoint: null, canRestoreSelected: false });
      await this.refreshMapData();
      wx.showToast({ title: "客户已恢复", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "恢复失败", icon: "none" });
    }
  },

  startVisitForPoint() {
    const point = this.data.selectedPoint;
    if (!point) return;
    this.setData({
      form: { factory: point.name, phone: point.phone, software: point.competitor || point.software || "" },
      statusIndex: Math.max(0, this.data.statuses.indexOf(point.stage || "线索")),
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      currentCity: point.city || "",
      currentAddress: point.address || "",
      locationReady: true,
      scale: 15
    });
    wx.pageScrollTo({ scrollTop: 980, duration: 220 });
  },

  navigatePoint(event) {
    const id = Number(event.currentTarget.dataset.id || this.data.selectedPoint?.customerId);
    const point = this.data.points.find((item) => Number(item.customerId) === id);
    if (!point) return;
    wx.openLocation({ latitude: Number(point.latitude), longitude: Number(point.longitude), name: point.name, address: point.address || "", scale: 17 });
  },

  onRadius(event) {
    this.setData({ radiusIndex: Number(event.detail.value) });
    this.loadNearby();
  },

  async loadNearby() {
    if (!this.data.latitude || !this.data.longitude) return;
    try {
      const radiusKm = this.data.radiusOptions[this.data.radiusIndex];
      const result = await app.requestApi(`/map/nearby?latitude=${this.data.latitude}&longitude=${this.data.longitude}&radiusKm=${radiusKm}`);
      this.setData({ nearbyPoints: this.decorateNearby(result.points || [], this.data.routeSelectedIds) });
    } catch {
      this.setData({ nearbyPoints: [] });
    }
  },

  decorateNearby(points, selectedIds) {
    return points.map((item) => ({ ...item, distanceText: Number(item.distanceKm || 0).toFixed(1), selectedForRoute: selectedIds.includes(Number(item.customerId)) }));
  },

  focusNearby(event) {
    const id = Number(event.currentTarget.dataset.id);
    const point = this.data.points.find((item) => Number(item.customerId) === id);
    if (!point) return;
    this.setData({ selectedPoint: point, canRestoreSelected: point.pointStatus === "archived" && app.getRole().customerScope !== "self", latitude: Number(point.latitude), longitude: Number(point.longitude), scale: 15 });
  },

  toggleRouteStop(event) {
    const id = Number(event.currentTarget.dataset.id);
    const selected = this.data.routeSelectedIds.includes(id);
    if (!selected && this.data.routeSelectedIds.length >= 12) {
      wx.showToast({ title: "今日路线最多选择12家", icon: "none" });
      return;
    }
    const routeSelectedIds = selected ? this.data.routeSelectedIds.filter((item) => item !== id) : [...this.data.routeSelectedIds, id];
    this.setData({ routeSelectedIds, nearbyPoints: this.decorateNearby(this.data.nearbyPoints, routeSelectedIds) });
  },

  async buildTodayRoute() {
    if (!this.data.hasCurrentLocation) {
      wx.showToast({ title: "请先允许小程序获取当前位置", icon: "none" });
      return;
    }
    if (!this.data.routeSelectedIds.length) {
      wx.showToast({ title: "请先选择要拜访的工厂", icon: "none" });
      return;
    }
    wx.showLoading({ title: "规划路线中" });
    try {
      const optimized = await app.requestApi("/routes/optimize", {
        method: "POST",
        data: { customerIds: this.data.routeSelectedIds, latitude: this.data.latitude, longitude: this.data.longitude }
      });
      const route = await app.requestApi("/routes", { method: "POST", data: { date: app.globalData.today, stops: optimized.stops } });
      const routeSelectedIds = route.stops.map((item) => Number(item.customerId));
      this.setData({ todayRoute: route, routeSelectedIds, nearbyPoints: this.decorateNearby(this.data.nearbyPoints, routeSelectedIds) });
      wx.showToast({ title: optimized.source === "tencent" ? "路线已智能排序" : "路线已按距离排序", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "路线规划失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  onStatus(event) { this.setData({ statusIndex: Number(event.detail.value) }); },

  choosePhotos() {
    wx.chooseMedia({ count: 6 - this.data.photos.length, mediaType: ["image"], sourceType: ["album", "camera"], success: (res) => this.setData({ photos: [...this.data.photos, ...res.tempFiles.map((item) => item.tempFilePath)].slice(0, 6) }) });
  },

  previewPhoto(event) {
    const current = event.currentTarget.dataset.src;
    const urls = this.data.photos.includes(current) ? this.data.photos : this.data.visits.flatMap((item) => item.photos || []);
    wx.previewImage({ current, urls });
  },

  chooseLocation() {
    wx.chooseLocation({
      latitude: this.data.latitude,
      longitude: this.data.longitude,
      success: (res) => {
        const address = res.address || res.name || "";
        this.setData({ latitude: Number(res.latitude.toFixed(6)), longitude: Number(res.longitude.toFixed(6)), scale: 15, locationReady: true, currentCity: this.extractCity(address) || res.name || "已选位置", currentAddress: address || res.name || "已选择地图位置" });
        wx.showToast({ title: "位置已选择" });
      }
    });
  },

  extractCity(address) {
    const municipality = String(address || "").match(/^(北京市|上海市|天津市|重庆市)/);
    if (municipality) return municipality[1];
    const city = String(address || "").match(/([\u4e00-\u9fa5]{2,12}市)/);
    return city ? city[1] : "";
  },

  buildDeviceLine(form) {
    return [`开料：${form.cuttingDevice || "待补充"}`, `打孔：${form.drillingDevice || "待补充"}`].join(" / ");
  },

  editVisit(event) {
    const visit = this.data.visits.find((item) => Number(item.id) === Number(event.currentTarget.dataset.id));
    if (!visit) return;
    this.setData({
      editingVisitId: Number(visit.id),
      statusIndex: Math.max(0, this.data.statuses.indexOf(visit.status || "线索")),
      photos: visit.photos || [],
      latitude: Number(visit.latitude || this.data.latitude),
      longitude: Number(visit.longitude || this.data.longitude),
      scale: 15,
      currentCity: visit.city || "",
      currentAddress: visit.address || "",
      locationReady: Boolean(visit.latitude && visit.longitude),
      selectedPoint: this.data.points.find((item) => Number(item.customerId) === Number(visit.customerId)) || null,
      form: { factory: visit.factory || "", phone: visit.phone || "", cuttingDevice: visit.cuttingDevice || "", drillingDevice: visit.drillingDevice || "", software: visit.software || "", softwarePrice: visit.softwarePrice || "", lossReason: visit.lossReason || "", objections: visit.objections || "", result: visit.result || "" }
    });
    wx.pageScrollTo({ scrollTop: 980, duration: 220 });
  },

  cancelEdit() { this.resetVisitForm(); },

  resetVisitForm() {
    this.setData({ editingVisitId: 0, form: {}, photos: [], statusIndex: 1, currentCity: "", currentAddress: "", locationReady: false, selectedPoint: null });
  },

  async submitVisit(event) {
    const form = event.detail.value;
    if (!form.factory || !String(form.phone || "").trim()) return wx.showToast({ title: "请填写工厂名称和电话", icon: "none" });
    if (!this.data.photos.length) return wx.showToast({ title: "请至少上传1张现场图片", icon: "none" });
    if (!this.data.locationReady || !this.data.currentAddress) return wx.showToast({ title: "请先选择工厂位置", icon: "none" });
    try {
      wx.showLoading({ title: "上传中" });
      const photoUrls = await this.uploadPhotos(this.data.photos);
      const user = this.data.currentUser;
      const visit = {
        customerId: this.data.selectedPoint?.customerId || 0,
        factory: form.factory,
        phone: form.phone,
        cuttingDevice: form.cuttingDevice || "",
        drillingDevice: form.drillingDevice || "",
        software: form.software || "待补充",
        softwarePrice: form.softwarePrice || "待补充",
        lossReason: form.lossReason || "",
        objections: form.objections || "",
        result: form.result || "已完成现场拜访",
        line: this.buildDeviceLine(form),
        status: this.data.statuses[this.data.statusIndex],
        latitude: this.data.latitude,
        longitude: this.data.longitude,
        city: this.data.currentCity,
        address: this.data.currentAddress,
        owner: user.name,
        ownerId: user.id,
        unitId: user.unitId || "",
        unit: user.unit || "",
        zone: user.zone || "",
        photos: photoUrls,
        date: app.globalData.today
      };
      const isEditing = Boolean(this.data.editingVisitId);
      await (isEditing ? app.requestApi(`/visits/${this.data.editingVisitId}`, { method: "PUT", data: visit }) : app.requestApi("/visits", { method: "POST", data: visit }));
      await new Promise((resolve) => app.loadRemoteState(resolve));
      this.resetVisitForm();
      await this.refreshMapData();
      wx.showToast({ title: isEditing ? "已更新" : "已上传", icon: "success" });
    } catch (error) {
      wx.showModal({ title: "上传失败", content: error.message || "请稍后重试", showCancel: false });
    } finally {
      wx.hideLoading();
    }
  },

  uploadPhotos(paths) {
    const session = app.getSession();
    const header = session?.token ? { Authorization: `Bearer ${session.token}` } : {};
    return Promise.all(paths.map((filePath) => new Promise((resolve, reject) => {
      if (/^https?:\/\//.test(filePath)) return resolve(filePath);
      wx.uploadFile({
        url: `${app.globalData.apiBase}/uploads`, filePath, name: "file", header, formData: { scene: "field-visit" },
        success: (res) => {
          try {
            const data = JSON.parse(res.data || "{}");
            if (res.statusCode < 200 || res.statusCode >= 300 || !data.url) throw new Error(data.error || "图片上传失败");
            const origin = app.globalData.apiBase.replace(/\/api$/, "");
            resolve(data.url.startsWith("http") ? data.url : `${origin}${data.url}`);
          } catch (error) { reject(error); }
        },
        fail: (error) => reject(new Error(error.errMsg || "图片上传失败"))
      });
    })));
  }
});
