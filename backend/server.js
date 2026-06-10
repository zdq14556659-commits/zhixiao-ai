const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8787);
const AMAP_KEY = process.env.AMAP_KEY || "";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const BACKUP_FILE = path.join(DATA_DIR, "db.backup.json");
const SEED_FILE = path.join(DATA_DIR, "seed.json");
const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, "uploads");
const FALLBACK_SEED_FILE = path.join(__dirname, "data", "seed.json");
const PUBLIC_ROOT = path.resolve(__dirname, "..");
const CUSTOMER_TEMPLATE_FILE = path.join(__dirname, "templates", "customer-import-template.xlsx");
const STAGES = ["名单", "线索", "商机", "成交"];
const CHANNEL_SOURCES = ["自媒体", "官网留言", "自主注册", "渠道介绍", "企查查", "客源汇", "公众号", "地推", "其他"];
const ZONES = ["东部战区", "南部战区", "西部战区", "北部战区", "中部战区"];
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_ROLES = ["总负责人", "运营", "管理员"];
const DEFAULT_PERMISSIONS = ["dashboard", "customers", "field", "assistant"];
const ADMIN_PERMISSIONS = [...DEFAULT_PERMISSIONS, "admin"];
const REASSIGN_DAYS = 30;
const DEFAULT_ROLES = [
  { id: "role-owner", name: "总负责人", customerScope: "all", permissions: ADMIN_PERMISSIONS },
  { id: "role-region", name: "区域经理", customerScope: "zone", permissions: DEFAULT_PERMISSIONS },
  { id: "role-supervisor", name: "主管", customerScope: "unit", permissions: DEFAULT_PERMISSIONS },
  { id: "role-sales", name: "销售", customerScope: "self", permissions: DEFAULT_PERMISSIONS },
  { id: "role-ops", name: "运营", customerScope: "all", permissions: ADMIN_PERMISSIONS },
  { id: "role-admin", name: "管理员", customerScope: "all", permissions: ADMIN_PERMISSIONS }
];
const DEFAULT_UNITS = [];
const LEGACY_DEMO_UNIT_IDS = new Set([
  "unit-east-custom",
  "unit-south-custom",
  "unit-west-custom",
  "unit-north-custom",
  "unit-central-channel",
  "unit-national-channel",
  "unit-hq-growth"
]);
const DEMO_ACCOUNTS = {
  林晨: "linchen",
  周扬: "zhouyang",
  陈主管: "chen",
  王区域: "wang",
  运营小组: "admin"
};

ensureDataFile();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "server error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`智销AI backend running: http://localhost:${PORT}`);
});

