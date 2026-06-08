const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const schemaVersion = "whole-house-v3";
const stages = ["名单", "线索", "商机", "成交"];
const stageColors = {
  名单: "#64748b",
  线索: "#2563eb",
  商机: "#f59e0b",
  成交: "#10b981",
};

const API_BASE =
  window.ZHIXIAO_API_BASE ||
  (window.location.protocol === "file:" ? "http://localhost:8787/api" : `${window.location.origin}/api`);

const state = {
  version: schemaVersion,
  currentView: "dashboard",
  currentCustomerStage: "名单",
  role: "主管",
  users: [
    { id: 1, name: "林晨", role: "销售", unit: "华东定制产业带" },
    { id: 2, name: "周扬", role: "销售", unit: "华南定制产业带" },
    { id: 3, name: "陈主管", role: "主管", unit: "华东定制产业带" },
    { id: 4, name: "王区域", role: "区域经理", unit: "全国渠道一部" },
    { id: 5, name: "运营小组", role: "运营", unit: "总部增长运营" },
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
      createdAt: "2026-06-04",
      followUps: [
        { date: "2026-06-04", note: "老板关心设计拆单一体化，现用酷家乐出图后人工算板件。", nextFollow: "2026-06-05" },
      ],
    },
    {
      id: 102,
      name: "佛山柜体门板厂",
      phone: "13900139000",
      stage: "线索",
      owner: "周扬",
      region: "华南",
      amount: 26,
      createdAt: "2026-06-03",
      followUps: [
        { date: "2026-06-04", note: "生产主管确认开料、封边、排产经常脱节，愿意看演示。", nextFollow: "2026-06-04" },
      ],
    },
    {
      id: 103,
      name: "成都整装定制工厂",
      phone: "13600000001",
      stage: "商机",
      owner: "林晨",
      region: "西南",
      amount: 32,
      createdAt: "2026-06-02",
      followUps: [
        { date: "2026-06-03", note: "需要给门墙柜一体化报价、拆单和车间看板试点方案。", nextFollow: "2026-06-03" },
      ],
    },
    {
      id: 104,
      name: "合肥橱柜衣柜智造厂",
      phone: "13700000004",
      stage: "成交",
      owner: "周扬",
      region: "华东",
      amount: 45,
      createdAt: "2026-06-01",
      followUps: [
        { date: "2026-06-04", note: "合同已回传，先上报价、拆单、生产进度看板三模块。", nextFollow: "" },
      ],
    },
    {
      id: 105,
      name: "临沂板式家具加工厂",
      phone: "13500000005",
      stage: "商机",
      owner: "周扬",
      region: "华北",
      amount: 21,
      createdAt: "2026-06-04",
      followUps: [
        { date: "2026-06-04", note: "客户想先解决板材利用率和补单漏单问题。", nextFollow: "2026-06-06" },
      ],
    },
  ],
  activities: [
    { date: "2026-06-04", owner: "林晨", type: "名单", customerId: 101 },
    { date: "2026-06-04", owner: "周扬", type: "线索", customerId: 102 },
    { date: "2026-06-03", owner: "林晨", type: "商机", customerId: 103 },
    { date: "2026-06-04", owner: "周扬", type: "成交", customerId: 104 },
    { date: "2026-06-04", owner: "周扬", type: "商机", customerId: 105 },
  ],
  recordings: [
    {
      id: 1,
      title: "佛山柜体门板厂 08:42",
      text: "客户说现在酷家乐出图以后还要人工拆单，板件清单经常错，车间开料和封边排产也靠微信群沟通。老板愿意看演示，但担心上线影响正在交付的订单。",
    },
    {
      id: 2,
      title: "成都整装定制工厂 14:18",
      text: "客户正在做门墙柜一体化，报价复杂，设计、拆单、生产之间数据断层。希望先从一个样板门店和一条生产线试点，要求能对接现有开料机数据。",
    },
  ],
  visits: [
    { factory: "杭州雅居全屋定制工厂", line: "电子锯 2台 / 封边机 3台 / 六面钻 1台", software: "酷家乐 + Excel 排产", status: "跟进中", x: 70, y: 44 },
    { factory: "合肥橱柜衣柜智造厂", line: "开料中心 1套 / 自动封边 2台", software: "三维家 + 云熙拆单", status: "已成交", x: 63, y: 49 },
    { factory: "佛山柜体门板厂", line: "雕刻机 4台 / 封边机 5台", software: "酷家乐 + 手工报价", status: "待攻克", x: 58, y: 68 },
    { factory: "成都整装定制工厂", line: "柔性生产线 1条 / 六面钻 2台", software: "自研ERP + Excel", status: "跟进中", x: 36, y: 58 },
  ],
  knowledge: [
    {
      question: "设计图能不能直接拆单到开料",
      answer: "可以先按客户当前设计软件确认数据出口，再把柜体结构、五金规则、孔位和封边规则标准化。演示时建议用客户一套真实订单，从设计、报价、拆单、板件清单到开料标签完整跑一遍。",
    },
    {
      question: "上线会不会影响正在交付的订单",
      answer: "建议采用样板门店加样板产线试点，旧订单不强切，新订单先跑双轨验证。第一周梳理规则和物料，第二周跑通报价拆单和车间看板，稳定后再逐步切换。",
    },
    {
      question: "能不能对接开料机封边机和ERP",
      answer: "先确认设备品牌、文件格式和ERP接口方式。常见做法是订单、BOM、板件、工序状态同步，先解决重复录入和进度不可见，再逐步接入设备数据。",
    },
    {
      question: "价格太高",
      answer: "把报价拆成错单返工、板材浪费、延期赔付和管理统计人力四项损耗。用客户月订单量估算回本周期，再给出基础版、生产协同版、集团版三档方案。",
    },
  ],
  resources: [],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function save() {
  localStorage.setItem("zhixiao-ai-state", JSON.stringify(state));
  syncStateToBackend();
}

