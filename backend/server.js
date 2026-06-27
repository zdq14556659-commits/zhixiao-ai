const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8787);
const AMAP_KEY = process.env.AMAP_KEY || "";
const TENCENT_MAP_SERVER_KEY = process.env.TENCENT_MAP_SERVER_KEY || "";
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
const USER_TEMPLATE_FILE = path.join(__dirname, "templates", "user-import-template.xlsx");
const STAGES = ["名单", "线索", "商机", "成交"];
const PUBLIC_POOL_STATUS = "公海";
const PURCHASED_STATUS = "已购";
const IMPORT_STATUSES = [...STAGES, PUBLIC_POOL_STATUS];
const STAGE_TIME_FIELDS = { 线索: "leadAt", 商机: "opportunityAt", 成交: "dealAt" };
const CHANNEL_SOURCES = ["自媒体", "官网留言", "自主注册", "渠道介绍", "企查查", "客源汇", "公众号", "地推", "其他"];
const LOSS_REASONS = ["客户原因", "价格原因", "功能原因"];
const ZONES = ["东部战区", "南部战区", "西部战区", "北部战区", "中部战区"];
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_KEY_LENGTH = 64;
const LOGIN_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_LOCK_MS = 10 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || "zhixiao-ai-development-token-secret-change-in-production";
const loginFailuresByAccount = new Map();
const loginFailuresByAccountIp = new Map();
let geocodeQueueRunning = false;
let stateCache = null;
let stateIndexes = emptyStateIndexes();
let stateWriteTimer = null;
let stateDirty = false;
let stateDiskSignature = "";
const ADMIN_ROLES = ["总负责人", "运营", "管理员"];
const DEFAULT_PERMISSIONS = ["dashboard", "customers", "field", "assistant"];
const PUBLIC_POOL_IMPORT_PERMISSION = "publicPoolImport";
const OPS_PERMISSIONS = [...DEFAULT_PERMISSIONS, PUBLIC_POOL_IMPORT_PERMISSION];
const ADMIN_PERMISSIONS = [...DEFAULT_PERMISSIONS, PUBLIC_POOL_IMPORT_PERMISSION, "admin"];
const REASSIGN_DAYS = 30;
const CUSTOMER_CLAIM_DAYS = 3;
const SELF_DEVELOPED_CLAIM_DAYS = 30;
const OWNERSHIP_PENDING = "pending_followup";
const OWNERSHIP_LOCKED = "locked";
const OWNERSHIP_CLAIMABLE = "claimable";
const OWNERSHIP_PUBLIC = "public_pool";
const PUBLIC_POOL_DAYS = 30;
const UNKNOWN_SOFTWARE = "未知";
const LIFECYCLE_ACTIVE = "active";
const LIFECYCLE_ARCHIVED = "archived";
const OUTCOME_ACTIVE = "active";
const OUTCOME_PURCHASED = "purchased_existing";
const DEFAULT_ADMIN_PASSWORD = "778899";
const BACKEND_VERSION = "backend-v9";
const MONEY_UNIT = "yuan";
const LEGACY_MONEY_MULTIPLIER = 10000;
const DEFAULT_EXPECTED_AMOUNT = 150000;
const DEFAULT_STATE_WRITE_DELAY_MS = DATA_DIR.toLowerCase().startsWith(os.tmpdir().toLowerCase()) ? 0 : 1500;
const STATE_WRITE_DELAY_MS = Math.max(
  0,
  Number(process.env.STATE_WRITE_DELAY_MS ?? DEFAULT_STATE_WRITE_DELAY_MS)
);
const DASHBOARD_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.DASHBOARD_CACHE_TTL_MS ?? 60000)
);
const dashboardCache = new Map();
const TARGET_FIELDS = ["revenueTarget", "contractTarget", "listTarget", "leadTarget", "opportunityTarget", "dealTarget"];
const MONEY_FIELDS = ["amount", "quoteAmount", "contractAmount", "paymentAmount", "revenueTarget", "contractTarget"];
const DEFAULT_ROLES = [
  { id: "role-owner", name: "总负责人", customerScope: "all", permissions: ADMIN_PERMISSIONS },
  { id: "role-region", name: "区域经理", customerScope: "zone", permissions: DEFAULT_PERMISSIONS },
  { id: "role-supervisor", name: "主管", customerScope: "unit", permissions: DEFAULT_PERMISSIONS },
  { id: "role-sales", name: "销售", customerScope: "self", permissions: DEFAULT_PERMISSIONS },
  { id: "role-ops", name: "运营", customerScope: "all", permissions: OPS_PERMISSIONS },
  { id: "role-admin", name: "管理员", customerScope: "all", permissions: ADMIN_PERMISSIONS }
];
const ORG_ROOT_ID = "org-root";
const ORG_STAFF_ID = "org-staff";
const ORG_WAR_ID = "org-war";
const ORG_ZONE_IDS = {
  "东部战区": "org-zone-east",
  "南部战区": "org-zone-south",
  "西部战区": "org-zone-west",
  "北部战区": "org-zone-north",
  "中部战区": "org-zone-central"
};
const ORG_TYPES = ["root", "department", "battle_zone", "unit", "team"];
const DEFAULT_UNITS = [
  { id: ORG_ROOT_ID, name: "智销AI", parentId: "", type: "root", sort: 0, active: true },
  { id: ORG_STAFF_ID, name: "参谋部", parentId: ORG_ROOT_ID, type: "department", sort: 10, active: true },
  { id: ORG_WAR_ID, name: "战区部", parentId: ORG_ROOT_ID, type: "department", sort: 20, active: true },
  { id: ORG_ZONE_IDS["东部战区"], name: "东部战区", parentId: ORG_WAR_ID, type: "battle_zone", zone: "东部战区", sort: 10, active: true },
  { id: ORG_ZONE_IDS["南部战区"], name: "南部战区", parentId: ORG_WAR_ID, type: "battle_zone", zone: "南部战区", sort: 20, active: true },
  { id: ORG_ZONE_IDS["西部战区"], name: "西部战区", parentId: ORG_WAR_ID, type: "battle_zone", zone: "西部战区", sort: 30, active: true },
  { id: ORG_ZONE_IDS["北部战区"], name: "北部战区", parentId: ORG_WAR_ID, type: "battle_zone", zone: "北部战区", sort: 40, active: true },
  { id: ORG_ZONE_IDS["中部战区"], name: "中部战区", parentId: ORG_WAR_ID, type: "battle_zone", zone: "中部战区", sort: 50, active: true }
];
const DEFAULT_COMPETITORS = [
  { id: "competitor-unknown", name: "未知", color: "#94a3b8", active: true },
  { id: "competitor-3vjia", name: "三维家", color: "#4f7cff", active: true },
  { id: "competitor-yunxi", name: "云熙", color: "#8b5cf6", active: true },
  { id: "competitor-haixun", name: "海迅", color: "#f59e0b", active: true },
  { id: "competitor-kujiale", name: "酷家乐", color: "#14b8a6", active: true },
  { id: "competitor-other", name: "其他", color: "#64748b", active: true }
];
const DEFAULT_PRODUCTS = [
  { id: "product-v1", name: "V1", price: 0, sort: 10, active: true },
  { id: "product-v3-upgrade", name: "V3升级", price: 0, sort: 20, active: true },
  { id: "product-erp", name: "ERP", price: 0, sort: 30, active: true },
  { id: "product-render", name: "渲染软件", price: 0, sort: 40, active: true },
  { id: "product-other", name: "其他", price: 0, sort: 100, active: true }
];
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
  陈主管: "chen",
  王区域: "wang",
  运营小组: "admin"
};
const HIDDEN_DEMO_USERS = new Set(["linchen", "zhouyang"]);

ensureDataFile();
try {
  readState();
} catch (error) {
  console.error("智销AI backend-v9 数据迁移失败，服务已停止启动，原数据库和备份文件均未删除。", error);
  throw error;
}

const server = http.createServer(async (req, res) => {
  try {
    res.shouldGzipJson = /\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""));
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/crm") url.pathname = "/crm/";
    if (url.pathname.startsWith("/crm/api/")) {
      url.pathname = url.pathname.slice(4);
    } else if (url.pathname.startsWith("/crm/")) {
      url.pathname = url.pathname.slice(4) || "/";
    }
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "server error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`智销AI backend running: http://localhost:${PORT}`);
  processGeocodeQueue().catch((error) => console.error("geocode queue failed", error));
  if (!process.env.AUTH_TOKEN_SECRET) {
    console.warn("AUTH_TOKEN_SECRET 未配置，当前使用开发环境密钥；正式环境必须配置高强度随机字符串。");
  }
});

module.exports = server;

process.once("SIGINT", () => {
  flushStateBeforeExit();
  process.exit(0);
});

process.once("SIGTERM", () => {
  flushStateBeforeExit();
  process.exit(0);
});

process.once("beforeExit", () => {
  flushStateBeforeExit();
});

