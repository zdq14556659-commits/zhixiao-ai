const STORAGE_KEY = "zhixiao_ai_mini_state_v3";
const AUTH_KEY = "zhixiao_ai_auth_v1";
const API_BASE_OVERRIDE_KEY = "zhixiao_ai_api_base_override";
const PROD_API_BASE = "https://zhixiaoai1.onrender.com/api";
const API_BASE = getApiBase();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CHANNEL_SOURCES = ["自媒体", "官网留言", "自主注册", "渠道介绍", "企查查", "客源汇", "公众号", "地推", "其他"];
const ZONES = ["东部战区", "南部战区", "西部战区", "北部战区", "中部战区"];
const DEFAULT_ROLES = [
  { id: "role-owner", name: "总负责人", customerScope: "all", permissions: ["dashboard", "customers", "field", "assistant", "admin"] },
  { id: "role-region", name: "区域经理", customerScope: "zone", permissions: ["dashboard", "customers", "field", "assistant"] },
  { id: "role-supervisor", name: "主管", customerScope: "unit", permissions: ["dashboard", "customers", "field", "assistant"] },
  { id: "role-sales", name: "销售", customerScope: "self", permissions: ["dashboard", "customers", "field", "assistant"] },
  { id: "role-ops", name: "运营", customerScope: "all", permissions: ["dashboard", "customers", "field", "assistant", "admin"] },
  { id: "role-admin", name: "管理员", customerScope: "all", permissions: ["dashboard", "customers", "field", "assistant", "admin"] }
];
const DEFAULT_UNITS = [];
const LEGACY_DEMO_UNIT_IDS = [
  "unit-east-custom",
  "unit-south-custom",
  "unit-west-custom",
  "unit-north-custom",
  "unit-central-channel",
  "unit-national-channel",
  "unit-hq-growth"
];

function getChinaToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatRequestError(error) {
  const message = error?.errMsg || "";
  if (message.includes("timeout")) return "Render 后端启动较慢，请等待约一分钟后重试";
  if (message.includes("url not in domain list")) return "开发者工具请勾选不校验合法域名，正式版需配置 HTTPS 合法域名";
  if (message.includes("fail")) return `无法连接后端：${PROD_API_BASE}`;
  return message || "后端暂不可用";
}

function normalizeChannelSource(value) {
  const text = String(value || "").trim();
  if (CHANNEL_SOURCES.includes(text)) return text;
  const aliases = {
    官方资源: "官网留言",
    官网: "官网留言",
    网站留言: "官网留言",
    官网注册: "自主注册",
    注册: "自主注册",
    转介绍: "渠道介绍",
    介绍: "渠道介绍",
    企查: "企查查",
    微信公众号: "公众号",
    手动录入: "其他",
    批量导入: "其他",
    展会: "其他"
  };
  return aliases[text] || "其他";
}

function getApiBase() {
  try {
    const override = String(wx.getStorageSync(API_BASE_OVERRIDE_KEY) || "").trim().replace(/\/$/, "");
    return override || PROD_API_BASE;
  } catch {
    return PROD_API_BASE;
  }
}

const today = getChinaToday();

function migrateLocalState(state = seedState) {
  return {
    ...state,
    units: (state.units || []).filter((unit) => unit && !LEGACY_DEMO_UNIT_IDS.includes(unit.id)),
    users: (state.users || []).map((user) => LEGACY_DEMO_UNIT_IDS.includes(user.unitId)
      ? { ...user, unitId: "", unit: "待分配" }
      : user)
  };
}

