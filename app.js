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

let state = { users: [], customers: [], opportunities: [], products: [], visits: [], knowledge: [], stages, roles: defaultRoles, units: [], competitors: [], routes: [] };
let currentStage = "名单";
let currentView = "dashboard";
let currentSettingsTab = "accounts";
let fieldMap = null;
let fieldLayer = null;
let fieldInfoWindow = null;
let fieldUserMarker = null;
let fieldUserLocated = false;
let fieldLocationRequested = false;
let fieldMapMode = "status";
let fieldPoints = [];
let fieldMapResult = { points: [], summary: {} };
let fieldCluster = null;
let geocodeProgressTimer = null;
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

function userById(id) {
  return state.users.find((user) => Number(user.id) === Number(id)) || {};
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

function canSeePrivateRecord(record = {}, user = currentUser()) {
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

function canSeeRecord(record = {}, user = currentUser()) {
  return record.ownershipStatus === "public_pool" || canSeePrivateRecord(record, user);
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

function canOwnCustomer(user = {}) {
  const roleName = roleForUser(user).name || user.role || "";
  return ["销售", "主管", "区域经理"].includes(roleName);
}

function visibleFollowUsers() {
  return visibleUsers().filter(canOwnCustomer);
}

function productById(productId) {
  return (state.products || []).find((item) => item.id === productId) || {};
}

function productDefaultAmount(productId) {
  const price = Number(productById(productId).price || 0);
  return Number.isFinite(price) && price > 0 ? price : 150000;
}

function fillAmountFromProduct(form, productId) {
  if (!form?.amount) return;
  form.amount.value = productDefaultAmount(productId);
}

function latestFollow(customer = {}) {
  return customer.lastFollow || customer.createdAt || "";
}

function ownershipLabel(customer = {}) {
  if (customer.ownershipStatus === "public_pool" || customer.ownershipStatus === "claimable") return "公海客户";
  if (customer.ownershipStatus === "pending_followup") return `待有效跟进 · ${customer.claimDaysRemaining || 0}天`;
  return "";
}

function stageTimeConfig(stage = currentStage) {
  if (stage === "全部") return { label: "阶段时间", field: "createdAt" };
  if (stage === "公海") return { label: "进入公海", field: "publicPoolAt" };
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
  if (customer.ownershipStatus === "public_pool") return customer.stage !== "成交";
  if (customer.stage === "名单") return true;
  if (!["线索", "商机"].includes(customer.stage)) return false;
  const latest = latestFollow(customer);
  return !latest || daysSince(latest) >= 30;
}

function canSelectCustomerForAssign(customer = {}) {
  return canAssignCustomers() && canSeePrivateRecord(customer) && isCustomerAssignable(customer);
}

async function api(path, options = {}) {
  const active = session();
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (active?.token) headers.Authorization = `Bearer ${active.token}`;
  const requestBody = options.body instanceof FormData
    ? options.body
    : options.body
      ? { ...options.body, moneyUnit: "yuan" }
      : undefined;
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: requestBody instanceof FormData ? requestBody : requestBody ? JSON.stringify(requestBody) : undefined
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
  const dialog = $("#successDialog");
  if (!dialog.open) dialog.showModal();
}

function showImportFeedback(result, entityLabel = "客户") {
  const total = Number(result.total || 0);
  const imported = Number(result.imported || 0);
  const duplicates = Number(result.duplicates || 0);
  const failed = Number(result.failed || 0);
  const pendingLocation = Number(result.pendingLocation || 0);
  const details = [
    ...(Array.isArray(result.skipped) ? result.skipped : []),
    ...(Array.isArray(result.failures) ? result.failures : [])
  ];
  $("#importResultTitle").textContent = duplicates && !imported && !failed ? `重复${entityLabel}未导入` : `${entityLabel}导入完成`;
  $("#importResultStats").innerHTML = [
    ["总行数", total, ""],
    ["成功", imported, "success"],
    ["重复", duplicates, "warning"],
    ["失败", failed, "danger"],
    ...(pendingLocation ? [["待定位", pendingLocation, "warning"]] : [])
  ].map(([label, value, className]) => `<div class="${className}"><span>${label}</span><b>${value}</b></div>`).join("");
  $("#importResultDetails").innerHTML = details.length
    ? details.map((item) => `<article><b>第${Number(item.rowNumber || 0)}行 · ${escapeHtml(item.name || "未命名客户")}</b><span>${escapeHtml(item.phone || "手机号未填写")} · ${escapeHtml(item.reason || "未导入")}</span></article>`).join("")
    : `<div class="empty">本次没有未导入${entityLabel}</div>`;
  const link = $("#importResultDownload");
  if (result.reportUrl) {
    const apiOrigin = API_BASE.replace(/\/api\/?$/, "");
    link.href = result.reportUrl.startsWith("http") ? result.reportUrl : `${apiOrigin}${result.reportUrl}`;
    link.hidden = false;
  } else {
    link.hidden = true;
    link.removeAttribute("href");
  }
  const dialog = $("#importResultDialog");
  if (!dialog.open) dialog.showModal();
}

async function trackGeocodeProgress() {
  if (geocodeProgressTimer) clearTimeout(geocodeProgressTimer);
  try {
    const progress = await api("/geocode/status");
    const counts = progress.counts || {};
    const title = $("#importResultTitle");
    if (title) title.textContent = progress.configured
      ? `地址解析中：剩余${progress.remaining || 0}条，失败${counts.failed || 0}条`
      : "地址解析待启动：服务器未配置腾讯地图服务Key";
    if (progress.configured && progress.remaining > 0) geocodeProgressTimer = setTimeout(trackGeocodeProgress, 1800);
    if (progress.configured && progress.remaining === 0) {
      if (title) title.textContent = `公海导入完成：已定位${counts.resolved || 0}条，失败${counts.failed || 0}条`;
      await loadState();
    }
  } catch {}
}

async function loadState() {
  state = await api("/state");
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
  return (state.customers || []).filter((item) => item.lifecycleStatus !== "archived" && canSeeRecord(item, user));
}

function opportunityCustomer(opportunity = {}) {
  return (state.customers || []).find((customer) => Number(customer.id) === Number(opportunity.customerId)) || {};
}

function opportunityRow(opportunity = {}) {
  const customer = opportunityCustomer(opportunity);
  return {
    ...customer,
    ...opportunity,
    id: opportunity.id,
    opportunityId: opportunity.id,
    customerId: customer.id || opportunity.customerId,
    name: customer.name || opportunity.name || "未命名客户",
    phone: customer.phone || opportunity.phone || "",
    contacts: customer.contacts || opportunity.contacts || [],
    competitorProfiles: customer.competitorProfiles || opportunity.competitorProfiles || [],
    photos: customer.photos || opportunity.photos || [],
    address: customer.address || opportunity.address || "",
    city: customer.city || customer.location?.city || opportunity.city || "待识别",
    channelSource: customer.channelSource || opportunity.channelSource || "其他",
    createdBy: customer.createdBy || opportunity.createdBy || "未记录"
  };
}

function scopeOpportunityRows() {
  const opportunities = Array.isArray(state.opportunities) && state.opportunities.length
    ? state.opportunities
    : (state.customers || []).map((customer) => ({ ...customer, id: customer.id, customerId: customer.id, productName: "待确认产品" }));
  return opportunities.map(opportunityRow).filter((item) => item.lifecycleStatus !== "archived" && (item.ownershipStatus === "public_pool" || canSeeRecord(item)));
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
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: Number(value || 0) % 1 ? 2 : 0,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
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
    <div class="trend-column" title="${escapeHtml(item.label)}：签单${escapeHtml(formatMoney(item.contract))}，进款${escapeHtml(formatMoney(item.revenue))}">
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
  const customers = scopeOpportunityRows();
  const stageTime = stageTimeConfig();
  const customerTabs = [...stages, "公海"];
  const currentFilters = {
    channel: $("#channelFilter")?.value || "",
    createdBy: $("#createdByFilter")?.value || "",
    followPerson: $("#followPersonFilter")?.value || "",
    unit: $("#unitFilter")?.value || "",
    city: $("#cityFilter")?.value || ""
  };
  $("#stageTabs").innerHTML = customerTabs
    .map((stage) => {
      const count = stage === "公海"
        ? customers.filter((item) => item.ownershipStatus === "public_pool").length
        : customers.filter((item) => item.stage === stage && item.ownershipStatus !== "public_pool").length;
      return `<button class="${currentStage === stage ? "active" : ""}" data-stage="${stage}">${stage}<span>${count}</span></button>`;
    })
    .join("");

  const ownerOptions = visibleFollowUsers();
  $("#channelFilter").innerHTML = optionList("全部渠道来源", channelSources);
  $("#createdByFilter").innerHTML = optionList("全部录入人", customers.map((item) => item.createdBy));
  $("#followPersonFilter").innerHTML = `${roleForUser(currentUser()).customerScope === "self" ? "" : '<option value="">全部跟进人</option>'}${ownerOptions.map((user) => `<option>${escapeHtml(user.name)}</option>`).join("")}`;
  $("#unitFilter").innerHTML = optionList("全部单位", customers.map((item) => item.unit));
  $("#cityFilter").innerHTML = optionList("全部城市", customers.map((item) => item.city));
  $("#channelFilter").value = currentFilters.channel;
  $("#createdByFilter").value = currentFilters.createdBy;
  $("#followPersonFilter").value = currentFilters.followPerson;
  $("#unitFilter").value = currentFilters.unit;
  $("#cityFilter").value = currentFilters.city;
  $("#customerOwnerSelect").innerHTML = ownerOptions.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  const paymentOwners = roleForUser(currentUser()).customerScope === "self" ? [currentUser()] : visibleUsers();
  $("#paymentOwnerSelect").innerHTML = paymentOwners.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  $("#batchOwnerSelect").innerHTML = ownerOptions.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  $("#assignOwnerSelect").innerHTML = ownerOptions.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  $("#customerStageSelect").innerHTML = stages.map((stage) => `<option>${stage}</option>`).join("");
  $("#customerChannelSelect").innerHTML = channelSources.map((source) => `<option>${source}</option>`).join("");
  const productOptions = (state.products || [])
    .filter((item) => item.active !== false)
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}${Number(item.price || 0) > 0 ? ` · ${escapeHtml(formatMoney(item.price))}` : ""}</option>`)
    .join("");
  $("#customerProductSelect").innerHTML = productOptions;
  $("#newOpportunityProductSelect").innerHTML = productOptions;
  $("#batchAssignBtn").classList.toggle("hidden", !canAssignCustomers());
  $("#addCustomerBtn").classList.toggle("hidden", currentStage === "公海");
  $("#batchImportBtn").classList.toggle("hidden", currentStage === "公海" && !canAdmin());
  $("#batchImportBtn").textContent = currentStage === "公海" ? "导入公海" : "批量导入";
  $("#stageTimeHeader").textContent = stageTime.label;
  $("#stageTimeFilterLabel").textContent = stageTime.label;

  const keyword = $("#customerKeyword").value.trim().toLowerCase();
  const channel = $("#channelFilter").value;
  const createdBy = $("#createdByFilter").value;
  const followPerson = $("#followPersonFilter").value;
  const unit = $("#unitFilter").value;
  const city = $("#cityFilter").value;
  const stageStart = $("#stageTimeStart").value;
  const stageEnd = $("#stageTimeEnd").value;
  const lastStart = $("#lastFollowStart").value;
  const lastEnd = $("#lastFollowEnd").value;
  const nextStart = $("#nextFollowStart").value;
  const nextEnd = $("#nextFollowEnd").value;
  const filteredRows = customers.filter((item) => {
    const source = `${item.name} ${item.phone}`.toLowerCase();
    if (dashboardDrilldownIds && !dashboardDrilldownIds.has(Number(item.id)) && !dashboardDrilldownIds.has(Number(item.customerId))) return false;
    const isPublicPool = item.ownershipStatus === "public_pool";
    if (currentStage === "公海" ? !isPublicPool : (isPublicPool || item.stage !== currentStage)) return false;
    if (keyword && !source.includes(keyword)) return false;
    if (channel && normalizeChannelSource(item.channelSource) !== channel) return false;
    if (createdBy && item.createdBy !== createdBy) return false;
    if (currentStage !== "公海" && followPerson && (item.followPerson || item.owner) !== followPerson) return false;
    if (unit && item.unit !== unit) return false;
    if (city && item.city !== city) return false;
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
  const selectableIds = new Set(filteredRows.filter(canSelectCustomerForAssign).map((item) => Number(item.id)));
  selectedCustomerIds = new Set([...selectedCustomerIds].filter((id) => selectableIds.has(Number(id))));
  $("#customerRows").innerHTML = rows.length
    ? rows.map(customerRow).join("")
    : `<tr><td colspan="15" class="empty">暂无销售机会</td></tr>`;
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
  const isPublicPool = item.ownershipStatus === "public_pool";
  const assignable = canSelectCustomerForAssign(item);
  const checked = selectedCustomerIds.has(Number(item.id)) ? "checked" : "";
  const disabled = assignable ? "" : "disabled";
  const title = assignable ? "选择客户" : (isPublicPool ? "只能分配权限范围内的公海客户" : "当前客户暂不满足分配条件");
  const ownership = ownershipLabel(item);
  const primaryContact = (item.contacts || []).find((contact) => contact.isPrimary) || (item.contacts || [])[0] || { phone: item.phone };
  const contactCount = (item.contacts || []).length;
  const phoneHtml = isPublicPool
    ? `<span class="pool-private-value">认领后可见</span>`
    : `<a href="tel:${escapeHtml(primaryContact.phone || item.phone)}">${escapeHtml(primaryContact.phone || item.phone)}</a>${contactCount > 1 ? `<small>另有${contactCount - 1}位联系人</small>` : ""}`;
  const followHtml = isPublicPool
    ? `<small class="pool-private-value">认领后可查看跟进历史</small>`
    : `<small>${escapeHtml(item.lastNote || "暂无跟进记录")}</small><button class="history-link" data-action="history" data-id="${item.id}">查看历史(${(item.followUps || []).length})</button>${photoHtml}`;
  const actions = isPublicPool
    ? (canOwnCustomer(currentUser())
        ? `<button class="primary" data-action="claim" data-id="${item.id}">认领</button>`
        : `<span class="pool-action-hint">${assignable ? "请勾选后分配" : "不在您的分配范围"}</span>`)
    : `<button data-action="follow" data-id="${item.id}">跟进</button><button data-action="ai" data-id="${item.id}">小智</button>${item.stage === "成交" ? `<button class="primary" data-action="new-opportunity" data-id="${item.id}">新增机会</button>` : `<button data-action="advance" data-id="${item.id}">推进</button>`}`;
  return `
    <tr>
      <td class="select-cell"><input type="checkbox" class="customer-select" data-id="${item.id}" ${checked} ${disabled} title="${title}" /></td>
      <td><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.stage || "")}${ownership ? ` · <span class="ownership-state ${item.ownershipStatus}">${escapeHtml(ownership)}</span>` : ""}</small></td>
      <td><span class="tag">${escapeHtml(item.productName || "待确认产品")}</span></td>
      <td>${phoneHtml}</td>
      <td>${escapeHtml(item.city || "待识别")}</td>
      <td>${escapeHtml(normalizeChannelSource(item.channelSource))}</td>
      <td>${escapeHtml(item.createdBy || "未记录")}</td>
      <td>${escapeHtml(item.followPerson || item.owner || "未分配")}</td>
      <td>${escapeHtml(customerStageTime(item) || "-")}</td>
      <td>${followHtml}</td>
      <td>${latestFollow(item) || "-"}</td>
      <td class="${dueClass}">${item.nextFollow || "未设置"}</td>
      <td>${escapeHtml(item.unit || "待分配")}</td>
      <td>${escapeHtml(item.address || item.region || "待补充")}</td>
      <td>${actions}</td>
    </tr>`;
}

function updateCustomerSelectionUI() {
  const selectableRows = currentCustomerRows.filter(canSelectCustomerForAssign);
  const pageSelectedCount = selectableRows.filter((item) => selectedCustomerIds.has(Number(item.id))).length;
  const selectedCount = currentFilteredCustomerRows.filter((item) => canSelectCustomerForAssign(item) && selectedCustomerIds.has(Number(item.id))).length;
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
    if (!canSelectCustomerForAssign(item)) return;
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
  const selectableIds = new Set(currentFilteredCustomerRows.filter(canSelectCustomerForAssign).map((item) => Number(item.id)));
  return [...selectedCustomerIds].map(Number).filter((id) => selectableIds.has(id));
}

function renderContactsEditor(contacts = []) {
  const list = contacts.length ? contacts : [{ name: "主联系人", phone: $("#customerForm [name=phone]")?.value || "", isPrimary: true }];
  const canChangePrimary = canAdmin() || !$("#customerForm [name=id]")?.value;
  $("#customerContactsEditor").innerHTML = list.map((contact, index) => `
    <article class="repeat-row contact-row" data-index="${index}">
      <div class="repeat-row-head"><b>${contact.isPrimary ? "主联系人" : `联系人${index + 1}`}</b><div>${contact.isPrimary ? '<span class="tag">主联系人</span>' : `${canChangePrimary ? '<button type="button" data-set-primary-contact>设为主联系人</button>' : ""}<button type="button" data-remove-contact>删除</button>`}</div></div>
      <input data-contact="id" type="hidden" value="${escapeHtml(contact.id || "")}" />
      <label>姓名<input data-contact="name" value="${escapeHtml(contact.name || "")}" /></label>
      <label>手机号<input data-contact="phone" value="${escapeHtml(contact.phone || "")}" ${contact.isPrimary && !canAdmin() && $("#customerForm [name=id]")?.value ? "readonly" : ""} /></label>
      <label>职位<input data-contact="position" value="${escapeHtml(contact.position || "")}" placeholder="老板/设计主管/生产主管" /></label>
      <label>微信<input data-contact="wechat" value="${escapeHtml(contact.wechat || "")}" /></label>
      <label>决策角色<input data-contact="decisionRole" value="${escapeHtml(contact.decisionRole || "")}" placeholder="决策人/影响人/使用人" /></label>
      <label>备注<input data-contact="note" value="${escapeHtml(contact.note || "")}" /></label>
      <input data-contact="isPrimary" type="hidden" value="${contact.isPrimary ? "1" : "0"}" />
    </article>`).join("");
}

function readContactsEditor() {
  return $$("#customerContactsEditor .contact-row").map((row) => {
    const value = (name) => row.querySelector(`[data-contact=${name}]`)?.value || "";
    return { id: value("id"), name: value("name"), phone: value("phone"), position: value("position"), wechat: value("wechat"), decisionRole: value("decisionRole"), note: value("note"), isPrimary: value("isPrimary") === "1" };
  });
}

function renderCompetitorProfilesEditor(profiles = []) {
  const list = profiles.length ? profiles : [{ competitorId: state.competitors?.[0]?.id || "", isPrimary: true }];
  $("#customerCompetitorsEditor").innerHTML = list.map((profile, index) => `
    <article class="repeat-row competitor-row" data-index="${index}">
      <div class="repeat-row-head"><b>${index === 0 ? "当前使用软件" : `其他竞品${index}`}</b>${index === 0 ? '<span class="tag">主要</span>' : '<button type="button" data-remove-competitor>删除</button>'}</div>
      <input data-competitor="id" type="hidden" value="${escapeHtml(profile.id || "")}" />
      <label>品牌<select data-competitor="competitorId">${(state.competitors || []).map((item) => `<option value="${item.id}" ${item.id === profile.competitorId || item.name === profile.brand ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
      <details class="competitor-details"><summary>补充版本、价格和切换障碍</summary>
        <label>版本<input data-competitor="version" value="${escapeHtml(profile.version || "")}" /></label>
        <label>价格<input data-competitor="price" value="${escapeHtml(profile.price || "")}" /></label>
        <label>到期时间<input data-competitor="expiresAt" type="date" value="${escapeHtml(profile.expiresAt || "")}" /></label>
        <label>满意度<input data-competitor="satisfaction" value="${escapeHtml(profile.satisfaction || "")}" placeholder="满意/一般/不满意" /></label>
        <label>切换障碍<input data-competitor="switchingBarrier" value="${escapeHtml(profile.switchingBarrier || "")}" /></label>
        <label>备注<input data-competitor="note" value="${escapeHtml(profile.note || "")}" /></label>
      </details>
      <input data-competitor="isPrimary" type="hidden" value="${index === 0 ? "1" : "0"}" />
    </article>`).join("");
}

function readCompetitorProfilesEditor() {
  return $$("#customerCompetitorsEditor .competitor-row").map((row) => {
    const value = (name) => row.querySelector(`[data-competitor=${name}]`)?.value || "";
    const competitorId = value("competitorId");
    const definition = (state.competitors || []).find((item) => item.id === competitorId) || {};
    return { id: value("id"), competitorId, brand: definition.name || "其他", version: value("version"), price: value("price"), expiresAt: value("expiresAt"), satisfaction: value("satisfaction"), switchingBarrier: value("switchingBarrier"), note: value("note"), isPrimary: value("isPrimary") === "1" };
  });
}

function openCustomerDialog(customer = null) {
  const form = $("#customerForm");
  form.reset();
  form.id.value = customer?.customerId || customer?.id || "";
  form.opportunityId.value = customer?.opportunityId || "";
  form.name.value = customer?.name || "";
  form.phone.value = customer?.phone || "";
  form.city.value = customer?.city || "";
  const productId = customer?.productId || state.products?.[0]?.id || "";
  if (productId && !Array.from(form.productId.options).some((option) => option.value === productId)) {
    form.productId.add(new Option(customer?.productName || "历史产品（待补充）", productId));
  }
  form.productId.value = productId;
  form.channelSource.value = normalizeChannelSource(customer?.channelSource || "其他");
  form.stage.value = customer?.stage || (stages.includes(currentStage) ? currentStage : "名单");
  form.owner.value = customer?.ownerId
    ? String(customer.ownerId)
    : String((visibleFollowUsers().find((user) => user.name === (customer?.followPerson || customer?.owner)) || {}).id || $("#customerOwnerSelect").value || "");
  form.createdBy.value = customer?.createdBy || currentUser().name || "";
  form.address.value = customer?.address || "";
  form.amount.value = customer?.amount || productDefaultAmount(productId);
  form.demoAt.value = customer?.demoAt || "";
  if (form.quoteAmount) form.quoteAmount.value = customer?.quoteAmount || "";
  form.expectedDealDate.value = customer?.expectedDealDate || "";
  form.contractAmount.value = customer?.contractAmount || "";
  form.paymentAmount.value = customer?.paymentAmount || "";
  form.paymentDate.value = customer?.paymentDate || "";
  form.paymentOwnerId.value = customer?.paymentOwnerId || currentUser().id || "";
  form.lossReason.value = customer?.lossReason || "";
  form.note.value = "";
  form.nextFollow.value = customer?.nextFollow || today;
  const identityLocked = Boolean(customer) && !canAdmin();
  form.dataset.originalChannelSource = normalizeChannelSource(customer?.channelSource || "其他");
  form.dataset.originalCreatedBy = customer?.createdBy || currentUser().name || "";
  form.name.readOnly = identityLocked;
  form.phone.readOnly = identityLocked;
  form.channelSource.disabled = identityLocked;
  form.createdBy.readOnly = identityLocked;
  form.name.classList.toggle("locked-input", identityLocked);
  form.phone.classList.toggle("locked-input", identityLocked);
  form.channelSource.classList.toggle("locked-input", identityLocked);
  form.createdBy.classList.toggle("locked-input", identityLocked);
  renderContactsEditor(customer?.contacts || []);
  renderCompetitorProfilesEditor(customer?.competitorProfiles || []);
  $("#customerAiBtn").classList.toggle("hidden", !customer);
  $("#customerArchiveBtn").classList.toggle("hidden", !customer || customer.lifecycleStatus === "archived");
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
  const opportunityId = Number(form.get("opportunityId"));
  const ownerUser = userById(form.get("owner"));
  const ownerUnit = unitForId(ownerUser.unitId);
  const note = String(form.get("note") || "").trim();
  const contacts = readContactsEditor();
  const primaryContact = contacts.find((item) => item.isPrimary) || contacts[0] || {};
  const competitorProfiles = readCompetitorProfilesEditor();
  const metadataLocked = Boolean(id) && !canAdmin();
  const customer = {
    id: id || Date.now(),
    name: String(form.get("name")).trim(),
    phone: String(primaryContact.phone || form.get("phone")).trim(),
    contacts,
    competitorProfiles,
    opportunityId: opportunityId || undefined,
    productId: String(form.get("productId") || ""),
    channelSource: metadataLocked
      ? event.currentTarget.dataset.originalChannelSource
      : normalizeChannelSource(form.get("channelSource") || "其他"),
    createdBy: metadataLocked
      ? event.currentTarget.dataset.originalCreatedBy
      : String(form.get("createdBy") || currentUser().name || "未记录"),
    followPerson: ownerUser.name || "未分配",
    address: String(form.get("address") || ""),
    city: String(form.get("city") || ""),
    stage: String(form.get("stage")),
    owner: ownerUser.name || "未分配",
    ownerId: ownerUser.id || "",
    unitId: ownerUser.unitId || "",
    unit: ownerUser.unit || ownerUnit.name || "",
    zone: ownerUser.zone || ownerUnit.zone || "",
    region: ownerUser.zone || ownerUnit.zone || "待分区",
    amount: Number(form.get("amount") || productDefaultAmount(form.get("productId"))),
    demoAt: String(form.get("demoAt") || ""),
    expectedDealDate: String(form.get("expectedDealDate") || ""),
    contractAmount: Number(form.get("contractAmount") || 0),
    paymentAmount: Number(form.get("paymentAmount") || 0),
    paymentDate: String(form.get("paymentDate") || ""),
    paymentOwnerId: Number(form.get("paymentOwnerId") || currentUser().id),
    lossReason: String(form.get("lossReason") || ""),
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
      const claimed = await api("/customers/claim", { method: "POST", body: { phone: customer.phone } });
      $("#customerDialog").close();
      currentStage = claimed.stage || "名单";
      customerPage = 1;
      await loadState();
      const fresh = state.customers.find((item) => Number(item.id) === Number(claimed.id));
      if (fresh) openCustomerDialog(fresh);
      return toast("认领成功，请填写首次有效跟进");
    } else {
      return toast(error.code === "DUPLICATE_CUSTOMER" ? "该客户已存在" : error.message);
    }
  }
  $("#customerDialog").close();
  customerPage = 1;
  await loadState();
  toast("已保存");
}

