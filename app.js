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

function stageTimeConfig(stage = currentStage) {
  if (stage === "名单") return { label: "录入时间", field: "createdAt" };
  if (stage === "成交") return { label: "成交时间", field: "dealAt" };
  return { label: "转化时间", field: stage === "商机" ? "opportunityAt" : "leadAt" };
}

function customerStageTime(customer = {}, stage = currentStage) {
  const config = stageTimeConfig(stage);
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
  if (!response.ok) throw new Error(data.error || `请求失败 ${response.status}`);
  return data;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2400);
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
  } catch (error) {
    toast(error.message || "登录失败");
  }
}

function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_KEY);
  requireLogin();
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

function renderDashboard() {
  const customers = scopeCustomers();
  const signed = customers.filter((item) => item.stage === "成交");
  const payment = signed.reduce((sum, item) => sum + Number(item.amount || 0), 0) * 2.8;
  const todayFollow = customers.filter((item) => item.lastFollow === today).length;
  const overdue = customers.filter((item) => item.nextFollow && item.nextFollow < today).length;
  $("#metricPayment").textContent = `¥${payment.toFixed(1)}万`;
  $("#metricSigned").textContent = `${signed.length}家`;
  $("#metricFollow").textContent = `${todayFollow}条`;
  $("#metricOverdue").textContent = `${overdue}个`;

  const lists = customers.filter((item) => item.stage === "名单").length;
  const leads = customers.filter((item) => item.stage === "线索").length;
  const deals = customers.filter((item) => item.stage === "商机").length;
  const problems = [
    ["逾期跟进", `${overdue}个`, overdue ? "严重" : "正常", overdue ? "优先处理逾期商机，再跟进今日到期线索。" : "保持当前节奏，每条新增客户都设置下次跟进。"],
    ["名单转线索", `${lists}个名单`, leads < lists ? "警告" : "正常", "优先筛选有设计拆单、报价、开料排产痛点的工厂。"],
    ["商机推进", `${deals}个商机`, deals ? "警告" : "严重", "约老板、设计主管、生产主管一起看真实订单演示。"]
  ];
  $("#problemList").innerHTML = problems
    .map(([name, value, level, advice]) => `<div class="problem"><b>${name}</b><span class="${level === "严重" ? "danger" : "warn"}">${level}</span><strong>${value}</strong><p>${advice}</p></div>`)
    .join("");

  const counts = stages.map((stage) => ({ stage, count: customers.filter((item) => item.stage === stage).length }));
  const max = Math.max(...counts.map((item) => item.count), 1);
  $("#funnelChart").innerHTML = counts
    .map((item) => `<div class="funnel-row"><span>${item.stage}</span><i style="width:${Math.max((item.count / max) * 100, 8)}%"></i><b>${item.count}</b></div>`)
    .join("");
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
    if (item.stage !== currentStage) return false;
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
  $("#customerResultCount").textContent = `当前${currentStage}：${filteredRows.length}条`;
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
  return `
    <tr>
      <td class="select-cell"><input type="checkbox" class="customer-select" data-id="${item.id}" ${checked} ${disabled} title="${title}" /></td>
      <td><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.stage || "")}</small></td>
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
  form.stage.value = customer?.stage || currentStage;
  form.owner.value = customer?.owner || $("#customerOwnerSelect").value;
  form.createdBy.value = customer?.createdBy || currentUser().name || "";
  form.followPerson.value = customer?.followPerson || customer?.owner || form.owner.value;
  form.address.value = customer?.address || "";
  form.amount.value = customer?.amount || 15;
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
    software: String(form.get("software") || "待补充"),
    createdAt: id ? undefined : today,
    lastFollow: today,
    nextFollow: String(form.get("nextFollow") || ""),
    lastNote: String(form.get("note") || "更新了客户跟进。")
  };
  if (id) {
    await api(`/customers/${id}`, { method: "PUT", body: customer });
  } else {
    await api("/customers", { method: "POST", body: customer });
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
  importBody.append("stage", currentStage);
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
  toast(`已导入 ${result.imported || 0} 个客户`);
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
    .map((user) => `<article><b>${escapeHtml(user.name)}</b><span>${user.status || "启用"}</span><p>${escapeHtml(user.role)} · ${escapeHtml(user.unit || "待分配")} · ${escapeHtml(user.zone || "未分战区")} · 账号：${escapeHtml(user.account || user.username || user.phone || "-")}</p><button data-action="delete-user" data-id="${user.id}">删除员工</button></article>`)
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
  const form = new FormData(event.currentTarget);
  const role = roles().find((item) => item.id === form.get("roleId")) || roles()[0];
  const unit = (state.units || []).find((item) => item.id === form.get("unitId")) || {};
  await api("/users", {
    method: "POST",
    body: {
      name: form.get("name"),
      account: form.get("account"),
      password: form.get("password"),
      phone: form.get("account"),
      roleId: role.id,
      role: role.name,
      unitId: unit.id,
      unit: unit.name || "待分配",
      region: unit.zone || "待分区"
    }
  });
  event.currentTarget.reset();
  await loadState();
  toast("员工添加成功");
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
  const form = new FormData(event.currentTarget);
  await api("/units", {
    method: "POST",
    body: {
      name: String(form.get("name") || "").trim(),
      zone: form.get("zone")
    }
  });
  event.currentTarget.reset();
  await loadState();
  toast("单位添加成功");
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

function wireEvents() {
  $("#downloadTemplateLink").href = `${API_BASE}/import/customers/template`;
  $("#loginForm").addEventListener("submit", login);
  $("#logoutBtn").addEventListener("click", logout);
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
    currentStage = button.dataset.stage;
    customerPage = 1;
    renderCustomers();
  });
  ["customerKeyword", "channelFilter", "createdByFilter", "followPersonFilter", "unitFilter", "stageTimeStart", "stageTimeEnd", "lastFollowStart", "lastFollowEnd", "nextFollowStart", "nextFollowEnd"].forEach((id) => {
    const resetAndRender = () => {
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
  $("#recommendBtn").addEventListener("click", recommend);
  $("#knowledgeForm").addEventListener("submit", addKnowledge);
  $("#userForm").addEventListener("submit", addUser);
  $("#roleForm").addEventListener("submit", addRole);
  $("#unitForm").addEventListener("submit", addUnit);
  $("#userList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='delete-user']");
    if (button) deleteUser(button.dataset.id);
  });
  $("#unitList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='delete-unit']");
    if (button) deleteUnit(button.dataset.id);
  });
}

wireEvents();
if (requireLogin()) loadState().catch((error) => toast(error.message));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
