const app = getApp();

Page({
  data: {
    roles: [],
    units: [],
    zones: ["东部战区", "南部战区", "西部战区", "北部战区", "中部战区"],
    scopes: ["仅本人客户", "本单位客户", "本战区客户", "全部客户"],
    scopeValues: ["self", "unit", "zone", "all"],
    roleIndex: 0,
    unitIndex: 0,
    parentIndex: 0,
    unitTypeIndex: 2,
    unitTypes: ["department", "battle_zone", "unit", "team"],
    unitTypeNames: ["一级部门", "战区", "单位", "小组"],
    zoneIndex: 0,
    scopeIndex: 1,
    users: [],
    userOrgRows: [],
    collapsedUnitIds: {},
    orgUnits: [],
    parentUnits: [],
    knowledge: [],
    knowledgeFile: null,
    unitPickerText: "请先添加单位",
    activeTab: "accounts",
    deletingUserId: 0,
    deletingUnitId: "",
    successTitle: "",
    successDetail: "",
    successVisible: false,
    savingUser: false,
    savingUnit: false,
    currentUserId: 0,
    resetUserId: 0,
    resetUserName: "",
    resetPassword: "",
    resetPasswordConfirm: "",
    resettingPassword: false,
    userName: "",
    userAccount: "",
    userPassword: "",
    unitName: ""
  },

  onShow() {
    if (!app.ensureLogin()) return;
    if (!app.canAdmin()) {
      wx.showToast({ title: "无后台权限", icon: "none" });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.reload();
  },

  onUnload() {
    clearTimeout(this.successTimer);
  },

  reload(callback) {
    app.loadRemoteState(() => {
      const state = app.getState();
      const units = app.selectableUnits();
      const parentUnits = app.getUnits();
      this.setData({
        users: app.visibleUsers(),
        userOrgRows: this.buildUserOrgRows(app.visibleUsers(), app.getUnits(), this.data.collapsedUnitIds),
        currentUserId: Number(app.getCurrentUser()?.id || 0),
        roles: app.getRoles(),
        units,
        orgUnits: app.getUnits(),
        parentUnits,
        knowledge: state.knowledge || [],
        unitPickerText: this.formatUnitPicker(units, this.data.unitIndex)
      });
      if (callback) callback();
    });
  },

  isHiddenDemoUser(user = {}) {
    const account = String(user.account || user.username || "").toLowerCase();
    return ["linchen", "zhouyang"].includes(account) && ["林晨", "周扬"].includes(user.name);
  },

  buildUserOrgRows(rawUsers = [], units = [], collapsed = {}) {
    const users = rawUsers.filter((user) => !this.isHiddenDemoUser(user));
    const children = {};
    units.forEach((unit) => {
      const parentId = String(unit.parentId || "");
      if (!children[parentId]) children[parentId] = [];
      children[parentId].push(unit);
    });
    const usersByUnit = {};
    users.forEach((user) => {
      const unitId = String(user.unitId || "unassigned");
      if (!usersByUnit[unitId]) usersByUnit[unitId] = [];
      usersByUnit[unitId].push(user);
    });
    const countForUnit = (unitId) => {
      let count = (usersByUnit[String(unitId)] || []).length;
      (children[String(unitId)] || []).forEach((child) => { count += countForUnit(child.id); });
      return count;
    };
    const rows = [];
    const walk = (unit) => {
      const id = String(unit.id);
      const count = countForUnit(id);
      if (!count && unit.type !== "root") return;
      const isCollapsed = Boolean(collapsed[id]);
      rows.push({ kind: "unit", id, name: unit.name, level: Number(unit.level || 0), count, collapsed: isCollapsed });
      if (isCollapsed) return;
      (usersByUnit[id] || []).forEach((user) => rows.push({ kind: "user", ...user, level: Number(unit.level || 0) + 1 }));
      (children[id] || []).sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0)).forEach(walk);
    };
    const root = units.find((unit) => unit.id === "org-root") || units.find((unit) => unit.type === "root");
    if (root) walk(root);
    (usersByUnit.unassigned || []).forEach((user) => rows.push({ kind: "user", ...user, level: 0 }));
    return rows;
  },

  toggleUserUnit(event) {
    const id = event.currentTarget.dataset.id;
    const collapsedUnitIds = { ...this.data.collapsedUnitIds, [id]: !this.data.collapsedUnitIds[id] };
    this.setData({
      collapsedUnitIds,
      userOrgRows: this.buildUserOrgRows(this.data.users, this.data.orgUnits, collapsedUnitIds)
    });
  },

  onRole(event) {
    this.setData({ roleIndex: Number(event.detail.value) });
  },

  onUnit(event) {
    const unitIndex = Number(event.detail.value);
    this.setData({ unitIndex, unitPickerText: this.formatUnitPicker(this.data.units, unitIndex) });
  },

  onZone(event) {
    this.setData({ zoneIndex: Number(event.detail.value) });
  },

  onParentUnit(event) {
    this.setData({ parentIndex: Number(event.detail.value) });
  },

  onUnitType(event) {
    this.setData({ unitTypeIndex: Number(event.detail.value) });
  },

  onScope(event) {
    this.setData({ scopeIndex: Number(event.detail.value) });
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab });
  },

  formatUnitPicker(units = [], index = 0) {
    const unit = units[index];
    return unit ? app.unitLabel(unit) : "请选择单位";
  },

  flashSuccess(title, detail) {
    clearTimeout(this.successTimer);
    this.setData({ successTitle: title, successDetail: detail || "列表已自动更新。", successVisible: true });
    this.successTimer = setTimeout(() => this.setData({ successVisible: false }), 2600);
  },

  closeSuccess() {
    clearTimeout(this.successTimer);
    this.setData({ successVisible: false });
  },

  noop() {},

  onUserName(event) {
    this.setData({ userName: event.detail.value });
  },

  onUserAccount(event) {
    this.setData({ userAccount: event.detail.value });
  },

  onUserPassword(event) {
    this.setData({ userPassword: event.detail.value });
  },

  onUnitName(event) {
    this.setData({ unitName: event.detail.value });
  },

  openResetPassword(event) {
    const id = Number(event.currentTarget.dataset.id);
    const user = this.data.users.find((item) => Number(item.id) === id);
    if (!user) return;
    this.setData({ resetUserId: id, resetUserName: user.name, resetPassword: "", resetPasswordConfirm: "" });
  },

  closeResetPassword() {
    if (this.data.resettingPassword) return;
    this.setData({ resetUserId: 0, resetUserName: "", resetPassword: "", resetPasswordConfirm: "" });
  },

  onResetPassword(event) {
    this.setData({ resetPassword: event.detail.value });
  },

  onResetPasswordConfirm(event) {
    this.setData({ resetPasswordConfirm: event.detail.value });
  },

  submitResetPassword() {
    const newPassword = String(this.data.resetPassword || "");
    if (newPassword.length < 6) return wx.showToast({ title: "新密码至少6位", icon: "none" });
    if (newPassword !== this.data.resetPasswordConfirm) return wx.showToast({ title: "两次新密码不一致", icon: "none" });
    this.setData({ resettingPassword: true });
    app
      .requestApi(`/users/${this.data.resetUserId}/password`, { method: "PUT", data: { newPassword } })
      .then(() => {
        const name = this.data.resetUserName;
        this.setData({ resettingPassword: false });
        this.closeResetPassword();
        this.reload(() => this.flashSuccess("密码已重置", `${name}需要使用新密码重新登录，并会收到修改密码提醒。`));
      })
      .catch((error) => wx.showToast({ title: error.message || "重置失败", icon: "none" }))
      .finally(() => this.setData({ resettingPassword: false }));
  },

  submitUser(event) {
    const form = event.detail.value;
    const account = String(form.account || "").trim();
    const role = this.data.roles[this.data.roleIndex] || {};
    const unit = this.data.units[this.data.unitIndex] || {};
    const payload = {
      name: String(form.name || "").trim(),
      phone: account,
      account,
      password: String(form.password || ""),
      roleId: role.id,
      role: role.name,
      unitId: unit.id,
      region: unit.zone || "待分区",
      unit: unit.name || "待分配"
    };
    if (!payload.name || !payload.account || !payload.password) {
      wx.showToast({ title: "姓名、账号、密码必填", icon: "none" });
      return;
    }
    if (payload.password.length < 6) {
      wx.showToast({ title: "初始密码至少6位", icon: "none" });
      return;
    }
    this.setData({ savingUser: true });
    app
      .requestApi("/users", {
        method: "POST",
        data: payload
      })
      .then(() => {
        this.reload(() => {
          this.setData({ roleIndex: 0, unitIndex: 0, userName: "", userAccount: "", userPassword: "" });
          this.flashSuccess("员工添加成功", `${payload.name}的账号已开通，员工列表已自动更新。`);
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "开通失败", icon: "none" });
      })
      .finally(() => {
        this.setData({ savingUser: false });
      });
  },

  submitUnit(event) {
    const nextName = String(event.detail.value.name || "").trim();
    const parent = this.data.parentUnits[this.data.parentIndex] || {};
    const type = this.data.unitTypes[this.data.unitTypeIndex] || "unit";
    if (!nextName) {
      wx.showToast({ title: "请填写组织名称", icon: "none" });
      return;
    }
    this.setData({ savingUnit: true });
    app
      .requestApi("/units", {
        method: "POST",
        data: { name: nextName, parentId: parent.id || "org-root", type, active: true, sort: 100 }
      })
      .then(() => {
        this.reload(() => {
          this.setData({ parentIndex: 0, unitTypeIndex: 2, unitName: "" });
          this.flashSuccess("组织节点添加成功", `${nextName}已保存，组织树和员工单位选项已自动更新。`);
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "添加失败", icon: "none" }))
      .finally(() => this.setData({ savingUnit: false }));
  },

  submitRole(event) {
    const name = String(event.detail.value.name || "").trim();
    if (!name) {
      wx.showToast({ title: "请填写角色名称", icon: "none" });
      return;
    }
    app
      .requestApi("/roles", {
        method: "POST",
        data: {
          name,
          customerScope: this.data.scopeValues[this.data.scopeIndex],
          permissions: ["dashboard", "customers", "field", "assistant"]
        }
      })
      .then(() => {
        this.reload(() => {
          this.setData({ scopeIndex: 1 });
          this.flashSuccess("角色添加成功");
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "添加失败", icon: "none" }));
  },

  submitKnowledge(event) {
    const question = String(event.detail.value.question || "").trim();
    const answer = String(event.detail.value.answer || "").trim();
    if (!question && !answer && !this.data.knowledgeFile) {
      wx.showToast({ title: "请填写知识或上传文件", icon: "none" });
      return;
    }
    const request = this.data.knowledgeFile
      ? this.uploadKnowledgeFile(this.data.knowledgeFile, { question, answer })
      : app.requestApi("/knowledge", { method: "POST", data: { question, answer } });
    request
      .then(() => {
        this.setData({ knowledgeFile: null });
        this.reload(() => this.flashSuccess("知识添加成功"));
      })
      .catch((error) => wx.showToast({ title: error.message || "添加失败", icon: "none" }));
  },

  chooseKnowledgeFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["txt", "md", "csv", "json", "pdf", "docx", "xlsx"],
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        if (file) this.setData({ knowledgeFile: file });
      }
    });
  },

  clearKnowledgeFile() {
    this.setData({ knowledgeFile: null });
  },

  uploadKnowledgeFile(file, formData) {
    const session = app.getSession();
    const header = session && session.token ? { Authorization: `Bearer ${session.token}` } : {};
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${app.globalData.apiBase}/knowledge`,
        filePath: file.path,
        name: "file",
        header,
        formData,
        success: (result) => {
          let data = {};
          try {
            data = JSON.parse(result.data || "{}");
          } catch {}
          if (result.statusCode < 200 || result.statusCode >= 300) {
            reject(new Error(data.error || `上传失败 ${result.statusCode}`));
            return;
          }
          resolve(data);
        },
        fail: (error) => reject(new Error(error.errMsg || "文件上传失败"))
      });
    });
  },

  deleteUser(event) {
    const id = event.currentTarget.dataset.id;
    const user = this.data.users.find((item) => Number(item.id) === Number(id));
    if (!user) return;
    wx.showModal({
      title: "删除员工",
      content: `确认删除员工：${user.name}？`,
      confirmText: "删除",
      confirmColor: "#f56c6c",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ deletingUserId: Number(id) });
        app
          .requestApi(`/users/${id}`, { method: "DELETE" })
          .then(() => {
            setTimeout(() => {
              this.reload(() => {
                this.setData({ deletingUserId: 0 });
                this.flashSuccess("员工已删除");
              });
            }, 220);
          })
          .catch((error) => {
            this.setData({ deletingUserId: 0 });
            wx.showToast({ title: error.message || "删除失败", icon: "none" });
          });
      }
    });
  },

  deleteUnit(event) {
    const id = event.currentTarget.dataset.id;
    const unit = (this.data.orgUnits || this.data.units).find((item) => item.id === id);
    if (!unit) return;
    wx.showModal({
      title: "删除单位",
      content: `确认删除单位：${unit.name}？`,
      confirmText: "删除",
      confirmColor: "#f56c6c",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ deletingUnitId: id });
        app
          .requestApi(`/units/${encodeURIComponent(id)}`, { method: "DELETE" })
          .then(() => {
            setTimeout(() => {
              this.reload(() => {
                this.setData({ deletingUnitId: "" });
                this.flashSuccess("单位已删除");
              });
            }, 220);
          })
          .catch((error) => {
            this.setData({ deletingUnitId: "" });
            wx.showToast({ title: error.message || "删除失败", icon: "none" });
          });
      }
    });
  }
});
