const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-city-normalization-test-"));
const port = 32000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const today = new Date().toISOString().slice(0, 10);
const customers = [
  { id: 1, name: "定位优先", phone: "13810000001", city: "40", address: "广东省广州市天河区", location: { city: "广东省佛山市", latitude: 23, longitude: 113 } },
  { id: 2, name: "客户城市恢复", phone: "13810000002", city: "广东省佛山市", address: "", location: { city: "16" } },
  { id: 3, name: "地址恢复", phone: "13810000003", city: "甘肃省", address: "甘肃省兰州市城关区", location: { city: "" } },
  { id: 4, name: "无后缀城市", phone: "13810000004", city: "佛山", address: "", location: { city: "" } },
  { id: 5, name: "自治州", phone: "13810000005", city: "恩施土家族苗族自治州", address: "", location: { city: "" } },
  { id: 6, name: "战区脏值", phone: "13810000006", city: "东部战区", address: "", location: { city: "17" } },
  { id: 7, name: "空值", phone: "13810000007", city: "", address: "", location: { city: "" } },
  { id: 8, name: "国外国家", phone: "13810000008", city: "美国", address: "美国", location: { city: "" } },
  { id: 9, name: "有效定位", phone: "13810000009", city: "宁波市", address: "浙江省宁波市", location: { city: "杭州市" } }
].map((customer) => ({ ...customer, createdAt: today, channelSource: "其他", lifecycleStatus: "active" }));
const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  users: [
    { id: 1, name: "管理员", account: "admin", password: "778899", role: "管理员", roleId: "role-admin" },
    { id: 2, name: "销售", account: "sales", password: "123456", role: "销售", roleId: "role-sales" }
  ],
  customers,
  opportunities: customers.map((customer) => ({
    id: 100 + customer.id, customerId: customer.id, productId: "product-v1", productName: "V1", stage: "名单",
    ownerId: 2, owner: "销售", followPerson: "销售", createdBy: "管理员", createdAt: today, ownershipStatus: "locked", followUps: []
  })),
  visits: [], activities: [], units: [], routes: [], targets: [], knowledge: [], resources: []
};
fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify(seed, null, 2));
fs.writeFileSync(path.join(tempDir, "seed.json"), JSON.stringify(seed, null, 2));

let output = "";
const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: { ...process.env, PORT: String(port), DATA_DIR: tempDir, AUTH_TOKEN_SECRET: "city-normalization-test-secret" },
  stdio: ["ignore", "pipe", "pipe"]
});
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

async function request(pathname, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET", headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return { status: response.status, data: await response.json() };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await request("/health")).status === 200) return; } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(output);
}

async function login(account, password) {
  const response = await request("/auth/login", { method: "POST", body: { account, password } });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data.token;
}

async function run() {
  await waitForServer();
  const admin = await login("admin", "778899");
  const sales = await login("sales", "123456");
  const beforeDryRun = fs.readFileSync(path.join(tempDir, "db.json"), "utf8");
  const forbidden = await request("/admin/customer-cities/normalize", { method: "POST", token: sales, body: { dryRun: true } });
  assert.equal(forbidden.status, 403);

  const preview = await request("/admin/customer-cities/normalize", { method: "POST", token: admin, body: { dryRun: true } });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.data.dryRun, true);
  assert.equal(preview.data.scanned, 9);
  assert.equal(preview.data.corrected, 7);
  assert.equal(preview.data.pendingRecognition, 3);
  assert.equal(fs.readFileSync(path.join(tempDir, "db.json"), "utf8"), beforeDryRun, "dry run must not write data");

  const applied = await request("/admin/customer-cities/normalize", {
    method: "POST", token: admin, body: { confirm: "NORMALIZE_CUSTOMER_CITIES" }
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.data));
  assert.equal(applied.data.dryRun, false);
  assert.ok(fs.existsSync(applied.data.backupPath), applied.data.backupPath);
  assert.match(path.basename(applied.data.backupPath), /^db-before-city-normalization-/);

  const saved = JSON.parse(fs.readFileSync(path.join(tempDir, "db.json"), "utf8"));
  assert.equal(saved.customers.length, 9);
  const byId = new Map(saved.customers.map((customer) => [Number(customer.id), customer]));
  assert.equal(byId.get(1).city, "佛山市");
  assert.equal(byId.get(2).city, "佛山市");
  assert.equal(byId.get(3).city, "兰州市");
  assert.equal(byId.get(4).city, "佛山市");
  assert.equal(byId.get(5).city, "恩施土家族苗族自治州");
  assert.equal(byId.get(6).city, "待识别");
  assert.equal(byId.get(7).city, "待识别");
  assert.equal(byId.get(8).city, "待识别");
  assert.equal(byId.get(9).city, "杭州市");
  assert.equal(byId.get(1).location.city, "佛山市");
  assert.equal(byId.get(6).location.city, "待识别");
  assert.equal(byId.get(1).address, "广东省广州市天河区");
  assert.equal(byId.get(1).location.latitude, 23);

  const board = await request(`/customer-board?stage=${encodeURIComponent("名单")}&paginated=1&page=1&pageSize=20`, { token: admin });
  assert.equal(board.status, 200, JSON.stringify(board.data));
  const cities = board.data.filterOptions?.cities || [];
  assert.ok(cities.includes("佛山市"));
  assert.ok(cities.includes("兰州市"));
  assert.ok(!cities.includes("待识别"));
  assert.ok(!cities.some((city) => /^\d+$/.test(city) || /战区/.test(city)));

  const secondPreview = await request("/admin/customer-cities/normalize", { method: "POST", token: admin, body: {} });
  assert.equal(secondPreview.status, 200);
  assert.equal(secondPreview.data.corrected, 0, "normalization must be idempotent");
  child.kill();
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("customer city normalization tests passed");
}

run().catch((error) => {
  child.kill();
  console.error(error);
  console.error(output);
  fs.rmSync(tempDir, { recursive: true, force: true });
  process.exitCode = 1;
});
