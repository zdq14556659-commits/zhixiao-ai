const STORAGE_KEY = "zhixiao_ai_mini_state_v3";
const AUTH_KEY = "zhixiao_ai_auth_v1";
const LOCAL_API_BASE = "http://127.0.0.1:8787/api";
const PROD_API_BASE = "https://zhixiao-ai.onrender.com/api";
const API_BASE = getApiBase();
const LOCAL_DEMO_PASSWORDS = {
  admin: "123456",
  linchen: "123456",
  zhouyang: "123456",
  chen: "123456",
  wang: "123456"
};

function getChinaToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatRequestError(error) {
  const message = error?.errMsg || "";
  if (message.includes("timeout")) return "后端连接超时，请先运行 .\\start-backend.ps1";
  if (message.includes("url not in domain list")) return "开发者工具请勾选不校验合法域名，正式版需配置 HTTPS 合法域名";
  if (message.includes("fail")) return "后端暂不可用，请确认 .\\start-backend.ps1 已启动";
  return message || "后端暂不可用";
}

function getApiBase() {
  try {
    const info = wx.getAccountInfoSync();
    return info.miniProgram.envVersion === "develop" ? LOCAL_API_BASE : PROD_API_BASE;
  } catch {
    return LOCAL_API_BASE;
  }
}

const today = getChinaToday();

const seedState = {
  version: "mini-v3",
  currentUserId: 0,
  stages: ["名单", "线索", "商机", "成交"],
  users: [
    { id: 1, name: "林晨", account: "linchen", role: "销售", unit: "华东定制产业带", region: "华东" },
    { id: 2, name: "周扬", account: "zhouyang", role: "销售", unit: "华南定制产业带", region: "华南" },
    { id: 3, name: "陈主管", account: "chen", role: "主管", unit: "华东定制产业带", region: "华东" },
    { id: 4, name: "王区域", account: "wang", role: "区域经理", unit: "全国渠道一部", region: "全国" },
    { id: 5, name: "运营小组", account: "admin", role: "运营", unit: "总部增长运营", region: "全国" }
  ],
  customers: [
    {
      id: 101,
      name: "杭州雅居全屋定制工厂",
      phone: "13800138000",
      stage: "名单",
      owner: "林晨",
      region: "华东",
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
      stage: "线索",
      owner: "周扬",
      region: "华南",
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
      stage: "商机",
      owner: "林晨",
      region: "西南",
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
      stage: "成交",
      owner: "周扬",
      region: "华东",
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
      status: "跟进中",
      latitude: 30.2741,
      longitude: 120.1551,
      city: "杭州市",
      address: "浙江省杭州市",
      owner: "林晨",
      ownerId: 1,
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
    }
    const session = this.getSession();
    if (session && session.user) {
      this.applySessionToState(session.user);
    }
    this.loadRemoteState();
  },

  getState() {
    return wx.getStorageSync(STORAGE_KEY) || seedState;
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
        timeout: options.timeout || 8000,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            reject(new Error(res.data?.error || `请求失败 ${res.statusCode}`));
          }
        },
        fail: (error) => {
          reject(new Error(formatRequestError(error)));
        }
      });
    });
  },

  login(account, password) {
    const local = this.localLogin(account, password);
    if (local) return Promise.resolve(local);
    return this.requestApi("/auth/login", {
      method: "POST",
      data: { account, password }
    }).then((data) => {
      wx.setStorageSync(AUTH_KEY, { token: data.token, user: data.user });
      const remoteState = data.state || this.getState();
      remoteState.currentUserId = data.user.id;
      wx.setStorageSync(STORAGE_KEY, remoteState);
      return data;
    });
  },

  localLogin(account, password) {
    const loginAccount = String(account || "").trim().toLowerCase();
    if (LOCAL_DEMO_PASSWORDS[loginAccount] !== String(password || "")) return null;
    const state = this.getState();
    const user = state.users.find((item) => {
      return [item.account, item.username, item.phone].filter(Boolean).map((value) => String(value).toLowerCase()).includes(loginAccount);
    });
    if (!user) return null;
    const safeUser = { ...user };
    delete safeUser.password;
    const token = `local-${safeUser.id}-${Date.now()}`;
    state.currentUserId = safeUser.id;
    wx.setStorageSync(AUTH_KEY, { token, user: safeUser, mode: "local" });
    wx.setStorageSync(STORAGE_KEY, state);
    return { token, user: safeUser, state };
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
    return wx.getStorageSync(AUTH_KEY) || null;
  },

  isLoggedIn() {
    const session = this.getSession();
    return Boolean(session && session.user && session.user.id);
  },

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
    wx.request({
      url: `${API_BASE}/state?client=mini`,
      method: "GET",
      timeout: 5000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
          const nextState = res.data;
          const session = this.getSession();
          if (session && session.user) nextState.currentUserId = session.user.id;
          wx.setStorageSync(STORAGE_KEY, nextState);
          if (callback) callback(nextState);
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

  canAdmin() {
    return ["主管", "区域经理", "运营", "管理员"].includes(this.getCurrentUser().role);
  }
});
