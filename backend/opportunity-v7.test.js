const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-v7-test-"));
const port = 23000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const seed = {
  version: "backend-v6",
  units: [{ id: "unit-a", name: "杭州一部", zone: "东部战区" }],
  users: [
    { id: 1, name: "管理员", account: "admin", password: "778899", role: "管理员", roleId: "role-admin", unitId: "unit-a", unit: "杭州一部", zone: "东部战区" },
    { id: 2, name: "销售甲", account: "sales-a", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-a", unit: "杭州一部", zone: "东部战区" }
  ],
  customers: [], opportunities: [], visits: [], activities: [], targets: [], knowledge: [], resources: []
};
fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify(seed, null, 2));
fs.writeFileSync(path.join(tempDir, "seed.json"), JSON.stringify(seed, null, 2));

const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: { ...process.env, PORT: String(port), DATA_DIR: tempDir, UPLOAD_DIR: path.join(tempDir, "uploads"), AUTH_TOKEN_SECRET: "v7-opportunity-test-secret" },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

async function request(pathname, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${baseUrl}${pathname}`, { method: options.method || "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  return { status: response.status, data: await response.json() };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await request("/health")).status === 200) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(output);
}

async function login(account, password) {
  const result = await request("/auth/login", { method: "POST", body: { account, password } });
  assert.equal(result.status, 200);
  return result.data.token;
}

async function run() {
  await waitForServer();
  const admin = await login("admin", "778899");
  const sales = await login("sales-a", "123456");

  const wonV1 = await request("/customers", { method: "POST", token: sales, body: {
    name: "杭州多产品测试工厂", phone: "13912345678", address: "浙江省杭州市余杭区测试路1号", city: "杭州市",
    productId: "product-v1", stage: "成交", demoAt: "2026-06-01", contractAmount: 8,
    competitorProfiles: [{ competitorId: "competitor-3vjia", brand: "三维家", isPrimary: true }]
  } });
  assert.equal(wonV1.status, 201);
  assert.equal(wonV1.data.productName, "V1");
  assert.equal(wonV1.data.software, "三维家");

  const v3 = await request(`/customers/${wonV1.data.customerId}/opportunities`, { method: "POST", token: sales, body: { productId: "product-v3-upgrade", note: "客户希望了解V3升级", nextFollow: "2026-06-16" } });
  assert.equal(v3.status, 201);
  assert.equal(v3.data.stage, "线索");
  const erp = await request(`/customers/${wonV1.data.customerId}/opportunities`, { method: "POST", token: sales, body: { productId: "product-erp", note: "客户同时评估ERP", nextFollow: "2026-06-17" } });
  assert.equal(erp.status, 201);
  const duplicateV3 = await request(`/customers/${wonV1.data.customerId}/opportunities`, { method: "POST", token: sales, body: { productId: "product-v3-upgrade", note: "重复机会测试", nextFollow: "2026-06-18" } });
  assert.equal(duplicateV3.status, 409);
  assert.equal(duplicateV3.data.code, "DUPLICATE_ACTIVE_OPPORTUNITY");
  const duplicateProductEdit = await request(`/opportunities/${erp.data.id}`, { method: "PUT", token: sales, body: { productId: "product-v3-upgrade" } });
  assert.equal(duplicateProductEdit.status, 409);
  const productEdit = await request(`/customers/${wonV1.data.customerId}`, { method: "PUT", token: sales, body: {
    opportunityId: erp.data.id, name: wonV1.data.name, phone: wonV1.data.phone, productId: "product-render"
  } });
  assert.equal(productEdit.status, 200);
  assert.equal(productEdit.data.productName, "渲染软件");

  const advanceV3 = await request(`/opportunities/${v3.data.id}/advance`, { method: "POST", token: sales, body: { demoAt: "2026-06-14", note: "已完成V3真实订单演示", nextFollow: "2026-06-16" } });
  assert.equal(advanceV3.status, 200);
  assert.equal(advanceV3.data.stage, "商机");
  const webState = await request("/state", { token: sales });
  const customerOpportunities = webState.data.opportunities.filter((item) => Number(item.customerId) === Number(wonV1.data.customerId));
  assert.equal(customerOpportunities.length, 3);
  assert.ok(customerOpportunities.some((item) => item.stage === "成交" && item.productName === "V1"));
  assert.ok(customerOpportunities.some((item) => item.stage === "商机" && item.productName === "V3升级"));
  const rollbackRequest = await request(`/opportunities/${advanceV3.data.id}/rollback-request`, { method: "POST", token: sales, body: { reason: "误推进", note: "演示标准未达成" } });
  assert.equal(rollbackRequest.status, 200);
  assert.equal(rollbackRequest.data.rollbackHistory.at(-1).status, "pending");
  const salesReview = await request(`/opportunities/${advanceV3.data.id}/rollback-review`, { method: "POST", token: sales, body: { action: "approve" } });
  assert.equal(salesReview.status, 403);
  const adminReview = await request(`/opportunities/${advanceV3.data.id}/rollback-review`, { method: "POST", token: admin, body: { action: "approve" } });
  assert.equal(adminReview.status, 200);
  assert.equal(adminReview.data.stage, "线索");
  assert.equal(adminReview.data.rollbackHistory.at(-1).status, "approved");
  const purchased = await request(`/opportunities/${productEdit.data.id}/mark-purchased`, { method: "POST", token: sales, body: { note: "客户已经购买渲染软件", product: "渲染软件", brand: "其他", purchasedAt: "2026-06-15" } });
  assert.equal(purchased.status, 200);
  assert.equal(purchased.data.outcomeStatus, "purchased_existing");

  const publicImport = await request("/import/customers?target=public_pool", { method: "POST", token: admin, body: {
    rows: "客户名称,客户电话,客户地址,城市\n宁波公海测试工厂,13812345679,浙江省宁波市鄞州区测试路2号,宁波市"
  } });
  assert.equal(publicImport.status, 201);
  assert.equal(publicImport.data.imported, 1);
  const pool = await request("/public-pool", { token: sales });
  assert.equal(pool.data.count, 1);
  assert.equal(pool.data.items[0].phone, "认领后可见");
  assert.equal(pool.data.items[0].city, "宁波市");
  assert.equal(pool.data.items[0].productName, "待确认产品");
  const customerBoard = await request("/customer-board?full=1", { token: sales });
  assert.equal(customerBoard.status, 200);
  assert.equal(customerBoard.data.backendVersion, "backend-v9");
  assert.ok(customerBoard.data.items.some((item) => item.productName === "V1" && item.stage === "成交"));
  assert.equal(customerBoard.data.publicPool.count, 1);
  const stateWithPool = await request("/state", { token: sales });
  const sanitizedStateOpportunity = stateWithPool.data.opportunities.find((item) => Number(item.id) === Number(pool.data.items[0].id));
  assert.equal(sanitizedStateOpportunity.phone, "认领后可见");
  assert.ok(!stateWithPool.data.customers.some((item) => Number(item.id) === Number(pool.data.items[0].customerId)));
  const adminClaim = await request(`/opportunities/${pool.data.items[0].id}/claim`, { method: "POST", token: admin });
  assert.equal(adminClaim.status, 403);
  const claimed = await request(`/opportunities/${pool.data.items[0].id}/claim`, { method: "POST", token: sales });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.data.phone, "13812345679");
  assert.equal(claimed.data.productName, "待确认产品");
  const missingProductFollow = await request(`/opportunities/${claimed.data.id}/follow`, { method: "POST", token: sales, body: { note: "认领后首次有效跟进", nextFollow: "2026-06-18" } });
  assert.equal(missingProductFollow.status, 400);
  assert.equal(missingProductFollow.data.field, "productId");
  const productFollow = await request(`/opportunities/${claimed.data.id}/follow`, { method: "POST", token: sales, body: { note: "认领后补充ERP需求", nextFollow: "2026-06-18", productId: "product-erp" } });
  assert.equal(productFollow.status, 200);
  assert.equal(productFollow.data.ownershipStatus, "locked");
  assert.equal(productFollow.data.productName, "ERP");
  const claimedState = await request("/state", { token: sales });
  const claimedOpportunity = claimedState.data.opportunities.find((item) => Number(item.id) === Number(claimed.data.id));
  assert.equal(claimedOpportunity.productName, "ERP");

  const visit = await request("/visits", { method: "POST", token: sales, body: {
    customerId: wonV1.data.customerId, opportunityId: wonV1.data.id, factory: wonV1.data.name, phone: wonV1.data.phone,
    status: "成交", latitude: 30.28, longitude: 120.16, city: "杭州市", address: "浙江省杭州市余杭区测试路1号", ownerId: 2, owner: "销售甲"
  } });
  assert.equal(visit.status, 201);
  const map = await request("/map/points", { token: sales });
  const wonPoint = map.data.points.find((item) => Number(item.customerId) === Number(wonV1.data.customerId));
  assert.equal(wonPoint?.pointStatus, "sold");
  const persisted = JSON.parse(fs.readFileSync(path.join(tempDir, "db.json"), "utf8"));
  assert.equal(persisted.version, "backend-v9");
  assert.equal(persisted.customers.length, 2);
  assert.equal(persisted.opportunities.length, 4);
}

run()
  .then(() => { child.kill(); console.log("opportunity v7 tests passed"); })
  .catch((error) => { child.kill(); console.error(error); console.error(output); process.exitCode = 1; });
