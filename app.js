const API_BASE =
  window.ZHIXIAO_API_BASE ||
  (window.location.protocol === "file:" ? "http://127.0.0.1:8787/api" : `${window.location.origin}/api`);
const AUTH_KEY = "zhixiao-web-auth";
const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const stages = ["名单", "线索", "商机", "成交"];
const zones = ["东部战区", "南部战区", "西部战区", "北部战区", "中部战区"];
const scopeLabels = { self: "仅本人客户", unit: "本单位客户", zone: "本战区客户", all: "全部客户" };
const permissionLabels = { dashboard: "看板", customers: "客户管理", field: "地推地图", assistant: "AI话术", admin: "账号后台" };
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
let fieldMap = null;
let fieldLayer = null;

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
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

function setSession(data) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(data));
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

function switchView(view) {
  currentView = view;
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".view").forEach((item) => item.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  const titles = { dashboard: "看板", customers: "客户管理", field: "地推地图", assistant: "AI话术", admin: "账号后台" };
  $("#viewTitle").textContent = titles[view];
  $("#viewCrumb").textContent = titles[view];
  render();
}

function render() {
  if (!requireLogin()) return;
  const user = currentUser();
  $("#currentUserText").textContent = `${user.name || "用户"} · ${user.role || ""}`;
  $$(".admin-only").forEach((node) => node.classList.toggle("hidden", !canAdmin()));
  if (currentView === "admin" && !canAdmin()) switchView("dashboard");
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
  $("#metricScope").textContent = roleForUser(currentUser()).customerScope === "self" ? "我的数据" : "团队数据";

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
  $("#stageTabs").innerHTML = stages
    .map((stage) => `<button class="${currentStage === stage ? "active" : ""}" data-stage="${stage}">${stage}<span>${customers.filter((item) => item.stage === stage).length}</span></button>`)
    .join("");

  const ownerOptions = visibleSales();
  $("#ownerFilter").innerHTML = `${roleForUser(currentUser()).customerScope === "self" ? "" : '<option value="">全部销售</option>'}${ownerOptions.map((user) => `<option>${user.name}</option>`).join("")}`;
  $("#customerOwnerSelect").innerHTML = ownerOptions.map((user) => `<option>${user.name}</option>`).join("");
  $("#batchOwnerSelect").innerHTML = ownerOptions.map((user) => `<option>${user.name}</option>`).join("");
  $("#customerStageSelect").innerHTML = stages.map((stage) => `<option>${stage}</option>`).join("");

  const keyword = $("#customerKeyword").value.trim().toLowerCase();
  const owner = $("#ownerFilter").value;
  const follow = $("#followFilter").value;
  const rows = customers.filter((item) => {
    const source = `${item.name} ${item.phone} ${item.software} ${item.lastNote}`.toLowerCase();
    if (item.stage !== currentStage) return false;
    if (keyword && !source.includes(keyword)) return false;
    if (owner && item.owner !== owner) return false;
    if (follow === "today" && item.nextFollow !== today) return false;
    if (follow === "overdue" && (!item.nextFollow || item.nextFollow >= today)) return false;
    if (follow === "none" && item.nextFollow) return false;
    return true;
  });
  $("#customerRows").innerHTML = rows.length
    ? rows.map(customerRow).join("")
    : `<tr><td colspan="7" class="empty">暂无客户</td></tr>`;
}

function customerRow(item) {
  const dueClass = item.nextFollow && item.nextFollow < today ? "overdue" : item.nextFollow === today ? "today" : "";
  return `
    <tr>
      <td><b>${item.name}</b><small>${item.lastNote || ""}</small></td>
      <td><a href="tel:${item.phone}">${item.phone}</a></td>
      <td>${item.owner}</td>
      <td>${item.region || "待分区"}</td>
      <td>${item.software || "待补充"}</td>
      <td class="${dueClass}">${item.nextFollow || "未设置"}</td>
      <td><button data-action="follow" data-id="${item.id}">跟进</button><button data-action="advance" data-id="${item.id}">${item.stage === "成交" ? "已成交" : "推进"}</button></td>
    </tr>`;
}

