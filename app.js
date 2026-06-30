function getWebApiBase() {
  if (window.ZHIXIAO_API_BASE) return window.ZHIXIAO_API_BASE;
  if (window.location.protocol === "file:") return "http://127.0.0.1:8787/api";
  const path = window.location.pathname || "/";
  const crmMatch = path.match(/^(\/crm)\/?/i);
  const prefix = crmMatch ? crmMatch[1] : "";
  return `${window.location.origin}${prefix}/api`;
}

const API_BASE = getWebApiBase();
const AUTH_KEY = "zhixiao-web-auth";
const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const stages = ["名单", "线索", "商机", "成交"];
const PUBLIC_POOL_STAGE = "公海";
const PURCHASED_STAGE = "已购";
const INVALID_STAGE = "无效";
const defaultChannelSources = ["自媒体", "官网留言", "自主注册", "渠道介绍", "企查查", "客源汇", "公众号", "地推", "其他"];
let channelSources = [...defaultChannelSources];
const zones = ["东部战区", "南部战区", "西部战区", "北部战区", "中部战区"];
const scopeLabels = { self: "仅本人客户", unit: "本单位客户", zone: "本战区客户", all: "全部客户" };
const permissionLabels = { dashboard: "看板", customers: "客户管理", field: "地推地图", assistant: "AI话术", publicPoolImport: "公海导入", admin: "系统设置" };
const defaultRoles = [
  { id: "role-owner", name: "总负责人", customerScope: "all", permissions: ["dashboard", "customers", "field", "assistant", "publicPoolImport", "admin"] },
  { id: "role-region", name: "区域经理", customerScope: "zone", permissions: ["dashboard", "customers", "field", "assistant"] },
  { id: "role-supervisor", name: "主管", customerScope: "unit", permissions: ["dashboard", "customers", "field", "assistant"] },
  { id: "role-sales", name: "销售", customerScope: "self", permissions: ["dashboard", "customers", "field", "assistant"] },
  { id: "role-ops", name: "运营", customerScope: "all", permissions: ["dashboard", "customers", "field", "assistant", "publicPoolImport"] },
  { id: "role-admin", name: "管理员", customerScope: "all", permissions: ["dashboard", "customers", "field", "assistant", "publicPoolImport", "admin"] }
];
const defaultBusinessRules = {
  newCustomerProtectionDays: 30,
  publicPoolClaimProtectionDays: 3,
  inactivePublicPoolDays: 30,
  dealCustomersEnterPublicPool: false,
  purchasedCustomersEnterPublicPool: false,
  systemFollowCounts: false,
  importFollowCounts: true,
  selfImportCountsAssignedUnfollowed: false,
  publicPoolSortMode: "daily_spread"
};
const orgRootId = "org-root";
const orgTypeLabels = { root: "根节点", department: "一级部门", battle_zone: "战区", unit: "单位", team: "小组" };
const orgTypeOptions = [
  { value: "department", label: "一级部门" },
  { value: "battle_zone", label: "战区" },
  { value: "unit", label: "单位" },
  { value: "team", label: "小组" }
];

let state = { users: [], customers: [], opportunities: [], products: [], visits: [], knowledge: [], stages, roles: defaultRoles, units: [], competitors: [], routes: [], channelSources: [], lossReasons: [], businessRules: defaultBusinessRules };
const CUSTOMER_STAGE_KEY = "zhixiao-current-customer-stage";
let currentStage = localStorage.getItem(CUSTOMER_STAGE_KEY) || stages[0];
let currentView = "customers";
let currentSettingsTab = "employees";
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
let customerPageSize = 20;
let customerBoardData = null;
let customerBoardLoading = false;
let customerBoardRequestId = 0;
let dashboardData = null;
let dashboardRequestId = 0;
let dashboardLoadTimer = null;
let dashboardReady = false;
let dashboardLoading = false;
let targetManagement = { options: [], targets: [] };
let dashboardDrilldownIds = null;
let collapsedUserUnitIds = new Set();
let knownUserUnitIds = new Set();
let claimingOpportunityIds = new Set();
let fieldRequestId = 0;

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

function unitLabel(unit = {}) {
  return unit.path || [unit.zone, unit.name].filter(Boolean).join(" / ") || unit.name || "待分配";
}

function selectableUnits() {
  return (state.units || []).filter((unit) => unit.active !== false && unit.type !== "root");
}

function unitDescendantIds(unitId) {
  const ids = new Set();
  if (!unitId) return ids;
  ids.add(String(unitId));
  let changed = true;
  while (changed) {
    changed = false;
    (state.units || []).forEach((unit) => {
      if (!ids.has(String(unit.id)) && ids.has(String(unit.parentId || ""))) {
        ids.add(String(unit.id));
        changed = true;
      }
    });
  }
  return ids;
}

function battleZoneForUser(user = {}) {
  let unit = unitForId(user.unitId);
  while (unit && unit.id) {
    if (unit.type === "battle_zone") return unit;
    unit = unitForId(unit.parentId);
  }
  return (state.units || []).find((unit) => unit.type === "battle_zone" && unit.zone === user.zone) || null;
}

function managedUnitIdsFor(user = currentUser()) {
  const role = roleForUser(user);
  if (role.customerScope === "all") return new Set((state.units || []).map((unit) => String(unit.id)));
  if (role.customerScope === "unit") return unitDescendantIds(user.unitId);
  if (role.customerScope === "zone") {
    const zoneUnit = battleZoneForUser(user);
    if (zoneUnit) return unitDescendantIds(zoneUnit.id);
    return new Set((state.units || []).filter((unit) => unit.zone === user.zone).map((unit) => String(unit.id)));
  }
  return new Set();
}

function renderUnitOptions(selectedId = "", options = {}) {
  const units = (options.includeRoot ? state.units || [] : selectableUnits()).filter((unit) => !options.excludeIds?.has(String(unit.id)));
  return units
    .map((unit) => `<option value="${escapeHtml(unit.id)}" ${String(unit.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(unitLabel(unit))}</option>`)
    .join("");
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
  const managed = managedUnitIdsFor(user);
  if (managed.has(String(unitId))) return true;
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
  const users = (state.users || []).filter((item) => item.status !== "停用");
  if (role.customerScope === "all") return users;
  const managed = managedUnitIdsFor(user);
  return users.filter((item) => {
    if (item.id === user.id) return true;
    if (managed.has(String(item.unitId))) return true;
    if (role.customerScope === "zone") return item.zone === user.zone;
    if (role.customerScope === "unit") return item.unitId === user.unitId;
    return false;
  });
}

function visibleSales() {
  return visibleUsers().filter((user) => roleForUser(user).name === "销售" || user.role === "销售");
}

function canOwnCustomer(user = {}) {
  if (user.status === "停用") return false;
  const roleName = roleForUser(user).name || user.role || "";
  return ["销售", "主管", "区域经理"].includes(roleName);
}

function visibleFollowUsers() {
  return visibleUsers().filter(canOwnCustomer);
}

function productById(productId) {
  return (state.products || []).find((item) => item.id === productId) || {};
}

function isPlaceholderProduct(product = {}) {
  const name = String(product.name || product.productName || "").trim();
  return !name || name === "待确认产品";
}

function selectableProducts() {
  return (state.products || [])
    .filter((item) => item.active !== false && !isPlaceholderProduct(item))
    .sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0) || String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans-CN"));
}

