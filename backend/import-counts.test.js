const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-import-counts-test-"));
const uploadDir = path.join(tempDir, "uploads");
const port = 28000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;

const T = {
  admin: "\u7ba1\u7406\u5458",
  ops: "\u8fd0\u8425",
  sales: "\u9500\u552e",
  list: "\u540d\u5355",
  publicPool: "\u516c\u6d77",
  official: "\u5b98\u7f51\u7559\u8a00",
  register: "\u81ea\u4e3b\u6ce8\u518c",
  other: "\u5176\u4ed6",
  unit: "\u6d4b\u8bd5\u5355\u4f4d",
  eastZone: "\u4e1c\u90e8\u6218\u533a",
  pendingProduct: "\u5f85\u786e\u8ba4\u4ea7\u54c1",
  v1: "V1"
};

const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  units: [{ id: "unit-a", name: T.unit, parentId: "org-zone-east", type: "unit", zone: T.eastZone }],
  users: [
    { id: 1, name: "Admin", account: "admin", password: "778899", role: T.admin, roleId: "role-admin", unitId: "unit-a", unit: T.unit, zone: T.eastZone },
    { id: 2, name: "Ops", account: "ops", password: "123456", role: T.ops, roleId: "role-ops", unitId: "unit-a", unit: T.unit, zone: "" },
    { id: 3, name: "Sales", account: "sales", password: "123456", role: T.sales, roleId: "role-sales", unitId: "unit-a", unit: T.unit, zone: T.eastZone }
  ],
  customers: [{
    id: 100,
    name: "Existing Factory",
    phone: "13900000000",
    phoneNormalized: "13900000000",
    channelSource: T.official,
    createdBy: "Admin",
    owner: "Sales",
    ownerId: 3,
    followPerson: "Sales",
    unitId: "unit-a",
    unit: T.unit,
    zone: T.eastZone,
    createdAt: "2026-06-01",
    contacts: [{ name: "\u4e3b\u8054\u7cfb\u4eba", phone: "13900000000", isPrimary: true }]
  }],
  opportunities: [{
    id: 101,
    customerId: 100,
    productId: "product-v1",
    productName: T.v1,
    stage: T.list,
    owner: "Sales",
    ownerId: 3,
    followPerson: "Sales",
    unitId: "unit-a",
    unit: T.unit,
    zone: T.eastZone,
    createdBy: "Admin",
    createdAt: "2026-06-01",
    ownershipStatus: "locked",
    followUps: []
  }],
  channelSources: [
    { id: "channel-official", name: T.official, active: true },
    { id: "channel-register", name: T.register, active: true },
    { id: "channel-other", name: T.other, active: true }
  ],
  products: [
    { id: "product-v1", name: T.v1, price: 150000, sort: 1, active: true }
  ],
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
    AUTH_TOKEN_SECRET: "import-counts-test-secret"
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

async function login(account, password = "123456") {
  const response = await request("/auth/login", { method: "POST", body: { account, password } });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data.token;
}

async function run() {
  await waitForServer();
  const ops = await login("ops");
  const sales = await login("sales");

  const rows = [
    ["\u5ba2\u6237", "\u5ba2\u6237\u7535\u8bdd", "\u72b6\u6001", "\u57ce\u5e02", "\u5ba2\u6237\u5730\u5740", "\u6e20\u9053\u6765\u6e90", "\u610f\u5411\u4ea7\u54c1"],
    ["Public A", "13900000001", T.publicPool, "", "", T.register, T.v1],
    ["Public B", "13900000002", T.publicPool, "", "", "\u5b98 \u7f51\u7559\u8a00", T.v1],
    ["Public A duplicated in file", "+86 139-0000-0001", T.publicPool, "", "", T.register, T.v1],
    ["Existing same product", "13900000000", T.publicPool, "", "", T.official, T.v1],
    ["Invalid phone", "123", T.publicPool, "", "", T.register, T.v1],
    ["Unknown channel", "13900000003", T.publicPool, "", "", "\u6296\u97f3\u79c1\u4fe1", T.v1],
    ["No Product", "13900000004", T.publicPool, "", "", T.register, ""]
  ].map((row) => row.join(",")).join("\n");

  const imported = await request("/import/customers?target=public_pool", {
    method: "POST",
    token: ops,
    body: { moneyUnit: "yuan", rows }
  });
  assert.equal(imported.status, 201, JSON.stringify(imported.data));
  assert.equal(imported.data.total, 7);
  assert.equal(imported.data.imported, 4);
  assert.equal(imported.data.duplicates, 2);
  assert.equal(imported.data.failed, 1);
  assert.equal(imported.data.channelUnrecognized, 1);
  assert.equal(imported.data.pendingLocation, 4);
  assert.equal(
    imported.data.imported + imported.data.duplicates + imported.data.failed,
    imported.data.total,
    JSON.stringify(imported.data)
  );
  assert.ok(imported.data.skipped.some((item) => String(item.reason || "").includes("\u6587\u4ef6\u5185\u624b\u673a\u53f7")));
  assert.ok(imported.data.skipped.some((item) => item.code === "DUPLICATE_ACTIVE_OPPORTUNITY" || String(item.reason || "").includes("\u8be5\u9500\u552e\u673a\u4f1a\u5df2\u5b58\u5728")));
  assert.ok(imported.data.failures.some((item) => String(item.reason || "").includes("\u624b\u673a\u53f7")));
  assert.ok(imported.data.warnings.some((item) => String(item.reason || "").includes("\u6e20\u9053\u6765\u6e90")));

  const pool = await request("/public-pool", { token: sales });
  assert.equal(pool.status, 200, JSON.stringify(pool.data));
  assert.equal(pool.data.count, 4);
  assert.equal(pool.data.items.find((item) => item.name === "Public A").channelSource, T.register);
  assert.equal(pool.data.items.find((item) => item.name === "Public B").channelSource, T.official);
  assert.equal(pool.data.items.find((item) => item.name === "Unknown channel").channelSource, T.other);
  const noProduct = pool.data.items.find((item) => item.name === "No Product");
  assert.ok(noProduct);
  const claimed = await request(`/opportunities/${noProduct.opportunityId}/claim`, { method: "POST", token: sales, body: {} });
  assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
  assert.equal(claimed.data.ownerId, 3);
  assert.equal(claimed.data.ownershipStatus, "pending_followup");
}

run()
  .then(() => {
    child.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log("import counts tests passed");
  })
  .catch((error) => {
    child.kill();
    console.error(error);
    console.error(output);
    process.exitCode = 1;
  });