async function routeApi(req, res, url) {
  if (req.method === "OPTIONS") return sendNoContent(res);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "zhixiao-ai-backend", backendVersion: BACKEND_VERSION, moneyUnit: MONEY_UNIT });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const state = readState();
    const account = cleanAccount(body.account || body.username || body.phone || "");
    const password = String(body.password || "");
    const sourceIp = getRequestIp(req);
    const accountIpKey = `${account || "unknown"}@${sourceIp}`;
    const lockedUntil = Math.max(
      getLoginLockedUntil(loginFailuresByAccount, account),
      getLoginLockedUntil(loginFailuresByAccountIp, accountIpKey)
    );
    if (lockedUntil > Date.now()) {
      return sendJson(res, 429, { error: "登录尝试过多，请10分钟后再试" });
    }
    const user = state.users.find((item) => {
      const keys = [item.account, item.username, item.phone].map(cleanAccount).filter(Boolean);
      return keys.includes(account);
    });
    const passwordValid = verifyPassword(user || dummyPasswordUser(), password);
    if (!user || !passwordValid) {
      const accountLocked = recordLoginFailure(loginFailuresByAccount, account);
      const accountIpLocked = recordLoginFailure(loginFailuresByAccountIp, accountIpKey);
      return sendJson(res, accountLocked || accountIpLocked ? 429 : 401, {
        error: accountLocked || accountIpLocked ? "登录尝试过多，请10分钟后再试" : "账号或密码错误"
      });
    }
    if (user.status === "停用") return sendJson(res, 401, { error: "账号或密码错误" });
    clearLoginFailures(loginFailuresByAccount, account);
    clearLoginFailures(loginFailuresByAccountIp, accountIpKey);
    const wantsMiniState = body.client === "mini";
    return sendJson(res, 200, {
      token: makeToken(user),
      user: publicUser(user),
      state: wantsMiniState ? toMiniState(state, user) : { backendVersion: BACKEND_VERSION, moneyUnit: MONEY_UNIT }
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/import/customers/template") {
    return sendCustomerTemplate(res);
  }

  if (req.method === "GET" && url.pathname === "/api/import/users/template") {
    return sendFile(res, USER_TEMPLATE_FILE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "员工批量开通模板.xlsx");
  }

  if (req.method === "POST" && url.pathname === "/api/import/users") {
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无批量开户权限" });
    const result = await importUsers(req, state, viewer);
    return sendJson(res, 201, result);
  }

  const bearerToken = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!bearerToken) return sendJson(res, 401, { error: "璇峰厛鐧诲綍" });
  const authState = readState();
  const authUser = getAuthUser(req, authState);
  if (!authUser) return sendJson(res, 401, { error: "请先登录" });

  if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
    const body = await readBody(req);
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (!verifyPassword(authUser, currentPassword)) {
      return sendJson(res, 400, { error: "原密码错误" });
    }
    const passwordError = validateNewPassword(authUser, newPassword);
    if (passwordError) return sendJson(res, 400, { error: passwordError });
    const state = readState();
    const index = state.users.findIndex((item) => Number(item.id) === Number(authUser.id));
    if (index < 0) return sendJson(res, 404, { error: "账号不存在" });
    state.users[index] = updateUserPassword(state.users[index], newPassword, false);
    appendSecurityLog(state, {
      type: "change_password",
      actorId: authUser.id,
      actorName: authUser.name,
      targetId: authUser.id,
      targetName: authUser.name,
      sourceIp: getRequestIp(req)
    });
    writeState(state, { immediate: true, reason: "change-password" });
    return sendJson(res, 200, { ok: true, message: "密码修改成功，请重新登录" });
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    return sendJson(res, 200, buildDashboardCached(authState, authUser, Object.fromEntries(url.searchParams.entries())));
  }

  if (req.method === "GET" && url.pathname === "/api/targets") {
    const month = normalizeMonth(url.searchParams.get("month"));
    return sendJson(res, 200, buildTargetManagement(authState, authUser, month));
  }

  if (req.method === "POST" && url.pathname === "/api/targets") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canManageTargets(state, viewer)) return sendJson(res, 403, { error: "当前角色无目标设置权限" });
    const target = normalizeTarget({ ...body, month: normalizeMonth(body.month), updatedBy: viewer.name, updatedAt: new Date().toISOString() });
    if (!canManageTargetScope(state, viewer, target)) return sendJson(res, 403, { error: "不能设置权限范围外的目标" });
    const index = state.targets.findIndex((item) => item.month === target.month && item.scopeType === target.scopeType && String(item.scopeId) === String(target.scopeId));
    if (index >= 0) state.targets[index] = { ...state.targets[index], ...target, id: state.targets[index].id };
    else state.targets.push(target);
    writeState(state);
    return sendJson(res, index >= 0 ? 200 : 201, target);
  }

  if (req.method === "GET" && url.pathname === "/api/competitors") {
    return sendJson(res, 200, authState.competitors || DEFAULT_COMPETITORS);
  }

  if (req.method === "POST" && url.pathname === "/api/competitors") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无竞品字典管理权限" });
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "请填写竞品名称" });
    if ((state.competitors || []).some((item) => cleanText(item.name) === cleanText(name))) {
      return sendJson(res, 409, { error: "竞品已存在" });
    }
    const competitor = normalizeCompetitor({
      id: body.id || stableId("competitor", name),
      name,
      color: body.color || "#64748b",
      active: body.active !== false
    });
    state.competitors.push(competitor);
    writeState(state);
    return sendJson(res, 201, competitor);
  }

  if (req.method === "GET" && url.pathname === "/api/products") {
    return sendJson(res, 200, authState.products || DEFAULT_PRODUCTS);
  }

  if (req.method === "POST" && url.pathname === "/api/products") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无产品字典管理权限" });
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "请填写产品名称" });
    if ((state.products || []).some((item) => cleanText(item.name) === cleanText(name))) {
      return sendJson(res, 409, { error: "产品已存在" });
    }
    const product = normalizeProduct({ id: body.id || stableId("product", name), name, price: body.price, sort: body.sort, active: body.active !== false });
    state.products.push(product);
    writeState(state);
    return sendJson(res, 201, product);
  }

  const productUpdate = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if ((req.method === "PUT" || req.method === "PATCH") && productUpdate) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无产品字典管理权限" });
    const index = (state.products || []).findIndex((item) => item.id === productUpdate[1]);
    if (index < 0) return sendJson(res, 404, { error: "产品不存在" });
    const name = String(body.name || state.products[index].name || "").trim();
    if (!name) return sendJson(res, 400, { error: "请填写产品名称" });
    if ((state.products || []).some((item, itemIndex) => itemIndex !== index && cleanText(item.name) === cleanText(name))) {
      return sendJson(res, 409, { error: "产品已存在" });
    }
    const product = normalizeProduct({
      ...state.products[index],
      name,
      price: body.price,
      sort: body.sort,
      active: body.active !== false
    });
    state.products[index] = product;
    writeState(state);
    return sendJson(res, 200, product);
  }

  if (req.method === "GET" && url.pathname === "/api/channel-sources") {
    return sendJson(res, 200, authState.channelSources || normalizeChannelSources());
  }

  if (req.method === "POST" && url.pathname === "/api/channel-sources") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无渠道来源管理权限" });
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "请填写渠道来源名称" });
    if ((state.channelSources || []).some((item) => cleanText(item.name) === cleanText(name))) {
      return sendJson(res, 409, { error: "渠道来源已存在" });
    }
    const source = normalizeChannelSourceItem({ id: body.id || stableId("channel", name), name, active: body.active !== false, sort: body.sort });
    state.channelSources.push(source);
    writeState(state);
    return sendJson(res, 201, source);
  }

  const channelSourceUpdate = url.pathname.match(/^\/api\/channel-sources\/([^/]+)$/);
  if ((req.method === "PUT" || req.method === "PATCH") && channelSourceUpdate) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无渠道来源管理权限" });
    const index = (state.channelSources || []).findIndex((item) => item.id === channelSourceUpdate[1]);
    if (index < 0) return sendJson(res, 404, { error: "渠道来源不存在" });
    const name = String(body.name || state.channelSources[index].name || "").trim();
    if (!name) return sendJson(res, 400, { error: "请填写渠道来源名称" });
    if ((state.channelSources || []).some((item, itemIndex) => itemIndex !== index && cleanText(item.name) === cleanText(name))) {
      return sendJson(res, 409, { error: "渠道来源已存在" });
    }
    const source = normalizeChannelSourceItem({
      ...state.channelSources[index],
      name,
      active: body.active !== false,
      sort: body.sort ?? state.channelSources[index].sort
    });
    state.channelSources[index] = source;
    writeState(state);
    return sendJson(res, 200, source);
  }

  if (req.method === "DELETE" && channelSourceUpdate) {
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无渠道来源管理权限" });
    const index = (state.channelSources || []).findIndex((item) => item.id === channelSourceUpdate[1]);
    if (index < 0) return sendJson(res, 404, { error: "渠道来源不存在" });
    const source = state.channelSources[index];
    const used = (state.customers || []).some((customer) => cleanText(customer.channelSource) === cleanText(source.name));
    if (used) return sendJson(res, 409, { error: "已有客户使用该渠道来源，请先停用，不能删除" });
    state.channelSources.splice(index, 1);
    writeState(state);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/loss-reasons") {
    return sendJson(res, 200, authState.lossReasons || normalizeLossReasons());
  }

  if (req.method === "POST" && url.pathname === "/api/loss-reasons") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无目前未成交原因管理权限" });
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "请填写目前未成交原因名称" });
    state.lossReasons = normalizeLossReasons(state.lossReasons || []);
    if (state.lossReasons.some((item) => cleanText(item.name) === cleanText(name))) {
      return sendJson(res, 409, { error: "目前未成交原因已存在" });
    }
    const reason = normalizeLossReasonItem({ id: body.id || stableId("loss-reason", name), name, active: body.active !== false, sort: body.sort });
    state.lossReasons.push(reason);
    writeState(state);
    return sendJson(res, 201, reason);
  }

  const lossReasonUpdate = url.pathname.match(/^\/api\/loss-reasons\/([^/]+)$/);
  if ((req.method === "PUT" || req.method === "PATCH") && lossReasonUpdate) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无目前未成交原因管理权限" });
    state.lossReasons = normalizeLossReasons(state.lossReasons || []);
    const index = state.lossReasons.findIndex((item) => item.id === lossReasonUpdate[1]);
    if (index < 0) return sendJson(res, 404, { error: "目前未成交原因不存在" });
    const name = String(body.name || state.lossReasons[index].name || "").trim();
    if (!name) return sendJson(res, 400, { error: "请填写目前未成交原因名称" });
    if (state.lossReasons.some((item, itemIndex) => itemIndex !== index && cleanText(item.name) === cleanText(name))) {
      return sendJson(res, 409, { error: "目前未成交原因已存在" });
    }
    const reason = normalizeLossReasonItem({
      ...state.lossReasons[index],
      name,
      active: body.active !== false,
      sort: body.sort ?? state.lossReasons[index].sort
    });
    state.lossReasons[index] = reason;
    writeState(state);
    return sendJson(res, 200, reason);
  }

  if (req.method === "DELETE" && lossReasonUpdate) {
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无目前未成交原因管理权限" });
    state.lossReasons = normalizeLossReasons(state.lossReasons || []);
    const index = state.lossReasons.findIndex((item) => item.id === lossReasonUpdate[1]);
    if (index < 0) return sendJson(res, 404, { error: "目前未成交原因不存在" });
    const reason = state.lossReasons[index];
    const used = (state.opportunities || []).some((opportunity) => cleanText(opportunity.lossReason) === cleanText(reason.name))
      || (state.customers || []).some((customer) => cleanText(customer.lossReason) === cleanText(reason.name))
      || (state.visits || []).some((visit) => cleanText(visit.lossReason) === cleanText(reason.name));
    if (used) return sendJson(res, 409, { error: "已有客户使用该目前未成交原因，请先停用，不能删除" });
    state.lossReasons.splice(index, 1);
    writeState(state);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/public-pool") {
    const items = visiblePublicPoolOpportunities(authState, authUser).map((opportunity) => {
      const customer = findCustomer(authState.customers, opportunity.customerId);
      return sanitizePublicPoolOpportunity(customer, opportunity);
    });
    const query = Object.fromEntries(url.searchParams.entries());
    if (isPaginatedQuery(query)) return sendJson(res, 200, paginatePublicPoolItems(items, query));
    return sendJson(res, 200, { count: items.length, items, backendVersion: BACKEND_VERSION, moneyUnit: MONEY_UNIT });
  }

  if (req.method === "GET" && url.pathname === "/api/customer-board") {
    return sendJson(res, 200, buildCustomerBoard(authState, authUser, Object.fromEntries(url.searchParams.entries())));
  }

  const customerOpportunityCreate = url.pathname.match(/^\/api\/customers\/(\d+)\/opportunities$/);
  if (req.method === "POST" && customerOpportunityCreate) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const customer = findCustomer(state.customers, Number(customerOpportunityCreate[1]));
    if (!customer || !canViewRecord(state, viewer, customer)) return sendJson(res, 404, { error: "客户不存在" });
    const product = resolveProduct(state, body.productId, body.productName);
    if (!product) return sendJson(res, 400, { error: "请选择意向产品" });
    const note = String(body.note || "").trim();
    if (!note) return sendJson(res, 400, { error: "请填写首次跟进备注", field: "note" });
    if (!String(body.nextFollow || "").trim()) return sendJson(res, 400, { error: "请选择下次跟进时间", field: "nextFollow" });
    if (hasActiveProductOpportunity(state, customer.id, product.id)) {
      return sendJson(res, 409, { error: "该客户已有相同产品的进行中机会", code: "DUPLICATE_ACTIVE_OPPORTUNITY" });
    }
    const owner = resolveOpportunityOwner(state, viewer, customer, body);
    if (owner.error) return sendJson(res, owner.status || 403, { error: owner.error });
    const opportunity = normalizeOpportunity({
      ...body,
      id: Date.now(),
      customerId: customer.id,
      productId: product.id,
      productName: product.name,
      stage: STAGES.includes(body.stage) ? body.stage : "线索",
      ownerId: owner.user.id,
      owner: owner.user.name,
      followPerson: owner.user.name,
      unitId: owner.user.unitId || customer.unitId || "",
      unit: owner.user.unit || customer.unit || "",
      zone: owner.user.zone || customer.zone || "",
      createdBy: viewer.name,
      createdAt: today(),
      ownershipStatus: OWNERSHIP_PENDING,
      claimUntil: addDaysToIso(new Date().toISOString(), CUSTOMER_CLAIM_DAYS),
      nextFollow: String(body.nextFollow || ""),
      followUps: [normalizeFollowUp({ date: today(), author: viewer.name, note, nextFollow: body.nextFollow, isSystem: false }, customer)],
      effectiveFollowUpAt: new Date().toISOString()
    }, state);
    lockOpportunityOwnership(opportunity, viewer, "创建销售机会时提交有效跟进");
    state.opportunities.unshift(opportunity);
    state.activities.push({ date: today(), owner: opportunity.owner, type: opportunity.stage, customerId: customer.id, opportunityId: opportunity.id });
    syncCustomerCompatibility(state, customer.id);
    writeState(state);
    return sendJson(res, 201, opportunityView(state, opportunity));
  }

  const opportunityUpdate = url.pathname.match(/^\/api\/opportunities\/(\d+)$/);
  if (req.method === "PUT" && opportunityUpdate) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const index = state.opportunities.findIndex((item) => Number(item.id) === Number(opportunityUpdate[1]));
    if (index < 0) return sendJson(res, 404, { error: "销售机会不存在" });
    const previous = state.opportunities[index];
    if (isOpportunityPublicPool(previous)) return sendJson(res, 409, { error: "公海机会需要先认领", code: "CUSTOMER_CLAIM_REQUIRED" });
    if (!canViewOpportunity(state, viewer, previous)) return sendJson(res, 403, { error: "无权修改该销售机会" });
    if (body.productId !== undefined || body.productName !== undefined) {
      const product = resolveProduct(state, body.productId, body.productName);
      if (!product) return sendJson(res, 400, { error: "请选择有效的意向产品" });
      if (previous.stage !== "成交" && hasActiveProductOpportunity(state, previous.customerId, product.id, previous.id)) {
        return sendJson(res, 409, { error: "该客户已有相同产品的进行中机会", code: "DUPLICATE_ACTIVE_OPPORTUNITY" });
      }
      body.productId = product.id;
      body.productName = product.name;
    }
    const validationError = validateOpportunityBusinessUpdate(previous, body);
    if (validationError) return sendJson(res, 400, { error: validationError });
    const next = normalizeOpportunity({ ...previous, ...body, id: previous.id, customerId: previous.customerId }, state);
    state.opportunities[index] = next;
    syncCustomerCompatibility(state, next.customerId);
    writeState(state);
    return sendJson(res, 200, opportunityView(state, next));
  }

  const opportunityAdvance = url.pathname.match(/^\/api\/opportunities\/(\d+)\/advance$/);
  if (req.method === "POST" && opportunityAdvance) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const index = state.opportunities.findIndex((item) => Number(item.id) === Number(opportunityAdvance[1]));
    if (index < 0) return sendJson(res, 404, { error: "销售机会不存在" });
    const previous = state.opportunities[index];
    if (isOpportunityPublicPool(previous)) return sendJson(res, 409, { error: "公海机会需要先认领", code: "CUSTOMER_CLAIM_REQUIRED" });
    if (!canViewOpportunity(state, viewer, previous)) return sendJson(res, 403, { error: "无权推进该销售机会" });
    const stageIndex = STAGES.indexOf(previous.stage);
    if (stageIndex < 0 || stageIndex >= STAGES.length - 1) return sendJson(res, 409, { error: "该销售机会已成交" });
    const nextStage = STAGES[stageIndex + 1];
    const requiredError = validateOpportunityAdvance(previous, nextStage, body);
    if (requiredError) return sendJson(res, 400, requiredError);
    const validationError = validateOpportunityBusinessUpdate(previous, { ...body, stage: nextStage });
    if (validationError) return sendJson(res, 400, { error: validationError });
    const followNote = String(body.note || `客户推进至${nextStage}阶段。`).trim();
    const next = normalizeOpportunity({
      ...previous,
      ...body,
      stage: nextStage,
      followUps: [...(previous.followUps || []), normalizeFollowUp({ date: today(), createdAt: new Date().toISOString(), author: viewer.name, note: followNote, nextFollow: body.nextFollow || "", isSystem: !String(body.note || "").trim() }, previous)]
    }, state);
    setStageTime(next, nextStage, today());
    if (String(body.note || "").trim()) lockOpportunityOwnership(next, viewer, "推进时提交有效跟进");
    state.opportunities[index] = next;
    state.activities.push({ date: today(), owner: next.owner, type: nextStage, customerId: next.customerId, opportunityId: next.id });
    syncCustomerCompatibility(state, next.customerId);
    writeState(state);
    return sendJson(res, 200, opportunityView(state, next));
  }

  const opportunityFollow = url.pathname.match(/^\/api\/opportunities\/(\d+)\/follow$/);
  if (req.method === "POST" && opportunityFollow) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const index = state.opportunities.findIndex((item) => Number(item.id) === Number(opportunityFollow[1]));
    if (index < 0) return sendJson(res, 404, { error: "销售机会不存在" });
    const previous = state.opportunities[index];
    if (isOpportunityPublicPool(previous)) return sendJson(res, 409, { error: "公海机会需要先认领", code: "CUSTOMER_CLAIM_REQUIRED" });
    if (!canViewOpportunity(state, viewer, previous)) return sendJson(res, 403, { error: "无权跟进该销售机会" });
    const note = String(body.note || "").trim();
    if (!note) return sendJson(res, 400, { error: "请填写跟进内容" });
    const productUpdate = applyProductSelectionForFollow(state, previous, body);
    if (productUpdate.error) {
      return sendJson(res, productUpdate.error.code === "DUPLICATE_ACTIVE_OPPORTUNITY" ? 409 : 400, productUpdate.error);
    }
    const next = normalizeOpportunity({
      ...previous,
      ...productUpdate.fields,
      nextFollow: String(body.nextFollow || ""),
      followUps: [...(previous.followUps || []), normalizeFollowUp({ date: body.date || today(), createdAt: new Date().toISOString(), author: viewer.name, note, nextFollow: body.nextFollow || "", isSystem: false }, previous)]
    }, state);
    lockOpportunityOwnership(next, viewer, "提交有效跟进");
    state.opportunities[index] = next;
    syncCustomerCompatibility(state, next.customerId);
    writeState(state);
    return sendJson(res, 200, opportunityView(state, next));
  }

  const opportunityClaim = url.pathname.match(/^\/api\/opportunities\/(\d+)\/claim$/);
  if (req.method === "POST" && opportunityClaim) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const index = state.opportunities.findIndex((item) => Number(item.id) === Number(opportunityClaim[1]));
    if (index < 0) return sendJson(res, 404, { error: "公海机会不存在" });
    return claimOpportunityAtIndex(res, state, viewer, index, body);
  }

  const opportunityPurchased = url.pathname.match(/^\/api\/opportunities\/(\d+)\/mark-purchased$/);
  if (req.method === "POST" && opportunityPurchased) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const index = state.opportunities.findIndex((item) => Number(item.id) === Number(opportunityPurchased[1]));
    if (index < 0) return sendJson(res, 404, { error: "销售机会不存在" });
    const previous = state.opportunities[index];
    if (isOpportunityPublicPool(previous)) return sendJson(res, 409, { error: "公海机会需要先认领", code: "CUSTOMER_CLAIM_REQUIRED" });
    if (previous.stage === "成交") return sendJson(res, 409, { error: "已成交机会不能标记为已购" });
    if (!canViewOpportunity(state, viewer, previous)) return sendJson(res, 403, { error: "无权标记该销售机会" });
    const note = String(body.note || "").trim();
    if (!note) return sendJson(res, 400, { error: "请填写本次跟进记录", field: "note" });
    const purchasedInfo = normalizePurchasedInfo({
      product: body.product || body.purchasedProduct,
      brand: body.brand || body.purchasedBrand,
      purchasedAt: body.purchasedAt,
      revisitAt: body.revisitAt,
      note
    });
    const next = normalizeOpportunity({
      ...previous,
      outcomeStatus: OUTCOME_PURCHASED,
      purchasedInfo,
      nextFollow: purchasedInfo.revisitAt || "",
      followUps: [
        ...(previous.followUps || []),
        normalizeFollowUp({ date: today(), createdAt: new Date().toISOString(), author: viewer.name, note, nextFollow: purchasedInfo.revisitAt || "", isSystem: false }, previous)
      ]
    }, state);
    lockOpportunityOwnership(next, viewer, "标记为已购客户");
    next.publicPoolAt = "";
    next.publicPoolReason = "";
    state.opportunities[index] = next;
    state.activities.push({ date: today(), owner: next.owner, type: PURCHASED_STATUS, customerId: next.customerId, opportunityId: next.id });
    syncCustomerCompatibility(state, next.customerId);
    writeState(state);
    return sendJson(res, 200, opportunityView(state, next));
  }

  const opportunityRollbackRequest = url.pathname.match(/^\/api\/opportunities\/(\d+)\/rollback-request$/);
  if (req.method === "POST" && opportunityRollbackRequest) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const index = state.opportunities.findIndex((item) => Number(item.id) === Number(opportunityRollbackRequest[1]));
    if (index < 0) return sendJson(res, 404, { error: "销售机会不存在" });
    const opportunity = state.opportunities[index];
    if (isOpportunityPublicPool(opportunity)) return sendJson(res, 409, { error: "公海机会需要先认领", code: "CUSTOMER_CLAIM_REQUIRED" });
    if (isPurchasedOpportunity(opportunity)) return sendJson(res, 409, { error: "已购客户不需要阶段回撤" });
    if (opportunity.stage === "成交") return sendJson(res, 409, { error: "成交机会请联系管理员做成交纠错" });
    if (!canViewOpportunity(state, viewer, opportunity)) return sendJson(res, 403, { error: "无权申请该销售机会回撤" });
    const targetStage = rollbackTargetForStage(opportunity.stage);
    if (!targetStage) return sendJson(res, 400, { error: "当前阶段不支持回撤" });
    if (latestPendingRollback(opportunity)) return sendJson(res, 409, { error: "该机会已有待审批回撤申请" });
    const reason = String(body.reason || "").trim();
    if (!reason) return sendJson(res, 400, { error: "请填写回撤原因", field: "reason" });
    const rollback = {
      id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      fromStage: opportunity.stage,
      targetStage,
      reason,
      note: String(body.note || "").trim(),
      requestedById: viewer.id,
      requestedBy: viewer.name,
      requestedAt: new Date().toISOString(),
      status: "pending"
    };
    opportunity.rollbackHistory = [...(opportunity.rollbackHistory || []), rollback];
    state.opportunities[index] = normalizeOpportunity(opportunity, state);
    syncCustomerCompatibility(state, opportunity.customerId);
    writeState(state);
    return sendJson(res, 200, opportunityView(state, state.opportunities[index]));
  }

  const opportunityRollbackReview = url.pathname.match(/^\/api\/opportunities\/(\d+)\/rollback-review$/);
  if (req.method === "POST" && opportunityRollbackReview) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const index = state.opportunities.findIndex((item) => Number(item.id) === Number(opportunityRollbackReview[1]));
    if (index < 0) return sendJson(res, 404, { error: "销售机会不存在" });
    const opportunity = state.opportunities[index];
    if (!canReviewRollback(state, viewer, opportunity)) return sendJson(res, 403, { error: "无权审批该回撤申请" });
    const request = latestPendingRollback(opportunity, body.requestId);
    if (!request) return sendJson(res, 404, { error: "没有待审批的回撤申请" });
    const approved = body.action === "approve" || body.approved === true;
    const rejected = body.action === "reject" || body.approved === false;
    if (!approved && !rejected) return sendJson(res, 400, { error: "请选择审批结果" });
    const now = new Date().toISOString();
    request.status = approved ? "approved" : "rejected";
    request.reviewedById = viewer.id;
    request.reviewedBy = viewer.name;
    request.reviewedAt = now;
    request.reviewNote = String(body.reviewNote || body.note || "").trim();
    if (approved) {
      const note = `由${viewer.name}审批回撤至${request.targetStage}阶段，原因：${request.reason}`;
      opportunity.stage = request.targetStage;
      opportunity.followUps = [
        ...(opportunity.followUps || []),
        normalizeFollowUp({ date: today(), createdAt: now, author: viewer.name, note, nextFollow: opportunity.nextFollow || "", isSystem: true }, opportunity)
      ];
      state.activities.push({ date: today(), owner: opportunity.owner, type: request.targetStage, customerId: opportunity.customerId, opportunityId: opportunity.id });
    }
    state.opportunities[index] = normalizeOpportunity(opportunity, state);
    syncCustomerCompatibility(state, opportunity.customerId);
    writeState(state);
    return sendJson(res, 200, opportunityView(state, state.opportunities[index]));
  }

  const opportunityAssign = url.pathname.match(/^\/api\/opportunities\/(\d+)\/assign$/);
  if (req.method === "POST" && opportunityAssign) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canAssignCustomers(state, viewer)) return sendJson(res, 403, { error: "无销售机会分配权限" });
    const index = state.opportunities.findIndex((item) => Number(item.id) === Number(opportunityAssign[1]));
    if (index < 0) return sendJson(res, 404, { error: "销售机会不存在" });
    const previous = state.opportunities[index];
    if (!canManageOpportunityAssignment(state, viewer, previous)) return sendJson(res, 403, { error: "不可分配权限范围外的销售机会" });
    const target = findAssignableSalesUser(state, viewer, body.ownerId, body.owner || body.followPerson);
    if (!target) return sendJson(res, 400, { error: "请选择当前权限内的跟进人" });
    const next = assignOpportunity(state, previous, target, viewer);
    state.opportunities[index] = next;
    syncCustomerCompatibility(state, next.customerId);
    writeState(state);
    return sendJson(res, 200, opportunityView(state, next));
  }

  if (req.method === "POST" && url.pathname === "/api/opportunities/assign") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canAssignCustomers(state, viewer)) return sendJson(res, 403, { error: "无销售机会分配权限" });
    const ids = [...new Set((body.ids || body.opportunityIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return sendJson(res, 400, { error: "请选择要分配的客户" });
    const requestedAssignments = Array.isArray(body.assignments) ? body.assignments : [];
    const assignmentPlan = [];
    if (requestedAssignments.length) {
      let totalCount = 0;
      requestedAssignments.forEach((item) => {
        const count = Math.max(0, Math.floor(Number(item.count || 0)));
        if (!count) return;
        const target = findAssignableSalesUser(state, viewer, item.ownerId, item.owner || item.followPerson);
        if (!target) assignmentPlan.push({ error: "请选择当前权限内的跟进人" });
        totalCount += count;
        assignmentPlan.push({ target, count });
      });
      if (assignmentPlan.some((item) => item.error || !item.target)) return sendJson(res, 400, { error: "分配名单中包含无效跟进人" });
      if (totalCount !== ids.length) return sendJson(res, 400, { error: `分配数量合计需等于已选客户数，当前相差${ids.length - totalCount}` });
    } else {
      const target = findAssignableSalesUser(state, viewer, body.ownerId, body.owner || body.followPerson);
      if (!target) return sendJson(res, 400, { error: "请选择当前权限内的跟进人" });
      assignmentPlan.push({ target, count: ids.length });
    }
    const assigned = [];
    const failed = [];
    const summary = [];
    let cursor = 0;
    assignmentPlan.forEach(({ target, count }) => {
      let success = 0;
      ids.slice(cursor, cursor + count).forEach((id) => {
        const index = state.opportunities.findIndex((item) => Number(item.id) === id);
        if (index < 0) return failed.push({ id, reason: "销售机会不存在" });
        const previous = state.opportunities[index];
        if (!canManageOpportunityAssignment(state, viewer, previous)) return failed.push({ id, reason: "超出管理范围" });
        const next = assignOpportunity(state, previous, target, viewer);
        state.opportunities[index] = next;
        syncCustomerCompatibility(state, next.customerId);
        assigned.push(opportunityView(state, next));
        success += 1;
      });
      cursor += count;
      summary.push({ ownerId: target.id, owner: target.name, requested: count, assigned: success });
    });
    if (assigned.length) writeState(state);
    return sendJson(res, 200, { assigned: assigned.length, failed, summary, opportunities: assigned });
  }

  if (req.method === "GET" && url.pathname === "/api/map/points") {
    return sendJson(res, 200, buildMapPoints(authState, authUser, Object.fromEntries(url.searchParams.entries())));
  }

  if (req.method === "GET" && url.pathname === "/api/map/nearby") {
    const latitude = Number(url.searchParams.get("latitude"));
    const longitude = Number(url.searchParams.get("longitude"));
    const radiusKm = [5, 10, 20, 50].includes(Number(url.searchParams.get("radiusKm"))) ? Number(url.searchParams.get("radiusKm")) : 20;
    if (!latitude || !longitude) return sendJson(res, 400, { error: "缺少当前位置" });
    const points = buildMapPoints(authState, authUser, { pointStatus: "pending" }).points
      .map((item) => ({ ...item, distanceKm: haversineKm(latitude, longitude, item.latitude, item.longitude) }))
      .filter((item) => item.distanceKm <= radiusKm)
      .sort((left, right) => left.distanceKm - right.distanceKm);
    return sendJson(res, 200, { radiusKm, points });
  }

  if (req.method === "GET" && url.pathname === "/api/geocode/status") {
    if (!canUseAdmin(authState, authUser)) return sendJson(res, 403, { error: "无地址解析任务查看权限" });
    const counts = (authState.geocodeJobs || []).reduce((result, job) => {
      result[job.status] = (result[job.status] || 0) + 1;
      return result;
    }, { pending: 0, processing: 0, resolved: 0, failed: 0 });
    return sendJson(res, 200, { configured: Boolean(TENCENT_MAP_SERVER_KEY), counts, remaining: counts.pending + counts.processing });
  }

  if (req.method === "POST" && url.pathname === "/api/routes/optimize") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const ids = [...new Set((body.customerIds || []).map(Number).filter(Boolean))].slice(0, 12);
    if (!ids.length) return sendJson(res, 400, { error: "请选择要拜访的工厂" });
    const customers = ids.map((id) => state.customers.find((item) => Number(item.id) === id)).filter(Boolean);
    if (customers.some((customer) => !canViewMapCustomer(state, viewer, customer))) return sendJson(res, 403, { error: "包含无权查看的客户" });
    const origin = { latitude: Number(body.latitude), longitude: Number(body.longitude) };
    const routeResult = await optimizeRoute(origin, customers);
    if (!routeResult.customers.length) return sendJson(res, 400, { error: "所选工厂尚未完成地图定位" });
    return sendJson(res, 200, { source: routeResult.source, stops: routeResult.customers.map(mapRouteStop) });
  }

  if (req.method === "GET" && url.pathname === "/api/routes") {
    const date = url.searchParams.get("date") || today();
    return sendJson(res, 200, (authState.routes || []).filter((item) => Number(item.ownerId) === Number(authUser.id) && item.date === date));
  }

  if (req.method === "POST" && url.pathname === "/api/routes") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const requestedStops = (Array.isArray(body.stops) ? body.stops : []).slice(0, 12);
    const routeStops = [];
    for (const [index, stop] of requestedStops.entries()) {
      const customer = state.customers.find((item) => Number(item.id) === Number(stop.customerId || stop.id));
      if (!customer || customerMapAccess(state, viewer, customer).mode === "none") {
        return sendJson(res, 403, { error: "路线中包含无权查看的客户" });
      }
      routeStops.push({
        ...mapRouteStop(customer, index),
        completed: Boolean(stop.completed),
        completedAt: stop.completedAt || ""
      });
    }
    const route = normalizeRoute({
      id: body.id || Date.now(),
      ownerId: viewer.id,
      owner: viewer.name,
      date: body.date || today(),
      stops: routeStops,
      createdAt: new Date().toISOString()
    });
    const index = state.routes.findIndex((item) => Number(item.ownerId) === Number(viewer.id) && item.date === route.date);
    if (index >= 0) state.routes[index] = { ...state.routes[index], ...route, id: state.routes[index].id };
    else state.routes.push(route);
    writeState(state);
    return sendJson(res, index >= 0 ? 200 : 201, route);
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    const client = url.searchParams.get("client") || "web";
    const lite = url.searchParams.get("lite") === "1";
    const metadata = url.searchParams.get("metadata") === "1";
    const includePublicPool = lite
      ? url.searchParams.get("includePublicPool") === "1"
      : url.searchParams.get("includePublicPool") !== "0";
    const state = authState;
    if (metadata && client !== "mini") return sendJson(res, 200, publicMetaState(state, authUser));
    return sendJson(res, 200, client === "mini" ? toMiniState(state, authUser) : publicState(state, authUser, { includePublicPool }));
  }

  if (req.method === "PUT" && url.pathname === "/api/state") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!viewer) return sendJson(res, 401, { error: "请先登录" });
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无权批量修改系统数据" });
    const nextState = normalizeIncomingState(body);
    writeState(nextState);
    return sendJson(res, 200, { ok: true, state: publicState(nextState, viewer) });
  }

  if (req.method === "POST" && url.pathname === "/api/customers") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const viewerRole = findRole(state.roles, viewer.roleId, viewer.role);
    let owner = viewer;
    if (viewerRole.customerScope !== "self") {
      const requestedOwner = findUser(state.users, body.ownerId, body.owner || body.followPerson);
      const visibleOwner = visibleUsers(state, viewer).find((item) => Number(item.id) === Number(requestedOwner.id));
      if (requestedOwner.id && !visibleOwner) return sendJson(res, 403, { error: "不能将客户录入到权限范围外" });
      if (visibleOwner?.id) owner = visibleOwner;
    }
    const requestedContacts = normalizeContacts(body.contacts || [], body);
    const requestedPrimary = requestedContacts.find((item) => item.isPrimary) || requestedContacts[0] || {};
    const normalizedPhone = normalizePhone(requestedPrimary.phone || body.phone);
    if (!normalizedPhone) return sendJson(res, 400, { error: "请填写有效的客户手机号", code: "INVALID_CUSTOMER_PHONE" });
    const duplicate = findCustomerByPhone(state, normalizedPhone);
    if (duplicate) {
      const code = isCustomerClaimable(duplicate) ? "CUSTOMER_CLAIMABLE" : "DUPLICATE_CUSTOMER";
      const error = code === "CUSTOMER_CLAIMABLE" ? "该客户已释放，可以认领" : "该客户已存在";
      return sendJson(res, 409, { error, code });
    }
    if (!body.confirmSimilar && findSimilarCustomer(state, body)) {
      return sendJson(res, 409, { error: "发现同城名称相似的客户，请确认后继续录入", code: "SIMILAR_CUSTOMER_WARNING" });
    }
    const now = new Date().toISOString();
    const candidate = {
      id: Date.now(),
      ...body,
      phone: requestedPrimary.phone || body.phone,
      contacts: requestedContacts,
      phoneNormalized: normalizedPhone,
      ownerId: owner.id,
      owner: owner.name,
      followPerson: owner.name,
      createdBy: viewer.name,
      unitId: owner.unitId,
      unit: owner.unit,
      zone: owner.zone,
      city: body.city || extractCity(body.address || body.region) || "待识别",
      ownershipStatus: OWNERSHIP_LOCKED,
      claimUntil: "",
      effectiveFollowUpAt: "",
      ownershipHistory: []
    };
    const customer = normalizeCustomer({
      ...candidate,
      followUps: []
    }, state);
    state.customers.unshift(customer);
    const product = resolveProduct(state, body.productId, body.productName) || normalizeProduct({ id: stableId("product", "待确认产品"), name: "待确认产品" });
    const opportunityCandidate = {
      ...body,
      id: Date.now() + 1,
      customerId: customer.id,
      productId: product.id,
      productName: product.name,
      ownerId: owner.id,
      owner: owner.name,
      followPerson: owner.name,
      createdBy: viewer.name,
      unitId: owner.unitId,
      unit: owner.unit,
      zone: owner.zone,
      ownershipStatus: OWNERSHIP_PENDING,
      claimUntil: addDaysToIso(now, claimProtectionDays(state, viewer, owner, body.stage || "名单")),
      effectiveFollowUpAt: "",
      ownershipHistory: [ownershipEvent("created", null, owner, viewer, "首次录入")],
      followUps: [{
        date: body.lastFollow || body.date || today(),
        createdAt: now,
        author: viewer.name,
        note: body.lastNote || body.note || `新增${product.name}销售机会。`,
        nextFollow: body.nextFollow || "",
        isSystem: true
      }]
    };
    const validationError = validateOpportunityBusinessUpdate({}, opportunityCandidate);
    if (validationError) return sendJson(res, 400, { error: validationError });
    const opportunity = normalizeOpportunity(opportunityCandidate, state);
    state.opportunities.unshift(opportunity);
    syncCustomerCompatibility(state, customer.id);
    state.activities.push({ date: today(), owner: opportunity.owner, type: opportunity.stage, customerId: customer.id, opportunityId: opportunity.id });
    writeState(state);
    return sendJson(res, 201, opportunityView(state, opportunity));
  }

  if (req.method === "POST" && url.pathname === "/api/customers/claim") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const normalizedPhone = normalizePhone(body.phone);
    const index = state.customers.findIndex((item) => normalizePhone(item.phoneNormalized || item.phone) === normalizedPhone);
    if (!normalizedPhone || index < 0) return sendJson(res, 404, { error: "未找到可认领客户" });
    return claimCustomerAtIndex(res, state, viewer, index);
  }

  const customerClaim = url.pathname.match(/^\/api\/customers\/(\d+)\/claim$/);
  if (req.method === "POST" && customerClaim) {
    const state = readState();
    const viewer = getAuthUser(req, state);
    const index = state.customers.findIndex((item) => Number(item.id) === Number(customerClaim[1]));
    if (index < 0) return sendJson(res, 404, { error: "未找到可认领客户" });
    return claimCustomerAtIndex(res, state, viewer, index);
  }

  const customerContacts = url.pathname.match(/^\/api\/customers\/(\d+)\/contacts$/);
  if (req.method === "PUT" && customerContacts) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const index = state.customers.findIndex((item) => Number(item.id) === Number(customerContacts[1]));
    if (index < 0) return sendJson(res, 404, { error: "客户不存在" });
    const customer = state.customers[index];
    if (isCustomerPublicPool(customer)) return sendJson(res, 409, { error: "公海客户需先认领", code: "CUSTOMER_CLAIM_REQUIRED" });
    if (!canViewRecord(state, viewer, customer)) return sendJson(res, 403, { error: "无权维护该客户联系人" });
    const contacts = normalizeContacts(body.contacts || [], customer);
    const primary = contacts.find((item) => item.isPrimary);
    if (!primary?.phoneNormalized) return sendJson(res, 400, { error: "必须保留一个有效的主联系人手机号" });
    const primaryChanged = primary.phoneNormalized !== normalizePhone(customer.phoneNormalized || customer.phone);
    if (primaryChanged && !canEditCustomerIdentity(state, viewer)) return sendJson(res, 403, { error: "当前角色无权修改主联系人手机号" });
    const duplicate = primaryChanged ? findCustomerByPhone(state, primary.phoneNormalized, customer.id) : null;
    if (duplicate) return sendJson(res, 409, { error: "该客户已存在", code: "DUPLICATE_CUSTOMER" });
    customer.contacts = contacts;
    customer.phone = primary.phone;
    customer.phoneNormalized = primary.phoneNormalized;
    writeState(state);
    return sendJson(res, 200, toMiniCustomer(customer));
  }

  const customerCompetitors = url.pathname.match(/^\/api\/customers\/(\d+)\/competitors$/);
  if (req.method === "PUT" && customerCompetitors) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const customer = state.customers.find((item) => Number(item.id) === Number(customerCompetitors[1]));
    if (!customer) return sendJson(res, 404, { error: "客户不存在" });
    if (isCustomerPublicPool(customer)) return sendJson(res, 409, { error: "公海客户需先认领", code: "CUSTOMER_CLAIM_REQUIRED" });
    if (!canViewRecord(state, viewer, customer)) return sendJson(res, 403, { error: "无权维护该客户竞品档案" });
    customer.competitorProfiles = normalizeCompetitorProfiles(body.competitorProfiles || body.profiles || [], state.competitors);
    customer.software = primaryCompetitorName(customer) || customer.software;
    writeState(state);
    return sendJson(res, 200, toMiniCustomer(customer));
  }

  const customerVisits = url.pathname.match(/^\/api\/customers\/(\d+)\/visits$/);
  if (req.method === "GET" && customerVisits) {
    const state = readState();
    const viewer = getAuthUser(req, state);
    const customer = state.customers.find((item) => Number(item.id) === Number(customerVisits[1]));
    if (!customer || customerMapAccess(state, viewer, customer).mode === "none") return sendJson(res, 404, { error: "客户不存在" });
    if (customerMapAccess(state, viewer, customer).mode === "public") {
      return sendJson(res, 409, { error: "公海客户认领后方可查看拜访记录", code: "CUSTOMER_CLAIM_REQUIRED" });
    }
    return sendJson(res, 200, visibleVisitsForCustomer(state, viewer, customer.id).sort(sortByNewest));
  }

  const customerDelete = url.pathname.match(/^\/api\/customers\/(\d+)$/);
  if (req.method === "DELETE" && customerDelete) {
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canHardDeleteCustomer(state, viewer)) return sendJson(res, 403, { error: "仅管理员和总负责人可以删除客户" });
    const customerId = Number(customerDelete[1]);
    const customer = findCustomer(state.customers || [], customerId);
    if (!customer) return sendJson(res, 404, { error: "客户不存在" });
    const opportunityIds = new Set((state.opportunities || []).filter((item) => Number(item.customerId) === customerId).map((item) => Number(item.id)));
    state.customers = (state.customers || []).filter((item) => Number(item.id) !== customerId);
    state.opportunities = (state.opportunities || []).filter((item) => Number(item.customerId) !== customerId);
    state.activities = (state.activities || []).filter((item) => Number(item.customerId) !== customerId && !opportunityIds.has(Number(item.opportunityId)));
    state.visits = (state.visits || []).filter((item) => Number(item.customerId) !== customerId && !opportunityIds.has(Number(item.opportunityId)));
    state.geocodeJobs = (state.geocodeJobs || []).filter((item) => Number(item.customerId) !== customerId);
    state.routes = (state.routes || []).map((route) => normalizeRoute({
      ...route,
      stops: (route.stops || []).filter((stop) => Number(stop.customerId) !== customerId)
    }));
    appendSecurityLog(state, {
      type: "delete_customer",
      actorId: viewer.id,
      actorName: viewer.name,
      targetId: customerId,
      targetName: `${customer.name || ""} ${customer.phone || ""}`.trim(),
      sourceIp: req.socket?.remoteAddress || "unknown"
    });
    writeState(state);
    return sendJson(res, 200, { ok: true, deletedId: customerId });
  }

  const customerArchive = url.pathname.match(/^\/api\/customers\/(\d+)\/archive$/);
  if (req.method === "POST" && customerArchive) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const customer = state.customers.find((item) => Number(item.id) === Number(customerArchive[1]));
    if (!customer) return sendJson(res, 404, { error: "客户不存在" });
    if (!canViewRecord(state, viewer, customer)) return sendJson(res, 403, { error: "无权归档该客户" });
    customer.lifecycleStatus = LIFECYCLE_ARCHIVED;
    customer.archiveReason = body.reason === "closed" ? "closed" : "invalid";
    customer.archivedAt = new Date().toISOString();
    customer.archivedBy = viewer.name;
    writeState(state);
    return sendJson(res, 200, toMiniCustomer(customer));
  }

  const customerRestore = url.pathname.match(/^\/api\/customers\/(\d+)\/restore$/);
  if (req.method === "POST" && customerRestore) {
    const state = readState();
    const viewer = getAuthUser(req, state);
    const customer = state.customers.find((item) => Number(item.id) === Number(customerRestore[1]));
    if (!customer) return sendJson(res, 404, { error: "客户不存在" });
    if (!canManageCustomer(state, viewer, customer)) return sendJson(res, 403, { error: "仅管理人员可恢复归档客户" });
    customer.lifecycleStatus = LIFECYCLE_ACTIVE;
    customer.archiveReason = "";
    customer.archivedAt = "";
    customer.archivedBy = "";
    writeState(state);
    return sendJson(res, 200, toMiniCustomer(customer));
  }

  const customerFollow = url.pathname.match(/^\/api\/customers\/(\d+)\/follow$/);
  if (req.method === "POST" && customerFollow) {
    const body = await readBody(req);
    const state = readState();
    const customer = state.customers.find((item) => item.id === Number(customerFollow[1]));
    if (!customer) return sendJson(res, 404, { error: "customer not found" });
    const viewer = getAuthUser(req, state);
    const opportunity = state.opportunities.find((item) => Number(item.id) === Number(body.opportunityId)) || primaryOpportunity(state, customer.id);
    if (!opportunity) return sendJson(res, 404, { error: "销售机会不存在" });
    if (isOpportunityPublicPool(opportunity)) {
      return sendJson(res, 409, { error: "公海客户需先认领后跟进", code: "CUSTOMER_CLAIM_REQUIRED" });
    }
    if (!canViewOpportunity(state, viewer, opportunity)) return sendJson(res, 403, { error: "无权跟进该销售机会" });
    const note = String(body.note || "").trim();
    if (!note) return sendJson(res, 400, { error: "请填写跟进内容" });
    const productUpdate = applyProductSelectionForFollow(state, opportunity, body);
    if (productUpdate.error) {
      return sendJson(res, productUpdate.error.code === "DUPLICATE_ACTIVE_OPPORTUNITY" ? 409 : 400, productUpdate.error);
    }
    Object.assign(opportunity, productUpdate.fields);
    opportunity.followUps = opportunity.followUps || [];
    opportunity.followUps.push({
      date: body.date || today(),
      createdAt: new Date().toISOString(),
      author: viewer?.name || "未记录",
      note,
      nextFollow: body.nextFollow || "",
      isSystem: false
    });
    opportunity.nextFollow = String(body.nextFollow || "");
    lockOpportunityOwnership(opportunity, viewer, "提交有效跟进");
    syncCustomerCompatibility(state, customer.id);
    writeState(state);
    return sendJson(res, 200, opportunityView(state, opportunity));
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
    if (!target) return sendJson(res, 400, { error: "请选择当前权限内的跟进人" });
    const { next, previousStage } = buildAssignedCustomer(state, viewer, customer, target, body);
    state.customers[index] = next;
    transferCustomerVisits(state, customer, next);
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
    if (!target) return sendJson(res, 400, { error: "请选择当前权限内的跟进人" });
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
      transferCustomerVisits(state, customer, next);
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

  if (req.method === "POST" && url.pathname === "/api/customers/channel-source") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canBulkEditCustomerChannelSource(state, viewer)) return sendJson(res, 403, { error: "仅管理员和总负责人可以批量修改渠道来源" });
    const ids = [...new Set((body.customerIds || body.ids || []).map((id) => Number(id)).filter(Boolean))];
    if (!ids.length) return sendJson(res, 400, { error: "请选择要修改渠道的客户" });
    const resolved = resolveChannelSource(body.channelSource, state.channelSources);
    if (!resolved.raw || !resolved.recognized) return sendJson(res, 400, { error: "请选择有效渠道来源" });
    const beforeCounts = {};
    let updated = 0;
    ids.forEach((id) => {
      const index = state.customers.findIndex((item) => Number(item.id) === Number(id));
      if (index < 0) return;
      const customer = state.customers[index];
      if (!canViewRecord(state, viewer, customer)) return;
      beforeCounts[customer.channelSource || "其他"] = (beforeCounts[customer.channelSource || "其他"] || 0) + 1;
      state.customers[index] = normalizeCustomer({ ...customer, channelSource: resolved.value }, state);
      (state.opportunities || []).forEach((opportunity) => {
        if (Number(opportunity.customerId) === Number(id)) opportunity.channelSource = resolved.value;
      });
      updated += 1;
    });
    if (!updated) return sendJson(res, 404, { error: "没有可修改的客户" });
    appendSecurityLog(state, {
      type: "bulk_update_customer_channel_source",
      actorId: viewer.id,
      actorName: viewer.name,
      targetId: 0,
      targetName: `${updated}个客户 -> ${resolved.value}`,
      sourceIp: getRequestIp(req)
    });
    writeState(state);
    return sendJson(res, 200, { updated, channelSource: resolved.value, beforeCounts });
  }

  const customerPatch = url.pathname.match(/^\/api\/customers\/(\d+)$/);
  if ((req.method === "PATCH" || req.method === "PUT") && customerPatch) {
    const body = await readBody(req);
    const state = readState();
    const index = state.customers.findIndex((item) => item.id === Number(customerPatch[1]));
    if (index < 0) return sendJson(res, 404, { error: "customer not found" });
    const previous = state.customers[index];
    const viewer = getAuthUser(req, state);
    if (isCustomerPublicPool(previous)) {
      return sendJson(res, 409, { error: "公海客户需先认领后修改", code: "CUSTOMER_CLAIM_REQUIRED" });
    }
    if (!canViewRecord(state, viewer, previous)) return sendJson(res, 403, { error: "无权修改该客户" });
    if (!canUseAdmin(state, viewer)) {
      const changesName = body.name !== undefined && String(body.name).trim() !== String(previous.name || "").trim();
      const changesPhone = body.phone !== undefined && normalizePhone(body.phone) !== normalizePhone(previous.phone);
      const changesChannel = body.channelSource !== undefined && normalizeChannelSource(body.channelSource, state.channelSources) !== normalizeChannelSource(previous.channelSource, state.channelSources);
      const changesCreatedBy = body.createdBy !== undefined && cleanText(body.createdBy) !== cleanText(previous.createdBy);
      if (changesName || changesPhone || changesChannel || changesCreatedBy) {
        return sendJson(res, 403, { error: "已有客户的名称、手机号、渠道来源和录入人仅总负责人、运营、管理员可修改" });
      }
    }
    if (body.contacts !== undefined) {
      const contacts = normalizeContacts(body.contacts, previous);
      const primary = contacts.find((item) => item.isPrimary) || contacts[0];
      if (!primary?.phoneNormalized) return sendJson(res, 400, { error: "必须保留一个有效的主联系人手机号" });
      const primaryChanged = primary.phoneNormalized !== normalizePhone(previous.phoneNormalized || previous.phone);
      if (primaryChanged && !canEditCustomerIdentity(state, viewer)) return sendJson(res, 403, { error: "当前角色无权修改主联系人手机号" });
      if (primaryChanged && findCustomerByPhone(state, primary.phoneNormalized, previous.id)) return sendJson(res, 409, { error: "该客户已存在", code: "DUPLICATE_CUSTOMER" });
      body.contacts = contacts;
      body.phone = primary.phone;
      body.phoneNormalized = primary.phoneNormalized;
    }
    if (body.phone !== undefined) {
      const normalizedPhone = normalizePhone(body.phone);
      if (!normalizedPhone) return sendJson(res, 400, { error: "请填写有效的客户手机号", code: "INVALID_CUSTOMER_PHONE" });
      const phoneChanged = normalizedPhone !== normalizePhone(previous.phoneNormalized || previous.phone);
      const duplicate = phoneChanged ? findCustomerByPhone(state, normalizedPhone, previous.id) : null;
      if (duplicate) return sendJson(res, 409, { error: "该客户已存在", code: "DUPLICATE_CUSTOMER" });
      body.phoneNormalized = normalizedPhone;
    }
    const identityChanged =
      (body.name !== undefined && cleanText(body.name) !== cleanText(previous.name)) ||
      (body.address !== undefined && cleanText(body.address) !== cleanText(previous.address)) ||
      (body.region !== undefined && cleanText(body.region) !== cleanText(previous.region));
    if (identityChanged && !body.confirmSimilar && findSimilarCustomer(state, { ...previous, ...body }, previous.id)) {
      return sendJson(res, 409, { error: "发现同城名称相似的客户，请确认后继续保存", code: "SIMILAR_CUSTOMER_WARNING" });
    }
    const salesFields = ["productId", "productName", "stage", "owner", "ownerId", "followPerson", "unitId", "unit", "zone", "region", "amount", "demoAt", "quoteAmount", "expectedDealDate", "contractAmount", "paymentAmount", "paymentDate", "paymentOwnerId", "paymentOwner", "lossReason", "lossReasonDetail", "ownershipStatus", "claimUntil", "effectiveFollowUpAt", "publicPoolAt", "publicPoolReason", "ownershipHistory", "leadAt", "opportunityAt", "dealAt", "followUps", "lastNote", "note", "lastFollow", "nextFollow"];
    const customerBody = { ...body };
    salesFields.forEach((field) => delete customerBody[field]);
    customerBody.city = body.city || (body.address !== undefined ? extractCity(body.address) || "待识别" : previous.city);
    const next = normalizeCustomer({ ...previous, ...customerBody, id: previous.id }, state);
    state.customers[index] = next;
    const opportunity = state.opportunities.find((item) => Number(item.id) === Number(body.opportunityId)) || primaryOpportunity(state, previous.id);
    if (opportunity && salesFields.some((field) => body[field] !== undefined)) {
      const opportunityIndex = state.opportunities.findIndex((item) => Number(item.id) === Number(opportunity.id));
      const opportunityBody = Object.fromEntries(salesFields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]));
      if (body.productId !== undefined || body.productName !== undefined) {
        const product = resolveProduct(state, body.productId, body.productName);
        if (!product) return sendJson(res, 400, { error: "请选择有效的意向产品" });
        if (opportunity.stage !== "成交" && hasActiveProductOpportunity(state, opportunity.customerId, product.id, opportunity.id)) {
          return sendJson(res, 409, { error: "该客户已有相同产品的进行中机会", code: "DUPLICATE_ACTIVE_OPPORTUNITY" });
        }
        opportunityBody.productId = product.id;
        opportunityBody.productName = product.name;
      }
      if (String(body.lastNote || body.note || "").trim()) {
        const productUpdate = applyProductSelectionForFollow(state, opportunity, body);
        if (productUpdate.error) {
          return sendJson(res, productUpdate.error.code === "DUPLICATE_ACTIVE_OPPORTUNITY" ? 409 : 400, productUpdate.error);
        }
        Object.assign(opportunityBody, productUpdate.fields);
      }
      const validationError = validateOpportunityBusinessUpdate(opportunity, opportunityBody);
      if (validationError) return sendJson(res, 400, { error: validationError });
      const updated = normalizeOpportunity({ ...opportunity, ...opportunityBody }, state);
      if (body.nextFollow !== undefined) updated.nextFollow = String(body.nextFollow || "");
      if (String(body.lastNote || body.note || "").trim()) {
        updated.followUps.push(normalizeFollowUp({ date: body.lastFollow || today(), createdAt: new Date().toISOString(), author: viewer.name, note: body.lastNote || body.note, nextFollow: body.nextFollow || "", isSystem: false }, opportunity));
        updated.nextFollow = String(body.nextFollow || "");
        lockOpportunityOwnership(updated, viewer, "兼容接口提交有效跟进");
      }
      if (body.stage && body.stage !== opportunity.stage) {
        setStageTime(updated, body.stage, body.date || today());
        state.activities.push({ date: body.date || today(), owner: updated.owner, type: body.stage, customerId: previous.id, opportunityId: updated.id });
      }
      state.opportunities[opportunityIndex] = updated;
    }
    syncCustomerCompatibility(state, previous.id);
    writeState(state);
    const responseOpportunity = state.opportunities.find((item) => Number(item.id) === Number(body.opportunityId)) || primaryOpportunity(state, previous.id);
    return sendJson(res, 200, responseOpportunity ? opportunityView(state, responseOpportunity) : toMiniCustomer(state.customers[index]));
  }

  if (req.method === "POST" && url.pathname === "/api/visits") {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const conflict = visitCustomerConflict(state, viewer, body);
    if (conflict) return sendJson(res, conflict.status, conflict.payload);
    const visitOpportunity = body.opportunityId
      ? state.opportunities.find((item) => Number(item.id) === Number(body.opportunityId))
      : (state.opportunities || []).find((item) => Number(item.customerId) === Number(body.customerId) && !isOpportunityPublicPool(item) && canViewOpportunity(state, viewer, item));
    const visit = normalizeVisit({
      id: Date.now(),
      date: today(),
      photos: [],
      ...body,
      opportunityId: visitOpportunity?.id || "",
      productId: visitOpportunity?.productId || body.productId || "",
      productName: visitOpportunity?.productName || body.productName || "",
      owner: viewer.name,
      ownerId: viewer.id,
      unitId: viewer.unitId || "",
      unit: viewer.unit || "",
      zone: viewer.zone || ""
    }, state);
    state.visits.unshift(visit);
    syncVisitToCustomer(state, visit);
    completeRouteStop(state, viewer.id, visit.customerId, visit.date);
    writeState(state);
    return sendJson(res, 201, visit);
  }

  const visitPatch = url.pathname.match(/^\/api\/visits\/(\d+)$/);
  if ((req.method === "PATCH" || req.method === "PUT") && visitPatch) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const index = state.visits.findIndex((item) => Number(item.id) === Number(visitPatch[1]));
    if (index < 0) return sendJson(res, 404, { error: "visit not found" });
    if (!canViewRecord(state, viewer, state.visits[index])) return sendJson(res, 403, { error: "无权修改该拜访记录" });
    const conflict = visitCustomerConflict(state, viewer, { ...state.visits[index], ...body });
    if (conflict) return sendJson(res, conflict.status, conflict.payload);
    const visit = normalizeVisit({
      ...state.visits[index],
      ...body,
      id: state.visits[index].id,
      date: body.date || state.visits[index].date || today(),
      owner: state.visits[index].owner,
      ownerId: state.visits[index].ownerId,
      unitId: state.visits[index].unitId,
      unit: state.visits[index].unit,
      zone: state.visits[index].zone
    }, state);
    state.visits[index] = visit;
    syncVisitToCustomer(state, visit);
    completeRouteStop(state, viewer.id, visit.customerId, visit.date);
    writeState(state);
    return sendJson(res, 200, visit);
  }

  if (req.method === "POST" && url.pathname === "/api/uploads") {
    const upload = await saveMultipartUpload(req);
    return sendJson(res, 201, upload);
  }

  if (req.method === "POST" && url.pathname === "/api/import/customers") {
    if (url.searchParams.get("target") === "public_pool" && !canImportPublicPool(authState, authUser)) {
      return sendJson(res, 403, { error: "仅运营、总负责人和管理员可以导入公海" });
    }
    try {
      const result = await importCustomers(req, authUser, url.searchParams.get("target") || "");
      return sendJson(res, 201, result);
    } catch (error) {
      const message = error.message || "导入失败";
      const status = message.includes("仅运营") || message.includes("权限范围") ? 403 : 400;
      return sendJson(res, status, { error: message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/import/customers/template") {
    return sendCustomerTemplate(res);
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
    if (String(body.password).length < PASSWORD_MIN_LENGTH) {
      return sendJson(res, 400, { error: `密码至少${PASSWORD_MIN_LENGTH}位` });
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

  const userUpdate = url.pathname.match(/^\/api\/users\/(\d+)$/);
  if (req.method === "PUT" && userUpdate) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无员工编辑权限" });
    const id = Number(userUpdate[1]);
    if (Number(viewer.id) === id) return sendJson(res, 400, { error: "不能在这里修改当前登录账号" });
    const index = state.users.findIndex((user) => Number(user.id) === id);
    if (index < 0) return sendJson(res, 404, { error: "员工不存在" });
    if (!visibleUsers(state, viewer).some((user) => Number(user.id) === id)) {
      return sendJson(res, 403, { error: "不能编辑权限范围外员工" });
    }
    const target = state.users[index];
    const role = (state.roles || []).find((item) => body.roleId && item.id === body.roleId)
      || (state.roles || []).find((item) => cleanText(item.name) === cleanText(body.role || ""));
    if (!role?.id) return sendJson(res, 400, { error: "请选择有效角色" });
    const unit = unitById(state.units || [], body.unitId || target.unitId);
    if (!unit?.id) return sendJson(res, 400, { error: "请选择有效单位" });
    const nextName = String(body.name || target.name || "").trim();
    if (!nextName) return sendJson(res, 400, { error: "员工姓名必填" });
    const nextStatus = ["启用", "停用"].includes(String(body.status || "")) ? String(body.status) : (target.status || "启用");
    const before = publicUser(target);
    const next = applyUnitToUser({
      ...target,
      name: nextName,
      role: role.name,
      roleId: role.id,
      status: nextStatus,
      authVersion: Number(target.authVersion || 1) + 1
    }, unit);
    state.users[index] = next;
    appendSecurityLog(state, {
      type: "update_user",
      actorId: viewer.id,
      actorName: viewer.name,
      targetId: next.id,
      targetName: next.name,
      sourceIp: getRequestIp(req),
      beforeRole: before.role,
      afterRole: next.role
    });
    writeState(state);
    return sendJson(res, 200, { ok: true, user: publicUser(next) });
  }

  const userPasswordUpdate = url.pathname.match(/^\/api\/users\/(\d+)\/password$/);
  if (req.method === "PUT" && userPasswordUpdate) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无密码重置权限" });
    const id = Number(userPasswordUpdate[1]);
    if (Number(viewer.id) === id) return sendJson(res, 400, { error: "请使用修改密码功能更改自己的密码" });
    const index = state.users.findIndex((user) => Number(user.id) === id);
    if (index < 0) return sendJson(res, 404, { error: "员工不存在" });
    if (!visibleUsers(state, viewer).some((user) => Number(user.id) === id)) {
      return sendJson(res, 403, { error: "不能重置权限范围外员工的密码" });
    }
    const newPassword = String(body.newPassword || "");
    const passwordError = validateNewPassword(state.users[index], newPassword);
    if (passwordError) return sendJson(res, 400, { error: passwordError });
    const target = state.users[index];
    state.users[index] = updateUserPassword(target, newPassword, true);
    appendSecurityLog(state, {
      type: "reset_password",
      actorId: viewer.id,
      actorName: viewer.name,
      targetId: target.id,
      targetName: target.name,
      sourceIp: getRequestIp(req)
    });
    writeState(state, { immediate: true, reason: "reset-password" });
    return sendJson(res, 200, { ok: true, user: publicUser(state.users[index]) });
  }

  const userOffboard = url.pathname.match(/^\/api\/users\/(\d+)\/offboard$/);
  if (req.method === "POST" && userOffboard) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无离职交接权限" });
    const target = state.users.find((item) => Number(item.id) === Number(userOffboard[1]));
    const receiver = state.users.find((item) => Number(item.id) === Number(body.receiverId));
    if (!target || !receiver) return sendJson(res, 404, { error: "离职员工或接收员工不存在" });
    if (Number(target.id) === Number(viewer.id) || Number(target.id) === Number(receiver.id)) return sendJson(res, 400, { error: "请选择其他接收员工" });
    const visible = visibleUsers(state, viewer);
    if (!visible.some((item) => Number(item.id) === Number(target.id)) || !visible.some((item) => Number(item.id) === Number(receiver.id))) {
      return sendJson(res, 403, { error: "员工不在当前管理范围" });
    }
    const transferredIds = [];
    const transferredOpportunityIds = [];
    state.opportunities.forEach((opportunity, opportunityIndex) => {
      if (Number(opportunity.ownerId) !== Number(target.id) || opportunity.lifecycleStatus === LIFECYCLE_ARCHIVED) return;
      const next = assignOpportunity(state, opportunity, receiver, viewer);
      next.ownershipHistory = [
        ...(opportunity.ownershipHistory || []),
        ownershipEvent("offboard_transfer", opportunity, receiver, viewer, "员工离职交接")
      ];
      state.opportunities[opportunityIndex] = next;
      transferredOpportunityIds.push(next.id);
    });
    state.customers.forEach((customer) => {
      if (Number(customer.ownerId) !== Number(target.id) || customer.lifecycleStatus === LIFECYCLE_ARCHIVED) return;
      const previous = { ...customer };
      customer.ownerId = receiver.id;
      customer.owner = receiver.name;
      customer.followPerson = receiver.name;
      customer.unitId = receiver.unitId || "";
      customer.unit = receiver.unit || "";
      customer.zone = receiver.zone || "";
      customer.ownershipHistory = customer.ownershipHistory || [];
      customer.ownershipHistory.push(ownershipEvent("offboard_transfer", previous, receiver, viewer, "员工离职交接"));
      transferredIds.push(customer.id);
    });
    [...new Set(transferredOpportunityIds.map((id) => state.opportunities.find((item) => Number(item.id) === Number(id))?.customerId).filter(Boolean))]
      .forEach((customerId) => syncCustomerCompatibility(state, customerId));
    state.routes.forEach((route) => {
      if (Number(route.ownerId) !== Number(target.id) || route.date < today()) return;
      route.ownerId = receiver.id;
      route.owner = receiver.name;
    });
    target.status = "停用";
    target.authVersion = Number(target.authVersion || 1) + 1;
    target.offboardedAt = new Date().toISOString();
    target.offboardedBy = viewer.name;
    appendSecurityLog(state, { type: "offboard_user", actorId: viewer.id, actorName: viewer.name, targetId: target.id, targetName: target.name, sourceIp: getRequestIp(req), receiverId: receiver.id, receiverName: receiver.name });
    writeState(state);
    return sendJson(res, 200, { ok: true, transferred: transferredIds.length, transferredOpportunities: transferredOpportunityIds.length, user: publicUser(target), receiver: publicUser(receiver) });
  }

  const userDelete = url.pathname.match(/^\/api\/users\/(\d+)$/);
  if (req.method === "DELETE" && userDelete) {
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无员工删除权限" });
    const id = Number(userDelete[1]);
    if (viewer && Number(viewer.id) === id) return sendJson(res, 400, { error: "不能删除当前登录账号" });
    const ownedCustomers = state.customers.filter((customer) => Number(customer.ownerId) === id && customer.lifecycleStatus !== LIFECYCLE_ARCHIVED);
    const ownedOpportunities = state.opportunities.filter((opportunity) => Number(opportunity.ownerId) === id && opportunity.lifecycleStatus !== LIFECYCLE_ARCHIVED);
    if (ownedCustomers.length || ownedOpportunities.length) return sendJson(res, 409, { error: "该员工仍有客户或销售机会，请先执行离职交接", code: "USER_OFFBOARD_REQUIRED", customerCount: ownedCustomers.length, opportunityCount: ownedOpportunities.length });
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

  const unitNodeRoute = url.pathname.match(/^\/api\/units(?:\/([^/]+))?$/);
  if (unitNodeRoute && req.method === "POST" && !unitNodeRoute[1]) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无组织架构管理权限" });
    const parent = unitById(state.units, body.parentId || ORG_ROOT_ID);
    if (!parent) return sendJson(res, 400, { error: "上级组织不存在" });
    const unit = normalizeUnit({
      id: body.id || stableId("unit", body.name || Date.now()),
      name: body.name,
      parentId: parent.id,
      type: body.type || "unit",
      sort: body.sort,
      active: body.active !== false,
      zone: body.zone || parent.zone || body.region
    });
    if (!unit.name) return sendJson(res, 400, { error: "组织名称必填" });
    if (state.units.some((item) => cleanText(item.name) === cleanText(unit.name) && String(item.parentId || "") === String(parent.id))) {
      return sendJson(res, 409, { error: "同级组织已存在" });
    }
    state.units = normalizeUnits([...state.units, unit]);
    writeState(state);
    return sendJson(res, 201, unitById(state.units, unit.id) || unit);
  }

  if (unitNodeRoute && (req.method === "PUT" || req.method === "PATCH") && unitNodeRoute[1]) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无组织架构管理权限" });
    const id = decodeURIComponent(unitNodeRoute[1]);
    const index = state.units.findIndex((unit) => unit.id === id);
    if (index < 0) return sendJson(res, 404, { error: "组织节点不存在" });
    if (id === ORG_ROOT_ID && body.parentId) return sendJson(res, 400, { error: "根节点不能移动" });
    const previous = state.units[index];
    const parentId = body.parentId !== undefined ? String(body.parentId || "") : previous.parentId;
    if (id !== ORG_ROOT_ID) {
      const parent = unitById(state.units, parentId);
      if (!parent) return sendJson(res, 400, { error: "上级组织不存在" });
      if (unitDescendantIds(state.units, id).has(String(parentId))) return sendJson(res, 400, { error: "不能移动到自己的下级组织" });
    }
    const next = normalizeUnit({
      ...previous,
      name: body.name !== undefined ? body.name : previous.name,
      parentId: id === ORG_ROOT_ID ? "" : parentId,
      type: id === ORG_ROOT_ID ? "root" : (body.type || previous.type || "unit"),
      sort: body.sort !== undefined ? body.sort : previous.sort,
      active: body.active !== undefined ? body.active : previous.active,
      zone: body.zone || previous.zone
    });
    if (!next.name) return sendJson(res, 400, { error: "组织名称必填" });
    if (state.units.some((unit) => unit.id !== id && cleanText(unit.name) === cleanText(next.name) && String(unit.parentId || "") === String(next.parentId || ""))) {
      return sendJson(res, 409, { error: "同级组织已存在" });
    }
    state.units[index] = next;
    state.units = normalizeUnits(state.units);
    syncUnitReferences(state, id);
    writeState(state);
    return sendJson(res, 200, unitById(state.units, id) || next);
  }

  if (unitNodeRoute && req.method === "DELETE" && unitNodeRoute[1]) {
    const state = readState();
    const viewer = getAuthUser(req, state);
    if (!canUseAdmin(state, viewer)) return sendJson(res, 403, { error: "无组织架构删除权限" });
    const id = decodeURIComponent(unitNodeRoute[1]);
    if (id === ORG_ROOT_ID) return sendJson(res, 400, { error: "根节点不能删除" });
    const unit = unitById(state.units, id);
    if (!unit) return sendJson(res, 404, { error: "组织节点不存在" });
    const childCount = state.units.filter((item) => String(item.parentId || "") === String(id)).length;
    const userCount = state.users.filter((user) => String(user.unitId || "") === String(id)).length;
    const customerCount = state.customers.filter((customer) => String(customer.unitId || "") === String(id)).length;
    const opportunityCount = state.opportunities.filter((opportunity) => String(opportunity.unitId || "") === String(id)).length;
    const visitCount = state.visits.filter((visit) => String(visit.unitId || "") === String(id)).length;
    if (childCount || userCount || customerCount || opportunityCount || visitCount) {
      return sendJson(res, 409, { error: "该组织仍有关联数据，请先转移或停用", childCount, userCount, customerCount, opportunityCount, visitCount });
    }
    state.units = normalizeUnits(state.units.filter((unit) => unit.id !== id));
    writeState(state);
    return sendJson(res, 200, { ok: true });
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
    const contentType = req.headers["content-type"] || "";
    const multipart = contentType.includes("multipart/form-data") ? await parseMultipart(req) : null;
    const body = multipart ? multipart.fields : await readBody(req);
    const file = multipart?.files?.[0] || null;
    const fileKnowledge = file ? saveKnowledgeFile(file) : null;
    const question = String(body.question || fileKnowledge?.title || "").trim();
    const answer = String(body.answer || "").trim();
    const content = [answer, fileKnowledge?.content || ""].filter(Boolean).join("\n\n").trim();
    if (!question && !content) return sendJson(res, 400, { error: "请填写知识内容或上传文件" });
    const state = readState();
    const item = {
      id: Date.now(),
      question: question || "未命名知识",
      answer,
      content,
      type: fileKnowledge ? "file" : "text",
      fileName: fileKnowledge?.fileName || "",
      fileUrl: fileKnowledge?.fileUrl || "",
      summary: content.replace(/\s+/g, " ").slice(0, 180),
      tags: normalizeKnowledgeTags(body),
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

  const customerAdvice = url.pathname.match(/^\/api\/ai\/customers\/(\d+)\/advice$/);
  if (req.method === "POST" && customerAdvice) {
    const body = await readBody(req);
    const state = readState();
    const viewer = getAuthUser(req, state);
    const selectedOpportunity = state.opportunities.find((item) => Number(item.id) === Number(body.opportunityId));
    const customerId = selectedOpportunity?.customerId || Number(customerAdvice[1]);
    const customer = state.customers.find((item) => Number(item.id) === Number(customerId));
    if (!customer || !canViewRecord(state, viewer, customer)) return sendJson(res, 404, { error: "客户不存在" });
    const opportunity = selectedOpportunity || primaryOpportunity(state, customer.id);
    if (opportunity && isOpportunityPublicPool(opportunity)) return sendJson(res, 409, { error: "请先认领公海销售机会", code: "CUSTOMER_CLAIM_REQUIRED" });
    if (opportunity && !canViewOpportunity(state, viewer, opportunity)) return sendJson(res, 404, { error: "销售机会不存在" });
    const context = buildCustomerAiContext(state, customer, opportunity, viewer);
    const result = await generateStructuredXiaozhiAdvice(body.question || "", state.knowledge || [], context);
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
    opportunities: mergeById(current.opportunities, input.opportunities),
    products: mergeById(current.products, input.products),
    activities: mergeById(current.activities, input.activities),
    visits: mergeById(current.visits, input.visits),
    targets: mergeById(current.targets, input.targets),
    competitors: mergeById(current.competitors, input.competitors),
    channelSources: mergeById(current.channelSources, input.channelSources),
    lossReasons: mergeById(current.lossReasons, input.lossReasons),
    routes: mergeById(current.routes, input.routes),
    geocodeJobs: mergeById(current.geocodeJobs, input.geocodeJobs),
    knowledge: input.knowledge || current.knowledge || [],
    resources: input.resources || current.resources || [],
    securityLogs: current.securityLogs || []
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
      passwordHash: existing?.passwordHash,
      passwordSalt: existing?.passwordSalt,
      authVersion: existing?.authVersion,
      passwordChangeRecommended: existing?.passwordChangeRecommended,
      passwordChangedAt: existing?.passwordChangedAt
    };
    delete next.password;
    delete next.initialPassword;
    const index = merged.findIndex((item) => Number(item.id) === Number(next.id) || cleanAccount(item.account) === cleanAccount(next.account));
    if (index >= 0) merged[index] = next;
    else merged.push(next);
  });
  return merged;
}

