const API_BASE =
  window.ZHIXIAO_API_BASE ||
  (window.location.protocol === "file:" ? "http://127.0.0.1:8787/api" : `${window.location.origin}/api`);
const AUTH_KEY = "zhixiao-web-auth";
const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const stages = ["名单", "线索", "商机", "成交"];
const channelSources = ["自媒体", "官网留言", "自主注册", "渠道介绍", "企查查", "客源汇", "公众号", "地推", "其他"];
const zones = ["东部战区", "南部战区", "西部战区", "北部战区", "中部战区"];
const scopeLabels = { self: "仅本人客户", unit: "本单位客户", zone: "本战区客户", all: "全部客户" };
const permissionLabels = { dashboard: "看板", customers: "客户管理", field: "地推地图", assistant: "AI话术", admin: "系统设置" };
const defaultRoles = [
  { id: "role-owner", name: "总负责人", customerScope: "all", permissions: ["dashboard", "customers", "field", "assistant", "admin"] },
  { id: "role-region", name: "区域经理", customerScope: "zone", permissions: ["dashboard", "customers", "field", "assistant"] },
  { id: "role-supervisor", name: "主管", customerScope: "unit", permissions: ["dashboard", "customers", "field", "assistant"] },
  { id: "role-sales", name: "销售", customerScope: "self", permissions: ["dashboard", "customers", "field", "assistant"] },
  { id: "role-ops", name: "运营", customerScope: "all", permissions: ["dashboard", "customers", "field", "assistant", "admin"] },
  { id: "role-admin", name: "管理员", customerScope: "all", permissions: ["dashboard", "customers", "field", "assistant", "admin"] }
];

let state = { users: [], customers: [], visits: [], knowledge: [], stages, roles: defaultRoles, units: [] };
let currentStage = "名单";
let currentView = "dashboard";
let currentSettingsTab = "accounts";
let fieldMap = null;
let fieldLayer = null;
let fieldInfoWindow = null;
let fieldUserMarker = null;
let fieldUserLocated = false;
let fieldLocationRequested = false;
let currentCustomerRows = [];
let currentFilteredCustomerRows = [];
let selectedCustomerIds = new Set();
let customerPage = 1;
let customerPageSize = 10;
let dashboardData = null;
let dashboardRequestId = 0;
let targetManagement = { options: [], targets: [] };
let dashboardDrilldownIds = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function session() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

function setSession(data) {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.setItem(AUTH_KEY, JSON.stringify({ ...data, loginAt: Date.now() }));
}

function currentUser() {
  const active = session()?.user;
  if (!active) return {};
  return state.users.find((user) => user.id === active.id) || active;
}

function userByName(name) {
  return state.users.find((user) => user.name === name) || {};
}

function ownsRecord(record, user) {
  return record.ownerId === user.id || record.owner === user.name;
}

function roles() {
  return state.roles && state.roles.length ? state.roles : defaultRoles;
}

function roleForUser(user = {}) {
  return roles().find((role) => role.id === user.roleId) || roles().find((role) => role.name === user.role) || defaultRoles.find((role) => role.name === "销售");
}

function hasPermission(user, permission) {
  return (roleForUser(user).permissions || []).includes(permission);
}

function unitForId(unitId) {
  return (state.units || []).find((unit) => unit.id === unitId) || {};
}

function unitForUser(user = {}) {
  return unitForId(user.unitId) || {};
}

function recordOwner(record = {}) {
  return state.users.find((user) => user.id === record.ownerId) || state.users.find((user) => user.name === record.owner) || {};
}

function canSeeRecord(record = {}, user = currentUser()) {
  const role = roleForUser(user);
  if (role.customerScope === "all") return true;
  if (ownsRecord(record, user)) return true;
  const owner = recordOwner(record);
  const unitId = record.unitId || owner.unitId;
  const zone = record.zone || owner.zone;
  if (role.customerScope === "zone") return zone && zone === user.zone;
  if (role.customerScope === "unit") return unitId && unitId === user.unitId;
  return false;
}

function visibleUsers() {
  const user = currentUser();
  const role = roleForUser(user);
  if (role.customerScope === "all") return state.users;
  return state.users.filter((item) => {
    if (item.id === user.id) return true;
    if (role.customerScope === "zone") return item.zone === user.zone;
    if (role.customerScope === "unit") return item.unitId === user.unitId;
    return false;
  });
}

function visibleSales() {
  return visibleUsers().filter((user) => roleForUser(user).name === "销售" || user.role === "销售");
}

function latestFollow(customer = {}) {
  return customer.lastFollow || customer.createdAt || "";
}

function ownershipLabel(customer = {}) {
  if (customer.ownershipStatus === "claimable") return "可认领";
  if (customer.ownershipStatus === "pending_followup") return `待有效跟进 · ${customer.claimDaysRemaining || 0}天`;
  return "";
}

function stageTimeConfig(stage = currentStage) {
  if (stage === "全部") return { label: "阶段时间", field: "createdAt" };
  if (stage === "名单") return { label: "录入时间", field: "createdAt" };
  if (stage === "成交") return { label: "成交时间", field: "dealAt" };
  return { label: "转化时间", field: stage === "商机" ? "opportunityAt" : "leadAt" };
}

function customerStageTime(customer = {}, stage = currentStage) {
  const config = stageTimeConfig(stage === "全部" ? customer.stage : stage);
  return String(customer[config.field] || "").slice(0, 10);
}

function optionList(label, values) {
  const options = [...new Set(values.filter(Boolean))];
  return `<option value="">${label}</option>${options.map((value) => `<option>${escapeHtml(value)}</option>`).join("")}`;
}

function normalizeChannelSource(value) {
  const text = String(value || "").trim();
  if (channelSources.includes(text)) return text;
  const aliases = { 官方资源: "官网留言", 官网: "官网留言", 网站留言: "官网留言", 官网注册: "自主注册", 注册: "自主注册", 转介绍: "渠道介绍", 介绍: "渠道介绍", 企查: "企查查", 微信公众号: "公众号", 手动录入: "其他", 批量导入: "其他", 展会: "其他" };
  return aliases[text] || "其他";
}

function inDateRange(value, start, end) {
  if (start && (!value || value < start)) return false;
  if (end && (!value || value > end)) return false;
  return true;
}

function canAssignCustomers() {
  const role = roleForUser(currentUser());
  return role.customerScope !== "self" || canAdmin();
}

function daysSince(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.parse(today) - time) / (24 * 60 * 60 * 1000));
}

function isCustomerAssignable(customer = {}) {
  if (customer.stage === "名单") return true;
  if (!["线索", "商机"].includes(customer.stage)) return false;
  const latest = latestFollow(customer);
  return !latest || daysSince(latest) > 30;
}

async function api(path, options = {}) {
  const active = session();
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (active?.token) headers.Authorization = `Bearer ${active.token}`;
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (response.status === 401) {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
    requireLogin();
  }
  if (!response.ok) {
    const error = new Error(data.error || `请求失败 ${response.status}`);
    error.code = data.code || "";
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2400);
}

function setFormSubmitting(form, submitting, loadingText) {
  const button = form.querySelector("button[type='submit']");
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = submitting;
  button.textContent = submitting ? loadingText : button.dataset.label;
}

function showSuccessFeedback(title, detail) {
  $("#successDialogTitle").textContent = title;
  $("#successDialogDetail").textContent = detail;
  const link = $("#successDialogLink");
  if (link) {
    link.hidden = true;
    link.removeAttribute("href");
  }
  const dialog = $("#successDialog");
  if (!dialog.open) dialog.showModal();
}

function showImportFeedback(result) {
  showSuccessFeedback(
    "导入完成",
    `共 ${result.total || 0} 行，成功 ${result.imported || 0} 行，重复 ${result.duplicates || 0} 行，失败 ${result.failed || 0} 行。`
  );
  const link = $("#successDialogLink");
  if (link && result.reportUrl) {
    link.href = result.reportUrl.startsWith("http") ? result.reportUrl : `${window.location.origin}${result.reportUrl}`;
    link.hidden = false;
  }
}