async function routeApi(req, res, url) {
  if (req.method === "OPTIONS") return sendNoContent(res);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "zhixiao-ai-backend" });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const state = readState();
    const account = cleanAccount(body.account || body.username || body.phone || "");
    const password = String(body.password || "");
    const user = state.users.find((item) => {
      const keys = [item.account, item.username, item.phone].map(cleanAccount).filter(Boolean);
      return keys.includes(account);
    });
    if (!user || String(user.password || "") !== password) {
      return sendJson(res, 401, { error: "账号或密码错误" });
    }
    if (user.status === "停用") {
      return sendJson(res, 403, { error: "账号已停用，请联系管理员" });
    }
    state.currentUserId = user.id;
    writeState(state);
    return sendJson(res, 200, {
      token: makeToken(user),
      user: publicUser(user),
      state: toMiniState(state, user)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/import/customers/template") {
    return sendFile(res, CUSTOMER_TEMPLATE_FILE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "CRM名单模板.xlsx");
  }

  const authState = readState();
  const authUser = getAuthUser(req, authState);
  if (!authUser) return sendJson(res, 401, { error: "请先登录" });

  if (req.method === "GET" && url.pathname === "/api/state") {
    const client = url.searchParams.get("client") || "web";
    const state = authState;
    return sendJson(res, 200, client === "mini" ? toMiniState(state, authUser) : publicState(state, authUser));
  }

  if (req.method === "PUT" && url.pathname === "/api/state") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!viewer) return sendJson(res, 401, { error: "请先登录" });
    const nextState = normalizeIncomingState(body);
    writeState(nextState);
    return sendJson(res, 200, { ok: true, state: publicState(nextState, viewer) });
  }

  if (req.method === "POST" && url.pathname === "/api/customers") {
    const body = await readBody(req);
    const state = readState();
    const customer = normalizeCustomer({ id: Date.now(), ...body }, state);
    state.customers.unshift(customer);
    state.activities.push({ date: today(), owner: customer.owner, type: customer.stage, customerId: customer.id });
    writeState(state);
    return sendJson(res, 201, toMiniCustomer(customer));
  }

  const customerFollow = url.pathname.match(/^\/api\/customers\/(\d+)\/follow$/);
  if (req.method === "POST" && customerFollow) {
    const body = await readBody(req);
    const state = readState();
    const customer = state.customers.find((item) => item.id === Number(customerFollow[1]));
    if (!customer) return sendJson(res, 404, { error: "customer not found" });
    customer.followUps = customer.followUps || [];
    customer.followUps.push({
      date: body.date || today(),
      note: body.note || "更新了下次跟进时间。",
      nextFollow: body.nextFollow || ""
    });
    writeState(state);
    return sendJson(res, 200, toMiniCustomer(customer));
  }

  const customerAssign = url.pathname.match(/^\/api\/customers\/(\d+)\/assign$/);
  if (req.method === "POST" && customerAssign) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const index = state.customers.findIndex((item) => item.id === Number(customerAssign[1]));
    if (index < 0) return sendJson(res, 404, { error: "customer not found" });
    const customer = state.customers[index];
    if (!canAssignCustomers(state, viewer)) return sendJson(res, 403, { error: "无客户分配权限" });
    if (!canViewRecord(state, viewer, customer)) return sendJson(res, 403, { error: "不可分配不可见客户" });
    if (!isCustomerAssignable(customer)) return sendJson(res, 400, { error: "当前客户暂不满足分配条件" });
    const target = findAssignableSalesUser(state, viewer, body.ownerId, body.owner || body.followPerson);
    if (!target) return sendJson(res, 400, { error: "请选择当前权限内的销售" });
    const { next, previousStage } = buildAssignedCustomer(state, viewer, customer, target, body);
    state.customers[index] = next;
    if (previousStage !== next.stage) {
      state.activities.push({ date: today(), owner: next.owner, type: next.stage, customerId: next.id });
    }
    writeState(state);
    return sendJson(res, 200, toMiniCustomer(next));
  }

  if (req.method === "POST" && url.pathname === "/api/customers/assign") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canAssignCustomers(state, viewer)) return sendJson(res, 403, { error: "无客户分配权限" });
    const ids = [...new Set((body.ids || body.customerIds || []).map((id) => Number(id)).filter(Boolean))];
    if (!ids.length) return sendJson(res, 400, { error: "请选择要分配的客户" });
    const target = findAssignableSalesUser(state, viewer, body.ownerId, body.owner || body.followPerson);
    if (!target) return sendJson(res, 400, { error: "请选择当前权限内的销售" });
    const assignedCustomers = [];
    const failed = [];
    ids.forEach((id) => {
      const index = state.customers.findIndex((item) => Number(item.id) === Number(id));
      if (index < 0) {
        failed.push({ id, reason: "客户不存在" });
        return;
      }
      const customer = state.customers[index];
      if (!canViewRecord(state, viewer, customer)) {
        failed.push({ id, name: customer.name, reason: "无权查看" });
        return;
      }
      if (!isCustomerAssignable(customer)) {
        failed.push({ id, name: customer.name, reason: "不满足分配条件" });
        return;
      }
      const { next, previousStage } = buildAssignedCustomer(state, viewer, customer, target, body);
      state.customers[index] = next;
      if (previousStage !== next.stage) {
        state.activities.push({ date: today(), owner: next.owner, type: next.stage, customerId: next.id });
      }
      assignedCustomers.push(toMiniCustomer(next));
    });
    if (assignedCustomers.length) writeState(state);
    return sendJson(res, 200, {
      assigned: assignedCustomers.length,
      failed,
      customers: assignedCustomers
    });
  }

  const customerPatch = url.pathname.match(/^\/api\/customers\/(\d+)$/);
  if ((req.method === "PATCH" || req.method === "PUT") && customerPatch) {
    const body = await readBody(req);
    const state = readState();
    const index = state.customers.findIndex((item) => item.id === Number(customerPatch[1]));
    if (index < 0) return sendJson(res, 404, { error: "customer not found" });
    const previous = state.customers[index];
    const previousStage = previous.stage;
    const next = normalizeCustomer({ ...previous, ...body, id: previous.id }, state);
    const shouldAddFollow =
      body.lastNote !== undefined ||
      body.note !== undefined ||
      body.nextFollow !== undefined ||
      body.lastFollow !== undefined ||
      (body.stage && body.stage !== previousStage);
    if (shouldAddFollow) {
      const followDate = body.lastFollow || body.date || today();
      const followNote = body.lastNote || body.note || (body.stage && body.stage !== previousStage ? `客户推进至${next.stage}阶段。` : "更新了客户信息。");
      const followNext = body.nextFollow !== undefined ? body.nextFollow : ((next.followUps[next.followUps.length - 1] || {}).nextFollow || "");
      const latest = next.followUps[next.followUps.length - 1] || {};
      if (latest.date !== followDate || latest.note !== followNote || latest.nextFollow !== followNext) {
        next.followUps.push({ date: followDate, note: followNote, nextFollow: followNext });
      }
    }
    state.customers[index] = next;
    if (body.stage && body.stage !== previousStage) {
      state.activities.push({
        date: body.date || today(),
        owner: state.customers[index].owner,
        type: body.stage,
        customerId: state.customers[index].id
      });
    }
    writeState(state);
    return sendJson(res, 200, toMiniCustomer(state.customers[index]));
  }

  if (req.method === "POST" && url.pathname === "/api/visits") {
    const body = await readBody(req);
    const state = readState();
    const visit = normalizeVisit({ id: Date.now(), date: today(), photos: [], ...body }, state);
    state.visits.unshift(visit);
    syncVisitToCustomer(state, visit);
    writeState(state);
    return sendJson(res, 201, visit);
  }

  const visitPatch = url.pathname.match(/^\/api\/visits\/(\d+)$/);
  if ((req.method === "PATCH" || req.method === "PUT") && visitPatch) {
    const body = await readBody(req);
    const state = readState();
    const index = state.visits.findIndex((item) => Number(item.id) === Number(visitPatch[1]));
    if (index < 0) return sendJson(res, 404, { error: "visit not found" });
    const visit = normalizeVisit({
      ...state.visits[index],
      ...body,
      id: state.visits[index].id,
      date: body.date || state.visits[index].date || today()
    }, state);
    state.visits[index] = visit;
    syncVisitToCustomer(state, visit);
    writeState(state);
    return sendJson(res, 200, visit);
  }

  if (req.method === "POST" && url.pathname === "/api/uploads") {
    const upload = await saveMultipartUpload(req);
    return sendJson(res, 201, upload);
  }

  if (req.method === "POST" && url.pathname === "/api/import/customers") {
    const result = await importCustomers(req);
    return sendJson(res, 201, result);
  }

  if (req.method === "GET" && url.pathname === "/api/import/customers/template") {
    return sendFile(res, CUSTOMER_TEMPLATE_FILE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "CRM名单模板.xlsx");
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无账号后台权限" });
    const account = cleanAccount(body.account || body.username || body.phone || "");
    if (!body.name || !account || !body.password) {
      return sendJson(res, 400, { error: "员工姓名、登录账号、初始密码必填" });
    }
    if (state.users.some((item) => cleanAccount(item.account) === account || cleanAccount(item.phone) === account)) {
      return sendJson(res, 409, { error: "登录账号已存在" });
    }
    const user = normalizeUser({
      id: Date.now(),
      name: body.name,
      phone: body.phone || "",
      account,
      password: String(body.password),
      role: body.role || "销售",
      roleId: body.roleId || "",
      unitId: body.unitId || "",
      unit: body.unit || body.region || "待分配",
      region: body.region || "待分区",
      status: "启用"
    }, 0, state);
    state.users.push(user);
    writeState(state);
    return sendJson(res, 201, publicUser(user));
  }

  const userDelete = url.pathname.match(/^\/api\/users\/(\d+)$/);
  if (req.method === "DELETE" && userDelete) {
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无员工删除权限" });
    const id = Number(userDelete[1]);
    if (viewer && Number(viewer.id) === id) return sendJson(res, 400, { error: "不能删除当前登录账号" });
    const before = state.users.length;
    state.users = state.users.filter((user) => Number(user.id) !== id);
    if (state.users.length === before) return sendJson(res, 404, { error: "员工不存在" });
    writeState(state);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/roles") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无角色管理权限" });
    const role = normalizeRole({
      id: body.id || stableId("role", body.name || Date.now()),
      name: body.name,
      customerScope: body.customerScope || "self",
      permissions: Array.isArray(body.permissions) ? body.permissions : DEFAULT_PERMISSIONS
    });
    if (!role.name) return sendJson(res, 400, { error: "角色名称必填" });
    if (state.roles.some((item) => cleanText(item.name) === cleanText(role.name))) {
      return sendJson(res, 409, { error: "角色已存在" });
    }
    state.roles.push(role);
    writeState(state);
    return sendJson(res, 201, role);
  }

  if (req.method === "POST" && url.pathname === "/api/units") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无单位管理权限" });
    const unit = normalizeUnit({
      id: body.id || stableId("unit", body.name || Date.now()),
      name: body.name,
      zone: body.zone || body.region
    });
    if (!unit.name) return sendJson(res, 400, { error: "单位名称必填" });
    if (state.units.some((item) => cleanText(item.name) === cleanText(unit.name))) {
      return sendJson(res, 409, { error: "单位已存在" });
    }
    state.units.push(unit);
    writeState(state);
    return sendJson(res, 201, unit);
  }

  const unitDelete = url.pathname.match(/^\/api\/units\/([^/]+)$/);
  if (req.method === "DELETE" && unitDelete) {
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无单位删除权限" });
    const id = decodeURIComponent(unitDelete[1]);
    const before = state.units.length;
    state.units = state.units.filter((unit) => unit.id !== id);
    if (state.units.length === before) return sendJson(res, 404, { error: "单位不存在" });
    state.users = state.users.map((user) => user.unitId === id ? { ...user, unitId: "", unit: "待分配" } : user);
    writeState(state);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/knowledge") {
    const body = await readBody(req);
    const state = readState();
    const item = {
      id: Date.now(),
      question: body.question || "",
      answer: body.answer || "",
      createdAt: today()
    };
    state.knowledge.unshift(item);
    writeState(state);
    return sendJson(res, 201, item);
  }

  if (req.method === "POST" && url.pathname === "/api/ai/script") {
    const body = await readBody(req);
    const state = readState();
    const result = await generateXiaozhiStrategy(body.question || "", state.knowledge || [], body.customer || null);
    return sendJson(res, 200, result);
  }

  if (req.method === "GET" && url.pathname === "/api/amap/regeo") {
    const longitude = url.searchParams.get("longitude");
    const latitude = url.searchParams.get("latitude");
    if (!longitude || !latitude) return sendJson(res, 400, { error: "longitude and latitude required" });
    const result = await amapRegeo(longitude, latitude);
    return sendJson(res, 200, result);
  }

  sendJson(res, 404, { error: "not found" });
}

