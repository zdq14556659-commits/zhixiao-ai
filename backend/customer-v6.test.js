const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-v6-test-"));
const uploadDir = path.join(tempDir, "uploads");
const port = 22000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const state = {
  version: "backend-v5",
  units: [{ id: "unit-a", name: "测试一部", zone: "东部战区" }],
  users: [
    { id: 1, name: "管理员", account: "admin", password: "778899", role: "管理员", roleId: "role-admin", unitId: "unit-a", unit: "测试一部", zone: "东部战区" },
    { id: 2, name: "销售甲", account: "sales-a", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-a", unit: "测试一部", zone: "东部战区" },
    { id: 3, name: "销售乙", account: "sales-b", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-a", unit: "测试一部", zone: "东部战区" }
  ],
  customers: [], visits: [], activities: [], targets: [], knowledge: [{ id: 1, question: "换软件担心数据迁移", answer: "先用真实订单进行双轨验证。", tags: { salesStages: ["线索"] } }], resources: []
};

fs.mkdirSync(uploadDir, { recursive: true });
fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify(state, null, 2));
fs.writeFileSync(path.join(tempDir, "seed.json"), JSON.stringify(state, null, 2));

const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: { ...process.env, PORT: String(port), DATA_DIR: tempDir, UPLOAD_DIR: uploadDir, AUTH_TOKEN_SECRET: "v6-test-secret-with-sufficient-length" },
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
  const response = await request("/auth/login", { method: "POST", body: { account, password } });
  assert.equal(response.status, 200);
  return response.data.token;
}

async function run() {
  await waitForServer();
  const admin = await login("admin", "778899");
  const salesA = await login("sales-a", "123456");
  const salesB = await login("sales-b", "123456");

  const first = await request("/customers", { method: "POST", token: salesA, body: {
    name: "杭州测试定制工厂", stage: "线索", address: "浙江省杭州市余杭区测试路1号",
    contacts: [
      { name: "张老板", phone: "13900001111", isPrimary: true, decisionRole: "决策人" },
      { name: "李设计", phone: "13700002222", isPrimary: false, decisionRole: "使用人" }
    ],
    competitorProfiles: [{ brand: "三维家", version: "企业版", isPrimary: true }]
  } });
  assert.equal(first.status, 201);
  assert.equal(first.data.contacts.length, 2);

  const second = await request("/customers", { method: "POST", token: salesB, body: {
    name: "宁波测试家具厂", stage: "名单", address: "浙江省宁波市鄞州区测试路2号",
    contacts: [
      { name: "王老板", phone: "13600003333", isPrimary: true },
      { name: "共享顾问", phone: "13700002222", isPrimary: false }
    ]
  } });
  assert.equal(second.status, 201, "次要联系人手机号允许重复");

  const duplicatePrimary = await request("/customers", { method: "POST", token: salesB, body: { name: "重复主联系人", phone: "+86 139-0000-1111", address: "上海市测试路" } });
  assert.equal(duplicatePrimary.status, 409);
  assert.equal(duplicatePrimary.data.code, "DUPLICATE_CUSTOMER");

  for (let index = 0; index < 2; index += 1) {
    const visit = await request("/visits", { method: "POST", token: salesA, body: {
      customerId: first.data.customerId, opportunityId: first.data.id, factory: first.data.name, phone: first.data.phone, status: "线索",
      latitude: 30.28, longitude: 120.16, city: "杭州市", address: "浙江省杭州市余杭区测试路1号",
      result: `第${index + 1}次拜访`, ownerId: 2, owner: "销售甲", date: "2026-06-13"
    } });
    assert.equal(visit.status, 201);
  }
  const map = await request("/map/points", { token: salesA });
  const point = map.data.points.find((item) => Number(item.customerId) === Number(first.data.customerId));
  assert.equal(point.visitCount, 2);
  assert.equal(map.data.points.filter((item) => Number(item.customerId) === Number(first.data.customerId)).length, 1);

  const advice = await request(`/ai/customers/${first.data.customerId}/advice`, { method: "POST", token: salesA, body: { question: "客户担心历史数据迁移", opportunityId: first.data.id } });
  assert.equal(advice.status, 200);
  ["intention", "coreObjection", "recommendedScript", "communicationGoal", "nextAction", "followUpDraft", "riskReminder"].forEach((key) => assert.ok(advice.data.advice[key]));
  assert.ok(advice.data.citations.length);

  const archive = await request(`/customers/${first.data.customerId}/archive`, { method: "POST", token: salesA, body: { reason: "closed" } });
  assert.equal(archive.status, 200);
  const archivedMap = await request("/map/points?pointStatus=archived", { token: salesA });
  assert.ok(archivedMap.data.points.some((item) => Number(item.customerId) === Number(first.data.customerId) && item.pointStatus === "archived"));

  const offboard = await request("/users/2/offboard", { method: "POST", token: admin, body: { receiverId: 3 } });
  assert.equal(offboard.status, 200);
  const migrated = JSON.parse(fs.readFileSync(path.join(tempDir, "db.json"), "utf8"));
  assert.equal(migrated.version, "backend-v7");
  assert.ok(migrated.competitors.length >= 5);
  assert.ok(!Object.prototype.hasOwnProperty.call(migrated.users[0], "password"));
}

run().then(() => { child.kill(); console.log("customer v6 tests passed"); }).catch((error) => { child.kill(); console.error(error); console.error(output); process.exitCode = 1; });
