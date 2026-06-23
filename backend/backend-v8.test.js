const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-v8-test-"));
const port = 24000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const now = new Date().toISOString();
const seed = {
  version: "backend-v7",
  units: [
    { id: "unit-a", name: "杭州一部", zone: "东部战区" },
    { id: "unit-b", name: "宁波一部", zone: "东部战区" },
    { id: "unit-c", name: "成都一部", zone: "西部战区" }
  ],
  users: [
    { id: 1, name: "管理员", account: "admin", password: "778899", role: "管理员", roleId: "role-admin", unitId: "unit-a", unit: "杭州一部", zone: "东部战区" },
    { id: 2, name: "销售甲", account: "sales-a", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-a", unit: "杭州一部", zone: "东部战区" },
    { id: 3, name: "销售乙", account: "sales-b", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-b", unit: "宁波一部", zone: "东部战区" },
    { id: 4, name: "甲主管", account: "supervisor", password: "123456", role: "主管", roleId: "role-supervisor", unitId: "unit-a", unit: "杭州一部", zone: "东部战区" },
    { id: 5, name: "东区经理", account: "region", password: "123456", role: "区域经理", roleId: "role-region", unitId: "unit-a", unit: "杭州一部", zone: "东部战区" }
  ],
  customers: [
    { id: 101, name: "杭州私有工厂", phone: "13800000001", ownerId: 2, owner: "销售甲", unitId: "unit-a", unit: "杭州一部", zone: "东部战区", amount: 15, contractAmount: 8, paymentAmount: 5, lifecycleStatus: "active", location: { latitude: 30.28, longitude: 120.16, city: "杭州市", address: "杭州市测试路1号", status: "resolved" } },
    { id: 102, name: "宁波私有工厂", phone: "13800000002", ownerId: 3, owner: "销售乙", unitId: "unit-b", unit: "宁波一部", zone: "东部战区", amount: 20, lifecycleStatus: "active", location: { latitude: 29.87, longitude: 121.55, city: "宁波市", address: "宁波市测试路2号", status: "resolved" } },
    { id: 103, name: "绍兴公海工厂", phone: "13800000003", ownerId: 3, owner: "销售乙", unitId: "unit-b", unit: "宁波一部", zone: "东部战区", amount: 12, lifecycleStatus: "active", location: { latitude: 30.0, longitude: 120.58, city: "绍兴市", address: "绍兴市测试路3号", status: "resolved" } },
    { id: 104, name: "宁波归档工厂", phone: "13800000004", ownerId: 3, owner: "销售乙", unitId: "unit-b", unit: "宁波一部", zone: "东部战区", lifecycleStatus: "archived", archiveReason: "invalid", location: { latitude: 29.9, longitude: 121.6, city: "宁波市", address: "宁波市测试路4号", status: "resolved" } }
  ],
  opportunities: [
    { id: 201, customerId: 101, productId: "product-v1", productName: "V1", stage: "成交", ownerId: 2, owner: "销售甲", unitId: "unit-a", unit: "杭州一部", zone: "东部战区", amount: 15, contractAmount: 8, paymentAmount: 5, paymentDate: "2026-06-01", dealAt: "2026-06-01", ownershipStatus: "locked", followUps: [{ date: "2026-06-01", createdAt: now, author: "销售甲", note: "已成交", isSystem: false }] },
    { id: 202, customerId: 102, productId: "product-erp", productName: "ERP", stage: "成交", ownerId: 3, owner: "销售乙", unitId: "unit-b", unit: "宁波一部", zone: "东部战区", contractAmount: 10, dealAt: "2026-06-02", ownershipStatus: "locked", followUps: [{ date: "2026-06-02", createdAt: now, author: "销售乙", note: "已成交", isSystem: false }] },
    { id: 203, customerId: 103, productId: "product-render", productName: "渲染软件", stage: "线索", ownerId: 3, owner: "销售乙", unitId: "unit-b", unit: "宁波一部", zone: "东部战区", ownershipStatus: "public_pool", publicPoolAt: now, publicPoolReason: "30天未跟进", followUps: [] },
    { id: 204, customerId: 104, productId: "product-v1", productName: "V1", stage: "线索", ownerId: 3, owner: "销售乙", unitId: "unit-b", unit: "宁波一部", zone: "东部战区", ownershipStatus: "locked", followUps: [] }
  ],
  visits: [
    { id: 301, customerId: 101, opportunityId: 201, factory: "杭州私有工厂", ownerId: 2, owner: "销售甲", unitId: "unit-a", unit: "杭州一部", zone: "东部战区", latitude: 30.28, longitude: 120.16, city: "杭州市", address: "杭州市测试路1号", date: "2026-06-01" },
    { id: 302, customerId: 102, opportunityId: 202, factory: "宁波私有工厂", ownerId: 3, owner: "销售乙", unitId: "unit-b", unit: "宁波一部", zone: "东部战区", latitude: 29.87, longitude: 121.55, city: "宁波市", address: "宁波市测试路2号", date: "2026-06-02" }
  ],
  targets: [{ id: "target-company", month: "2026-06", scopeType: "company", scopeId: "company", scopeName: "全公司", revenueTarget: 100, contractTarget: 80 }],
  activities: [], knowledge: [], resources: [], routes: []
};
fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify(seed, null, 2));
fs.writeFileSync(path.join(tempDir, "seed.json"), JSON.stringify(seed, null, 2));

let child;
let output = "";

function startServer() {
  output = "";
  child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: tempDir, UPLOAD_DIR: path.join(tempDir, "uploads"), AUTH_TOKEN_SECRET: "v8-money-map-permission-test-secret" },
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

async function stopServer() {
  if (!child) return;
  child.kill();
  await new Promise((resolve) => setTimeout(resolve, 200));
  child = null;
}

async function login(account) {
  const result = await request("/auth/login", { method: "POST", body: { account, password: account === "admin" ? "778899" : "123456", moneyUnit: "yuan" } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.token;
}

async function run() {
  startServer();
  await waitForServer();
  const health = await request("/health");
  assert.equal(health.data.backendVersion, "backend-v9");
  assert.equal(health.data.moneyUnit, "yuan");

  const migrated = JSON.parse(fs.readFileSync(path.join(tempDir, "db.json"), "utf8"));
  assert.equal(migrated.moneyUnit, "yuan");
  assert.equal(migrated.customers.find((item) => item.id === 101).amount, 150000);
  assert.equal(migrated.opportunities.find((item) => item.id === 201).contractAmount, 80000);
  assert.equal(migrated.opportunities.find((item) => item.id === 201).paymentAmount, 50000);
  assert.equal(migrated.targets[0].revenueTarget, 1000000);

  const admin = await login("admin");
  const salesA = await login("sales-a");
  const supervisor = await login("supervisor");
  const region = await login("region");

  const adminBoard = await request("/customer-board", { token: admin });
  assert.equal(adminBoard.status, 200);
  assert.equal(adminBoard.data.backendVersion, "backend-v9");
  assert.ok(adminBoard.data.items.some((item) => item.customerId === 101));
  assert.ok(adminBoard.data.items.some((item) => item.customerId === 102));
  assert.equal(adminBoard.data.publicPool.count, 1);
  const salesBoard = await request("/customer-board", { token: salesA });
  assert.equal(salesBoard.status, 200);
  assert.deepEqual(salesBoard.data.items.map((item) => item.customerId), [101]);
  assert.equal(salesBoard.data.publicPool.count, 1);
  assert.equal(salesBoard.data.invalid.count, 1);
  assert.ok(salesBoard.data.invalid.items.some((item) => item.customerId === 104 && item.lifecycleStatus === "archived"));
  const adminMiniState = await request("/state?client=mini", { token: admin });
  assert.ok(adminMiniState.data.opportunities.some((item) => item.customerId === 101));
  assert.ok(adminMiniState.data.opportunities.some((item) => item.customerId === 102));
  const salesMiniState = await request("/state?client=mini", { token: salesA });
  assert.deepEqual(salesMiniState.data.opportunities.map((item) => item.customerId), [101, 104]);
  assert.deepEqual(salesMiniState.data.customers.map((item) => item.id), [101]);

  const forbiddenMetadataEdit = await request("/customers/101", { method: "PUT", token: salesA, body: { channelSource: "地推", createdBy: "销售甲", moneyUnit: "yuan" } });
  assert.equal(forbiddenMetadataEdit.status, 403);
  assert.match(forbiddenMetadataEdit.data.error, /渠道来源和录入人/);
  const allowedMetadataEdit = await request("/customers/101", { method: "PUT", token: admin, body: { channelSource: "地推", createdBy: "管理员", moneyUnit: "yuan" } });
  assert.equal(allowedMetadataEdit.status, 200);

  const oldClientCustomer = await request("/customers", { method: "POST", token: salesA, body: { name: "旧客户端金额工厂", phone: "13800000005", productId: "product-v1", stage: "成交", demoAt: "2026-06-10", contractAmount: 8 } });
  assert.equal(oldClientCustomer.status, 201);
  assert.equal(oldClientCustomer.data.contractAmount, 80000);
  const yuanClientCustomer = await request("/customers", { method: "POST", token: salesA, body: { name: "元单位客户端工厂", phone: "13800000006", productId: "product-v1", stage: "成交", demoAt: "2026-06-10", contractAmount: 80000, moneyUnit: "yuan" } });
  assert.equal(yuanClientCustomer.status, 201);
  assert.equal(yuanClientCustomer.data.contractAmount, 80000);

  const listCustomer = await request("/customers", { method: "POST", token: salesA, body: { name: "推进必填测试工厂", phone: "13800000007", productId: "product-v1", stage: "名单", moneyUnit: "yuan" } });
  assert.equal(listCustomer.status, 201);
  const missingAdvanceNote = await request(`/opportunities/${listCustomer.data.id}/advance`, { method: "POST", token: salesA, body: { nextFollow: "2026-06-20", moneyUnit: "yuan" } });
  assert.equal(missingAdvanceNote.status, 400);
  assert.equal(missingAdvanceNote.data.field, "note");
  const missingNextFollow = await request(`/opportunities/${listCustomer.data.id}/advance`, { method: "POST", token: salesA, body: { note: "确认客户有明确需求", moneyUnit: "yuan" } });
  assert.equal(missingNextFollow.status, 400);
  assert.equal(missingNextFollow.data.field, "nextFollow");
  const validLeadAdvance = await request(`/opportunities/${listCustomer.data.id}/advance`, { method: "POST", token: salesA, body: { note: "确认客户有明确需求", nextFollow: "2026-06-20", moneyUnit: "yuan" } });
  assert.equal(validLeadAdvance.status, 200);
  assert.equal(validLeadAdvance.data.stage, "线索");
  const validOpportunityAdvance = await request(`/opportunities/${listCustomer.data.id}/advance`, { method: "POST", token: salesA, body: { demoAt: "2026-06-16", note: "已完成有效演示", nextFollow: "2026-06-21", moneyUnit: "yuan" } });
  assert.equal(validOpportunityAdvance.status, 200);
  const dealWithoutNextFollow = await request(`/opportunities/${listCustomer.data.id}/advance`, { method: "POST", token: salesA, body: { note: "客户已签约成交", contractAmount: 80000, paymentOwnerId: 2, moneyUnit: "yuan" } });
  assert.equal(dealWithoutNextFollow.status, 200, JSON.stringify(dealWithoutNextFollow.data));
  assert.equal(dealWithoutNextFollow.data.stage, "成交");

  const pool = await request("/public-pool", { token: salesA });
  assert.equal(pool.data.backendVersion, "backend-v9");
  assert.equal(pool.data.count, 1);
  assert.equal(pool.data.items[0].phone, "认领后可见");

  const salesMap = await request("/map/points", { token: salesA });
  assert.ok(salesMap.data.points.some((item) => item.customerId === 101 && item.pointStatus === "sold"));
  assert.ok(!salesMap.data.points.some((item) => item.customerId === 102 || item.customerId === 104));
  const publicPoint = salesMap.data.points.find((item) => item.customerId === 103);
  assert.equal(publicPoint.pointStatus, "pending");
  assert.equal(publicPoint.stage, "公海");
  assert.equal(publicPoint.phone, "");
  assert.equal(publicPoint.owner, "");
  assert.equal(publicPoint.visitCount, 0);

  const supervisorMap = await request("/map/points", { token: supervisor });
  assert.ok(supervisorMap.data.points.some((item) => item.customerId === 101));
  assert.ok(!supervisorMap.data.points.some((item) => item.customerId === 102));
  const regionMap = await request("/map/points", { token: region });
  assert.ok(regionMap.data.points.some((item) => item.customerId === 102));
  assert.ok(regionMap.data.points.some((item) => item.customerId === 104 && item.pointStatus === "archived"));

  assert.equal((await request("/customers/102/visits", { token: salesA })).status, 404);
  assert.equal((await request("/customers/102/visits", { token: supervisor })).status, 404);
  assert.equal((await request("/customers/102/visits", { token: region })).status, 200);
  assert.equal((await request("/customers/103/visits", { token: salesA })).status, 409);

  const forgedVisit = await request("/visits", { method: "POST", token: salesA, body: { customerId: 101, opportunityId: 201, factory: "杭州私有工厂", phone: "13800000001", latitude: 30.28, longitude: 120.16, city: "杭州市", address: "杭州市测试路1号", ownerId: 3, owner: "销售乙", unitId: "unit-b", zone: "西部战区", moneyUnit: "yuan" } });
  assert.equal(forgedVisit.status, 201);
  assert.equal(forgedVisit.data.ownerId, 2);
  assert.equal(forgedVisit.data.owner, "销售甲");
  assert.equal(forgedVisit.data.unitId, "unit-a");
  assert.equal(forgedVisit.data.zone, "东部战区");

  const newFactoryVisit = await request("/visits", { method: "POST", token: salesA, body: {
    customerId: 0,
    factory: "无锡新地推工厂",
    phone: "13800000008",
    status: "线索",
    latitude: 31.4912,
    longitude: 120.3119,
    city: "无锡市",
    address: "江苏省无锡市测试路8号",
    photos: ["/uploads/new-factory.jpg"],
    result: "首次现场拜访",
    moneyUnit: "yuan"
  } });
  assert.equal(newFactoryVisit.status, 201, JSON.stringify(newFactoryVisit.data));
  assert.ok(newFactoryVisit.data.customerId);
  assert.ok(newFactoryVisit.data.opportunityId);
  const boardAfterVisit = await request("/customer-board", { token: salesA });
  const newFactoryOpportunity = boardAfterVisit.data.items.find((item) => item.customerId === newFactoryVisit.data.customerId);
  assert.equal(newFactoryOpportunity.productName, "待确认产品");
  assert.equal(newFactoryOpportunity.stage, "线索");

  const unauthorizedRoute = await request("/routes", { method: "POST", token: salesA, body: { date: "2026-06-14", stops: [{ customerId: 102 }] } });
  assert.equal(unauthorizedRoute.status, 403);
  const publicRoute = await request("/routes", { method: "POST", token: salesA, body: { date: "2026-06-14", stops: [{ customerId: 103, owner: "销售乙", phone: "13800000003" }] } });
  assert.equal(publicRoute.status, 201);
  assert.equal(publicRoute.data.stops[0].name, "绍兴公海工厂");
  assert.ok(!Object.prototype.hasOwnProperty.call(publicRoute.data.stops[0], "phone"));

  const oldTarget = await request("/targets", { method: "POST", token: admin, body: { month: "2026-07", scopeType: "company", scopeId: "company", scopeName: "全公司", revenueTarget: 8, contractTarget: 5 } });
  assert.equal(oldTarget.data.revenueTarget, 80000);
  const yuanTarget = await request("/targets", { method: "POST", token: admin, body: { month: "2026-07", scopeType: "company", scopeId: "company", scopeName: "全公司", revenueTarget: 90000, contractTarget: 60000, moneyUnit: "yuan" } });
  assert.equal(yuanTarget.data.revenueTarget, 90000);

  await stopServer();
  startServer();
  await waitForServer();
  const afterRestart = JSON.parse(fs.readFileSync(path.join(tempDir, "db.json"), "utf8"));
  assert.equal(afterRestart.opportunities.find((item) => item.id === 201).contractAmount, 80000);
  assert.equal(afterRestart.targets.find((item) => item.id === "target-company").revenueTarget, 1000000);
}

run()
  .then(async () => { await stopServer(); console.log("backend v8 tests passed"); })
  .catch(async (error) => { await stopServer(); console.error(error); console.error(output); process.exitCode = 1; });