function normalizeIncomingState(input) {
  const current = readState();
  const merged = {
    ...current,
    ...input,
    roles: mergeById(current.roles, input.roles),
    units: mergeById(current.units, input.units),
    users: mergeUsers(input.users, current.users),
    customers: mergeById(current.customers, input.customers),
    activities: mergeById(current.activities, input.activities),
    visits: mergeById(current.visits, input.visits),
    knowledge: input.knowledge || current.knowledge || [],
    resources: input.resources || current.resources || []
  };
  return migrateState(merged);
}

function mergeById(existing = [], incoming) {
  if (!Array.isArray(incoming)) return existing || [];
  const map = new Map((existing || []).map((item) => [String(item.id || stableId("item", JSON.stringify(item))), item]));
  incoming.forEach((item) => {
    const key = String(item.id || stableId("item", JSON.stringify(item)));
    map.set(key, { ...(map.get(key) || {}), ...item });
  });
  return Array.from(map.values());
}

function mergeUsers(incomingUsers, existingUsers) {
  if (!Array.isArray(incomingUsers)) return existingUsers || [];
  const merged = [...(existingUsers || [])];
  incomingUsers.forEach((user) => {
    const existing = (existingUsers || []).find((item) => {
      return (
        Number(item.id) === Number(user.id) ||
        (user.account && cleanAccount(item.account) === cleanAccount(user.account)) ||
        (user.phone && cleanAccount(item.phone) === cleanAccount(user.phone))
      );
    });
    const next = {
      ...existing,
      ...user,
      account: user.account || user.username || existing?.account || existing?.username,
      password: user.password || existing?.password || "123456"
    };
    const index = merged.findIndex((item) => Number(item.id) === Number(next.id) || cleanAccount(item.account) === cleanAccount(next.account));
    if (index >= 0) merged[index] = next;
    else merged.push(next);
  });
  return merged;
}

function migrateState(state) {
  const roles = normalizeRoles(state.roles || []);
  const units = normalizeUnits(state.units || [], state);
  const users = normalizeUsers(state.users || [], { roles, units });
  const context = { roles, units, users };
  return {
    version: state.version || "backend-v2",
    currentUserId: Number(state.currentUserId || users[0]?.id || 0),
    stages: Array.isArray(state.stages) && state.stages.length ? state.stages : STAGES,
    zones: Array.isArray(state.zones) && state.zones.length ? state.zones : ZONES,
    roles,
    units,
    users,
    customers: (state.customers || []).map((customer) => normalizeCustomer(customer, context)),
    activities: state.activities || [],
    visits: (state.visits || []).map((visit) => normalizeVisit(visit, context)),
    knowledge: state.knowledge || [],
    resources: state.resources || []
  };
}

function normalizeRoles(roles) {
  const incoming = Array.isArray(roles) ? roles : [];
  const merged = [...DEFAULT_ROLES];
  incoming.forEach((role) => {
    const normalized = normalizeRole(role);
    const index = merged.findIndex((item) => item.id === normalized.id || cleanText(item.name) === cleanText(normalized.name));
    if (index >= 0) merged[index] = { ...merged[index], ...normalized };
    else merged.push(normalized);
  });
  return merged;
}

function normalizeRole(role = {}) {
  const name = role.name || "自定义角色";
  const customerScope = ["self", "unit", "zone", "all"].includes(role.customerScope) ? role.customerScope : "self";
  const permissions = Array.isArray(role.permissions) && role.permissions.length ? role.permissions : DEFAULT_PERMISSIONS;
  return {
    id: role.id || stableId("role", name),
    name,
    customerScope,
    permissions: [...new Set(permissions)]
  };
}

function normalizeUnits(units) {
  const merged = [...DEFAULT_UNITS];
  const sources = (Array.isArray(units) ? units : []).filter((unit) => unit && unit.name && !LEGACY_DEMO_UNIT_IDS.has(unit.id));
  sources.forEach((unit) => {
    const normalized = normalizeUnit(unit);
    const index = merged.findIndex((item) => item.id === normalized.id || cleanText(item.name) === cleanText(normalized.name));
    if (index >= 0) merged[index] = { ...merged[index], ...normalized };
    else merged.push(normalized);
  });
  return merged;
}

function normalizeUnit(unit = {}) {
  const name = unit.name || unit.unit || unit.region || "";
  return {
    id: unit.id || stableId("unit", name),
    name,
    zone: normalizeZone(unit.zone || unit.region || name)
  };
}