function load() {
  const cached = localStorage.getItem("zhixiao-ai-state");
  if (!cached) return;
  try {
    const parsed = JSON.parse(cached);
    if (parsed.version !== schemaVersion) {
      localStorage.removeItem("zhixiao-ai-state");
      return;
    }
    Object.assign(state, parsed);
  } catch {
    localStorage.removeItem("zhixiao-ai-state");
  }
}

async function syncStateFromBackend() {
  try {
    const response = await fetch(`${API_BASE}/state`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const backendState = await response.json();
    Object.assign(state, {
      ...backendState,
      version: schemaVersion,
      currentView: state.currentView || "dashboard",
      currentCustomerStage: state.currentCustomerStage || "名单",
      role: state.role || "主管",
    });
    localStorage.setItem("zhixiao-ai-state", JSON.stringify(state));
    render();
    toast("已连接后端数据");
  } catch (error) {
    console.warn("Backend sync failed:", error);
  }
}

async function syncStateToBackend() {
  try {
    await fetch(`${API_BASE}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch (error) {
    console.warn("Backend save failed:", error);
  }
}

function latestFollow(customer) {
  return customer.followUps[customer.followUps.length - 1] || {};
}

function isOverdue(date) {
  return date && date < today;
}

function isToday(date) {
  return date === today;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 2600);
}

function showView(view) {
  state.currentView = view;
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".view").forEach((viewNode) => viewNode.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  const titles = {
    workbench: "工作台",
    dashboard: "CEO管理看板",
    workspace: "客户跟进转化跟踪",
    call: "录音管理",
    funnel: "销售管理",
    field: "地推拜访地图",
    assistant: "AI分析看板",
    admin: "系统管理",
  };
  $("#viewTitle").textContent = titles[view];
  $("#viewCrumb").textContent = titles[view];
  render();
}

function renderRole() {
  const canManage = ["主管", "区域经理", "运营"].includes(state.role);
  $$(".supervisor-only").forEach((node) => node.classList.toggle("hidden", !canManage));
}

function countActivity(type, date = today, owner = "") {
  return state.activities.filter((item) => item.type === type && item.date === date && (!owner || item.owner === owner)).length;
}

function renderMetrics() {
  const signedCustomers = state.customers.filter((customer) => customer.stage === "成交");
  const payment = signedCustomers.reduce((sum, customer) => sum + customer.amount, 0) * 2.8;
  const sales = state.users.filter((user) => user.role === "销售");
  const activeCustomers = state.customers.filter((customer) => latestFollow(customer).date === today).length;
  const best = sales
    .map((user) => ({
      name: user.name,
      score: countActivity("商机", today, user.name) * 2 + countActivity("成交", today, user.name) * 3 + countActivity("线索", today, user.name),
    }))
    .sort((a, b) => b.score - a.score)[0];
  $("#monthlyPayment").textContent = `¥${payment.toFixed(1)}万`;
  $("#monthlyOrders").textContent = `${signedCustomers.length + 24}单`;
  $("#avgCycle").textContent = "18.5天";
  $("#teamSize").textContent = `${state.users.length + 2}人`;
  $("#activeCustomers").textContent = `活跃客户 ${activeCustomers + state.customers.length}个`;
  $("#bestSeller").textContent = `最佳销售：${best?.name || "-"}`;
  $("#paymentProgress").style.width = `${Math.min((payment / 150) * 100, 100)}%`;
}

function renderWorkbench() {
  const todos = state.customers
    .filter((customer) => latestFollow(customer).nextFollow && latestFollow(customer).nextFollow <= today)
    .map((customer) => ({
      title: customer.name,
      text: `${latestFollow(customer).nextFollow} 应跟进：${latestFollow(customer).note}`,
      type: isOverdue(latestFollow(customer).nextFollow) ? "risk" : "hot",
    }));
  $("#todoList").innerHTML = todos.length
    ? todos.map((item) => `<div class="alert-item ${item.type}"><strong>${item.title}</strong><p>${item.text}</p></div>`).join("")
    : `<div class="alert-item"><strong>暂无待办</strong><p>今天没有到期跟进客户。</p></div>`;

  const pipelines = [
    ["电话录音接入", "已接入演示流程", "online"],
    ["微信/企业微信", "合规采集方案待接入", "pending"],
    ["会议/面谈录音", "支持上传转写规划", "pending"],
    ["柜柜软件行为", "设计图、拆单、报价单同步规划", "online"],
  ];
  $("#pipelineList").innerHTML = pipelines
    .map(
      ([name, text, status]) => `
        <div class="pipeline-item">
          <span class="${status}"></span>
          <div><strong>${name}</strong><p>${text}</p></div>
        </div>
      `
    )
    .join("");
}

function renderDashboard() {
  const problemRows = [
    ["跟进转化率偏低", "-12%", "≥ 0%", "线索到商机流失", "严重", "加强线索筛选，优先跟进高意向工厂，减少无效沟通时间。"],
    ["新客户开发速度放缓", "-33%", "≥ 0%", "新增名单不足", "警告", "增加行业展会、产业带扫街和官方资源导入，适当加大转介绍激励。"],
    ["录音覆盖率不足", "58%", "90%", "少 32%", "警告", "销售 App 拨号默认触发录音归档，主管按周抽查未录音客户。"],
    ["话术达标率偏低", "64%", "85%", "少 21%", "严重", "围绕拆单、报价、开料、设备对接四类高频问题训练行业话术。"],
    ["柜柜联动数据不足", "42%", "80%", "少 38%", "警告", "把设计图、拆单记录、报价单自动关联到客户360视图。"],
  ];
  $("#coreProblemRows").innerHTML = problemRows
    .map(
      ([problem, current, baseline, gap, level, advice]) => `
        <tr>
          <td>${problem}</td>
          <td>${current}</td>
          <td>${baseline}</td>
          <td>${gap}</td>
          <td><span class="severity ${level === "严重" ? "danger" : "warn"}">${level}</span></td>
          <td>${advice}</td>
        </tr>
      `
    )
    .join("");

  const overdue = state.customers.filter((customer) => isOverdue(latestFollow(customer).nextFollow));
  const hot = state.customers.filter((customer) => customer.stage === "商机");
  $("#aiAlerts").innerHTML = [
    ...overdue.map((customer) => ({
      title: `${customer.name} 跟进逾期`,
      text: `上次承诺 ${latestFollow(customer).nextFollow} 回访，建议主管介入推进试点方案。`,
      type: "risk",
    })),
    ...hot.map((customer) => ({
      title: `${customer.name} 高意向商机`,
      text: `预计 ${customer.amount}万，重点确认设备对接、样板产线和决策人演示时间。`,
      type: "hot",
    })),
  ]
    .slice(0, 4)
    .map((item) => `<div class="alert-item ${item.type}"><strong>${item.title}</strong><p>${item.text}</p></div>`)
    .join("");

  const regionCounts = state.customers.reduce((map, customer) => {
    map[customer.region] = (map[customer.region] || 0) + 1;
    return map;
  }, {});
  $("#regionRanks").innerHTML = Object.entries(regionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([region, count]) => {
      const width = Math.max(count * 22, 18);
      return `<div class="rank-item"><span>${region}</span><div><i style="width:${width}%"></i></div><strong>${count}</strong></div>`;
    })
    .join("");

  $("#salesRankRows").innerHTML = state.users
    .filter((user) => user.role === "销售")
    .map((user) => {
      const owned = state.customers.filter((customer) => customer.owner === user.name);
      const followCount = owned.reduce((total, customer) => total + customer.followUps.filter((follow) => follow.date === today).length, 0);
      return `
        <tr>
          <td>${user.name}</td>
          <td>${user.unit}</td>
          <td>${countActivity("名单", today, user.name)}</td>
          <td>${countActivity("线索", today, user.name)}</td>
          <td>${countActivity("商机", today, user.name)}</td>
          <td>${followCount}</td>
        </tr>
      `;
    })
    .join("");
}

function renderCustomerManager() {
  if (!$("#customerRows")) return;
  $("#customerStageTabs").innerHTML = stages
    .map((stage) => {
      const count = state.customers.filter((customer) => customer.stage === stage).length;
      return `<button class="stage-tab ${state.currentCustomerStage === stage ? "active" : ""}" data-stage="${stage}">${stage}<span>${count}</span></button>`;
    })
    .join("");

  const rows = filteredCustomers();
  $("#customerStageTitle").textContent = `${state.currentCustomerStage}管理`;
  $("#customerStageSummary").textContent = `共 ${rows.length} 个客户`;
  $("#customerRows").innerHTML = rows.length
    ? rows
        .map((customer) => {
          const follow = latestFollow(customer);
          const nextClass = isOverdue(follow.nextFollow) ? "overdue" : isToday(follow.nextFollow) ? "today" : "";
          return `
            <tr>
              <td><strong>${customer.name}</strong></td>
              <td><a href="tel:${customer.phone}">${formatPhone(customer.phone)}</a></td>
              <td>${customer.owner}</td>
              <td>${customer.region || "待分区"}</td>
              <td>${customer.amount || 0}万</td>
              <td>${customer.createdAt || "-"}</td>
              <td>${follow.date || "-"}</td>
              <td class="${nextClass}">${follow.nextFollow || "未设置"}</td>
              <td>
                <div class="table-actions">
                  <button data-action="follow" data-id="${customer.id}">跟进</button>
                  <button data-action="advance" data-id="${customer.id}">${customer.stage === "成交" ? "查看" : "推进"}</button>
                </div>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="9" class="empty-cell">暂无符合条件的客户</td></tr>`;
}

function filteredCustomers() {
  const keyword = $("#customerKeyword")?.value.trim().toLowerCase() || "";
  const owner = $("#customerOwnerFilter")?.value || "";
  const region = $("#customerRegionFilter")?.value || "";
  const dateType = $("#customerDateType")?.value || "createdAt";
  const startDate = $("#customerStartDate")?.value || "";
  const endDate = $("#customerEndDate")?.value || "";
  const followStatus = $("#customerFollowStatus")?.value || "";

  return state.customers.filter((customer) => {
    const follow = latestFollow(customer);
    const keywordSource = `${customer.name} ${customer.phone} ${customer.region || ""} ${follow.note || ""}`.toLowerCase();
    const dateValue = getCustomerDate(customer, dateType);
    if (customer.stage !== state.currentCustomerStage) return false;
    if (keyword && !keywordSource.includes(keyword)) return false;
    if (owner && customer.owner !== owner) return false;
    if (region && customer.region !== region) return false;
    if (startDate && (!dateValue || dateValue < startDate)) return false;
    if (endDate && (!dateValue || dateValue > endDate)) return false;
    if (followStatus === "today" && follow.nextFollow !== today) return false;
    if (followStatus === "overdue" && !isOverdue(follow.nextFollow)) return false;
    if (followStatus === "none" && follow.nextFollow) return false;
    return true;
  });
}

function getCustomerDate(customer, dateType) {
  const follow = latestFollow(customer);
  if (dateType === "lastFollow") return follow.date || "";
  if (dateType === "nextFollow") return follow.nextFollow || "";
  return customer.createdAt || "";
}

function formatPhone(phone) {
  return phone.replace(/(\d{3})(\d{4})(\d{4})/, "$1 $2 $3");
}

function renderDaily() {
  if (!$("#dailyRows")) return;
  const startDate = $("#dailyStartDate")?.value || today;
  const endDate = $("#dailyEndDate")?.value || today;
  $("#dailyRows").innerHTML = state.users
    .filter((user) => user.role === "销售")
    .map((user) => {
      const owned = state.customers.filter((customer) => customer.owner === user.name);
      const followCount = owned.reduce(
        (total, customer) => total + customer.followUps.filter((follow) => isDateInRange(follow.date, startDate, endDate)).length,
        0
      );
      return `
        <tr>
          <td>${user.name}</td>
          <td>${countActivityInRange("名单", startDate, endDate, user.name)}</td>
          <td>${countActivityInRange("线索", startDate, endDate, user.name)}</td>
          <td>${countActivityInRange("商机", startDate, endDate, user.name)}</td>
          <td>${followCount}</td>
        </tr>
      `;
    })
    .join("");
}

function isDateInRange(date, startDate, endDate) {
  if (!date) return false;
  return (!startDate || date >= startDate) && (!endDate || date <= endDate);
}

function countActivityInRange(type, startDate, endDate, owner = "") {
  return state.activities.filter(
    (item) => item.type === type && isDateInRange(item.date, startDate, endDate) && (!owner || item.owner === owner)
  ).length;
}

function renderSelects() {
  const salesOptions = state.users
    .filter((user) => user.role === "销售")
    .map((user) => `<option>${user.name}</option>`)
    .join("");
  $("#ownerSelect").innerHTML = salesOptions;
  if ($("#batchOwnerSelect")) $("#batchOwnerSelect").innerHTML = salesOptions;
  if ($("#customerOwnerFilter")) {
    $("#customerOwnerFilter").innerHTML = `<option value="">全部</option>${salesOptions}`;
  }
  if ($("#customerRegionFilter")) {
    const regions = [...new Set(state.customers.map((customer) => customer.region).filter(Boolean))];
    $("#customerRegionFilter").innerHTML = `<option value="">全部</option>${regions.map((region) => `<option>${region}</option>`).join("")}`;
  }
  $("#supervisorSelect").innerHTML = state.users
    .filter((user) => ["主管", "区域经理"].includes(user.role))
    .map((user) => `<option>${user.name}</option>`)
    .join("");
}

function openCustomerDialog(customer = null) {
  const form = $("#customerForm");
  form.reset();
  $("#dialogTitle").textContent = customer ? "填写跟进记录" : "新增客户";
  if (customer) {
    form.id.value = customer.id;
    form.name.value = customer.name;
    form.phone.value = customer.phone;
    form.stage.value = customer.stage;
    form.owner.value = customer.owner;
    form.note.value = "";
    form.nextFollow.value = latestFollow(customer).nextFollow || today;
  } else {
    form.id.value = "";
    form.stage.value = state.currentCustomerStage || "名单";
    form.nextFollow.value = today;
  }
  $("#customerDialog").showModal();
}

function saveCustomer(event) {
  event.preventDefault();
  const submitter = event.submitter?.value;
  if (submitter === "cancel") return $("#customerDialog").close();
  const form = new FormData(event.currentTarget);
  const id = Number(form.get("id"));
  const note = String(form.get("note") || "").trim();
  const payload = {
    name: String(form.get("name")).trim(),
    phone: String(form.get("phone")).trim(),
    stage: String(form.get("stage")),
    owner: String(form.get("owner")),
    nextFollow: String(form.get("nextFollow")),
  };
  if (id) {
    const customer = state.customers.find((item) => item.id === id);
    const previousStage = customer.stage;
    Object.assign(customer, payload);
    if (previousStage !== payload.stage) {
      state.activities.push({ date: today, owner: payload.owner, type: payload.stage, customerId: customer.id });
    }
    if (note || payload.nextFollow) {
      customer.followUps.push({ date: today, note: note || "更新了下次跟进时间。", nextFollow: payload.nextFollow });
    }
    toast("跟进记录已保存");
  } else {
    const customer = {
      id: Date.now(),
      name: payload.name,
      phone: payload.phone,
      stage: payload.stage,
      owner: payload.owner,
      region: "待分区",
      amount: 15,
      createdAt: today,
      followUps: [{ date: today, note: note || "新增全屋定制工厂客户。", nextFollow: payload.nextFollow }],
    };
    state.customers.unshift(customer);
    state.activities.push({ date: today, owner: payload.owner, type: payload.stage, customerId: customer.id });
    toast("客户已新增");
  }
  $("#customerDialog").close();
  save();
  render();
}

function advanceCustomer(id) {
  const customer = state.customers.find((item) => item.id === id);
  const index = stages.indexOf(customer.stage);
  if (index >= stages.length - 1) return toast("该客户已成交");
  customer.stage = stages[index + 1];
  customer.followUps.push({ date: today, note: `客户推进至${customer.stage}阶段。`, nextFollow: today });
  state.activities.push({ date: today, owner: customer.owner, type: customer.stage, customerId: customer.id });
  save();
  render();
  toast(`${customer.name} 已推进至${customer.stage}`);
}

function renderCall() {
  $("#recordingSelect").innerHTML = state.recordings
    .map((recording) => `<option value="${recording.id}">${recording.title}</option>`)
    .join("");
  if (!$("#callAnalysis").innerHTML) {
    $("#callAnalysis").innerHTML = `<p class="customer-meta">选择一段录音文本后点击生成分析。</p>`;
  }
}

function analyzeCall() {
  const recording = state.recordings.find((item) => item.id === Number($("#recordingSelect").value));
  const text = recording.text;
  let intent = "中意向";
  if (/演示|试点|样板|老板|愿意/.test(text)) intent = "高意向";
  if (/担心|影响|断层|人工|错/.test(text)) intent += "，存在实施信任阻力";
  $("#callAnalysis").innerHTML = `
    <h3>${intent}</h3>
    <p>${text}</p>
    <ul>
      <li>关键问题：设计拆单、生产排产、设备/ERP 对接、上线风险。</li>
      <li>成交策略：用客户真实订单做演示，先跑报价、拆单、开料标签和车间看板。</li>
      <li>下一步：今天发送样板产线试点计划，约老板和生产主管一起看演示。</li>
    </ul>
  `;
  toast("AI 分析已生成");
}

function renderFunnel() {
  const counts = stages.map((stage) => ({
    stage,
    count: state.customers.filter((customer) => customer.stage === stage).length,
  }));
  const max = Math.max(...counts.map((item) => item.count), 1);
  $("#funnelChart").innerHTML = counts
    .map((item) => {
      const width = Math.max((item.count / max) * 100, 14);
      return `
        <div class="funnel-row">
          <strong>${item.stage}</strong>
          <div class="funnel-bar" style="width:${width}%;background:${stageColors[item.stage]}">${item.count}</div>
          <span>${Math.round((item.count / max) * 100)}%</span>
        </div>
      `;
    })
    .join("");

  const rates = counts.slice(0, -1).map((item, index) => {
    const next = counts[index + 1];
    return {
      name: `${item.stage}→${next.stage}`,
      rate: item.count ? next.count / item.count : 0,
    };
  });
  const weakest = rates.reduce((min, item) => (item.rate < min.rate ? item : min), rates[0]);
  $("#funnelInsights").innerHTML = `
    <div class="insight">
      <h3>薄弱环节</h3>
      <p>${weakest.name} 转化率 ${Math.round(weakest.rate * 100)}%，优先检查是否拿到了工厂产线、现用软件和关键决策人。</p>
    </div>
    <div class="insight">
      <h3>改进计划</h3>
      <p>首访必须记录设备、现用设计软件、拆单方式、订单量和返工痛点，第二次跟进直接给样板订单演示。</p>
    </div>
    <div class="insight">
      <h3>AI 建议</h3>
      <p>把“酷家乐/三维家对接”“开料标签”“板材利用率”“门墙柜报价”做成四套行业话术卡。</p>
    </div>
  `;
}

function renderMap() {
  const canvas = $("#mapCanvas");
  canvas.innerHTML = `
    <div class="map-region" style="left:18%;top:18%;width:34%;height:26%"></div>
    <div class="map-region" style="left:48%;top:22%;width:30%;height:30%"></div>
    <div class="map-region" style="left:30%;top:47%;width:42%;height:28%"></div>
  `;
  state.visits.forEach((visit) => {
    const pin = document.createElement("div");
    pin.className = "map-pin";
    pin.style.left = `${visit.x}%`;
    pin.style.top = `${visit.y}%`;
    pin.style.background = visit.status === "已成交" ? "#10b981" : visit.status === "跟进中" ? "#f59e0b" : "#ef4444";
    pin.innerHTML = `<span>${visit.factory}</span>`;
    canvas.appendChild(pin);
  });
  $("#visitList").innerHTML = state.visits
    .map(
      (visit) => `
        <div class="list-item">
          <strong>${visit.factory}</strong>
          <p class="customer-meta">${visit.line} · ${visit.software}</p>
          <span class="status-pill" style="background:${visit.status === "已成交" ? "#10b98122" : "#f59e0b22"}">${visit.status}</span>
        </div>
      `
    )
    .join("");
}

function submitVisit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.visits.unshift({
    factory: String(data.get("factory")),
    line: String(data.get("line")),
    software: String(data.get("software")),
    status: String(data.get("status")),
    x: 32 + Math.round(Math.random() * 42),
    y: 34 + Math.round(Math.random() * 34),
    date: today,
  });
  save();
  renderMap();
  toast("拜访信息已上传，地图已更新");
}

function locate() {
  if (!navigator.geolocation) return toast("当前浏览器不支持定位");
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      toast("定位成功，正在解析城市地址");
      try {
        const { longitude, latitude } = position.coords;
        const response = await fetch(`${API_BASE}/amap/regeo?longitude=${longitude}&latitude=${latitude}`);
        const result = await response.json();
        toast(result.city ? `定位到 ${result.city}` : "定位成功");
      } catch {
        toast("定位成功，地址解析待后端连接");
      }
    },
    () => toast("无法获取定位，App 端可接入系统定位权限")
  );
}

function scoreKnowledge(question, item) {
  const source = `${item.question} ${item.answer}`;
  return question.split(/[，。；\s]+/).filter((word) => word && source.includes(word)).length;
}

function recommendScript() {
  const question = $("#customerQuestion").value.trim();
  const best = [...state.knowledge].sort((a, b) => scoreKnowledge(question, b) - scoreKnowledge(question, a))[0];
  $("#scriptResult").innerHTML = `
    <h3>推荐话术</h3>
    <p>${best.answer}</p>
    <ul>
      <li>推送方式：App 通知、Web 弹窗、通话页侧边提示。</li>
      <li>关联问题：${best.question}</li>
    </ul>
  `;
  toast("已推送最佳话术");
}

function renderKnowledge() {
  $("#kbList").innerHTML = state.knowledge
    .map(
      (item) => `
        <div class="list-item">
          <strong>${item.question}</strong>
          <p class="customer-meta">${item.answer}</p>
        </div>
      `
    )
    .join("");
}

function addKnowledge(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.knowledge.unshift({
    question: String(data.get("question")),
    answer: String(data.get("answer")),
  });
  event.currentTarget.reset();
  save();
  renderKnowledge();
  toast("知识库已新增");
}

function expandKnowledge() {
  state.knowledge.unshift({
    question: "客户要求看同行全屋定制工厂案例",
    answer: "先匹配同规模工厂案例，展示上线前后错单率、板材利用率、订单准交率和生产进度透明度变化，再安排样板工厂远程交流。",
  });
  save();
  renderKnowledge();
  toast("AI 已根据成功案例扩充知识库");
}

function renderUsers() {
  $("#userRows").innerHTML = state.users
    .map(
      (user) => `
        <tr>
          <td>${user.name}</td>
          <td>${user.role}</td>
          <td>${user.unit}</td>
          <td>${permissions(user.role)}</td>
        </tr>
      `
    )
    .join("");
}

function permissions(role) {
  return {
    销售: "客户跟进、拨号、地推打卡",
    主管: "销售管理、资源分配、日报筛选",
    区域经理: "跨区域看板、漏斗分析",
    运营: "账号管理、官方资源导入、知识库维护",
  }[role];
}

function addUser(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.users.push({
    id: Date.now(),
    name: String(data.get("name")),
    role: String(data.get("role")),
    unit: String(data.get("unit")),
  });
  event.currentTarget.reset();
  save();
  render();
  toast("员工账号已开通");
}

function importResources(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const supervisor = String(data.get("supervisor"));
  const rows = String(data.get("names"))
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  rows.forEach((line) => {
    const [name, phone = ""] = line.split(",").map((item) => item.trim());
    state.resources.unshift({ name, phone, supervisor, assignedTo: "待主管分配" });
  });
  save();
  renderResources();
  toast(`已导入 ${rows.length} 条官方资源`);
}

function batchImportCustomers(event) {
  event.preventDefault();
  const submitter = event.submitter?.value;
  if (submitter === "cancel") return $("#batchImportDialog").close();
  const data = new FormData(event.currentTarget);
  const stage = String(data.get("stage"));
  const owner = String(data.get("owner"));
  const rows = String(data.get("rows"))
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  rows.forEach((line, index) => {
    const [name, phone = "待补充", region = "待分区", amount = "15"] = line.split(/,|，|\t/).map((item) => item.trim());
    const customer = {
      id: Date.now() + index,
      name,
      phone,
      stage,
      owner,
      region,
      amount: Number(amount) || 15,
      createdAt: today,
      followUps: [{ date: today, note: "批量导入客户。", nextFollow: today }],
    };
    state.customers.unshift(customer);
    state.activities.push({ date: today, owner, type: stage, customerId: customer.id });
  });
  state.currentCustomerStage = stage;
  event.currentTarget.reset();
  $("#batchImportDialog").close();
  save();
  render();
  toast(`已批量导入 ${rows.length} 个客户`);
}

function renderResources() {
  $("#resourceList").innerHTML = state.resources
    .map((resource, index) => {
      const salesOptions = state.users
        .filter((user) => user.role === "销售")
        .map((user) => `<option>${user.name}</option>`)
        .join("");
      return `
        <div class="list-item">
          <strong>${resource.name}</strong>
          <p class="customer-meta">${resource.phone || "无手机号"} · 主管：${resource.supervisor} · ${resource.assignedTo}</p>
          <div class="card-actions">
            <select data-resource-owner="${index}">${salesOptions}</select>
            <button data-action="assign-resource" data-index="${index}">${resource.customerId ? "调整分配" : "分配销售"}</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderRoadmap() {
  const roadmap = [
    ["第2周末", "基础架构完成", "开发环境、数据库、API文档"],
    ["第10周末", "MVP上线", "电话录音 + 转写 + 基础CRM，可试点"],
    ["第18周末", "功能完整内测版", "电话 + 微信 + AI分析 + 报表，5-10家试用"],
    ["第22周末", "柜柜深度集成版", "全场景闭环，与三体人联动"],
    ["第26周末", "正式版发布 + 私有化包", "SaaS上线，私有化部署文档"],
  ];
  $("#roadmapRows").innerHTML = roadmap
    .map(([time, milestone, deliverable]) => `<tr><td>${time}</td><td>${milestone}</td><td>${deliverable}</td></tr>`)
    .join("");

  const architecture = [
    ["前端", "Vue3 + Element Plus", "Web 管理端"],
    ["移动端", "微信小程序 + Flutter", "销售端 App"],
    ["后端", "Java Spring Boot / Go", "高并发支撑"],
    ["数据库", "MySQL + Redis + ES", "业务、缓存、搜索分析"],
    ["录音存储", "OSS / 私有对象存储", "录音与附件归档"],
    ["AI引擎", "ASR + 通义千问/GPT", "转写、意图、情绪、话术"],
    ["消息队列", "RocketMQ / Kafka", "录音转写异步任务"],
    ["容器化", "Docker + K8s", "私有化部署"],
  ];
  $("#architectureGrid").innerHTML = architecture
    .map(
      ([layer, stack, desc]) => `
        <div class="architecture-item">
          <span>${layer}</span>
          <strong>${stack}</strong>
          <p>${desc}</p>
        </div>
      `
    )
    .join("");
}

function assignResource(index) {
  const select = document.querySelector(`[data-resource-owner="${index}"]`);
  const resource = state.resources[index];
  if (!resource || !select) return;
  resource.assignedTo = select.value;
  const existingCustomer = state.customers.find((customer) => customer.id === resource.customerId);
  if (existingCustomer) {
    existingCustomer.owner = select.value;
    existingCustomer.followUps.push({ date: today, note: `官方资源调整分配给 ${select.value}。`, nextFollow: today });
  } else {
    const customer = {
      id: Date.now(),
      name: resource.name,
      phone: resource.phone || "待补充",
      stage: "名单",
      owner: select.value,
      region: "待分区",
      amount: 15,
      createdAt: today,
      followUps: [{ date: today, note: `主管分配官方资源，来源主管：${resource.supervisor}。`, nextFollow: today }],
    };
    state.customers.unshift(customer);
    resource.customerId = customer.id;
    state.activities.push({ date: today, owner: select.value, type: "名单", customerId: customer.id });
  }
  save();
  render();
  toast(`${resource.name} 已分配给 ${select.value}`);
}

function exportDaily() {
  const rows = [...$("#dailyRows").querySelectorAll("tr")].map((row) =>
    [...row.children].map((cell) => cell.textContent).join(",")
  );
  const csv = ["销售,录入名单,新增线索,新增商机,跟进记录", ...rows].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `智销AI销售日报-${$("#dailyStartDate")?.value || today}_${$("#dailyEndDate")?.value || today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function render() {
  renderRole();
  renderSelects();
  renderMetrics();
  renderWorkbench();
  renderDashboard();
  renderCustomerManager();
  renderDaily();
  renderCall();
  renderFunnel();
  renderMap();
  renderKnowledge();
  renderUsers();
  renderResources();
  renderRoadmap();
}

function wireEvents() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  $("#roleSelect").addEventListener("change", (event) => {
    state.role = event.target.value;
    save();
    renderRole();
  });
  $("#newCustomerBtn").addEventListener("click", () => openCustomerDialog());
  $("#singleAddBtn")?.addEventListener("click", () => openCustomerDialog());
  $("#batchImportBtn")?.addEventListener("click", () => {
    $("#batchStageSelect").value = state.currentCustomerStage;
    $("#batchImportDialog").showModal();
  });
  $("#customerForm").addEventListener("submit", saveCustomer);
  $("#batchImportForm")?.addEventListener("submit", batchImportCustomers);
  $("#customerStageTabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    state.currentCustomerStage = button.dataset.stage;
    save();
    renderCustomerManager();
  });
  $("#customerRows")?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === "follow") openCustomerDialog(state.customers.find((item) => item.id === id));
    if (button.dataset.action === "advance") advanceCustomer(id);
  });
  $("#applyCustomerFilters")?.addEventListener("click", renderCustomerManager);
  $("#resetCustomerFilters")?.addEventListener("click", () => {
    ["customerKeyword", "customerOwnerFilter", "customerRegionFilter", "customerStartDate", "customerEndDate", "customerFollowStatus"].forEach((id) => {
      const node = $(`#${id}`);
      if (node) node.value = "";
    });
    $("#customerDateType").value = "createdAt";
    renderCustomerManager();
  });
  ["customerKeyword", "customerOwnerFilter", "customerRegionFilter", "customerDateType", "customerStartDate", "customerEndDate", "customerFollowStatus"].forEach((id) => {
    $(`#${id}`)?.addEventListener("change", renderCustomerManager);
  });
  $("#dailyStartDate")?.addEventListener("change", renderDaily);
  $("#dailyEndDate")?.addEventListener("change", renderDaily);
  $("#exportDailyBtn").addEventListener("click", exportDaily);
  $("#analyzeCallBtn").addEventListener("click", analyzeCall);
  $("#startCallBtn").addEventListener("click", () => toast("已唤起拨号；自动录音需 App 原生权限接入"));
  $("#visitForm").addEventListener("submit", submitVisit);
  $("#locateBtn").addEventListener("click", locate);
  $("#recommendScriptBtn").addEventListener("click", recommendScript);
  $("#knowledgeForm").addEventListener("submit", addKnowledge);
  $("#expandKbBtn").addEventListener("click", expandKnowledge);
  $("#userForm").addEventListener("submit", addUser);
  $("#resourceForm").addEventListener("submit", importResources);
  $("#resourceList").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button?.dataset.action === "assign-resource") assignResource(Number(button.dataset.index));
  });

  let deferredPrompt;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });
  $("#installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return toast("浏览器暂未开放安装入口，可在地址栏菜单中安装应用");
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });
}

load();
wireEvents();
render();
syncStateFromBackend();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