function productOptionsHtml(placeholder = "请选择意向产品") {
  return `<option value="" disabled selected>${escapeHtml(placeholder)}</option>${selectableProducts()
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}${Number(item.price || 0) > 0 ? ` · ${escapeHtml(formatMoney(item.price))}` : ""}</option>`)
    .join("")}`;
}

function productDefaultAmount(productId) {
  const price = Number(productById(productId).price || 0);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function fillAmountFromProduct(form, productId) {
  if (!form?.amount) return;
  form.amount.value = productDefaultAmount(productId);
}

function parseCustomerSortValue(value = "") {
  const [sortBy, sortOrder] = String(value || "").split("_");
  const allowed = new Set(["lastFollow", "createdAt", "nextFollow", "assignedAt"]);
  if (!allowed.has(sortBy)) return {};
  return { sortBy, sortOrder: sortOrder === "asc" ? "asc" : "desc" };
}

function setCustomerSortValue(value) {
  const select = $("#customerSort");
  if (select) select.value = value || "default";
}

function selectableLossReasons(options = {}) {
  const currentValue = String(options.includeValue || "").trim();
  const reasons = (state.lossReasons || [])
    .filter((item) => item.active !== false || (currentValue && item.name === currentValue))
    .sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0) || String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans-CN"));
  if (currentValue && !reasons.some((item) => item.name === currentValue)) {
    reasons.push({ id: `current-${currentValue}`, name: currentValue, active: true, sort: 999 });
  }
  return reasons;
}

function lossReasonOptionsHtml(selected = "") {
  return `<option value="">请选择目前未成交原因</option>${selectableLossReasons({ includeValue: selected })
    .map((item) => `<option value="${escapeHtml(item.name)}" ${item.name === selected ? "selected" : ""}>${escapeHtml(item.name)}</option>`)
    .join("")}`;
}

function toggleLossReasonDetailField(form = $("#customerForm")) {
  if (!form) return;
  const field = $("#lossReasonDetailField");
  const detailInput = form.elements.lossReasonDetail;
  const selected = String(form.elements.lossReason?.value || "").trim();
  const shouldShow = selected === "功能原因";
  field?.classList.toggle("hidden", !shouldShow);
  if (!shouldShow && detailInput) detailInput.value = "";
}

function latestFollow(customer = {}) {
  return customer.lastFollow || customer.createdAt || "";
}

function isManualEffectiveFollow(item = {}) {
  const note = String(item.note || "").trim();
  return !item.isSystem && Boolean(note) && !["新增客户。", "名单文件导入。", "更新了客户信息。"].includes(note);
}

function manualFollowUps(customer = {}) {
  if ((!Array.isArray(customer.followUps) || !customer.followUps.length) && Number(customer.manualFollowCount || customer.followCount || 0) > 0) {
    return [{
      date: customer.lastFollow || customer.latestManualFollowAt || "",
      createdAt: customer.latestManualFollowAt || customer.lastFollow || "",
      author: customer.lastFollowAuthor || "",
      note: customer.lastNote || "",
      nextFollow: customer.nextFollow || "",
      isSystem: false
    }];
  }
  return (customer.followUps || []).filter(isManualEffectiveFollow);
}

function latestManualFollow(customer = {}) {
  return manualFollowUps(customer)
    .slice()
    .sort((left, right) => Date.parse(right.createdAt || right.date || 0) - Date.parse(left.createdAt || left.date || 0))[0] || null;
}

function latestManualFollowDate(customer = {}) {
  const latest = latestManualFollow(customer);
  return String(latest?.date || latest?.createdAt || "").slice(0, 10);
}

function ownershipLabel(customer = {}) {
  if (isInvalidCustomer(customer)) return customer.archiveReason === "closed" ? "倒闭客户" : "无效客户";
  if (isPurchasedCustomer(customer)) return "已购客户";
  if (customer.ownershipStatus === "public_pool" || customer.ownershipStatus === "claimable") return "公海客户";
  const days = Number(customer.claimDaysRemaining || 0);
  if (days > 0) return `保护期剩${days}天`;
  return "";
}

function isInvalidCustomer(customer = {}) {
  return customer.lifecycleStatus === "archived";
}

function isPublicPoolCustomer(customer = {}) {
  return !isInvalidCustomer(customer) && customer.ownershipStatus === "public_pool";
}

function isPurchasedCustomer(customer = {}) {
  return !isInvalidCustomer(customer) && !isPublicPoolCustomer(customer) && customer.outcomeStatus === "purchased_existing";
}

function isReadonlyStage(stage = currentStage) {
  return stage === PUBLIC_POOL_STAGE || stage === PURCHASED_STAGE || stage === INVALID_STAGE;
}

function stageTimeConfig(stage = currentStage) {
  if (stage === "全部") return { label: "阶段时间", field: "createdAt" };
  if (stage === PUBLIC_POOL_STAGE) return { label: "进入公海", field: "publicPoolAt" };
  if (stage === PURCHASED_STAGE) return { label: "标记已购", field: "purchasedAt" };
  if (stage === INVALID_STAGE) return { label: "归档时间", field: "archivedAt" };
  if (stage === "名单") return { label: "录入时间", field: "createdAt" };
  if (stage === "成交") return { label: "成交时间", field: "dealAt" };
  return { label: "转化时间", field: stage === "商机" ? "opportunityAt" : "leadAt" };
}

function customerStageTime(customer = {}, stage = currentStage) {
  if ((stage === PURCHASED_STAGE || isPurchasedCustomer(customer)) && customer.purchasedInfo) {
    return String(customer.purchasedInfo.purchasedAt || customer.purchasedInfo.revisitAt || customer.effectiveFollowUpAt || customer.lastFollow || "").slice(0, 10);
  }
  const config = stageTimeConfig(stage === "全部" ? customer.stage : stage);
  return String(customer[config.field] || "").slice(0, 10);
}

function optionList(label, values) {
  const options = [...new Set(values.filter(Boolean))];
  return `<option value="">${label}</option>${options.map((value) => `<option>${escapeHtml(value)}</option>`).join("")}`;
}

function datalistOptions(values) {
  return [...new Set(values.filter(Boolean))]
    .map((value) => `<option value="${escapeHtml(value)}"></option>`)
    .join("");
}

function textIncludes(value, keyword) {
  if (!keyword) return true;
  return String(value || "").toLowerCase().includes(String(keyword || "").toLowerCase());
}

function normalizeChannelSource(value) {
  const text = String(value || "").trim();
  if (!text) return "其他";
  if (channelSources.includes(text)) return text;
  const aliases = { 官方资源: "官网留言", 官网: "官网留言", 网站留言: "官网留言", 官网注册: "自主注册", 注册: "自主注册", 转介绍: "渠道介绍", 介绍: "渠道介绍", 企查: "企查查", 微信公众号: "公众号", 手动录入: "其他", 批量导入: "其他", 展会: "其他" };
  return aliases[text] || text || "其他";
}

function updateChannelSourcesFromState() {
  const configured = state.channelSources || [];
  const names = configured
    .filter((item) => typeof item === "string" || item.active !== false)
    .map((item) => String(typeof item === "string" ? item : item.name || "").trim())
    .filter(Boolean);
  channelSources = [...new Set([...(configured.length ? [] : defaultChannelSources), ...names])];
}

function visibleSystemUsers() {
  return visibleUsers().filter((user) => !isHiddenDemoUser(user));
}

function isHiddenDemoUser(user = {}) {
  const account = String(user.account || user.username || "").toLowerCase();
  return ["linchen", "zhouyang"].includes(account) && ["林晨", "周扬"].includes(user.name);
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
  if (isPurchasedCustomer(customer)) return false;
  if (customer.ownershipStatus === "public_pool") return customer.stage !== "成交";
  if (customer.stage === "名单") return true;
  if (!["线索", "商机"].includes(customer.stage)) return false;
  const latest = latestFollow(customer);
  return !latest || daysSince(latest) >= 30;
}

function canSelectCustomerForAssign(customer = {}) {
  if (isInvalidCustomer(customer)) return false;
  return canAssignCustomers() && canSeePrivateRecord(customer) && isCustomerAssignable(customer);
}

function canSelectCustomer(customer = {}) {
  return canSelectCustomerForAssign(customer) || canBulkEditChannelSource();
}

function rollbackTargetForStage(stage = "") {
  if (stage === "线索") return "名单";
  if (stage === "商机") return "线索";
  return "";
}

function latestPendingRollback(customer = {}) {
  return (customer.rollbackHistory || []).slice().reverse().find((item) => item.status === "pending") || null;
}

function canReviewRollback() {
  return canAssignCustomers();
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
  let data = {};
  let parseError = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      parseError = error;
      data = {
        error: response.ok
          ? "服务器返回异常内容，请刷新后重试"
          : `服务器接口异常（${response.status}），请稍后重试`,
        detail: /^\s*</.test(text) ? "网关或服务器返回了HTML错误页" : text.slice(0, 120)
      };
    }
  }
  if (response.status === 401) {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
    requireLogin();
  }
  if (parseError || !response.ok) {
    const error = new Error(data.error || `请求失败 ${response.status}`);
    error.code = data.code || "";
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function rowByOpportunityId(id) {
  const numericId = Number(id);
  return currentCustomerRows.find((item) => Number(item.id) === numericId)
    || currentFilteredCustomerRows.find((item) => Number(item.id) === numericId)
    || scopeOpportunityRows().find((item) => Number(item.id) === numericId)
    || null;
}

function mergeOpportunityDetail(detail = {}) {
  if (!detail?.id) return detail;
  const mergeList = (list = []) => list.map((item) => Number(item.id) === Number(detail.id) ? { ...item, ...detail, hasDetail: true } : item);
  currentCustomerRows = mergeList(currentCustomerRows);
  currentFilteredCustomerRows = mergeList(currentFilteredCustomerRows);
  state.opportunities = mergeList(state.opportunities || []);
  state.customers = mergeList(state.customers || []);
  if (customerBoardData?.items) customerBoardData.items = mergeList(customerBoardData.items);
  return detail;
}

async function fetchOpportunityDetail(id, fallback = null) {
  const current = fallback || rowByOpportunityId(id);
  if (current?.hasDetail && Array.isArray(current.followUps)) return current;
  const detail = await api(`/opportunities/${Number(id)}/detail`);
  return mergeOpportunityDetail({ ...current, ...detail, hasDetail: true });
}

function debounce(fn, wait = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2400);
}

function setFormSubmitting(form, submitting, loadingText) {
  const button = form.querySelector("button[type='submit'], button.primary[value='save'], button.primary:not([type]), button.primary");
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
  const normalized = normalizeImportResult(result);
  const total = normalized.total;
  const imported = normalized.imported;
  const duplicates = normalized.duplicates;
  const duplicateCustomers = normalized.duplicateCustomers;
  const duplicateOpportunities = normalized.duplicateOpportunities;
  const failed = normalized.failed;
  const pendingLocation = normalized.pendingLocation;
  const channelUnrecognized = normalized.channelUnrecognized;
  const details = [
    ...normalized.skipped,
    ...normalized.failures,
    ...normalized.warnings
  ];
  $("#importResultTitle").textContent = failed && !imported && !duplicates
    ? `${entityLabel}导入失败`
    : duplicates && !imported && !failed
      ? `重复${entityLabel}未导入`
      : `${entityLabel}导入完成`;
  $("#importResultStats").innerHTML = [
    ["总行数", total, ""],
    ["成功", imported, "success"],
    ["重复客户", duplicateCustomers, "warning"],
    ["重复机会", duplicateOpportunities, "warning"],
    ...(duplicates && !duplicateCustomers && !duplicateOpportunities ? [["跳过", duplicates, "warning"]] : []),
    ["失败", failed, "danger"],
    ...(channelUnrecognized ? [["渠道未识别", channelUnrecognized, "warning"]] : []),
    ...(pendingLocation ? [["待定位", pendingLocation, "warning"]] : [])
  ].map(([label, value, className]) => `<div class="${className}"><span>${label}</span><b>${value}</b></div>`).join("");
  $("#importResultDetails").innerHTML = details.length
    ? details.map((item) => {
      const rowLabel = item.rowNumber ? `第${escapeHtml(item.rowNumber)}行 · ` : "";
      const meta = [
        item.phone || "手机号未填写",
        item.productName ? `意向产品：${item.productName}` : "",
        item.status ? `状态：${item.status}` : "",
        item.code ? `代码：${item.code}` : ""
      ].filter(Boolean).join(" · ");
      return `<article><b>${rowLabel}${escapeHtml(item.name || "未命名客户")}</b><span>${escapeHtml(meta)} · ${escapeHtml(item.reason || "未导入")}</span></article>`;
    }).join("")
    : `<div class="empty">本次没有未导入${entityLabel}</div>`;
  const copyButton = $("#importResultCopy");
  if (copyButton) {
    copyButton.hidden = !details.length;
    copyButton.onclick = async () => {
      const text = details.map((item) => [
        item.rowNumber ? `第${item.rowNumber}行` : "未知行",
        item.name || "未命名客户",
        item.phone || "手机号未填写",
        item.productName ? `意向产品:${item.productName}` : "",
        item.status ? `状态:${item.status}` : "",
        item.reason || "未导入",
        item.code ? `代码:${item.code}` : ""
      ].filter(Boolean).join(" | ")).join("\n");
      try {
        await navigator.clipboard.writeText(text);
        toast("未导入明细已复制");
      } catch {
        toast("复制失败，请下载CSV明细");
      }
    };
  }
  const link = $("#importResultDownload");
  if (normalized.reportUrl) {
    const apiOrigin = API_BASE.replace(/\/api\/?$/, "");
    link.href = normalized.reportUrl.startsWith("http") ? normalized.reportUrl : `${apiOrigin}${normalized.reportUrl}`;
    link.hidden = false;
  } else {
    link.hidden = true;
    link.removeAttribute("href");
  }
  const dialog = $("#importResultDialog");
  if (!dialog.open) dialog.showModal();
}

function normalizeImportResult(result = {}) {
  const skipped = Array.isArray(result.skipped) ? result.skipped : [];
  const failures = Array.isArray(result.failures) ? result.failures : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const duplicateCustomerRows = Array.isArray(result.duplicateCustomerRows) ? result.duplicateCustomerRows : [];
  const duplicateOpportunityRows = Array.isArray(result.duplicateOpportunityRows) ? result.duplicateOpportunityRows : [];
  return {
    total: Number(result.total || 0),
    imported: Number(result.imported || 0),
    duplicates: Number(result.duplicates ?? skipped.length ?? 0),
    duplicateCustomers: Number(result.duplicateCustomers ?? duplicateCustomerRows.length ?? 0),
    duplicateOpportunities: Number(result.duplicateOpportunities ?? duplicateOpportunityRows.length ?? 0),
    failed: Number(result.failed ?? failures.length ?? 0),
    channelUnrecognized: Number(result.channelUnrecognized ?? warnings.length ?? 0),
    pendingLocation: Number(result.pendingLocation || 0),
    pendingGeocode: Number(result.pendingGeocode || 0),
    reportUrl: result.reportUrl || "",
    skipped,
    warnings,
    failures
  };
}

function importErrorResult(error) {
  const data = error?.data || {};
  const skipped = Array.isArray(data.skipped) ? data.skipped : [];
  let failures = Array.isArray(data.failures) ? data.failures : [];
  if (!skipped.length && !failures.length) {
    failures = [{ rowNumber: "", name: "", phone: "", productName: "", status: "", code: data.code || "", reason: data.error || error?.message || "导入失败" }];
  }
  return {
    total: Number(data.total || 0),
    imported: Number(data.imported || 0),
    duplicates: Number(data.duplicates || skipped.length || 0),
    duplicateCustomers: Number(data.duplicateCustomers || 0),
    duplicateOpportunities: Number(data.duplicateOpportunities || 0),
    failed: Number(data.failed || failures.length || 1),
    channelUnrecognized: Number(data.channelUnrecognized || 0),
    pendingLocation: Number(data.pendingLocation || 0),
    reportUrl: data.reportUrl || "",
    skipped,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    failures
  };
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
      await refreshCustomersAfterMutation();
    }
  } catch {}
}

async function loadState(options = {}) {
  if (options.full === true) {
    const includePublicPool = options.includePublicPool ?? false;
    state = await api(`/state?lite=1${includePublicPool ? "&includePublicPool=1" : ""}`);
    updateChannelSourcesFromState();
    if (options.render !== false) render();
    return;
  }
  await loadAppState({ render: options.render !== false });
}

async function loadAppState(options = {}) {
  const next = await api("/state?lite=1&metadata=1");
  state = {
    ...next,
    customers: state.customers || [],
    opportunities: state.opportunities || [],
    visits: state.visits || [],
    activities: state.activities || []
  };
  updateChannelSourcesFromState();
  if (options.render !== false) render();
}

function isPublicPoolLoaded() {
  return Boolean(state.publicPool?.loaded)
    || (state.opportunities || []).some((item) => item.ownershipStatus === "public_pool");
}

function customerBoardQuery() {
  sanitizeCustomerFiltersForStage(currentStage);
  const params = new URLSearchParams({
    paginated: "1",
    stage: currentStage,
    page: String(customerPage),
    pageSize: String(customerPageSize)
  });
  const values = {
    keyword: $("#customerKeyword")?.value?.trim() || "",
    channelSource: $("#channelFilter")?.value || "",
    createdBy: $("#createdByFilter")?.value?.trim() || "",
    followPerson: $("#followPersonFilter")?.value?.trim() || "",
    unit: $("#unitFilter")?.value || "",
    city: $("#cityFilter")?.value || "",
    followStatus: $("#followStatusFilter")?.value || "",
    stageStart: $("#stageTimeStart")?.value || "",
    stageEnd: $("#stageTimeEnd")?.value || "",
    lastStart: $("#lastFollowStart")?.value || "",
    lastEnd: $("#lastFollowEnd")?.value || "",
    nextStart: $("#nextFollowStart")?.value || "",
    nextEnd: $("#nextFollowEnd")?.value || ""
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const sort = parseCustomerSortValue($("#customerSort")?.value || "");
  if (sort.sortBy) {
    params.set("sortBy", sort.sortBy);
    params.set("sortOrder", sort.sortOrder);
  }
  if (dashboardDrilldownIds?.size) params.set("ids", [...dashboardDrilldownIds].join(","));
  return params;
}

async function loadCustomerBoardPage(options = {}) {
  if (!session()) return;
  const requestId = ++customerBoardRequestId;
  customerBoardLoading = true;
  if (options.keepData !== true) customerBoardData = null;
  if (options.renderLoading !== false) renderCustomers();
  try {
    const data = await api(`/customer-board?${customerBoardQuery().toString()}`);
    if (requestId !== customerBoardRequestId) return;
    customerBoardData = data;
    state = {
      ...state,
      stages: data.stages || state.stages || stages,
      opportunities: data.items || [],
      customers: data.items || [],
      publicPool: { ...(state.publicPool || {}), ...(data.publicPool || {}), loaded: currentStage === PUBLIC_POOL_STAGE },
      purchased: data.purchased || state.purchased,
      invalid: data.invalid || state.invalid
    };
    customerPage = Number(data.page || customerPage);
    customerPageSize = Number(data.pageSize || customerPageSize);
    customerBoardLoading = false;
    renderCustomers();
  } catch (error) {
    if (requestId !== customerBoardRequestId) return;
    customerBoardLoading = false;
    customerBoardData = { items: [], total: 0, page: customerPage, pageSize: customerPageSize, stageCounts: customerBoardData?.stageCounts || {} };
    renderCustomers();
    toast(error.message || "客户列表加载失败");
  }
}

async function refreshCustomersAfterMutation(options = {}) {
  customerBoardData = null;
  await loadCustomerBoardPage({ renderLoading: options.renderLoading !== false });
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
  const formNode = event.currentTarget;
  const form = new FormData(formNode);
  setFormSubmitting(formNode, true, "登录中...");
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: { account: form.get("account"), password: form.get("password") }
    });
    setSession({ token: data.token, user: data.user });
    state = { ...state, users: data.user ? [data.user] : state.users };
    currentView = "customers";
    currentStage = localStorage.getItem(CUSTOMER_STAGE_KEY) || stages[0];
    customerPage = 1;
    customerBoardData = null;
    dashboardData = null;
    dashboardReady = false;
    requireLogin();
    switchView("customers", { skipLoad: true });
    await loadAppState({ render: false });
    await loadCustomerBoardPage({ renderLoading: true });
    toast("登录成功");
    if (data.user?.passwordChangeRecommended) {
      $("#passwordReminderDialog").showModal();
    }
  } catch (error) {
    toast(error.message || "登录失败");
  } finally {
    setFormSubmitting(formNode, false, "登录中...");
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

function openEditUserDialog(id) {
  const user = state.users.find((item) => Number(item.id) === Number(id));
  if (!user) return;
  const form = $("#editUserForm");
  form.reset();
  form.elements.userId.value = user.id;
  form.elements.name.value = user.name || "";
  form.elements.account.value = user.account || user.username || user.phone || "";
  form.elements.status.value = user.status || "启用";
  $("#editUserRoleSelect").innerHTML = roles()
    .map((role) => `<option value="${escapeHtml(role.id)}" ${role.id === user.roleId || role.name === user.role ? "selected" : ""}>${escapeHtml(role.name)}</option>`)
    .join("");
  $("#editUserUnitSelect").innerHTML = renderUnitOptions(user.unitId);
  $("#editUserSummary").textContent = `调整 ${user.name} 的角色、单位或账号状态；不会删除原账号和客户资料。`;
  $("#editUserDialog").showModal();
}

async function submitEditUser(event) {
  event.preventDefault();
  const formNode = event.currentTarget;
  const form = new FormData(formNode);
  const userId = Number(form.get("userId"));
  const role = roles().find((item) => item.id === form.get("roleId"));
  const unit = (state.units || []).find((item) => item.id === form.get("unitId"));
  const name = String(form.get("name") || "").trim();
  if (!name) return toast("请填写员工姓名");
  if (!role) return toast("请选择角色");
  if (!unit) return toast("请选择单位");
  setFormSubmitting(formNode, true, "保存中...");
  try {
    await api(`/users/${userId}`, {
      method: "PUT",
      body: {
        name,
        roleId: role.id,
        role: role.name,
        unitId: unit.id,
        unit: unit.name,
        status: form.get("status") || "启用"
      }
    });
    $("#editUserDialog").close();
    await loadState();
    showSuccessFeedback("员工信息已更新", `${name} 的角色、单位和权限已更新；该员工重新登录后生效。`);
  } catch (error) {
    toast(error.message || "员工信息保存失败");
  } finally {
    setFormSubmitting(formNode, false, "保存中...");
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
  return opportunities.map(opportunityRow).filter((item) => {
    if (isInvalidCustomer(item)) return true;
    return item.ownershipStatus === "public_pool" || canSeeRecord(item);
  });
}

function scopeVisits() {
  const user = currentUser();
  return (state.visits || []).filter((item) => canSeeRecord(item, user));
}

function canAdmin() {
  return hasPermission(currentUser(), "admin");
}

function canImportPublicPool() {
  return canAdmin() || hasPermission(currentUser(), "publicPoolImport");
}

function canViewFullPoolInfo() {
  const user = currentUser();
  const role = roleForUser(user);
  return role.customerScope === "all" || canAdmin() || hasPermission(user, "publicPoolImport");
}

function canHardDeleteCustomers() {
  const roleName = roleForUser(currentUser()).name || currentUser().role || "";
  return ["总负责人", "管理员"].includes(roleName);
}

function canBulkEditChannelSource() {
  return canHardDeleteCustomers();
}

function clampPageSize(value) {
  const size = Number(value || 10);
  if (!Number.isFinite(size)) return 10;
  return Math.min(Math.max(Math.round(size), 10), 200);
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

function switchView(view, options = {}) {
  if (currentView === "dashboard" && view !== "dashboard") cancelDashboardLoad();
  currentView = view;
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".view").forEach((item) => item.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  const titles = { dashboard: "看板", customers: "客户管理", field: "地推地图", assistant: "AI话术", settings: "系统设置" };
  $("#viewTitle").textContent = titles[view];
  $("#viewCrumb").textContent = titles[view];
  render();
  if (!options.skipLoad && view === "customers" && !customerBoardLoading) {
    loadCustomerBoardPage().catch((error) => toast(error.message));
  }
  if (!options.skipLoad && view === "dashboard") {
    scheduleDashboardLoad();
  }
  if (!options.skipLoad && ["field", "assistant", "settings"].includes(view)) {
    loadState({ includePublicPool: false }).catch((error) => toast(error.message));
  }
}

function render() {
  if (!requireLogin()) return;
  const user = currentUser();
  $("#currentUserText").textContent = `${user.name || "用户"} · ${user.role || ""}`;
  $$(".admin-only").forEach((node) => node.classList.toggle("hidden", !canAdmin()));
  if (currentView === "settings" && !canAdmin()) return switchView("customers");
  if (currentView === "dashboard") renderDashboardShell();
  if (currentView === "customers") renderCustomers();
  if (currentView === "field") renderField();
  if (currentView === "assistant") renderAssistant();
  if (currentView === "settings") renderAdmin();
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

function cancelDashboardLoad() {
  if (dashboardLoadTimer) clearTimeout(dashboardLoadTimer);
  dashboardLoadTimer = null;
  dashboardLoading = false;
}

function renderDashboardShell(message = "看板数据准备中，停留 3 秒后自动计算。") {
  if (dashboardData && dashboardReady) {
    renderDashboardSummary(dashboardData);
    return;
  }
  $("#dashboardInsights").innerHTML = `
    <div class="dashboard-loading">
      <p>${escapeHtml(message)}</p>
      <button id="dashboardComputeNowBtn" type="button" class="primary">立即计算</button>
    </div>`;
}

function scheduleDashboardLoad(options = {}) {
  if (currentView !== "dashboard") return;
  cancelDashboardLoad();
  dashboardReady = false;
  renderDashboardShell();
  if (options.immediate) {
    renderDashboard();
    return;
  }
  dashboardLoadTimer = setTimeout(() => {
    dashboardLoadTimer = null;
    if (currentView === "dashboard") renderDashboard();
  }, 3000);
}

async function renderDashboard() {
  if (currentView !== "dashboard") return;
  cancelDashboardLoad();
  dashboardLoading = true;
  renderDashboardShell("看板计算中，请稍候...");
  const requestId = ++dashboardRequestId;
  try {
    const data = await api(`/dashboard?${dashboardQuery().toString()}`);
    if (requestId !== dashboardRequestId) return;
    dashboardData = data;
    dashboardReady = true;
    dashboardLoading = false;
    const scopeSelect = $("#dashboardScope");
    const selected = `${data.scope.type}:${data.scope.id}`;
    scopeSelect.innerHTML = data.scopeOptions.map((item) => `<option value="${escapeHtml(`${item.type}:${item.id}`)}">${escapeHtml(item.name)}</option>`).join("");
    scopeSelect.value = selected;
    $("#targetSettingsBtn").classList.toggle("hidden", !data.canManageTargets);
    renderDashboardSummary(data);
  } catch (error) {
    if (requestId !== dashboardRequestId) return;
    dashboardLoading = false;
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

  $("#dashboardActions").innerHTML = data.actions.map((item) => {
    const ownerSummary = (item.ownerSummary || []).slice(0, 3).map((owner) => `${owner.name}${owner.count}`).join("、");
    const hint = ownerSummary || (item.customers[0] ? `${item.customers[0].name}${item.count > 1 ? `等${item.count}家` : ""}` : "暂无待处理客户");
    return `
    <button class="action-item ${["overdue", "paymentPending"].includes(item.key) && item.count ? "is-alert" : ""}" data-action-key="${item.key}" ${item.count ? "" : "disabled"}>
      <span>${escapeHtml(item.label)}</span><strong>${item.count}</strong><small>${escapeHtml(hint)}</small>
    </button>`;
  }).join("");

  const leaderboardRow = (item, index) => `
    <article class="leaderboard-row">
      <span class="rank-number">${index + 1}</span>
      <span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.unit || "待分配")}</small></span>
      <strong>${item.count || 0}</strong>
    </article>`;
  const dashboardRedList = $("#dashboardRedList");
  if (dashboardRedList) {
    dashboardRedList.innerHTML = data.followLeaderboard?.red?.length
      ? data.followLeaderboard.red.map(leaderboardRow).join("")
      : '<p class="empty">暂无跟进红榜</p>';
  }
  const dashboardBlackList = $("#dashboardBlackList");
  if (dashboardBlackList) {
    dashboardBlackList.innerHTML = data.followLeaderboard?.black?.length
      ? data.followLeaderboard.black.map(leaderboardRow).join("")
      : '<p class="empty">暂无跟进黑榜</p>';
  }

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
    analysisBlock("目前未成交原因", data.industry.lossReasons),
    analysisBlock("功能原因细分", data.industry.functionLossReasons || []),
    analysisBlock("地推城市", data.industry.cities)
  ].join("");
  $("#dashboardInsights").innerHTML = data.insights.map((item) => `<article class="insight-item"><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.detail)}</p></article>`).join("");
}

function renderCustomers() {
  const customers = scopeOpportunityRows();
  const stageTime = stageTimeConfig();
  const customerTabs = [...stages, PUBLIC_POOL_STAGE, PURCHASED_STAGE, INVALID_STAGE];
  const publicPoolLoaded = isPublicPoolLoaded();
  const serverBoard = customerBoardData;
  const currentFilters = {
    channel: $("#channelFilter")?.value || "",
    createdBy: $("#createdByFilter")?.value || "",
    followPerson: $("#followPersonFilter")?.value || "",
    unit: $("#unitFilter")?.value || "",
    city: $("#cityFilter")?.value || "",
    followStatus: $("#followStatusFilter")?.value || "",
    sort: $("#customerSort")?.value || "default"
  };
  $("#stageTabs").innerHTML = customerTabs
    .map((stage) => {
      const count = serverBoard?.stageCounts
        ? Number(serverBoard.stageCounts[stage] || (stage === INVALID_STAGE ? serverBoard.stageCounts.invalid : 0) || 0)
        : stage === INVALID_STAGE
        ? customers.filter(isInvalidCustomer).length
        : stage === PUBLIC_POOL_STAGE
          ? (publicPoolLoaded ? customers.filter(isPublicPoolCustomer).length : Number(state.publicPool?.count || 0))
          : stage === PURCHASED_STAGE
            ? customers.filter(isPurchasedCustomer).length
            : customers.filter((item) => item.stage === stage && !isPublicPoolCustomer(item) && !isInvalidCustomer(item) && !isPurchasedCustomer(item)).length;
      return `<button class="${currentStage === stage ? "active" : ""}" data-stage="${stage}">${stage}<span>${count}</span></button>`;
    })
    .join("");

  const ownerOptions = visibleFollowUsers();
  const filterOptions = serverBoard?.filterOptions || {};
  const createdByOptions = filterOptions.createdBy || customers.map((item) => item.createdBy);
  const followPersonOptions = [
    ...(filterOptions.followPerson || []),
    ...ownerOptions.map((user) => user.name)
  ];
  const unitOptions = filterOptions.units || customers.map((item) => item.unit);
  const cityOptions = filterOptions.cities || customers.map((item) => item.city);
  $("#channelFilter").innerHTML = optionList("全部渠道来源", channelSources);
  $("#createdByFilterOptions").innerHTML = datalistOptions(createdByOptions);
  $("#followPersonFilterOptions").innerHTML = datalistOptions(followPersonOptions);
  $("#createdByFilter").placeholder = "全部录入人";
  $("#followPersonFilter").placeholder = roleForUser(currentUser()).customerScope === "self" ? "当前仅本人" : "全部跟进人";
  $("#unitFilter").innerHTML = optionList("全部单位", unitOptions);
  $("#cityFilter").innerHTML = optionList("全部城市", cityOptions);
  $("#channelFilter").value = currentFilters.channel;
  $("#createdByFilter").value = currentFilters.createdBy;
  $("#followPersonFilter").value = currentFilters.followPerson;
  $("#unitFilter").value = currentFilters.unit;
  $("#cityFilter").value = currentFilters.city;
  const followStatusFilter = $("#followStatusFilter");
  if (followStatusFilter) followStatusFilter.value = currentFilters.followStatus;
  setCustomerSortValue(currentFilters.sort);
  $("#customerOwnerSelect").innerHTML = ownerOptions.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  const paymentOwners = roleForUser(currentUser()).customerScope === "self" ? [currentUser()] : visibleUsers();
  $("#paymentOwnerSelect").innerHTML = paymentOwners.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  $("#batchOwnerSelect").innerHTML = ownerOptions.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  $("#batchOwnerField")?.classList.toggle("hidden", isReadonlyStage());
  if ($("#assignOwnerSelect")) $("#assignOwnerSelect").innerHTML = ownerOptions.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  const batchChannelSourceSelect = $("#batchChannelSourceSelect");
  if (batchChannelSourceSelect) batchChannelSourceSelect.innerHTML = channelSources.map((source) => `<option>${escapeHtml(source)}</option>`).join("");
  $("#customerStageSelect").innerHTML = stages.map((stage) => `<option>${stage}</option>`).join("");
  $("#customerChannelSelect").innerHTML = channelSources.map((source) => `<option>${source}</option>`).join("");
  const productOptions = productOptionsHtml();
  $("#customerProductSelect").innerHTML = productOptions;
  $("#newOpportunityProductSelect").innerHTML = productOptions;
  $("#batchAssignBtn").classList.toggle("hidden", currentStage === INVALID_STAGE || currentStage === PURCHASED_STAGE || !canAssignCustomers());
  $("#addCustomerBtn").classList.toggle("hidden", isReadonlyStage());
  $("#batchImportBtn").classList.toggle("hidden", currentStage === INVALID_STAGE || currentStage === PURCHASED_STAGE || (currentStage === PUBLIC_POOL_STAGE && !canImportPublicPool()));
  $("#batchImportBtn").textContent = currentStage === PUBLIC_POOL_STAGE ? "导入公海" : "批量导入";
  $("#stageTimeHeader").textContent = stageTime.label;
  $("#stageTimeFilterLabel").textContent = stageTime.label;

  if (customerBoardLoading && !serverBoard) {
    currentFilteredCustomerRows = [];
    currentCustomerRows = [];
    $("#customerResultCount").textContent = `当前${currentStage}：加载中...`;
    $("#customerRows").innerHTML = `<tr><td colspan="15" class="empty">客户列表加载中，请稍候...</td></tr>`;
    updateCustomerSelectionUI();
    return;
  }

  const keyword = $("#customerKeyword").value.trim().toLowerCase();
  const channel = $("#channelFilter").value;
  const createdBy = $("#createdByFilter").value;
  const followPerson = $("#followPersonFilter").value;
  const unit = $("#unitFilter").value;
  const city = $("#cityFilter").value;
  const followStatus = $("#followStatusFilter")?.value || "";
  const stageStart = $("#stageTimeStart").value;
  const stageEnd = $("#stageTimeEnd").value;
  const lastStart = $("#lastFollowStart").value;
  const lastEnd = $("#lastFollowEnd").value;
  const nextStart = $("#nextFollowStart").value;
  const nextEnd = $("#nextFollowEnd").value;
  if (currentStage === PUBLIC_POOL_STAGE && !publicPoolLoaded) {
    const total = Number(state.publicPool?.count || 0);
    currentFilteredCustomerRows = [];
    currentCustomerRows = [];
    selectedCustomerIds.clear();
    $("#customerResultCount").textContent = `当前公海：${total}条，正在加载明细...`;
    $("#customerRows").innerHTML = `<tr><td colspan="15" class="empty">公海明细正在加载，请稍候...</td></tr>`;
    updateCustomerSelectionUI();
    return;
  }
  const filteredRows = serverBoard ? customers : customers.filter((item) => {
    const source = `${item.name} ${item.phone}`.toLowerCase();
    if (dashboardDrilldownIds && !dashboardDrilldownIds.has(Number(item.id)) && !dashboardDrilldownIds.has(Number(item.customerId))) return false;
    const isPublicPool = isPublicPoolCustomer(item);
    const isInvalid = isInvalidCustomer(item);
    const isPurchased = isPurchasedCustomer(item);
    if (!dashboardDrilldownIds) {
      if (currentStage === INVALID_STAGE) {
        if (!isInvalid) return false;
      } else if (currentStage === PUBLIC_POOL_STAGE) {
        if (isInvalid || !isPublicPool) return false;
      } else if (currentStage === PURCHASED_STAGE) {
        if (!isPurchased) return false;
      } else if (isInvalid || isPublicPool || isPurchased || item.stage !== currentStage) {
        return false;
      }
    }
    if (keyword && !source.includes(keyword)) return false;
    if (channel && normalizeChannelSource(item.channelSource) !== channel) return false;
    if (createdBy && !textIncludes(item.createdBy, createdBy)) return false;
    if (!isReadonlyStage() && followPerson && !textIncludes(item.followPerson || item.owner, followPerson)) return false;
    if (unit && item.unit !== unit) return false;
    if (city && item.city !== city) return false;
    if (followStatus === "unfollowed" && manualFollowUps(item).length) return false;
    if (followStatus === "followed" && !manualFollowUps(item).length) return false;
    if (!inDateRange(customerStageTime(item), stageStart, stageEnd)) return false;
    if (!inDateRange(latestManualFollowDate(item), lastStart, lastEnd)) return false;
    if (!inDateRange(item.nextFollow || "", nextStart, nextEnd)) return false;
    return true;
  });
  currentFilteredCustomerRows = filteredRows;
  const totalRows = serverBoard ? Number(serverBoard.total || 0) : filteredRows.length;
  $("#customerResultCount").textContent = dashboardDrilldownIds ? `看板下钻：${totalRows}条` : `当前${currentStage}：${totalRows}条`;
  const totalPages = serverBoard ? Number(serverBoard.totalPages || Math.max(Math.ceil(totalRows / customerPageSize), 1)) : Math.max(Math.ceil(filteredRows.length / customerPageSize), 1);
  customerPage = Math.min(Math.max(customerPage, 1), totalPages);
  const start = (customerPage - 1) * customerPageSize;
  const rows = serverBoard ? filteredRows : filteredRows.slice(start, start + customerPageSize);
  currentCustomerRows = rows;
  const selectableIds = new Set(filteredRows.filter(canSelectCustomer).map((item) => Number(item.id)));
  selectedCustomerIds = new Set([...selectedCustomerIds].filter((id) => selectableIds.has(Number(id))));
  $("#customerRows").innerHTML = rows.length
    ? rows.map(customerRow).join("")
    : `<tr><td colspan="15" class="empty">暂无销售机会</td></tr>`;
  updateCustomerSelectionUI();
  const sizeSelect = $("#customerPageSize");
  if (sizeSelect) sizeSelect.value = String(customerPageSize);
  const jumpInput = $("#customerPageJump");
  if (jumpInput) {
    jumpInput.max = String(totalPages);
    jumpInput.value = String(customerPage);
  }
  $("#customerPageSummary").textContent = `共 ${totalRows} 条 · 第 ${customerPage} / ${totalPages} 页`;
  $("#customerPrevPage").disabled = customerPage <= 1;
  $("#customerNextPage").disabled = customerPage >= totalPages;
}

function customerRow(item) {
  const dueClass = item.nextFollow && item.nextFollow < today ? "overdue" : item.nextFollow === today ? "today" : "";
  const photos = Array.isArray(item.photos) ? item.photos : [];
  const photoHtml = photos.length
    ? `<div class="customer-photos">${photos.slice(0, 4).map((url) => `<img src="${escapeHtml(url)}" data-photo="${escapeHtml(url)}" alt="${escapeHtml(item.name || "客户图片")}" />`).join("")}${photos.length > 4 ? `<span>+${photos.length - 4}</span>` : ""}</div>`
    : "";
  const isInvalid = isInvalidCustomer(item);
  const isPublicPool = isPublicPoolCustomer(item);
  const shouldMaskPublicPool = isPublicPool && !canViewFullPoolInfo();
  const isPurchased = isPurchasedCustomer(item);
  const assignable = canSelectCustomerForAssign(item);
  const selectable = canSelectCustomer(item);
  const checked = selectedCustomerIds.has(Number(item.id)) ? "checked" : "";
  const disabled = selectable ? "" : "disabled";
  const title = selectable ? "选择客户" : (isInvalid ? "无效客户不可分配" : (isPublicPool ? "只能分配权限范围内的公海客户" : "当前客户暂不满足分配条件"));
  const ownership = ownershipLabel(item);
  const primaryContact = item.primaryContact || (item.contacts || []).find((contact) => contact.isPrimary) || (item.contacts || [])[0] || { phone: item.phone };
  const contactCount = Number(item.contactCount ?? (item.contacts || []).length);
  const phoneHtml = shouldMaskPublicPool
    ? `<span class="pool-private-value">认领后可见</span>`
    : `<a href="tel:${escapeHtml(primaryContact.phone || item.phone)}">${escapeHtml(primaryContact.phone || item.phone)}</a>${contactCount > 1 ? `<small>另有${contactCount - 1}位联系人</small>` : ""}`;
  const manualHistory = manualFollowUps(item);
  const followCount = Number(item.manualFollowCount || item.followCount || manualHistory.length);
  const lastNote = String(latestManualFollow(item)?.note || "").trim();
  const followHtml = shouldMaskPublicPool
    ? `<small class="pool-private-value">认领后可查看跟进历史</small>`
    : isInvalid
      ? `<small class="pool-private-value">${escapeHtml(item.archiveReason === "closed" ? "已标记倒闭" : "已标记无效")}${item.archivedAt ? ` · ${escapeHtml(String(item.archivedAt).slice(0, 10))}` : ""}</small>${followCount ? `<button class="history-link" data-action="history" data-id="${item.id}">查看历史(${followCount})</button>` : ""}`
    : (followCount ? `${lastNote ? `<small>${escapeHtml(lastNote)}</small>` : ""}<button class="history-link" data-action="history" data-id="${item.id}">查看历史(${followCount})</button>${photoHtml}` : `<small class="pool-private-value">未跟进</small>${photoHtml}`);
  const pendingRollback = latestPendingRollback(item);
  const rollbackActions = pendingRollback
    ? (canReviewRollback()
      ? `<button data-action="rollback-approve" data-id="${item.id}">同意回撤</button><button data-action="rollback-reject" data-id="${item.id}">拒绝回撤</button>`
      : `<span class="pool-action-hint">回撤待审批</span>`)
    : (rollbackTargetForStage(item.stage) ? `<button data-action="rollback-request" data-id="${item.id}">申请回撤</button>` : "");
  const actions = isPublicPool
    ? (canOwnCustomer(currentUser())
        ? `<button class="primary" data-action="claim" data-id="${item.id}">认领</button>`
        : `<span class="pool-action-hint">${assignable ? "请勾选后分配" : "不在您的分配范围"}</span>`)
    : isInvalid
      ? `<span class="pool-action-hint">已进入无效库</span>`
      : isPurchased
        ? `<button data-action="history" data-id="${item.id}">查看历史</button><button class="primary" data-action="new-opportunity" data-id="${item.id}">新增机会</button>`
        : `<button data-action="follow" data-id="${item.id}">跟进</button><button data-action="ai" data-id="${item.id}">小智</button>${item.stage === "成交" ? `<button class="primary" data-action="new-opportunity" data-id="${item.id}">新增机会</button>` : `<button data-action="advance" data-id="${item.id}">推进</button>${rollbackActions}`}`;
  return `
    <tr>
      <td class="select-cell"><input type="checkbox" class="customer-select" data-id="${item.id}" ${checked} ${disabled} title="${title}" /></td>
      <td><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.stage || "")}${ownership ? ` · <span class="ownership-state ${isInvalid ? "archived" : item.ownershipStatus}">${escapeHtml(ownership)}</span>` : ""}</small></td>
      <td><span class="tag">${escapeHtml(item.productName || "待确认产品")}</span></td>
      <td>${phoneHtml}</td>
      <td>${escapeHtml(item.city || "待识别")}</td>
      <td>${escapeHtml(normalizeChannelSource(item.channelSource))}</td>
      <td>${escapeHtml(item.createdBy || "未记录")}</td>
      <td>${escapeHtml(item.followPerson || item.owner || "未分配")}</td>
      <td>${escapeHtml(customerStageTime(item) || "-")}</td>
      <td>${followHtml}</td>
      <td>${latestManualFollowDate(item) || "-"}</td>
      <td class="${dueClass}">${item.nextFollow || "未设置"}</td>
      <td>${escapeHtml(item.unit || "待分配")}</td>
      <td>${escapeHtml(item.address || "-")}</td>
      <td>${actions}</td>
    </tr>`;
}

function updateCustomerSelectionUI() {
  const selectableRows = currentCustomerRows.filter(canSelectCustomer);
  const pageSelectedCount = selectableRows.filter((item) => selectedCustomerIds.has(Number(item.id))).length;
  const selectedCount = currentFilteredCustomerRows.filter((item) => canSelectCustomer(item) && selectedCustomerIds.has(Number(item.id))).length;
  const assignSelectedCount = currentFilteredCustomerRows.filter((item) => canSelectCustomerForAssign(item) && selectedCustomerIds.has(Number(item.id))).length;
  const selectAll = $("#selectAllCustomers");
  if (selectAll) {
    selectAll.disabled = selectableRows.length === 0;
    selectAll.checked = selectableRows.length > 0 && pageSelectedCount === selectableRows.length;
    selectAll.indeterminate = pageSelectedCount > 0 && pageSelectedCount < selectableRows.length;
  }
  const batchButton = $("#batchAssignBtn");
  if (batchButton) {
    batchButton.disabled = assignSelectedCount === 0;
    batchButton.textContent = assignSelectedCount ? `批量分配(${assignSelectedCount})` : "批量分配";
  }
  const channelButton = $("#batchChannelBtn");
  if (channelButton) {
    channelButton.classList.toggle("hidden", !canBulkEditChannelSource());
    channelButton.disabled = selectedCount === 0;
    channelButton.textContent = selectedCount ? `批量改渠道(${selectedCount})` : "批量改渠道";
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
    if (!canSelectCustomer(item)) return;
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
  $("#assignUserSearch").value = "";
  renderAssignCandidates();
  $("#assignDialog").showModal();
}

function renderAssignCandidates() {
  const candidateList = $("#assignCandidateList");
  if (!candidateList) return;
  const candidates = visibleFollowUsers();
  candidateList.innerHTML = candidates.length ? candidates.map((user) => `
    <article class="assign-candidate-row" data-assign-search="${escapeHtml(`${user.name} ${user.unit || ""} ${user.account || ""}`.toLowerCase())}">
      <label class="assign-candidate-check"><input type="checkbox" data-assign-user="${user.id}" /><span><b>${escapeHtml(user.name)}</b><small>${escapeHtml(user.unit || "待分配")}</small></span></label>
      <input type="number" min="0" step="1" value="0" data-assign-count="${user.id}" aria-label="${escapeHtml(user.name)}分配数量" />
    </article>`).join("") : '<p class="empty">当前权限范围内没有可分配的跟进人</p>';
  filterAssignCandidates();
  updateAssignPlanHint();
}

function filterAssignCandidates() {
  const keyword = String($("#assignUserSearch")?.value || "").trim().toLowerCase();
  $$("#assignCandidateList .assign-candidate-row").forEach((row) => {
    row.hidden = keyword && !String(row.dataset.assignSearch || "").includes(keyword);
  });
}

function selectedAssignCandidates() {
  return $$("[data-assign-user]:checked").map((input) => {
    const user = userById(input.dataset.assignUser);
    const countInput = $(`[data-assign-count="${input.dataset.assignUser}"]`);
    return { user, countInput };
  }).filter((item) => item.user?.id);
}

function updateAssignPlanHint() {
  const assignForm = $("#assignForm");
  const assignPlanHint = $("#assignPlanHint");
  if (!assignForm || !assignPlanHint || !$("#assignCandidateList")) return;
  const ids = selectedCustomerIdsForAssign();
  const mode = new FormData(assignForm).get("assignMode") || "average";
  const selected = selectedAssignCandidates();
  const readonly = mode === "average";
  $$("[data-assign-count]").forEach((input) => {
    input.readOnly = readonly;
    if (!selected.some((item) => String(item.user.id) === String(input.dataset.assignCount))) input.value = "0";
  });
  if (!selected.length) {
    assignPlanHint.textContent = "请选择至少一名跟进人。";
    return;
  }
  if (mode === "average") {
    const base = Math.floor(ids.length / selected.length);
    const remainder = ids.length % selected.length;
    selected.forEach((item, index) => {
      item.countInput.value = String(base + (index < remainder ? 1 : 0));
    });
  }
  const total = selected.reduce((sum, item) => sum + Number(item.countInput.value || 0), 0);
  assignPlanHint.textContent = `已选择 ${selected.length} 名跟进人，计划分配 ${total}/${ids.length} 个客户。`;
}

function selectedCustomerIdsForAssign() {
  const selectableIds = new Set(currentFilteredCustomerRows.filter(canSelectCustomerForAssign).map((item) => Number(item.id)));
  return [...selectedCustomerIds].map(Number).filter((id) => selectableIds.has(id));
}

function selectedCustomerIdsForChannelEdit() {
  const selectableRowsByOpportunityId = new Map(
    currentFilteredCustomerRows
      .filter(canSelectCustomer)
      .map((item) => [Number(item.id), item])
  );
  return [...new Set(
    [...selectedCustomerIds]
      .map(Number)
      .map((id) => selectableRowsByOpportunityId.get(id))
      .filter(Boolean)
      .map((item) => Number(item.customerId || item.id))
      .filter(Boolean)
  )];
}

function openBatchChannelDialog() {
  if (!canBulkEditChannelSource()) return toast("仅管理员和总负责人可以批量修改渠道");
  const ids = selectedCustomerIdsForChannelEdit();
  if (!ids.length) return toast("请先勾选客户");
  $("#channelSourceBatchSummary").textContent = `已选择 ${ids.length} 个客户`;
  $("#batchChannelSourceSelect").innerHTML = channelSources.map((source) => `<option>${escapeHtml(source)}</option>`).join("");
  const currentChannel = $("#channelFilter")?.value;
  if (currentChannel && channelSources.includes(currentChannel)) $("#batchChannelSourceSelect").value = currentChannel;
  $("#channelSourceDialog").showModal();
}

async function batchUpdateChannelSource(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#channelSourceDialog").close();
  const ids = selectedCustomerIdsForChannelEdit();
  if (!ids.length) return toast("请先勾选客户");
  const channelSource = String(new FormData(event.currentTarget).get("channelSource") || "").trim();
  if (!channelSource) return toast("请选择渠道来源");
  const result = await api("/customers/channel-source", {
    method: "POST",
    body: { customerIds: ids, channelSource }
  });
  selectedCustomerIds.clear();
  $("#channelSourceDialog").close();
  await refreshCustomersAfterMutation();
  toast(`已修改${result.updated || ids.length}个客户的渠道来源`);
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

function defaultCompetitorDefinition() {
  return (state.competitors || []).find((item) => item.active !== false && item.name === "未知")
    || (state.competitors || []).find((item) => item.active !== false)
    || {};
}

function renderCompetitorProfilesEditor(profiles = []) {
  const defaultCompetitor = defaultCompetitorDefinition();
  const list = profiles.length ? profiles : [{ competitorId: defaultCompetitor.id || "", brand: defaultCompetitor.name || "未知", isPrimary: true }];
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

function renderUserOrgTree() {
  const users = visibleSystemUsers();
  const units = state.units || [];
  const currentUnitIds = new Set(units.map((unit) => String(unit.id || "")).filter(Boolean));
  units.forEach((unit) => {
    const unitId = String(unit.id || "");
    if (unitId && !knownUserUnitIds.has(unitId)) {
      collapsedUserUnitIds.add(unitId);
      knownUserUnitIds.add(unitId);
    }
  });
  collapsedUserUnitIds = new Set([...collapsedUserUnitIds].filter((unitId) => currentUnitIds.has(unitId)));
  knownUserUnitIds = new Set([...knownUserUnitIds].filter((unitId) => currentUnitIds.has(unitId)));
  const unitMap = new Map(units.map((unit) => [String(unit.id), unit]));
  const children = new Map();
  units.forEach((unit) => {
    const parentId = String(unit.parentId || "");
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(unit);
  });
  const usersByUnit = new Map();
  users.forEach((user) => {
    const unitId = String(user.unitId || "unassigned");
    if (!usersByUnit.has(unitId)) usersByUnit.set(unitId, []);
    usersByUnit.get(unitId).push(user);
  });
  const countForUnit = (unitId) => {
    let count = (usersByUnit.get(String(unitId)) || []).length;
    (children.get(String(unitId)) || []).forEach((child) => { count += countForUnit(child.id); });
    return count;
  };
  const renderUserCard = (user) => {
    const orgLabel = user.orgPath || user.unit || "待分配";
    const zoneUnit = battleZoneForUser(user);
    const zoneLabel = zoneUnit?.name || (zones.includes(user.zone) ? user.zone : "");
    const meta = [
      user.role || "未设置角色",
      orgLabel,
      zoneLabel && !String(orgLabel).includes(zoneLabel) ? zoneLabel : "",
      `账号：${user.account || user.username || user.phone || "-"}`
    ].filter(Boolean).join(" · ");
    return `<article class="user-card">
      <b>${escapeHtml(user.name)}</b><span>${user.status || "启用"}</span>
      <p>${escapeHtml(meta)}</p>
      <div class="user-actions">${Number(user.id) === Number(currentUser().id) ? "" : `<button data-action="edit-user" data-id="${user.id}">编辑员工</button><button data-action="reset-password" data-id="${user.id}">重置密码</button><button data-action="offboard-user" data-id="${user.id}">离职交接</button><button data-action="delete-user" data-id="${user.id}">删除员工</button>`}</div>
    </article>`;
  };
  const renderNode = (unit) => {
    const unitId = String(unit.id);
    const collapsed = collapsedUserUnitIds.has(unitId);
    const unitUsers = (usersByUnit.get(unitId) || []).sort((left, right) => String(left.name).localeCompare(String(right.name), "zh-Hans-CN"));
    const childNodes = (children.get(unitId) || []).sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0));
    const count = countForUnit(unitId);
    if (!count && unit.type !== "root") return "";
    return `<section class="user-org-node" style="--level:${Number(unit.level || 0)}">
      <button type="button" class="org-toggle" data-action="toggle-user-unit" data-id="${escapeHtml(unitId)}">
        <span>${collapsed ? "›" : "⌄"}</span>
        <b>${escapeHtml(unit.name)}</b>
        <em>${count}人</em>
      </button>
      ${collapsed ? "" : `<div class="user-org-children">${unitUsers.map(renderUserCard).join("")}${childNodes.map(renderNode).join("")}</div>`}
    </section>`;
  };
  const root = unitMap.get(orgRootId) || units.find((unit) => unit.type === "root");
  const tree = root ? renderNode(root) : "";
  const unassigned = (usersByUnit.get("unassigned") || []).map(renderUserCard).join("");
  return tree || unassigned ? `${tree}${unassigned ? `<section class="user-org-node"><div class="org-toggle"><b>未分配</b><em>${(usersByUnit.get("unassigned") || []).length}人</em></div>${unassigned}</section>` : ""}` : `<article class="empty">暂无员工</article>`;
}

function openCustomerDialog(customer = null) {
  const form = $("#customerForm");
  form.reset();
  const editingExisting = Boolean(customer);
  form.classList.toggle("follow-mode", editingExisting);
  $$(".customer-dialog-create-field").forEach((node) => node.classList.toggle("hidden", editingExisting));
  form.id.value = customer?.customerId || customer?.id || "";
  form.opportunityId.value = customer?.opportunityId || "";
  form.name.value = customer?.name || "";
  form.phone.value = customer?.phone || "";
  form.city.value = customer?.city || "";
  const customerProductIsPlaceholder = isPlaceholderProduct({ name: customer?.productName });
  const fallbackProductId = selectableProducts()[0]?.id || "";
  const productId = customerProductIsPlaceholder ? "" : (customer?.productId || fallbackProductId);
  if (productId && !Array.from(form.productId.options).some((option) => option.value === productId) && !customerProductIsPlaceholder) {
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
  form.lossReason.innerHTML = lossReasonOptionsHtml(customer?.lossReason || "");
  form.lossReason.value = customer?.lossReason || "";
  if (form.lossReasonDetail) form.lossReasonDetail.value = customer?.lossReasonDetail || "";
  toggleLossReasonDetailField(form);
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
  $("#customerPurchasedBtn").classList.toggle("hidden", !customer || isPurchasedCustomer(customer) || isPublicPoolCustomer(customer) || customer.stage === "成交" || customer.lifecycleStatus === "archived");
  $("#customerArchiveBtn").classList.toggle("hidden", !customer || customer.lifecycleStatus === "archived");
  $("#customerDeleteBtn").classList.toggle("hidden", !customer || !canHardDeleteCustomers());
  $("#customerDialogTitle").textContent = customer ? "客户跟进" : "新增客户";
  $("#customerDialog").showModal();
}

function openFollowHistory(customer) {
  if (!customer) return;
  const history = manualFollowUps(customer).slice().reverse();
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

function openPurchasedDialog(customer) {
  if (!customer) return;
  const form = $("#purchasedForm");
  form.reset();
  form.opportunityId.value = customer.id;
  $("#purchasedSummary").textContent = `${customer.name} · ${customer.productName || "待确认产品"}，标记后不计入我司成交业绩。`;
  $("#purchasedDialog").showModal();
}

async function submitPurchased(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = Number(form.get("opportunityId"));
  const note = String(form.get("note") || "").trim();
  if (!note) return toast("请填写：本次跟进记录");
  try {
    await api(`/opportunities/${id}/mark-purchased`, {
      method: "POST",
      body: {
        note,
        product: String(form.get("product") || "").trim(),
        brand: String(form.get("brand") || "").trim(),
        purchasedAt: String(form.get("purchasedAt") || ""),
        revisitAt: String(form.get("revisitAt") || "")
      }
    });
    $("#purchasedDialog").close();
    $("#customerDialog").close();
    currentStage = PURCHASED_STAGE;
    customerPage = 1;
    await refreshCustomersAfterMutation();
    toast("已标记为已购，不计入成交业绩");
  } catch (error) {
    toast(error.message || "标记已购失败");
  }
}

function openRollbackDialog(customer) {
  if (!customer) return;
  const targetStage = rollbackTargetForStage(customer.stage);
  if (!targetStage) return toast("当前阶段不支持回撤");
  const form = $("#rollbackForm");
  form.reset();
  form.opportunityId.value = customer.id;
  $("#rollbackDialogTitle").textContent = `申请回撤至${targetStage}`;
  $("#rollbackSummary").textContent = `${customer.name} · 当前${customer.stage}，提交后需主管以上审批。`;
  $("#rollbackDialog").showModal();
}

async function submitRollbackRequest(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = Number(form.get("opportunityId"));
  const reason = String(form.get("reason") || "").trim();
  if (!reason) return toast("请选择：申请原因");
  try {
    await api(`/opportunities/${id}/rollback-request`, {
      method: "POST",
      body: { reason, note: String(form.get("note") || "").trim() }
    });
    $("#rollbackDialog").close();
    await refreshCustomersAfterMutation();
    toast("回撤申请已提交，等待审批");
  } catch (error) {
    toast(error.message || "提交回撤申请失败");
  }
}

async function reviewRollback(id, approved) {
  try {
    const result = await api(`/opportunities/${id}/rollback-review`, {
      method: "POST",
      body: { action: approved ? "approve" : "reject" }
    });
    currentStage = approved ? (result.stage || currentStage) : currentStage;
    customerPage = 1;
    await refreshCustomersAfterMutation();
    toast(approved ? "已同意回撤" : "已拒绝回撤");
  } catch (error) {
    toast(error.message || "审批失败");
  }
}

async function saveCustomer(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#customerDialog").close();
  const formNode = event.currentTarget;
  if (formNode.dataset.submitting === "1") return toast("正在保存，请稍等");
  const form = new FormData(formNode);
  const id = Number(form.get("id"));
  const opportunityId = Number(form.get("opportunityId"));
  const ownerUser = userById(form.get("owner"));
  const ownerUnit = unitForId(ownerUser.unitId);
  const note = String(form.get("note") || "").trim();
  const productId = String(form.get("productId") || "");
  const contacts = readContactsEditor();
  const primaryContact = contacts.find((item) => item.isPrimary) || contacts[0] || {};
  const customerName = String(form.get("name") || "").trim();
  const customerPhone = String(primaryContact.phone || form.get("phone") || "").trim();
  if (!customerName) {
    formNode.elements.name?.focus();
    return toast("请填写：客户名称");
  }
  if (!customerPhone) {
    formNode.elements.phone?.focus();
    return toast("请填写：手机号");
  }
  if (!productId) {
    formNode.elements.productId?.focus();
    return toast("请选择：意向产品");
  }
  const competitorProfiles = readCompetitorProfilesEditor();
  const metadataLocked = Boolean(id) && !canAdmin();
  const lossReason = String(form.get("lossReason") || "");
  const customer = {
    id: id || Date.now(),
    name: customerName,
    phone: customerPhone,
    contacts,
    competitorProfiles,
    opportunityId: opportunityId || undefined,
    productId,
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
    amount: Number(form.get("amount") || productDefaultAmount(productId)),
    demoAt: String(form.get("demoAt") || ""),
    expectedDealDate: String(form.get("expectedDealDate") || ""),
    contractAmount: Number(form.get("contractAmount") || 0),
    paymentAmount: Number(form.get("paymentAmount") || 0),
    paymentDate: String(form.get("paymentDate") || ""),
    paymentOwnerId: Number(form.get("paymentOwnerId") || currentUser().id),
    lossReason,
    lossReasonDetail: lossReason === "功能原因" ? String(form.get("lossReasonDetail") || "").trim() : "",
    createdAt: id ? undefined : today,
    lastFollow: today,
    nextFollow: String(form.get("nextFollow") || ""),
    lastNote: note || (id ? undefined : "新增客户。")
  };
  const shouldKeepCurrentPage = Boolean(id) && customer.stage === currentStage;
  formNode.dataset.submitting = "1";
  setFormSubmitting(formNode, true, "保存中...");
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
      prepareClaimedCustomerView();
      await refreshCustomersAfterMutation();
      mergeOpportunityDetail({ ...claimed, hasDetail: true });
      return toast("认领成功，已进入你的名单，请尽快完成首次跟进");
    } else {
      return toast(error.code === "DUPLICATE_CUSTOMER" ? "该客户已存在" : error.message);
    }
  } finally {
    delete formNode.dataset.submitting;
    setFormSubmitting(formNode, false, "保存中...");
  }
  $("#customerDialog").close();
  if (!shouldKeepCurrentPage) customerPage = 1;
  await refreshCustomersAfterMutation();
  toast("已保存");
}

function prepareClaimedCustomerView() {
  dashboardDrilldownIds = null;
  currentStage = stages[0];
  localStorage.setItem(CUSTOMER_STAGE_KEY, currentStage);
  customerPage = 1;
  clearCustomerFilters();
  setCustomerSortValue("assignedAt_desc");
}

async function claimCustomer(id, trigger = null) {
  const customer = scopeOpportunityRows().find((item) => Number(item.id) === Number(id))
    || currentFilteredCustomerRows.find((item) => Number(item.id) === Number(id))
    || currentCustomerRows.find((item) => Number(item.id) === Number(id));
  if (!customer) return toast("公海客户不存在或列表尚未加载完成，请刷新后重试");
  if (claimingOpportunityIds.has(Number(id))) return toast("正在认领，请稍候");
  claimingOpportunityIds.add(Number(id));
  if (trigger) {
    trigger.disabled = true;
    trigger.dataset.originalLabel = trigger.textContent;
    trigger.textContent = "认领中...";
  }
  toast("正在认领公海客户...");
  try {
    await api(`/opportunities/${id}/claim`, { method: "POST", body: {} });
    prepareClaimedCustomerView();
    await refreshCustomersAfterMutation();
    toast("认领成功，客户已进入你的名单，请尽快跟进");
  } catch (error) {
    toast(error.message || "认领失败，客户可能已被他人认领");
    refreshCustomersAfterMutation().catch((refreshError) => toast(refreshError.message));
  } finally {
    claimingOpportunityIds.delete(Number(id));
    if (trigger?.isConnected) {
      trigger.disabled = false;
      trigger.textContent = trigger.dataset.originalLabel || "认领";
    }
  }
}

async function submitClaim(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#claimDialog").close();
  const formNode = event.currentTarget;
  if (formNode.dataset.submitting === "1") return toast("正在认领，请稍候");
  formNode.dataset.submitting = "1";
  setFormSubmitting(formNode, true, "认领中...");
  const form = new FormData(formNode);
  const id = Number(form.get("opportunityId"));
  const productId = String(form.get("productId") || "");
  try {
    const claimed = await api(`/opportunities/${id}/claim`, { method: "POST", body: productId ? { productId } : {} });
    $("#claimDialog").close();
    prepareClaimedCustomerView();
    await refreshCustomersAfterMutation();
    mergeOpportunityDetail({ ...claimed, hasDetail: true });
    toast("认领成功，已进入你的名单，请尽快完成首次跟进");
  } catch (error) {
    await refreshCustomersAfterMutation();
    toast(error.message || "认领失败，客户可能已被他人认领");
  } finally {
    delete formNode.dataset.submitting;
    setFormSubmitting(formNode, false, "认领中...");
  }
}

async function advanceCustomer(id) {
  const customer = await fetchOpportunityDetail(id, rowByOpportunityId(id));
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
  $("#advanceNextFollowRequired")?.classList.toggle("hidden", nextStage === "成交");
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
  if (nextStage !== "成交" && !nextFollow) return toast("请选择：下次跟进时间");
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
  await refreshCustomersAfterMutation();
  toast(`已推进至${nextStage}`);
}

function openNewOpportunityDialog(opportunityId, detail = null) {
  const row = detail || rowByOpportunityId(opportunityId);
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
  await refreshCustomersAfterMutation();
  toast("新销售机会已创建");
}

async function assignCustomer(id, ownerId) {
  const target = state.users.find((user) => Number(user.id) === Number(ownerId));
  if (!target) return toast("请选择销售");
  await api(`/opportunities/${id}/assign`, {
    method: "POST",
    body: { ownerId: target.id, owner: target.name }
  });
  await refreshCustomersAfterMutation();
  toast("已分配");
}

async function batchAssignCustomers(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#assignDialog").close();
  const ids = selectedCustomerIdsForAssign();
  if (!ids.length) return toast("请先勾选客户");
  updateAssignPlanHint();
  const assignments = selectedAssignCandidates().map((item) => ({
    ownerId: item.user.id,
    owner: item.user.name,
    count: Number(item.countInput.value || 0)
  })).filter((item) => item.count > 0);
  if (!assignments.length) return toast("请选择员工并填写分配数量");
  const total = assignments.reduce((sum, item) => sum + item.count, 0);
  if (total !== ids.length) return toast(`分配数量合计需等于已选客户数，当前相差${ids.length - total}`);
  const result = await api("/opportunities/assign", {
    method: "POST",
    body: { ids, assignments }
  });
  selectedCustomerIds.clear();
  $("#assignDialog").close();
  await refreshCustomersAfterMutation();
  const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
  toast(failedCount ? `已分配${result.assigned || 0}个，${failedCount}个未满足条件` : `已分配${result.assigned || ids.length}个客户`);
}

async function batchImport(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#batchDialog").close();
  const formNode = event.currentTarget;
  const form = new FormData(formNode);
  const importToPublicPool = currentStage === "公海";
  const ownerUser = importToPublicPool ? {} : userById(form.get("owner"));
  const owner = ownerUser.name || "";
  const file = form.get("file");
  const importBody = new FormData();
  importBody.append("stage", stages.includes(currentStage) ? currentStage : "名单");
  if (!importToPublicPool) {
    importBody.append("owner", owner);
    importBody.append("ownerId", ownerUser.id || "");
    importBody.append("unitId", ownerUser.unitId || "");
    importBody.append("unit", ownerUser.unit || "");
    importBody.append("zone", ownerUser.zone || "");
    importBody.append("followPerson", owner);
  }
  importBody.append("channelSource", "其他");
  importBody.append("createdBy", currentUser().name || "未记录");
  importBody.append("moneyUnit", "yuan");
  if (file && file.size) {
    importBody.append("file", file);
  } else {
    const rows = String(form.get("rows") || "").trim();
    if (!rows) return toast("请选择文件或粘贴客户数据");
    importBody.append("rows", rows);
  }
  if (importToPublicPool) importBody.append("target", "public_pool");
  const endpoint = importToPublicPool ? "/import/customers?target=public_pool" : "/import/customers";
  try {
    const result = await api(endpoint, { method: "POST", body: importBody });
    $("#batchDialog").close();
    formNode.reset();
    customerPage = 1;
    showImportFeedback(result);
    try {
      await refreshCustomersAfterMutation();
    } catch (refreshError) {
      toast(refreshError.message || "导入成功，但列表刷新失败，请稍后手动刷新");
    }
    if (importToPublicPool && Number(result.pendingGeocode || 0)) trackGeocodeProgress();
  } catch (error) {
    $("#batchDialog").close();
    showImportFeedback(importErrorResult(error));
  }
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
  const requestId = ++fieldRequestId;
  try {
    const result = await api(`/map/points?${mapFilterQuery()}`);
    if (requestId !== fieldRequestId || currentView !== "field") return;
    fieldMapResult = result;
    fieldPoints = result.points || [];
    renderMapFilterOptions(fieldPoints);
    renderFieldSummary(result);
    renderFieldMap(fieldPoints);
    $("#visitList").innerHTML = fieldPoints.length
      ? fieldPoints.slice(0, 20).map((point) => {
          return `<article>
            <b>${escapeHtml(point.name)}</b><span>${escapeHtml(point.stage)} · 拜访${point.visitCount}次</span>
            <p>${escapeHtml(point.city || "未知城市")} · ${escapeHtml(point.address || "")}</p>
            <p>现用软件：${escapeHtml(point.competitor || point.software || "待补充")}</p>
            <button type="button" data-map-customer="${point.customerId}">查看客户与拜访轨迹</button>
          </article>`;
        }).join("")
      : `<div class="empty">当前筛选条件下暂无地图工厂。</div>`;
  } catch (error) {
    if (requestId !== fieldRequestId) return;
    $("#visitList").innerHTML = `<div class="empty">地图数据加载失败：${escapeHtml(error.message)}</div>`;
  }
}

async function openCustomerFromMap(id) {
  const point = fieldPoints.find((item) => Number(item.customerId) === Number(id));
  const customer = point ? { id, name: point.name, address: point.address, lifecycleStatus: point.pointStatus === "archived" ? "archived" : "active", ownershipStatus: point.isPublicPool ? "public_pool" : "", opportunityId: point.opportunityId } : null;
  if (!customer) return toast("客户资料暂未同步，请刷新后重试");
  if (customer.lifecycleStatus !== "archived" && point?.opportunityId && (!customer.ownershipStatus || canViewFullPoolInfo())) {
    openCustomerDialog(await fetchOpportunityDetail(point.opportunityId));
    return;
  }
  if (customer.lifecycleStatus !== "archived" && customer.ownershipStatus !== "public_pool") {
    if (point?.opportunityId) {
      openCustomerDialog(await fetchOpportunityDetail(point.opportunityId));
      return;
    }
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
  await refreshCustomersAfterMutation();
  toast("客户已归档，并从漏斗和业绩统计中移出");
}

async function deleteCustomerFromDialog() {
  const id = Number($("#customerForm [name=id]").value || 0);
  if (!id) return;
  const name = $("#customerForm [name=name]").value || "该客户";
  const confirmed = window.confirm(`确认删除客户：${name}？\n删除后不可恢复，相关机会、跟进、拜访记录会一并删除。`);
  if (!confirmed) return;
  await api(`/customers/${id}`, { method: "DELETE" });
  $("#customerDialog").close();
  customerPage = 1;
  await refreshCustomersAfterMutation();
  toast("客户已删除");
}

async function restoreCustomer(id) {
  await api(`/customers/${id}/restore`, { method: "POST", body: {} });
  $("#followHistoryDialog").close();
  await refreshCustomersAfterMutation();
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
  await refreshCustomersAfterMutation();
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
  const settingsTabs = ["employees", "org", "roles", "products", "competitors", "channels", "lossReasons", "businessRules", "knowledge"];
  if (!settingsTabs.includes(currentSettingsTab)) currentSettingsTab = "employees";
  const showKnowledge = currentSettingsTab === "knowledge";
  $("#settingsAccountsPane").classList.toggle("active", !showKnowledge);
  $("#settingsAccountsPane").classList.toggle("single-settings-pane", !showKnowledge && currentSettingsTab !== "employees");
  $("#settingsKnowledgePane").classList.toggle("active", showKnowledge);
  $$("#settingsAccountsPane [data-settings-section]").forEach((section) => {
    section.classList.toggle("hidden", section.dataset.settingsSection !== currentSettingsTab);
  });
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
  const unitParentSelect = $("#unitParentSelect");
  const unitTypeSelect = $("#unitTypeSelect");
  if (roleSelect) {
    roleSelect.innerHTML = roles().map((role) => `<option value="${role.id}">${role.name}</option>`).join("");
  }
  if (unitSelect) {
    unitSelect.innerHTML = renderUnitOptions(unitSelect.value);
  }
  if (unitParentSelect) {
    unitParentSelect.innerHTML = renderUnitOptions(unitParentSelect.value || orgRootId, { includeRoot: true });
  }
  if (unitTypeSelect) {
    unitTypeSelect.innerHTML = orgTypeOptions.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
  }
  renderBusinessRulesForm();
  $("#userList").innerHTML = renderUserOrgTree();
  $("#competitorList").innerHTML = (state.competitors || []).map((item) => `<article><b><i class="competitor-swatch" style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.name)}</b><span>${item.active === false ? "停用" : "启用"}</span></article>`).join("");
  $("#productList").innerHTML = selectableProducts().map((item) => `
    <article>
      <b>${escapeHtml(item.name)}</b>
      <span>${item.active === false ? "停用" : "启用"} · ${escapeHtml(formatMoney(item.price || 0))} · 排序 ${Number(item.sort || 100)}</span>
      <div class="inline-actions">
        <input type="number" min="0" step="0.01" value="${Number(item.price || 0)}" data-product-price="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}价格" />
        <input type="number" min="0" step="1" value="${Number(item.sort || 100)}" data-product-sort="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}排序" />
        <button data-action="update-product-price" data-id="${escapeHtml(item.id)}">保存</button>
      </div>
    </article>`).join("");
  $("#channelSourceList").innerHTML = (state.channelSources || [])
    .map((item) => `
      <article>
        <b>${escapeHtml(item.name)}</b>
        <span>${item.active === false ? "停用" : "启用"}</span>
        <div class="inline-actions">
          <button data-action="toggle-channel-source" data-id="${escapeHtml(item.id)}">${item.active === false ? "启用" : "停用"}</button>
          <button data-action="delete-channel-source" data-id="${escapeHtml(item.id)}">删除</button>
        </div>
      </article>`)
    .join("");
  $("#lossReasonList").innerHTML = (state.lossReasons || [])
    .map((item) => `
      <article>
        <b>${escapeHtml(item.name)}</b>
        <span>${item.active === false ? "停用" : "启用"}</span>
        <div class="inline-actions">
          <button data-action="toggle-loss-reason" data-id="${escapeHtml(item.id)}">${item.active === false ? "启用" : "停用"}</button>
          <button data-action="delete-loss-reason" data-id="${escapeHtml(item.id)}">删除</button>
        </div>
      </article>`)
    .join("");
  $("#roleList").innerHTML = roles()
    .map((role) => `<article><b>${role.name}</b><span>${scopeLabels[role.customerScope] || role.customerScope}</span><p>${(role.permissions || []).map((permission) => permissionLabels[permission] || permission).join(" · ")}</p></article>`)
    .join("");
  $("#unitList").innerHTML = (state.units || [])
    .map((unit) => `<article class="org-node ${unit.active === false ? "inactive" : ""}" style="--level:${Number(unit.level || 0)}">
      <div>
        <b>${escapeHtml(unit.name)}</b>
        <span>${escapeHtml(orgTypeLabels[unit.type] || unit.type || "单位")}${unit.active === false ? " · 停用" : ""}</span>
        <p>${escapeHtml(unit.path || unit.name)}${unit.zone ? ` · ${escapeHtml(unit.zone)}` : ""}</p>
      </div>
      <div class="inline-actions">
        <button data-action="edit-unit" data-id="${escapeHtml(unit.id)}">编辑</button>
        <button data-action="add-child-unit" data-id="${escapeHtml(unit.id)}">新增下级</button>
        ${unit.id === orgRootId ? "" : `<button data-action="delete-unit" data-id="${escapeHtml(unit.id)}">删除</button>`}
      </div>
    </article>`)
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
  const id = String(form.get("id") || "").trim();
  const parentId = String(form.get("parentId") || orgRootId);
  const type = String(form.get("type") || "unit");
  const sort = Number(form.get("sort") || 100);
  const active = form.get("active") === "on";
  setFormSubmitting(formNode, true, "保存中...");
  try {
    await api(id ? `/units/${encodeURIComponent(id)}` : "/units", {
      method: id ? "PUT" : "POST",
      body: { name, parentId, type, sort, active }
    });
    resetUnitForm();
    await loadState();
    showSuccessFeedback(id ? "组织节点已更新" : "组织节点添加成功", `${name}已保存，组织树和员工单位选项已自动更新。`);
  } catch (error) {
    toast(error.message || "组织节点保存失败");
  } finally {
    setFormSubmitting(formNode, false, "保存中...");
  }
}

function resetUnitForm(parentId = orgRootId) {
  const form = $("#unitForm");
  if (!form) return;
  form.reset();
  form.elements.id.value = "";
  form.elements.parentId.value = parentId;
  form.elements.type.value = "unit";
  form.elements.sort.value = "100";
  form.elements.active.checked = true;
  $("#unitFormMode").textContent = parentId && parentId !== orgRootId ? `在 ${unitLabel(unitForId(parentId))} 下新增` : "新建组织节点";
}

function editUnit(id) {
  const unit = unitForId(id);
  const form = $("#unitForm");
  if (!unit.id || !form) return;
  const excluded = unitDescendantIds(unit.id);
  form.elements.id.value = unit.id;
  form.elements.name.value = unit.name || "";
  $("#unitParentSelect").innerHTML = renderUnitOptions(unit.parentId || orgRootId, { includeRoot: true, excludeIds: excluded });
  form.elements.parentId.value = unit.parentId || orgRootId;
  form.elements.type.value = unit.type === "root" ? "department" : (unit.type || "unit");
  form.elements.sort.value = Number(unit.sort || 100);
  form.elements.active.checked = unit.active !== false;
  $("#unitFormMode").textContent = `编辑：${unitLabel(unit)}`;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
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
  await api("/products", { method: "POST", body: { name: String(form.get("name") || "").trim(), price: Number(form.get("price") || 0), sort: Number(form.get("sort") || 100) } });
  event.currentTarget.reset();
  event.currentTarget.elements.sort.value = "100";
  await loadState();
  showSuccessFeedback("产品添加成功", "产品已加入销售机会和客户导入选项。 ");
}

async function addChannelSource(event) {
  event.preventDefault();
  const formNode = event.currentTarget;
  const name = String(new FormData(formNode).get("name") || "").trim();
  if (!name) return toast("请填写渠道来源名称");
  await api("/channel-sources", { method: "POST", body: { name } });
  formNode.reset();
  await loadState();
  showSuccessFeedback("渠道来源添加成功", `${name} 已同步到客户表单、筛选和导入模板。`);
}

async function updateProductPrice(productId) {
  const product = productById(productId);
  if (!product.id) return;
  const input = [...document.querySelectorAll("[data-product-price]")].find((item) => item.dataset.productPrice === productId);
  const sortInput = [...document.querySelectorAll("[data-product-sort]")].find((item) => item.dataset.productSort === productId);
  await api(`/products/${encodeURIComponent(productId)}`, {
    method: "PUT",
    body: {
      name: product.name,
      price: Number(input?.value || 0),
      sort: Number(sortInput?.value || product.sort || 100),
      active: product.active !== false
    }
  });
  await loadState();
  toast("产品已更新");
}

async function toggleChannelSource(sourceId) {
  const source = (state.channelSources || []).find((item) => item.id === sourceId);
  if (!source) return;
  await api(`/channel-sources/${encodeURIComponent(sourceId)}`, {
    method: "PUT",
    body: { name: source.name, active: source.active === false }
  });
  await loadState();
  toast("渠道来源已更新");
}

async function deleteChannelSource(sourceId) {
  const source = (state.channelSources || []).find((item) => item.id === sourceId);
  if (!source || !confirm(`确认删除渠道来源：${source.name}？已有客户使用的渠道不能删除。`)) return;
  await api(`/channel-sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" });
  await loadState();
  toast("渠道来源已删除");
}