async function claimCustomer(id) {
  if (!window.confirm("认领后将获得3天临时保护，请及时提交有效跟进。确认认领？")) return;
  try {
    const claimed = await api(`/opportunities/${id}/claim`, { method: "POST" });
    currentStage = claimed.stage || "名单";
    customerPage = 1;
    await loadState();
    const fresh = scopeOpportunityRows().find((item) => Number(item.id) === Number(claimed.id));
    if (fresh) openCustomerDialog(fresh);
    toast("认领成功，请填写首次有效跟进");
  } catch (error) {
    await loadState();
    toast(error.message || "认领失败，客户可能已被他人认领");
  }
}

async function advanceCustomer(id) {
  const customer = scopeOpportunityRows().find((item) => Number(item.id) === Number(id));
  if (!customer) return;
  const index = stages.indexOf(customer.stage);
  if (index >= stages.length - 1) return;
  const nextStage = stages[index + 1];
  const form = $("#advanceForm");
  form.reset();
  form.opportunityId.value = id;
  form.demoAt.value = customer.demoAt || today;
  form.contractAmount.value = customer.contractAmount || "";
  form.paymentAmount.value = customer.paymentAmount || "";
  form.paymentDate.value = customer.paymentDate || "";
  form.nextFollow.value = customer.nextFollow || "";
  $("#advanceDialogTitle").textContent = `推进为${nextStage}`;
  $("#advanceDialogSummary").textContent = `${customer.name} · ${customer.productName || "待确认产品"}`;
  $$(".advance-demo-field").forEach((node) => node.classList.toggle("hidden", nextStage !== "商机"));
  $$(".advance-deal-field").forEach((node) => node.classList.toggle("hidden", nextStage !== "成交"));
  const paymentOwners = roleForUser(currentUser()).customerScope === "self" ? [currentUser()] : visibleUsers();
  $("#advancePaymentOwnerSelect").innerHTML = paymentOwners.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  $("#advancePaymentOwnerSelect").value = String(customer.paymentOwnerId || currentUser().id || "");
  $("#advanceDialog").showModal();
}