function migrateState(state) {
  const source = migrateMoneyToYuan(state);
  const legacyOwnership = !["backend-v4", "backend-v5", "backend-v6", "backend-v7", "backend-v8", "backend-v9"].includes(source.version);
  const roles = normalizeRoles(source.roles || []);
  const units = normalizeUnits(source.units || [], source);
  const competitors = normalizeCompetitors(source.competitors || []);
  const products = normalizeProducts(source.products || []);
  const channelSources = normalizeChannelSources(source.channelSources || []);
  const lossReasons = normalizeLossReasons(source.lossReasons || []);
  const users = ensureSystemAdminUser(normalizeUsers(source.users || [], {
    roles,
    units,
    resetAdminPassword: !["backend-v3", "backend-v4", "backend-v5", "backend-v6", "backend-v7", "backend-v8", "backend-v9"].includes(source.version)
  }), roles, units);
  const activities = source.activities || [];
  const context = { roles, units, users, activities, competitors, products, channelSources, lossReasons, legacyOwnership };
  const customers = (source.customers || []).map((customer) => normalizeCustomer(customer, context));
  const opportunitySource = Array.isArray(source.opportunities) && source.opportunities.length
    ? source.opportunities
    : customers.map((customer) => opportunityFromLegacyCustomer(customer));
  const opportunities = opportunitySource.map((opportunity) => normalizeOpportunity(opportunity, { ...context, customers }));
  const visits = (source.visits || []).map((visit) => normalizeVisit(visit, context));
  linkVisitsToCustomers(customers, visits);
  const migratedState = {
    ...source,
    customers,
    opportunities,
    products
  };
  customers.forEach((customer) => syncCustomerCompatibility(migratedState, customer.id));
  return {
    version: BACKEND_VERSION,
    moneyUnit: MONEY_UNIT,
    moneyMigratedAt: source.moneyMigratedAt || new Date().toISOString(),
    currentUserId: Number(source.currentUserId || users[0]?.id || 0),
    stages: Array.isArray(source.stages) && source.stages.length ? source.stages : STAGES,
    zones: Array.isArray(source.zones) && source.zones.length ? source.zones : ZONES,
    roles,
    units,
    competitors,
    products,
    channelSources,
    lossReasons,
    users,
    customers,
    opportunities,
    activities,
    visits,
    routes: (source.routes || []).map(normalizeRoute),
    geocodeJobs: (source.geocodeJobs || []).map(normalizeGeocodeJob),
    targets: (source.targets || []).map(normalizeTarget),
    knowledge: (source.knowledge || []).map(normalizeKnowledge),
    resources: source.resources || [],
    securityLogs: Array.isArray(source.securityLogs) ? source.securityLogs.slice(-1000) : []
  };
}

function migrateMoneyToYuan(state = {}) {
  if (state.moneyUnit === MONEY_UNIT) return state;
  const convertRecord = (record = {}, fields = MONEY_FIELDS) => {
    const next = { ...record };
    fields.forEach((field) => {
      if (record[field] === undefined || record[field] === null || record[field] === "") return;
      next[field] = multiplyLegacyMoney(record[field]);
    });
    return next;
  };
  return {
    ...state,
    moneyUnit: MONEY_UNIT,
    moneyMigratedAt: new Date().toISOString(),
    customers: (state.customers || []).map((item) => convertRecord(item, ["amount", "quoteAmount", "contractAmount", "paymentAmount"])),
    opportunities: (state.opportunities || []).map((item) => convertRecord(item, ["amount", "quoteAmount", "contractAmount", "paymentAmount"])),
    targets: (state.targets || []).map((item) => convertRecord(item, ["revenueTarget", "contractTarget"]))
  };
}

function multiplyLegacyMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number * LEGACY_MONEY_MULTIPLIER * 100) / 100 : 0;
}

function normalizeProducts(products = []) {
  const merged = DEFAULT_PRODUCTS.map(normalizeProduct);
  (Array.isArray(products) ? products : []).forEach((item) => {
    const normalized = normalizeProduct(item);
    const index = merged.findIndex((entry) => entry.id === normalized.id || cleanText(entry.name) === cleanText(normalized.name));
    if (index >= 0) {
      const hasExplicitSort = item && item.sort !== undefined && item.sort !== null && String(item.sort).trim() !== "";
      merged[index] = { ...merged[index], ...normalized, sort: hasExplicitSort ? normalized.sort : merged[index].sort };
    }
    else merged.push(normalized);
  });
  return merged.sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0) || String(left.name).localeCompare(String(right.name), "zh-Hans-CN"));
}

function normalizeProduct(product = {}) {
  const name = String(product.name || "其他").trim();
  return {
    id: product.id || stableId("product", name),
    name,
    price: normalizeMoney(product.price),
    sort: Number.isFinite(Number(product.sort)) ? Number(product.sort) : 100,
    active: product.active !== false
  };
}

function normalizeChannelSources(sources = []) {
  const incoming = Array.isArray(sources) ? sources : [];
  const base = incoming.length ? [] : CHANNEL_SOURCES.map((name, index) => ({ id: stableId("channel", name), name, sort: index + 1 }));
  const merged = base.map(normalizeChannelSourceItem);
  incoming.forEach((item, index) => {
    const normalized = normalizeChannelSourceItem(typeof item === "string" ? { name: item, sort: CHANNEL_SOURCES.length + index + 1 } : item);
    if (!normalized.name) return;
    const existingIndex = merged.findIndex((entry) => entry.id === normalized.id || cleanText(entry.name) === cleanText(normalized.name));
    if (existingIndex >= 0) merged[existingIndex] = { ...merged[existingIndex], ...normalized, id: merged[existingIndex].id };
    else merged.push(normalized);
  });
  return merged.sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0) || String(left.name).localeCompare(String(right.name), "zh-Hans-CN"));
}

function normalizeChannelSourceItem(item = {}) {
  const name = String(item.name || item.value || item.label || "").trim();
  return {
    id: String(item.id || stableId("channel", name || Date.now())),
    name,
    active: item.active !== false,
    sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : 100
  };
}

function normalizeLossReasons(reasons = []) {
  const incoming = Array.isArray(reasons) ? reasons : [];
  const base = incoming.length ? [] : LOSS_REASONS.map((name, index) => ({ id: stableId("loss-reason", name), name, sort: index + 1 }));
  const merged = base.map(normalizeLossReasonItem);
  incoming.forEach((item, index) => {
    const normalized = normalizeLossReasonItem(typeof item === "string" ? { name: item, sort: LOSS_REASONS.length + index + 1 } : item);
    if (!normalized.name) return;
    const existingIndex = merged.findIndex((entry) => entry.id === normalized.id || cleanText(entry.name) === cleanText(normalized.name));
    if (existingIndex >= 0) merged[existingIndex] = { ...merged[existingIndex], ...normalized, id: merged[existingIndex].id };
    else merged.push(normalized);
  });
  return merged.sort((left, right) => Number(left.sort || 100) - Number(right.sort || 100));
}

function normalizeLossReasonItem(item = {}) {
  const name = String(item.name || item.value || item.label || "").trim();
  return {
    id: String(item.id || stableId("loss-reason", name || Date.now())),
    name,
    active: item.active !== false,
    sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : 100
  };
}

function channelSourceNames(sources = CHANNEL_SOURCES, options = {}) {
  const list = Array.isArray(sources) ? sources : CHANNEL_SOURCES;
  const names = list
    .filter((item) => typeof item === "string" || options.includeInactive || item.active !== false)
    .map((item) => String(typeof item === "string" ? item : item.name || "").trim())
    .filter(Boolean);
  return [...new Set([...CHANNEL_SOURCES, ...names])];
}

function channelSourceKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s\u00a0\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f\u3000\ufeff]+/g, "")
    .toLowerCase();
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
  const id = role.id || stableId("role", name);
  const customerScope = ["self", "unit", "zone", "all"].includes(role.customerScope) ? role.customerScope : "self";
  let permissions = Array.isArray(role.permissions) && role.permissions.length ? role.permissions : DEFAULT_PERMISSIONS;
  const isOpsRole = id === "role-ops" || name === "运营";
  const isAdminRole = ["role-owner", "role-admin"].includes(id) || ["总负责人", "管理员"].includes(name);
  if (isOpsRole) permissions = permissions.filter((permission) => permission !== "admin");
  if (isOpsRole || isAdminRole) permissions = [...permissions, PUBLIC_POOL_IMPORT_PERMISSION];
  return {
    id,
    name,
    customerScope,
    permissions: [...new Set(permissions)]
  };
}

function normalizeUnits(units) {
  const merged = new Map(DEFAULT_UNITS.map((unit) => [unit.id, normalizeUnit(unit)]));
  const sources = (Array.isArray(units) ? units : []).filter((unit) => unit && unit.name && !LEGACY_DEMO_UNIT_IDS.has(unit.id));
  sources.forEach((unit) => {
    const normalized = normalizeUnit(unit);
    if (!normalized.name) return;
    if (!normalized.parentId && normalized.id !== ORG_ROOT_ID) {
      normalized.parentId = zoneUnitId(normalized.zone) || ORG_WAR_ID;
    }
    if (merged.has(normalized.id)) {
      merged.set(normalized.id, { ...merged.get(normalized.id), ...normalized });
      return;
    }
    const duplicate = [...merged.values()].find((item) => cleanText(item.name) === cleanText(normalized.name) && String(item.parentId || "") === String(normalized.parentId || ""));
    if (duplicate) merged.set(duplicate.id, { ...duplicate, ...normalized, id: duplicate.id });
    else merged.set(normalized.id, normalized);
  });
  return buildUnitHierarchy([...merged.values()]);
}

function normalizeUnit(unit = {}) {
  const name = String(unit.name || unit.unit || unit.region || "").trim();
  const type = ORG_TYPES.includes(unit.type) ? unit.type : (unit.parentId ? "unit" : "unit");
  return {
    id: String(unit.id || stableId("unit", name || Date.now())),
    name,
    parentId: unit.id === ORG_ROOT_ID ? "" : String(unit.parentId || ""),
    type,
    level: Number(unit.level || 0),
    path: unit.path || name,
    zone: unit.zone || (type === "battle_zone" ? name : normalizeZone(unit.region || unit.zone || name)),
    sort: Number.isFinite(Number(unit.sort)) ? Number(unit.sort) : 100,
    active: unit.active !== false
  };
}

function buildUnitHierarchy(units = []) {
  const map = new Map(units.map((unit) => [String(unit.id), { ...unit }]));
  if (!map.has(ORG_ROOT_ID)) map.set(ORG_ROOT_ID, normalizeUnit(DEFAULT_UNITS[0]));
  map.forEach((unit) => {
    if (unit.id === ORG_ROOT_ID) {
      unit.parentId = "";
      unit.type = "root";
      unit.zone = "";
      return;
    }
    if (!unit.parentId || !map.has(unit.parentId) || unit.parentId === unit.id) unit.parentId = ORG_ROOT_ID;
  });
  const children = new Map();
  map.forEach((unit) => {
    if (!children.has(unit.parentId)) children.set(unit.parentId, []);
    children.get(unit.parentId).push(unit);
  });
  const result = [];
  const visit = (unit, ancestry = []) => {
    const parentPath = ancestry.map((item) => item.name).filter(Boolean);
    const zoneAncestor = [...ancestry, unit].find((item) => item.type === "battle_zone");
    const next = {
      ...unit,
      level: ancestry.length,
      path: [...parentPath, unit.name].filter(Boolean).join(" / "),
      zone: unit.type === "root" ? "" : (zoneAncestor?.zone || (unit.type === "battle_zone" ? unit.name : ""))
    };
    result.push(next);
    (children.get(unit.id) || [])
      .sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0) || String(left.name).localeCompare(String(right.name), "zh-Hans-CN"))
      .forEach((child) => visit(child, [...ancestry, next]));
  };
  visit(map.get(ORG_ROOT_ID), []);
  map.forEach((unit) => {
    if (!result.some((item) => item.id === unit.id)) visit(unit, []);
  });
  return result;
}

function normalizeCompetitors(competitors = []) {
  const merged = DEFAULT_COMPETITORS.map(normalizeCompetitor);
  (Array.isArray(competitors) ? competitors : []).forEach((item) => {
    const normalized = normalizeCompetitor(item);
    const index = merged.findIndex((entry) => entry.id === normalized.id || cleanText(entry.name) === cleanText(normalized.name));
    if (index >= 0) merged[index] = { ...merged[index], ...normalized };
    else merged.push(normalized);
  });
  return merged;
}

function normalizeCompetitor(item = {}) {
  const name = String(item.name || "其他").trim();
  return {
    id: item.id || stableId("competitor", name),
    name,
    color: /^#[0-9a-f]{6}$/i.test(String(item.color || "")) ? item.color : "#64748b",
    active: item.active !== false
  };
}