const seedState = {
  version: "mini-v3",
  currentUserId: 0,
  stages: ["名单", "线索", "商机", "成交"],
  zones: ZONES,
  roles: DEFAULT_ROLES,
  units: DEFAULT_UNITS,
  users: [
    { id: 1, name: "林晨", account: "linchen", role: "销售", roleId: "role-sales", unitId: "unit-east-custom", unit: "华东定制产业带", zone: "东部战区", region: "东部战区" },
    { id: 2, name: "周扬", account: "zhouyang", role: "销售", roleId: "role-sales", unitId: "unit-south-custom", unit: "华南定制产业带", zone: "南部战区", region: "南部战区" },
    { id: 3, name: "陈主管", account: "chen", role: "主管", roleId: "role-supervisor", unitId: "unit-east-custom", unit: "华东定制产业带", zone: "东部战区", region: "东部战区" },
    { id: 4, name: "王区域", account: "wang", role: "区域经理", roleId: "role-region", unitId: "unit-central-channel", unit: "中部渠道一部", zone: "中部战区", region: "中部战区" },
    { id: 5, name: "运营小组", account: "admin", role: "运营", roleId: "role-ops", unitId: "unit-hq-growth", unit: "总部增长运营", zone: "中部战区", region: "中部战区" }
  ],
  customers: [
    {
      id: 101,
      name: "杭州雅居全屋定制工厂",
      phone: "13800138000",
      channelSource: "官网留言",
      createdBy: "运营小组",
      followPerson: "林晨",
      address: "浙江省杭州市",
      stage: "名单",
      owner: "林晨",
      ownerId: 1,
      unitId: "unit-east-custom",
      unit: "华东定制产业带",
      zone: "东部战区",
      region: "东部战区",
      amount: 18,
      software: "酷家乐 + Excel排产",
      createdAt: "2026-06-04",
      lastFollow: "2026-06-04",
      nextFollow: "2026-06-05",
      lastNote: "老板关心设计拆单一体化，现用酷家乐出图后人工算板件。"
    },
    {
      id: 102,
      name: "佛山柜体门板厂",
      phone: "13900139000",
      channelSource: "企查查",
      createdBy: "运营小组",
      followPerson: "周扬",
      address: "广东省佛山市",
      stage: "线索",
      owner: "周扬",
      ownerId: 2,
      unitId: "unit-south-custom",
      unit: "华南定制产业带",
      zone: "南部战区",
      region: "南部战区",
      amount: 26,
      software: "酷家乐 + 手工报价",
      createdAt: "2026-06-03",
      lastFollow: "2026-06-05",
      nextFollow: "2026-06-05",
      lastNote: "生产主管确认开料、封边、排产脱节，愿意看演示。"
    },
    {
      id: 103,
      name: "成都整装定制工厂",
      phone: "13600000001",
      channelSource: "地推",
      createdBy: "林晨",
      followPerson: "林晨",
      address: "四川省成都市",
      stage: "商机",
      owner: "林晨",
      ownerId: 1,
      unitId: "unit-east-custom",
      unit: "华东定制产业带",
      zone: "东部战区",
      region: "东部战区",
      amount: 32,
      software: "自研ERP + Excel",
      createdAt: "2026-06-02",
      lastFollow: "2026-06-03",
      nextFollow: "2026-06-04",
      lastNote: "需要门墙柜一体化报价、拆单和车间看板试点方案。"
    },
    {
      id: 104,
      name: "合肥橱柜衣柜智造厂",
      phone: "13700000004",
      channelSource: "渠道介绍",
      createdBy: "周扬",
      followPerson: "周扬",
      address: "安徽省合肥市",
      stage: "成交",
      owner: "周扬",
      ownerId: 2,
      unitId: "unit-south-custom",
      unit: "华南定制产业带",
      zone: "南部战区",
      region: "南部战区",
      amount: 45,
      software: "三维家 + 云熙拆单",
      createdAt: "2026-06-01",
      lastFollow: "2026-06-05",
      nextFollow: "",
      lastNote: "合同已回传，先上报价、拆单、生产进度看板三模块。"
    }
  ],
  activities: [
    { date: "2026-06-04", owner: "林晨", type: "名单", customerId: 101 },
    { date: "2026-06-05", owner: "周扬", type: "线索", customerId: 102 },
    { date: "2026-06-03", owner: "林晨", type: "商机", customerId: 103 },
    { date: "2026-06-05", owner: "周扬", type: "成交", customerId: 104 }
  ],
  visits: [
    {
      id: 1,
      factory: "杭州雅居全屋定制工厂",
      line: "电子锯2台 / 封边机3台 / 六面钻1台",
      software: "酷家乐 + Excel排产",
      status: "线索",
      latitude: 30.2741,
      longitude: 120.1551,
      city: "杭州市",
      address: "浙江省杭州市",
      owner: "林晨",
      ownerId: 1,
      unitId: "unit-east-custom",
      unit: "华东定制产业带",
      zone: "东部战区",
      photos: [],
      date: "2026-06-05"
    }
  ],
  knowledge: [
    {
      question: "设计图能不能直接拆单到开料",
      answer: "建议用客户一套真实订单演示，从设计、报价、拆单、板件清单到开料标签完整跑一遍。先证明错单减少和效率提升，再谈全厂上线。"
    },
    {
      question: "上线会不会影响正在交付的订单",
      answer: "建议样板门店加样板产线试点，旧订单不强切，新订单先双轨验证，两周跑通报价拆单和车间看板。"
    },
    {
      question: "价格太高",
      answer: "把报价拆成错单返工、板材浪费、延期赔付和管理统计人力四项损耗，用月订单量估算回本周期。"
    }
  ],
  resources: []
};