async function loadState() {
  state = await api("/state?client=mini");
  render();
}

async function saveState() {
  await api("/state", { method: "PUT", body: state });
}

function requireLogin() {
  const active = session();
  $("#loginScreen").classList.toggle("hidden", Boolean(active?.user));
  $("#appShell").classList.toggle("hidden", !active?.user);
  return Boolean(active?.user);
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: { account: form.get("account"), password: form.get("password") }
    });
    setSession({ token: data.token, user: data.user });
    state = data.state || state;
    requireLogin();
    await loadState();
    toast("登录成功");
    if (data.user?.passwordChangeRecommended) {
      $("#passwordReminderDialog").showModal();
    }
  } catch (error) {
    toast(error.message || "登录失败");
  }
}

function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_KEY);
  requireLogin();
}

function openChangePasswordDialog() {
  const form = $("#changePasswordForm");
  form.reset();
  $("#changePasswordDialog").showModal();
}

async function changePassword(event) {
  event.preventDefault();
  const formNode = event.currentTarget;
  const form = new FormData(formNode);
  const currentPassword = String(form.get("currentPassword") || "");
  const newPassword = String(form.get("newPassword") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  if (newPassword.length < 6) return toast("新密码至少6位");
  if (newPassword !== confirmPassword) return toast("两次输入的新密码不一致");
  setFormSubmitting(formNode, true, "修改中...");
  try {
    await api("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
    $("#changePasswordDialog").close();
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
    requireLogin();
    showSuccessFeedback("密码修改成功", "请使用新密码重新登录，其他设备上的旧登录也已失效。");
  } catch (error) {
    toast(error.message || "密码修改失败");
  } finally {
    setFormSubmitting(formNode, false, "修改中...");
  }
}

function openResetPasswordDialog(id) {
  const user = state.users.find((item) => Number(item.id) === Number(id));
  if (!user) return;
  const form = $("#resetPasswordForm");
  form.reset();
  form.elements.userId.value = user.id;
  $("#resetPasswordSummary").textContent = `为 ${user.name} 设置新密码。重置后该员工需要重新登录。`;
  $("#resetPasswordDialog").showModal();
}

async function resetPassword(event) {
  event.preventDefault();
  const formNode = event.currentTarget;
  const form = new FormData(formNode);
  const userId = Number(form.get("userId"));
  const newPassword = String(form.get("newPassword") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");
  if (newPassword.length < 6) return toast("新密码至少6位");
  if (newPassword !== confirmPassword) return toast("两次输入的新密码不一致");
  setFormSubmitting(formNode, true, "重置中...");
  try {
    await api(`/users/${userId}/password`, { method: "PUT", body: { newPassword } });
    $("#resetPasswordDialog").close();
    await loadState();
    showSuccessFeedback("密码已重置", "该员工需要使用新密码重新登录，并会收到修改密码提醒。");
  } catch (error) {
    toast(error.message || "密码重置失败");
  } finally {
    setFormSubmitting(formNode, false, "重置中...");
  }
}

function scopeCustomers() {
  const user = currentUser();
  return (state.customers || []).filter((item) => canSeeRecord(item, user));
}

function scopeVisits() {
  const user = currentUser();
  return (state.visits || []).filter((item) => canSeeRecord(item, user));
}

function canAdmin() {
  return hasPermission(currentUser(), "admin");
}

function formatFollowTime(item = {}) {
  if (item.createdAt) {
    const time = new Date(item.createdAt);
    if (!Number.isNaN(time.getTime())) {
      return time.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
    }
  }
  return item.date || "时间未记录";
}

function switchView(view) {
  currentView = view;
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".view").forEach((item) => item.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  const titles = { dashboard: "看板", customers: "客户管理", field: "地推地图", assistant: "AI话术", settings: "系统设置" };
  $("#viewTitle").textContent = titles[view];
  $("#viewCrumb").textContent = titles[view];
  render();
}

function render() {
  if (!requireLogin()) return;
  const user = currentUser();
  $("#currentUserText").textContent = `${user.name || "用户"} · ${user.role || ""}`;
  $$(".admin-only").forEach((node) => node.classList.toggle("hidden", !canAdmin()));
  if (currentView === "settings" && !canAdmin()) switchView("dashboard");
  renderDashboard();
  renderCustomers();
  renderField();
  renderAssistant();
  renderAdmin();
}

function formatMoney(value) {
  return `¥${Number(value || 0).toFixed(1)}万`;
}

function monthDates(month) {
  const normalized = /^\d{4}-\d{2}$/.test(month || "") ? month : today.slice(0, 7);
  const [year, number] = normalized.split("-").map(Number);
  const end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  return { start: `${normalized}-01`, end };
}

function dashboardQuery() {
  const scope = String($("#dashboardScope")?.value || "").split(":");
  const params = new URLSearchParams({
    month: $("#dashboardMonth")?.value || today.slice(0, 7),
    start: $("#dashboardStart")?.value || monthDates(today.slice(0, 7)).start,
    end: $("#dashboardEnd")?.value || monthDates(today.slice(0, 7)).end
  });
  if (scope.length === 2) {
    params.set("scopeType", scope[0]);
    params.set("scopeId", scope[1]);
  }
  return params;
}

async function renderDashboard() {
  const requestId = ++dashboardRequestId;
  try {
    const data = await api(`/dashboard?${dashboardQuery().toString()}`);
    if (requestId !== dashboardRequestId) return;
    dashboardData = data;
    const scopeSelect = $("#dashboardScope");
    const selected = `${data.scope.type}:${data.scope.id}`;
    scopeSelect.innerHTML = data.scopeOptions.map((item) => `<option value="${escapeHtml(`${item.type}:${item.id}`)}">${escapeHtml(item.name)}</option>`).join("");
    scopeSelect.value = selected;
    $("#targetSettingsBtn").classList.toggle("hidden", !data.canManageTargets);
    renderDashboardSummary(data);
  } catch (error) {
    if (requestId !== dashboardRequestId) return;
    $("#dashboardInsights").innerHTML = `<div class="dashboard-loading">${escapeHtml(error.message || "看板加载失败")}</div>`;
  }
}

function renderDashboardSummary(data) {
  const { summary, target } = data;
  $("#metricRevenue").textContent = formatMoney(summary.revenue);
  $("#metricContract").textContent = formatMoney(summary.contract);
  $("#metricDeals").textContent = `${summary.deals}家`;
  $("#metricTargetRate").textContent = `${summary.targetCompletionRate}%`;
  $("#metricLists").textContent = `${summary.lists}家`;
  $("#metricOpportunities").textContent = `${summary.opportunities}家`;
  $("#metricCloseRate").textContent = `${summary.opportunityCloseRate}%`;
  $("#metricOverdueOpportunities").textContent = `${summary.overdueOpportunities}家`;
  $("#metricRevenueHint").textContent = target.revenueTarget ? `目标 ${formatMoney(target.revenueTarget)}` : "按进款日期统计";
  $("#metricTargetHint").textContent = target.revenueTarget ? `${target.source === "aggregate" ? "下级目标汇总" : "当前范围目标"} ${formatMoney(target.revenueTarget)}` : "本月未设置目标";
  $("#metricDealHint").textContent = `平均周期 ${summary.averageDealCycle}天 · 客单 ${formatMoney(summary.averageContractValue)}`;

  const maxFunnel = Math.max(...data.funnel.map((item) => item.count), 1);
  $("#dashboardFunnel").innerHTML = data.funnel.map((item) => `
    <div class="dashboard-funnel-row" data-stage="${escapeHtml(item.stage)}">
      <b>${escapeHtml(item.stage)}</b>
      <div class="funnel-track"><i style="width:${Math.max((item.count / maxFunnel) * 100, item.count ? 7 : 0)}%"></i></div>
      <span>${item.count}家</span>
      <span>${item.stage === "成交" ? "-" : `转化${item.conversionRate}%`}</span>
      <span class="hide-mobile">停留${item.averageStayDays}天</span>
      <span class="hide-mobile">超期${item.overdue}家</span>
    </div>`).join("");

  $("#dashboardActions").innerHTML = data.actions.map((item) => `
    <button class="action-item ${["overdue", "paymentPending"].includes(item.key) && item.count ? "is-alert" : ""}" data-action-key="${item.key}" ${item.count ? "" : "disabled"}>
      <span>${escapeHtml(item.label)}</span><strong>${item.count}</strong><small>${item.customers[0] ? escapeHtml(`${item.customers[0].name}${item.count > 1 ? `等${item.count}家` : ""}`) : "暂无待处理客户"}</small>
    </button>`).join("");

  const maxTrend = Math.max(...data.trend.flatMap((item) => [item.revenue, item.contract]), 1);
  $("#dashboardTrend").innerHTML = `<div class="trend-columns">${data.trend.map((item) => `
    <div class="trend-column" title="${escapeHtml(item.label)}：签单${item.contract}万，进款${item.revenue}万">
      <div class="trend-bars"><i class="trend-bar contract" style="height:${Math.max((item.contract / maxTrend) * 100, item.contract ? 3 : 0)}%"></i><i class="trend-bar" style="height:${Math.max((item.revenue / maxTrend) * 100, item.revenue ? 3 : 0)}%"></i></div>
      <small>${escapeHtml(item.label)}</small>
    </div>`).join("")}</div><div class="trend-legend"><span><i class="contract"></i>签单</span><span><i></i>进款</span></div>`;

  $("#dashboardRanking").innerHTML = data.ranking.length ? data.ranking.map((item, index) => `
    <tr class="${Number(item.userId) === Number(currentUser().id) ? "is-current" : ""}">
      <td class="rank-number">${index + 1}</td><td><b>${escapeHtml(item.name)}</b></td><td>${escapeHtml(item.unit)}</td><td>${formatMoney(item.revenue)}</td><td>${item.completionRate}%</td><td>${item.deals}家</td><td>${item.conversionRate}%</td><td>${item.onTimeRate}%</td><td class="${item.overdue ? "danger" : ""}">${item.overdue}</td>
    </tr>`).join("") : '<tr><td colspan="9" class="empty">暂无销售数据</td></tr>';

  $("#dashboardUnitRankingPanel").classList.toggle("hidden", !data.unitRanking?.length);
  $("#dashboardUnitRanking").innerHTML = (data.unitRanking || []).map((item, index) => `
    <tr>
      <td class="rank-number">${index + 1}</td><td><b>${escapeHtml(item.name)}</b></td><td>${escapeHtml(item.zone)}</td><td>${formatMoney(item.revenue)}</td><td>${item.completionRate}%</td><td>${item.deals}家</td><td>${item.opportunities}家</td><td>${item.conversionRate}%</td><td class="${item.overdue ? "danger" : ""}">${item.overdue}</td>
    </tr>`).join("");

  $("#profileCompleteness").textContent = `资料完整率 ${data.industry.profileCompleteness}%`;
  const analysisBlock = (title, items) => `<div class="analysis-block"><h3>${title}</h3><div class="analysis-list">${items.length ? items.map((item) => `<div><b>${escapeHtml(item.name)}</b><span>${item.count}家</span></div>`).join("") : '<div><b>暂无数据</b><span>-</span></div>'}</div></div>`;
  $("#dashboardIndustry").innerHTML = [
    analysisBlock("现用软件", data.industry.software),
    analysisBlock("设备品牌", data.industry.equipmentBrands),
    analysisBlock("未成交原因", data.industry.lossReasons),
    analysisBlock("地推城市", data.industry.cities)
  ].join("");
  $("#dashboardInsights").innerHTML = data.insights.map((item) => `<article class="insight-item"><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.detail)}</p></article>`).join("");
}

function renderCustomers() {
  const customers = scopeCustomers();
  const stageTime = stageTimeConfig();
  const currentFilters = {
    channel: $("#channelFilter")?.value || "",
    createdBy: $("#createdByFilter")?.value || "",
    followPerson: $("#followPersonFilter")?.value || "",
    unit: $("#unitFilter")?.value || ""
  };
  $("#stageTabs").innerHTML = stages
    .map((stage) => `<button class="${currentStage === stage ? "active" : ""}" data-stage="${stage}">${stage}<span>${customers.filter((item) => item.stage === stage).length}</span></button>`)
    .join("");

  const ownerOptions = visibleSales();
  $("#channelFilter").innerHTML = optionList("全部渠道来源", channelSources);
  $("#createdByFilter").innerHTML = optionList("全部录入人", customers.map((item) => item.createdBy));
  $("#followPersonFilter").innerHTML = `${roleForUser(currentUser()).customerScope === "self" ? "" : '<option value="">全部跟进人</option>'}${ownerOptions.map((user) => `<option>${escapeHtml(user.name)}</option>`).join("")}`;
  $("#unitFilter").innerHTML = optionList("全部单位", customers.map((item) => item.unit));
  $("#channelFilter").value = currentFilters.channel;
  $("#createdByFilter").value = currentFilters.createdBy;
  $("#followPersonFilter").value = currentFilters.followPerson;
  $("#unitFilter").value = currentFilters.unit;
  $("#customerOwnerSelect").innerHTML = ownerOptions.map((user) => `<option>${user.name}</option>`).join("");
  const paymentOwners = roleForUser(currentUser()).customerScope === "self" ? [currentUser()] : visibleUsers();
  $("#paymentOwnerSelect").innerHTML = paymentOwners.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  $("#batchOwnerSelect").innerHTML = ownerOptions.map((user) => `<option>${user.name}</option>`).join("");
  $("#assignOwnerSelect").innerHTML = ownerOptions.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  $("#customerStageSelect").innerHTML = stages.map((stage) => `<option>${stage}</option>`).join("");
  $("#customerChannelSelect").innerHTML = channelSources.map((source) => `<option>${source}</option>`).join("");
  $("#batchAssignBtn").classList.toggle("hidden", !canAssignCustomers());
  $("#stageTimeHeader").textContent = stageTime.label;
  $("#stageTimeFilterLabel").textContent = stageTime.label;

  const keyword = $("#customerKeyword").value.trim().toLowerCase();
  const channel = $("#channelFilter").value;
  const createdBy = $("#createdByFilter").value;
  const followPerson = $("#followPersonFilter").value;
  const unit = $("#unitFilter").value;
  const stageStart = $("#stageTimeStart").value;
  const stageEnd = $("#stageTimeEnd").value;
  const lastStart = $("#lastFollowStart").value;
  const lastEnd = $("#lastFollowEnd").value;
  const nextStart = $("#nextFollowStart").value;
  const nextEnd = $("#nextFollowEnd").value;
  const filteredRows = customers.filter((item) => {
    const source = `${item.name} ${item.phone}`.toLowerCase();
    if (dashboardDrilldownIds && !dashboardDrilldownIds.has(Number(item.id))) return false;
    if (currentStage !== "全部" && item.stage !== currentStage) return false;
    if (keyword && !source.includes(keyword)) return false;
    if (channel && normalizeChannelSource(item.channelSource) !== channel) return false;
    if (createdBy && item.createdBy !== createdBy) return false;
    if (followPerson && (item.followPerson || item.owner) !== followPerson) return false;
    if (unit && item.unit !== unit) return false;
    if (!inDateRange(customerStageTime(item), stageStart, stageEnd)) return false;
    if (!inDateRange(latestFollow(item), lastStart, lastEnd)) return false;
    if (!inDateRange(item.nextFollow || "", nextStart, nextEnd)) return false;
    return true;
  });
  currentFilteredCustomerRows = filteredRows;
  $("#customerResultCount").textContent = `${dashboardDrilldownIds ? "看板下钻 · " : ""}当前${currentStage}：${filteredRows.length}条`;
  const totalPages = Math.max(Math.ceil(filteredRows.length / customerPageSize), 1);
  customerPage = Math.min(Math.max(customerPage, 1), totalPages);
  const start = (customerPage - 1) * customerPageSize;
  const rows = filteredRows.slice(start, start + customerPageSize);
  currentCustomerRows = rows;
  const selectableIds = new Set(filteredRows.filter((item) => canAssignCustomers() && isCustomerAssignable(item)).map((item) => Number(item.id)));
  selectedCustomerIds = new Set([...selectedCustomerIds].filter((id) => selectableIds.has(Number(id))));
  $("#customerRows").innerHTML = rows.length
    ? rows.map(customerRow).join("")
    : `<tr><td colspan="13" class="empty">暂无客户</td></tr>`;
  updateCustomerSelectionUI();
  const sizeSelect = $("#customerPageSize");
  if (sizeSelect) sizeSelect.value = String(customerPageSize);
  $("#customerPageSummary").textContent = `共 ${filteredRows.length} 条 · 第 ${customerPage} / ${totalPages} 页`;
  $("#customerPrevPage").disabled = customerPage <= 1;
  $("#customerNextPage").disabled = customerPage >= totalPages;
}

function customerRow(item) {
  const dueClass = item.nextFollow && item.nextFollow < today ? "overdue" : item.nextFollow === today ? "today" : "";
  const photos = Array.isArray(item.photos) ? item.photos : [];
  const photoHtml = photos.length
    ? `<div class="customer-photos">${photos.slice(0, 4).map((url) => `<img src="${escapeHtml(url)}" data-photo="${escapeHtml(url)}" alt="${escapeHtml(item.name || "客户图片")}" />`).join("")}${photos.length > 4 ? `<span>+${photos.length - 4}</span>` : ""}</div>`
    : "";
  const assignable = canAssignCustomers() && isCustomerAssignable(item);
  const checked = selectedCustomerIds.has(Number(item.id)) ? "checked" : "";
  const disabled = assignable ? "" : "disabled";
  const title = assignable ? "选择客户" : "当前客户暂不满足分配条件";
  const ownership = ownershipLabel(item);
  return `
    <tr>
      <td class="select-cell"><input type="checkbox" class="customer-select" data-id="${item.id}" ${checked} ${disabled} title="${title}" /></td>
      <td><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.stage || "")}${ownership ? ` · <span class="ownership-state ${item.ownershipStatus}">${escapeHtml(ownership)}</span>` : ""}</small></td>
      <td><a href="tel:${item.phone}">${item.phone}</a></td>
      <td>${escapeHtml(normalizeChannelSource(item.channelSource))}</td>
      <td>${escapeHtml(item.createdBy || "未记录")}</td>
      <td>${escapeHtml(item.followPerson || item.owner || "未分配")}</td>
      <td>${escapeHtml(customerStageTime(item) || "-")}</td>
      <td><small>${escapeHtml(item.lastNote || "暂无跟进记录")}</small><button class="history-link" data-action="history" data-id="${item.id}">查看历史(${(item.followUps || []).length})</button>${photoHtml}</td>
      <td>${latestFollow(item) || "-"}</td>
      <td class="${dueClass}">${item.nextFollow || "未设置"}</td>
      <td>${escapeHtml(item.unit || "待分配")}</td>
      <td>${escapeHtml(item.address || item.region || "待补充")}</td>
      <td><button data-action="follow" data-id="${item.id}">跟进</button><button data-action="advance" data-id="${item.id}">${item.stage === "成交" ? "已成交" : "推进"}</button></td>
    </tr>`;
}

function updateCustomerSelectionUI() {
  const selectableRows = currentCustomerRows.filter((item) => canAssignCustomers() && isCustomerAssignable(item));
  const pageSelectedCount = selectableRows.filter((item) => selectedCustomerIds.has(Number(item.id))).length;
  const selectedCount = currentFilteredCustomerRows.filter((item) => canAssignCustomers() && isCustomerAssignable(item) && selectedCustomerIds.has(Number(item.id))).length;
  const selectAll = $("#selectAllCustomers");
  if (selectAll) {
    selectAll.disabled = selectableRows.length === 0;
    selectAll.checked = selectableRows.length > 0 && pageSelectedCount === selectableRows.length;
    selectAll.indeterminate = pageSelectedCount > 0 && pageSelectedCount < selectableRows.length;
  }
  const batchButton = $("#batchAssignBtn");
  if (batchButton) {
    batchButton.disabled = selectedCount === 0;
    batchButton.textContent = selectedCount ? `批量分配(${selectedCount})` : "批量分配";
  }
}

function toggleCustomerSelection(event) {
  const checkbox = event.target.closest(".customer-select");
  if (!checkbox) return;
  const id = Number(checkbox.dataset.id);
  if (checkbox.checked) selectedCustomerIds.add(id);
  else selectedCustomerIds.delete(id);
  updateCustomerSelectionUI();
}

function toggleAllCustomers(event) {
  const checked = event.currentTarget.checked;
  currentCustomerRows.forEach((item) => {
    if (!canAssignCustomers() || !isCustomerAssignable(item)) return;
    const id = Number(item.id);
    if (checked) selectedCustomerIds.add(id);
    else selectedCustomerIds.delete(id);
  });
  renderCustomers();
}

function openBatchAssignDialog() {
  const ids = selectedCustomerIdsForAssign();
  if (!ids.length) return toast("请先勾选客户");
  $("#assignSummary").textContent = `已选择 ${ids.length} 个客户`;
  $("#assignDialog").showModal();
}

function selectedCustomerIdsForAssign() {
  const selectableIds = new Set(currentFilteredCustomerRows.filter((item) => canAssignCustomers() && isCustomerAssignable(item)).map((item) => Number(item.id)));
  return [...selectedCustomerIds].map(Number).filter((id) => selectableIds.has(id));
}

function openCustomerDialog(customer = null) {
  const form = $("#customerForm");
  form.reset();
  form.id.value = customer?.id || "";
  form.name.value = customer?.name || "";
  form.phone.value = customer?.phone || "";
  form.channelSource.value = normalizeChannelSource(customer?.channelSource || "其他");
  form.stage.value = customer?.stage || (stages.includes(currentStage) ? currentStage : "名单");
  form.owner.value = customer?.owner || $("#customerOwnerSelect").value;
  form.createdBy.value = customer?.createdBy || currentUser().name || "";
  form.followPerson.value = customer?.followPerson || customer?.owner || form.owner.value;
  form.address.value = customer?.address || "";
  form.amount.value = customer?.amount || 15;
  form.demoAt.value = customer?.demoAt || "";
  form.quoteAmount.value = customer?.quoteAmount || "";
  form.expectedDealDate.value = customer?.expectedDealDate || "";
  form.contractAmount.value = customer?.contractAmount || "";
  form.paymentAmount.value = customer?.paymentAmount || "";
  form.paymentDate.value = customer?.paymentDate || "";
  form.paymentOwnerId.value = customer?.paymentOwnerId || currentUser().id || "";
  form.lossReason.value = customer?.lossReason || "";
  form.software.value = customer?.software || "";
  form.note.value = "";
  form.nextFollow.value = customer?.nextFollow || today;
  const identityLocked = Boolean(customer) && !canAdmin();
  form.name.readOnly = identityLocked;
  form.phone.readOnly = identityLocked;
  form.name.classList.toggle("locked-input", identityLocked);
  form.phone.classList.toggle("locked-input", identityLocked);
  $("#customerDialogTitle").textContent = customer ? "客户跟进" : "新增客户";
  $("#customerDialog").showModal();
}

function openFollowHistory(customer) {
  if (!customer) return;
  const history = [...(customer.followUps || [])].reverse();
  $("#followHistoryTitle").textContent = `${customer.name} · 跟进历史`;
  $("#followHistorySummary").textContent = `共 ${history.length} 条记录`;
  $("#followHistoryList").innerHTML = history.length
    ? history.map((item) => `
        <article class="follow-history-item">
          <div class="follow-history-meta"><b>${escapeHtml(formatFollowTime(item))}</b><span>${escapeHtml(item.author || "历史数据")}</span></div>
          <p>${escapeHtml(item.note || "未填写跟进内容")}</p>
          <small>下次跟进：${escapeHtml(item.nextFollow || "未设置")}</small>
        </article>`).join("")
    : '<div class="empty">暂无跟进历史</div>';
  $("#followHistoryDialog").showModal();
}

async function saveCustomer(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#customerDialog").close();
  const form = new FormData(event.currentTarget);
  const id = Number(form.get("id"));
  const ownerUser = userByName(String(form.get("owner")));
  const ownerUnit = unitForId(ownerUser.unitId);
  const note = String(form.get("note") || "").trim();
  const customer = {
    id: id || Date.now(),
    name: String(form.get("name")).trim(),
    phone: String(form.get("phone")).trim(),
    channelSource: normalizeChannelSource(form.get("channelSource") || "其他"),
    createdBy: String(form.get("createdBy") || currentUser().name || "未记录"),
    followPerson: String(form.get("followPerson") || form.get("owner") || "未分配"),
    address: String(form.get("address") || ""),
    stage: String(form.get("stage")),
    owner: String(form.get("owner")),
    ownerId: ownerUser.id || "",
    unitId: ownerUser.unitId || "",
    unit: ownerUser.unit || ownerUnit.name || "",
    zone: ownerUser.zone || ownerUnit.zone || "",
    region: ownerUser.zone || ownerUnit.zone || "待分区",
    amount: Number(form.get("amount") || 15),
    demoAt: String(form.get("demoAt") || ""),
    quoteAmount: Number(form.get("quoteAmount") || 0),
    expectedDealDate: String(form.get("expectedDealDate") || ""),
    contractAmount: Number(form.get("contractAmount") || 0),
    paymentAmount: Number(form.get("paymentAmount") || 0),
    paymentDate: String(form.get("paymentDate") || ""),
    paymentOwnerId: Number(form.get("paymentOwnerId") || currentUser().id),
    lossReason: String(form.get("lossReason") || ""),
    software: String(form.get("software") || "待补充"),
    createdAt: id ? undefined : today,
    lastFollow: today,
    nextFollow: String(form.get("nextFollow") || ""),
    lastNote: note || (id ? undefined : "新增客户。")
  };
  try {
    if (id) {
      await api(`/customers/${id}`, { method: "PUT", body: customer });
    } else {
      await api("/customers", { method: "POST", body: customer });
    }
  } catch (error) {
    if (error.code === "SIMILAR_CUSTOMER_WARNING") {
      if (!window.confirm(`${error.message}\n\n确认仍要继续保存吗？`)) return;
      customer.confirmSimilar = true;
      try {
        if (id) await api(`/customers/${id}`, { method: "PUT", body: customer });
        else await api("/customers", { method: "POST", body: customer });
      } catch (retryError) {
        return toast(retryError.message || "保存失败");
      }
    } else if (!id && error.code === "CUSTOMER_CLAIMABLE") {
      if (!window.confirm("该客户已释放，是否认领并接手原客户资料？")) return;
      await api("/customers/claim", { method: "POST", body: { phone: customer.phone } });
      $("#customerDialog").close();
      await loadState();
      return toast("客户认领成功，请在3天内完成有效跟进");
    } else {
      return toast(error.code === "DUPLICATE_CUSTOMER" ? "该客户已存在" : error.message);
    }
  }
  $("#customerDialog").close();
  await loadState();
  toast("已保存");
}

async function advanceCustomer(id) {
  const customer = state.customers.find((item) => item.id === id);
  const index = stages.indexOf(customer.stage);
  if (index >= stages.length - 1) return;
  const nextStage = stages[index + 1];
  if (nextStage === "商机" && !customer.demoAt) {
    openCustomerDialog(customer);
    return toast("进入商机前请填写有效演示时间");
  }
  if (nextStage === "成交" && Number(customer.contractAmount || 0) <= 0) {
    openCustomerDialog(customer);
    return toast("进入成交前请填写合同金额");
  }
  const nextCustomer = {
    ...customer,
    stage: nextStage,
    lastFollow: today,
    nextFollow: today,
    lastNote: `客户推进至${nextStage}阶段。`
  };
  await api(`/customers/${id}`, { method: "PUT", body: nextCustomer });
  currentStage = nextStage;
  await loadState();
  toast("已推进");
}

async function assignCustomer(id, ownerId) {
  const target = state.users.find((user) => Number(user.id) === Number(ownerId));
  if (!target) return toast("请选择销售");
  await api(`/customers/${id}/assign`, {
    method: "POST",
    body: { ownerId: target.id, owner: target.name }
  });
  await loadState();
  toast("已分配");
}

async function batchAssignCustomers(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#assignDialog").close();
  const ids = selectedCustomerIdsForAssign();
  if (!ids.length) return toast("请先勾选客户");
  const form = new FormData(event.currentTarget);
  const ownerId = Number(form.get("ownerId"));
  const target = state.users.find((user) => Number(user.id) === Number(ownerId));
  if (!target) return toast("请选择员工");
  const result = await api("/customers/assign", {
    method: "POST",
    body: { ids, ownerId: target.id, owner: target.name }
  });
  selectedCustomerIds.clear();
  $("#assignDialog").close();
  await loadState();
  const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
  toast(failedCount ? `已分配${result.assigned || 0}个，${failedCount}个未满足条件` : `已分配${result.assigned || ids.length}个客户`);
}

async function batchImport(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#batchDialog").close();
  const form = new FormData(event.currentTarget);
  const owner = String(form.get("owner"));
  const ownerUser = userByName(owner);
  const file = form.get("file");
  const importBody = new FormData();
  importBody.append("stage", stages.includes(currentStage) ? currentStage : "名单");
  importBody.append("owner", owner);
  importBody.append("ownerId", ownerUser.id || "");
  importBody.append("unitId", ownerUser.unitId || "");
  importBody.append("unit", ownerUser.unit || "");
  importBody.append("zone", ownerUser.zone || "");
  importBody.append("channelSource", "其他");
  importBody.append("createdBy", currentUser().name || "未记录");
  importBody.append("followPerson", owner);
  if (file && file.size) {
    importBody.append("file", file);
  } else {
    const rows = String(form.get("rows") || "").trim();
    if (!rows) return toast("请选择文件或粘贴客户数据");
    importBody.append("rows", rows);
  }
  const result = await api("/import/customers", { method: "POST", body: importBody });
  $("#batchDialog").close();
  event.currentTarget.reset();
  await loadState();
  showImportFeedback(result);
}

function isSoldStatus(status) {
  return status === "成交" || status === "已成交";
}

function displayVisitStatus(status) {
  const legacy = { 待攻克: "名单", 跟进中: "线索", 已成交: "成交" };
  return legacy[status] || status || "线索";
}

function visitDeviceLine(visit) {
  if (visit.cuttingDevice || visit.drillingDevice) {
    return [`开料：${visit.cuttingDevice || "待补充"}`, `打孔：${visit.drillingDevice || "待补充"}`].join(" / ");
  }
  const cutting = visit.cuttingCount || visit.cuttingBrand
    ? `开料${visit.cuttingCount || "-"}台 · ${visit.cuttingBrand || "待补充"}`
    : "";
  const drilling = visit.drillingCount || visit.drillingBrand
    ? `打孔${visit.drillingCount || "-"}台 · ${visit.drillingBrand || "待补充"}`
    : "";
  return [cutting, drilling].filter(Boolean).join(" / ") || visit.line || "设备待补充";
}

function validVisitLocation(visit) {
  return Number(visit.latitude) && Number(visit.longitude);
}

function initFieldMap() {
  const node = $("#mapCanvas");
  if (!node || !window.TMap) {
    if (node) node.innerHTML = '<div class="map-empty">地图资源加载中，请稍后刷新</div>';
    return false;
  }
  if (fieldMap) {
    return true;
  }
  fieldMap = new TMap.Map(node, {
    center: new TMap.LatLng(35.86166, 104.195397),
    zoom: 5,
    pitch: 0,
    rotation: 0,
    baseMap: { type: "vector" },
    viewMode: "2D"
  });
  fieldInfoWindow = new TMap.InfoWindow({
    map: fieldMap,
    position: fieldMap.getCenter(),
    offset: { x: 0, y: -14 }
  });
  fieldInfoWindow.close();
  locateWebUser();
  return true;
}

function locateWebUser() {
  if (fieldLocationRequested || !fieldMap || !navigator.geolocation) return;
  fieldLocationRequested = true;
  navigator.geolocation.getCurrentPosition(
    (result) => {
      const position = new TMap.LatLng(result.coords.latitude, result.coords.longitude);
      fieldUserLocated = true;
      fieldMap.setCenter(position);
      fieldMap.setZoom(13);
      if (fieldUserMarker) fieldUserMarker.setMap(null);
      fieldUserMarker = new TMap.MultiMarker({
        map: fieldMap,
        styles: {
          current: new TMap.MarkerStyle({ width: 30, height: 30, anchor: { x: 15, y: 15 }, src: mapDotIcon("#409eff") })
        },
        geometries: [{ id: "current-user", styleId: "current", position }]
      });
    },
    () => {
      fieldLocationRequested = false;
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

function mapDotIcon(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 28;
  canvas.height = 28;
  const context = canvas.getContext("2d");
  context.beginPath();
  context.arc(14, 14, 9, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = "#ffffff";
  context.stroke();
  return canvas.toDataURL("image/png");
}

function renderFieldSummary(visits) {
  const summaryNode = $("#fieldSummaryCards");
  if (!summaryNode) return;
  const located = visits.filter(validVisitLocation);
  const sold = visits.filter((visit) => isSoldStatus(visit.status));
  const cities = Object.entries(
    visits.reduce((map, visit) => {
      const city = visit.city || "未知城市";
      map[city] = (map[city] || 0) + 1;
      return map;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const stageCards = stages.map((stage) => ({
    name: stage,
    count: visits.filter((visit) => displayVisitStatus(visit.status) === stage).length
  }));
  summaryNode.innerHTML = [
    `<article><span>已打卡工厂</span><strong>${visits.length}</strong><small>其中 ${located.length} 家有地图点位</small></article>`,
    `<article><span>成交工厂</span><strong>${sold.length}</strong><small>地图上显示为红点</small></article>`,
    ...stageCards.map((item) => `<article><span>${item.name}</span><strong>${item.count}</strong><small>客户阶段同步统计</small></article>`),
    ...cities.map(([city, count]) => `<article><span>${city}</span><strong>${count}</strong><small>城市拜访分布</small></article>`)
  ].join("");
}

function renderFieldMap(visits) {
  if (currentView !== "field" || !initFieldMap()) return;
  if (fieldLayer) {
    fieldLayer.setMap(null);
    fieldLayer = null;
  }
  const locatedVisits = visits.filter(validVisitLocation);
  const geometries = locatedVisits.map((visit) => {
    const latitude = Number(visit.latitude);
    const longitude = Number(visit.longitude);
    const sold = isSoldStatus(visit.status);
    return {
      id: String(visit.id),
      styleId: sold ? "sold" : "active",
      position: new TMap.LatLng(latitude, longitude),
      properties: { visit }
    };
  });
  fieldLayer = new TMap.MultiMarker({
    map: fieldMap,
    styles: {
      active: new TMap.MarkerStyle({ width: 28, height: 28, anchor: { x: 14, y: 14 }, src: mapDotIcon("#67c23a") }),
      sold: new TMap.MarkerStyle({ width: 28, height: 28, anchor: { x: 14, y: 14 }, src: mapDotIcon("#f56c6c") })
    },
    geometries
  });
  fieldLayer.on("click", (event) => {
    const visit = event.geometry?.properties?.visit;
    if (!visit) return;
    fieldInfoWindow.setPosition(event.geometry.position);
    fieldInfoWindow.setContent(`
      <strong>${escapeHtml(visit.factory || "未命名工厂")}</strong>
      <p>${escapeHtml(displayVisitStatus(visit.status))} · ${escapeHtml(visit.city || "未知城市")}</p>
      <p>${escapeHtml(visit.address || "")}</p>
      ${visit.phone ? `<p>电话：${escapeHtml(visit.phone)}</p>` : ""}
      <p>${escapeHtml(visitDeviceLine(visit))}</p>
      <p>${escapeHtml(visit.software || "待补充")} ${visit.softwarePrice ? `· ${escapeHtml(visit.softwarePrice)}` : ""}</p>
      ${visit.lossReason ? `<p>未成交原因：${escapeHtml(visit.lossReason)}</p>` : ""}
    `);
    fieldInfoWindow.open();
  });
  if (geometries.length && !fieldUserLocated) {
    const bounds = new TMap.LatLngBounds();
    geometries.forEach((geometry) => bounds.extend(geometry.position));
    fieldMap.fitBounds(bounds, { padding: 60 });
    if (geometries.length === 1) fieldMap.setZoom(12);
  } else if (!geometries.length && !fieldUserLocated) {
    fieldMap.setCenter(new TMap.LatLng(35.86166, 104.195397));
    fieldMap.setZoom(5);
  }
}

function renderField() {
  const visits = scopeVisits();
  renderFieldSummary(visits);
  renderFieldMap(visits);
  $("#visitList").innerHTML = visits.length
    ? visits
        .slice(0, 12)
        .map((visit) => {
          const status = displayVisitStatus(visit.status);
          return `<article>
            <b>${escapeHtml(visit.factory || "未命名工厂")}</b>
            <span class="${isSoldStatus(status) ? "sold-text" : ""}">${escapeHtml(status)}</span>
            <p>${escapeHtml(visit.city || "未知城市")} · ${escapeHtml(visit.address || "")}</p>
            ${visit.phone ? `<p>电话：${escapeHtml(visit.phone)}</p>` : ""}
            <p>${escapeHtml(visitDeviceLine(visit))}</p>
            <p>${escapeHtml(visit.software || "待补充")}${visit.softwarePrice ? ` · ${escapeHtml(visit.softwarePrice)}` : ""} · ${escapeHtml(visit.date || "")}</p>
            ${visit.lossReason ? `<p>未成交原因：${escapeHtml(visit.lossReason)}</p>` : ""}
            ${(visit.photos || []).map((url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(visit.factory || "现场图片")}" />`).join("")}
          </article>`;
        })
        .join("")
    : `<div class="empty">暂无地推拜访数据，请先在小程序选择位置并上传打卡。</div>`;
}

function renderAssistant() {
}

async function recommend() {
  const question = $("#customerQuestion").value.trim();
  if (!question) return toast("请先输入客户问题");
  $("#aiResult").textContent = "小智思考中...";
  const result = await api("/ai/script", { method: "POST", body: { question, user: currentUser() } });
  $("#aiResult").textContent = result.answer || "暂无结果";
}

async function addKnowledge(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const file = form.get("file");
  if (!String(form.get("question") || "").trim() && !String(form.get("answer") || "").trim() && !(file instanceof File && file.size)) {
    return toast("请填写知识内容或上传文件");
  }
  await api("/knowledge", { method: "POST", body: form });
  event.currentTarget.reset();
  await loadState();
  toast("知识库已添加");
}

function renderAdmin() {
  $("#settingsAccountsPane").classList.toggle("active", currentSettingsTab === "accounts");
  $("#settingsKnowledgePane").classList.toggle("active", currentSettingsTab === "knowledge");
  $$("#settingsTabs button").forEach((button) => button.classList.toggle("active", button.dataset.settingsTab === currentSettingsTab));
  $("#knowledgeList").innerHTML = (state.knowledge || [])
    .map((item) => {
      const fileUrl = item.fileUrl ? (item.fileUrl.startsWith("http") ? item.fileUrl : `${window.location.origin}${item.fileUrl}`) : "";
      const summary = item.summary || item.answer || item.content || "暂无摘要";
      return `<article><b>${escapeHtml(item.question)}</b>${fileUrl ? `<a class="kb-file-link" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">${escapeHtml(item.fileName || "查看文件")}</a>` : ""}<p>${escapeHtml(summary)}</p></article>`;
    })
    .join("");
  const roleSelect = $("#userRoleSelect");
  const unitSelect = $("#userUnitSelect");
  const zoneSelect = $("#unitZoneSelect");
  if (roleSelect) {
    roleSelect.innerHTML = roles().map((role) => `<option value="${role.id}">${role.name}</option>`).join("");
  }
  if (unitSelect) {
    unitSelect.innerHTML = (state.units || []).map((unit) => `<option value="${unit.id}">${unit.name} · ${unit.zone}</option>`).join("");
  }
  if (zoneSelect) {
    zoneSelect.innerHTML = zones.map((zone) => `<option>${zone}</option>`).join("");
  }
  $("#userList").innerHTML = visibleUsers()
    .map((user) => `<article><b>${escapeHtml(user.name)}</b><span>${user.status || "启用"}</span><p>${escapeHtml(user.role)} · ${escapeHtml(user.unit || "待分配")} · ${escapeHtml(user.zone || "未分战区")} · 账号：${escapeHtml(user.account || user.username || user.phone || "-")}</p><div class="user-actions">${Number(user.id) === Number(currentUser().id) ? "" : `<button data-action="reset-password" data-id="${user.id}">重置密码</button><button data-action="delete-user" data-id="${user.id}">删除员工</button>`}</div></article>`)
    .join("");
  $("#roleList").innerHTML = roles()
    .map((role) => `<article><b>${role.name}</b><span>${scopeLabels[role.customerScope] || role.customerScope}</span><p>${(role.permissions || []).map((permission) => permissionLabels[permission] || permission).join(" · ")}</p></article>`)
    .join("");
  $("#unitList").innerHTML = (state.units || [])
    .map((unit) => `<article><b>${escapeHtml(unit.name)}</b><span>${escapeHtml(unit.zone)}</span><p>销售选择该单位后，客户自动归属到该单位和战区。</p><button data-action="delete-unit" data-id="${escapeHtml(unit.id)}">删除单位</button></article>`)
    .join("");
}

async function addUser(event) {
  event.preventDefault();
  const formNode = event.currentTarget;
  const form = new FormData(formNode);
  const role = roles().find((item) => item.id === form.get("roleId")) || roles()[0];
  const unit = (state.units || []).find((item) => item.id === form.get("unitId")) || {};
  const name = String(form.get("name") || "").trim();
  const password = String(form.get("password") || "");
  if (password.length < 6) return toast("初始密码至少6位");
  setFormSubmitting(formNode, true, "开通中...");
  try {
    await api("/users", {
      method: "POST",
      body: {
        name,
        account: form.get("account"),
        password,
        phone: form.get("account"),
        roleId: role.id,
        role: role.name,
        unitId: unit.id,
        unit: unit.name || "待分配",
        region: unit.zone || "待分区"
      }
    });
    formNode.reset();
    await loadState();
    showSuccessFeedback("员工添加成功", `${name}的账号已开通，员工列表和单位选择项已自动更新。`);
  } catch (error) {
    toast(error.message || "员工添加失败");
  } finally {
    setFormSubmitting(formNode, false, "开通中...");
  }
}

async function addRole(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const permissions = form.getAll("permissions");
  await api("/roles", {
    method: "POST",
    body: {
      name: String(form.get("name") || "").trim(),
      customerScope: form.get("customerScope"),
      permissions
    }
  });
  event.currentTarget.reset();
  await loadState();
  toast("角色添加成功");
}

async function addUnit(event) {
  event.preventDefault();
  const formNode = event.currentTarget;
  const form = new FormData(formNode);
  const name = String(form.get("name") || "").trim();
  const zone = String(form.get("zone") || "");
  setFormSubmitting(formNode, true, "添加中...");
  try {
    await api("/units", { method: "POST", body: { name, zone } });
    formNode.reset();
    await loadState();
    showSuccessFeedback("单位添加成功", `${name}已归入${zone}，单位列表和员工单位选项已自动更新。`);
  } catch (error) {
    toast(error.message || "单位添加失败");
  } finally {
    setFormSubmitting(formNode, false, "添加中...");
  }
}

async function deleteUser(id) {
  const user = state.users.find((item) => Number(item.id) === Number(id));
  if (!user || !confirm(`确认删除员工：${user.name}？`)) return;
  await api(`/users/${id}`, { method: "DELETE" });
  await loadState();
  toast("员工已删除");
}

async function deleteUnit(id) {
  const unit = (state.units || []).find((item) => item.id === id);
  if (!unit || !confirm(`确认删除单位：${unit.name}？`)) return;
  await api(`/units/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadState();
  toast("单位已删除");
}

function clearCustomerFilters() {
  ["customerKeyword", "stageTimeStart", "stageTimeEnd", "lastFollowStart", "lastFollowEnd", "nextFollowStart", "nextFollowEnd"].forEach((id) => { $(`#${id}`).value = ""; });
  ["channelFilter", "createdByFilter", "followPersonFilter", "unitFilter"].forEach((id) => { $(`#${id}`).value = ""; });
}

function openDashboardCustomers(customers = [], fallbackStage = "全部") {
  const ids = customers.map((item) => Number(item.id)).filter(Boolean);
  const itemStages = [...new Set(customers.map((item) => item.stage).filter(Boolean))];
  dashboardDrilldownIds = new Set(ids);
  currentStage = itemStages.length === 1 ? itemStages[0] : fallbackStage;
  clearCustomerFilters();
  customerPage = 1;
  switchView("customers");
}

function handleDashboardClick(event) {
  if (!dashboardData) return;
  const metric = event.target.closest("[data-metric], [data-stage]");
  if (metric) {
    const key = metric.dataset.metric || ({ 名单: "lists", 商机: "opportunities", 成交: "deals" }[metric.dataset.stage]);
    return openDashboardCustomers(dashboardData.drilldowns?.[key] || [], metric.dataset.stage || "成交");
  }
  const actionButton = event.target.closest("[data-action-key]");
  if (!actionButton) return;
  const action = dashboardData.actions.find((item) => item.key === actionButton.dataset.actionKey);
  if (!action?.count) return;
  const customersById = new Map(scopeCustomers().map((item) => [Number(item.id), item]));
  openDashboardCustomers((action.customerIds || []).map((id) => customersById.get(Number(id))).filter(Boolean));
}

async function openTargetDialog() {
  const month = $("#dashboardMonth").value || today.slice(0, 7);
  targetManagement = await api(`/targets?month=${encodeURIComponent(month)}`);
  if (!targetManagement.canManage) return toast("当前角色无目标设置权限");
  const form = $("#targetForm");
  form.reset();
  form.month.value = month;
  $("#targetScopeSelect").innerHTML = targetManagement.options.map((item) => `<option value="${escapeHtml(`${item.type}:${item.id}`)}">${escapeHtml(item.name)}</option>`).join("");
  fillTargetForm();
  renderTargetList();
  $("#targetDialog").showModal();
}

function selectedTargetScope() {
  const [scopeType, ...idParts] = String($("#targetScopeSelect").value || "").split(":");
  const scopeId = idParts.join(":");
  const option = targetManagement.options.find((item) => item.type === scopeType && String(item.id) === scopeId) || {};
  return { scopeType, scopeId, scopeName: option.name || "" };
}

function fillTargetForm() {
  const form = $("#targetForm");
  const scope = selectedTargetScope();
  const month = form.month.value || today.slice(0, 7);
  const target = targetManagement.targets.find((item) => item.month === month && item.scopeType === scope.scopeType && String(item.scopeId) === String(scope.scopeId)) || {};
  ["revenueTarget", "contractTarget", "listTarget", "leadTarget", "opportunityTarget", "dealTarget"].forEach((field) => { form[field].value = target[field] || ""; });
}

function renderTargetList() {
  $("#targetList").innerHTML = targetManagement.targets.length ? targetManagement.targets.map((item) => `
    <article><div><b>${escapeHtml(item.scopeName || item.scopeId)}</b><small>${escapeHtml(item.month)}</small></div><small>进款 ${Number(item.revenueTarget || 0).toFixed(1)}万 · 签单 ${Number(item.contractTarget || 0).toFixed(1)}万 · 成交 ${item.dealTarget || 0}家</small></article>`).join("") : '<div class="empty">本月尚未设置目标</div>';
}

async function saveTarget(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#targetDialog").close();
  const form = new FormData(event.currentTarget);
  const scope = selectedTargetScope();
  await api("/targets", {
    method: "POST",
    body: {
      month: form.get("month"),
      ...scope,
      revenueTarget: Number(form.get("revenueTarget") || 0),
      contractTarget: Number(form.get("contractTarget") || 0),
      listTarget: Number(form.get("listTarget") || 0),
      leadTarget: Number(form.get("leadTarget") || 0),
      opportunityTarget: Number(form.get("opportunityTarget") || 0),
      dealTarget: Number(form.get("dealTarget") || 0)
    }
  });
  $("#targetDialog").close();
  toast("月度目标已保存");
  await renderDashboard();
}

function wireEvents() {
  const initialMonth = today.slice(0, 7);
  const initialRange = monthDates(initialMonth);
  $("#dashboardMonth").value = initialMonth;
  $("#dashboardStart").value = initialRange.start;
  $("#dashboardEnd").value = initialRange.end;
  $("#downloadTemplateLink").href = `${API_BASE}/import/customers/template`;
  $("#loginForm").addEventListener("submit", login);
  $("#changePasswordBtn").addEventListener("click", openChangePasswordDialog);
  $("#logoutBtn").addEventListener("click", logout);
  $("#changePasswordForm").addEventListener("submit", changePassword);
  $("#resetPasswordForm").addEventListener("submit", resetPassword);
  $("#changePasswordNowBtn").addEventListener("click", () => {
    $("#passwordReminderDialog").close();
    openChangePasswordDialog();
  });
  $("#skipPasswordChangeBtn").addEventListener("click", () => $("#passwordReminderDialog").close());
  $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.closeDialog}`).close()));
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $("#settingsTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-settings-tab]");
    if (!button) return;
    currentSettingsTab = button.dataset.settingsTab;
    renderAdmin();
  });
  $("#stageTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    dashboardDrilldownIds = null;
    currentStage = button.dataset.stage;
    customerPage = 1;
    renderCustomers();
  });
  ["customerKeyword", "channelFilter", "createdByFilter", "followPersonFilter", "unitFilter", "stageTimeStart", "stageTimeEnd", "lastFollowStart", "lastFollowEnd", "nextFollowStart", "nextFollowEnd"].forEach((id) => {
    const resetAndRender = () => {
      dashboardDrilldownIds = null;
      customerPage = 1;
      renderCustomers();
    };
    $(`#${id}`).addEventListener("input", resetAndRender);
    $(`#${id}`).addEventListener("change", resetAndRender);
  });
  $("#customerFilterToggle").addEventListener("click", () => {
    const card = $("#customerFilterCard");
    const collapsed = card.classList.toggle("collapsed");
    $("#customerFilterToggle").setAttribute("aria-expanded", String(!collapsed));
  });
  $("#customerPageSize").addEventListener("change", (event) => {
    customerPageSize = Number(event.currentTarget.value) || 10;
    customerPage = 1;
    renderCustomers();
  });
  $("#dashboardMonth").addEventListener("change", (event) => {
    const range = monthDates(event.currentTarget.value);
    $("#dashboardStart").value = range.start;
    $("#dashboardEnd").value = range.end;
    renderDashboard();
  });
  ["dashboardStart", "dashboardEnd", "dashboardScope"].forEach((id) => $(`#${id}`).addEventListener("change", renderDashboard));
  $("#dashboardView").addEventListener("click", handleDashboardClick);
  $("#targetSettingsBtn").addEventListener("click", () => openTargetDialog().catch((error) => toast(error.message)));
  $("#targetScopeSelect").addEventListener("change", fillTargetForm);
  $("#targetForm input[name='month']").addEventListener("change", async (event) => {
    targetManagement = await api(`/targets?month=${encodeURIComponent(event.currentTarget.value)}`);
    renderTargetList();
    fillTargetForm();
  });
  $("#customerPrevPage").addEventListener("click", () => {
    if (customerPage <= 1) return;
    customerPage -= 1;
    renderCustomers();
  });
  $("#customerNextPage").addEventListener("click", () => {
    const totalPages = Math.max(Math.ceil(currentFilteredCustomerRows.length / customerPageSize), 1);
    if (customerPage >= totalPages) return;
    customerPage += 1;
    renderCustomers();
  });
  $("#addCustomerBtn").addEventListener("click", () => openCustomerDialog());
  $("#batchImportBtn").addEventListener("click", () => $("#batchDialog").showModal());
  $("#batchAssignBtn").addEventListener("click", openBatchAssignDialog);
  $("#selectAllCustomers").addEventListener("change", toggleAllCustomers);
  $("#customerRows").addEventListener("change", toggleCustomerSelection);
  $("#customerRows").addEventListener("click", (event) => {
    const photo = event.target.closest("img[data-photo]");
    if (photo) {
      window.open(photo.dataset.photo, "_blank", "noopener");
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === "history") {
      openFollowHistory(state.customers.find((item) => Number(item.id) === id));
      return;
    }
    if (button.dataset.action === "follow") openCustomerDialog(state.customers.find((item) => item.id === id));
    if (button.dataset.action === "advance") advanceCustomer(id);
    if (button.dataset.action === "assign") {
      const select = button.parentElement.querySelector(`select[data-role="assign-owner"][data-id="${id}"]`);
      assignCustomer(id, select?.value);
    }
  });
  $("#customerForm").addEventListener("submit", saveCustomer);
  $("#batchForm").addEventListener("submit", batchImport);
  $("#assignForm").addEventListener("submit", batchAssignCustomers);
  $("#targetForm").addEventListener("submit", saveTarget);
  $("#recommendBtn").addEventListener("click", recommend);
  $("#knowledgeForm").addEventListener("submit", addKnowledge);
  $("#userForm").addEventListener("submit", addUser);
  $("#roleForm").addEventListener("submit", addRole);
  $("#unitForm").addEventListener("submit", addUnit);
  $("#userList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "delete-user") deleteUser(button.dataset.id);
    if (button.dataset.action === "reset-password") openResetPasswordDialog(button.dataset.id);
  });
  $("#unitList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='delete-unit']");
    if (button) deleteUnit(button.dataset.id);
  });
}

wireEvents();
if (requireLogin()) loadState().catch((error) => toast(error.message));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