async function submitAdvance(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = Number(form.get("opportunityId"));
  const opportunity = scopeOpportunityRows().find((item) => Number(item.id) === id);
  if (!opportunity) return toast("销售机会不存在");
  const nextStage = stages[stages.indexOf(opportunity.stage) + 1];
  const note = String(form.get("note") || "").trim();
  const nextFollow = String(form.get("nextFollow") || "");
  const demoAt = String(form.get("demoAt") || "");
  const contractAmount = Number(form.get("contractAmount") || 0);
  const paymentOwnerId = Number(form.get("paymentOwnerId") || 0);
  if (!note) return toast("请填写：本次跟进内容");
  if (nextStage === "商机" && !demoAt) return toast("请填写：有效演示日期");
  if (nextStage === "成交" && contractAmount <= 0) return toast("请填写：合同金额");
  if (nextStage === "成交" && !paymentOwnerId) return toast("请选择：业绩归属人");
  if (!nextFollow) return toast("请选择：下次跟进时间");
  await api(`/opportunities/${id}/advance`, {
    method: "POST",
    body: {
      demoAt,
      contractAmount,
      paymentAmount: Number(form.get("paymentAmount") || 0),
      paymentDate: String(form.get("paymentDate") || ""),
      paymentOwnerId: paymentOwnerId || Number(currentUser().id),
      note,
      nextFollow
    }
  });
  $("#advanceDialog").close();
  currentStage = nextStage;
  customerPage = 1;
  await loadState();
  toast(`已推进至${nextStage}`);
}

