const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-channel-source-test-"));
const uploadDir = path.join(tempDir, "uploads");
const port = 26000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;

const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  units: [{ id: "unit-a", name: "测试单位", parentId: "org-zone-east", type: "unit", zone: "东部战区" }],
  users: [
    { id: 1, name: "管理员", account: "admin", password: "778899", role: "管理员", roleId: "role-admin", unitId: "unit-a", unit: "测试单位", zone: "东部战区" },
    { id: 2, name: "运营", account: "ops", password: "123456", role: "运营", roleId: "role-ops", unitId: "unit-a", unit: "测试单位", zone: "" },
    { id: 3, name: "销售", account: "sales", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-a", unit: "测试单位", zone: "东部战区" }
  ],
  customers: [],
  opportunities: [],
  visits: [],
  activities: [],
  knowledge: [],
  resources: [],
  routes: [],
  targets: []
};

fs.mkdirSync(uploadDir, { recursive: true });
fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify(seed, null, 2));
fs.writeFileSync(path.join(tempDir, "seed.json"), JSON.stringify(seed, null, 2));

const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: tempDir,
    UPLOAD_DIR: uploadDir,
    AUTH_TOKEN_SECRET: "channel-source-import-test-secret"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

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
  const response = await request("/auth/login", { method: "POST", body: { account, password } });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data.token;
}

async function run() {
  await waitForServer();
  const admin = await login("admin", "778899");
  const ops = await login("ops", "123456");
  const sales = await login("sales", "123456");

  const rows = [
    "客户,客户电话,状态,城市,客户地址,渠道来源,意向产品",
    "官网客户A,13900000001,公海,,, 官网 留言 ,V1",
    "未知渠道客户,13900000002,公海,,,抖音私信,V1"
  ].join("\n");
  const imported = await request("/import/customers?target=public_pool", {
    method: "POST",
    token: ops,
    body: { moneyUnit: "yuan", rows }
  });
  assert.equal(imported.status, 201, JSON.stringify(imported.data));
  assert.equal(imported.data.imported, 2);
  assert.equal(imported.data.channelUnrecognized, 1);
  assert.ok(imported.data.warnings.some((item) => item.reason.includes("抖音私信")));

  const publicPool = await request("/public-pool", { token: sales });
  assert.equal(publicPool.status, 200);
  const official = publicPool.data.items.find((item) => item.name === "官网客户A");
  const unknown = publicPool.data.items.find((item) => item.name === "未知渠道客户");
  assert.equal(official.channelSource, "官网留言");
  assert.equal(unknown.channelSource, "其他");

  const blocked = await request("/customers/channel-source", {
    method: "POST",
    token: sales,
    body: { customerIds: [unknown.customerId], channelSource: "官网留言" }
  });
  assert.equal(blocked.status, 403);

  const updated = await request("/customers/channel-source", {
    method: "POST",
    token: admin,
    body: { customerIds: [unknown.customerId], channelSource: "官网留言" }
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.updated, 1);

  const publicPoolAfter = await request("/public-pool", { token: sales });
  assert.equal(publicPoolAfter.data.items.find((item) => item.name === "未知渠道客户").channelSource, "官网留言");
}

run()
  .then(() => {
    child.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log("channel source import tests passed");
  })
  .catch((error) => {
    child.kill();
    console.error(error);
    console.error(output);
    process.exitCode = 1;
  });
