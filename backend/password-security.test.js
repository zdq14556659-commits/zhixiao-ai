const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-password-test-"));
const uploadDir = path.join(tempDir, "uploads");
const port = 19000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const legacyState = {
  version: "backend-v4",
  currentUserId: 1,
  roles: [{ id: "role-unit-admin", name: "单位账号管理员", customerScope: "unit", permissions: ["dashboard", "customers", "admin"] }],
  units: [
    { id: "unit-test", name: "测试单位", zone: "东部战区" },
    { id: "unit-other", name: "其他单位", zone: "南部战区" }
  ],
  users: [
    { id: 1, name: "管理员", account: "admin", phone: "", password: "778899", role: "管理员", roleId: "role-admin", unitId: "unit-test", unit: "测试单位", zone: "东部战区" },
    { id: 2, name: "测试销售", account: "sales", phone: "13800138000", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-test", unit: "测试单位", zone: "东部战区" },
    { id: 3, name: "锁定测试", account: "locktest", phone: "13900139000", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-test", unit: "测试单位", zone: "东部战区" },
    { id: 4, name: "单位账号管理员", account: "unitadmin", phone: "13700137000", password: "123456", role: "单位账号管理员", roleId: "role-unit-admin", unitId: "unit-test", unit: "测试单位", zone: "东部战区" },
    { id: 5, name: "其他单位销售", account: "othersales", phone: "13600136000", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-other", unit: "其他单位", zone: "南部战区" }
  ],
  customers: [],
  activities: [],
  visits: [],
  targets: [],
  knowledge: [],
  resources: []
};

fs.mkdirSync(uploadDir, { recursive: true });
fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify(legacyState, null, 2));
fs.writeFileSync(path.join(tempDir, "seed.json"), JSON.stringify(legacyState, null, 2));

const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: tempDir,
    UPLOAD_DIR: uploadDir,
    AUTH_TOKEN_SECRET: "password-security-test-secret-with-sufficient-length"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
child.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
child.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

async function request(pathname, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const health = await request("/health");
      if (health.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`测试服务器未启动：${serverOutput}`);
}

async function login(account, password, ip = "10.0.0.10") {
  return request("/auth/login", { method: "POST", headers: { "X-Forwarded-For": ip }, body: { account, password } });
}

async function run() {
  await waitForServer();

  const adminLogin = await login("admin", "778899");
  assert.equal(adminLogin.status, 200);
  assert.equal(adminLogin.data.user.passwordChangeRecommended, true);
  assert.match(adminLogin.data.token, /^[^.]+\.[^.]+$/);

  const migratedText = fs.readFileSync(path.join(tempDir, "db.json"), "utf8");
  const migrated = JSON.parse(migratedText);
  assert.equal(migrated.version, "backend-v5");
  assert.ok(migrated.users.every((user) => user.passwordHash && user.passwordSalt));
  assert.ok(migrated.users.every((user) => !("password" in user) && !("initialPassword" in user)));
  assert.ok(fs.existsSync(path.join(tempDir, "db.backup.json")));
  const backup = JSON.parse(fs.readFileSync(path.join(tempDir, "db.backup.json"), "utf8"));
  assert.ok(backup.users.every((user) => !("password" in user) && !("initialPassword" in user)));

  const publicState = await request("/state", { token: adminLogin.data.token });
  assert.equal(publicState.status, 200);
  assert.ok(!JSON.stringify(publicState.data).includes("passwordHash"));
  assert.ok(!JSON.stringify(publicState.data).includes("passwordSalt"));
  assert.ok(!JSON.stringify(publicState.data).includes("securityLogs"));

  const tampered = `${adminLogin.data.token.slice(0, -1)}x`;
  assert.equal((await request("/state", { token: tampered })).status, 401);
  const legacyUnsignedToken = Buffer.from(`1:${Date.now()}:legacy`).toString("base64url");
  assert.equal((await request("/state", { token: legacyUnsignedToken })).status, 401);

  const salesLogin = await login("sales", "123456", "10.0.0.11");
  assert.equal(salesLogin.status, 200);
  const resetSelf = await request("/users/1/password", { method: "PUT", token: adminLogin.data.token, body: { newPassword: "abcdef" } });
  assert.equal(resetSelf.status, 400);

  const resetSales = await request("/users/2/password", { method: "PUT", token: adminLogin.data.token, body: { newPassword: "654321" } });
  assert.equal(resetSales.status, 200);
  assert.equal((await request("/state", { token: salesLogin.data.token })).status, 401);
  assert.equal((await login("sales", "123456", "10.0.0.11")).status, 401);
  const resetLogin = await login("sales", "654321", "10.0.0.11");
  assert.equal(resetLogin.status, 200);
  assert.equal(resetLogin.data.user.passwordChangeRecommended, true);

  assert.equal((await request("/auth/change-password", { method: "POST", token: resetLogin.data.token, body: { currentPassword: "bad-old", newPassword: "999999" } })).status, 400);
  assert.equal((await request("/auth/change-password", { method: "POST", token: resetLogin.data.token, body: { currentPassword: "654321", newPassword: "123" } })).status, 400);
  assert.equal((await request("/auth/change-password", { method: "POST", token: resetLogin.data.token, body: { currentPassword: "654321", newPassword: "654321" } })).status, 400);
  assert.equal((await request("/auth/change-password", { method: "POST", token: resetLogin.data.token, body: { currentPassword: "654321", newPassword: "999999" } })).status, 200);
  assert.equal((await request("/state", { token: resetLogin.data.token })).status, 401);
  const changedLogin = await login("sales", "999999", "10.0.0.11");
  assert.equal(changedLogin.status, 200);
  assert.equal(changedLogin.data.user.passwordChangeRecommended, false);
  assert.equal((await request("/users/1/password", { method: "PUT", token: changedLogin.data.token, body: { newPassword: "abcdef" } })).status, 403);

  const unitAdminLogin = await login("unitadmin", "123456", "10.0.0.12");
  assert.equal(unitAdminLogin.status, 200);
  assert.equal((await request("/users/5/password", { method: "PUT", token: unitAdminLogin.data.token, body: { newPassword: "abcdef" } })).status, 403);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    assert.equal((await login("locktest", "wrong-password", "10.0.0.20")).status, 401);
  }
  assert.equal((await login("locktest", "wrong-password", "10.0.0.20")).status, 429);
  assert.equal((await login("locktest", "123456", "10.0.0.20")).status, 429);
  assert.equal((await login("admin", "778899", "10.0.0.21")).status, 200);

  const finalState = JSON.parse(fs.readFileSync(path.join(tempDir, "db.json"), "utf8"));
  assert.equal(finalState.securityLogs.length, 2);
  assert.ok(finalState.securityLogs.every((item) => !("password" in item) && !("passwordHash" in item) && !("passwordSalt" in item)));
  assert.ok(finalState.securityLogs.every((item) => !JSON.stringify(item).includes("999999") && !JSON.stringify(item).includes("654321")));
  console.log("password security tests passed");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
