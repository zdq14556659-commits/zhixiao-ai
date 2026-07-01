const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-v9-test-"));
const port = 25000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const now = new Date().toISOString();
const today = now.slice(0, 10);
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
    { id: 5, name: "西区销售", account: "sales-west", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-west", unit: "成都一部", zone: "西部战区" },
    { id: 6, name: "林晨", account: "linchen", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-east-child", unit: "杭州一部", zone: "东部战区" },
    { id: 7, name: "周扬", account: "zhouyang", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-east-child", unit: "杭州一部", zone: "东部战区" }
  ],
  customers: [
    { id: 101, name: "杭州工厂", phone: "13800001001", ownerId: 2, owner: "杭州销售", unitId: "unit-east-child", unit: "杭州一部", zone: "东部战区", lifecycleStatus: "active", createdAt: today },
    { id: 102, name: "成都工厂", phone: "13800001002", ownerId: 5, owner: "西区销售", unitId: "unit-west", unit: "成都一部", zone: "西部战区", lifecycleStatus: "active", createdAt: today }
  ],
  opportunities: [
    { id: 201, customerId: 101, productId: "product-v1", productName: "V1", stage: "名单", ownerId: 2, owner: "杭州销售", unitId: "unit-east-child", unit: "杭州一部", zone: "东部战区", ownershipStatus: "locked", createdAt: today, followUps: [{ date: today, createdAt: now, author: "杭州销售", note: "新增客户", isSystem: true }] },
    { id: 202, customerId: 102, productId: "product-v1", productName: "V1", stage: "名单", ownerId: 5, owner: "西区销售", unitId: "unit-west", unit: "成都一部", zone: "西部战区", ownershipStatus: "locked", createdAt: today, followUps: [{ date: today, createdAt: now, author: "西区销售", note: "新增客户", isSystem: true }] }
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
  const opsRole = migrated.roles.find((role) => role.id === "role-ops");
  assert.ok(!opsRole.permissions.includes("admin"));
  assert.ok(opsRole.permissions.includes("publicPoolImport"));
  assert.equal(migrated.users.find((user) => user.account === "admin").roleId, "role-admin");
  assert.equal(migrated.units.find((unit) => unit.id === "unit-east-parent").parentId, "org-zone-east");
  assert.equal(migrated.units.find((unit) => unit.id === "unit-east-child").path, "智销AI / 战区部 / 东部战区 / 杭州运营中心 / 杭州一部");
  assert.equal(migrated.users.find((user) => user.account === "sales-east").orgPath, "智销AI / 战区部 / 东部战区 / 杭州运营中心 / 杭州一部");
  assert.equal(migrated.users.find((user) => user.account === "linchen").status, "停用");
  assert.equal(migrated.users.find((user) => user.account === "zhouyang").status, "停用");

  const admin = await login("admin");
  const sales = await login("sales-east");
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

  const multiAssign = await request("/opportunities/assign", { method: "POST", token: admin, body: {
    ids: [201, 202],
    assignments: [{ ownerId: 2, count: 1 }, { ownerId: 3, count: 1 }]
  } });
  assert.equal(multiAssign.status, 200, JSON.stringify(multiAssign.data));
  assert.equal(multiAssign.data.assigned, 2);
  assert.deepEqual(multiAssign.data.summary.map((item) => `${item.owner}:${item.assigned}`), ["杭州销售:1", "杭州主管:1"]);

  const invalidMultiAssign = await request("/opportunities/assign", { method: "POST", token: admin, body: {
    ids: [201, 202],
    assignments: [{ ownerId: 2, count: 1 }]
  } });
  assert.equal(invalidMultiAssign.status, 400);

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

  const createChannel = await request("/channel-sources", { method: "POST", token: admin, body: { name: "展会扫码" } });
  assert.equal(createChannel.status, 201, JSON.stringify(createChannel.data));
  const channelList = await request("/channel-sources", { token: admin });
  assert.ok(channelList.data.some((item) => item.name === "展会扫码"));
  const disableChannel = await request(`/channel-sources/${createChannel.data.id}`, { method: "PUT", token: admin, body: { name: "展会扫码", active: false } });
  assert.equal(disableChannel.status, 200);
  assert.equal(disableChannel.data.active, false);
  const deleteChannel = await request(`/channel-sources/${createChannel.data.id}`, { method: "DELETE", token: admin });
  assert.equal(deleteChannel.status, 200);

  const publicStatusImport = await request("/import/customers", { method: "POST", token: admin, body: {
    moneyUnit: "yuan",
    rows: "客户,客户电话,状态,客户地址,渠道来源,意向产品\n绍兴公海导入工厂,13800001003,公海,浙江省绍兴市柯桥区测试路3号,官网留言,V1"
  } });
  assert.equal(publicStatusImport.status, 201, JSON.stringify(publicStatusImport.data));
  assert.equal(publicStatusImport.data.imported, 1);
  const boardAfterPublicImport = await request("/customer-board", { token: sales });
  assert.ok(boardAfterPublicImport.data.publicPool.items.some((item) => item.name === "绍兴公海导入工厂"));
  assert.equal(boardAfterPublicImport.data.publicPool.items.find((item) => item.name === "绍兴公海导入工厂").stage, "名单");

  const publicNoAddressImport = await request("/import/customers", { method: "POST", token: admin, body: {
    moneyUnit: "yuan",
    rows: "客户,客户电话,状态,渠道来源,意向产品\n福州无地址公海工厂,13800001005,公海,公众号,V1"
  } });
  assert.equal(publicNoAddressImport.status, 201, JSON.stringify(publicNoAddressImport.data));
  assert.equal(publicNoAddressImport.data.imported, 1);
  assert.equal(publicNoAddressImport.data.failed, 0);
  assert.equal(publicNoAddressImport.data.pendingLocation, 1);
  const boardAfterNoAddressImport = await request("/customer-board", { token: sales });
  assert.ok(boardAfterNoAddressImport.data.publicPool.items.some((item) => item.name === "福州无地址公海工厂"));

  const leadStatusImport = await request("/import/customers", { method: "POST", token: admin, body: {
    moneyUnit: "yuan",
    ownerId: 2,
    rows: "客户,客户电话,状态,客户地址,渠道来源,意向产品\n杭州线索导入工厂,13800001004,线索,浙江省杭州市余杭区测试路4号,官网留言,V1"
  } });
  assert.equal(leadStatusImport.status, 201, JSON.stringify(leadStatusImport.data));
  assert.equal(leadStatusImport.data.customers[0].stage, "线索");

  const forbiddenDelete = await request("/customers/101", { method: "DELETE", token: sales });
  assert.equal(forbiddenDelete.status, 403);
  const deleteCustomer = await request("/customers/101", { method: "DELETE", token: admin });
  assert.equal(deleteCustomer.status, 200);
  const boardAfterDelete = await request("/customer-board", { token: admin });
  assert.ok(!boardAfterDelete.data.items.some((item) => item.customerId === 101));

  await stopServer();
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("backend v9 organization tests passed");
}

run().catch(async (error) => {
  await stopServer();
  console.error(error);
  process.exit(1);
});