App({
  globalData: {
    today,
    apiBase: API_BASE,
    channelSources: CHANNEL_SOURCES,
    stageColors: {
      名单: "#64748b",
      线索: "#409eff",
      商机: "#e6a23c",
      成交: "#67c23a"
    }
  },

  onLaunch() {
    if (!wx.getStorageSync(STORAGE_KEY)) {
      wx.setStorageSync(STORAGE_KEY, seedState);
    } else {
      wx.setStorageSync(STORAGE_KEY, migrateLocalState(wx.getStorageSync(STORAGE_KEY)));
    }
    const session = this.getSession();
    if (session && session.user) {
      this.applySessionToState(session.user);
    }
    this.loadRemoteState();
  },

  getState() {
    return migrateLocalState(wx.getStorageSync(STORAGE_KEY) || seedState);
  },

  setState(nextState) {
    const session = this.getSession();
    const state = { ...nextState };
    if (session && session.user) state.currentUserId = session.user.id;
    wx.setStorageSync(STORAGE_KEY, state);
    this.saveRemoteState(state);
  },

  requestApi(path, options = {}) {
    const session = this.getSession();
    const headers = {
      "Content-Type": "application/json",
      ...(options.header || {})
    };
    if (session && session.token) {
      headers.Authorization = `Bearer ${session.token}`;
    }
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${API_BASE}${path}`,
        method: options.method || "GET",
        data: options.data || {},
        header: headers,
        timeout: options.timeout || 60000,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            if (res.statusCode === 401) {
              wx.removeStorageSync(AUTH_KEY);
              wx.reLaunch({ url: "/pages/login/index" });
            }
            const error = new Error(res.data?.error || `请求失败 ${res.statusCode}`);
            error.code = res.data?.code || "";
            error.status = res.statusCode;
            error.data = res.data || {};
            reject(error);
          }
        },
        fail: (error) => {
          reject(new Error(formatRequestError(error)));
        }
      });
    });
  },

  login(account, password) {
    return this.requestApi("/auth/login", {
      method: "POST",
      data: { account, password }
    }).then((data) => {
      wx.setStorageSync(AUTH_KEY, { token: data.token, user: data.user, loginAt: Date.now() });
      const remoteState = data.state || this.getState();
      remoteState.currentUserId = data.user.id;
      wx.setStorageSync(STORAGE_KEY, remoteState);
      return data;
    });
  },

  logout() {
    const session = this.getSession();
    wx.removeStorageSync(AUTH_KEY);
    const state = this.getState();
    state.currentUserId = 0;
    wx.setStorageSync(STORAGE_KEY, state);
    if (session && session.token) {
      wx.request({
        url: `${API_BASE}/auth/logout`,
        method: "POST",
        header: { Authorization: `Bearer ${session.token}` }
      });
    }
  },

  getSession() {
    const session = wx.getStorageSync(AUTH_KEY) || null;
    if (!session) return null;
    if (!session.loginAt || Date.now() - session.loginAt > SESSION_TTL_MS) {
      wx.removeStorageSync(AUTH_KEY);
      return null;
    }
    return session;
  },

  isLoggedIn() {
    const session = this.getSession();
    return Boolean(session && session.user && session.user.id);
  },

  normalizeChannelSource,

  ensureLogin() {
    if (this.isLoggedIn()) return true;
    wx.reLaunch({ url: "/pages/login/index" });
    return false;
  },

  applySessionToState(user) {
    const state = this.getState();
    const exists = state.users.some((item) => item.id === user.id);
    state.currentUserId = user.id;
    if (!exists) state.users.unshift(user);
    wx.setStorageSync(STORAGE_KEY, state);
  },

  loadRemoteState(callback) {
    const session = this.getSession();
    if (!session || session.mode === "local") {
      if (callback) callback(this.getState());
      return;
    }
    wx.request({
      url: `${API_BASE}/state?client=mini`,
      method: "GET",
      header: session.token ? { Authorization: `Bearer ${session.token}` } : {},
      timeout: 60000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
          const nextState = res.data;
          const session = this.getSession();
          if (session && session.user) nextState.currentUserId = session.user.id;
          wx.setStorageSync(STORAGE_KEY, nextState);
          if (callback) callback(nextState);
        } else if (res.statusCode === 401) {
          wx.removeStorageSync(AUTH_KEY);
          wx.reLaunch({ url: "/pages/login/index" });
        } else if (callback) {
          callback(this.getState());
        }
      },
      fail: () => {
        if (callback) callback(this.getState());
      }
    });
  },

  saveRemoteState(nextState) {
    this.requestApi("/state", {
      method: "PUT",
      data: nextState
    }).catch(() => {
      console.warn("智销AI后端暂不可用，已保存到本地缓存");
    });
  },

  updateCustomer(id, updater) {
    const state = this.getState();
    const index = state.customers.findIndex((item) => item.id === Number(id));
    if (index >= 0) {
      state.customers[index] = updater(state.customers[index]);
      this.setState(state);
    }
  },

  addCustomer(customer) {
    const state = this.getState();
    state.customers.unshift(customer);
    this.setState(state);
  },

  getCurrentUser() {
    const state = this.getState();
    const session = this.getSession();
    if (session && session.user) {
      return state.users.find((user) => user.id === session.user.id) || session.user;
    }
    return state.users.find((user) => user.id === state.currentUserId) || {};
  },

  getRoles() {
    const state = this.getState();
    return state.roles && state.roles.length ? state.roles : DEFAULT_ROLES;
  },

  getUnits() {
    const state = this.getState();
    return state.units && state.units.length ? state.units : DEFAULT_UNITS;
  },

  getRole(user = this.getCurrentUser()) {
    return this.getRoles().find((role) => role.id === user.roleId) || this.getRoles().find((role) => role.name === user.role) || DEFAULT_ROLES.find((role) => role.name === "销售");
  },

  hasPermission(permission) {
    return (this.getRole().permissions || []).includes(permission);
  },

  ownsRecord(record, user = this.getCurrentUser()) {
    return Number(record.ownerId) === Number(user.id) || record.owner === user.name;
  },

  getRecordOwner(record) {
    const state = this.getState();
    return state.users.find((user) => Number(user.id) === Number(record.ownerId)) || state.users.find((user) => user.name === record.owner) || {};
  },

  canSeePrivateRecord(record, user = this.getCurrentUser()) {
    const role = this.getRole(user);
    if (role.customerScope === "all") return true;
    if (this.ownsRecord(record, user)) return true;
    const owner = this.getRecordOwner(record);
    const unitId = record.unitId || owner.unitId;
    const zone = record.zone || owner.zone;
    if (role.customerScope === "zone") return zone && zone === user.zone;
    if (role.customerScope === "unit") return unitId && unitId === user.unitId;
    return false;
  },

  canSeeRecord(record, user = this.getCurrentUser()) {
    return record.ownershipStatus === "public_pool" || this.canSeePrivateRecord(record, user);
  },

  visibleUsers() {
    const state = this.getState();
    const currentUser = this.getCurrentUser();
    const role = this.getRole(currentUser);
    if (role.customerScope === "all") return state.users || [];
    return (state.users || []).filter((user) => {
      if (Number(user.id) === Number(currentUser.id)) return true;
      if (role.customerScope === "zone") return user.zone === currentUser.zone;
      if (role.customerScope === "unit") return user.unitId === currentUser.unitId;
      return false;
    });
  },

  visibleSales() {
    return this.visibleUsers().filter((user) => this.getRole(user).name === "销售" || user.role === "销售");
  },

  scopeCustomers() {
    const state = this.getState();
    const currentUser = this.getCurrentUser();
    return (state.customers || []).filter((customer) => this.canSeeRecord(customer, currentUser));
  },

  scopeVisits() {
    const state = this.getState();
    const currentUser = this.getCurrentUser();
    return (state.visits || []).filter((visit) => this.canSeeRecord(visit, currentUser));
  },

  canAdmin() {
    return this.hasPermission("admin");
  }
});
