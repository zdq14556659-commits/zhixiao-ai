const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-metadata-test-"));
const port = 29000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const now = new Date().toISOString();
const roles = [
  { id: "role-admin", name: "管理员", customerScope: "all", permissions: ["dashboard", "customers", "admin", "publicPoolImport"] },
  { id: "role-sales", name: "销售", customerScope: "self", permissions: ["dashboard", "customers"] }
];
const units = [
  { id: "org-root", name: "智销AI", parentId: "", type: "root", level: 0, path: "智销AI", zone: "", active: true },
  { id: "unit-a", name: "一部", parentId: "org-root", type: "unit", level: 1, path: "智销AI / 一部", zone: "东部战区", active: true },
  { id: "unit-b", name: "二部", parentId: "org-root", type: "unit", level: 1, path: "智销AI / 二部", zone: "西部战区", active: true }
];
const users = [
  { id: 1, name: "管理员", account: "admin", password: "778899", role: "管理员", roleId: "role-admin", unitId: "org-root", unit: "智销AI", status: "启用" },
  { id: 2, name: "销售甲", account: "sales-a", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-a", unit: "一部", zone: "东部战区", status: "启用" },
  { id: 3, name: "销售乙", account: "sales-b", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-b", unit: "二部", zone: "西部战区", status: "启用" }
];
const customers = [
  { id: 101, name: "甲的私有客户", phone: "13800000001", ownerId: 2, owner: "销售甲", unitId: "unit-a", unit: "一部", zone: "东部战区", lifecycleStatus: "active", createdAt: "2026-07-01" },
  { id: 102, name: "乙的私有客户", phone: "13800000002", ownerId: 3, owner: "销售乙", unitId: "unit-b", unit: "二部", zone: "西部战区", lifecycleStatus: "active", createdAt: "2026-07-01" },
  { id: 103, name: "公海客户", phone: "13800000003", ownerId: "", owner: "公海", unitId: "", unit: "待分配", lifecycleStatus: "active", createdAt: "2026-07-01" }
];
const opportunities = [
  { id: 201, customerId: 101, stage: "名单", ownerId: 2, owner: "销售甲", unitId: "unit-a", unit: "一部", zone: "东部战区", ownershipStatus: "locked", createdAt: now },
  { id: 202, customerId: 102, stage: "名单", ownerId: 3, owner: "销售乙", unitId: "unit-b", unit: "二部", zone: "西部战区", ownershipStatus: "locked", createdAt: now },
  { id: 203, customerId: 103, stage: "名单", ownerId: "", owner: "公海", ownershipStatus: "public_pool", publicPoolAt: now, createdAt: now }
];
const activities = Array.from({ length: 3000 }, (_, index) => ({
  id: index + 1,
  customerId: index % 2 ? 101 : 102,
  type: "system",
  createdAt: now
}));
const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  currentUserId: 1,
  stages: ["名单", "线索", "商机", "成交"],
  zones: ["东部战区", "西部战区"],
  roles,
  units,
  users,
  products: [{ id: "product-v1", name: "V1", price: 0, active: true }],
  competitors: [{ id: "competitor-unknown", name: "未知", active: true }],
  channelSources: [{ id: "channel-other", name: "其他", active: true }],
  lossReasons: [],
  businessRules: { newCustomerProtectionDays: 30, publicPoolClaimProtectionDays: 3, inactivePublicPoolDays: 30 },
  customers,
  opportunities,
  activities,
  visits: [],
  routes: [],
  targets: [
    { id: "target-a", month: "2026-07", scopeType: "user", scopeId: "2", scopeName: "销售甲" },
    { id: "target-b", month: "2026-07", scopeType: "user", scopeId: "3", scopeName: "销售乙" }
  ],
  knowledge: [{ id: 1, title: "产品知识" }],
  resources: [],
  securityLogs: []
};
fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify(seed));
fs.writeFileSync(path.join(tempDir, "seed.json"), JSON.stringify(seed));

let child;
let output = "";

function startServer() {
  child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: tempDir,
      UPLOAD_DIR: path.join(tempDir, "uploads"),
      AUTH_TOKEN_SECRET: "metadata-state-test-secret"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
}

async function request(pathname, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return { status: response.status, data: await response.json() };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await request("/health")).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(output);
}

async function login(account, password) {
  const result = await request("/auth/login", { method: "POST", body: { account, password, moneyUnit: "yuan" } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.token;
}

async function run() {
  startServer();
  await waitForServer();
  const salesToken = await login("sales-a", "123456");
  const salesMeta = await request("/state?lite=1&metadata=1", { token: salesToken });
  assert.equal(salesMeta.status, 200);
  assert.deepEqual(salesMeta.data.customers, []);
  assert.deepEqual(salesMeta.data.opportunities, []);
  assert.deepEqual(salesMeta.data.activities, []);
  assert.deepEqual(salesMeta.data.visits, []);
  assert.deepEqual(salesMeta.data.routes, []);
  assert.deepEqual(salesMeta.data.users.map((user) => user.id), [2]);
  assert.deepEqual(salesMeta.data.targets.map((target) => target.id), ["target-a"]);
  assert.equal(salesMeta.data.publicPool.count, 1);
  assert.ok(salesMeta.data.knowledge.some((item) => item.title === "产品知识"));
  assert.ok(!JSON.stringify(salesMeta.data).includes("乙的私有客户"));

  const adminToken = await login("admin", "778899");
  const adminMeta = await request("/state?lite=1&metadata=1", { token: adminToken });
  assert.equal(adminMeta.status, 200);
  assert.equal(adminMeta.data.users.length, 3);
  assert.equal(adminMeta.data.targets.length, 2);
  assert.equal(adminMeta.data.publicPool.count, 1);

  const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const metadataFunction = source.slice(source.indexOf("function publicMetaState"), source.indexOf("function buildCustomerBoardLegacy"));
  assert.ok(metadataFunction);
  assert.ok(!metadataFunction.includes("scopeStateForUser("), "metadata path must not rebuild the full scoped customer state");
}

run()
  .then(() => {
    console.log("metadata state tests passed");
    child?.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  })
  .catch((error) => {
    console.error(error);
    console.error(output);
    child?.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.exitCode = 1;
  });