async function addLossReason(event) {
  event.preventDefault();
  const formNode = event.currentTarget;
  const name = String(new FormData(formNode).get("name") || "").trim();
  if (!name) return toast("请填写目前未成交原因名称");
  await api("/loss-reasons", { method: "POST", body: { name } });
  formNode.reset();
  await loadState();
  showSuccessFeedback("目前未成交原因添加成功", `${name} 已同步到客户跟进表单。`);
}

async function toggleLossReason(reasonId) {
  const reason = (state.lossReasons || []).find((item) => item.id === reasonId);
  if (!reason) return;
  await api(`/loss-reasons/${encodeURIComponent(reasonId)}`, {
    method: "PUT",
    body: { name: reason.name, active: reason.active === false }
  });
  await loadState();
  toast("目前未成交原因已更新");
}

async function deleteLossReason(reasonId) {
  const reason = (state.lossReasons || []).find((item) => item.id === reasonId);
  if (!reason || !confirm(`确认删除目前未成交原因：${reason.name}？已有客户使用的原因不能删除。`)) return;
  await api(`/loss-reasons/${encodeURIComponent(reasonId)}`, { method: "DELETE" });
  await loadState();
  toast("目前未成交原因已删除");
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
  if (!unit || !confirm(`确认删除组织节点：${unitLabel(unit)}？`)) return;
  try {
    await api(`/units/${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadState();
    showSuccessFeedback("组织节点已删除", "组织树和员工单位选项已自动更新。");
  } catch (error) {
    toast(error.message || "组织节点删除失败");
  }
}

function sanitizeCustomerFiltersForStage(stage = currentStage) {
  if (stage !== PUBLIC_POOL_STAGE) return;
  ["followPersonFilter", "unitFilter", "followStatusFilter", "lastFollowStart", "lastFollowEnd", "nextFollowStart", "nextFollowEnd"].forEach((id) => {
    const node = $(`#${id}`);
    if (node) node.value = "";
  });
}