function normalizeUsers(users, context = {}) {
  const used = new Set();
  return users.map((user, index) => {
    const next = normalizeUser(user, index, context);
    const base = next.account || `user${next.id}`;
    let account = base;
    let suffix = 2;
    while (used.has(account)) {
      account = `${base}${suffix}`;
      suffix += 1;
    }
    used.add(account);
    next.account = account;
    next.username = account;
    return next;
  });
}

function normalizeUser(user = {}, index = 0, context = {}) {
  const id = Number(user.id || Date.now() + index);
  const name = user.name || `员工${index + 1}`;
  const role = user.role || "销售";
  const roles = context.roles || DEFAULT_ROLES;
  const units = context.units || DEFAULT_UNITS;
  const roleDef = findRole(roles, user.roleId, role);
  const rawUnitId = LEGACY_DEMO_UNIT_IDS.has(user.unitId) ? "" : user.unitId;
  const rawUnitName = LEGACY_DEMO_UNIT_IDS.has(user.unitId) ? "" : user.unit || user.region;
  const unit = findUnit(units, rawUnitId, rawUnitName);
  const fallbackAccount = DEMO_ACCOUNTS[name] || (ADMIN_ROLES.includes(roleDef.name) ? "admin" : `user${id}`);
  const account = cleanAccount(user.account || user.username || user.login || user.phone || fallbackAccount);
  return {
    id,
    name,
    phone: user.phone || "",
    account,
    username: account,
    password: String(user.password || user.initialPassword || "123456"),
    role: roleDef.name,
    roleId: roleDef.id,
    unitId: unit.id,
    unit: unit.name || user.unit || user.region || "待分配",
    zone: unit.zone || normalizeZone(user.zone || user.region || user.unit),
    region: user.region || unit.zone || unit.name || "待分区",
    status: user.status || "启用",
    createdAt: user.createdAt || today()
  };
}

function findRole(roles = DEFAULT_ROLES, roleId, roleName) {
  return (
    roles.find((role) => roleId && role.id === roleId) ||
    roles.find((role) => cleanText(role.name) === cleanText(roleName)) ||
    DEFAULT_ROLES.find((role) => cleanText(role.name) === cleanText(roleName)) ||
    DEFAULT_ROLES.find((role) => role.name === "销售")
  );
}

function findUnit(units = DEFAULT_UNITS, unitId, unitName) {
  const name = unitName || "";
  if (!unitId && !cleanText(name)) return { id: "", name: "待分配", zone: "" };
  return (
    units.find((unit) => unitId && unit.id === unitId) ||
    units.find((unit) => cleanText(unit.name) === cleanText(name)) ||
    { id: stableId("unit", name || "待分配"), name: name || "待分配", zone: normalizeZone(name) }
  );
}

function findUser(users = [], userId, userName) {
  return users.find((user) => Number(user.id) === Number(userId)) || users.find((user) => cleanText(user.name) === cleanText(userName)) || {};
}

function normalizeZone(value) {
  const text = String(value || "");
  if (ZONES.includes(text)) return text;
  if (/东|华东|杭州|江苏|浙江|上海|安徽/.test(text)) return "东部战区";
  if (/南|华南|广东|佛山|深圳|广州|福建|海南/.test(text)) return "南部战区";
  if (/西|西南|成都|重庆|四川|云南|贵州|西安/.test(text)) return "西部战区";
  if (/北|华北|北京|天津|河北|山东|东北/.test(text)) return "北部战区";
  return "中部战区";
}

function normalizeCustomer(customer, context = {}) {
  const ownerUser = findUser(context.users || [], customer.ownerId, customer.owner);
  const unit = findUnit(context.units || [], customer.unitId || ownerUser.unitId, customer.unit || ownerUser.unit || customer.region);
  const followUps = Array.isArray(customer.followUps) && customer.followUps.length
    ? customer.followUps
    : [
        {
          date: customer.lastFollow || customer.createdAt || today(),
          note: customer.lastNote || "新增客户。",
          nextFollow: customer.nextFollow || ""
        }
      ];
  return {
    id: Number(customer.id || Date.now()),
    name: customer.name || "",
    phone: customer.phone || "待补充",
    channelSource: normalizeChannelSource(customer.channelSource || customer.source || customer.channel),
    createdBy: customer.createdBy || customer.inputBy || customer.creator || customer.owner || ownerUser.name || "未记录",
    followPerson: customer.followPerson || customer.followOwner || customer.owner || ownerUser.name || "未分配",
    address: customer.address || customer.customerAddress || "",
    stage: customer.stage || "名单",
    owner: customer.owner || ownerUser.name || "林晨",
    ownerId: customer.ownerId || ownerUser.id || "",
    unitId: customer.unitId || ownerUser.unitId || unit.id || "",
    unit: customer.unit || ownerUser.unit || unit.name || "",
    zone: customer.zone || ownerUser.zone || unit.zone || normalizeZone(customer.region),
    region: customer.region || ownerUser.zone || unit.zone || "待分区",
    amount: Number(customer.amount || 15),
    software: customer.software || "待补充",
    photos: normalizePhotos(customer.photos || customer.visitPhotos),
    createdAt: customer.createdAt || today(),
    followUps
  };
}

