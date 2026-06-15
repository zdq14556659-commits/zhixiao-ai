const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-v9-test-"));
const port = 25000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const now = new Date().toISOString();
const seed = {
  version: "backend-v8",
  moneyUnit: "yuan",
  units: [
    { id: "unit-east-parent", name: "杭州运营中心", parentId: "org-zone-east", type: "unit", zone: "东部战区" },
    { id: "unit-east-child", name: "杭州一部", parentId: "unit-east-parent", type: "team", zone: "东部战区" },
    { id: "unit-west", name: "成都一部", zone: "西部战区" }
  ],
  users: [
    { id: 1, name: "管理员", account: "admin", password: "778899", role: "管理员", roleId: "role-admin", unitId: "unit-east-parent", unit: "杭州运营中心", zone: "东部战区" },
    { id: 2, name: "杭州销售", account: "sales-east", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-east-child", unit: "杭州一部", zone: "东部战区" },
    { id: 3, name: "杭州主管", account: "supervisor", password: "123456", role: "主管", roleId: "role-supervisor", unitId: "unit-east-parent", unit: "杭州运营中心", zone: "东部战区" },
    { id: 4, name: "东区经理", account: "region", password: "123456", role: "区域经理", roleId: "role-region", unitId: "unit-east-parent", unit: "杭州运营中心", zone: "东部战区" },
    { id: 5, name: "西区销售", account: "sales-west", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-west", unit: "成都一部", zone: "西部战区" }
  ],
  customers: [
    { id: 101, name: "杭州工厂", phone: "13800001001", ownerId: 2, owner: "杭州销售", unitId: "unit-east-child", unit: "杭州一部", zone: "东部战区", lifecycleStatus: "active", createdAt: "2026-06-01" },
    { id: 102, name: "成都工厂", phone: "13800001002", ownerId: 5, owner: "西区销售", unitId: "unit-west", unit: "成都一部", zone: "西部战区", lifecycleStatus: "active", createdAt: "2026-06-01" }
  ],
  opportunities: [
    { id: 201, customerId: 101, productId: "product-v1", productName: "V1", stage: "名单", ownerId: 2, owner: "杭州销售", unitId: "unit-east-child", unit: "杭州一部", zone: "东部战区", ownershipStatus: "locked", createdAt: "2026-06-01", followUps: [{ date: "2026-06-01", createdAt: now, author: "杭州销售", note: "新增客户", isSystem: true }] },
    { id: 202, customerId: 102, productId: "product-v1", productName: "V1", stage: "名单", ownerId: 5, owner: "西区销售", unitId: "unit-west", unit: "成都一部", zone: "西部战区", ownershipStatus: "locked", createdAt: "2026-06-01", followUps: [{ date: "2026-06-01", createdAt: now, author: "西区销售", note: "新增客户", isSystem: true }] }
  ],
  visits: [], activities: [], knowledge: [], resources: [], routes: [], targets: []
};
fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify(seed, null, 2));
fs.writeFileSync(path.join(tempDir, "seed.json"), JSON.stringify(seed, null, 2));

let child;
let output = "";

function startServer() {
  output = "";
  child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: tempDir, UPLOAD_DIR: path.join(tempDir, "uploads"), AUTH_TOKEN_SECRET: "v9-organization-test-secret" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
}

async function request(pathname, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${baseUrl}${pathname}`, { method: options.method || "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  return { status: response.status, data: await response.json() };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await request("/health")).status === 200) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(output);
}

async function login(account) {
  const result = await request("/auth/login", { method: "POST", body: { account, password: account === "admin" ? "778899" : "123456", moneyUnit: "yuan" } });
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
  const health = await request("/health");
  assert.equal(health.data.backendVersion, "backend-v9");

  const migrated = JSON.parse(fs.readFileSync(path.join(tempDir, "db.json"), "utf8"));
  assert.ok(migrated.units.some((unit) => unit.id === "org-staff" && unit.name === "参谋部"));
  assert.ok(migrated.units.some((unit) => unit.id === "org-war" && unit.name === "战区部"));
  assert.ok(!migrated.roles.find((role) => role.id === "role-ops").permissions.includes("admin"));
  assert.equal(migrated.users.find((user) => user.account === "admin").roleId, "role-admin");
  assert.equal(migrated.units.find((unit) => unit.id === "unit-east-parent").parentId, "org-zone-east");
  assert.equal(migrated.units.find((unit) => unit.id === "unit-east-child").path, "智销AI / 战区部 / 东部战区 / 杭州运营中心 / 杭州一部");
  assert.equal(migrated.users.find((user) => user.account === "sales-east").orgPath, "智销AI / 战区部 / 东部战区 / 杭州运营中心 / 杭州一部");

  const admin = await login("admin");
  const supervisor = await login("supervisor");
  const region = await login("region");

  const supervisorBoard = await request("/customer-board", { token: supervisor });
  assert.equal(supervisorBoard.status, 200);
  assert.ok(supervisorBoard.data.items.some((item) => item.customerId === 101));
  assert.ok(!supervisorBoard.data.items.some((item) => item.customerId === 102));

  const regionBoard = await request("/customer-board", { token: region });
  assert.equal(regionBoard.status, 200);
  assert.ok(regionBoard.data.items.some((item) => item.customerId === 101));
  assert.ok(!regionBoard.data.items.some((item) => item.customerId === 102));

  const createStaffUnit = await request("/units", { method: "POST", token: admin, body: { name: "数据组", parentId: "org-staff", type: "team", sort: 10 } });
  assert.equal(createStaffUnit.status, 201, JSON.stringify(createStaffUnit.data));
  assert.equal(createStaffUnit.data.path, "智销AI / 参谋部 / 数据组");

  const editStaffUnit = await request(`/units/${createStaffUnit.data.id}`, { method: "PUT", token: admin, body: { name: "数据分析组", parentId: "org-staff", type: "team", active: true, sort: 12 } });
  assert.equal(editStaffUnit.status, 200);
  assert.equal(editStaffUnit.data.path, "智销AI / 参谋部 / 数据分析组");

  const blockedDelete = await request("/units/unit-east-parent", { method: "DELETE", token: admin });
  assert.equal(blockedDelete.status, 409);
  assert.ok(blockedDelete.data.childCount > 0 || blockedDelete.data.userCount > 0);

  const deleteEmpty = await request(`/units/${createStaffUnit.data.id}`, { method: "DELETE", token: admin });
  assert.equal(deleteEmpty.status, 200);

  await stopServer();
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("backend v9 organization tests passed");
}

run().catch(async (error) => {
  await stopServer();
  console.error(error);
  process.exit(1);
});
