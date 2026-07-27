const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-workflow-test-"));
const port = 27000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  users: [
    { id: 1, name: "管理员", account: "admin", password: "778899", role: "管理员", roleId: "role-admin", unit: "测试单位" },
    { id: 2, name: "销售甲", account: "sales", password: "123456", role: "销售", roleId: "role-sales", unit: "测试单位" }
  ],
  customers: [
    { id: 101, name: "线索工厂", phone: "13800002001", ownerId: 2, owner: "销售甲", unit: "测试单位", lifecycleStatus: "active", createdAt: "46203" },
    { id: 102, name: "商机工厂", phone: "13800002002", ownerId: 2, owner: "销售甲", unit: "测试单位", lifecycleStatus: "active", createdAt: today },
    { id: 103, name: "跟进推进工厂", phone: "13800002003", ownerId: 2, owner: "销售甲", unit: "测试单位", lifecycleStatus: "active", createdAt: today },
    { id: 104, name: "无效恢复工厂", phone: "13800002004", ownerId: 2, owner: "销售甲", unit: "测试单位", lifecycleStatus: "active", createdAt: today }
  ],
  opportunities: [
    { id: 201, customerId: 101, productId: "product-v1", productName: "V1", stage: "线索", ownerId: 2, owner: "销售甲", unit: "测试单位", ownershipStatus: "locked", leadAt: "46203", lastFollow: "46203", followUps: [{ date: "46203", createdAt: "46203", author: "销售甲", note: "历史有效跟进", isSystem: false }] },
    { id: 202, customerId: 102, productId: "product-v1", productName: "V1", stage: "商机", ownerId: 2, owner: "销售甲", unit: "测试单位", ownershipStatus: "locked", demoAt: today, opportunityAt: today, followUps: [] },
    { id: 203, customerId: 103, productId: "product-v1", productName: "V1", stage: "名单", ownerId: 2, owner: "销售甲", unit: "测试单位", ownershipStatus: "locked", createdAt: today, followUps: [] },
    { id: 204, customerId: 104, productId: "product-v1", productName: "V1", stage: "名单", ownerId: 2, owner: "销售甲", unit: "测试单位", ownershipStatus: "locked", createdAt: today, followUps: [] }
  ],
  visits: [],
  activities: [],
  knowledge: [],
  resources: [],
  routes: [],
  targets: []
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
      AUTH_TOKEN_SECRET: "workflow-corrections-test-secret",
      STATE_WRITE_DELAY_MS: "0"
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
  const result = await request("/auth/login", {
    method: "POST",
    body: { account, password, moneyUnit: "yuan" }
  });
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
  const sales = await login("sales", "123456");

  const initialBoard = await request(`/customer-board?paginated=1&stage=${encodeURIComponent("线索")}`, { token: admin });
  assert.equal(initialBoard.status, 200);
  const normalizedRow = initialBoard.data.items.find((item) => item.id === 201);
  assert.ok(normalizedRow);
  assert.notEqual(normalizedRow.createdAt, "46203");
  assert.notEqual(normalizedRow.lastFollow, "46203");

  const forbiddenCorrection = await request("/opportunities/batch-correct-stage", {
    method: "POST",
    token: sales,
    body: { ids: [201], targetStage: "名单", reason: "测试越权" }
  });
  assert.equal(forbiddenCorrection.status, 403);

  const corrected = await request("/opportunities/batch-correct-stage", {
    method: "POST",
    token: admin,
    body: { ids: [201, 202], targetStage: "名单", reason: "修正误导入阶段" }
  });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.data));
  assert.equal(corrected.data.updated, 2);
  const correctedLead = await request("/opportunities/201/detail", { token: admin });
  const correctedOpportunity = await request("/opportunities/202/detail", { token: admin });
  assert.equal(correctedLead.data.stage, "名单");
  assert.equal(correctedOpportunity.data.stage, "名单");
  assert.equal(correctedOpportunity.data.opportunityAt, "");
  assert.equal(correctedLead.data.stageCorrectionHistory.at(-1).reason, "修正误导入阶段");

  const followedAndAdvanced = await request("/opportunities/203/follow-and-advance", {
    method: "POST",
    token: sales,
    body: {
      note: "客户确认有进一步了解意向",
      nextFollow: today,
      productId: "product-v1",
      productName: "V1"
    }
  });
  assert.equal(followedAndAdvanced.status, 200, JSON.stringify(followedAndAdvanced.data));
  assert.equal(followedAndAdvanced.data.stage, "线索");
  assert.equal(
    followedAndAdvanced.data.followUps.filter((item) => item.note === "客户确认有进一步了解意向" && item.isSystem === false).length,
    1
  );

  const archived = await request("/customers/104/archive", {
    method: "POST",
    token: sales,
    body: { reason: "invalid", note: "号码无效" }
  });
  assert.equal(archived.status, 200);
  const forbiddenRestore = await request("/customers/104/restore", { method: "POST", token: sales, body: {} });
  assert.equal(forbiddenRestore.status, 403);
  const restored = await request("/customers/104/restore", { method: "POST", token: admin, body: {} });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.lifecycleStatus, "active");

  const persisted = JSON.parse(fs.readFileSync(path.join(tempDir, "db.json"), "utf8"));
  assert.ok(persisted.excelDateSerialsNormalizedAt);
  assert.notEqual(persisted.customers.find((item) => item.id === 101).createdAt, "46203");

  await stopServer();
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("workflow correction tests passed");
}

run().catch(async (error) => {
  await stopServer();
  console.error(error);
  console.error(output);
  process.exit(1);
});