function normalizePhotos(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

function mergePhotos(...groups) {
  return normalizePhotos(groups.flatMap((group) => Array.isArray(group) ? group : []));
}

function normalizeVisit(visit = {}, context = {}) {
  const ownerUser = findUser(context.users || [], visit.ownerId, visit.owner);
  const unit = findUnit(context.units || [], visit.unitId || ownerUser.unitId, visit.unit || ownerUser.unit || visit.city);
  return {
    id: Number(visit.id || Date.now()),
    factory: visit.factory || "",
    phone: visit.phone || visit.customerPhone || "",
    cuttingDevice: visit.cuttingDevice || compactDeviceText(visit.cuttingCount, visit.cuttingBrand),
    cuttingCount: visit.cuttingCount || "",
    cuttingBrand: visit.cuttingBrand || "",
    drillingDevice: visit.drillingDevice || compactDeviceText(visit.drillingCount, visit.drillingBrand),
    drillingCount: visit.drillingCount || "",
    drillingBrand: visit.drillingBrand || "",
    line: visit.line || buildVisitLine(visit) || "待补充",
    software: visit.software || "待补充",
    softwarePrice: visit.softwarePrice || "",
    lossReason: visit.lossReason || visit.reason || "",
    status: normalizeVisitStage(visit.status),
    latitude: Number(visit.latitude || 0),
    longitude: Number(visit.longitude || 0),
    city: visit.city || "",
    address: visit.address || "",
    owner: visit.owner || "",
    ownerId: visit.ownerId || ownerUser.id || "",
    unitId: visit.unitId || ownerUser.unitId || unit.id || "",
    unit: visit.unit || ownerUser.unit || unit.name || "",
    zone: visit.zone || ownerUser.zone || unit.zone || "",
    photos: Array.isArray(visit.photos) ? visit.photos : [],
    date: visit.date || today()
  };
}

function normalizeVisitStage(status) {
  if (STAGES.includes(status)) return status;
  const legacy = {
    待攻克: "名单",
    跟进中: "线索",
    已成交: "成交"
  };
  return legacy[status] || "线索";
}

function buildVisitLine(visit = {}) {
  if (visit.cuttingDevice || visit.drillingDevice) {
    return [`开料：${visit.cuttingDevice || "待补充"}`, `打孔：${visit.drillingDevice || "待补充"}`].join(" / ");
  }
  const parts = [];
  if (visit.cuttingCount || visit.cuttingBrand) {
    parts.push(`开料设备${visit.cuttingCount || 0}台${visit.cuttingBrand ? ` · ${visit.cuttingBrand}` : ""}`);
  }
  if (visit.drillingCount || visit.drillingBrand) {
    parts.push(`打孔设备${visit.drillingCount || 0}台${visit.drillingBrand ? ` · ${visit.drillingBrand}` : ""}`);
  }
  return parts.join(" / ");
}

function compactDeviceText(count, brand) {
  if (!count && !brand) return "";
  if (count && brand) return `${count}*${brand}`;
  return String(count || brand || "");
}

function syncVisitToCustomer(state, visit) {
  const factory = String(visit.factory || "").trim();
  if (!factory) return;
  const stage = normalizeVisitStage(visit.status);
  const owner = visit.owner || "未分配";
  const ownerId = visit.ownerId || "";
  const note = [
    `地推打卡：${visit.address || visit.city || "未记录地址"}`,
    visit.phone ? `客户电话：${visit.phone}` : "",
    `开料设备：${visit.cuttingDevice || compactDeviceText(visit.cuttingCount, visit.cuttingBrand) || "待补充"}`,
    `打孔设备：${visit.drillingDevice || compactDeviceText(visit.drillingCount, visit.drillingBrand) || "待补充"}`,
    `现用软件：${visit.software || "待补充"}${visit.softwarePrice ? `，版本价格：${visit.softwarePrice}` : ""}`,
    visit.lossReason ? `未成交原因：${visit.lossReason}` : ""
  ].filter(Boolean).join("；");
  const sameOwner = (customer) => customer.owner === owner || (ownerId && customer.ownerId === ownerId);
  const samePhone = (customer) => visit.phone && cleanAccount(customer.phone) === cleanAccount(visit.phone);
  const index = (state.customers || []).findIndex((customer) => (samePhone(customer) || cleanText(customer.name) === cleanText(factory)) && sameOwner(customer));

  if (index < 0) {
    const customer = normalizeCustomer({
      id: Date.now() + 1,
      name: factory,
      phone: visit.phone || "待补充",
      channelSource: normalizeChannelSource("地推"),
      createdBy: owner,
      followPerson: owner,
      address: visit.address || "",
      stage,
      owner,
      ownerId,
      region: visit.city || visit.address || "待分区",
      amount: 15,
      software: visit.software || "待补充",
      photos: normalizePhotos(visit.photos),
      createdAt: visit.date || today(),
      lastFollow: visit.date || today(),
      nextFollow: "",
      lastNote: note
    }, state);
    state.customers.unshift(customer);
    state.activities.push({ date: visit.date || today(), owner, type: stage, customerId: customer.id });
    return;
  }

  const previousStage = state.customers[index].stage;
  const customer = normalizeCustomer({
    ...state.customers[index],
    stage,
    owner,
    followPerson: owner,
    address: visit.address || state.customers[index].address,
    phone: visit.phone || state.customers[index].phone,
    region: visit.city || state.customers[index].region,
    software: visit.software || state.customers[index].software,
    photos: mergePhotos(state.customers[index].photos, visit.photos)
  }, state);
  const latestFollow = customer.followUps[customer.followUps.length - 1] || {};
  customer.followUps.push({
    date: visit.date || today(),
    note,
    nextFollow: latestFollow.nextFollow || ""
  });
  state.customers[index] = customer;
  if (previousStage !== stage) {
    state.activities.push({ date: visit.date || today(), owner, type: stage, customerId: customer.id });
  }
}

function cleanText(value) {
  return String(value || "").trim().toLowerCase();
}

function stableId(prefix, value) {
  const hash = crypto.createHash("md5").update(String(value || prefix)).digest("hex").slice(0, 10);
  return `${prefix}-${hash}`;
}

function publicState(state, viewer = null) {
  const scoped = scopeStateForUser(state, viewer);
  return {
    ...scoped,
    users: (scoped.users || []).map(publicUser)
  };
}

function publicUser(user = {}) {
  const { password, passwordHash, ...safe } = user;
  return safe;
}

function toMiniState(state, viewer = null) {
  const next = publicState(state, viewer);
  return {
    ...next,
    customers: next.customers.map(toMiniCustomer)
  };
}

function scopeStateForUser(state, viewer = null) {
  if (!viewer) return state;
  const user = state.users.find((item) => Number(item.id) === Number(viewer.id)) || viewer;
  return {
    ...state,
    users: visibleUsers(state, user),
    customers: (state.customers || []).filter((customer) => canViewRecord(state, user, customer)),
    visits: (state.visits || []).filter((visit) => canViewRecord(state, user, visit)),
    activities: (state.activities || []).filter((activity) => {
      if (!activity.customerId) return true;
      const customer = (state.customers || []).find((item) => Number(item.id) === Number(activity.customerId));
      return !customer || canViewRecord(state, user, customer);
    })
  };
}

function visibleUsers(state, viewer) {
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  if (role.customerScope === "all") return state.users || [];
  return (state.users || []).filter((user) => {
    if (Number(user.id) === Number(viewer.id)) return true;
    if (Array.isArray(viewer.managedUnitIds) && viewer.managedUnitIds.includes(user.unitId)) return true;
    if (role.customerScope === "zone") return user.zone === viewer.zone;
    if (role.customerScope === "unit") return user.unitId === viewer.unitId;
    return false;
  });
}

function canViewRecord(state, viewer, record = {}) {
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  if (role.customerScope === "all") return true;
  if (ownsRecord(record, viewer)) return true;
  const owner = findUser(state.users, record.ownerId, record.owner);
  const unitId = record.unitId || owner.unitId;
  const zone = record.zone || owner.zone || normalizeZone(record.region || record.city || record.unit);
  if (Array.isArray(viewer.managedUnitIds) && viewer.managedUnitIds.includes(unitId)) return true;
  if (role.customerScope === "zone") return zone && zone === viewer.zone;
  if (role.customerScope === "unit") return unitId && unitId === viewer.unitId;
  return false;
}

function ownsRecord(record = {}, user = {}) {
  return Number(record.ownerId) === Number(user.id) || cleanText(record.owner) === cleanText(user.name);
}

function getAuthUser(req, state) {
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    if (token.startsWith("local-")) {
      const id = Number(token.split("-")[1]);
      return state.users.find((user) => Number(user.id) === id) || null;
    }
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [idText, timeText] = decoded.split(":");
    const issuedAt = Number(timeText || 0);
    if (!issuedAt || Date.now() - issuedAt > TOKEN_TTL_MS) return null;
    const id = Number(idText);
    return state.users.find((user) => Number(user.id) === id) || null;
  } catch {
    return null;
  }
}

