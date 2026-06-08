const app = getApp();

Page({
  data: {
    scopeName: "我的",
    payment: "0.0",
    paymentRate: 0,
    orders: 0,
    bestSeller: "-",
    teamSize: 0,
    activeCount: 0,
    problems: [],
    alerts: []
  },

  onShow() {
    if (!app.ensureLogin()) return;
    app.loadRemoteState(() => this.loadDashboard());
  },

  loadDashboard() {
    const state = app.getState();
    const currentUser = app.getCurrentUser();
    const isSales = currentUser.role === "销售";
    const customers = isSales
      ? state.customers.filter((item) => item.ownerId === currentUser.id || item.owner === currentUser.name)
      : state.customers;
    const signed = customers.filter((item) => item.stage === "成交");
    const payment = signed.reduce((sum, item) => sum + Number(item.amount || 0), 0) * 2.8;
    const sales = state.users.filter((user) => user.role === "销售");
    const best = sales
      .map((user) => ({
        name: user.name,
        score: state.customers.filter((customer) => (customer.ownerId === user.id || customer.owner === user.name) && ["商机", "成交"].includes(customer.stage)).length
      }))
      .sort((a, b) => b.score - a.score)[0];
    const alerts = customers
      .filter((item) => item.stage === "商机" || (item.nextFollow && item.nextFollow < app.globalData.today))
      .slice(0, 4)
      .map((item) => ({
        title: item.nextFollow && item.nextFollow < app.globalData.today ? `${item.name} 跟进逾期` : `${item.name} 高意向商机`,
        text: `预计${item.amount}万，重点确认设备对接、样板产线和老板演示时间。`
      }));

    this.setData({
      scopeName: isSales ? `${currentUser.name}的数据` : "团队数据",
      payment: payment.toFixed(1),
      paymentRate: Math.min(Math.round((payment / 150) * 100), 100),
      orders: signed.length,
      bestSeller: isSales ? currentUser.name : best ? best.name : "-",
      teamSize: isSales ? 1 : state.users.length,
      activeCount: customers.filter((item) => item.lastFollow === app.globalData.today).length,
      problems: this.buildProblems(customers, isSales),
      alerts
    });
  },

  buildProblems(customers, isSales) {
    const lists = customers.filter((item) => item.stage === "名单").length;
    const leads = customers.filter((item) => item.stage === "线索").length;
    const deals = customers.filter((item) => item.stage === "商机").length;
    const overdue = customers.filter((item) => item.nextFollow && item.nextFollow < app.globalData.today).length;
    const noSoftware = customers.filter((item) => !item.software || item.software === "待补充").length;
    return [
      {
        name: isSales ? "我的逾期跟进" : "团队逾期跟进",
        current: `${overdue}个`,
        base: "0个",
        gap: overdue ? "需立即处理" : "正常",
        level: overdue ? "严重" : "警告",
        advice: overdue ? "小智建议先处理逾期商机，再跟进今日到期线索。" : "保持当前跟进节奏，今日新增客户要设置下次跟进时间。"
      },
      {
        name: "名单转线索不足",
        current: `${lists}个名单`,
        base: "每日清理",
        gap: leads < lists ? "待筛选" : "正常",
        level: leads < lists ? "警告" : "警告",
        advice: "优先筛选有设计拆单、报价、开料排产痛点的全屋定制工厂。"
      },
      {
        name: "商机推进压力",
        current: `${deals}个商机`,
        base: "每个商机有下一步",
        gap: deals ? "需推进" : "需补商机",
        level: deals ? "警告" : "严重",
        advice: "对商机客户安排老板、设计主管、生产主管一起看真实订单演示。"
      },
      {
        name: "客户资料不完整",
        current: `${noSoftware}个`,
        base: "0个",
        gap: "现用软件缺失",
        level: noSoftware ? "警告" : "警告",
        advice: "拜访时必须补充现用软件、设备、生产线和照片，方便判断市场占有率。"
      }
    ];
  }
});
