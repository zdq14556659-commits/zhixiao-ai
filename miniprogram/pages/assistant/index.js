const app = getApp();

Page({
  data: {
    question: "你们软件能不能从设计图直接拆单到开料？我们现在酷家乐出图，后面还要人工算板件。",
    knowledge: [],
    result: null,
    showAdd: false,
    newQuestion: "",
    newAnswer: ""
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

  toggleAdd() {
    this.setData({ showAdd: !this.data.showAdd });
  },

  onNewQuestion(event) {
    this.setData({ newQuestion: event.detail.value });
  },

  onNewAnswer(event) {
    this.setData({ newAnswer: event.detail.value });
  },

  addKnowledge() {
    if (!this.data.newQuestion || !this.data.newAnswer) {
      wx.showToast({ title: "请填写问题和话术", icon: "none" });
      return;
    }
    const item = {
      id: Date.now(),
      question: this.data.newQuestion,
      answer: this.data.newAnswer,
      createdAt: app.globalData.today
    };
    const state = app.getState();
    state.knowledge.unshift(item);
    app.setState(state);
    this.setData({
      knowledge: state.knowledge,
      newQuestion: "",
      newAnswer: "",
      showAdd: false
    });
    wx.showToast({ title: "已添加" });
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
