const app = getApp();

Page({
  data: {
    question: "你们软件能不能从设计图直接拆单到开料？我们现在酷家乐出图，后面还要人工算板件。",
    knowledge: [],
    result: null
  },

  onShow() {
    if (!app.ensureLogin()) return;
    app.loadRemoteState(() => {
      const state = app.getState();
      this.setData({ knowledge: state.knowledge });
    });
  },

  onQuestion(event) {
    this.setData({ question: event.detail.value });
  },

  recommend() {
    if (!this.data.question.trim()) {
      wx.showToast({ title: "请填写客户问题", icon: "none" });
      return;
    }
    wx.showLoading({ title: "小智思考中" });
    wx.request({
      url: `${app.globalData.apiBase}/ai/script`,
      method: "POST",
      header: { "Content-Type": "application/json" },
      data: {
        question: this.data.question,
        user: app.getCurrentUser()
      },
      success: (res) => {
        this.setData({ result: res.data });
      },
      fail: () => {
        const scored = this.data.knowledge
          .map((item) => ({
            ...item,
            score: this.data.question.split(/[，。；\s]+/).filter((word) => word && `${item.question}${item.answer}`.includes(word)).length
          }))
          .sort((a, b) => b.score - a.score);
        this.setData({
          result: {
            source: "fallback",
            matched: scored,
            answer: scored[0] ? scored[0].answer : "建议先让客户提供真实订单，演示从设计、报价、拆单到开料标签的完整流程。"
          }
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  }
});