function normalizeRoute(item = {}) {
  return {
    id: item.id || stableId("route", `${item.ownerId || "owner"}-${item.date || today()}`),
    ownerId: Number(item.ownerId || 0) || "",
    owner: item.owner || "",
    date: item.date || today(),
    stops: (Array.isArray(item.stops) ? item.stops : []).slice(0, 12).map((stop, index) => ({
      customerId: Number(stop.customerId || stop.id || 0),
      name: stop.name || stop.factory || "",
      latitude: Number(stop.latitude || 0),
      longitude: Number(stop.longitude || 0),
      address: stop.address || "",
      order: Number(stop.order || index + 1),
      completed: Boolean(stop.completed),
      completedAt: stop.completedAt || ""
    })),
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function normalizeGeocodeJob(item = {}) {
  return {
    id: item.id || stableId("geocode", `${item.customerId}-${item.address}`),
    customerId: Number(item.customerId || 0),
    address: String(item.address || "").trim(),
    status: ["pending", "processing", "resolved", "failed"].includes(item.status) ? item.status : "pending",
    attempts: Number(item.attempts || 0),
    error: item.error || "",
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function linkVisitsToCustomers(customers, visits) {
  const byId = new Map(customers.map((customer) => [Number(customer.id), customer]));
  const byPhone = new Map(customers.map((customer) => [normalizePhone(customer.phoneNormalized || customer.phone), customer]).filter(([phone]) => phone));
  visits.forEach((visit) => {
    const customer = byId.get(Number(visit.customerId)) || byPhone.get(normalizePhone(visit.phone));
    if (!customer) return;
    visit.customerId = customer.id;
  });
  customers.forEach((customer) => {
    const history = visits.filter((visit) => Number(visit.customerId) === Number(customer.id)).sort(sortByNewest);
    const latestLocated = history.find((visit) => Number(visit.latitude) && Number(visit.longitude));
    if (latestLocated && customer.location?.status !== "resolved") {
      customer.location = normalizeLocation({
        latitude: latestLocated.latitude,
        longitude: latestLocated.longitude,
        city: latestLocated.city,
        address: latestLocated.address,
        status: "resolved",
        resolvedAt: latestLocated.date
      }, customer);
    }
    if (history[0]) customer.lastVisitedAt = customer.lastVisitedAt || history[0].date;
  });
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
  const isHiddenDemo = HIDDEN_DEMO_USERS.has(account) && ["林晨", "周扬"].includes(name);
  const defaultPassword = account === "admin" || ADMIN_ROLES.includes(roleDef.name) ? DEFAULT_ADMIN_PASSWORD : "123456";
  const storedPassword = String(user.password || user.initialPassword || defaultPassword);
  const migrationPassword = account === "admin" && context.resetAdminPassword ? DEFAULT_ADMIN_PASSWORD : storedPassword;
  const credentials = user.passwordHash && user.passwordSalt
    ? { passwordHash: String(user.passwordHash), passwordSalt: String(user.passwordSalt) }
    : hashPassword(migrationPassword);
  return {
    id,
    name,
    phone: user.phone || "",
    account,
    username: account,
    ...credentials,
    authVersion: Math.max(1, Number(user.authVersion || 1)),
    passwordChangeRecommended: user.passwordChangeRecommended === undefined ? true : Boolean(user.passwordChangeRecommended),
    passwordChangedAt: user.passwordChangedAt || "",
    role: roleDef.name,
    roleId: roleDef.id,
    unitId: unit.id,
    unit: unit.name || user.unit || user.region || "待分配",
    zone: unit.id ? (unit.zone || "") : normalizeZone(user.zone || user.region || user.unit),
    region: unit.id ? (unit.zone || unit.name || "待分区") : (user.region || "待分区"),
    orgPath: unit.path || user.orgPath || unit.name || "",
    status: isHiddenDemo ? "停用" : (user.status || "启用"),
    createdAt: user.createdAt || today()
  };
}

function ensureSystemAdminUser(users = [], roles = DEFAULT_ROLES, units = DEFAULT_UNITS) {
  const adminRole = findRole(roles, "role-admin", "管理员");
  const adminUnit = unitById(units, ORG_STAFF_ID) || unitById(units, ORG_ROOT_ID) || units[0] || {};
  const index = users.findIndex((user) => cleanAccount(user.account || user.username || user.phone) === "admin");
  if (index >= 0) {
    users[index] = applyUnitToUser({
      ...users[index],
      name: users[index].name === "运营小组" ? "管理员" : (users[index].name || "管理员"),
      role: adminRole.name,
      roleId: adminRole.id,
      status: users[index].status || "启用"
    }, adminUnit);
    return users;
  }
  users.unshift(normalizeUser({
    id: Math.max(0, ...users.map((user) => Number(user.id || 0))) + 1,
    name: "管理员",
    account: "admin",
    phone: "admin",
    password: DEFAULT_ADMIN_PASSWORD,
    role: adminRole.name,
    roleId: adminRole.id,
    unitId: adminUnit.id,
    unit: adminUnit.name,
    region: adminUnit.zone || adminUnit.name,
    status: "启用"
  }, 0, { roles, units }));
  return users;
}

function normalizeKnowledge(item = {}, index = 0) {
  const answer = String(item.answer || "").trim();
  const content = String(item.content || answer).trim();
  return {
    ...item,
    id: Number(item.id || Date.now() + index),
    question: String(item.question || item.title || item.fileName || `知识${index + 1}`).trim(),
    answer,
    content,
    summary: String(item.summary || content || answer).replace(/\s+/g, " ").slice(0, 180),
    type: item.type || (item.fileName ? "file" : "text"),
    fileName: item.fileName || "",
    fileUrl: item.fileUrl || "",
    tags: normalizeKnowledgeTags(item.tags || item),
    createdAt: item.createdAt || today()
  };
}

function normalizeKnowledgeTags(input = {}) {
  const parse = (value) => Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : String(value || "").split(/[,，;；]/).map((item) => item.trim()).filter(Boolean);
  return {
    productModules: parse(input.productModules || input.productModule),
    salesStages: parse(input.salesStages || input.salesStage),
    customerRoles: parse(input.customerRoles || input.customerRole),
    competitors: parse(input.competitors || input.competitor),
    objectionTypes: parse(input.objectionTypes || input.objectionType)
  };
}

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0;
}

function formatMoneyYuan(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: Number(value || 0) % 1 ? 2 : 0,
    maximumFractionDigits: 2
  }).format(normalizeMoney(value));
}

function normalizeIncomingMoneyPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const inputMoneyUnit = payload.moneyUnit === MONEY_UNIT ? MONEY_UNIT : "wan";
  const next = { ...payload, moneyUnit: MONEY_UNIT, inputMoneyUnit };
  MONEY_FIELDS.forEach((field) => {
    if (payload[field] === undefined || payload[field] === null || payload[field] === "") return;
    next[field] = inputMoneyUnit === MONEY_UNIT ? normalizeMoney(payload[field]) : multiplyLegacyMoney(payload[field]);
  });
  return next;
}

function normalizeTarget(item = {}) {
  const scopeType = ["company", "zone", "unit", "user"].includes(item.scopeType) ? item.scopeType : "user";
  const target = {
    id: item.id || stableId("target", `${normalizeMonth(item.month)}-${scopeType}-${item.scopeId || "company"}`),
    month: normalizeMonth(item.month),
    scopeType,
    scopeId: scopeType === "company" ? "company" : String(item.scopeId || ""),
    scopeName: item.scopeName || (scopeType === "company" ? "全公司" : ""),
    updatedBy: item.updatedBy || "",
    updatedAt: item.updatedAt || ""
  };
  TARGET_FIELDS.forEach((field) => { target[field] = normalizeMoney(item[field]); });
  return target;
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
    { id: stableId("unit", name || "待分配"), name: name || "待分配", zone: normalizeZone(name), parentId: zoneUnitId(normalizeZone(name)) || ORG_WAR_ID, path: name || "待分配", level: 0, active: true, type: "unit" }
  );
}

function zoneUnitId(zone) {
  return ORG_ZONE_IDS[normalizeZone(zone)] || "";
}

function unitById(units = [], unitId) {
  if ((units || []) === stateCache?.units && stateIndexes.unitsById.size === (units || []).length) {
    const index = stateIndexes.unitsById.get(String(unitId));
    return index === undefined ? null : (units || [])[index] || null;
  }
  return (units || []).find((unit) => String(unit.id) === String(unitId)) || null;
}

function unitDescendantIds(units = [], unitId) {
  const root = unitById(units, unitId);
  if (!root) return new Set();
  const ids = new Set([String(root.id)]);
  let changed = true;
  while (changed) {
    changed = false;
    (units || []).forEach((unit) => {
      if (!ids.has(String(unit.id)) && ids.has(String(unit.parentId || ""))) {
        ids.add(String(unit.id));
        changed = true;
      }
    });
  }
  return ids;
}

function battleZoneUnitForUser(units = [], user = {}) {
  const unit = unitById(units, user.unitId);
  if (unit) {
    const pathIds = [];
    let cursor = unit;
    while (cursor && cursor.id) {
      pathIds.push(String(cursor.id));
      cursor = unitById(units, cursor.parentId);
    }
    const zoneUnit = pathIds.map((id) => unitById(units, id)).find((item) => item?.type === "battle_zone");
    if (zoneUnit) return zoneUnit;
  }
  const fallbackId = zoneUnitId(user.zone || user.region || user.unit);
  return fallbackId ? unitById(units, fallbackId) : null;
}

function managedOrgUnitIds(state, viewer = {}) {
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  if (role.customerScope === "all") return new Set((state.units || []).map((unit) => String(unit.id)));
  if (role.customerScope === "unit") return unitDescendantIds(state.units || [], viewer.unitId);
  if (role.customerScope === "zone") {
    const zoneUnit = battleZoneUnitForUser(state.units || [], viewer);
    if (zoneUnit) return unitDescendantIds(state.units || [], zoneUnit.id);
    const zone = viewer.zone || normalizeZone(viewer.region || viewer.unit);
    return new Set((state.units || []).filter((unit) => unit.zone === zone).map((unit) => String(unit.id)));
  }
  return new Set();
}

function applyUnitToUser(user = {}, unit = {}) {
  return {
    ...user,
    unitId: unit.id || "",
    unit: unit.name || user.unit || "待分配",
    zone: unit.id ? (unit.zone || "") : normalizeZone(user.zone || user.region || unit.name),
    region: unit.id ? (unit.zone || unit.name || "待分区") : (user.region || "待分区"),
    orgPath: unit.path || unit.name || ""
  };
}

function syncUnitReferences(state, unitId) {
  const unit = unitById(state.units || [], unitId);
  if (!unit) return;
  const applyRecordUnit = (record) => {
    if (String(record.unitId || "") !== String(unitId)) return;
    record.unit = unit.name || record.unit || "";
    record.zone = unit.zone || "";
    record.region = unit.zone || unit.name || record.region || "";
    record.orgPath = unit.path || record.orgPath || "";
  };
  state.users = (state.users || []).map((user) => String(user.unitId || "") === String(unitId) ? applyUnitToUser(user, unit) : user);
  (state.customers || []).forEach(applyRecordUnit);
  (state.opportunities || []).forEach(applyRecordUnit);
  (state.visits || []).forEach(applyRecordUnit);
  (state.routes || []).forEach(applyRecordUnit);
}

function findUser(users = [], userId, userName) {
  if ((users || []) === stateCache?.users && stateIndexes.usersById.size === (users || []).length) {
    const byId = stateIndexes.usersById.get(Number(userId));
    if (byId !== undefined && users[byId]) return users[byId];
    const byAccount = stateIndexes.usersByAccount.get(cleanAccount(userName));
    if (byAccount !== undefined && users[byAccount]) return users[byAccount];
  }
  return users.find((user) => Number(user.id) === Number(userId)) || users.find((user) => cleanText(user.name) === cleanText(userName)) || {};
}

function findCustomer(customers = [], customerId) {
  if ((customers || []) === stateCache?.customers && stateIndexes.customersById.size === (customers || []).length) {
    const index = stateIndexes.customersById.get(Number(customerId));
    return index === undefined ? null : customers[index] || null;
  }
  return (customers || []).find((item) => Number(item.id) === Number(customerId)) || null;
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
    ? customer.followUps.map((item) => normalizeFollowUp(item, customer))
    : [
        normalizeFollowUp({
          date: customer.lastFollow || customer.createdAt || today(),
          author: customer.createdBy || customer.owner || "历史数据",
          note: customer.lastNote || "新增客户。",
          nextFollow: customer.nextFollow || ""
        }, customer)
      ];
  const createdAt = customer.createdAt || today();
  const stageTimes = normalizeStageTimes(customer, context.activities || [], createdAt);
  const owner = customer.owner || ownerUser.name || "林晨";
  const ownerId = customer.ownerId || ownerUser.id || "";
  const ownershipStatus = [OWNERSHIP_PENDING, OWNERSHIP_LOCKED, OWNERSHIP_PUBLIC].includes(customer.ownershipStatus)
    ? customer.ownershipStatus
    : OWNERSHIP_LOCKED;
  const contacts = normalizeContacts(customer.contacts || [], customer);
  const primaryContact = contacts.find((item) => item.isPrimary) || contacts[0] || {};
  const competitorProfiles = normalizeCompetitorProfiles(customer.competitorProfiles || [], context.competitors || DEFAULT_COMPETITORS, customer.software);
  const primarySoftware = displaySoftwareName((competitorProfiles.find((item) => item.isPrimary) || competitorProfiles[0] || {}).brand || customer.software);
  const location = normalizeLocation(customer.location || {}, customer);
  const city = location.city || customer.city || extractCity(customer.address) || "待识别";
  return {
    id: Number(customer.id || Date.now()),
    name: customer.name || "",
    phone: primaryContact.phone || customer.phone || "待补充",
    phoneNormalized: primaryContact.phoneNormalized || normalizePhone(customer.phoneNormalized || customer.phone),
    contacts,
    channelSource: normalizeChannelSource(customer.channelSource || customer.source || customer.channel, context.channelSources || CHANNEL_SOURCES),
    createdBy: customer.createdBy || customer.inputBy || customer.creator || customer.owner || ownerUser.name || "未记录",
    followPerson: customer.followPerson || customer.followOwner || customer.owner || ownerUser.name || "未分配",
    address: customer.address || customer.customerAddress || "",
    city,
    stage: customer.stage || "名单",
    owner,
    ownerId,
    unitId: customer.unitId || ownerUser.unitId || unit.id || "",
    unit: customer.unit || ownerUser.unit || unit.name || "",
    zone: customer.zone || ownerUser.zone || unit.zone || normalizeZone(customer.region),
    orgPath: customer.orgPath || ownerUser.orgPath || unit.path || "",
    region: customer.region || ownerUser.zone || unit.zone || "待分区",
    amount: Number(customer.amount || DEFAULT_EXPECTED_AMOUNT),
    demoAt: customer.demoAt || customer.effectiveDemoAt || "",
    quoteAmount: normalizeMoney(customer.quoteAmount),
    expectedDealDate: customer.expectedDealDate || "",
    contractAmount: normalizeMoney(customer.contractAmount),
    paymentAmount: normalizeMoney(customer.paymentAmount),
    paymentDate: customer.paymentDate || "",
    paymentOwnerId: customer.paymentOwnerId || (customer.paymentAmount ? ownerId : ""),
    paymentOwner: customer.paymentOwner || (customer.paymentAmount ? owner : ""),
    lossReason: customer.lossReason || "",
    lossReasonDetail: customer.lossReasonDetail || customer.functionLossReason || customer.lossReasonSpecific || "",
    software: primarySoftware,
    competitorProfiles,
    location: { ...location, city: location.city || (city === "待识别" ? "" : city) },
    lifecycleStatus: customer.lifecycleStatus === LIFECYCLE_ARCHIVED ? LIFECYCLE_ARCHIVED : LIFECYCLE_ACTIVE,
    archiveReason: customer.archiveReason || "",
    archivedAt: customer.archivedAt || "",
    archivedBy: customer.archivedBy || "",
    lastVisitedAt: customer.lastVisitedAt || "",
    photos: normalizePhotos(customer.photos || customer.visitPhotos),
    createdAt,
    ownershipStatus: context.legacyOwnership ? OWNERSHIP_LOCKED : ownershipStatus,
    claimUntil: context.legacyOwnership ? "" : (customer.claimUntil || ""),
    effectiveFollowUpAt: context.legacyOwnership ? (customer.effectiveFollowUpAt || createdAt) : (customer.effectiveFollowUpAt || ""),
    publicPoolAt: context.legacyOwnership ? "" : (customer.publicPoolAt || ""),
    publicPoolReason: context.legacyOwnership ? "" : (customer.publicPoolReason || ""),
    ownershipHistory: Array.isArray(customer.ownershipHistory) ? customer.ownershipHistory : [],
    ...stageTimes,
    followUps
  };
}

function opportunityFromLegacyCustomer(customer = {}) {
  const productName = customer.stage === "成交" ? "历史成交产品（待补充）" : "待确认产品";
  return {
    id: legacyOpportunityId(customer.id),
    customerId: customer.id,
    productId: stableId("product", productName),
    productName,
    stage: customer.stage || "名单",
    owner: customer.owner,
    ownerId: customer.ownerId,
    followPerson: customer.followPerson,
    unitId: customer.unitId,
    unit: customer.unit,
    zone: customer.zone,
    region: customer.region,
    createdBy: customer.createdBy,
    createdAt: customer.createdAt,
    amount: customer.amount,
    demoAt: customer.demoAt,
    quoteAmount: customer.quoteAmount,
    expectedDealDate: customer.expectedDealDate,
    contractAmount: customer.contractAmount,
    paymentAmount: customer.paymentAmount,
    paymentDate: customer.paymentDate,
    paymentOwnerId: customer.paymentOwnerId,
    paymentOwner: customer.paymentOwner,
    lossReason: customer.lossReason,
    lossReasonDetail: customer.lossReasonDetail,
    ownershipStatus: customer.ownershipStatus,
    claimUntil: customer.claimUntil,
    effectiveFollowUpAt: customer.effectiveFollowUpAt,
    publicPoolAt: customer.publicPoolAt,
    publicPoolReason: customer.publicPoolReason,
    ownershipHistory: customer.ownershipHistory,
    leadAt: customer.leadAt,
    opportunityAt: customer.opportunityAt,
    dealAt: customer.dealAt,
    followUps: customer.followUps
  };
}

function legacyOpportunityId(customerId) {
  const numeric = Number(customerId || 0);
  return Number.isSafeInteger(numeric * 1000 + 1) ? numeric * 1000 + 1 : Date.now();
}

function normalizeOpportunity(opportunity = {}, context = {}) {
  const customer = findCustomer(Array.isArray(context.customers) ? context.customers : [], opportunity.customerId) || {};
  const ownerUser = findUser(context.users || [], opportunity.ownerId, opportunity.owner || customer.owner);
  const product = resolveProduct({ products: context.products || DEFAULT_PRODUCTS }, opportunity.productId, opportunity.productName) || {
    id: opportunity.productId || stableId("product", opportunity.productName || "待确认产品"),
    name: opportunity.productName || "待确认产品"
  };
  const createdAt = opportunity.createdAt || customer.createdAt || today();
  const followUps = Array.isArray(opportunity.followUps)
    ? opportunity.followUps.map((item) => normalizeFollowUp(item, opportunity))
    : [normalizeFollowUp({ date: createdAt, author: opportunity.createdBy || ownerUser.name || "历史数据", note: "新增销售机会。", isSystem: true }, opportunity)];
  const latest = followUps[followUps.length - 1] || {};
  const stage = STAGES.includes(opportunity.stage) ? opportunity.stage : "名单";
  return {
    id: Number(opportunity.id || Date.now()),
    customerId: Number(opportunity.customerId || customer.id || 0),
    productId: product.id,
    productName: product.name,
    stage,
    owner: opportunity.owner || ownerUser.name || customer.owner || "未分配",
    ownerId: opportunity.ownerId || ownerUser.id || customer.ownerId || "",
    followPerson: opportunity.followPerson || opportunity.owner || ownerUser.name || customer.followPerson || "未分配",
    unitId: opportunity.unitId || ownerUser.unitId || customer.unitId || "",
    unit: opportunity.unit || ownerUser.unit || customer.unit || "",
    zone: opportunity.zone || ownerUser.zone || customer.zone || "",
    orgPath: opportunity.orgPath || ownerUser.orgPath || customer.orgPath || "",
    region: opportunity.region || customer.region || "待分区",
    createdBy: opportunity.createdBy || customer.createdBy || ownerUser.name || "未记录",
    createdAt,
    amount: normalizeMoney(opportunity.amount) || normalizeMoney(customer.amount) || normalizeMoney(product.price) || DEFAULT_EXPECTED_AMOUNT,
    demoAt: opportunity.demoAt || "",
    quoteAmount: normalizeMoney(opportunity.quoteAmount),
    expectedDealDate: opportunity.expectedDealDate || "",
    contractAmount: normalizeMoney(opportunity.contractAmount),
    paymentAmount: normalizeMoney(opportunity.paymentAmount),
    paymentDate: opportunity.paymentDate || "",
    paymentOwnerId: opportunity.paymentOwnerId || (opportunity.paymentAmount ? opportunity.ownerId || ownerUser.id : ""),
    paymentOwner: opportunity.paymentOwner || (opportunity.paymentAmount ? opportunity.owner || ownerUser.name : ""),
    lossReason: opportunity.lossReason || "",
    lossReasonDetail: opportunity.lossReasonDetail || opportunity.functionLossReason || opportunity.lossReasonSpecific || "",
    outcomeStatus: [OUTCOME_ACTIVE, OUTCOME_PURCHASED].includes(opportunity.outcomeStatus) ? opportunity.outcomeStatus : OUTCOME_ACTIVE,
    purchasedInfo: normalizePurchasedInfo(opportunity.purchasedInfo || {}),
    rollbackHistory: Array.isArray(opportunity.rollbackHistory) ? opportunity.rollbackHistory : [],
    nextFollow: latest.nextFollow || opportunity.nextFollow || "",
    ownershipStatus: [OWNERSHIP_PENDING, OWNERSHIP_LOCKED, OWNERSHIP_PUBLIC, OWNERSHIP_CLAIMABLE].includes(opportunity.ownershipStatus)
      ? opportunity.ownershipStatus
      : OWNERSHIP_LOCKED,
    claimUntil: opportunity.claimUntil || "",
    effectiveFollowUpAt: opportunity.effectiveFollowUpAt || "",
    publicPoolAt: opportunity.publicPoolAt || "",
    publicPoolReason: opportunity.publicPoolReason || "",
    ownershipHistory: Array.isArray(opportunity.ownershipHistory) ? opportunity.ownershipHistory : [],
    leadAt: opportunity.leadAt || (STAGES.indexOf(stage) >= 1 ? latest.date || createdAt : ""),
    opportunityAt: opportunity.opportunityAt || (STAGES.indexOf(stage) >= 2 ? latest.date || createdAt : ""),
    dealAt: opportunity.dealAt || (stage === "成交" ? latest.date || createdAt : ""),
    followUps
  };
}

function normalizePurchasedInfo(value = {}) {
  return {
    product: String(value.product || value.productName || "").trim(),
    brand: String(value.brand || value.software || "").trim(),
    purchasedAt: String(value.purchasedAt || value.date || "").slice(0, 10),
    revisitAt: String(value.revisitAt || value.nextOpportunityAt || "").slice(0, 10),
    note: String(value.note || value.remark || "").trim()
  };
}

function primaryOpportunity(state, customerId) {
  const items = (state.opportunities || []).filter((item) => Number(item.customerId) === Number(customerId));
  return items.find((item) => item.stage !== "成交" && !isOpportunityPublicPool(item) && !isPurchasedOpportunity(item))
    || items.find((item) => item.stage !== "成交" && !isPurchasedOpportunity(item))
    || items.find((item) => isPurchasedOpportunity(item))
    || items.slice().sort((a, b) => String(b.dealAt || b.createdAt).localeCompare(String(a.dealAt || a.createdAt)))[0]
    || null;
}

function syncCustomerCompatibility(state, customerId) {
  const customer = findCustomer(state.customers || [], customerId);
  const opportunity = primaryOpportunity(state, customerId);
  if (!customer || !opportunity) return customer;
  ["stage", "owner", "ownerId", "followPerson", "unitId", "unit", "zone", "region", "orgPath", "amount", "demoAt", "quoteAmount", "expectedDealDate", "contractAmount", "paymentAmount", "paymentDate", "paymentOwnerId", "paymentOwner", "lossReason", "lossReasonDetail", "outcomeStatus", "purchasedInfo", "rollbackHistory", "ownershipStatus", "claimUntil", "effectiveFollowUpAt", "publicPoolAt", "publicPoolReason", "ownershipHistory", "leadAt", "opportunityAt", "dealAt", "followUps"].forEach((field) => {
    customer[field] = opportunity[field];
  });
  return customer;
}

function opportunityView(state, opportunity) {
  const customer = findCustomer(state.customers || [], opportunity.customerId) || {};
  const latest = (opportunity.followUps || [])[opportunity.followUps.length - 1] || {};
  const publicPool = opportunityPublicPoolInfo(opportunity);
  return {
    ...customer,
    ...opportunity,
    id: opportunity.id,
    customerId: customer.id,
    opportunityId: opportunity.id,
    name: customer.name || "",
    phone: customer.phone || "",
    phoneNormalized: customer.phoneNormalized || "",
    contacts: customer.contacts || [],
    channelSource: customer.channelSource || "其他",
    address: customer.address || "",
    city: customer.city || customer.location?.city || extractCity(customer.address) || "待识别",
    software: displaySoftwareName(primaryCompetitorName(customer) || customer.software),
    competitorProfiles: customer.competitorProfiles || [],
    photos: customer.photos || [],
    location: customer.location || {},
    lifecycleStatus: customer.lifecycleStatus || LIFECYCLE_ACTIVE,
    ownershipStatus: publicPool.isPublic ? OWNERSHIP_PUBLIC : opportunity.ownershipStatus,
    publicPoolAt: publicPool.at,
    publicPoolReason: publicPool.reason,
    claimable: publicPool.isPublic,
    claimDaysRemaining: opportunity.ownershipStatus === OWNERSHIP_PENDING ? claimDaysRemaining(opportunity.claimUntil) : 0,
    lastFollow: latest.date || "",
    nextFollow: latest.nextFollow || opportunity.nextFollow || "",
    lastNote: latest.note || "",
    followUps: (opportunity.followUps || []).map((item) => normalizeFollowUp(item, opportunity))
  };
}

function resolveProduct(state, productId, productName) {
  const products = state.products || DEFAULT_PRODUCTS;
  return products.find((item) => productId && item.id === productId)
    || products.find((item) => productName && cleanText(item.name) === cleanText(productName))
    || (productName ? normalizeProduct({ id: stableId("product", productName), name: productName }) : null);
}

function isPlaceholderProductName(productName = "") {
  return !String(productName || "").trim() || cleanText(productName) === cleanText("待确认产品");
}

function resolveSelectableProduct(state, productId, productName) {
  const products = (state.products || DEFAULT_PRODUCTS).filter((item) => item.active !== false && !isPlaceholderProductName(item.name));
  return products.find((item) => productId && item.id === productId)
    || products.find((item) => productName && cleanText(item.name) === cleanText(productName))
    || null;
}

function hasActiveProductOpportunity(state, customerId, productId, excludeOpportunityId = 0) {
  return (state.opportunities || []).some((item) => Number(item.customerId) === Number(customerId)
    && item.productId === productId
    && item.stage !== "成交"
    && !isPurchasedOpportunity(item)
    && Number(item.id) !== Number(excludeOpportunityId));
}

function resolveOpportunityOwner(state, viewer, customer, body = {}) {
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  if (role.customerScope === "self") return { user: viewer };
  let requested = findUser(state.users, body.ownerId, body.owner);
  if (!requested.id) requested = findUser(state.users, customer.ownerId, customer.owner);
  if (!requested.id) requested = viewer;
  const visible = visibleUsers(state, viewer).find((item) => Number(item.id) === Number(requested.id));
  if (!visible) return { error: "不能将销售机会分配到权限范围外", status: 403 };
  if (!canOwnCustomerUser(state, visible)) return { error: "请选择销售、主管或区域经理作为跟进人", status: 400 };
  return { user: visible };
}

function validateOpportunityBusinessUpdate(previous = {}, body = {}) {
  const nextStage = body.stage || previous.stage || "名单";
  const stageChanged = nextStage !== previous.stage;
  const demoAt = body.demoAt !== undefined ? body.demoAt : previous.demoAt;
  const contractAmount = body.contractAmount !== undefined ? normalizeMoney(body.contractAmount) : normalizeMoney(previous.contractAmount);
  const paymentAmount = body.paymentAmount !== undefined ? normalizeMoney(body.paymentAmount) : normalizeMoney(previous.paymentAmount);
  const paymentDate = body.paymentDate !== undefined ? body.paymentDate : previous.paymentDate;
  if (stageChanged && STAGES.indexOf(nextStage) >= STAGES.indexOf("商机") && !demoAt) return "进入商机前必须填写有效演示时间";
  if (stageChanged && nextStage === "成交" && contractAmount <= 0) return "进入成交前必须填写合同金额";
  if (paymentAmount > 0 && !paymentDate) return "填写实际进款后必须选择进款日期";
  if (paymentDate && paymentAmount <= 0) return "填写进款日期前必须填写实际进款金额";
  return "";
}

function validateOpportunityAdvance(previous = {}, nextStage, body = {}) {
  const note = String(body.note || "").trim();
  if (!note) return { error: "请填写本次跟进内容", field: "note" };
  if (nextStage === "商机" && !String(body.demoAt || previous.demoAt || "").trim()) {
    return { error: "请填写有效演示日期", field: "demoAt" };
  }
  if (nextStage === "成交" && normalizeMoney(body.contractAmount ?? previous.contractAmount) <= 0) {
    return { error: "请填写合同金额", field: "contractAmount" };
  }
  if (nextStage === "成交" && !Number(body.paymentOwnerId || previous.paymentOwnerId)) {
    return { error: "请选择业绩归属人", field: "paymentOwnerId" };
  }
  if (nextStage !== "成交" && !String(body.nextFollow || "").trim()) {
    return { error: "请选择下次跟进时间", field: "nextFollow" };
  }
  return null;
}

function lockOpportunityOwnership(opportunity, actor, reason) {
  opportunity.ownershipStatus = OWNERSHIP_LOCKED;
  opportunity.claimUntil = "";
  opportunity.publicPoolAt = "";
  opportunity.publicPoolReason = "";
  opportunity.effectiveFollowUpAt = new Date().toISOString();
  opportunity.ownershipHistory = [...(opportunity.ownershipHistory || []), ownershipEvent("locked", opportunity, actor, actor, reason)];
}

function opportunityPublicPoolInfo(opportunity = {}, at = Date.now()) {
  if (isPurchasedOpportunity(opportunity)) return { isPublic: false, at: "", reason: "" };
  if (opportunity.stage === "成交") return { isPublic: false, at: "", reason: "" };
  if ([OWNERSHIP_PUBLIC, OWNERSHIP_CLAIMABLE].includes(opportunity.ownershipStatus)) {
    return { isPublic: true, at: opportunity.publicPoolAt || opportunity.claimUntil || new Date(at).toISOString(), reason: opportunity.publicPoolReason || "inactive_30_days" };
  }
  if (opportunity.ownershipStatus === OWNERSHIP_PENDING && opportunity.claimUntil && !opportunity.effectiveFollowUpAt) {
    const deadline = Date.parse(opportunity.claimUntil);
    if (Number.isFinite(deadline) && deadline <= at) return { isPublic: true, at: new Date(deadline).toISOString(), reason: "initial_followup_expired" };
    return { isPublic: false, at: "", reason: "" };
  }
  const manual = (opportunity.followUps || []).filter((item) => !item.isSystem && String(item.note || "").trim()).slice(-1)[0];
  const activityAt = Date.parse(manual?.createdAt || manual?.date || opportunity.effectiveFollowUpAt || opportunity.createdAt || "");
  if (Number.isFinite(activityAt) && activityAt + PUBLIC_POOL_DAYS * 86400000 <= at) {
    return { isPublic: true, at: new Date(activityAt + PUBLIC_POOL_DAYS * 86400000).toISOString(), reason: "inactive_30_days" };
  }
  return { isPublic: false, at: "", reason: "" };
}

function isOpportunityPublicPool(opportunity = {}, at = Date.now()) {
  return opportunityPublicPoolInfo(opportunity, at).isPublic;
}

function isPurchasedOpportunity(opportunity = {}) {
  return opportunity.outcomeStatus === OUTCOME_PURCHASED;
}

function rollbackTargetForStage(stage = "") {
  if (stage === "线索") return "名单";
  if (stage === "商机") return "线索";
  return "";
}

function latestPendingRollback(opportunity = {}, requestId = "") {
  const history = Array.isArray(opportunity.rollbackHistory) ? opportunity.rollbackHistory : [];
  if (requestId) return history.find((item) => String(item.id) === String(requestId) && item.status === "pending") || null;
  return history.slice().reverse().find((item) => item.status === "pending") || null;
}

function canReviewRollback(state, viewer, opportunity) {
  return canAssignCustomers(state, viewer) && canViewOpportunity(state, viewer, opportunity);
}

function applyProductSelectionForFollow(state, previous = {}, body = {}) {
  const currentProduct = resolveSelectableProduct(state, previous.productId, previous.productName);
  const needsProduct = !currentProduct || isPlaceholderProductName(previous.productName);
  const requestedProduct = body.productId !== undefined || body.productName !== undefined
    ? resolveSelectableProduct(state, body.productId, body.productName)
    : null;
  if (needsProduct && !requestedProduct) {
    return { error: { error: "请选择意向产品", field: "productId" } };
  }
  if (requestedProduct && hasActiveProductOpportunity(state, previous.customerId, requestedProduct.id, previous.id)) {
    return { error: { error: "该客户已有相同产品的进行中机会", code: "DUPLICATE_ACTIVE_OPPORTUNITY" } };
  }
  if (!requestedProduct) return { fields: {} };
  const productPrice = normalizeMoney(requestedProduct.price);
  const previousAmount = normalizeMoney(previous.amount);
  return {
    fields: {
      productId: requestedProduct.id,
      productName: requestedProduct.name,
      ...(productPrice > 0 && (!previousAmount || previousAmount === DEFAULT_EXPECTED_AMOUNT) ? { amount: productPrice } : {})
    }
  };
}

function canViewOpportunity(state, viewer, opportunity) {
  const customer = findCustomer(state.customers || [], opportunity.customerId) || opportunity;
  return canViewRecord(state, viewer, { ...customer, ...opportunity });
}

function canManageOpportunityAssignment(state, viewer, opportunity) {
  if (!isOpportunityPublicPool(opportunity)) return canViewOpportunity(state, viewer, opportunity);
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  if (role.customerScope === "all") return true;
  if (role.customerScope === "self") return false;
  return canViewOpportunity(state, viewer, opportunity);
}

function visiblePublicPoolOpportunities(state, viewer) {
  return (state.opportunities || []).filter((item) => isOpportunityPublicPool(item) && (findCustomer(state.customers || [], item.customerId)?.lifecycleStatus !== LIFECYCLE_ARCHIVED));
}

function isArchivedOpportunity(state, opportunity = {}) {
  const customer = findCustomer(state.customers || [], opportunity.customerId);
  return customer?.lifecycleStatus === LIFECYCLE_ARCHIVED;
}

function visibleArchivedOpportunities(state, viewer) {
  if (!viewer) return [];
  return (state.opportunities || []).filter((item) => isArchivedOpportunity(state, item));
}

function sanitizePublicPoolOpportunity(customer = {}, opportunity = {}) {
  const pool = opportunityPublicPoolInfo(opportunity);
  return {
    id: opportunity.id,
    opportunityId: opportunity.id,
    customerId: customer.id,
    name: customer.name || "",
    city: customer.city || customer.location?.city || extractCity(customer.address) || "待识别",
    address: customer.address || "",
    channelSource: customer.channelSource || "其他",
    productId: opportunity.productId,
    productName: opportunity.productName,
    stage: opportunity.stage,
    ownershipStatus: OWNERSHIP_PUBLIC,
    publicPoolAt: pool.at,
    publicPoolReason: pool.reason,
    claimable: true,
    phone: "认领后可见",
    contacts: [],
    followUps: []
  };
}