function openCustomerDialog(customer = null) {
  const form = $("#customerForm");
  form.reset();
  form.id.value = customer?.id || "";
  form.name.value = customer?.name || "";
  form.phone.value = customer?.phone || "";
  form.stage.value = customer?.stage || currentStage;
  form.owner.value = customer?.owner || $("#customerOwnerSelect").value;
  form.region.value = customer?.region || "";
  form.amount.value = customer?.amount || 15;
  form.software.value = customer?.software || "";
  form.note.value = "";
  form.nextFollow.value = customer?.nextFollow || today;
  $("#customerDialogTitle").textContent = customer ? "客户跟进" : "新增客户";
  $("#customerDialog").showModal();
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
    stage: String(form.get("stage")),
    owner: String(form.get("owner")),
    ownerId: ownerUser.id || "",
    unitId: ownerUser.unitId || "",
    unit: ownerUser.unit || ownerUnit.name || "",
    zone: ownerUser.zone || ownerUnit.zone || "",
    region: String(form.get("region") || "待分区"),
    amount: Number(form.get("amount") || 15),
    software: String(form.get("software") || "待补充"),
    createdAt: id ? undefined : today,
    lastFollow: today,
    nextFollow: String(form.get("nextFollow") || ""),
    lastNote: String(form.get("note") || "更新了客户跟进。")
  };
  const index = state.customers.findIndex((item) => item.id === id);
  if (index >= 0) state.customers[index] = { ...state.customers[index], ...customer };
  else state.customers.unshift(customer);
  await saveState();
  $("#customerDialog").close();
  await loadState();
  toast("已保存");
}

async function advanceCustomer(id) {
  const customer = state.customers.find((item) => item.id === id);
  const index = stages.indexOf(customer.stage);
  if (index >= stages.length - 1) return;
  customer.stage = stages[index + 1];
  customer.lastFollow = today;
  customer.nextFollow = today;
  customer.lastNote = `客户推进至${customer.stage}阶段。`;
  currentStage = customer.stage;
  await saveState();
  await loadState();
  toast("已推进");
}

async function batchImport(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#batchDialog").close();
  const form = new FormData(event.currentTarget);
  const owner = String(form.get("owner"));
  const ownerUser = userByName(owner);
  const ownerId = ownerUser.id || "";
  const rows = String(form.get("rows"))
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  rows.forEach((line, index) => {
    const [name, phone = "待补充", region = "待分区", amount = "15", software = "待补充"] = line.split(/,|，|\t/).map((part) => part.trim());
    state.customers.unshift({ id: Date.now() + index, name, phone, region, amount: Number(amount) || 15, software, owner, ownerId, unitId: ownerUser.unitId || "", unit: ownerUser.unit || "", zone: ownerUser.zone || "", stage: currentStage, createdAt: today, lastFollow: today, nextFollow: today, lastNote: "批量导入客户。" });
  });
  await saveState();
  $("#batchDialog").close();
  await loadState();
  toast(`已导入 ${rows.length} 个`);
}

function isSoldStatus(status) {
  return status === "成交" || status === "已成交";
}

function displayVisitStatus(status) {
  const legacy = { 待攻克: "名单", 跟进中: "线索", 已成交: "成交" };
  return legacy[status] || status || "线索";
}