function openNewOpportunityDialog(opportunityId) {
  const row = scopeOpportunityRows().find((item) => Number(item.id) === Number(opportunityId));
  if (!row) return;
  const form = $("#newOpportunityForm");
  form.reset();
  form.customerId.value = row.customerId;
  $("#newOpportunitySummary").textContent = `${row.name}已有成交机会，新产品将从线索阶段重新轮转。`;
  $("#newOpportunityOwnerSelect").innerHTML = visibleFollowUsers().map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  $("#newOpportunityOwnerSelect").value = String(row.ownerId || currentUser().id || "");
  form.amount.value = productDefaultAmount(form.productId.value);
  form.nextFollow.value = today;
  $("#newOpportunityDialog").showModal();
}

async function submitNewOpportunity(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const customerId = Number(form.get("customerId"));
  const productId = String(form.get("productId") || "");
  const ownerId = Number(form.get("ownerId") || 0);
  const note = String(form.get("note") || "").trim();
  const nextFollow = String(form.get("nextFollow") || "");
  if (!productId) return toast("请选择：意向产品");
  if (!ownerId) return toast("请选择：跟进人");
  if (!note) return toast("请填写：首次跟进备注");
  if (!nextFollow) return toast("请选择：下次跟进时间");
  await api(`/customers/${customerId}/opportunities`, {
    method: "POST",
    body: { productId, ownerId, amount: Number(form.get("amount") || productDefaultAmount(productId)), note, nextFollow }
  });
  $("#newOpportunityDialog").close();
  currentStage = "线索";
  customerPage = 1;
  await loadState();
  toast("新销售机会已创建");
}