function sanitizeArchivedOpportunity(customer = {}, opportunity = {}) {
  const latest = (opportunity.followUps || [])[opportunity.followUps.length - 1] || {};
  return {
    id: opportunity.id,
    opportunityId: opportunity.id,
    customerId: customer.id,
    name: customer.name || "",
    city: customer.city || customer.location?.city || extractCity(customer.address) || "待识别",
    address: customer.address || "",
    channelSource: customer.channelSource || "其他",
    productId: opportunity.productId,
    productName: opportunity.productName,
    stage: opportunity.stage || "名单",
    lifecycleStatus: LIFECYCLE_ARCHIVED,
    archiveReason: customer.archiveReason || "invalid",
    archivedAt: customer.archivedAt || "",
    archivedBy: customer.archivedBy || "",
    ownershipStatus: "archived",
    phone: "已归档",
    contacts: [],
    followUps: (opportunity.followUps || []).map((item) => normalizeFollowUp(item, opportunity)),
    lastFollow: latest.date || "",
    nextFollow: latest.nextFollow || opportunity.nextFollow || "",
    lastNote: latest.note || ""
  };
}

function claimOpportunityAtIndex(res, state, viewer, index, body = {}) {
  const previous = state.opportunities[index];
  if (!isOpportunityPublicPool(previous)) return sendJson(res, 409, { error: "该机会已被认领或不在公海", code: "DUPLICATE_CUSTOMER" });
  if (!canOwnCustomerUser(state, viewer)) {
    return sendJson(res, 403, { error: "仅销售、主管和区域经理可以认领公海机会" });
  }
  const currentSelectableProduct = resolveSelectableProduct(state, previous.productId, previous.productName);
  const currentProduct = currentSelectableProduct || resolveProduct(state, previous.productId, previous.productName);
  const selectedProduct = resolveSelectableProduct(state, body.productId, body.productName);
  if ((body.productId || body.productName) && !selectedProduct) return sendJson(res, 400, { error: "请选择有效的意向产品", field: "productId" });
  const needsProduct = !currentSelectableProduct || isPlaceholderProductName(previous.productName);
  const product = selectedProduct || currentProduct;
  if (selectedProduct && hasActiveProductOpportunity(state, previous.customerId, selectedProduct.id, previous.id)) {
    return sendJson(res, 409, { error: "该客户已有相同产品的进行中机会", code: "DUPLICATE_ACTIVE_OPPORTUNITY" });
  }
  const now = new Date().toISOString();
  const productPrice = normalizeMoney(selectedProduct?.price);
  const previousAmount = normalizeMoney(previous.amount);
  const shouldUseProductPrice = selectedProduct && needsProduct && productPrice > 0 && (!previousAmount || previousAmount === DEFAULT_EXPECTED_AMOUNT);
  const next = normalizeOpportunity({
    ...previous,
    productId: product?.id || previous.productId,
    productName: product?.name || previous.productName,
    amount: shouldUseProductPrice ? productPrice : previous.amount,
    owner: viewer.name,
    ownerId: viewer.id,
    followPerson: viewer.name,
    unitId: viewer.unitId || "",
    unit: viewer.unit || "",
    zone: viewer.zone || "",
    ownershipStatus: OWNERSHIP_PENDING,
    claimUntil: addDaysToIso(now, CUSTOMER_CLAIM_DAYS),
    effectiveFollowUpAt: "",
    publicPoolAt: "",
    publicPoolReason: "",
    ownershipHistory: [...(previous.ownershipHistory || []), ownershipEvent("claimed_public_pool", previous, viewer, viewer, "公海销售机会认领")]
  }, state);
  state.opportunities[index] = next;
  syncCustomerCompatibility(state, next.customerId);
  const customer = findCustomer(state.customers || [], next.customerId);
  if (customer) transferCustomerVisits(state, customer, next);
  writeState(state);
  return sendJson(res, 200, opportunityView(state, next));
}

function assignOpportunity(state, previous, target, viewer) {
  const now = new Date().toISOString();
  const wasPublic = isOpportunityPublicPool(previous);
  return normalizeOpportunity({
    ...previous,
    owner: target.name,
    ownerId: target.id,
    followPerson: target.name,
    unitId: target.unitId || "",
    unit: target.unit || "",
    zone: target.zone || "",
    ownershipStatus: wasPublic ? OWNERSHIP_PENDING : OWNERSHIP_LOCKED,
    claimUntil: wasPublic ? addDaysToIso(now, CUSTOMER_CLAIM_DAYS) : "",
    effectiveFollowUpAt: wasPublic ? "" : previous.effectiveFollowUpAt,
    publicPoolAt: "",
    publicPoolReason: "",
    ownershipHistory: [...(previous.ownershipHistory || []), ownershipEvent("assigned", previous, target, viewer, "销售机会重新分配")]
  }, state);
}

function normalizeContacts(contacts = [], customer = {}) {
  const incoming = Array.isArray(contacts) ? contacts.filter(Boolean) : [];
  const fallbackPhone = customer.phone || customer.customerPhone || "";
  const source = incoming.length ? incoming : (fallbackPhone ? [{ name: customer.contactName || "主联系人", phone: fallbackPhone, isPrimary: true }] : []);
  const normalized = source.map((item, index) => ({
    id: item.id || `${customer.id || "customer"}-contact-${index + 1}`,
    name: String(item.name || (index === 0 ? "主联系人" : "联系人")).trim(),
    phone: String(item.phone || "").trim(),
    phoneNormalized: normalizePhone(item.phone),
    position: String(item.position || item.jobTitle || "").trim(),
    wechat: String(item.wechat || "").trim(),
    decisionRole: String(item.decisionRole || "").trim(),
    note: String(item.note || "").trim(),
    isPrimary: Boolean(item.isPrimary)
  }));
  if (normalized.length && !normalized.some((item) => item.isPrimary)) normalized[0].isPrimary = true;
  let primarySeen = false;
  normalized.forEach((item) => {
    if (!item.isPrimary) return;
    if (primarySeen) item.isPrimary = false;
    primarySeen = true;
  });
  return normalized;
}

function normalizeCompetitorProfiles(profiles = [], competitors = DEFAULT_COMPETITORS, legacySoftware = "") {
  const source = Array.isArray(profiles) ? profiles.filter(Boolean) : [];
  if (!source.length && legacySoftware && !/^(待补充|未知|-)$/.test(String(legacySoftware))) {
    const matched = (competitors || []).find((item) => String(legacySoftware).includes(item.name));
    if (matched) {
      const remainder = String(legacySoftware).replace(matched.name, "").replace(/^[+＋、,，\s]+|[+＋、,，\s]+$/g, "");
      source.push({ competitorId: matched.id, brand: matched.name, isPrimary: true, note: remainder ? `历史补充：${remainder}` : "由历史现用软件迁移" });
    } else {
      const other = (competitors || []).find((item) => cleanText(item.name) === cleanText("其他"));
      source.push({ competitorId: other?.id || "competitor-other", brand: other?.name || "其他", isPrimary: true, note: `历史现用软件：${legacySoftware}` });
    }
  }
  return source.map((item, index) => {
    const matched = (competitors || []).find((entry) => entry.id === item.competitorId || cleanText(entry.name) === cleanText(item.brand));
    return {
      id: item.id || stableId("competitor-profile", `${item.brand || matched?.name || "其他"}-${index}`),
      competitorId: matched?.id || item.competitorId || stableId("competitor", item.brand || "其他"),
      brand: matched?.name || item.brand || "其他",
      version: String(item.version || "").trim(),
      price: String(item.price || "").trim(),
      expiresAt: item.expiresAt || "",
      satisfaction: String(item.satisfaction || "").trim(),
      switchingBarrier: String(item.switchingBarrier || "").trim(),
      note: String(item.note || "").trim(),
      isPrimary: item.isPrimary === undefined ? index === 0 : Boolean(item.isPrimary)
    };
  });
}

function normalizeLocation(location = {}, customer = {}) {
  const latitude = Number(location.latitude || customer.latitude || 0);
  const longitude = Number(location.longitude || customer.longitude || 0);
  return {
    latitude,
    longitude,
    province: location.province || customer.province || "",
    city: location.city || customer.city || "",
    district: location.district || customer.district || "",
    address: location.address || customer.address || "",
    status: latitude && longitude ? "resolved" : (location.status || "unknown"),
    resolvedAt: location.resolvedAt || ""
  };
}

function primaryCompetitorName(customer = {}) {
  const profiles = customer.competitorProfiles || [];
  return (profiles.find((item) => item.isPrimary) || profiles[0] || {}).brand || "";
}

function normalizeStageTimes(customer = {}, activities = [], createdAt = today()) {
  const activityDate = (stage) => (activities || [])
    .filter((item) => Number(item.customerId) === Number(customer.id) && item.type === stage && item.date)
    .map((item) => item.date)
    .sort()[0] || "";
  const currentIndex = STAGES.indexOf(customer.stage || "名单");
  const fallbackFor = (stage) => currentIndex >= STAGES.indexOf(stage)
    ? (activityDate(stage) || customer.lastFollow || createdAt)
    : "";
  return {
    leadAt: customer.leadAt || customer.leadConvertedAt || fallbackFor("线索"),
    opportunityAt: customer.opportunityAt || customer.opportunityConvertedAt || fallbackFor("商机"),
    dealAt: customer.dealAt || customer.closedAt || customer.dealDate || fallbackFor("成交")
  };
}

function setStageTime(customer, stage, date = today()) {
  const field = STAGE_TIME_FIELDS[stage];
  if (field) customer[field] = date;
  return customer;
}

function normalizeFollowUp(item = {}, customer = {}) {
  return {
    date: item.date || customer.lastFollow || customer.createdAt || today(),
    createdAt: item.createdAt || "",
    author: item.author || item.owner || customer.followPerson || customer.owner || "历史数据",
    note: item.note || item.lastNote || "更新了客户信息。",
    nextFollow: item.nextFollow || "",
    isSystem: Boolean(item.isSystem)
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
    customerId: Number(visit.customerId || 0) || "",
    opportunityId: Number(visit.opportunityId || 0) || "",
    productId: visit.productId || "",
    productName: visit.productName || "",
    factory: visit.factory || "",
    phone: visit.phone || visit.customerPhone || "",
    cuttingDevice: visit.cuttingDevice || compactDeviceText(visit.cuttingCount, visit.cuttingBrand),
    cuttingCount: visit.cuttingCount || "",
    cuttingBrand: visit.cuttingBrand || "",
    drillingDevice: visit.drillingDevice || compactDeviceText(visit.drillingCount, visit.drillingBrand),
    drillingCount: visit.drillingCount || "",
    drillingBrand: visit.drillingBrand || "",
    line: visit.line || buildVisitLine(visit) || "待补充",
    software: displaySoftwareName(visit.software || visit.currentSoftware),
    softwarePrice: visit.softwarePrice || "",
    lossReason: visit.lossReason || visit.reason || "",
    lossReasonDetail: visit.lossReasonDetail || visit.functionLossReason || visit.lossReasonSpecific || "",
    objections: visit.objections || "",
    result: visit.result || visit.note || "",
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
    orgPath: visit.orgPath || ownerUser.orgPath || unit.path || "",
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
  const samePhone = (customer) => visit.phone && normalizePhone(customer.phoneNormalized || customer.phone) === normalizePhone(visit.phone);
  const index = (state.customers || []).findIndex((customer) =>
    (visit.customerId && Number(customer.id) === Number(visit.customerId)) || (samePhone(customer) && sameOwner(customer))
  );

  if (index < 0) {
    const customer = normalizeCustomer({
      id: Date.now() + 1,
      name: factory,
      phone: visit.phone || "待补充",
      phoneNormalized: normalizePhone(visit.phone),
      channelSource: normalizeChannelSource("地推"),
      createdBy: owner,
      followPerson: owner,
      address: visit.address || "",
      stage,
      owner,
      ownerId,
      region: visit.city || visit.address || "待分区",
      amount: DEFAULT_EXPECTED_AMOUNT,
      software: displaySoftwareName(visit.software),
      photos: normalizePhotos(visit.photos),
      location: {
        latitude: visit.latitude,
        longitude: visit.longitude,
        city: visit.city || "",
        address: visit.address || "",
        status: visit.latitude && visit.longitude ? "resolved" : "unknown",
        resolvedAt: visit.date || today()
      },
      lastVisitedAt: visit.date || today(),
      createdAt: visit.date || today(),
      ownershipStatus: OWNERSHIP_LOCKED,
      effectiveFollowUpAt: new Date().toISOString(),
      claimUntil: "",
      ownershipHistory: [ownershipEvent("created", null, { id: ownerId, name: owner }, { id: ownerId, name: owner }, "地推拜访录入")],
      followUps: [{
        date: visit.date || today(),
        createdAt: new Date().toISOString(),
        author: visit.owner || owner || "地推拜访",
        note,
        nextFollow: "",
        isSystem: false
      }]
    }, state);
    state.customers.unshift(customer);
    const productName = visit.productName || "待确认产品";
    const product = resolveProduct(state, visit.productId || "", productName)
      || normalizeProduct({ id: stableId("product", productName), name: productName });
    const opportunity = normalizeOpportunity({
      ...opportunityFromLegacyCustomer(customer),
      id: Date.now() + 2,
      customerId: customer.id,
      productId: product.id,
      productName: product.name,
      stage,
      followUps: customer.followUps,
      effectiveFollowUpAt: new Date().toISOString(),
      ownershipStatus: OWNERSHIP_LOCKED
    }, state);
    state.opportunities.unshift(opportunity);
    syncCustomerCompatibility(state, customer.id);
    visit.customerId = customer.id;
    visit.opportunityId = opportunity.id;
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
    competitorProfiles: visit.software && !isUnknownSoftwareValue(visit.software)
      ? normalizeCompetitorProfiles([], state.competitors, visit.software)
      : state.customers[index].competitorProfiles,
    photos: mergePhotos(state.customers[index].photos, visit.photos)
  }, state);
  customer.location = normalizeLocation({
    ...customer.location,
    latitude: visit.latitude || customer.location?.latitude,
    longitude: visit.longitude || customer.location?.longitude,
    city: visit.city || customer.location?.city,
    address: visit.address || customer.location?.address,
    status: visit.latitude && visit.longitude ? "resolved" : customer.location?.status,
    resolvedAt: visit.date || today()
  }, customer);
  customer.lastVisitedAt = visit.date || today();
  visit.customerId = customer.id;
  if (previousStage !== stage) setStageTime(customer, stage, visit.date || today());
  const latestFollow = customer.followUps[customer.followUps.length - 1] || {};
  customer.followUps.push({
    date: visit.date || today(),
    createdAt: new Date().toISOString(),
    author: visit.owner || owner || "地推拜访",
    note,
    nextFollow: latestFollow.nextFollow || "",
    isSystem: false
  });
  lockCustomerOwnership(customer, { id: ownerId, name: owner }, "地推拜访跟进");
  state.customers[index] = customer;
  const opportunity = (visit.opportunityId && state.opportunities.find((item) => Number(item.id) === Number(visit.opportunityId))) || primaryOpportunity(state, customer.id);
  if (opportunity) {
    const opportunityIndex = state.opportunities.findIndex((item) => Number(item.id) === Number(opportunity.id));
    const updatedOpportunity = normalizeOpportunity({
      ...opportunity,
      stage,
      owner,
      ownerId,
      followPerson: owner,
      followUps: [
        ...(opportunity.followUps || []),
        normalizeFollowUp({ date: visit.date || today(), createdAt: new Date().toISOString(), author: visit.owner || owner || "地推拜访", note, nextFollow: "", isSystem: false }, opportunity)
      ]
    }, state);
    setStageTime(updatedOpportunity, stage, visit.date || today());
    lockOpportunityOwnership(updatedOpportunity, { id: ownerId, name: owner }, "地推拜访跟进");
    state.opportunities[opportunityIndex] = updatedOpportunity;
    visit.opportunityId = updatedOpportunity.id;
    syncCustomerCompatibility(state, customer.id);
  }
  if (previousStage !== stage) {
    state.activities.push({ date: visit.date || today(), owner, type: stage, customerId: customer.id });
  }
}

function cleanText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  const text = String(value || "")
    .trim()
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 65248));
  if (!text || /^(待补充|未知|无|暂无|-)$/.test(text)) return "";
  let digits = text.replace(/\D/g, "");
  if (digits.startsWith("0086")) digits = digits.slice(4);
  else if (digits.startsWith("86") && digits.length === 13) digits = digits.slice(2);
  return digits.length >= 7 ? digits : "";
}

function findCustomerByPhone(state, phone, excludeId = null) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const customers = state.customers || [];
  if (customers === stateCache?.customers && stateIndexes.customersByPhone.size <= customers.length) {
    const indexed = customers[stateIndexes.customersByPhone.get(normalized)];
    if (
      indexed &&
      normalizePhone(indexed.phoneNormalized || indexed.phone) === normalized &&
      (excludeId === null || Number(indexed.id) !== Number(excludeId))
    ) return indexed;
  }
  return customers.find((customer) => {
    if (excludeId !== null && Number(customer.id) === Number(excludeId)) return false;
    return normalizePhone(customer.phoneNormalized || customer.phone) === normalized;
  }) || null;
}

function normalizedFactoryName(value) {
  return cleanText(value)
    .replace(/[\s·,，.。()（）\-]/g, "")
    .replace(/(有限责任公司|有限公司|全屋定制工厂|全屋定制厂|定制工厂|家具厂|家居厂|工厂)$/g, "");
}

function extractCity(value) {
  const text = String(value || "");
  const match = text.match(/([\u4e00-\u9fa5]{2,10}市)/);
  return match ? match[1] : cleanText(text).replace(/\s/g, "");
}

function stringSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  const pairs = (value) => {
    const result = new Set();
    for (let index = 0; index < value.length - 1; index += 1) result.add(value.slice(index, index + 2));
    return result;
  };
  const a = pairs(left);
  const b = pairs(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  a.forEach((pair) => { if (b.has(pair)) common += 1; });
  return (2 * common) / (a.size + b.size);
}

function findSimilarCustomer(state, candidate = {}, excludeId = null) {
  const name = normalizedFactoryName(candidate.name || candidate.factory);
  const city = extractCity(candidate.city || candidate.address || candidate.region);
  if (!name || !city) return null;
  return (state.customers || []).find((customer) => {
    if (excludeId !== null && Number(customer.id) === Number(excludeId)) return false;
    const customerCity = extractCity(customer.address || customer.region);
    if (!customerCity || customerCity !== city) return false;
    return stringSimilarity(name, normalizedFactoryName(customer.name)) >= 0.85;
  }) || null;
}

function addDaysToIso(value, days) {
  const date = new Date(value || Date.now());
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString();
}

function effectiveOwnershipStatus(customer = {}, at = Date.now()) {
  return customerPublicPoolInfo(customer, at).isPublic
    ? OWNERSHIP_PUBLIC
    : (customer.ownershipStatus || OWNERSHIP_LOCKED);
}

function isCustomerClaimable(customer = {}) {
  return customerPublicPoolInfo(customer).isPublic;
}

function isCustomerPublicPool(customer = {}, at = Date.now()) {
  return customerPublicPoolInfo(customer, at).isPublic;
}

function customerPublicPoolInfo(customer = {}, at = Date.now()) {
  if (customer.outcomeStatus === OUTCOME_PURCHASED) return { isPublic: false, at: "", reason: "" };
  if (customer.lifecycleStatus === LIFECYCLE_ARCHIVED) return { isPublic: false, at: "", reason: "" };
  if (customer.stage === "成交") return { isPublic: false, at: "", reason: "" };
  if (!["名单", "线索", "商机"].includes(customer.stage || "名单")) return { isPublic: false, at: "", reason: "" };

  if ([OWNERSHIP_PUBLIC, OWNERSHIP_CLAIMABLE].includes(customer.ownershipStatus)) {
    return {
      isPublic: true,
      at: customer.publicPoolAt || customer.claimUntil || new Date(at).toISOString(),
      reason: customer.publicPoolReason || "inactive_30_days"
    };
  }

  if (customer.ownershipStatus === OWNERSHIP_PENDING && customer.claimUntil && !customer.effectiveFollowUpAt) {
    const deadline = Date.parse(customer.claimUntil);
    if (Number.isFinite(deadline) && deadline <= at) {
      return { isPublic: true, at: new Date(deadline).toISOString(), reason: "new_customer_timeout" };
    }
    return { isPublic: false, at: "", reason: "" };
  }

  const lastManualAt = latestEffectiveManualFollowAt(customer);
  const fallbackAt = customer.effectiveFollowUpAt || customer.createdAt || "";
  const activityAt = Date.parse(lastManualAt || fallbackAt);
  if (!Number.isFinite(activityAt)) return { isPublic: false, at: "", reason: "" };
  const publicAt = activityAt + PUBLIC_POOL_DAYS * 24 * 60 * 60 * 1000;
  if (publicAt <= at) {
    return { isPublic: true, at: new Date(publicAt).toISOString(), reason: "inactive_30_days" };
  }
  return { isPublic: false, at: "", reason: "" };
}

function latestEffectiveManualFollowAt(customer = {}) {
  const followUps = Array.isArray(customer.followUps) ? customer.followUps : [];
  return followUps
    .filter(isManualEffectiveFollow)
    .map((item) => item.createdAt || item.date || "")
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || "";
}

function isManualEffectiveFollow(item = {}) {
  const note = String(item.note || "").trim();
  const syntheticNotes = new Set(["新增客户。", "名单文件导入。", "更新了客户信息。"]);
  return !item.isSystem && Boolean(note) && !syntheticNotes.has(note);
}

function claimDaysRemaining(claimUntil) {
  const remaining = Date.parse(claimUntil) - Date.now();
  return Number.isFinite(remaining) ? Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000))) : 0;
}

function ownershipEvent(type, previous, nextOwner, operator, reason) {
  return {
    id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    type,
    fromOwnerId: previous?.ownerId || "",
    fromOwner: previous?.owner || "",
    toOwnerId: nextOwner?.id || nextOwner?.ownerId || "",
    toOwner: nextOwner?.name || nextOwner?.owner || "",
    operatorId: operator?.id || "",
    operator: operator?.name || "",
    reason: reason || "",
    createdAt: new Date().toISOString()
  };
}

function lockCustomerOwnership(customer, operator, reason) {
  const previousStatus = effectiveOwnershipStatus(customer);
  customer.effectiveFollowUpAt = new Date().toISOString();
  if (previousStatus !== OWNERSHIP_LOCKED) {
    customer.ownershipHistory = customer.ownershipHistory || [];
    customer.ownershipHistory.push(ownershipEvent("locked", customer, customer, operator, reason));
  }
  customer.ownershipStatus = OWNERSHIP_LOCKED;
  customer.claimUntil = "";
  customer.publicPoolAt = "";
  customer.publicPoolReason = "";
}

function claimCustomerAtIndex(res, state, viewer, index) {
  const customerId = state.customers[index]?.id;
  const opportunityIndex = state.opportunities.findIndex((item) => Number(item.customerId) === Number(customerId) && isOpportunityPublicPool(item));
  if (opportunityIndex >= 0) return claimOpportunityAtIndex(res, state, viewer, opportunityIndex, { allowPlaceholderProduct: true });
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  if (role.customerScope !== "self" && role.name !== "销售") {
    return sendJson(res, 403, { error: "主管及以上请使用客户分配功能" });
  }
  const previous = state.customers[index];
  if (!isCustomerClaimable(previous)) {
    return sendJson(res, 409, { error: "该客户已被认领或不在公海", code: "DUPLICATE_CUSTOMER" });
  }
  const now = new Date().toISOString();
  const next = normalizeCustomer({
    ...previous,
    owner: viewer.name,
    ownerId: viewer.id,
    followPerson: viewer.name,
    unitId: viewer.unitId || "",
    unit: viewer.unit || "",
    zone: viewer.zone || "",
    region: viewer.zone || previous.region,
    ownershipStatus: OWNERSHIP_PENDING,
    claimUntil: addDaysToIso(now, CUSTOMER_CLAIM_DAYS),
    effectiveFollowUpAt: "",
    publicPoolAt: "",
    publicPoolReason: "",
    ownershipHistory: [
      ...(previous.ownershipHistory || []),
      ownershipEvent("claimed_public_pool", previous, viewer, viewer, "公海客户认领")
    ]
  }, state);
  state.customers[index] = next;
  transferCustomerVisits(state, previous, next);
  writeState(state);
  return sendJson(res, 200, toMiniCustomer(next));
}

function transferCustomerVisits(state, customer, nextOwner) {
  const phone = normalizePhone(customer.phoneNormalized || customer.phone);
  (state.visits || []).forEach((visit) => {
    const matchesCustomer = Number(visit.customerId) === Number(customer.id);
    const matchesPhone = phone && normalizePhone(visit.phone) === phone;
    if (!matchesCustomer && !matchesPhone) return;
    visit.ownerId = nextOwner.ownerId;
    visit.owner = nextOwner.owner;
    visit.unitId = nextOwner.unitId || "";
    visit.unit = nextOwner.unit || "";
    visit.zone = nextOwner.zone || "";
  });
}

function resolvePaymentOwner(state, viewer, previous = {}, body = {}) {
  const amount = body.paymentAmount !== undefined ? normalizeMoney(body.paymentAmount) : normalizeMoney(previous.paymentAmount);
  if (amount <= 0) return { user: null };
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  if (role.customerScope === "self") {
    const existing = findUser(state.users, previous.paymentOwnerId, previous.paymentOwner);
    return { user: existing.id && body.paymentOwnerId === undefined ? existing : viewer };
  }
  const requested = findUser(
    state.users,
    body.paymentOwnerId || previous.paymentOwnerId || viewer.id,
    body.paymentOwner || previous.paymentOwner || viewer.name
  );
  const allowed = visibleUsers(state, viewer).find((item) => Number(item.id) === Number(requested.id));
  if (!allowed) return { error: "进款业绩归属人不在当前管理范围内", status: 403 };
  return { user: allowed };
}

function visitCustomerConflict(state, viewer, body = {}) {
  const phone = normalizePhone(body.phone);
  if (!phone) return { status: 400, payload: { error: "请填写有效的客户电话", code: "INVALID_CUSTOMER_PHONE" } };
  const referenced = body.customerId ? findCustomer(state.customers || [], body.customerId) : null;
  if (body.customerId && !referenced) return { status: 404, payload: { error: "客户不存在" } };
  if (referenced && normalizePhone(referenced.phoneNormalized || referenced.phone) !== phone) {
    return { status: 400, payload: { error: "客户电话与所选工厂不一致", code: "CUSTOMER_PHONE_MISMATCH" } };
  }
  if (body.opportunityId) {
    const opportunity = (state.opportunities || []).find((item) => Number(item.id) === Number(body.opportunityId));
    if (!opportunity || (referenced && Number(opportunity.customerId) !== Number(referenced.id))) {
      return { status: 400, payload: { error: "销售机会与所选工厂不一致", code: "OPPORTUNITY_CUSTOMER_MISMATCH" } };
    }
    if (isOpportunityPublicPool(opportunity)) {
      return { status: 409, payload: { error: "公海销售机会需先认领", code: "CUSTOMER_CLAIM_REQUIRED" } };
    }
    if (!canViewOpportunity(state, viewer, opportunity)) {
      return { status: 403, payload: { error: "无权为该销售机会创建拜访记录" } };
    }
  }
  const duplicate = findCustomerByPhone(state, phone);
  if (duplicate) {
    const access = customerMapAccess(state, viewer, duplicate);
    if (access.mode === "public") {
      return { status: 409, payload: { error: "该客户已进入公海，请先认领", code: "CUSTOMER_CLAIMABLE" } };
    }
    if (access.mode === "private") return null;
    return { status: 409, payload: { error: "该客户已存在", code: "DUPLICATE_CUSTOMER" } };
  }
  if (!body.confirmSimilar && findSimilarCustomer(state, { name: body.factory, city: body.city, address: body.address })) {
    return { status: 409, payload: { error: "发现同城名称相似的客户，请确认后继续上传", code: "SIMILAR_CUSTOMER_WARNING" } };
  }
  return null;
}

function stableId(prefix, value) {
  const hash = crypto.createHash("md5").update(String(value || prefix)).digest("hex").slice(0, 10);
  return `${prefix}-${hash}`;
}

function publicState(state, viewer = null, options = {}) {
  const includePublicPool = options.includePublicPool !== false;
  const scoped = scopeStateForUser(state, viewer);
  const { securityLogs, geocodeJobs, ...safeState } = scoped;
  const privateOpportunities = (scoped.opportunities || []).filter((item) => !isOpportunityPublicPool(item) && !isArchivedOpportunity(state, item));
  const privateCustomerIds = new Set(privateOpportunities.map((item) => Number(item.customerId)));
  const publicOpportunities = viewer ? visiblePublicPoolOpportunities(state, viewer) : [];
  const sanitizedPublicOpportunities = includePublicPool
    ? publicOpportunities.map((item) => sanitizePublicPoolOpportunity(findCustomer(state.customers, item.customerId), item))
    : [];
  const sanitizedArchivedOpportunities = viewer
    ? visibleArchivedOpportunities(state, viewer).map((item) => sanitizeArchivedOpportunity(findCustomer(state.customers, item.customerId), item))
    : [];
  return {
    ...safeState,
    users: (scoped.users || []).map(publicUser),
    customers: (scoped.customers || []).filter((item) => privateCustomerIds.has(Number(item.id))),
    publicPool: { count: publicOpportunities.length, loaded: includePublicPool },
    opportunities: [...privateOpportunities, ...sanitizedPublicOpportunities, ...sanitizedArchivedOpportunities]
  };
}

function publicMetaState(state, viewer = null) {
  const scoped = scopeStateForUser(state, viewer);
  const {
    securityLogs,
    geocodeJobs,
    customers,
    opportunities,
    visits,
    activities,
    routes,
    ...safeState
  } = scoped;
  const publicPoolCount = viewer ? visiblePublicPoolOpportunities(state, viewer).length : 0;
  return {
    ...safeState,
    users: (scoped.users || []).map(publicUser),
    customers: [],
    opportunities: [],
    visits: [],
    activities: [],
    routes: [],
    publicPool: { count: publicPoolCount, loaded: false }
  };
}

function buildCustomerBoard(state, viewer, query = {}) {
  const scopedPrivateOpportunities = (state.opportunities || [])
    .filter((item) => !isOpportunityPublicPool(item) && canViewOpportunity(state, viewer, item))
    .filter((item) => findCustomer(state.customers || [], item.customerId)?.lifecycleStatus !== LIFECYCLE_ARCHIVED)
    .map((item) => opportunityView(state, item));
  const purchasedItems = scopedPrivateOpportunities.filter((item) => isPurchasedOpportunity(item));
  const privateOpportunities = scopedPrivateOpportunities.filter((item) => !isPurchasedOpportunity(item));
  const publicItems = visiblePublicPoolOpportunities(state, viewer).map((opportunity) => {
    const customer = findCustomer(state.customers || [], opportunity.customerId);
    return sanitizePublicPoolOpportunity(customer, opportunity);
  });
  const invalidItems = visibleArchivedOpportunities(state, viewer).map((opportunity) => {
    const customer = findCustomer(state.customers || [], opportunity.customerId);
    return sanitizeArchivedOpportunity(customer, opportunity);
  });
  const result = {
    backendVersion: BACKEND_VERSION,
    moneyUnit: MONEY_UNIT,
    stages: state.stages || STAGES,
    items: privateOpportunities,
    counts: Object.fromEntries((state.stages || STAGES).map((stage) => [stage, privateOpportunities.filter((item) => item.stage === stage).length])),
    publicPool: { count: publicItems.length, items: publicItems },
    purchased: { count: purchasedItems.length, items: purchasedItems },
    invalid: { count: invalidItems.length, items: invalidItems }
  };
  if (!isPaginatedQuery(query)) return result;
  return buildPaginatedCustomerBoard(result, query);
}

function isPaginatedQuery(query = {}) {
  return query.paginated === "1" || query.page !== undefined || query.pageSize !== undefined;
}

function safePageSize(value, fallback = 20) {
  const size = Number(value || fallback);
  if (!Number.isFinite(size)) return fallback;
  return Math.min(Math.max(Math.round(size), 1), 500);
}

function safePage(value) {
  const page = Number(value || 1);
  if (!Number.isFinite(page)) return 1;
  return Math.max(Math.round(page), 1);
}

function customerBoardStageCounts(board) {
  return {
    ...(board.counts || {}),
    [PUBLIC_POOL_STATUS]: Number(board.publicPool?.count || 0),
    [PURCHASED_STATUS]: Number(board.purchased?.count || 0),
    invalid: Number(board.invalid?.count || 0),
    "无效": Number(board.invalid?.count || 0)
  };
}

function boardRowsForStage(board, stage) {
  if (stage === "全部") return board.items || [];
  if (stage === PUBLIC_POOL_STATUS) return board.publicPool?.items || [];
  if (stage === PURCHASED_STATUS) return board.purchased?.items || [];
  if (stage === "无效" || stage === "invalid") return board.invalid?.items || [];
  return (board.items || []).filter((item) => !stage || item.stage === stage);
}

function latestManualFollowRecord(record = {}) {
  return [...(record.followUps || [])]
    .reverse()
    .find((item) => !item.isSystem && String(item.note || "").trim());
}

function latestManualFollowDate(record = {}) {
  const latest = latestManualFollowRecord(record);
  return String(latest?.date || latest?.createdAt || "").slice(0, 10);
}

function hasManualFollow(record = {}) {
  return Boolean(latestManualFollowRecord(record));
}