function canUseAdmin(state, user) {
  if (!user) return false;
  const role = findRole(state.roles, user.roleId, user.role);
  return (role.permissions || []).includes("admin");
}

function canAssignCustomers(state, user) {
  if (!user) return false;
  const role = findRole(state.roles, user.roleId, user.role);
  return role.customerScope !== "self" || (role.permissions || []).includes("admin");
}

function buildAssignedCustomer(state, viewer, customer, target, body = {}) {
  const previousStage = customer.stage;
  const note = `${viewer.name || "管理员"}已将客户分配给${target.name}。`;
  const next = normalizeCustomer({
    ...customer,
    owner: target.name,
    ownerId: target.id,
    followPerson: target.name,
    unitId: target.unitId || "",
    unit: target.unit || "",
    zone: target.zone || "",
    region: target.zone || customer.region,
    lastFollow: today(),
    nextFollow: body.nextFollow || customer.nextFollow || "",
    lastNote: note
  }, state);
  next.followUps.push({
    date: today(),
    note,
    nextFollow: body.nextFollow || ""
  });
  return { next, previousStage };
}

function isCustomerAssignable(customer = {}) {
  if (customer.stage === "名单") return true;
  if (!["线索", "商机"].includes(customer.stage)) return false;
  const latest = latestCustomerFollow(customer);
  if (!latest) return true;
  return daysSince(latest) > REASSIGN_DAYS;
}

function latestCustomerFollow(customer = {}) {
  const followUps = Array.isArray(customer.followUps) ? customer.followUps : [];
  const latest = followUps[followUps.length - 1] || {};
  return latest.date || customer.lastFollow || customer.createdAt || "";
}

function daysSince(dateText) {
  const time = Date.parse(dateText);
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.parse(today()) - time) / (24 * 60 * 60 * 1000));
}

function findAssignableSalesUser(state, viewer, ownerId, ownerName) {
  const candidates = visibleUsers(state, viewer).filter((user) => {
    const role = findRole(state.roles, user.roleId, user.role);
    return role.name === "销售" || user.role === "销售";
  });
  return (
    candidates.find((user) => ownerId && Number(user.id) === Number(ownerId)) ||
    candidates.find((user) => ownerName && cleanText(user.name) === cleanText(ownerName)) ||
    null
  );
}

function toMiniCustomer(customer) {
  const latest = (customer.followUps || [])[customer.followUps.length - 1] || {};
  return {
    ...customer,
    lastFollow: latest.date || "",
    nextFollow: latest.nextFollow || "",
    lastNote: latest.note || "",
    followUps: undefined
  };
}

function readState() {
  ensureDataFile();
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const migrated = migrateState(raw);
  if (JSON.stringify(raw) !== JSON.stringify(migrated)) writeState(migrated);
  return migrated;
}

function writeState(state) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, BACKUP_FILE);
  fs.writeFileSync(DATA_FILE, JSON.stringify(migrateState(state), null, 2), "utf8");
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SEED_FILE)) fs.copyFileSync(FALLBACK_SEED_FILE, SEED_FILE);
  if (!fs.existsSync(DATA_FILE) && fs.existsSync(BACKUP_FILE)) fs.copyFileSync(BACKUP_FILE, DATA_FILE);
  if (!fs.existsSync(DATA_FILE)) fs.copyFileSync(SEED_FILE, DATA_FILE);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid json body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end();
}