function visitDeviceLine(visit) {
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
  if (!node || !window.L) {
    if (node) node.innerHTML = '<div class="map-empty">地图资源加载中，请稍后刷新</div>';
    return false;
  }
  if (fieldMap) {
    setTimeout(() => fieldMap.invalidateSize(), 0);
    return true;
  }
  fieldMap = L.map(node, {
    zoomControl: true,
    attributionControl: true
  }).setView([35.86166, 104.195397], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap"
  }).addTo(fieldMap);
  fieldLayer = L.layerGroup().addTo(fieldMap);
  return true;
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
  fieldLayer.clearLayers();
  const bounds = [];
  visits.filter(validVisitLocation).forEach((visit) => {
    const latitude = Number(visit.latitude);
    const longitude = Number(visit.longitude);
    const sold = isSoldStatus(visit.status);
    const marker = L.circleMarker([latitude, longitude], {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: sold ? "#f56c6c" : "#67c23a",
      fillOpacity: 0.95
    });
    marker.bindPopup(`
      <strong>${escapeHtml(visit.factory || "未命名工厂")}</strong>
      <p>${escapeHtml(displayVisitStatus(visit.status))} · ${escapeHtml(visit.city || "未知城市")}</p>
      <p>${escapeHtml(visit.address || "")}</p>
      <p>${escapeHtml(visitDeviceLine(visit))}</p>
      <p>${escapeHtml(visit.software || "待补充")} ${visit.softwarePrice ? `· ${escapeHtml(visit.softwarePrice)}` : ""}</p>
    `);
    marker.addTo(fieldLayer);
    bounds.push([latitude, longitude]);
  });
  if (bounds.length) fieldMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
  else fieldMap.setView([35.86166, 104.195397], 5);
  setTimeout(() => fieldMap.invalidateSize(), 0);
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
            <p>${escapeHtml(visitDeviceLine(visit))}</p>
            <p>${escapeHtml(visit.software || "待补充")}${visit.softwarePrice ? ` · ${escapeHtml(visit.softwarePrice)}` : ""} · ${escapeHtml(visit.date || "")}</p>
            ${(visit.photos || []).map((url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(visit.factory || "现场图片")}" />`).join("")}
          </article>`;
        })
        .join("")
    : `<div class="empty">暂无地推拜访数据，请先在小程序选择位置并上传打卡。</div>`;
}

function renderAssistant() {
  $("#knowledgeList").innerHTML = (state.knowledge || [])
    .map((item) => `<article><b>${item.question}</b><p>${item.answer}</p></article>`)
    .join("");
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
  await api("/knowledge", { method: "POST", body: { question: form.get("question"), answer: form.get("answer") } });
  event.currentTarget.reset();
  await loadState();
  toast("知识库已添加");
}

function renderAdmin() {
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
    .map((user) => `<article><b>${user.name}</b><span>${user.status || "启用"}</span><p>${user.role} · ${user.unit || "待分配"} · ${user.zone || "未分战区"} · 账号：${user.account || user.username || user.phone || "-"}</p></article>`)
    .join("");
  $("#roleList").innerHTML = roles()
    .map((role) => `<article><b>${role.name}</b><span>${scopeLabels[role.customerScope] || role.customerScope}</span><p>${(role.permissions || []).map((permission) => permissionLabels[permission] || permission).join(" · ")}</p></article>`)
    .join("");
  $("#unitList").innerHTML = (state.units || [])
    .map((unit) => `<article><b>${unit.name}</b><span>${unit.zone}</span><p>销售选择该单位后，客户自动归属到该单位和战区。</p></article>`)
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
  toast("账号已开通");
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
  toast("角色已添加");
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
  toast("单位已添加");
}

function wireEvents() {
  $("#loginForm").addEventListener("submit", login);
  $("#logoutBtn").addEventListener("click", logout);
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $("#stageTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    currentStage = button.dataset.stage;
    renderCustomers();
  });
  ["customerKeyword", "ownerFilter", "followFilter"].forEach((id) => $(`#${id}`).addEventListener("input", renderCustomers));
  $("#addCustomerBtn").addEventListener("click", () => openCustomerDialog());
  $("#batchImportBtn").addEventListener("click", () => $("#batchDialog").showModal());
  $("#customerRows").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === "follow") openCustomerDialog(state.customers.find((item) => item.id === id));
    if (button.dataset.action === "advance") advanceCustomer(id);
  });
  $("#customerForm").addEventListener("submit", saveCustomer);
  $("#batchForm").addEventListener("submit", batchImport);
  $("#recommendBtn").addEventListener("click", recommend);
  $("#knowledgeForm").addEventListener("submit", addKnowledge);
  $("#userForm").addEventListener("submit", addUser);
  $("#roleForm").addEventListener("submit", addRole);
  $("#unitForm").addEventListener("submit", addUnit);
}

wireEvents();
if (requireLogin()) loadState().catch((error) => toast(error.message));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