function stageDateForBoardRow(row = {}, stage = "") {
  if (stage === PUBLIC_POOL_STATUS) return String(row.publicPoolAt || row.createdAt || "").slice(0, 10);
  if (stage === PURCHASED_STATUS) return String(row.purchasedInfo?.purchasedAt || row.effectiveFollowUpAt || row.createdAt || "").slice(0, 10);
  if (stage === "无效" || stage === "invalid") return String(row.archivedAt || row.createdAt || "").slice(0, 10);
  if (stage === STAGES[1]) return String(row.leadAt || row.createdAt || "").slice(0, 10);
  if (stage === STAGES[2]) return String(row.opportunityAt || row.createdAt || "").slice(0, 10);
  if (stage === STAGES[3]) return String(row.dealAt || row.createdAt || "").slice(0, 10);
  return String(row.createdAt || "").slice(0, 10);
}

function dateMatchesOptionalRange(value, start, end) {
  if (!start && !end) return true;
  const date = String(value || "").slice(0, 10);
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function filterBoardRows(rows = [], query = {}, stage = "") {
  const keyword = cleanText(query.keyword);
  const channelSource = cleanText(query.channelSource);
  const createdBy = cleanText(query.createdBy);
  const followPerson = cleanText(query.followPerson);
  const unit = cleanText(query.unit);
  const city = cleanText(query.city);
  const followStatus = String(query.followStatus || "");
  const idSet = new Set(String(query.ids || "")
    .split(",")
    .map((id) => Number(id))
    .filter(Boolean));
  return rows.filter((row) => {
    if (idSet.size && !idSet.has(Number(row.id)) && !idSet.has(Number(row.customerId))) return false;
    if (keyword && !cleanText(`${row.name || ""} ${row.phone || ""}`).includes(keyword)) return false;
    if (channelSource && cleanText(normalizeChannelSource(row.channelSource)) !== channelSource) return false;
    if (createdBy && !cleanText(row.createdBy).includes(createdBy)) return false;
    if (followPerson && !cleanText(row.followPerson || row.owner).includes(followPerson)) return false;
    if (unit && cleanText(row.unit) !== unit) return false;
    if (city && cleanText(row.city) !== city) return false;
    if (followStatus === "unfollowed" && hasManualFollow(row)) return false;
    if (followStatus === "followed" && !hasManualFollow(row)) return false;
    if (!dateMatchesOptionalRange(stageDateForBoardRow(row, stage), query.stageStart, query.stageEnd)) return false;
    if (!dateMatchesOptionalRange(latestManualFollowDate(row), query.lastStart, query.lastEnd)) return false;
    if (!dateMatchesOptionalRange(row.nextFollow, query.nextStart, query.nextEnd)) return false;
    if (!dateMatchesOptionalRange(row.publicPoolAt, query.publicPoolStart, query.publicPoolEnd)) return false;
    return true;
  });
}

function paginateRows(rows = [], query = {}) {
  const pageSize = safePageSize(query.pageSize, 20);
  const total = rows.length;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(safePage(query.page), totalPages);
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), total, page, pageSize, totalPages };
}

function buildPaginatedCustomerBoard(board, query = {}) {
  const stage = query.stage || STAGES[0];
  const sourceRows = boardRowsForStage(board, stage);
  const filteredRows = filterBoardRows(sourceRows, query, stage);
  const page = paginateRows(filteredRows, query);
  return {
    backendVersion: board.backendVersion,
    moneyUnit: board.moneyUnit,
    stages: board.stages,
    stage,
    stageCounts: customerBoardStageCounts(board),
    counts: board.counts,
    publicPool: { count: Number(board.publicPool?.count || 0) },
    purchased: { count: Number(board.purchased?.count || 0) },
    invalid: { count: Number(board.invalid?.count || 0) },
    ...page
  };
}

function paginatePublicPoolItems(items = [], query = {}) {
  const filteredRows = filterBoardRows(items, query, PUBLIC_POOL_STATUS);
  const page = paginateRows(filteredRows, query);
  return {
    backendVersion: BACKEND_VERSION,
    moneyUnit: MONEY_UNIT,
    count: filteredRows.length,
    ...page
  };
}

function publicUser(user = {}) {
  const { password, initialPassword, passwordHash, passwordSalt, ...safe } = user;
  return safe;
}

function toMiniState(state, viewer = null) {
  const next = publicState(state, viewer, { includePublicPool: false });
  const privateOpportunities = (state.opportunities || [])
    .filter((item) => !isOpportunityPublicPool(item) && canViewOpportunity(state, viewer, item))
    .filter((item) => findCustomer(state.customers || [], item.customerId)?.lifecycleStatus !== LIFECYCLE_ARCHIVED);
  const privateCustomerIds = new Set(privateOpportunities.map((item) => Number(item.customerId)));
  return {
    ...next,
    customers: (state.customers || []).filter((item) => privateCustomerIds.has(Number(item.id))).map(toMiniCustomer),
    opportunities: [
      ...privateOpportunities.map((item) => opportunityView(state, item)),
      ...visibleArchivedOpportunities(state, viewer).map((item) => sanitizeArchivedOpportunity(findCustomer(state.customers || [], item.customerId), item))
    ]
  };
}

function scopeStateForUser(state, viewer = null) {
  if (!viewer) return state;
  const user = state.users.find((item) => Number(item.id) === Number(viewer.id)) || viewer;
  const opportunities = (state.opportunities || []).filter((item) => canViewOpportunity(state, user, item) || isOpportunityPublicPool(item) || isArchivedOpportunity(state, item));
  const opportunityCustomerIds = new Set(opportunities.map((item) => Number(item.customerId)));
  return {
    ...state,
    users: visibleUsers(state, user),
    customers: (state.customers || []).filter((customer) => canViewRecord(state, user, customer) || opportunityCustomerIds.has(Number(customer.id))),
    opportunities,
    visits: (state.visits || []).filter((visit) => canViewRecord(state, user, visit)),
    routes: (state.routes || []).filter((route) => Number(route.ownerId) === Number(user.id)),
    targets: (state.targets || []).filter((target) => canViewTarget(state, user, target)),
    activities: (state.activities || []).filter((activity) => {
      if (!activity.customerId) return true;
      const customer = (state.customers || []).find((item) => Number(item.id) === Number(activity.customerId));
      return !customer || canViewRecord(state, user, customer) || isCustomerPublicPool(customer);
    })
  };
}

function visibleUsers(state, viewer) {
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  const users = (state.users || []).filter((user) => user.status !== "停用");
  if (role.customerScope === "all") return users;
  const managedUnits = managedOrgUnitIds(state, viewer);
  return users.filter((user) => {
    if (Number(user.id) === Number(viewer.id)) return true;
    if (Array.isArray(viewer.managedUnitIds) && viewer.managedUnitIds.includes(user.unitId)) return true;
    if (managedUnits.has(String(user.unitId))) return true;
    if (role.customerScope === "zone") return user.zone === viewer.zone;
    if (role.customerScope === "unit") return user.unitId === viewer.unitId;
    return false;
  });
}

function canOwnCustomerUser(state, user = {}) {
  if (user.status === "停用") return false;
  const roleName = findRole(state.roles, user.roleId, user.role).name || user.role || "";
  return ["销售", "主管", "区域经理"].includes(roleName);
}

function claimProtectionDays(state, viewer = {}, owner = {}, stage = "名单") {
  if (stage === "成交") return CUSTOMER_CLAIM_DAYS;
  if (!viewer?.id || !owner?.id) return CUSTOMER_CLAIM_DAYS;
  if (Number(viewer.id) !== Number(owner.id)) return CUSTOMER_CLAIM_DAYS;
  return canOwnCustomerUser(state, viewer) ? SELF_DEVELOPED_CLAIM_DAYS : CUSTOMER_CLAIM_DAYS;
}

function canViewRecord(state, viewer, record = {}) {
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  if (role.customerScope === "all") return true;
  if (ownsRecord(record, viewer)) return true;
  const owner = findUser(state.users, record.ownerId, record.owner);
  const unitId = record.unitId || owner.unitId;
  const zone = record.zone || owner.zone || normalizeZone(record.region || record.city || record.unit);
  const managedUnits = managedOrgUnitIds(state, viewer);
  if (Array.isArray(viewer.managedUnitIds) && viewer.managedUnitIds.includes(unitId)) return true;
  if (managedUnits.has(String(unitId))) return true;
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
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature || !secureTextEqual(signTokenPayload(encodedPayload), signature)) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const issuedAt = Number(payload.iat || 0);
    if (!issuedAt || issuedAt > Date.now() + 60 * 1000 || Date.now() - issuedAt > TOKEN_TTL_MS) return null;
    const user = state.users.find((item) => Number(item.id) === Number(payload.id)) || null;
    if (!user || Number(payload.authVersion) !== Number(user.authVersion || 1)) return null;
    return user;
  } catch {
    return null;
  }
}

function canUseAdmin(state, user) {
  if (!user) return false;
  const role = findRole(state.roles, user.roleId, user.role);
  return (role.permissions || []).includes("admin");
}

function canImportPublicPool(state, user) {
  if (!user) return false;
  const role = findRole(state.roles, user.roleId, user.role);
  const permissions = role.permissions || [];
  return permissions.includes("admin") || permissions.includes(PUBLIC_POOL_IMPORT_PERMISSION);
}

function canHardDeleteCustomer(state, user) {
  if (!user) return false;
  const roleName = findRole(state.roles, user.roleId, user.role).name || user.role || "";
  return ["总负责人", "管理员"].includes(roleName);
}

function canManageTargets(state, user) {
  if (!user) return false;
  return findRole(state.roles, user.roleId, user.role).customerScope !== "self";
}

function canViewTarget(state, viewer, target = {}) {
  if (!viewer) return false;
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  if (role.customerScope === "all") return true;
  if (target.scopeType === "user" && String(target.scopeId) === String(viewer.id)) return true;
  if (target.scopeType === "unit" && String(target.scopeId) === String(viewer.unitId)) return true;
  if (target.scopeType === "zone" && target.scopeId === viewer.zone) return role.customerScope === "zone";
  if (target.scopeType === "user") {
    const user = findUser(state.users, target.scopeId, target.scopeName);
    if (role.customerScope === "zone") return user.zone === viewer.zone;
    if (role.customerScope === "unit") return user.unitId === viewer.unitId;
  }
  if (target.scopeType === "unit" && role.customerScope === "zone") {
    return findUnit(state.units, target.scopeId, target.scopeName).zone === viewer.zone;
  }
  return false;
}

function canManageTargetScope(state, viewer, target = {}) {
  if (!canManageTargets(state, viewer)) return false;
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  if (role.customerScope === "all") return true;
  if (target.scopeType === "company") return false;
  if (role.customerScope === "zone") {
    const managed = managedOrgUnitIds(state, viewer);
    if (target.scopeType === "zone") return target.scopeId === viewer.zone;
    if (target.scopeType === "unit") return managed.has(String(target.scopeId));
    const user = findUser(state.users, target.scopeId, target.scopeName);
    return target.scopeType === "user" && (managed.has(String(user.unitId)) || user.zone === viewer.zone);
  }
  if (role.customerScope === "unit") {
    const managed = managedOrgUnitIds(state, viewer);
    if (target.scopeType === "unit") return managed.has(String(target.scopeId));
    const user = findUser(state.users, target.scopeId, target.scopeName);
    return target.scopeType === "user" && managed.has(String(user.unitId));
  }
  return false;
}

function normalizeMonth(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}$/.test(text) ? text : today().slice(0, 7);
}

function monthRange(month) {
  const normalized = normalizeMonth(month);
  const [year, monthNumber] = normalized.split("-").map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { month: normalized, start: `${normalized}-01`, end };
}

function normalizeDashboardRange(query = {}) {
  const fallback = monthRange(query.month);
  const start = /^\d{4}-\d{2}-\d{2}$/.test(query.start || "") ? query.start : fallback.start;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(query.end || "") ? query.end : fallback.end;
  return start <= end ? { month: start.slice(0, 7), start, end } : { month: end.slice(0, 7), start: end, end: start };
}

function inRange(value, start, end) {
  const date = String(value || "").slice(0, 10);
  return Boolean(date) && date >= start && date <= end;
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, Math.round((endTime - startTime) / (24 * 60 * 60 * 1000)));
}

function dashboardScopeOptions(state, viewer) {
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  const options = [{ type: "user", id: String(viewer.id), name: `${viewer.name}（本人）` }];
  if (role.customerScope === "self") return options;
  if (role.customerScope === "unit") options.unshift({ type: "unit", id: String(viewer.unitId || ""), name: viewer.unit || "本单位" });
  if (role.customerScope === "zone") options.unshift({ type: "zone", id: viewer.zone || "", name: viewer.zone || "本战区" });
  if (role.customerScope === "all") options.unshift({ type: "company", id: "company", name: "全公司" });
  const visible = visibleUsers(state, viewer);
  const units = (state.units || []).filter((unit) => visible.some((user) => String(user.unitId) === String(unit.id)));
  if (["unit", "zone", "all"].includes(role.customerScope)) {
    units.forEach((unit) => options.push({ type: "unit", id: String(unit.id), name: unit.path || unit.name }));
  }
  if (role.customerScope === "all") {
    [...new Set(visible.map((user) => user.zone).filter(Boolean))].forEach((zone) => options.push({ type: "zone", id: zone, name: zone }));
  }
  visible
    .filter((user) => findRole(state.roles, user.roleId, user.role).name === "销售")
    .forEach((user) => options.push({ type: "user", id: String(user.id), name: user.name }));
  return [...new Map(options.filter((item) => item.id).map((item) => [`${item.type}:${item.id}`, item])).values()];
}

function resolveDashboardScope(state, viewer, query = {}) {
  const options = dashboardScopeOptions(state, viewer);
  const requested = options.find((item) => item.type === query.scopeType && String(item.id) === String(query.scopeId));
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  const fallbackType = role.customerScope === "all" ? "company" : role.customerScope === "zone" ? "zone" : role.customerScope === "unit" ? "unit" : "user";
  return requested || options.find((item) => item.type === fallbackType) || options[0];
}

function recordMatchesScope(state, record, scope) {
  const owner = findUser(state.users, record.ownerId, record.owner);
  const unitId = record.unitId || owner.unitId;
  const zone = record.zone || owner.zone || normalizeZone(record.region || record.city || record.unit);
  if (scope.type === "company") return true;
  if (scope.type === "zone") return zone === scope.id;
  if (scope.type === "unit") return unitDescendantIds(state.units || [], scope.id).has(String(unitId));
  return Number(record.ownerId || owner.id) === Number(scope.id);
}

function paymentOwnerFor(state, customer = {}) {
  return findUser(
    state.users,
    customer.paymentOwnerId || customer.ownerId,
    customer.paymentOwner || customer.owner
  );
}

function paymentRecordFor(state, customer = {}) {
  const owner = paymentOwnerFor(state, customer);
  return {
    ownerId: owner.id || customer.paymentOwnerId || customer.ownerId,
    owner: owner.name || customer.paymentOwner || customer.owner,
    unitId: owner.unitId || customer.unitId,
    unit: owner.unit || customer.unit,
    zone: owner.zone || customer.zone,
    region: owner.zone || customer.region
  };
}

function targetScopeName(state, target) {
  if (target.scopeType === "company") return "全公司";
  if (target.scopeType === "zone") return target.scopeId;
  if (target.scopeType === "unit") return findUnit(state.units, target.scopeId, target.scopeName).name;
  return findUser(state.users, target.scopeId, target.scopeName).name || target.scopeName;
}

function sumTargets(items = []) {
  const result = Object.fromEntries(TARGET_FIELDS.map((field) => [field, 0]));
  items.forEach((item) => TARGET_FIELDS.forEach((field) => { result[field] += Number(item[field] || 0); }));
  return result;
}

function effectiveTarget(state, month, scope) {
  const monthly = (state.targets || []).filter((item) => item.month === month);
  const direct = monthly.find((item) => item.scopeType === scope.type && String(item.scopeId) === String(scope.id));
  if (direct && TARGET_FIELDS.some((field) => Number(direct[field] || 0) > 0)) return { ...direct, source: "direct" };
  let children = [];
  if (scope.type === "company") children = monthly.filter((item) => item.scopeType === "zone");
  if (scope.type === "zone") children = monthly.filter((item) => item.scopeType === "unit" && findUnit(state.units, item.scopeId, item.scopeName).zone === scope.id);
  if (scope.type === "unit") children = monthly.filter((item) => item.scopeType === "user" && String(findUser(state.users, item.scopeId, item.scopeName).unitId) === String(scope.id));
  if (!children.length && scope.type === "company") children = monthly.filter((item) => item.scopeType === "unit");
  if (!children.length && ["company", "zone"].includes(scope.type)) {
    children = monthly.filter((item) => item.scopeType === "user" && (scope.type === "company" || findUser(state.users, item.scopeId, item.scopeName).zone === scope.id));
  }
  return { id: "", month, scopeType: scope.type, scopeId: scope.id, scopeName: scope.name, ...sumTargets(children), source: children.length ? "aggregate" : "empty" };
}

function targetOptionsForManagement(state, viewer) {
  return dashboardScopeOptions(state, viewer).filter((item) => {
    if (!canManageTargets(state, viewer)) return false;
    return canManageTargetScope(state, viewer, { scopeType: item.type, scopeId: item.id, scopeName: item.name });
  });
}

function buildTargetManagement(state, viewer, month) {
  return {
    month,
    canManage: canManageTargets(state, viewer),
    options: targetOptionsForManagement(state, viewer),
    targets: (state.targets || [])
      .filter((item) => item.month === month && canViewTarget(state, viewer, item))
      .map((item) => ({ ...item, scopeName: targetScopeName(state, item) }))
  };
}

function validateCustomerBusinessUpdate(previous = {}, body = {}, creating = false) {
  const nextStage = body.stage || previous.stage || "名单";
  const stageChanged = creating || nextStage !== previous.stage;
  const demoAt = body.demoAt !== undefined ? body.demoAt : previous.demoAt;
  const contractAmount = body.contractAmount !== undefined ? normalizeMoney(body.contractAmount) : normalizeMoney(previous.contractAmount);
  const paymentAmount = body.paymentAmount !== undefined ? normalizeMoney(body.paymentAmount) : normalizeMoney(previous.paymentAmount);
  const paymentDate = body.paymentDate !== undefined ? body.paymentDate : previous.paymentDate;
  if (stageChanged && STAGES.indexOf(nextStage) >= STAGES.indexOf("商机") && !demoAt) return "进入商机前必须填写有效演示时间";
  if (stageChanged && nextStage === "成交" && contractAmount <= 0) return "进入成交前必须填写合同金额";
  if (paymentAmount > 0 && !paymentDate) return "填写实际进款后必须选择进款日期";
  if (paymentDate && paymentAmount <= 0) return "填写进款日期前必须填写实际进款金额";
  return "";
}

function percentage(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10 : 0;
}

function customerFollowStats(customer, referenceDate = today()) {
  const history = customer.followUps || [];
  let due = 0;
  let onTime = 0;
  history.forEach((item, index) => {
    if (!item.nextFollow || item.nextFollow > referenceDate) return;
    due += 1;
    const next = history[index + 1];
    if (next && String(next.date || "") <= item.nextFollow) onTime += 1;
  });
  return { due, onTime };
}

function distribution(values = [], limit = 6) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => {
    const name = String(value).trim();
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

function softwareNames(value) {
  return String(value || "")
    .split(/[+、，,\/]/)
    .map((item) => item.trim())
    .filter((item) => item && !isUnknownSoftwareValue(item) && item !== "Excel排产" && item !== "手工报价");
}

function isUnknownSoftwareValue(value) {
  return /^(待补充|未知|未确认软件|软件待确认|未录入|无|暂无|-)$/.test(String(value || "").trim());
}

function displaySoftwareName(value) {
  const text = String(value || "").trim();
  return text && !/^(待补充|-)$/.test(text) ? text : UNKNOWN_SOFTWARE;
}

function buildTrend(customers, range, revenueCustomers = customers) {
  const days = daysBetween(range.start, range.end) + 1;
  const buckets = new Map();
  const keyFor = (date) => days <= 45 ? date : date.slice(0, 7);
  const labelFor = (key) => days <= 45 ? key.slice(5) : key;
  if (days <= 45) {
    for (let date = range.start; date <= range.end; date = addDays(date, 1)) buckets.set(date, { key: date, label: labelFor(date), revenue: 0, contract: 0, deals: 0 });
  } else {
    let month = range.start.slice(0, 7);
    const last = range.end.slice(0, 7);
    while (month <= last) {
      buckets.set(month, { key: month, label: month, revenue: 0, contract: 0, deals: 0 });
      const [year, number] = month.split("-").map(Number);
      month = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 7);
    }
  }
  revenueCustomers.forEach((customer) => {
    if (inRange(customer.paymentDate, range.start, range.end)) {
      const bucket = buckets.get(keyFor(customer.paymentDate));
      if (bucket) bucket.revenue += Number(customer.paymentAmount || 0);
    }
  });
  customers.forEach((customer) => {
    if (inRange(customer.dealAt, range.start, range.end)) {
      const bucket = buckets.get(keyFor(customer.dealAt));
      if (bucket) {
        bucket.contract += Number(customer.contractAmount || 0);
        bucket.deals += 1;
      }
    }
  });
  return [...buckets.values()].map((item) => ({ ...item, revenue: normalizeMoney(item.revenue), contract: normalizeMoney(item.contract) }));
}

function buildFunnel(customers, range) {
  const rollingStart = addDays(range.end, -89);
  const fields = ["createdAt", "leadAt", "opportunityAt", "dealAt"];
  const thresholds = [7, 15, 30, 0];
  return STAGES.map((stage, index) => {
    const field = fields[index];
    const nextField = fields[index + 1];
    const periodCount = customers.filter((item) => inRange(item[field], range.start, range.end)).length;
    const cohort = customers.filter((item) => inRange(item[field], rollingStart, range.end));
    const converted = nextField ? cohort.filter((item) => item[nextField] && item[nextField] <= range.end).length : cohort.length;
    const stayValues = customers
      .filter((item) => item[field] && item[field] <= range.end)
      .map((item) => daysBetween(item[field], item[nextField] && item[nextField] <= range.end ? item[nextField] : range.end));
    const overdue = thresholds[index]
      ? customers.filter((item) => item.stage === stage && item[field] && daysBetween(item[field], range.end) > thresholds[index]).length
      : 0;
    return {
      stage,
      count: periodCount,
      conversionRate: nextField ? percentage(converted, cohort.length) : 100,
      averageStayDays: average(stayValues),
      overdue,
      thresholdDays: thresholds[index]
    };
  });
}

function buildRanking(state, viewer, selectedScope, range) {
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  let users = (state.users || []).filter((user) => findRole(state.roles, user.roleId, user.role).name === "销售");
  if (role.customerScope === "self") users = users.filter((user) => String(user.unitId) === String(viewer.unitId));
  else users = users.filter((user) => canViewRecord(state, viewer, { ownerId: user.id, owner: user.name, unitId: user.unitId, zone: user.zone }));
  if (role.customerScope !== "self" && selectedScope.type !== "company") {
    users = users.filter((user) => recordMatchesScope(state, { ownerId: user.id, owner: user.name, unitId: user.unitId, zone: user.zone }, selectedScope));
  }
  return users.map((user) => {
    const customers = (state.customers || []).filter((item) => Number(item.ownerId) === Number(user.id) || cleanText(item.owner) === cleanText(user.name));
    const revenue = (state.customers || [])
      .filter((item) => Number(paymentOwnerFor(state, item).id) === Number(user.id) && inRange(item.paymentDate, range.start, range.end))
      .reduce((sum, item) => sum + Number(item.paymentAmount || 0), 0);
    const deals = customers.filter((item) => inRange(item.dealAt, range.start, range.end)).length;
    const opportunities = customers.filter((item) => inRange(item.opportunityAt, range.start, range.end)).length;
    const rollingStart = addDays(range.end, -89);
    const rollingOpportunities = customers.filter((item) => inRange(item.opportunityAt, rollingStart, range.end));
    const rollingDeals = rollingOpportunities.filter((item) => item.dealAt && item.dealAt <= range.end).length;
    const follow = customers.map((item) => customerFollowStats(item, range.end)).reduce((acc, item) => ({ due: acc.due + item.due, onTime: acc.onTime + item.onTime }), { due: 0, onTime: 0 });
    const overdue = customers.filter((item) => item.nextFollow && item.nextFollow < today()).length;
    const target = effectiveTarget(state, range.month, { type: "user", id: String(user.id), name: user.name });
    return {
      userId: user.id,
      name: user.name,
      unit: user.unit || "待分配",
      revenue: normalizeMoney(revenue),
      target: target.revenueTarget || 0,
      completionRate: percentage(revenue, target.revenueTarget),
      deals,
      opportunities,
      conversionRate: percentage(rollingDeals, rollingOpportunities.length),
      onTimeRate: percentage(follow.onTime, follow.due),
      overdue
    };
  }).sort((a, b) => b.revenue - a.revenue || b.deals - a.deals || b.conversionRate - a.conversionRate);
}

function buildUnitRanking(state, viewer, selectedScope, range, scopedCustomers) {
  const role = findRole(state.roles, viewer.roleId, viewer.role);
  if (role.customerScope === "self") return [];
  const groups = new Map();
  const visible = visibleUsers(state, viewer)
    .filter((user) => findRole(state.roles, user.roleId, user.role).name === "销售")
    .filter((user) => selectedScope.type === "company" || recordMatchesScope(state, { ownerId: user.id, unitId: user.unitId, zone: user.zone }, selectedScope));
  visible.forEach((user) => {
    const id = String(user.unitId || stableId("unit", user.unit || "待分配"));
    if (!groups.has(id)) groups.set(id, { id, name: user.unit || "待分配", zone: user.zone || "待分区", customers: [] });
  });
  scopedCustomers.forEach((customer) => {
    const owner = findUser(state.users, customer.ownerId, customer.owner);
    const id = String(customer.unitId || owner.unitId || stableId("unit", customer.unit || owner.unit || "待分配"));
    if (!groups.has(id)) groups.set(id, { id, name: customer.unit || owner.unit || "待分配", zone: customer.zone || owner.zone || "待分区", customers: [] });
    groups.get(id).customers.push(customer);
  });
  const rollingStart = addDays(range.end, -89);
  return [...groups.values()].map((group) => {
    const revenue = (state.customers || [])
      .filter((item) => {
        const paymentRecord = paymentRecordFor(state, item);
        return String(paymentRecord.unitId) === String(group.id) && inRange(item.paymentDate, range.start, range.end);
      })
      .reduce((sum, item) => sum + Number(item.paymentAmount || 0), 0);
    const deals = group.customers.filter((item) => inRange(item.dealAt, range.start, range.end)).length;
    const opportunities = group.customers.filter((item) => inRange(item.opportunityAt, range.start, range.end)).length;
    const rollingOpportunities = group.customers.filter((item) => inRange(item.opportunityAt, rollingStart, range.end));
    const rollingDeals = rollingOpportunities.filter((item) => item.dealAt && item.dealAt <= range.end).length;
    const overdue = group.customers.filter((item) => item.nextFollow && item.nextFollow < today()).length;
    const target = effectiveTarget(state, range.month, { type: "unit", id: group.id, name: group.name });
    return {
      unitId: group.id,
      name: group.name,
      zone: group.zone,
      revenue: normalizeMoney(revenue),
      target: target.revenueTarget || 0,
      completionRate: percentage(revenue, target.revenueTarget),
      deals,
      opportunities,
      conversionRate: percentage(rollingDeals, rollingOpportunities.length),
      overdue
    };
  }).sort((a, b) => b.revenue - a.revenue || b.deals - a.deals || b.conversionRate - a.conversionRate);
}

function actionCustomer(state, item) {
  const assignment = latestAssignmentActionToday(state, item) || {};
  return {
    id: item.id,
    opportunityId: item.opportunityId || item.id,
    customerId: item.customerId || item.id,
    name: item.name,
    stage: item.stage,
    owner: item.owner,
    followPerson: item.followPerson || item.owner || "",
    productName: item.productName || "",
    assignedAt: assignment.createdAt || "",
    assignedBy: assignment.operator || "",
    nextFollow: item.nextFollow || "",
    amount: item.contractAmount || item.amount || 0
  };
}

const ASSIGNMENT_ACTION_TYPES = new Set(["created", "assigned", "claimed_public_pool", "offboard_transfer"]);

function canCreateAssignmentReminder(state, user = {}) {
  if (!user?.id || user.status === "停用") return false;
  const role = findRole(state.roles, user.roleId, user.role);
  return role.customerScope !== "self" || (role.permissions || []).includes("publicPoolImport") || (role.permissions || []).includes("admin");
}

function assignmentActionCounts(state, item = {}, event = {}) {
  const targetId = Number(event.toOwnerId || item.ownerId || 0);
  if (!targetId) return false;
  const operator = findUser(state.users || [], event.operatorId, event.operator || item.createdBy);
  if (!operator || Number(operator.id) === targetId) return false;
  if (!canCreateAssignmentReminder(state, operator)) return false;
  if (event.type === "claimed_public_pool") return false;
  return true;
}

function latestAssignmentActionToday(state, item = {}, date = today()) {
  const events = Array.isArray(item.ownershipHistory) ? item.ownershipHistory : [];
  const candidates = events
    .filter((event) => ASSIGNMENT_ACTION_TYPES.has(event.type))
    .filter((event) => String(event.createdAt || "").slice(0, 10) === date)
    .filter((event) => assignmentActionCounts(state, item, event))
    .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
  if (candidates[0]) return candidates[0];
  return null;
}

function hasManualFollowOnOrAfter(item = {}, actionAt = "") {
  const actionTime = Date.parse(actionAt);
  const actionDate = String(actionAt || "").slice(0, 10);
  return (item.followUps || []).some((follow) => {
    if (!isManualEffectiveFollow(follow)) return false;
    const followTime = Date.parse(follow.createdAt || "");
    if (Number.isFinite(actionTime) && Number.isFinite(followTime)) return followTime >= actionTime;
    const followDate = String(follow.date || follow.createdAt || "").slice(0, 10);
    return actionDate && followDate >= actionDate;
  });
}

function isAssignedTodayUnfollowed(state, item = {}) {
  if (item.stage === "成交" || isOpportunityPublicPool(item) || isPurchasedOpportunity(item)) return false;
  const assignment = latestAssignmentActionToday(state, item);
  if (!assignment?.createdAt) return false;
  return !hasManualFollowOnOrAfter(item, assignment.createdAt);
}

function actionOwnerSummary(items = []) {
  const groups = items.reduce((map, item) => {
    const owner = item.followPerson || item.owner || "未分配";
    map[owner] = (map[owner] || 0) + 1;
    return map;
  }, {});
  return Object.entries(groups)
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-Hans-CN"));
}

function buildActions(state, customers, range) {
  const groups = [
    { key: "today", label: "今日待跟进", test: (item) => item.nextFollow === today() },
    { key: "assignedTodayUnfollowed", label: "今日分配未跟进", test: (item) => isAssignedTodayUnfollowed(state, item) },
    { key: "overdue", label: "逾期跟进", test: (item) => item.nextFollow && item.nextFollow < today() },
    { key: "highIntent", label: "高意向商机", test: (item) => item.stage === "商机" && Boolean(item.demoAt) },
    { key: "contractPending", label: "待合同金额", test: (item) => item.stage === "成交" && Number(item.contractAmount || 0) <= 0 },
    { key: "paymentPending", label: "成交待进款", test: (item) => item.stage === "成交" && Number(item.paymentAmount || 0) < Number(item.contractAmount || 0) },
    { key: "stalled", label: "长期未推进", test: (item) => ["线索", "商机"].includes(item.stage) && daysBetween(item.lastFollow || item.createdAt, range.end) > (item.stage === "商机" ? 30 : 15) }
  ];
  return groups.map((group) => {
    const matches = customers.filter(group.test);
    return {
      key: group.key,
      label: group.label,
      count: matches.length,
      customerIds: matches.map((item) => item.id),
      opportunityIds: matches.map((item) => item.opportunityId || item.id),
      ownerSummary: actionOwnerSummary(matches),
      customers: matches.slice(0, 8).map((item) => actionCustomer(state, item))
    };
  });
}

function buildFollowLeaderboard(state, viewer, scope, customers = []) {
  const date = today();
  const scopedUsers = visibleUsers(state, viewer)
    .filter((user) => canOwnCustomerUser(state, user))
    .filter((user) => recordMatchesScope(state, user, scope));
  const counts = new Map(scopedUsers.map((user) => [Number(user.id), 0]));
  const nameToUser = new Map(scopedUsers.map((user) => [cleanText(user.name), user]));
  customers.forEach((item) => {
    (item.followUps || []).forEach((follow) => {
      if (!isManualEffectiveFollow(follow)) return;
      if (String(follow.createdAt || follow.date || "").slice(0, 10) !== date) return;
      const user = nameToUser.get(cleanText(follow.author));
      if (!user) return;
      counts.set(Number(user.id), (counts.get(Number(user.id)) || 0) + 1);
    });
  });
  const rows = scopedUsers.map((user) => ({
    userId: user.id,
    name: user.name,
    unit: user.unit || "",
    zone: user.zone || "",
    count: counts.get(Number(user.id)) || 0
  }));
  return {
    red: rows.filter((item) => item.count > 0).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-Hans-CN")).slice(0, 10),
    black: rows.sort((left, right) => left.count - right.count || left.name.localeCompare(right.name, "zh-Hans-CN")).slice(0, 10)
  };
}