function sendFile(res, filePath, contentType, downloadName = "") {
  if (!fs.existsSync(filePath)) {
    return sendJson(res, 404, { error: "template not found" });
  }
  const headers = { "Content-Type": contentType };
  if (downloadName) {
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith("/uploads/")) {
    const uploadPath = path.resolve(UPLOAD_DIR, pathname.replace("/uploads/", ""));
    if (!uploadPath.startsWith(path.resolve(UPLOAD_DIR)) || !fs.existsSync(uploadPath)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(uploadPath).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(uploadPath).pipe(res);
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(PUBLIC_ROOT, `.${pathname}`);
  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

async function saveMultipartUpload(req) {
  const multipart = await parseMultipart(req);
  const file = multipart.files.find((item) => item.name === "file") || multipart.files[0];
  if (!file || !file.buffer.length) throw new Error("upload file missing");
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = getUploadExt(file);
  const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
  const filePath = path.join(UPLOAD_DIR, fileName);
  fs.writeFileSync(filePath, file.buffer);
  return { url: `/uploads/${fileName}`, size: file.buffer.length };
}

async function importCustomers(req) {
  const multipart = await parseMultipart(req);
  const stage = multipart.fields.stage || "名单";
  const owner = multipart.fields.owner || "林晨";
  const ownerId = multipart.fields.ownerId || "";
  const unitId = multipart.fields.unitId || "";
  const unit = multipart.fields.unit || "";
  const zone = multipart.fields.zone || "";
  const state = readState();
  const file = multipart.files[0];
  const defaults = {
    stage,
    owner,
    ownerId,
    unitId,
    unit,
    zone,
    createdBy: multipart.fields.createdBy || owner,
    followPerson: multipart.fields.followPerson || owner
  };
  const rows = file
    ? parseCustomerImportFile(file, defaults)
    : parseCustomerRows(multipart.fields.rows || "", defaults);
  const customers = rows.map((row, index) => {
    const customer = normalizeCustomer({
      id: Date.now() + index,
      name: row.name,
      phone: row.phone,
      channelSource: row.channelSource,
      createdBy: row.createdBy,
      followPerson: row.followPerson,
      address: row.address,
      stage: row.stage,
      owner: row.owner,
      ownerId: row.ownerId,
      unitId: row.unitId,
      unit: row.unit,
      zone: row.zone,
      region: row.region,
      amount: row.amount,
      software: row.software,
      createdAt: today(),
      lastFollow: row.lastFollow || today(),
      nextFollow: row.nextFollow || today(),
      lastNote: row.lastNote || "名单文件导入。"
    }, state);
    state.activities.push({ date: today(), owner: customer.owner, type: customer.stage, customerId: customer.id });
    return customer;
  });
  state.customers.unshift(...customers);
  writeState(state);
  return { imported: customers.length, customers: customers.map(toMiniCustomer) };
}

function parseCustomerImportFile(file, defaults) {
  const filename = String(file.filename || "").toLowerCase();
  if (filename.endsWith(".xlsx")) {
    return parseCustomerRowsFromMatrix(parseXlsxFirstSheet(file.buffer), defaults);
  }
  return parseCustomerRows(file.buffer.toString("utf8"), defaults);
}

function parseCustomerRows(text, defaults = {}) {
  const matrix = text
    .replace(/^\ufeff/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/,|，|\t/).map((item) => item.trim()));
  return parseCustomerRowsFromMatrix(matrix, defaults);
}

function parseCustomerRowsFromMatrix(matrix, defaults = {}) {
  const rows = matrix.filter((row) => row.some((cell) => String(cell || "").trim()));
  if (!rows.length) return [];
  const rawHeaders = rows[0].map((cell) => normalizeHeader(cell));
  const hasHeader = rawHeaders.some((header) => ["name", "phone", "channelSource", "address"].includes(header) || STAGES.includes(header));
  const headers = hasHeader ? rawHeaders : ["name", "phone", "region", "amount", "software"];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const stageHeader = rawHeaders.find((header) => STAGES.includes(header));
  return dataRows
    .map((row) => {
      if (!hasHeader) {
        const third = String(row[2] || "").trim();
        const thirdLooksLikeChannel = isKnownChannelText(third) || row.length >= 6;
        return {
          name: row[0] || "",
          phone: row[1] || "待补充",
          channelSource: thirdLooksLikeChannel ? normalizeChannelSource(third) : normalizeChannelSource(defaults.channelSource),
          createdBy: defaults.createdBy || defaults.owner || "未记录",
          followPerson: defaults.followPerson || defaults.owner || "未分配",
          address: thirdLooksLikeChannel ? row[3] || "" : "",
          stage: defaults.stage || "名单",
          owner: defaults.owner || "未分配",
          ownerId: defaults.ownerId || "",
          unitId: defaults.unitId || "",
          unit: defaults.unit || "",
          zone: defaults.zone || "",
          region: thirdLooksLikeChannel ? row[3] || defaults.zone || "待分区" : third || defaults.zone || "待分区",
          amount: Number(thirdLooksLikeChannel ? row[5] || 15 : row[3] || 15) || 15,
          software: thirdLooksLikeChannel ? row[4] || "待补充" : row[4] || "待补充",
          lastNote: "名单文件导入。",
          lastFollow: "",
          nextFollow: ""
        };
      }
      const record = {};
      headers.forEach((header, index) => {
        if (!header || STAGES.includes(header)) return;
        record[header] = row[index];
      });
      const stageCell = row[headers.findIndex((header) => header === "stage")];
      const stage = STAGES.includes(stageCell) ? stageCell : stageHeader || defaults.stage || "名单";
      return {
        name: record.name || "",
        phone: record.phone || "待补充",
        channelSource: normalizeChannelSource(record.channelSource || defaults.channelSource),
        createdBy: record.createdBy || defaults.createdBy || defaults.owner || "未记录",
        followPerson: record.followPerson || defaults.followPerson || defaults.owner || "未分配",
        address: record.address || "",
        stage,
        owner: record.owner || defaults.owner || record.followPerson || "未分配",
        ownerId: defaults.ownerId || "",
        unitId: defaults.unitId || "",
        unit: record.unit || defaults.unit || "",
        zone: defaults.zone || "",
        region: record.region || record.address || defaults.zone || "待分区",
        amount: Number(record.amount || 15) || 15,
        software: record.software || "待补充",
        lastNote: record.lastNote || record.followRecord || "名单文件导入。",
        lastFollow: normalizeDateText(record.lastFollow || ""),
        nextFollow: normalizeDateText(record.nextFollow || "")
      };
    })
    .filter((row) => row.name);
}

function normalizeHeader(value) {
  const text = String(value || "").trim().replace(/\s/g, "");
  if (!text) return "";
  if (STAGES.includes(text)) return text;
  if (/^客户/.test(text) && !/电话|地址/.test(text)) return "name";
  if (/^name$|customer|客户名称/i.test(text)) return "name";
  if (/客户电话|电话|手机号|phone|mobile|tel/i.test(text)) return "phone";
  if (/渠道来源|来源|source|channel/i.test(text)) return "channelSource";
  if (/录入人|创建人|input|createdby|creator/i.test(text)) return "createdBy";
  if (/跟进人|负责人|owner|followperson|follower/i.test(text)) return "followPerson";
  if (/跟进记录|记录|note|remark|followrecord/i.test(text)) return "lastNote";
  if (/最新跟进|最后跟进|lastfollow|last/i.test(text)) return "lastFollow";
  if (/下次跟进|nextfollow|next/i.test(text)) return "nextFollow";
  if (/单位|部门|团队|unit|department|team/i.test(text)) return "unit";
  if (/客户地址|地址|address/i.test(text)) return "address";
  if (/阶段|状态|stage|status/i.test(text)) return "stage";
  if (/金额|进款|回款|amount|payment/i.test(text)) return "amount";
  if (/软件|software/i.test(text)) return "software";
  if (/区域|战区|region|zone/i.test(text)) return "region";
  return "";
}

function normalizeChannelSource(value) {
  const text = String(value || "").trim();
  if (CHANNEL_SOURCES.includes(text)) return text;
  const aliases = {
    官方资源: "官网留言",
    官网: "官网留言",
    网站留言: "官网留言",
    官网注册: "自主注册",
    注册: "自主注册",
    转介绍: "渠道介绍",
    介绍: "渠道介绍",
    企查: "企查查",
    微信公众号: "公众号",
    手动录入: "其他",
    批量导入: "其他",
    展会: "其他"
  };
  return aliases[text] || "其他";
}

function isKnownChannelText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return CHANNEL_SOURCES.includes(text) || ["官方资源", "官网", "网站留言", "官网注册", "注册", "转介绍", "介绍", "企查", "微信公众号", "手动录入", "批量导入", "展会"].includes(text);
}

function normalizeDateText(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const match = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return text;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function parseXlsxFirstSheet(buffer) {
  const entries = unzipXlsxEntries(buffer);
  const sharedStrings = parseSharedStrings(entries["xl/sharedStrings.xml"]?.toString("utf8") || "");
  const sheetName = entries["xl/worksheets/sheet1.xml"] ? "xl/worksheets/sheet1.xml" : Object.keys(entries).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) return [];
  return parseWorksheet(entries[sheetName].toString("utf8"), sharedStrings);
}

function unzipXlsxEntries(buffer) {
  const eocd = findSignature(buffer, 0x06054b50, Math.max(0, buffer.length - 66000));
  if (eocd < 0) throw new Error("无法读取 xlsx 文件");
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = {};
  let offset = centralOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    entries[name] = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findSignature(buffer, signature, start) {
  for (let index = buffer.length - 4; index >= start; index -= 1) {
    if (buffer.readUInt32LE(index) === signature) return index;
  }
  return -1;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si[\s\S]*?<\/si>/g)].map((match) => {
    return [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join("");
  });
}

function parseWorksheet(xml, sharedStrings) {
  const matrix = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = (attrs.match(/\sr="([A-Z]+\d+)"/) || [])[1] || "";
      const col = columnIndex((ref.match(/[A-Z]+/) || ["A"])[0]);
      const type = (attrs.match(/\st="([^"]+)"/) || [])[1] || "";
      const raw = (body.match(/<v[^>]*>([\s\S]*?)<\/v>/) || body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "";
      cells[col] = type === "s" ? sharedStrings[Number(raw)] || "" : decodeXml(raw);
    }
    matrix.push(cells.map((cell) => cell ?? ""));
  }
  return matrix;
}

