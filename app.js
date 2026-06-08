const API_BASE =
  window.ZHIXIAO_API_BASE ||
  (window.location.protocol === "file:" ? "http://127.0.0.1:8787/api" : `${window.location.origin}/api`);
const AUTH_KEY = "zhixiao-web-auth";
const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const stages = ["名单", "线索", "商机", "成交"];
const adminRoles = ["主管", "区域经理", "运营", "管理员"];

let state = { users: [], customers: [], visits: [], knowledge: [], stages };
let currentStage = "名单";
let currentView = "dashboard";
let currentLocation = {
  latitude: 35.86166,
  longitude: 104.195397,
  city: "",
  address: "",
  ready: false
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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
  return user.role === "销售" ? state.customers.filter((item) => item.owner === user.name) : state.customers;
}

function scopeVisits() {
  const user = currentUser();
  return user.role === "销售"
    ? (state.visits || []).filter((item) => item.ownerId === user.id || item.owner === user.name)
    : state.visits || [];
}

function canAdmin() {
  return adminRoles.includes(currentUser().role);
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
  $("#metricScope").textContent = currentUser().role === "销售" ? "我的数据" : "团队数据";

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

  const sales = state.users.filter((user) => user.role === "销售");
  const ownerOptions = currentUser().role === "销售" ? [currentUser()] : sales;
  $("#ownerFilter").innerHTML = `${currentUser().role === "销售" ? "" : '<option value="">全部销售</option>'}${ownerOptions.map((user) => `<option>${user.name}</option>`).join("")}`;
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
  const customer = {
    id: id || Date.now(),
    name: String(form.get("name")).trim(),
    phone: String(form.get("phone")).trim(),
    stage: String(form.get("stage")),
    owner: String(form.get("owner")),
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
  const rows = String(form.get("rows"))
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  rows.forEach((line, index) => {
    const [name, phone = "待补充", region = "待分区", amount = "15", software = "待补充"] = line.split(/,|，|\t/).map((part) => part.trim());
    state.customers.unshift({ id: Date.now() + index, name, phone, region, amount: Number(amount) || 15, software, owner, stage: currentStage, createdAt: today, lastFollow: today, nextFollow: today, lastNote: "批量导入客户。" });
  });
  await saveState();
  $("#batchDialog").close();
  await loadState();
  toast(`已导入 ${rows.length} 个`);
}

function markerPosition(visit) {
  const longitude = Number(visit.longitude || 105);
  const latitude = Number(visit.latitude || 35);
  return {
    left: Math.min(Math.max(((longitude - 73) / 62) * 100, 5), 95),
    top: Math.min(Math.max(((54 - latitude) / 36) * 100, 8), 92)
  };
}

function renderField() {
  const visits = scopeVisits();
  $("#mapCanvas").innerHTML = visits
    .filter((visit) => visit.latitude && visit.longitude)
    .map((visit) => {
      const pos = markerPosition(visit);
      return `<button class="map-dot ${visit.status === "已成交" ? "sold" : ""}" style="left:${pos.left}%;top:${pos.top}%" title="${visit.factory}"><span>${visit.factory}</span></button>`;
    })
    .join("");
  $("#visitList").innerHTML = visits
    .slice(0, 10)
    .map((visit) => `<article><b>${visit.factory}</b><span class="${visit.status === "已成交" ? "sold-text" : ""}">${visit.status}</span><p>${visit.city || "未知城市"} · ${visit.address || ""}</p><p>${visit.line} · ${visit.software}</p>${(visit.photos || []).map((url) => `<img src="${url}" alt="${visit.factory}" />`).join("")}</article>`)
    .join("");
}

async function locate() {
  if (!navigator.geolocation) return toast("当前浏览器不支持定位");
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(async (position) => {
      currentLocation.latitude = Number(position.coords.latitude.toFixed(6));
      currentLocation.longitude = Number(position.coords.longitude.toFixed(6));
      currentLocation.ready = true;
      try {
        const result = await api(`/amap/regeo?longitude=${currentLocation.longitude}&latitude=${currentLocation.latitude}`);
        currentLocation.city = result.city || "";
        currentLocation.address = result.address || "";
      } catch {}
      $("#locationText").textContent = `${currentLocation.latitude}, ${currentLocation.longitude} · ${currentLocation.city || "地址待解析"}`;
      toast("定位成功");
      resolve(true);
    }, () => {
      toast("定位失败，请检查浏览器权限");
      resolve(false);
    }, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    });
  });
}

async function uploadFiles(files) {
  const urls = [];
  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    const uploaded = await api("/uploads", { method: "POST", body: form });
    urls.push(uploaded.url.startsWith("http") ? uploaded.url : `${location.origin}${uploaded.url}`);
  }
  return urls;
}

async function submitVisit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  if (!currentLocation.ready) {
    toast("请先定位，不能使用默认位置打卡");
    await locate();
    if (!currentLocation.ready) return;
  }
  const photos = await uploadFiles(form.getAll("photos").filter((file) => file.size));
  await api("/visits", {
    method: "POST",
    body: {
      factory: form.get("factory"),
      line: form.get("line") || "待补充",
      software: form.get("software") || "待补充",
      status: form.get("status"),
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      city: currentLocation.city,
      address: currentLocation.address,
      owner: currentUser().name,
      ownerId: currentUser().id,
      photos,
      date: today
    }
  });
  event.currentTarget.reset();
  await loadState();
  toast("地推打卡已上传");
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
  $("#userList").innerHTML = (state.users || [])
    .map((user) => `<article><b>${user.name}</b><span>${user.status || "启用"}</span><p>${user.role} · ${user.region || user.unit || "待分区"} · 账号：${user.account || user.username || user.phone || "-"}</p></article>`)
    .join("");
}

async function addUser(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/users", {
    method: "POST",
    body: {
      name: form.get("name"),
      account: form.get("account"),
      password: form.get("password"),
      phone: form.get("account"),
      role: form.get("role"),
      region: form.get("unit") || "待分配",
      unit: form.get("unit") || "待分配"
    }
  });
  event.currentTarget.reset();
  await loadState();
  toast("账号已开通");
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
  $("#locateBtn").addEventListener("click", locate);
  $("#visitForm").addEventListener("submit", submitVisit);
  $("#recommendBtn").addEventListener("click", recommend);
  $("#knowledgeForm").addEventListener("submit", addKnowledge);
  $("#userForm").addEventListener("submit", addUser);
}

wireEvents();
if (requireLogin()) loadState().catch((error) => toast(error.message));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