function buildInsights(summary, funnel, actions, industry, target) {
  const insights = [];
  const weakest = funnel.slice(0, 3).sort((a, b) => a.conversionRate - b.conversionRate)[0];
  if (weakest) insights.push({ title: `${weakest.stage}环节转化偏弱`, detail: `滚动90天转化率为${weakest.conversionRate}%，建议优先复盘该阶段未推进客户。` });
  if (target.revenueTarget > 0) {
    const gap = Math.max(0, target.revenueTarget - summary.revenue);
    insights.push({ title: gap ? `进款目标还差${formatMoneyYuan(gap)}` : "本月进款目标已完成", detail: gap ? `当前完成率${summary.targetCompletionRate}%，优先推进已成交待进款客户。` : `当前完成率${summary.targetCompletionRate}%，继续保障已签客户交付。` });
  } else {
    insights.push({ title: "本月尚未设置进款目标", detail: "主管以上可在看板中设置目标，设置后小智会计算差额与完成率。" });
  }
  const pendingPayment = actions.find((item) => item.key === "paymentPending")?.count || 0;
  if (pendingPayment) insights.push({ title: `${pendingPayment}家成交客户尚未足额进款`, detail: "请核对合同金额、实际进款和进款日期，避免成交与现金结果脱节。" });
  const topLoss = industry.lossReasons[0];
  if (topLoss) insights.push({ title: `主要目前未成交原因：${topLoss.name}`, detail: `当前记录${topLoss.count}家，建议将成功案例和标准应对话术补入知识库。` });
  const topFunctionLoss = industry.functionLossReasons?.[0];
  if (topFunctionLoss) insights.push({ title: `高频功能缺口：${topFunctionLoss.name}`, detail: `功能原因中该项出现${topFunctionLoss.count}次，可汇总给技术评估产品计划。` });
  return insights.slice(0, 4);
}

function dashboardCacheKey(viewer = {}, query = {}) {
  const normalizedQuery = Object.keys(query || {})
    .sort()
    .reduce((result, key) => {
      result[key] = query[key];
      return result;
    }, {});
  return JSON.stringify({
    userId: viewer.id,
    roleId: viewer.roleId,
    authVersion: viewer.authVersion || 1,
    query: normalizedQuery
  });
}

function buildDashboardCached(state, viewer, query = {}) {
  const key = dashboardCacheKey(viewer, query);
  const now = Date.now();
  const cached = dashboardCache.get(key);
  if (cached && DASHBOARD_CACHE_TTL_MS > 0 && now - cached.time < DASHBOARD_CACHE_TTL_MS) {
    return { ...cached.data, cached: true, computedAt: cached.computedAt };
  }
  const data = buildDashboard(state, viewer, query);
  const computedAt = new Date(now).toISOString();
  const payload = { ...data, cached: false, computedAt };
  dashboardCache.set(key, { time: now, computedAt, data: payload });
  if (dashboardCache.size > 200) {
    const oldestKey = dashboardCache.keys().next().value;
    if (oldestKey) dashboardCache.delete(oldestKey);
  }
  return payload;
}

function buildDashboard(state, viewer, query = {}) {
  const range = normalizeDashboardRange(query);
  const scopeOptions = dashboardScopeOptions(state, viewer);
  const scope = resolveDashboardScope(state, viewer, query);
  const activeCustomers = (state.customers || []).filter((item) => item.lifecycleStatus !== LIFECYCLE_ARCHIVED);
  const activeCustomerIds = new Set(activeCustomers.map((item) => Number(item.id)));
  const activeOpportunities = (state.opportunities || [])
    .filter((item) => activeCustomerIds.has(Number(item.customerId)) && !isOpportunityPublicPool(item) && !isPurchasedOpportunity(item))
    .map((item) => opportunityView(state, item));
  const dashboardState = { ...state, customers: activeOpportunities };
  const publicPoolCount = visiblePublicPoolOpportunities(state, viewer).filter((item) => recordMatchesScope(state, opportunityView(state, item), scope)).length;
  const customers = activeOpportunities.filter((item) => canViewOpportunity(state, viewer, item) && recordMatchesScope(state, item, scope));
  const customerMasterIds = new Set(customers.map((item) => Number(item.customerId)));
  const customerMasters = activeCustomers.filter((item) => customerMasterIds.has(Number(item.id)));
  const visits = (state.visits || []).filter((item) => canViewRecord(state, viewer, item) && recordMatchesScope(state, item, scope));
  const revenueCustomers = activeOpportunities.filter((item) => {
    const paymentRecord = paymentRecordFor(dashboardState, item);
    return canViewRecord(dashboardState, viewer, paymentRecord) && recordMatchesScope(dashboardState, paymentRecord, scope);
  });
  const revenue = revenueCustomers.filter((item) => inRange(item.paymentDate, range.start, range.end)).reduce((sum, item) => sum + Number(item.paymentAmount || 0), 0);
  const contract = customers.filter((item) => inRange(item.dealAt, range.start, range.end)).reduce((sum, item) => sum + Number(item.contractAmount || 0), 0);
  const deals = customers.filter((item) => inRange(item.dealAt, range.start, range.end));
  const lists = customers.filter((item) => inRange(item.createdAt, range.start, range.end));
  const leads = customers.filter((item) => inRange(item.leadAt, range.start, range.end));
  const opportunities = customers.filter((item) => inRange(item.opportunityAt, range.start, range.end));
  const rollingStart = addDays(range.end, -89);
  const rollingOpportunities = customers.filter((item) => inRange(item.opportunityAt, rollingStart, range.end));
  const rollingDeals = rollingOpportunities.filter((item) => item.dealAt && item.dealAt <= range.end);
  const overdueOpportunities = customers.filter((item) => item.stage === "商机" && item.nextFollow && item.nextFollow < today());
  const target = effectiveTarget(state, range.month, scope);
  const funnel = buildFunnel(customers, range);
  const summary = {
    revenue: normalizeMoney(revenue),
    contract: normalizeMoney(contract),
    deals: deals.length,
    targetCompletionRate: percentage(revenue, target.revenueTarget),
    lists: lists.length,
    leads: leads.length,
    opportunities: opportunities.length,
    opportunityCloseRate: percentage(rollingDeals.length, rollingOpportunities.length),
    overdueOpportunities: overdueOpportunities.length,
    averageDealCycle: average(deals.map((item) => daysBetween(item.createdAt, item.dealAt))),
    averageContractValue: deals.length ? normalizeMoney(contract / deals.length) : 0,
    publicPool: publicPoolCount
  };
  const lossReasons = distribution([...customers.map((item) => item.lossReason), ...visits.map((item) => item.lossReason)]);
  const functionLossReasons = distribution([
    ...customers.filter((item) => item.lossReason === "功能原因").map((item) => item.lossReasonDetail),
    ...visits.filter((item) => item.lossReason === "功能原因").map((item) => item.lossReasonDetail)
  ]);
  const industry = {
    software: distribution(customerMasters.flatMap((item) => softwareNames(primaryCompetitorName(item) || item.software))),
    equipmentBrands: distribution(visits.flatMap((item) => [item.cuttingBrand, item.drillingBrand]).filter(Boolean)),
    lossReasons,
    functionLossReasons,
    cities: distribution(visits.map((item) => item.city || item.address)),
    profileCompleteness: percentage(customerMasters.filter((item) => item.phone && item.address && !isUnknownSoftwareValue(primaryCompetitorName(item) || item.software) && (item.contacts || []).length).length, customerMasters.length)
  };
  const actions = buildActions(state, customers, range);
  const drilldowns = {
    revenue: revenueCustomers.filter((item) => inRange(item.paymentDate, range.start, range.end)).map((item) => actionCustomer(state, item)),
    contract: deals.map((item) => actionCustomer(state, item)),
    deals: deals.map((item) => actionCustomer(state, item)),
    lists: lists.map((item) => actionCustomer(state, item)),
    opportunities: opportunities.map((item) => actionCustomer(state, item)),
    overdueOpportunities: overdueOpportunities.map((item) => actionCustomer(state, item))
  };
  return {
    range,
    scope,
    scopeOptions,
    canManageTargets: canManageTargets(state, viewer),
    target,
    summary,
    funnel,
    trend: buildTrend(customers, range, revenueCustomers),
    ranking: buildRanking(dashboardState, viewer, scope, range),
    unitRanking: buildUnitRanking(dashboardState, viewer, scope, range, customers),
    followLeaderboard: buildFollowLeaderboard(state, viewer, scope, customers),
    industry,
    actions,
    drilldowns,
    insights: buildInsights(summary, funnel, actions, industry, target)
  };
}

function canAssignCustomers(state, user) {
  if (!user) return false;
  const role = findRole(state.roles, user.roleId, user.role);
  return role.customerScope !== "self" || (role.permissions || []).includes("admin");
}

function buildAssignedCustomer(state, viewer, customer, target, body = {}) {
  const previousStage = customer.stage;
  const wasPublicPool = isCustomerPublicPool(customer);
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
    ownershipStatus: wasPublicPool ? OWNERSHIP_PENDING : OWNERSHIP_LOCKED,
    claimUntil: wasPublicPool ? addDaysToIso(new Date().toISOString(), CUSTOMER_CLAIM_DAYS) : customer.claimUntil,
    effectiveFollowUpAt: wasPublicPool ? "" : customer.effectiveFollowUpAt,
    publicPoolAt: "",
    publicPoolReason: "",
    ownershipHistory: [
      ...(customer.ownershipHistory || []),
      ownershipEvent("assigned", customer, target, viewer, body.reason || "主管分配")
    ],
    lastFollow: today(),
    nextFollow: body.nextFollow || customer.nextFollow || "",
    lastNote: note
  }, state);
  if (previousStage !== next.stage) setStageTime(next, next.stage, body.date || today());
  next.followUps.push({
    date: today(),
    createdAt: new Date().toISOString(),
    author: viewer.name || "管理员",
    note,
    nextFollow: body.nextFollow || "",
    isSystem: true
  });
  return { next, previousStage };
}

function isCustomerAssignable(customer = {}) {
  if (isCustomerPublicPool(customer)) return customer.stage !== "成交";
  if (customer.stage === "名单") return true;
  if (!["线索", "商机"].includes(customer.stage)) return false;
  const latest = latestCustomerFollow(customer);
  if (!latest) return true;
  return daysSince(latest) >= REASSIGN_DAYS;
}

function latestCustomerFollow(customer = {}) {
  return latestEffectiveManualFollowAt(customer) || customer.effectiveFollowUpAt || customer.createdAt || "";
}

function daysSince(dateText) {
  const time = Date.parse(dateText);
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.parse(today()) - time) / (24 * 60 * 60 * 1000));
}

function findAssignableSalesUser(state, viewer, ownerId, ownerName) {
  const candidates = visibleUsers(state, viewer).filter((user) => canOwnCustomerUser(state, user));
  return (
    candidates.find((user) => ownerId && Number(user.id) === Number(ownerId)) ||
    candidates.find((user) => ownerName && cleanText(user.name) === cleanText(ownerName)) ||
    null
  );
}

function toMiniCustomer(customer) {
  const latest = (customer.followUps || [])[customer.followUps.length - 1] || {};
  const publicPool = customerPublicPoolInfo(customer);
  const ownershipStatus = effectiveOwnershipStatus(customer);
  return {
    ...customer,
    ownershipStatus,
    publicPoolAt: publicPool.at,
    publicPoolReason: publicPool.reason,
    claimable: publicPool.isPublic,
    claimDaysRemaining: ownershipStatus === OWNERSHIP_PENDING ? claimDaysRemaining(customer.claimUntil) : 0,
    lastFollow: latest.date || "",
    nextFollow: latest.nextFollow || "",
    lastNote: latest.note || "",
    followUps: (customer.followUps || []).map((item) => normalizeFollowUp(item, customer))
  };
}

function readState() {
  ensureDataFile();
  const signature = fileSignature(DATA_FILE);
  if (stateCache && stateDirty) return stateCache;
  if (stateCache && signature && signature === stateDiskSignature) return stateCache;
  const raw = readJsonFileWithBackup(DATA_FILE, BACKUP_FILE);
  const migrated = migrateState(raw);
  stateCache = migrated;
  rebuildStateIndexes(stateCache);
  if (JSON.stringify(raw) !== JSON.stringify(migrated)) {
    persistStateNow("migration", { backupBeforeWrite: false, refreshBackupAfterWrite: true });
  } else {
    stateDiskSignature = fileSignature(DATA_FILE);
  }
  return stateCache;
}

function writeState(state, options = {}) {
  stateCache = state || stateCache;
  rebuildStateIndexes(stateCache);
  stateDirty = true;
  if (options.immediate || STATE_WRITE_DELAY_MS <= 0) {
    persistStateNow(options.reason || "write-through");
    return;
  }
  scheduleStateWrite(options.reason || "queued-write");
}

function scheduleStateWrite(reason = "queued-write") {
  if (stateWriteTimer) clearTimeout(stateWriteTimer);
  stateWriteTimer = setTimeout(() => {
    stateWriteTimer = null;
    persistStateNow(reason);
  }, STATE_WRITE_DELAY_MS);
  if (typeof stateWriteTimer.unref === "function") stateWriteTimer.unref();
}

function persistStateNow(reason = "manual-flush", options = {}) {
  if (!stateCache) return "";
  if (stateWriteTimer) {
    clearTimeout(stateWriteTimer);
    stateWriteTimer = null;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (options.backupBeforeWrite !== false && isReadableJsonFile(DATA_FILE)) fs.copyFileSync(DATA_FILE, BACKUP_FILE);
  const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(stateCache, null, 2), "utf8");
    fs.renameSync(tempFile, DATA_FILE);
    if (options.refreshBackupAfterWrite) fs.copyFileSync(DATA_FILE, BACKUP_FILE);
    stateDiskSignature = fileSignature(DATA_FILE);
    stateDirty = false;
    return DATA_FILE;
  } finally {
    if (fs.existsSync(tempFile)) fs.rmSync(tempFile, { force: true });
  }
}

function flushStateBeforeExit() {
  if (stateDirty || stateWriteTimer) persistStateNow("shutdown");
}

function emptyStateIndexes() {
  return {
    usersById: new Map(),
    usersByAccount: new Map(),
    customersById: new Map(),
    customersByPhone: new Map(),
    opportunitiesById: new Map(),
    opportunitiesByCustomerId: new Map(),
    unitsById: new Map()
  };
}

function rebuildStateIndexes(state = {}) {
  const indexes = emptyStateIndexes();
  (state.users || []).forEach((user, index) => {
    indexes.usersById.set(Number(user.id), index);
    [user.account, user.username, user.phone].map(cleanAccount).filter(Boolean).forEach((key) => indexes.usersByAccount.set(key, index));
  });
  (state.customers || []).forEach((customer, index) => {
    indexes.customersById.set(Number(customer.id), index);
    const phone = normalizePhone(customer.phoneNormalized || customer.phone);
    if (phone) indexes.customersByPhone.set(phone, index);
  });
  (state.opportunities || []).forEach((opportunity) => {
    indexes.opportunitiesById.set(Number(opportunity.id), opportunity);
    const customerId = Number(opportunity.customerId);
    if (!indexes.opportunitiesByCustomerId.has(customerId)) indexes.opportunitiesByCustomerId.set(customerId, []);
    indexes.opportunitiesByCustomerId.get(customerId).push(opportunity);
  });
  (state.units || []).forEach((unit, index) => indexes.unitsById.set(String(unit.id), index));
  stateIndexes = indexes;
  return indexes;
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SEED_FILE)) fs.copyFileSync(FALLBACK_SEED_FILE, SEED_FILE);
  if (!fs.existsSync(DATA_FILE) && fs.existsSync(BACKUP_FILE)) fs.copyFileSync(BACKUP_FILE, DATA_FILE);
  if (!fs.existsSync(DATA_FILE)) fs.copyFileSync(SEED_FILE, DATA_FILE);
}

function readJsonFileWithBackup(file, backupFile) {
  try {
    return readJsonFile(file);
  } catch (error) {
    const corruptFile = `${file}.corrupt-${Date.now()}`;
    try {
      if (fs.existsSync(file)) fs.copyFileSync(file, corruptFile);
    } catch {}
    try {
      const backup = readJsonFile(backupFile);
      fs.copyFileSync(backupFile, file);
      console.warn(`Recovered state from backup after JSON parse failure. Corrupt copy: ${corruptFile}`);
      return backup;
    } catch (backupError) {
      error.message = `${error.message}; backup recovery failed: ${backupError.message}`;
      throw error;
    }
  }
}

function readJsonFile(file) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.trim()) throw new SyntaxError(`${file} is empty`);
  return JSON.parse(text);
}

function isReadableJsonFile(file) {
  try {
    readJsonFile(file);
    return true;
  } catch {
    return false;
  }
}

function fileSignature(file) {
  try {
    const stat = fs.statSync(file);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return "";
  }
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
        resolve(normalizeIncomingMoneyPayload(JSON.parse(data)));
      } catch {
        reject(new Error("invalid json body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (res.shouldGzipJson && body.length > 1024) {
    try {
      const compressed = zlib.gzipSync(body);
      res.writeHead(status, {
        ...headers,
        "Content-Encoding": "gzip",
        "Vary": "Accept-Encoding",
        "Content-Length": compressed.length
      });
      res.end(compressed);
      return;
    } catch (error) {
      console.error("gzip json failed", error);
    }
  }
  headers["Content-Length"] = body.length;
  res.writeHead(status, {
    ...headers
  });
  res.end(body);
}

function sendNoContent(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end();
}

async function sendCustomerTemplate(res) {
  const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const downloadName = "CRM名单模板.xlsx";
  if (!fs.existsSync(CUSTOMER_TEMPLATE_FILE)) {
    return sendJson(res, 404, { error: "template not found" });
  }
  const fallback = () => sendFile(res, CUSTOMER_TEMPLATE_FILE, contentType, downloadName);
  try {
    const JSZip = resolveOptionalJsZip();
    if (!JSZip) return fallback();
    const state = readState();
    const channels = channelSourceNames(state.channelSources, { includeInactive: false });
    const buffer = await fs.promises.readFile(CUSTOMER_TEMPLATE_FILE);
    const zip = await JSZip.loadAsync(buffer);
    const sheetPath = "xl/worksheets/sheet1.xml";
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) return fallback();
    const xml = await sheetFile.async("string");
    zip.file(sheetPath, upsertSheetListValidations(xml, [
      { range: "C2:C1000", values: IMPORT_STATUSES },
      { range: "F2:F1000", values: channels.length ? channels : CHANNEL_SOURCES }
    ]));
    const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return sendBuffer(res, output, contentType, downloadName);
  } catch (error) {
    console.warn("customer template dynamic validation failed, using static file", error.message);
    return fallback();
  }
}

function resolveOptionalJsZip() {
  try {
    return require("jszip");
  } catch (_) {
    try {
      return require(require.resolve("jszip", {
        paths: [
          path.resolve("node_modules/.pnpm/node_modules"),
          path.resolve("node_modules/.pnpm/jszip@3.10.1/node_modules")
        ]
      }));
    } catch (_) {
      return null;
    }
  }
}

function upsertSheetListValidations(xml, validations) {
  const usesPrefix = /<x:worksheet\b/.test(xml);
  const prefix = usesPrefix ? "x:" : "";
  const validationXml = `<${prefix}dataValidations count="${validations.length}">${validations.map((item) => `
    <${prefix}dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${escapeXml(item.range)}">
      <${prefix}formula1>&quot;${escapeXml(item.values.join(","))}&quot;</${prefix}formula1>
    </${prefix}dataValidation>`).join("")}</${prefix}dataValidations>`;
  const existingPattern = new RegExp(`<${prefix}dataValidations[\\s\\S]*?</${prefix}dataValidations>`);
  if (existingPattern.test(xml)) {
    return xml.replace(existingPattern, validationXml);
  }
  if (xml.includes(`<${prefix}pageMargins`)) {
    return xml.replace(`<${prefix}pageMargins`, `${validationXml}<${prefix}pageMargins`);
  }
  return xml.replace(`</${prefix}worksheet>`, `${validationXml}</${prefix}worksheet>`);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sendBuffer(res, buffer, contentType, downloadName = "") {
  const headers = { "Content-Type": contentType };
  if (downloadName) {
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  }
  res.writeHead(200, headers);
  res.end(buffer);
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
    const contentType = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".txt": "text/plain; charset=utf-8",
      ".md": "text/markdown; charset=utf-8",
      ".csv": "text/csv; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }[ext] || "application/octet-stream";
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

function saveKnowledgeFile(file) {
  if (!file || !file.buffer?.length) throw new Error("上传文件为空");
  const ext = path.extname(file.filename || "").toLowerCase();
  const allowed = new Set([".txt", ".md", ".csv", ".json", ".pdf", ".docx", ".xlsx"]);
  if (!allowed.has(ext)) throw new Error("知识库仅支持 TXT、MD、CSV、JSON、PDF、DOCX、XLSX 文件");
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const originalName = path.basename(file.filename || `knowledge${ext}`).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
  const storedName = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), file.buffer);
  const extracted = extractKnowledgeText(file.buffer, ext);
  const content = normalizeExtractedText(extracted || "文件已上传，但暂未提取到可检索文字。扫描版 PDF 请先转为可复制文字的 PDF。", 120000);
  return {
    title: path.basename(originalName, ext),
    fileName: originalName,
    fileUrl: `/uploads/${storedName}`,
    content
  };
}

function extractKnowledgeText(buffer, ext) {
  if ([".txt", ".md", ".csv"].includes(ext)) return buffer.toString("utf8");
  if (ext === ".json") {
    const text = buffer.toString("utf8");
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  if (ext === ".xlsx") {
    return parseXlsxFirstSheet(buffer)
      .map((row) => row.filter((cell) => String(cell || "").trim()).join(" | "))
      .filter(Boolean)
      .join("\n");
  }
  if (ext === ".docx") return extractDocxText(buffer);
  if (ext === ".pdf") return extractPdfText(buffer);
  return "";
}

function extractDocxText(buffer) {
  const entries = unzipXlsxEntries(buffer);
  const xml = entries["word/document.xml"]?.toString("utf8") || "";
  return decodeXml(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
  );
}

function extractPdfText(buffer) {
  const source = buffer.toString("latin1");
  const streams = [];
  const streamPattern = /([\s\S]{0,240}?)stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamPattern.exec(source))) {
    const raw = Buffer.from(match[2], "latin1");
    if (/\/FlateDecode/.test(match[1])) {
      try {
        streams.push(zlib.inflateSync(raw).toString("latin1"));
      } catch {}
    } else {
      streams.push(match[2]);
    }
  }
  const text = streams.length ? streams.join("\n") : source;
  const fragments = [];
  for (const item of text.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) fragments.push(decodePdfLiteral(item[0].replace(/\)\s*Tj$/, ")")));
  for (const item of text.matchAll(/\[((?:.|\r|\n)*?)\]\s*TJ/g)) {
    const parts = [...item[1].matchAll(/\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]+)>/g)];
    fragments.push(parts.map((part) => part[0].startsWith("(") ? decodePdfLiteral(part[0]) : decodePdfHex(part[1])).join(""));
  }
  for (const item of text.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) fragments.push(decodePdfHex(item[1]));
  return fragments.join("\n");
}

function decodePdfLiteral(value) {
  const body = String(value || "").replace(/^\(|\)$/g, "");
  return body
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\([()\\])/g, "$1");
}

function decodePdfHex(value) {
  const hex = String(value || "").replace(/\s/g, "");
  if (!hex) return "";
  const bytes = Buffer.from(hex.length % 2 ? `${hex}0` : hex, "hex");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) text += String.fromCharCode(bytes.readUInt16BE(index));
    return text;
  }
  return bytes.toString("utf8");
}

function normalizeExtractedText(value, maxLength = 120000) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

async function importCustomers(req, viewer, target = "") {
  const multipart = String(req.headers["content-type"] || "").includes("application/json")
    ? { fields: await readBody(req), files: [] }
    : await parseMultipart(req);
  const stage = multipart.fields.stage || "名单";
  const state = readState();
  const importToPublicPool = target === "public_pool" || multipart.fields.target === "public_pool";
  const viewerRole = findRole(state.roles, viewer.roleId, viewer.role);
  let ownerUser = viewer;
  if (!importToPublicPool && viewerRole.customerScope !== "self") {
    const requested = findUser(state.users, multipart.fields.ownerId, multipart.fields.owner || multipart.fields.followPerson);
    const visible = visibleUsers(state, viewer).find((item) => Number(item.id) === Number(requested.id));
    if (requested.id && !visible) throw new Error("不能将客户导入到权限范围外");
    if (visible) ownerUser = visible;
  }
  const file = multipart.files[0];
  const defaults = {
    stage,
    owner: ownerUser.name,
    ownerId: ownerUser.id,
    unitId: ownerUser.unitId || "",
    unit: ownerUser.unit || "",
    zone: ownerUser.zone || "",
    channelSource: multipart.fields.channelSource || "其他",
    channelSources: state.channelSources || CHANNEL_SOURCES,
    createdBy: viewer.name,
    followPerson: ownerUser.name,
    inputMoneyUnit: multipart.fields.inputMoneyUnit || (multipart.fields.moneyUnit === MONEY_UNIT ? MONEY_UNIT : "wan")
  };
  const rawRowsText = String(multipart.fields.rows || "");
  const rows = file
    ? parseCustomerImportFile(file, defaults)
    : parseCustomerRows(rawRowsText, defaults);
  if (!rows.length && (file || rawRowsText.trim())) {
    const failure = {
      rowNumber: "",
      name: file?.filename || "导入数据",
      phone: "",
      reason: "未识别到客户数据，请检查表头是否包含客户名称、客户电话，或粘贴格式是否为：客户名称,手机号,渠道来源,客户地址"
    };
    const reportUrl = writeImportReport([failure]);
    return {
      total: 1,
      imported: 0,
      duplicates: 0,
      failed: 1,
      pendingLocation: 0,
      pendingGeocode: 0,
      reportUrl,
      skipped: [],
      failures: [failure],
      message: "导入失败：未识别到客户数据。",
      customers: [],
      opportunities: []
    };
  }
  const hasPublicRows = importToPublicPool || rows.some((row) => row.importToPublicPool);
  const hasPrivateRows = !importToPublicPool && rows.some((row) => !row.importToPublicPool);
  if (hasPublicRows && !canImportPublicPool(state, viewer)) throw new Error("仅运营、总负责人和管理员可以导入公海");
  const importedOpportunities = [];
  const createdCustomers = [];
  const skipped = [];
  const failed = [];
  const warnings = [];
  const fileOpportunityKeys = new Set();
  if (hasPrivateRows && !canOwnCustomerUser(state, ownerUser)) {
    throw new Error("请选择销售、主管或区域经理作为默认跟进人");
  }
  rows.forEach((row, index) => {
    const rowImportToPublicPool = importToPublicPool || row.importToPublicPool;
    const rowNumber = Number(row.rowNumber || index + 1);
    if (row.channelSourceUnrecognized) {
      warnings.push({
        rowNumber,
        name: row.name || "",
        phone: row.phone || "",
        reason: `渠道来源“${row.channelSourceRaw || ""}”未识别，已按其他处理`
      });
    }
    const phoneNormalized = normalizePhone(row.phone);
    if (!phoneNormalized) {
      failed.push({ rowNumber, name: row.name || "", phone: row.phone || "", reason: "手机号无效" });
      return;
    }
    const existingCustomer = findCustomerByPhone(state, phoneNormalized);
    const explicitProductName = String(row.productName || "").trim();
    const product = resolveProduct(state, row.productId, explicitProductName) || normalizeProduct({ id: stableId("product", explicitProductName || "待确认产品"), name: explicitProductName || "待确认产品" });
    const fileKey = `${phoneNormalized}|${cleanText(product.name)}`;
    if (fileOpportunityKeys.has(fileKey)) {
      skipped.push({ rowNumber, name: row.name || "", phone: row.phone || "", reason: "文件内手机号和意向产品重复，已按首次出现处理" });
      return;
    }
    fileOpportunityKeys.add(fileKey);
    let customer = existingCustomer;
    if (customer && !explicitProductName) {
      skipped.push({ rowNumber, name: row.name || "", phone: row.phone || "", reason: "系统已有该客户；如需创建增购机会，请填写意向产品" });
      return;
    }
    if (customer && hasActiveProductOpportunity(state, customer.id, product.id)) {
      skipped.push({ rowNumber, name: row.name || "", phone: row.phone || "", reason: `该客户已有${product.name}进行中机会` });
      return;
    }
    if (!customer && findSimilarCustomer(state, row)) {
      failed.push({ rowNumber, name: row.name || "", phone: row.phone || "", reason: "同城存在名称相似客户，请单个添加并确认" });
      return;
    }
    const now = new Date().toISOString();
    if (!customer) {
      customer = normalizeCustomer({
        id: Date.now() + index * 10,
        name: row.name,
        phone: row.phone,
        phoneNormalized,
        channelSource: row.channelSource,
        createdBy: viewer.name,
        owner: rowImportToPublicPool ? "公海" : ownerUser.name,
        ownerId: rowImportToPublicPool ? "" : ownerUser.id,
        followPerson: rowImportToPublicPool ? "公海" : ownerUser.name,
        unitId: rowImportToPublicPool ? "" : ownerUser.unitId || "",
        unit: rowImportToPublicPool ? "" : ownerUser.unit || "",
        zone: rowImportToPublicPool ? "" : ownerUser.zone || "",
        address: row.address,
        city: row.city || extractCity(row.address) || "",
        region: rowImportToPublicPool ? "" : row.region,
        competitorProfiles: normalizeCompetitorProfiles([], state.competitors, row.software),
        createdAt: today(),
        location: { latitude: 0, longitude: 0, province: "", city: row.city || extractCity(row.address) || "", district: "", address: row.address || "", status: row.address ? "pending" : "unknown" },
        followUps: []
      }, state);
      state.customers.unshift(customer);
      createdCustomers.push(customer);
      if (row.address && (!customer.location?.city || rowImportToPublicPool)) state.geocodeJobs.push(normalizeGeocodeJob({ customerId: customer.id, address: customer.address, status: "pending" }));
    }
    const opportunity = normalizeOpportunity({
      id: Date.now() + index * 10 + 1,
      customerId: customer.id,
      productId: product.id,
      productName: product.name,
      stage: rowImportToPublicPool ? "名单" : row.stage || "名单",
      owner: rowImportToPublicPool ? "公海" : ownerUser.name,
      ownerId: rowImportToPublicPool ? "" : ownerUser.id,
      followPerson: rowImportToPublicPool ? "公海" : ownerUser.name,
      unitId: rowImportToPublicPool ? "" : ownerUser.unitId || "",
      unit: rowImportToPublicPool ? "" : ownerUser.unit || "",
      zone: rowImportToPublicPool ? "" : ownerUser.zone || "",
      region: row.region || "",
      createdBy: viewer.name,
      createdAt: today(),
      amount: row.amountProvided ? row.amount : normalizeMoney(product.price) || DEFAULT_EXPECTED_AMOUNT,
      ownershipStatus: rowImportToPublicPool ? OWNERSHIP_PUBLIC : OWNERSHIP_PENDING,
      claimUntil: rowImportToPublicPool ? "" : addDaysToIso(now, claimProtectionDays(state, viewer, ownerUser, row.stage || "名单")),
      effectiveFollowUpAt: "",
      publicPoolAt: rowImportToPublicPool ? now : "",
      publicPoolReason: rowImportToPublicPool ? "operations_import" : "",
      ownershipHistory: [ownershipEvent("created", null, rowImportToPublicPool ? { id: "", name: "公海" } : ownerUser, viewer, rowImportToPublicPool ? "运营导入公海机会" : "批量导入机会")],
      followUps: []
    }, state);
    state.opportunities.unshift(opportunity);
    state.activities.push({ date: today(), owner: opportunity.owner, type: opportunity.stage, customerId: customer.id, opportunityId: opportunity.id });
    syncCustomerCompatibility(state, customer.id);
    importedOpportunities.push(opportunity);
  });
  if (importedOpportunities.length) writeState(state);
  if (createdCustomers.length) setTimeout(() => processGeocodeQueue().catch(() => {}), 20);
  const reportRows = [...skipped, ...failed, ...warnings];
  const reportUrl = reportRows.length ? writeImportReport(reportRows) : "";
  const pendingLocation = createdCustomers.filter((item) => item.location?.status !== "resolved").length;
  const pendingGeocode = createdCustomers.filter((item) => String(item.address || "").trim() && item.location?.status !== "resolved").length;
  return {
    total: rows.length,
    imported: importedOpportunities.length,
    duplicates: skipped.length,
    failed: failed.length,
    channelUnrecognized: warnings.length,
    pendingLocation,
    pendingGeocode,
    reportUrl,
    skipped,
    warnings,
    failures: failed,
    message: skipped.length
      ? `导入完成：成功${importedOpportunities.length}条，跳过${skipped.length}条。`
      : `导入完成：成功${importedOpportunities.length}条，失败${failed.length}条。`,
    customers: importedOpportunities.map((item) => opportunityView(state, item)),
    opportunities: importedOpportunities.map((item) => opportunityView(state, item))
  };
}