function columnIndex(name) {
  return [...name].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
    if (!boundaryMatch) return reject(new Error("multipart boundary missing"));
    const boundary = boundaryMatch[1];
    const delimiter = Buffer.from(`--${boundary}`);
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > 30 * 1024 * 1024) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks);
        const fields = {};
        const files = [];
        let boundaryPos = body.indexOf(delimiter);

        while (boundaryPos >= 0) {
          let partStart = boundaryPos + delimiter.length;
          if (body.slice(partStart, partStart + 2).toString("utf8") === "--") break;
          if (body.slice(partStart, partStart + 2).toString("utf8") === "\r\n") partStart += 2;

          const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), partStart);
          if (headerEnd < 0) break;
          const header = body.slice(partStart, headerEnd).toString("utf8");
          const contentStart = headerEnd + 4;
          const nextBoundary = body.indexOf(Buffer.from(`\r\n--${boundary}`), contentStart);
          if (nextBoundary < 0) break;

          const name = (header.match(/name="([^"]+)"/) || [])[1];
          const filename = (header.match(/filename="([^"]*)"/) || [])[1];
          const contentTypeHeader = (header.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || "";
          const buffer = body.slice(contentStart, nextBoundary);
          if (filename) {
            files.push({ name, filename, contentType: contentTypeHeader, header, buffer });
          } else if (name) {
            fields[name] = buffer.toString("utf8");
          }
          boundaryPos = nextBoundary + 2;
        }
        resolve({ fields, files });
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function generateXiaozhiStrategy(question, knowledge, customer) {
  const matched = rankKnowledge(question, knowledge).slice(0, 4);
  if (!DEEPSEEK_API_KEY) {
    return fallbackXiaozhi(question, matched, customer, "未配置 DEEPSEEK_API_KEY，当前使用知识库本地策略。");
  }
  const system = [
    "你是智销AI的小智，是全屋定制软件销售跟进助手。",
    "你必须结合知识库给出销售可执行的话术和跟进策略。",
    "输出结构：客户意图、推荐话术、成交策略、下一步动作、风险提醒。语言简洁，适合销售马上照着用。"
  ].join("\n");
  const context = matched.map((item, index) => `${index + 1}. 问题：${item.question}\n答案：${item.answer}`).join("\n\n");
  const user = `客户问题：${question}\n\n客户信息：${customer ? JSON.stringify(customer) : "暂无"}\n\n知识库：\n${context || "暂无匹配知识库"}`;
  try {
    const data = await deepseekChat(system, user);
    return {
      source: "deepseek",
      name: "小智",
      matched,
      answer: data.choices?.[0]?.message?.content || "",
      model: data.model || DEEPSEEK_MODEL
    };
  } catch (error) {
    return fallbackXiaozhi(question, matched, customer, `DeepSeek 调用失败：${error.message}`);
  }
}

function deepseekChat(system, user) {
  const payload = JSON.stringify({
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.4,
    max_tokens: 900
  });
  return new Promise((resolve, reject) => {
    const request = https.request(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (response.statusCode >= 400) reject(new Error(json.error?.message || body));
            else resolve(json);
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

function rankKnowledge(question, knowledge) {
  const words = String(question || "").split(/[，。；、\s]+/).filter(Boolean);
  return [...knowledge]
    .map((item) => ({
      ...item,
      score: words.filter((word) => `${item.question}${item.answer}`.includes(word)).length
    }))
    .sort((a, b) => b.score - a.score);
}

function fallbackXiaozhi(question, matched, customer, note) {
  const best = matched[0];
  const answer = [
    "客户意图：客户正在确认软件能否解决真实生产痛点，重点关注落地风险和投入回报。",
    `推荐话术：${best ? best.answer : "先让客户提供一套真实订单，现场演示从设计、报价、拆单、开料标签到车间看板的完整流程。"}`,
    "成交策略：不要先讲功能清单，先围绕错单返工、板材浪费、交期延误和算账效率，再给两周样板产线试点。",
    "下一步动作：今天发送试点方案，约老板、设计主管、生产主管一起看演示，并确认设备品牌和现用软件。",
    `风险提醒：${note}`
  ].join("\n");
  return { source: "fallback", name: "小智", matched, answer, customer, question };
}

function getUploadExt(file) {
  const ext = path.extname(file.filename || "").toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return ext;
  const type = file.contentType || "";
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  return ".jpg";
}

function amapRegeo(longitude, latitude) {
  if (!AMAP_KEY) {
    return Promise.resolve({
      raw: null,
      city: "",
      address: "",
      error: "未配置 AMAP_KEY"
    });
  }
  const apiUrl = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(AMAP_KEY)}&location=${encodeURIComponent(`${longitude},${latitude}`)}&extensions=base&output=json`;
  return new Promise((resolve, reject) => {
    httpsGetJson(apiUrl, (error, data) => {
      if (error) return reject(error);
      const regeocode = data && data.regeocode;
      const component = regeocode && regeocode.addressComponent;
      const city = Array.isArray(component?.city) ? component?.province : component?.city || component?.province || "";
      resolve({
        raw: data,
        city,
        address: regeocode?.formatted_address || ""
      });
    });
  });
}

function httpsGetJson(apiUrl, callback) {
  https
    .get(apiUrl, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        try {
          callback(null, JSON.parse(body));
        } catch (error) {
          callback(error);
        }
      });
    })
    .on("error", callback);
}

function cleanAccount(value) {
  return String(value || "").trim().toLowerCase();
}

function makeToken(user) {
  const random = crypto.randomBytes(12).toString("hex");
  return Buffer.from(`${user.id}:${Date.now()}:${random}`).toString("base64url");
}

function today() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