async function assignCustomer(id, ownerId) {
  const target = state.users.find((user) => Number(user.id) === Number(ownerId));
  if (!target) return toast("请选择销售");
  await api(`/opportunities/${id}/assign`, {
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
  const result = await api("/opportunities/assign", {
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
  const ownerUser = userById(form.get("owner"));
  const owner = ownerUser.name || "";
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
  importBody.append("moneyUnit", "yuan");
  if (file && file.size) {
    importBody.append("file", file);
  } else {
    const rows = String(form.get("rows") || "").trim();
    if (!rows) return toast("请选择文件或粘贴客户数据");
    importBody.append("rows", rows);
  }
  if (currentStage === "公海") importBody.append("target", "public_pool");
  const endpoint = currentStage === "公海" ? "/import/customers?target=public_pool" : "/import/customers";
  const result = await api(endpoint, { method: "POST", body: importBody });
  $("#batchDialog").close();
  event.currentTarget.reset();
  customerPage = 1;
  await loadState();
  showImportFeedback(result);
  if (currentStage === "公海" && result.pendingLocation) trackGeocodeProgress();
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

function renderFieldSummary(result) {
  const summaryNode = $("#fieldSummaryCards");
  if (!summaryNode) return;
  const summary = result.summary || {};
  const statusLabels = { pending: "待拜访", visited: "已拜访未成交", sold: "已成交", archived: "无效或倒闭" };
  summaryNode.innerHTML = [
    `<article><span>地图工厂</span><strong>${summary.total || 0}</strong><small>一个工厂只保留一个点位</small></article>`,
    ...(summary.statuses || []).map((item) => `<article><span>${statusLabels[item.name] || item.name}</span><strong>${item.count}</strong><small>客户状态分布</small></article>`),
    ...(fieldMapMode === "competitor" ? (summary.competitors || []).slice(0, 6) : (summary.cities || []).slice(0, 6)).map((item) => `<article><span>${escapeHtml(item.name)}</span><strong>${item.count}</strong><small>${fieldMapMode === "competitor" ? `市场占比 ${summary.total ? Math.round(item.count / summary.total * 100) : 0}%` : "城市分布"}</small></article>`),
    ...(fieldMapMode === "competitor" ? (summary.cities || []).slice(0, 3).map((item) => `<article><span>${escapeHtml(item.name)}</span><strong>${item.count}</strong><small>城市工厂覆盖</small></article>`) : [])
  ].join("");
}

function markerStyleForPoint(point) {
  if (fieldMapMode === "competitor") return `competitor-${String(point.competitorColor || "#64748b").replace("#", "")}`;
  return point.pointStatus || "pending";
}

function showFieldPointInfo(point, position) {
  if (!point || !fieldInfoWindow) return;
  fieldInfoWindow.setPosition(position || new TMap.LatLng(Number(point.latitude), Number(point.longitude)));
  fieldInfoWindow.setContent(`
    <strong>${escapeHtml(point.name || "未命名工厂")}</strong>
    <p>${escapeHtml(point.stage)} · ${escapeHtml(point.city || "未知城市")} · 拜访${point.visitCount || 0}次</p>
    <p>${escapeHtml(point.address || "")}</p>
    ${point.phone ? `<p>主联系人：${escapeHtml(point.phone)}</p>` : ""}
    <p>现用软件：${escapeHtml(point.competitor || point.software || "待补充")}</p>
    <p>${escapeHtml(point.equipment || "设备待补充")}</p>
    <button type="button" onclick="openCustomerFromMap(${Number(point.customerId)})">查看客户与拜访轨迹</button>
  `);
  fieldInfoWindow.open();
}

function renderFieldMap(points) {
  if (currentView !== "field" || !initFieldMap()) return;
  if (fieldLayer) {
    fieldLayer.setMap(null);
    fieldLayer = null;
  }
  if (fieldCluster?.setMap) fieldCluster.setMap(null);
  fieldCluster = null;
  const geometries = points.map((point) => {
    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);
    return {
      id: String(point.customerId),
      styleId: markerStyleForPoint(point),
      position: new TMap.LatLng(latitude, longitude),
      properties: { point }
    };
  });
  const styles = {
    pending: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: mapDotIcon("#9ca3af") }),
    visited: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: mapDotIcon("#22c55e") }),
    sold: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: mapDotIcon("#ef4444") }),
    archived: new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: mapDotIcon("#111827") })
  };
  points.forEach((point) => {
    const styleId = markerStyleForPoint(point);
    if (!styles[styleId]) styles[styleId] = new TMap.MarkerStyle({ width: 26, height: 26, anchor: { x: 13, y: 13 }, src: mapDotIcon(point.competitorColor || "#64748b") });
  });
  if (geometries.length > 60 && window.TMap.MarkerCluster) {
    try {
      fieldCluster = new TMap.MarkerCluster({
        id: "customer-cluster",
        map: fieldMap,
        geometries,
        minimumClusterSize: 2,
        zoomOnClick: true,
        gridSize: 60,
        averageCenter: true
      });
      if (fieldCluster.on) fieldCluster.on("click", (event) => showFieldPointInfo(event.geometry?.properties?.point, event.geometry?.position));
    } catch {
      fieldCluster = null;
    }
  }
  fieldLayer = new TMap.MultiMarker({ map: fieldCluster ? null : fieldMap, styles, geometries });
  fieldLayer.on("click", (event) => {
    const point = event.geometry?.properties?.point;
    showFieldPointInfo(point, event.geometry?.position);
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

function mapFilterQuery() {
  const ids = ["Province", "City", "District", "Owner", "Unit", "Zone", "Stage", "PointStatus", "Equipment", "Software"];
  const params = new URLSearchParams();
  ids.forEach((name) => {
    const value = $(`#map${name}Filter`)?.value?.trim();
    if (value) params.set(name.charAt(0).toLowerCase() + name.slice(1), value);
  });
  return params.toString();
}

function renderMapFilterOptions(points) {
  const fill = (id, label, values, valueKey = null) => {
    const node = $(id);
    if (!node) return;
    const selected = node.value;
    node.innerHTML = `<option value="">${label}</option>${[...new Map(values.filter(Boolean).map((item) => [valueKey ? item[valueKey] : item, item])).values()].map((item) => `<option value="${escapeHtml(valueKey ? item[valueKey] : item)}">${escapeHtml(item.name || item)}</option>`).join("")}`;
    if ([...node.options].some((option) => option.value === selected)) node.value = selected;
  };
  fill("#mapProvinceFilter", "全部省份", points.map((item) => item.province));
  fill("#mapCityFilter", "全部城市", points.map((item) => item.city));
  fill("#mapDistrictFilter", "全部区县", points.map((item) => item.district));
  fill("#mapOwnerFilter", "全部销售", visibleUsers(), "id");
  fill("#mapUnitFilter", "全部单位", state.units || [], "id");
  fill("#mapZoneFilter", "全部战区", zones);
  fill("#mapStageFilter", "全部阶段", stages);
}

async function renderField() {
  if (currentView !== "field") return;
  try {
    const result = await api(`/map/points?${mapFilterQuery()}`);
    fieldMapResult = result;
    fieldPoints = result.points || [];
    renderMapFilterOptions(fieldPoints);
    renderFieldSummary(result);
    renderFieldMap(fieldPoints);
    const customerById = new Map(state.customers.map((item) => [Number(item.id), item]));
    $("#visitList").innerHTML = fieldPoints.length
      ? fieldPoints.slice(0, 20).map((point) => {
          const customer = customerById.get(Number(point.customerId)) || {};
          return `<article>
            <b>${escapeHtml(point.name)}</b><span>${escapeHtml(point.stage)} · 拜访${point.visitCount}次</span>
            <p>${escapeHtml(point.city || "未知城市")} · ${escapeHtml(point.address || "")}</p>
            <p>现用软件：${escapeHtml(point.competitor || point.software || "待补充")}</p>
            <button type="button" data-map-customer="${point.customerId}">查看客户与拜访轨迹</button>
          </article>`;
        }).join("")
      : `<div class="empty">当前筛选条件下暂无地图工厂。</div>`;
  } catch (error) {
    $("#visitList").innerHTML = `<div class="empty">地图数据加载失败：${escapeHtml(error.message)}</div>`;
  }
}

async function openCustomerFromMap(id) {
  const point = fieldPoints.find((item) => Number(item.customerId) === Number(id));
  const customer = state.customers.find((item) => Number(item.id) === Number(id)) || (point ? { id, name: point.name, address: point.address, lifecycleStatus: point.pointStatus === "archived" ? "archived" : "active", ownershipStatus: point.pointStatus === "pending" ? "public_pool" : "" } : null);
  if (!customer) return toast("客户资料暂未同步，请刷新后重试");
  if (customer.lifecycleStatus !== "archived" && customer.ownershipStatus !== "public_pool") {
    openCustomerDialog(customer);
    return;
  }
  try {
    const visits = await api(`/customers/${id}/visits`);
    $("#followHistoryTitle").textContent = customer.name || "工厂详情";
    $("#followHistorySummary").textContent = `${customer.lifecycleStatus === "archived" ? "已归档" : "公海客户"} · ${customer.address || "地址待补充"} · 共${visits.length}次拜访`;
    const canRestore = customer.lifecycleStatus === "archived" && roleForUser(currentUser()).customerScope !== "self";
    $("#followHistoryList").innerHTML = `${canRestore ? `<button class="primary" type="button" data-restore-customer="${customer.id}">恢复为有效客户</button>` : ""}${visits.length ? visits.map((visit) => `
      <article class="follow-history-item">
        <div class="follow-history-meta"><b>${escapeHtml(visit.date || "未记录时间")}</b><small>${escapeHtml(visit.owner || "未记录拜访人")}</small></div>
        <p>${escapeHtml(visit.result || visit.note || visit.lossReason || "已完成现场拜访")}</p>
        <small>${escapeHtml(visit.address || "")} · ${escapeHtml(visit.software || "软件待补充")}</small>
      </article>`).join("") : '<div class="empty">暂无拜访轨迹</div>'}`;
    $("#followHistoryDialog").showModal();
  } catch (error) {
    toast(error.message);
  }
}

async function archiveCustomerFromDialog() {
  const id = Number($("#customerForm [name=id]").value || 0);
  if (!id) return;
  const reason = window.confirm("该工厂是否已经倒闭？\n确定：标记为倒闭；取消：标记为无效客户。") ? "closed" : "invalid";
  await api(`/customers/${id}/archive`, { method: "POST", body: { reason } });
  $("#customerDialog").close();
  await loadState();
  toast("客户已归档，并从漏斗和业绩统计中移出");
}

async function restoreCustomer(id) {
  await api(`/customers/${id}/restore`, { method: "POST", body: {} });
  $("#followHistoryDialog").close();
  await loadState();
  toast("客户已恢复");
}

window.openCustomerFromMap = openCustomerFromMap;

function renderAssistant() {
  const select = $("#assistantCustomerSelect");
  if (!select) return;
  const current = select.value;
  const customers = scopeOpportunityRows().filter((item) => item.ownershipStatus !== "public_pool" && item.lifecycleStatus !== "archived");
  select.innerHTML = `<option value="">通用咨询</option>${customers.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(item.productName || "待确认产品")} · ${escapeHtml(item.stage)}</option>`).join("")}`;
  if (customers.some((item) => String(item.id) === current)) select.value = current;
}

async function recommend() {
  const question = $("#customerQuestion").value.trim();
  const opportunityId = Number($("#assistantCustomerSelect")?.value || 0);
  const selected = scopeOpportunityRows().find((item) => Number(item.id) === opportunityId);
  if (!question && !selected) return toast("请选择客户或输入客户问题");
  $("#aiResult").innerHTML = '<div class="ai-loading">小智正在结合客户资料与知识库分析...</div>';
  const result = selected
    ? await api(`/ai/customers/${selected.customerId}/advice`, { method: "POST", body: { question, opportunityId } })
    : await api("/ai/script", { method: "POST", body: { question, user: currentUser() } });
  if (!result.advice) {
    $("#aiResult").innerHTML = `<pre>${escapeHtml(result.answer || "暂无结果")}</pre>`;
    return;
  }
  const labels = {
    intention: "客户意向判断",
    coreObjection: "当前核心异议",
    recommendedScript: "推荐回复话术",
    communicationGoal: "本次沟通目标",
    nextAction: "下一步行动",
    followUpDraft: "跟进记录草稿",
    riskReminder: "风险提醒"
  };
  $("#aiResult").innerHTML = `${Object.entries(labels).map(([key, label]) => `<section class="ai-advice-card"><h3>${label}</h3>${key === "followUpDraft" ? `<textarea id="aiFollowDraft" rows="4">${escapeHtml(result.advice[key] || "")}</textarea><button type="button" id="saveAiFollowBtn" data-opportunity-id="${opportunityId}">确认并保存为跟进记录</button>` : `<p>${escapeHtml(result.advice[key] || "未识别")}</p>`}</section>`).join("")}<section class="ai-citations"><h3>参考知识来源</h3>${(result.citations || []).length ? result.citations.map((item) => `<article><b>${escapeHtml(item.title)}</b>${item.fileUrl ? `<a href="${escapeHtml(item.fileUrl)}" target="_blank">${escapeHtml(item.fileName || "查看文件")}</a>` : ""}<p>${escapeHtml(item.summary || "")}</p></article>`).join("") : "<p>本次没有命中明确知识来源。</p>"}</section>`;
}

async function saveAiFollowDraft() {
  const button = $("#saveAiFollowBtn");
  const opportunityId = Number(button?.dataset.opportunityId || 0);
  const note = $("#aiFollowDraft")?.value.trim();
  if (!opportunityId || !note) return toast("跟进草稿不能为空");
  await api(`/opportunities/${opportunityId}/follow`, { method: "POST", body: { note, date: today } });
  await loadState();
  toast("跟进记录已保存，客户归属保护时间已更新");
}

function analyzeCustomer(id) {
  const customer = scopeOpportunityRows().find((item) => Number(item.id) === Number(id));
  if (!customer) return;
  if ($("#customerDialog")?.open) $("#customerDialog").close();
  switchView("assistant");
  $("#assistantCustomerSelect").value = String(id);
  $("#customerQuestion").value = "请结合当前客户全部资料，给出本次跟进策略。";
  recommend().catch((error) => toast(error.message));
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
      const tags = Object.values(item.tags || {}).flat().filter(Boolean);
      return `<article><b>${escapeHtml(item.question)}</b>${fileUrl ? `<a class="kb-file-link" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">${escapeHtml(item.fileName || "查看文件")}</a>` : ""}<p>${escapeHtml(summary)}</p>${tags.length ? `<div class="tag-list">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}</article>`;
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
    .map((user) => `<article><b>${escapeHtml(user.name)}</b><span>${user.status || "启用"}</span><p>${escapeHtml(user.role)} · ${escapeHtml(user.unit || "待分配")} · ${escapeHtml(user.zone || "未分战区")} · 账号：${escapeHtml(user.account || user.username || user.phone || "-")}</p><div class="user-actions">${Number(user.id) === Number(currentUser().id) ? "" : `<button data-action="reset-password" data-id="${user.id}">重置密码</button><button data-action="offboard-user" data-id="${user.id}">离职交接</button><button data-action="delete-user" data-id="${user.id}">删除员工</button>`}</div></article>`)
    .join("");
  $("#competitorList").innerHTML = (state.competitors || []).map((item) => `<article><b><i class="competitor-swatch" style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.name)}</b><span>${item.active === false ? "停用" : "启用"}</span></article>`).join("");
  $("#productList").innerHTML = (state.products || []).map((item) => `
    <article>
      <b>${escapeHtml(item.name)}</b>
      <span>${item.active === false ? "停用" : "启用"} · ${escapeHtml(formatMoney(item.price || 0))}</span>
      <div class="inline-actions">
        <input type="number" min="0" step="0.01" value="${Number(item.price || 0)}" data-product-price="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}价格" />
        <button data-action="update-product-price" data-id="${escapeHtml(item.id)}">保存价格</button>
      </div>
    </article>`).join("");
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

async function addCompetitor(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/competitors", { method: "POST", body: { name: form.get("name"), color: form.get("color") } });
  event.currentTarget.reset();
  await loadState();
  showSuccessFeedback("竞品添加成功", "竞品字典和客户档案选项已自动更新。");
}

async function addProduct(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/products", { method: "POST", body: { name: String(form.get("name") || "").trim(), price: Number(form.get("price") || 0) } });
  event.currentTarget.reset();
  await loadState();
  showSuccessFeedback("产品添加成功", "产品已加入销售机会和客户导入选项。 ");
}

async function updateProductPrice(productId) {
  const product = productById(productId);
  if (!product.id) return;
  const input = [...document.querySelectorAll("[data-product-price]")].find((item) => item.dataset.productPrice === productId);
  await api(`/products/${encodeURIComponent(productId)}`, {
    method: "PUT",
    body: {
      name: product.name,
      price: Number(input?.value || 0),
      active: product.active !== false
    }
  });
  await loadState();
  toast("产品价格已更新");
}

async function importUsers(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const file = form.get("file");
  const body = new FormData();
  if (file?.size) body.append("file", file);
  else {
    const rows = String(form.get("rows") || "").trim();
    if (!rows) return toast("请选择文件或粘贴员工数据");
    body.append("rows", rows);
  }
  const result = await api("/import/users", { method: "POST", body });
  $("#userImportDialog").close();
  event.currentTarget.reset();
  await loadState();
  showImportFeedback({ total: result.total, imported: result.imported, failed: result.failed, duplicates: 0, failures: result.failures, skipped: [], reportUrl: result.reportUrl }, "员工");
}

function openOffboardDialog(id) {
  const user = state.users.find((item) => Number(item.id) === Number(id));
  if (!user) return;
  const receivers = visibleUsers().filter((item) => Number(item.id) !== Number(id) && item.status !== "停用");
  if (!receivers.length) return toast("当前管理范围内没有可接收客户的员工");
  const form = $("#offboardForm");
  form.userId.value = id;
  $("#offboardSummary").textContent = `将 ${user.name} 的未归档客户和未完成路线转交给接收员工，并停用原账号。`;
  $("#offboardReceiverSelect").innerHTML = receivers.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(item.unit || "待分配")}</option>`).join("");
  $("#offboardDialog").showModal();
}

async function submitOffboard(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const result = await api(`/users/${Number(form.get("userId"))}/offboard`, { method: "POST", body: { receiverId: Number(form.get("receiverId")) } });
  $("#offboardDialog").close();
  await loadState();
  showSuccessFeedback("离职交接完成", `已转移${result.transferred || 0}个客户，原员工账号已停用并退出所有设备。`);
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
    <article><div><b>${escapeHtml(item.scopeName || item.scopeId)}</b><small>${escapeHtml(item.month)}</small></div><small>进款 ${escapeHtml(formatMoney(item.revenueTarget))} · 签单 ${escapeHtml(formatMoney(item.contractTarget))} · 成交 ${item.dealTarget || 0}家</small></article>`).join("") : '<div class="empty">本月尚未设置目标</div>';
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
  $("#downloadUserTemplateLink").href = `${API_BASE}/import/users/template`;
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
  ["customerKeyword", "channelFilter", "createdByFilter", "followPersonFilter", "unitFilter", "cityFilter", "stageTimeStart", "stageTimeEnd", "lastFollowStart", "lastFollowEnd", "nextFollowStart", "nextFollowEnd"].forEach((id) => {
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
      openFollowHistory(scopeOpportunityRows().find((item) => Number(item.id) === id));
      return;
    }
    if (button.dataset.action === "follow") openCustomerDialog(scopeOpportunityRows().find((item) => Number(item.id) === id));
    if (button.dataset.action === "ai") analyzeCustomer(id);
    if (button.dataset.action === "advance") advanceCustomer(id);
    if (button.dataset.action === "claim") claimCustomer(id);
    if (button.dataset.action === "new-opportunity") openNewOpportunityDialog(id);
    if (button.dataset.action === "assign") {
      const select = button.parentElement.querySelector(`select[data-role="assign-owner"][data-id="${id}"]`);
      assignCustomer(id, select?.value);
    }
  });
  $("#customerForm").addEventListener("submit", saveCustomer);
  $("#advanceForm").addEventListener("submit", submitAdvance);
  $("#newOpportunityForm").addEventListener("submit", submitNewOpportunity);
  $("#addContactBtn").addEventListener("click", () => renderContactsEditor([...readContactsEditor(), { name: "", phone: "", isPrimary: false }]));
  $("#customerContactsEditor").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-contact], [data-set-primary-contact]");
    if (!button) return;
    const index = Number(button.closest(".contact-row").dataset.index);
    const contacts = readContactsEditor();
    if (button.hasAttribute("data-set-primary-contact")) {
      renderContactsEditor(contacts.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })));
    } else {
      renderContactsEditor(contacts.filter((_, itemIndex) => itemIndex !== index));
    }
  });
  $("#addCompetitorProfileBtn").addEventListener("click", () => renderCompetitorProfilesEditor([...readCompetitorProfilesEditor(), { competitorId: state.competitors?.[0]?.id || "", isPrimary: readCompetitorProfilesEditor().length === 0 }]));
  $("#customerCompetitorsEditor").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-competitor]");
    if (!button) return;
    const index = Number(button.closest(".competitor-row").dataset.index);
    renderCompetitorProfilesEditor(readCompetitorProfilesEditor().filter((_, itemIndex) => itemIndex !== index));
  });
  $("#customerAiBtn").addEventListener("click", () => analyzeCustomer(Number($("#customerForm [name=opportunityId]").value)));
  $("#customerArchiveBtn").addEventListener("click", () => archiveCustomerFromDialog().catch((error) => toast(error.message)));
  $("#followHistoryList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-restore-customer]");
    if (button) restoreCustomer(Number(button.dataset.restoreCustomer)).catch((error) => toast(error.message));
  });
  $("#batchForm").addEventListener("submit", batchImport);
  $("#assignForm").addEventListener("submit", batchAssignCustomers);
  $("#targetForm").addEventListener("submit", saveTarget);
  $("#recommendBtn").addEventListener("click", recommend);
  $("#aiResult").addEventListener("click", (event) => {
    if (event.target.closest("#saveAiFollowBtn")) saveAiFollowDraft().catch((error) => toast(error.message));
  });
  $("#knowledgeForm").addEventListener("submit", addKnowledge);
  $("#userForm").addEventListener("submit", addUser);
  $("#roleForm").addEventListener("submit", addRole);
  $("#unitForm").addEventListener("submit", addUnit);
  $("#competitorForm").addEventListener("submit", addCompetitor);
  $("#productForm").addEventListener("submit", addProduct);
  $("#customerProductSelect").addEventListener("change", (event) => fillAmountFromProduct($("#customerForm"), event.target.value));
  $("#newOpportunityProductSelect").addEventListener("change", (event) => fillAmountFromProduct($("#newOpportunityForm"), event.target.value));
  $("#openUserImportBtn").addEventListener("click", () => $("#userImportDialog").showModal());
  $("#userImportForm").addEventListener("submit", importUsers);
  $("#offboardForm").addEventListener("submit", submitOffboard);
  $("#userList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "delete-user") deleteUser(button.dataset.id);
    if (button.dataset.action === "reset-password") openResetPasswordDialog(button.dataset.id);
    if (button.dataset.action === "offboard-user") openOffboardDialog(button.dataset.id);
  });
  $("#unitList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='delete-unit']");
    if (button) deleteUnit(button.dataset.id);
  });
  $("#productList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='update-product-price']");
    if (button) updateProductPrice(button.dataset.id).catch((error) => toast(error.message));
  });
  $("#fieldModeSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-map-mode]");
    if (!button) return;
    fieldMapMode = button.dataset.mapMode;
    $$("#fieldModeSwitch button").forEach((item) => item.classList.toggle("active", item === button));
    renderFieldMap(fieldPoints);
    renderFieldSummary(fieldMapResult);
  });
  ["mapProvinceFilter", "mapCityFilter", "mapDistrictFilter", "mapOwnerFilter", "mapUnitFilter", "mapZoneFilter", "mapStageFilter", "mapPointStatusFilter"].forEach((id) => $(`#${id}`).addEventListener("change", renderField));
  ["mapEquipmentFilter", "mapSoftwareFilter"].forEach((id) => $(`#${id}`).addEventListener("change", renderField));
  $("#mapFilterReset").addEventListener("click", () => {
    $$(".field-filters select, .field-filters input").forEach((node) => { node.value = ""; });
    renderField();
  });
  $("#visitList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-map-customer]");
    if (button) openCustomerFromMap(Number(button.dataset.mapCustomer));
  });
}

wireEvents();
if (requireLogin()) loadState().catch((error) => toast(error.message));
window.addEventListener("focus", () => {
  if (session() && currentView === "customers") loadState().catch(() => {});
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
