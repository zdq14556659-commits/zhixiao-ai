const app = getApp();

function monthDates(month) {
  const [year, number] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10)
  };
}

Page({
  data: {
    loading: true,
    month: "",
    startDate: "",
    endDate: "",
    scopeOptions: [],
    scopeNames: [],
    scopeIndex: 0,
    scopeName: "我的数据",
    summary: {},
    target: {},
    metrics: [],
    funnel: [],
    ranking: [],
    rankingTitle: "销售排名",
    actions: [],
    insights: [],
    drilldowns: {}
  },

  onLoad() {
    const month = app.globalData.today.slice(0, 7);
    const range = monthDates(month);
    this.setData({ month, startDate: range.start, endDate: range.end });
  },

  onShow() {
    if (!app.ensureLogin()) return;
    this.loadDashboard();
  },

  dashboardPath() {
    const scope = this.data.scopeOptions[this.data.scopeIndex] || {};
    const query = [
      `month=${encodeURIComponent(this.data.month)}`,
      `start=${encodeURIComponent(this.data.startDate)}`,
      `end=${encodeURIComponent(this.data.endDate)}`
    ];
    if (scope.type && scope.id) query.push(`scopeType=${encodeURIComponent(scope.type)}`, `scopeId=${encodeURIComponent(scope.id)}`);
    return `/dashboard?${query.join("&")}`;
  },

  async loadDashboard() {
    this.setData({ loading: true });
    try {
      const data = await app.requestApi(this.dashboardPath());
      const scopeOptions = data.scopeOptions || [];
      const selectedKey = `${data.scope.type}:${data.scope.id}`;
      const scopeIndex = Math.max(0, scopeOptions.findIndex((item) => `${item.type}:${item.id}` === selectedKey));
      const summary = data.summary || {};
      this.setData({
        loading: false,
        scopeOptions,
        scopeNames: scopeOptions.map((item) => item.name),
        scopeIndex,
        scopeName: data.scope.name,
        summary,
        target: data.target || {},
        metrics: [
          { key: "revenue", drilldown: "revenue", label: "实际进款", value: app.formatMoney(summary.revenue), hint: data.target?.revenueTarget ? `目标 ${app.formatMoney(data.target.revenueTarget)}` : "未设置目标" },
          { key: "contract", drilldown: "contract", label: "签单金额", value: app.formatMoney(summary.contract), hint: `${summary.deals || 0}家成交` },
          { key: "opportunity", drilldown: "opportunities", label: "转化商机", value: `${summary.opportunities || 0}家`, hint: "完成有效演示" },
          { key: "rate", drilldown: "", label: "目标完成", value: `${summary.targetCompletionRate || 0}%`, hint: `商机成交率 ${summary.opportunityCloseRate || 0}%` }
        ],
        funnel: data.funnel || [],
        ranking: (data.ranking || []).slice(0, 8).map((item) => ({ ...item, revenueText: app.formatMoney(item.revenue) })),
        rankingTitle: data.scope?.type === "company" ? "全公司销售排名" : data.scope?.type === "zone" ? "战区销售排名" : "本单位销售排名",
        actions: data.actions || [],
        drilldowns: data.drilldowns || {},
        insights: data.insights || []
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message || "看板加载失败", icon: "none" });
    }
  },

  onMonth(event) {
    const month = event.detail.value;
    const range = monthDates(month);
    this.setData({ month, startDate: range.start, endDate: range.end }, () => this.loadDashboard());
  },

  onStartDate(event) {
    this.setData({ startDate: event.detail.value }, () => this.loadDashboard());
  },

  onEndDate(event) {
    this.setData({ endDate: event.detail.value }, () => this.loadDashboard());
  },

  onScope(event) {
    this.setData({ scopeIndex: Number(event.detail.value) }, () => this.loadDashboard());
  },

  openAction(event) {
    const action = this.data.actions.find((item) => item.key === event.currentTarget.dataset.key);
    if (!action?.count) return;
    wx.setStorageSync("zhixiao_dashboard_drilldown", {
      stage: "全部",
      customerIds: action.customerIds || []
    });
    wx.switchTab({ url: "/pages/customers/index" });
  },

  openMetric(event) {
    const key = event.currentTarget.dataset.drilldown;
    if (!key) return;
    const customers = this.data.drilldowns[key] || [];
    const stages = [...new Set(customers.map((item) => item.stage).filter(Boolean))];
    wx.setStorageSync("zhixiao_dashboard_drilldown", {
      stage: stages.length === 1 ? stages[0] : "全部",
      customerIds: customers.map((item) => item.id)
    });
    wx.switchTab({ url: "/pages/customers/index" });
  }
});