function clearCustomerFilters() {
  ["customerKeyword", "stageTimeStart", "stageTimeEnd", "lastFollowStart", "lastFollowEnd", "nextFollowStart", "nextFollowEnd"].forEach((id) => {
    const node = $(`#${id}`);
    if (node) node.value = "";
  });
  ["channelFilter", "createdByFilter", "followPersonFilter", "unitFilter", "cityFilter", "followStatusFilter", "customerSort"].forEach((id) => {
    const node = $(`#${id}`);
    if (node) node.value = id === "customerSort" ? "default" : "";
  });
}

function openDashboardCustomers(customers = [], fallbackStage = "全部") {
  const ids = customers
    .flatMap((item) => [item.id, item.opportunityId, item.customerId])
    .map((id) => Number(id))
    .filter(Boolean);
  const itemStages = [...new Set(customers.map((item) => item.stage).filter(Boolean))];
  dashboardDrilldownIds = new Set(ids);
  currentStage = itemStages.length === 1 ? itemStages[0] : fallbackStage;
  clearCustomerFilters();
  customerPage = 1;
  switchView("customers");
}

function handleDashboardClick(event) {
  if (event.target.closest("#dashboardComputeNowBtn")) {
    scheduleDashboardLoad({ immediate: true });
    return;
  }
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
  if (Array.isArray(action.customers) && action.customers.length) {
    return openDashboardCustomers(action.customers);
  }
  const rows = scopeOpportunityRows();
  const rowsByOpportunityId = new Map(rows.map((item) => [Number(item.id), item]));
  const rowsByCustomerId = new Map(rows.map((item) => [Number(item.customerId), item]));
  const ids = action.opportunityIds || action.customerIds || [];
  openDashboardCustomers(ids.map((id) => rowsByOpportunityId.get(Number(id)) || rowsByCustomerId.get(Number(id))).filter(Boolean));
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
  $("#editUserForm").addEventListener("submit", submitEditUser);
  $("#changePasswordNowBtn").addEventListener("click", () => {
    $("#passwordReminderDialog").close();
    openChangePasswordDialog();
  });
  $("#skipPasswordChangeBtn").addEventListener("click", () => $("#passwordReminderDialog").close());
  $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.closeDialog}`).close()));
  document.addEventListener("click", (event) => {
    const button = event.target.closest("dialog button[value='cancel']");
    if (!button) return;
    event.preventDefault();
    button.closest("dialog")?.close();
  });
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
    localStorage.setItem(CUSTOMER_STAGE_KEY, currentStage);
    customerPage = 1;
    sanitizeCustomerFiltersForStage(currentStage);
    loadCustomerBoardPage().catch((error) => toast(error.message));
  });
  ["customerKeyword", "channelFilter", "createdByFilter", "followPersonFilter", "unitFilter", "cityFilter", "followStatusFilter", "customerSort", "stageTimeStart", "stageTimeEnd", "lastFollowStart", "lastFollowEnd", "nextFollowStart", "nextFollowEnd"].forEach((id) => {
    const resetAndRender = () => {
      dashboardDrilldownIds = null;
      customerPage = 1;
      loadCustomerBoardPage().catch((error) => toast(error.message));
    };
    const debouncedResetAndRender = debounce(resetAndRender, 300);
    const node = $(`#${id}`);
    if (!node) return;
    node.addEventListener("input", debouncedResetAndRender);
    node.addEventListener("change", resetAndRender);
  });
  $("#customerFilterToggle").addEventListener("click", () => {
    const card = $("#customerFilterCard");
    const collapsed = card.classList.toggle("collapsed");
    $("#customerFilterToggle").setAttribute("aria-expanded", String(!collapsed));
  });
  $("#customerPageSize").addEventListener("change", (event) => {
    customerPageSize = clampPageSize(event.currentTarget.value);
    event.currentTarget.value = String(customerPageSize);
    customerPage = 1;
    loadCustomerBoardPage().catch((error) => toast(error.message));
  });
  $("#customerPageSize").addEventListener("blur", (event) => {
    customerPageSize = clampPageSize(event.currentTarget.value);
    event.currentTarget.value = String(customerPageSize);
    customerPage = Math.max(1, Math.min(customerPage, Math.max(Math.ceil(Number(customerBoardData?.total || currentFilteredCustomerRows.length) / customerPageSize), 1)));
    loadCustomerBoardPage().catch((error) => toast(error.message));
  });
  $("#dashboardMonth").addEventListener("change", (event) => {
    const range = monthDates(event.currentTarget.value);
    $("#dashboardStart").value = range.start;
    $("#dashboardEnd").value = range.end;
    scheduleDashboardLoad();
  });
  ["dashboardStart", "dashboardEnd", "dashboardScope"].forEach((id) => $(`#${id}`).addEventListener("change", () => scheduleDashboardLoad()));
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
    loadCustomerBoardPage().catch((error) => toast(error.message));
  });
  $("#customerNextPage").addEventListener("click", () => {
    const totalPages = Math.max(Math.ceil(Number(customerBoardData?.total || currentFilteredCustomerRows.length) / customerPageSize), 1);
    if (customerPage >= totalPages) return;
    customerPage += 1;
    loadCustomerBoardPage().catch((error) => toast(error.message));
  });
  $("#customerJumpPage").addEventListener("click", () => {
    const totalPages = Math.max(Math.ceil(Number(customerBoardData?.total || currentFilteredCustomerRows.length) / customerPageSize), 1);
    const targetPage = Math.min(Math.max(Number($("#customerPageJump").value || 1), 1), totalPages);
    customerPage = targetPage;
    loadCustomerBoardPage().catch((error) => toast(error.message));
  });
  $("#addCustomerBtn").addEventListener("click", () => openCustomerDialog());
  $("#batchImportBtn").addEventListener("click", () => $("#batchDialog").showModal());
  $("#batchAssignBtn").addEventListener("click", openBatchAssignDialog);
  $("#batchChannelBtn")?.addEventListener("click", openBatchChannelDialog);
  $("#assignForm").addEventListener("change", updateAssignPlanHint);
  $("#assignForm").addEventListener("input", updateAssignPlanHint);
  $("#assignUserSearch").addEventListener("input", () => {
    filterAssignCandidates();
    updateAssignPlanHint();
  });
  $("#selectAllCustomers").addEventListener("change", toggleAllCustomers);
  $("#customerRows").addEventListener("change", toggleCustomerSelection);
  $("#customerRows").addEventListener("click", async (event) => {
    const photo = event.target.closest("img[data-photo]");
    if (photo) {
      window.open(photo.dataset.photo, "_blank", "noopener");
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.disabled) return;
    const id = Number(button.dataset.id);
    try {
      if (button.dataset.action === "history") {
        openFollowHistory(await fetchOpportunityDetail(id));
        return;
      }
      if (button.dataset.action === "follow") openCustomerDialog(await fetchOpportunityDetail(id));
      if (button.dataset.action === "ai") analyzeCustomer(id);
      if (button.dataset.action === "advance") await advanceCustomer(id);
      if (button.dataset.action === "claim") await claimCustomer(id, button);
      if (button.dataset.action === "new-opportunity") openNewOpportunityDialog(id, await fetchOpportunityDetail(id));
      if (button.dataset.action === "rollback-request") openRollbackDialog(await fetchOpportunityDetail(id));
      if (button.dataset.action === "rollback-approve") reviewRollback(id, true);
      if (button.dataset.action === "rollback-reject") reviewRollback(id, false);
      if (button.dataset.action === "assign") {
        const select = button.parentElement.querySelector(`select[data-role="assign-owner"][data-id="${id}"]`);
        assignCustomer(id, select?.value);
      }
    } catch (error) {
      toast(error.message || "客户详情加载失败");
    }
  });
  $("#customerForm").addEventListener("submit", saveCustomer);
  $("#purchasedForm")?.addEventListener("submit", submitPurchased);
  $("#rollbackForm")?.addEventListener("submit", submitRollbackRequest);
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
  $("#addCompetitorProfileBtn").addEventListener("click", () => {
    const defaultCompetitor = defaultCompetitorDefinition();
    renderCompetitorProfilesEditor([...readCompetitorProfilesEditor(), { competitorId: defaultCompetitor.id || "", brand: defaultCompetitor.name || "未知", isPrimary: readCompetitorProfilesEditor().length === 0 }]);
  });
  $("#customerCompetitorsEditor").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-competitor]");
    if (!button) return;
    const index = Number(button.closest(".competitor-row").dataset.index);
    renderCompetitorProfilesEditor(readCompetitorProfilesEditor().filter((_, itemIndex) => itemIndex !== index));
  });
  $("#customerAiBtn").addEventListener("click", () => analyzeCustomer(Number($("#customerForm [name=opportunityId]").value)));
  $("#customerPurchasedBtn")?.addEventListener("click", () => openPurchasedDialog(scopeOpportunityRows().find((item) => Number(item.id) === Number($("#customerForm [name=opportunityId]").value))));
  $("#customerArchiveBtn").addEventListener("click", () => archiveCustomerFromDialog().catch((error) => toast(error.message)));
  $("#customerDeleteBtn").addEventListener("click", () => deleteCustomerFromDialog().catch((error) => toast(error.message)));
  $("#followHistoryList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-restore-customer]");
    if (button) restoreCustomer(Number(button.dataset.restoreCustomer)).catch((error) => toast(error.message));
  });
  $("#batchForm").addEventListener("submit", batchImport);
  $("#claimForm").addEventListener("submit", submitClaim);
  $("#assignForm").addEventListener("submit", batchAssignCustomers);
  $("#channelSourceBatchForm")?.addEventListener("submit", batchUpdateChannelSource);
  $("#businessRulesForm")?.addEventListener("submit", saveBusinessRules);
  $("#targetForm").addEventListener("submit", saveTarget);
  $("#recommendBtn").addEventListener("click", recommend);
  $("#aiResult").addEventListener("click", (event) => {
    if (event.target.closest("#saveAiFollowBtn")) saveAiFollowDraft().catch((error) => toast(error.message));
  });
  $("#knowledgeForm").addEventListener("submit", addKnowledge);
  $("#userForm").addEventListener("submit", addUser);
  $("#roleForm").addEventListener("submit", addRole);
  $("#unitForm").addEventListener("submit", addUnit);
  $("#resetUnitFormBtn").addEventListener("click", () => resetUnitForm());
  $("#competitorForm").addEventListener("submit", addCompetitor);
  $("#productForm").addEventListener("submit", addProduct);
  $("#channelSourceForm").addEventListener("submit", addChannelSource);
  $("#lossReasonForm").addEventListener("submit", addLossReason);
  $("#customerProductSelect").addEventListener("change", (event) => fillAmountFromProduct($("#customerForm"), event.target.value));
  $("#customerLossReasonSelect").addEventListener("change", () => toggleLossReasonDetailField($("#customerForm")));
  $("#newOpportunityProductSelect").addEventListener("change", (event) => fillAmountFromProduct($("#newOpportunityForm"), event.target.value));
  $("#openUserImportBtn").addEventListener("click", () => $("#userImportDialog").showModal());
  $("#userImportForm").addEventListener("submit", importUsers);
  $("#offboardForm").addEventListener("submit", submitOffboard);
  $("#userList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "toggle-user-unit") {
      const id = button.dataset.id;
      if (collapsedUserUnitIds.has(id)) collapsedUserUnitIds.delete(id);
      else collapsedUserUnitIds.add(id);
      renderAdmin();
      return;
    }
    if (button.dataset.action === "delete-user") deleteUser(button.dataset.id);
    if (button.dataset.action === "edit-user") openEditUserDialog(button.dataset.id);
    if (button.dataset.action === "reset-password") openResetPasswordDialog(button.dataset.id);
    if (button.dataset.action === "offboard-user") openOffboardDialog(button.dataset.id);
  });
  $("#unitList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "delete-unit") deleteUnit(button.dataset.id);
    if (button.dataset.action === "edit-unit") editUnit(button.dataset.id);
    if (button.dataset.action === "add-child-unit") resetUnitForm(button.dataset.id);
  });
  $("#productList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='update-product-price']");
    if (button) updateProductPrice(button.dataset.id).catch((error) => toast(error.message));
  });
  $("#channelSourceList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "toggle-channel-source") toggleChannelSource(button.dataset.id).catch((error) => toast(error.message));
    if (button.dataset.action === "delete-channel-source") deleteChannelSource(button.dataset.id).catch((error) => toast(error.message));
  });
  $("#lossReasonList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "toggle-loss-reason") toggleLossReason(button.dataset.id).catch((error) => toast(error.message));
    if (button.dataset.action === "delete-loss-reason") deleteLossReason(button.dataset.id).catch((error) => toast(error.message));
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
if (requireLogin()) {
  loadAppState({ render: false })
    .then(() => {
      switchView(currentView, { skipLoad: true });
      return loadCustomerBoardPage({ renderLoading: true });
    })
    .catch((error) => toast(error.message));
}

function renderBusinessRulesForm() {
  const form = $("#businessRulesForm");
  if (!form) return;
  const rules = { ...defaultBusinessRules, ...(state.businessRules || {}) };
  form.elements.newCustomerProtectionDays.value = Number(rules.newCustomerProtectionDays ?? defaultBusinessRules.newCustomerProtectionDays);
  form.elements.publicPoolClaimProtectionDays.value = Number(rules.publicPoolClaimProtectionDays ?? defaultBusinessRules.publicPoolClaimProtectionDays);
  form.elements.inactivePublicPoolDays.value = Number(rules.inactivePublicPoolDays ?? defaultBusinessRules.inactivePublicPoolDays);
  form.elements.publicPoolSortMode.value = rules.publicPoolSortMode || defaultBusinessRules.publicPoolSortMode;
  form.elements.dealCustomersEnterPublicPool.checked = Boolean(rules.dealCustomersEnterPublicPool);
  form.elements.purchasedCustomersEnterPublicPool.checked = Boolean(rules.purchasedCustomersEnterPublicPool);
  form.elements.systemFollowCounts.checked = Boolean(rules.systemFollowCounts);
  form.elements.importFollowCounts.checked = rules.importFollowCounts !== false;
  form.elements.selfImportCountsAssignedUnfollowed.checked = Boolean(rules.selfImportCountsAssignedUnfollowed);
}

async function saveBusinessRules(event) {
  event.preventDefault();
  const formNode = event.currentTarget;
  const form = new FormData(formNode);
  const body = {
    newCustomerProtectionDays: Number(form.get("newCustomerProtectionDays") || 0),
    publicPoolClaimProtectionDays: Number(form.get("publicPoolClaimProtectionDays") || 0),
    inactivePublicPoolDays: Number(form.get("inactivePublicPoolDays") || 0),
    publicPoolSortMode: form.get("publicPoolSortMode"),
    dealCustomersEnterPublicPool: form.get("dealCustomersEnterPublicPool") === "on",
    purchasedCustomersEnterPublicPool: form.get("purchasedCustomersEnterPublicPool") === "on",
    systemFollowCounts: form.get("systemFollowCounts") === "on",
    importFollowCounts: form.get("importFollowCounts") === "on",
    selfImportCountsAssignedUnfollowed: form.get("selfImportCountsAssignedUnfollowed") === "on"
  };
  setFormSubmitting(formNode, true, "保存中...");
  try {
    state.businessRules = await api("/business-rules", { method: "PUT", body });
    renderBusinessRulesForm();
    showSuccessFeedback("业务规则已保存", "新导入、认领、公海轮转和有效跟进判断会按新规则执行。");
  } catch (error) {
    toast(error.message || "业务规则保存失败");
  } finally {
    setFormSubmitting(formNode, false, "保存中...");
  }
}
window.addEventListener("focus", () => {
  if (session() && currentView === "customers") loadCustomerBoardPage({ renderLoading: false }).catch(() => {});
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