function writeImportReport(rows) {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fileName = `customer-import-report-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.csv`;
  const csv = [
    ["原始行号", "客户名称", "手机号", "跳过原因"],
    ...rows.map((item) => [item.rowNumber, item.name, item.phone, item.reason])
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), `\ufeff${csv}`, "utf8");
  return `/uploads/${fileName}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
  const sourceHeaders = rows[0].map((cell) => String(cell || "").trim());
  const rawHeaders = sourceHeaders.map((cell) => normalizeHeader(cell));
  const hasHeader = rawHeaders.some((header) => ["name", "phone", "channelSource", "address", "stage"].includes(header) || IMPORT_STATUSES.includes(header));
  const headers = hasHeader ? rawHeaders : ["name", "phone", "region", "amount", "software"];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const stageHeader = rawHeaders.find((header) => IMPORT_STATUSES.includes(header));
  const amountHeaderIndex = rawHeaders.findIndex((header) => header === "amount");
  const amountHeaderText = amountHeaderIndex >= 0 ? sourceHeaders[amountHeaderIndex] : "";
  const inputMoneyUnit = /万/.test(amountHeaderText) ? "wan" : /元/.test(amountHeaderText) ? MONEY_UNIT : defaults.inputMoneyUnit || "wan";
  return dataRows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + (hasHeader ? 2 : 1);
      if (!hasHeader) {
        const third = String(row[2] || "").trim();
        const thirdLooksLikeChannel = isKnownChannelText(third, defaults.channelSources);
        const looksLikeTemplateOrder = !thirdLooksLikeChannel && row.length >= 6 && (!third || normalizeImportStatus(third) || row.length >= 10);
        const channelRaw = looksLikeTemplateOrder ? row[5] : thirdLooksLikeChannel ? third : defaults.channelSource;
        const channel = resolveChannelSource(channelRaw, defaults.channelSources);
        const status = looksLikeTemplateOrder ? normalizeImportStatus(third) : "";
        const amountValue = looksLikeTemplateOrder ? row[14] : thirdLooksLikeChannel ? row[5] : row[3];
        return {
          name: row[0] || "",
          phone: row[1] || "待补充",
          channelSource: channel.value,
          channelSourceRaw: channel.raw,
          channelSourceUnrecognized: channel.unrecognized,
          createdBy: looksLikeTemplateOrder ? row[8] || defaults.createdBy || defaults.owner || "未记录" : defaults.createdBy || defaults.owner || "未记录",
          followPerson: looksLikeTemplateOrder ? row[9] || defaults.followPerson || defaults.owner || "未分配" : defaults.followPerson || defaults.owner || "未分配",
          address: looksLikeTemplateOrder ? row[4] || "" : thirdLooksLikeChannel ? row[3] || "" : "",
          city: looksLikeTemplateOrder ? row[3] || extractCity(row[4] || "") : thirdLooksLikeChannel ? extractCity(row[3] || "") : "",
          stage: looksLikeTemplateOrder ? status || defaults.stage || "名单" : defaults.stage || "名单",
          importToPublicPool: looksLikeTemplateOrder ? (status === PUBLIC_POOL_STATUS || defaults.stage === PUBLIC_POOL_STATUS) : defaults.stage === PUBLIC_POOL_STATUS,
          owner: looksLikeTemplateOrder ? row[9] || defaults.owner || "未分配" : defaults.owner || "未分配",
          ownerId: defaults.ownerId || "",
          unitId: defaults.unitId || "",
          unit: looksLikeTemplateOrder ? row[7] || defaults.unit || "" : defaults.unit || "",
          zone: defaults.zone || "",
          region: looksLikeTemplateOrder ? "" : thirdLooksLikeChannel ? "" : third || "",
          amount: normalizeImportedAmount(amountValue, inputMoneyUnit),
          amountProvided: String(amountValue || "").trim() !== "",
          software: looksLikeTemplateOrder ? row[13] || "待补充" : thirdLooksLikeChannel ? row[4] || "待补充" : row[4] || "待补充",
          productName: looksLikeTemplateOrder ? row[6] || "" : row[6] || "",
          lastNote: looksLikeTemplateOrder ? row[10] || "名单文件导入。" : "名单文件导入。",
          lastFollow: looksLikeTemplateOrder ? normalizeDateText(row[11] || "") : "",
          nextFollow: looksLikeTemplateOrder ? normalizeDateText(row[12] || "") : "",
          rowNumber
        };
      }
      const record = {};
      headers.forEach((header, index) => {
        if (!header || STAGES.includes(header)) return;
        record[header] = row[index];
      });
      const stageCell = row[headers.findIndex((header) => header === "stage")];
      const requestedStatus = normalizeImportStatus(stageCell) || normalizeImportStatus(stageHeader) || normalizeImportStatus(defaults.stage) || "名单";
      const importToPublicPool = requestedStatus === PUBLIC_POOL_STATUS;
      const stage = importToPublicPool ? "名单" : requestedStatus;
      const amountProvided = String(record.amount || "").trim() !== "";
      const channel = resolveChannelSource(record.channelSource || defaults.channelSource, defaults.channelSources);
      return {
        name: record.name || "",
        phone: record.phone || "待补充",
        channelSource: channel.value,
        channelSourceRaw: channel.raw,
        channelSourceUnrecognized: channel.unrecognized,
        createdBy: record.createdBy || defaults.createdBy || defaults.owner || "未记录",
        followPerson: record.followPerson || defaults.followPerson || defaults.owner || "未分配",
        address: record.address || "",
        city: record.city || extractCity(record.address || "") || "",
        stage,
        importToPublicPool,
        owner: record.owner || defaults.owner || record.followPerson || "未分配",
        ownerId: defaults.ownerId || "",
        unitId: defaults.unitId || "",
        unit: record.unit || defaults.unit || "",
        zone: defaults.zone || "",
        region: record.region || "",
        amount: normalizeImportedAmount(record.amount, inputMoneyUnit),
        amountProvided,
        software: record.software || "待补充",
        productName: record.productName || "",
        lastNote: record.lastNote || record.followRecord || "名单文件导入。",
        lastFollow: normalizeDateText(record.lastFollow || ""),
        nextFollow: normalizeDateText(record.nextFollow || ""),
        rowNumber
      };
    })
    .filter((row) => row.name);
}

function normalizeImportedAmount(value, inputMoneyUnit = MONEY_UNIT) {
  if (value === undefined || value === null || String(value).trim() === "") return DEFAULT_EXPECTED_AMOUNT;
  return inputMoneyUnit === MONEY_UNIT ? normalizeMoney(value) : multiplyLegacyMoney(value);
}

function normalizeHeader(value) {
  const text = String(value || "").trim().replace(/\s/g, "");
  if (!text) return "";
  if (IMPORT_STATUSES.includes(text)) return text;
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
  if (/城市|所在城市|city/i.test(text)) return "city";
  if (/意向产品|产品名称|销售产品|product/i.test(text)) return "productName";
  if (/阶段|状态|stage|status/i.test(text)) return "stage";
  if (/金额|进款|回款|amount|payment/i.test(text)) return "amount";
  if (/软件|software/i.test(text)) return "software";
  if (/区域|战区|region|zone/i.test(text)) return "region";
  return "";
}

function normalizeImportStatus(value) {
  const text = String(value || "").trim();
  return IMPORT_STATUSES.includes(text) ? text : "";
}

function normalizeChannelSource(value, sources = CHANNEL_SOURCES) {
  return resolveChannelSource(value, sources).value;
}

function resolveChannelSource(value, sources = CHANNEL_SOURCES) {
  const raw = String(value || "").normalize("NFKC").trim();
  if (!raw) return { raw: "", value: "其他", recognized: true, unrecognized: false };
  const key = channelSourceKey(raw);
  const names = channelSourceNames(sources, { includeInactive: true });
  const canonical = names.find((name) => channelSourceKey(name) === key);
  if (canonical) return { raw, value: canonical, recognized: true, unrecognized: false };
  const aliases = [
    ["官方资源", "官网留言"],
    ["官网", "官网留言"],
    ["网站留言", "官网留言"],
    ["官网注册", "自主注册"],
    ["注册", "自主注册"],
    ["转介绍", "渠道介绍"],
    ["介绍", "渠道介绍"],
    ["企查", "企查查"],
    ["微信公众号", "公众号"],
    ["手动录入", "其他"],
    ["批量导入", "其他"],
    ["展会", "其他"]
  ];
  const alias = aliases.find(([name]) => channelSourceKey(name) === key);
  if (alias) return { raw, value: alias[1], recognized: true, unrecognized: false };
  return { raw, value: "其他", recognized: false, unrecognized: true };
}

function isKnownChannelText(value, sources = CHANNEL_SOURCES) {
  const text = String(value || "").trim();
  if (!text) return false;
  return resolveChannelSource(text, sources).recognized;
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
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] || "";
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
  const matchedForResponse = matched.map((item) => ({
    ...item,
    content: String(item.content || item.answer || "").slice(0, 600)
  }));
  if (!DEEPSEEK_API_KEY) {
    return fallbackXiaozhi(question, matched, customer, "未配置 DEEPSEEK_API_KEY，当前使用知识库本地策略。");
  }
  const system = [
    "你是智销AI的小智，是全屋定制软件销售跟进助手。",
    "你必须结合知识库给出销售可执行的话术和跟进策略。",
    "输出结构：客户意图、推荐话术、成交策略、下一步动作、风险提醒。语言简洁，适合销售马上照着用。"
  ].join("\n");
  const context = matched
    .map((item, index) => `${index + 1}. 标题：${item.question}\n内容：${String(item.content || item.answer || "").slice(0, 6000)}`)
    .join("\n\n");
  const user = `客户问题：${question}\n\n客户信息：${customer ? JSON.stringify(customer) : "暂无"}\n\n知识库：\n${context || "暂无匹配知识库"}`;
  try {
    const data = await deepseekChat(system, user);
    return {
      source: "deepseek",
      name: "小智",
      matched: matchedForResponse,
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
      score: words.filter((word) => `${item.question || ""} ${item.answer || ""} ${item.content || ""} ${item.fileName || ""} ${Object.values(normalizeKnowledgeTags(item.tags || {})).flat().join(" ")}`.includes(word)).length
    }))
    .sort((a, b) => b.score - a.score);
}

function fallbackXiaozhi(question, matched, customer, note) {
  const best = matched[0];
  const bestAnswer = best ? String(best.answer || best.content || "").slice(0, 900) : "";
  const answer = [
    "客户意图：客户正在确认软件能否解决真实生产痛点，重点关注落地风险和投入回报。",
    `推荐话术：${bestAnswer || "先让客户提供一套真实订单，现场演示从设计、报价、拆单、开料标签到车间看板的完整流程。"}`,
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

function canEditCustomerIdentity(state, viewer) {
  return canUseAdmin(state, viewer) || ADMIN_ROLES.includes(findRole(state.roles, viewer.roleId, viewer.role).name);
}

function canBulkEditCustomerChannelSource(state, viewer) {
  if (!viewer) return false;
  const roleName = findRole(state.roles, viewer.roleId, viewer.role).name;
  return ["总负责人", "管理员"].includes(roleName);
}

function canManageCustomer(state, viewer, customer) {
  if (!viewer || !canViewRecord(state, viewer, customer)) return false;
  return findRole(state.roles, viewer.roleId, viewer.role).customerScope !== "self" || canUseAdmin(state, viewer);
}

function canViewMapCustomer(state, viewer, customer) {
  return customerMapAccess(state, viewer, customer).mode !== "none";
}

function customerMapAccess(state, viewer, customer = {}) {
  if (!viewer || !customer?.id) return { mode: "none", opportunities: [] };
  const opportunities = (state.opportunities || []).filter((item) => Number(item.customerId) === Number(customer.id));
  const privateOpportunities = opportunities.filter((item) => !isOpportunityPublicPool(item) && canViewOpportunity(state, viewer, item));
  if (privateOpportunities.length || (!opportunities.length && canViewRecord(state, viewer, customer))) {
    return { mode: "private", opportunities: privateOpportunities };
  }
  const publicOpportunities = opportunities.filter(isOpportunityPublicPool);
  if (customer.lifecycleStatus !== LIFECYCLE_ARCHIVED && publicOpportunities.length) {
    return { mode: "public", opportunities: publicOpportunities };
  }
  return { mode: "none", opportunities: [] };
}

function visibleVisitsForCustomer(state, viewer, customerId) {
  return (state.visits || []).filter((visit) => Number(visit.customerId) === Number(customerId) && canViewRecord(state, viewer, visit));
}

function customerPointStatus(customer = {}, opportunities = [], visits = []) {
  if (customer.lifecycleStatus === LIFECYCLE_ARCHIVED) return "archived";
  if (opportunities.some((item) => item.stage === "成交" && !isPurchasedOpportunity(item))) return "sold";
  if (visits.length) return "visited";
  return "pending";
}

function buildMapPoints(state, viewer, filters = {}) {
  const points = (state.customers || [])
    .map((customer) => {
      const access = customerMapAccess(state, viewer, customer);
      if (access.mode === "none") return null;
      const location = normalizeLocation(customer.location || {}, customer);
      const activeOpportunity = access.opportunities.find((item) => item.stage !== "成交") || access.opportunities[0] || {};
      if (access.mode === "public") {
        return {
          id: customer.id,
          customerId: customer.id,
          name: customer.name,
          phone: "",
          stage: "公海",
          productId: "",
          productName: "",
          ownerId: "",
          owner: "",
          unitId: "",
          unit: "",
          zone: "",
          address: customer.address || location.address,
          province: location.province,
          city: location.city || customer.city || extractCity(customer.address) || "待识别",
          district: location.district,
          latitude: location.latitude,
          longitude: location.longitude,
          locationStatus: location.status,
          pointStatus: "pending",
          software: "",
          competitor: "未公开",
          competitorColor: "#94a3b8",
          equipment: "",
          visitCount: 0,
          lastVisitedAt: "",
          contacts: [],
          competitorProfiles: [],
          archiveReason: "",
          isPublicPool: true,
          claimable: findRole(state.roles, viewer.roleId, viewer.role).customerScope === "self"
        };
      }
      const primaryContact = (customer.contacts || []).find((item) => item.isPrimary) || (customer.contacts || [])[0] || {};
      const competitor = (customer.competitorProfiles || []).find((item) => item.isPrimary) || (customer.competitorProfiles || [])[0] || {};
      const competitorDef = (state.competitors || []).find((item) => item.id === competitor.competitorId || cleanText(item.name) === cleanText(competitor.brand));
      const visits = visibleVisitsForCustomer(state, viewer, customer.id).sort(sortByNewest);
      return {
        id: customer.id,
        customerId: customer.id,
        name: customer.name,
        phone: primaryContact.phone || customer.phone,
        stage: activeOpportunity.stage || customer.stage,
        productId: activeOpportunity.productId || "",
        productName: activeOpportunity.productName || "",
        ownerId: activeOpportunity.ownerId || customer.ownerId,
        owner: activeOpportunity.owner || customer.owner,
        unitId: activeOpportunity.unitId || customer.unitId,
        unit: activeOpportunity.unit || customer.unit,
        zone: activeOpportunity.zone || customer.zone,
        address: customer.address || location.address,
        province: location.province,
        city: location.city || customer.city || extractCity(customer.address) || "待识别",
        district: location.district,
        latitude: location.latitude,
        longitude: location.longitude,
        locationStatus: location.status,
        pointStatus: customerPointStatus(customer, access.opportunities, visits),
        software: customer.software,
        competitor: competitor.brand || "未录入",
        competitorColor: competitorDef?.color || "#64748b",
        equipment: visits[0]?.line || "",
        visitCount: visits.length,
        lastVisitedAt: customer.lastVisitedAt || visits[0]?.date || "",
        contacts: customer.contacts || [],
        competitorProfiles: customer.competitorProfiles || [],
        archiveReason: customer.archiveReason || "",
        isPublicPool: false,
        claimable: false
      };
    })
    .filter(Boolean)
    .filter((point) => point.latitude && point.longitude)
    .filter((point) => !filters.province || point.province === filters.province)
    .filter((point) => !filters.city || point.city === filters.city)
    .filter((point) => !filters.district || point.district === filters.district)
    .filter((point) => !filters.ownerId || String(point.ownerId) === String(filters.ownerId))
    .filter((point) => !filters.unitId || String(point.unitId) === String(filters.unitId))
    .filter((point) => !filters.zone || point.zone === filters.zone)
    .filter((point) => !filters.stage || point.stage === filters.stage)
    .filter((point) => !filters.pointStatus || point.pointStatus === filters.pointStatus)
    .filter((point) => !filters.software || `${point.software} ${point.competitor}`.includes(filters.software))
    .filter((point) => !filters.equipment || point.equipment.includes(filters.equipment));
  const countBy = (field) => Object.entries(points.reduce((map, item) => {
    const key = item[field] || "未录入";
    if (field === "competitor" && isUnknownSoftwareValue(key)) return map;
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {})).map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count);
  return { points, summary: { total: points.length, statuses: countBy("pointStatus"), competitors: countBy("competitor"), cities: countBy("city") } };
}

function sortByNewest(left, right) {
  return Date.parse(right.createdAt || right.date || 0) - Date.parse(left.createdAt || left.date || 0);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => Number(value) * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapRouteStop(customer, index = 0) {
  const location = normalizeLocation(customer.location || {}, customer);
  return {
    customerId: customer.id,
    name: customer.name,
    latitude: location.latitude,
    longitude: location.longitude,
    address: customer.address || location.address,
    order: index + 1,
    completed: false,
    completedAt: ""
  };
}

function completeRouteStop(state, ownerId, customerId, date = today()) {
  if (!customerId) return;
  const route = (state.routes || []).find((item) => Number(item.ownerId) === Number(ownerId) && item.date === (date || today()));
  const stop = route?.stops?.find((item) => Number(item.customerId) === Number(customerId));
  if (!stop) return;
  stop.completed = true;
  stop.completedAt = new Date().toISOString();
}

async function optimizeRoute(origin, customers) {
  const remaining = customers.filter((customer) => customer.location?.latitude && customer.location?.longitude);
  const ordered = [];
  let usedTencent = false;
  let current = origin;
  while (remaining.length) {
    let distances = remaining.map((customer) => haversineKm(current.latitude, current.longitude, customer.location.latitude, customer.location.longitude));
    if (TENCENT_MAP_SERVER_KEY) {
      try { distances = await tencentDistanceRow(current, remaining); usedTencent = true; } catch {}
    }
    let nearestIndex = 0;
    distances.forEach((distance, index) => { if (distance < distances[nearestIndex]) nearestIndex = index; });
    const [next] = remaining.splice(nearestIndex, 1);
    ordered.push(next);
    current = { latitude: next.location.latitude, longitude: next.location.longitude };
  }
  return { customers: ordered, source: usedTencent ? "tencent" : "straight-line" };
}

function tencentDistanceRow(origin, customers) {
  const to = customers.map((customer) => `${customer.location.latitude},${customer.location.longitude}`).join(";");
  const url = `https://apis.map.qq.com/ws/distance/v1/matrix?mode=driving&from=${origin.latitude},${origin.longitude}&to=${encodeURIComponent(to)}&key=${encodeURIComponent(TENCENT_MAP_SERVER_KEY)}`;
  return requestJson(url).then((data) => {
    if (Number(data.status) !== 0 || !data.result?.rows?.[0]?.elements) throw new Error(data.message || "腾讯路线服务失败");
    return data.result.rows[0].elements.map((item) => Number(item.distance || Number.MAX_SAFE_INTEGER) / 1000);
  });
}

async function processGeocodeQueue() {
  if (geocodeQueueRunning || !TENCENT_MAP_SERVER_KEY) return;
  geocodeQueueRunning = true;
  try {
    while (true) {
      const state = readState();
      const job = (state.geocodeJobs || []).find((item) => ["pending", "processing"].includes(item.status) && item.attempts < 3);
      if (!job) break;
      job.status = "processing";
      job.attempts += 1;
      job.updatedAt = new Date().toISOString();
      writeState(state);
      try {
        const result = await tencentGeocode(job.address);
        const latest = readState();
        const currentJob = latest.geocodeJobs.find((item) => item.id === job.id);
        const customer = latest.customers.find((item) => Number(item.id) === Number(job.customerId));
        if (customer) {
          customer.location = normalizeLocation({ ...result, address: customer.address, status: "resolved", resolvedAt: new Date().toISOString() }, customer);
          customer.city = result.city || customer.city || extractCity(customer.address) || "待识别";
        }
        if (currentJob) { currentJob.status = "resolved"; currentJob.error = ""; currentJob.updatedAt = new Date().toISOString(); }
        writeState(latest);
      } catch (error) {
        const latest = readState();
        const currentJob = latest.geocodeJobs.find((item) => item.id === job.id);
        const customer = latest.customers.find((item) => Number(item.id) === Number(job.customerId));
        if (currentJob) { currentJob.status = currentJob.attempts >= 3 ? "failed" : "pending"; currentJob.error = error.message; currentJob.updatedAt = new Date().toISOString(); }
        if (customer) customer.location = normalizeLocation({ ...customer.location, status: currentJob?.status === "failed" ? "failed" : "pending" }, customer);
        writeState(latest);
      }
    }
  } finally {
    geocodeQueueRunning = false;
  }
}

function tencentGeocode(address) {
  const url = `https://apis.map.qq.com/ws/geocoder/v1/?address=${encodeURIComponent(address)}&key=${encodeURIComponent(TENCENT_MAP_SERVER_KEY)}`;
  return requestJson(url).then((data) => {
    if (Number(data.status) !== 0 || !data.result?.location) throw new Error(data.message || "地址解析失败");
    return {
      latitude: Number(data.result.location.lat),
      longitude: Number(data.result.location.lng),
      province: data.result.address_components?.province || "",
      city: data.result.address_components?.city || "",
      district: data.result.address_components?.district || ""
    };
  });
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        try {
          if (response.statusCode >= 400) return reject(new Error(`HTTP ${response.statusCode}`));
          resolve(JSON.parse(body));
        } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}

function buildCustomerAiContext(state, customer, opportunity = null, viewer = null) {
  const visits = visibleVisitsForCustomer(state, viewer, customer.id).sort(sortByNewest);
  const opportunities = (state.opportunities || []).filter((item) => Number(item.customerId) === Number(customer.id) && canViewOpportunity(state, viewer, item));
  const selected = opportunity || primaryOpportunity(state, customer.id) || {};
  return {
    id: customer.id,
    name: customer.name,
    opportunityId: selected.id || "",
    productName: selected.productName || "待确认产品",
    stage: selected.stage || customer.stage,
    contacts: customer.contacts || [],
    followUps: (selected.followUps || customer.followUps || []).slice(-20),
    visits: visits.slice(0, 10),
    software: customer.software,
    competitorProfiles: customer.competitorProfiles || [],
    demoAt: selected.demoAt || "",
    quoteAmount: selected.quoteAmount || 0,
    expectedDealDate: selected.expectedDealDate || "",
    contractAmount: selected.contractAmount || 0,
    lossReason: selected.lossReason || "",
    lossReasonDetail: selected.lossReasonDetail || "",
    opportunities: opportunities.map((item) => ({ id: item.id, productName: item.productName, stage: item.stage, owner: item.owner })),
    equipment: visits[0]?.line || ""
  };
}

async function generateStructuredXiaozhiAdvice(question, knowledge, customer) {
  const matched = rankKnowledgeWithContext(question, knowledge, customer).slice(0, 5);
  const citations = matched.map((item) => ({ id: item.id, title: item.question, fileName: item.fileName || "", fileUrl: item.fileUrl || "", summary: item.summary || String(item.content || item.answer || "").slice(0, 180) }));
  const fallback = structuredAdviceFallback(question, customer, citations);
  if (!DEEPSEEK_API_KEY) return { source: "fallback", advice: fallback, citations };
  const system = [
    "你是智销AI的小智，是全屋定制拆单软件销售助手。",
    "只能使用客户上下文和知识库中存在的事实，禁止虚构价格、业绩、承诺或客户信息。",
    "必须输出纯JSON对象，字段为 intention、coreObjection、recommendedScript、communicationGoal、nextAction、followUpDraft、riskReminder。"
  ].join("\n");
  const knowledgeText = matched.map((item, index) => `${index + 1}. ${item.question}\n${String(item.content || item.answer || "").slice(0, 5000)}`).join("\n\n");
  const prompt = `客户问题：${question || "请结合当前资料分析"}\n客户上下文：${JSON.stringify(customer)}\n知识库：${knowledgeText || "无匹配知识"}`;
  try {
    const data = await deepseekChat(system, prompt);
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = parseJsonObject(content);
    return { source: "deepseek", model: data.model || DEEPSEEK_MODEL, advice: { ...fallback, ...parsed }, citations };
  } catch (error) {
    return { source: "fallback", advice: fallback, citations, warning: `DeepSeek调用失败：${error.message}` };
  }
}

function parseJsonObject(value) {
  const text = String(value || "").replace(/^```(?:json)?|```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI未返回结构化结果");
  return JSON.parse(text.slice(start, end + 1));
}

function structuredAdviceFallback(question, customer, citations) {
  const competitor = (customer.competitorProfiles || []).find((item) => item.isPrimary) || (customer.competitorProfiles || [])[0];
  const latest = (customer.followUps || [])[customer.followUps.length - 1] || {};
  return {
    intention: customer.stage === "商机" ? "中高意向，需围绕演示结果和决策链继续推进" : `当前处于${customer.stage || "名单"}阶段，需补充关键需求`,
    coreObjection: question || latest.note || [customer.lossReason, customer.lossReasonDetail].filter(Boolean).join("：") || "尚未记录明确异议",
    recommendedScript: citations[0]?.summary || "建议用客户真实订单演示从设计、报价、拆单到开料的完整流程，并量化错单和返工成本。",
    communicationGoal: "确认决策人、现用软件痛点、设备适配情况和下一次演示安排",
    nextAction: customer.demoAt ? "根据演示反馈安排报价和决策人复盘" : "邀请老板、设计主管和生产主管共同参加真实订单演示",
    followUpDraft: `已与客户沟通${question ? `“${question}”` : "当前软件与生产流程"}，客户现用${competitor?.brand || customer.software || "软件待确认"}，下一步确认真实订单演示及决策人时间。`,
    riskReminder: "未在系统中记录的信息不要向客户作价格、交付周期或功能承诺。"
  };
}

function rankKnowledgeWithContext(question, knowledge, customer) {
  const terms = [question, customer.stage, customer.software, customer.lossReason, customer.lossReasonDetail, ...(customer.competitorProfiles || []).map((item) => item.brand), ...(customer.contacts || []).map((item) => item.decisionRole)].join(" ");
  const words = terms.split(/[，。；、\s]+/).filter(Boolean);
  return [...knowledge].map((item) => {
    const tags = normalizeKnowledgeTags(item.tags || {});
    const haystack = `${item.question || ""} ${item.answer || ""} ${item.content || ""} ${item.fileName || ""} ${Object.values(tags).flat().join(" ")}`;
    const keywordScore = words.filter((word) => haystack.includes(word)).length;
    const tagScore = tags.salesStages.includes(customer.stage) ? 3 : 0;
    return { ...item, score: keywordScore + tagScore };
  }).sort((left, right) => right.score - left.score);
}

async function importUsers(req, state, viewer) {
  const multipart = String(req.headers["content-type"] || "").includes("application/json") ? { fields: await readBody(req), files: [] } : await parseMultipart(req);
  const rows = multipart.files[0] ? parseUserImportFile(multipart.files[0]) : parseUserRows(multipart.fields.rows || "");
  const imported = [];
  const failures = [];
  rows.forEach((row, index) => {
    const rowNumber = row.rowNumber || index + 1;
    const account = cleanAccount(row.account);
    const role = state.roles.find((item) => cleanText(item.name) === cleanText(row.role));
    const unit = state.units.find((item) => cleanText(item.name) === cleanText(row.unit));
    let reason = "";
    if (!row.name || !account || !row.password) reason = "姓名、登录账号和初始密码必填";
    else if (String(row.password).length < PASSWORD_MIN_LENGTH) reason = "初始密码至少6位";
    else if (!role) reason = "角色不存在";
    else if (!unit) reason = "单位不存在";
    else if (state.users.some((item) => cleanAccount(item.account) === account || cleanAccount(item.phone) === account)) reason = "登录账号已存在";
    if (reason) { failures.push({ rowNumber, name: row.name || "", phone: row.account || "", reason }); return; }
    const user = normalizeUser({ id: Date.now() + index, name: row.name, account, phone: account, password: row.password, roleId: role.id, role: role.name, unitId: unit.id, unit: unit.name, region: unit.zone, status: "启用" }, 0, state);
    state.users.push(user);
    imported.push(publicUser(user));
  });
  appendSecurityLog(state, { type: "batch_create_users", actorId: viewer.id, actorName: viewer.name, targetId: "batch", targetName: `${imported.length}个账号`, sourceIp: getRequestIp(req) });
  writeState(state);
  const reportUrl = failures.length ? writeUserImportReport(failures) : "";
  return { total: rows.length, imported: imported.length, failed: failures.length, failures, reportUrl, users: imported };
}

function parseUserImportFile(file) {
  const filename = String(file.filename || "").toLowerCase();
  const matrix = filename.endsWith(".xlsx") ? parseXlsxFirstSheet(file.buffer) : file.buffer.toString("utf8").replace(/^\ufeff/, "").split(/\r?\n/).filter(Boolean).map((line) => line.split(/,|，|\t/));
  return parseUserRowsFromMatrix(matrix);
}

function parseUserRows(text) {
  return parseUserRowsFromMatrix(String(text || "").replace(/^\ufeff/, "").split(/\r?\n/).filter(Boolean).map((line) => line.split(/,|，|\t/)));
}

function parseUserRowsFromMatrix(matrix) {
  const rows = matrix.filter((row) => row.some((cell) => String(cell || "").trim()));
  if (!rows.length) return [];
  const header = rows[0].map((cell) => String(cell || "").replace(/\s/g, ""));
  const hasHeader = header.some((cell) => /姓名|账号|密码|角色|单位/.test(cell));
  const find = (pattern, fallback) => { const index = header.findIndex((cell) => pattern.test(cell)); return index >= 0 ? index : fallback; };
  const indexes = { name: find(/姓名/, 0), account: find(/账号|手机号/, 1), password: find(/密码/, 2), role: find(/角色|职级/, 3), unit: find(/单位|部门/, 4) };
  return (hasHeader ? rows.slice(1) : rows).map((row, index) => ({ name: String(row[indexes.name] || "").trim(), account: String(row[indexes.account] || "").trim(), password: String(row[indexes.password] || "").trim(), role: String(row[indexes.role] || "").trim(), unit: String(row[indexes.unit] || "").trim(), rowNumber: index + (hasHeader ? 2 : 1) }));
}

function writeUserImportReport(rows) {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fileName = `user-import-report-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.csv`;
  const csv = [["原始行号", "员工姓名", "登录账号", "失败原因"], ...rows.map((item) => [item.rowNumber, item.name, item.phone, item.reason])].map((row) => row.map(csvCell).join(",")).join("\r\n");
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), `\ufeff${csv}`, "utf8");
  return `/uploads/${fileName}`;
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
  const payload = Buffer.from(JSON.stringify({
    id: Number(user.id),
    iat: Date.now(),
    authVersion: Number(user.authVersion || 1),
    nonce: crypto.randomBytes(12).toString("hex")
  })).toString("base64url");
  return `${payload}.${signTokenPayload(payload)}`;
}

function signTokenPayload(payload) {
  return crypto.createHmac("sha256", AUTH_TOKEN_SECRET).update(payload).digest("base64url");
}

function secureTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return {
    passwordSalt: salt,
    passwordHash: crypto.scryptSync(String(password || ""), salt, PASSWORD_KEY_LENGTH).toString("hex")
  };
}

function verifyPassword(user = {}, password = "") {
  if (!user.passwordHash || !user.passwordSalt) return false;
  const expected = Buffer.from(String(user.passwordHash), "hex");
  const actual = crypto.scryptSync(String(password), String(user.passwordSalt), expected.length || PASSWORD_KEY_LENGTH);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

let cachedDummyPasswordUser = null;
function dummyPasswordUser() {
  if (!cachedDummyPasswordUser) cachedDummyPasswordUser = hashPassword(crypto.randomBytes(24).toString("hex"));
  return cachedDummyPasswordUser;
}

function validateNewPassword(user, newPassword) {
  if (String(newPassword || "").length < PASSWORD_MIN_LENGTH) return `密码至少${PASSWORD_MIN_LENGTH}位`;
  if (verifyPassword(user, newPassword)) return "新密码不能与当前密码相同";
  return "";
}

function updateUserPassword(user, newPassword, passwordChangeRecommended) {
  return {
    ...user,
    ...hashPassword(newPassword),
    authVersion: Number(user.authVersion || 1) + 1,
    passwordChangeRecommended,
    passwordChangedAt: new Date().toISOString()
  };
}

function getRequestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function getLoginLockedUntil(store, key) {
  if (!key) return 0;
  const entry = store.get(key);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) return entry.lockedUntil;
  const failures = (entry.failures || []).filter((time) => Date.now() - time <= LOGIN_FAILURE_WINDOW_MS);
  if (!failures.length) store.delete(key);
  else store.set(key, { failures, lockedUntil: 0 });
  return 0;
}

function recordLoginFailure(store, key) {
  if (!key) return false;
  const now = Date.now();
  const entry = store.get(key) || { failures: [], lockedUntil: 0 };
  entry.failures = (entry.failures || []).filter((time) => now - time <= LOGIN_FAILURE_WINDOW_MS);
  entry.failures.push(now);
  if (entry.failures.length >= LOGIN_FAILURE_LIMIT) entry.lockedUntil = now + LOGIN_LOCK_MS;
  store.set(key, entry);
  return entry.lockedUntil > now;
}

function clearLoginFailures(store, key) {
  if (key) store.delete(key);
}

function appendSecurityLog(state, entry) {
  const logs = Array.isArray(state.securityLogs) ? state.securityLogs : [];
  logs.push({
    id: crypto.randomUUID(),
    type: entry.type,
    actorId: Number(entry.actorId || 0),
    actorName: entry.actorName || "",
    targetId: Number(entry.targetId || 0),
    targetName: entry.targetName || "",
    sourceIp: entry.sourceIp || "unknown",
    createdAt: new Date().toISOString()
  });
  state.securityLogs = logs.slice(-1000);
}

function today() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
