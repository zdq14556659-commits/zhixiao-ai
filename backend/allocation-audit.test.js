const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-allocation-audit-test-"));
const port = 30000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const now = new Date().toISOString();
const today = now.slice(0, 10);
const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  units: [
    { id: "org-root", name: "智销AI", parentId: "", type: "root", active: true },
    { id: "org-staff", name: "参谋部", parentId: "org-root", type: "department", active: true },
    { id: "org-war", name: "战区部", parentId: "org-root", type: "department", active: true },
    { id: "org-zone-east", name: "东部战区", parentId: "org-war", type: "battle_zone", zone: "东部战区", active: true },
    { id: "unit-east", name: "测试单位", parentId: "org-zone-east", type: "unit", zone: "东部战区", active: true }
  ],
  users: [
    { id: 1, name: "管理员", account: "admin", password: "778899", role: "管理员", roleId: "role-admin", unitId: "org-staff", unit: "参谋部" },
    { id: 2, name: "销售甲", account: "sales-a", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-east", unit: "测试单位", zone: "东部战区" },
    { id: 3, name: "销售乙", account: "sales-b", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-east", unit: "测试单位", zone: "东部战区" }
  ],
  customers: [
    { id: 100, name: "分配测试工厂", phone: "13800009001", ownerId: 2, owner: "销售甲", unitId: "unit-east", unit: "测试单位", zone: "东部战区", lifecycleStatus: "active", createdAt: today }
  ],
  opportunities: [
    {
      id: 101,
      customerId: 100,
      productId: "product-v1",
      productName: "V1",
      stage: "名单",
      ownerId: 2,
      owner: "销售甲",
      unitId: "unit-east",
      unit: "测试单位",
      zone: "东部战区",
      ownershipStatus: "locked",
      createdAt: today,
      ownershipHistory: [
        { type: "assigned", fromOwnerId: 1, fromOwner: "管理员", toOwnerId: 2, toOwner: "销售甲", operatorId: 1, operator: "管理员", createdAt: now, reason: "主管分配" }
      ]
    }
  ],
  visits: [],
  activities: [],
  knowledge: [],
  resources: [],
  routes: [],
  targets: []
};

fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify(seed, null, 2));

let child;
let output = "";

function startServer() {
  child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: tempDir,
      UPLOAD_DIR: path.join(tempDir, "uploads"),
      AUTH_TOKEN_SECRET: "allocation-audit-test-secret"
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await request("/health")).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(output);
}

async function login(account, password) {
  const result = await request("/auth/login", { method: "POST", body: { account, password } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.token;
}

async function stopServer() {
  if (!child) return;
  child.kill();
  await new Promise((resolve) => setTimeout(resolve, 200));
  child = null;
}

async function run() {
  startServer();
  await waitForServer();
  const admin = await login("admin", "778899");
  const sales = await login("sales-a", "123456");

  const before = await request("/opportunities/101/detail", { token: admin });
  assert.equal(before.status, 200, JSON.stringify(before.data));
  assert.equal(Number(before.data.ownerId), 2);

  const atomicFailure = await request("/opportunities/assign", {
    method: "POST",
    token: admin,
    body: {
      ids: [101, 999999],
      assignments: [{ ownerId: 3, count: 2 }]
    }
  });
  assert.equal(atomicFailure.status, 409, JSON.stringify(atomicFailure.data));
  assert.equal(atomicFailure.data.code, "ASSIGNMENT_PREFLIGHT_FAILED");
  assert.equal(atomicFailure.data.assigned, 0);
  assert.ok(atomicFailure.data.failed.some((item) => item.code === "OPPORTUNITY_NOT_FOUND"));

  const afterFailure = await request("/opportunities/101/detail", { token: admin });
  assert.equal(Number(afterFailure.data.ownerId), 2, "preflight failure must not partially assign valid opportunities");

  const success = await request("/opportunities/assign", {
    method: "POST",
    token: admin,
    body: { ids: [101], assignments: [{ ownerId: 3, count: 1 }] }
  });
  assert.equal(success.status, 200, JSON.stringify(success.data));
  assert.equal(success.data.assigned, 1);
  assert.equal(success.data.summary[0].ownerId, 3);

  const audit = await request(`/reports/allocation-audit?start=${today}&end=${today}`, { token: admin });
  assert.equal(audit.status, 200, JSON.stringify(audit.data));
  assert.ok(audit.data.total >= 1);
  assert.ok(audit.data.items.some((item) => Number(item.opportunityId) === 101 && Number(item.ownerId) === 3));
  assert.ok(Array.isArray(audit.data.byOwner));

  const salesAudit = await request(`/reports/allocation-audit?start=${today}&end=${today}`, { token: sales });
  assert.equal(salesAudit.status, 403);

  await stopServer();
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("allocation audit tests passed");
}

run().catch(async (error) => {
  await stopServer();
  console.error(error);
  console.error(output);
  fs.rmSync(tempDir, { recursive: true, force: true });
  process.exit(1);
});
