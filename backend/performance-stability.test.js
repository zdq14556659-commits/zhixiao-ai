const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-performance-test-"));
const port = 30000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const customerCount = 8000;
const T = {
  admin: "\u7ba1\u7406\u5458",
  sales: "\u9500\u552e",
  list: "\u540d\u5355",
  publicPool: "\u516c\u6d77",
  unit: "\u6027\u80fd\u6d4b\u8bd5\u5355\u4f4d",
  other: "\u5176\u4ed6"
};

const customers = [];
const opportunities = [];
for (let index = 1; index <= customerCount; index += 1) {
  const customerId = 100000 + index;
  const opportunityId = 200000 + index;
  const phone = `13${String(100000000 + index).slice(-9)}`;
  const createdAt = `2026-07-${String((index % 20) + 1).padStart(2, "0")}`;
  const isPublicPool = index % 2 === 0;
  customers.push({
    id: customerId,
    name: `Performance Factory ${index}`,
    phone,
    phoneNormalized: phone,
    channelSource: T.other,
    createdBy: "Admin",
    owner: isPublicPool ? T.publicPool : "Admin",
    ownerId: isPublicPool ? "" : 1,
    followPerson: isPublicPool ? T.publicPool : "Admin",
    unitId: "unit-a",
    unit: T.unit,
    city: `City ${index % 50}`,
    address: `Performance address ${index}`,
    createdAt,
    lifecycleStatus: "active",
    contacts: [{ name: "Primary", phone, isPrimary: true }],
    photos: Array.from({ length: 4 }, (_, photoIndex) => `/uploads/customer-${index}-${photoIndex}.jpg`)
  });
  const followUps = Array.from({ length: 8 }, (_, followIndex) => ({
    id: `${opportunityId}-${followIndex}`,
    customerId,
    opportunityId,
    date: `2026-07-${String(followIndex + 1).padStart(2, "0")}`,
    createdAt: `2026-07-${String(followIndex + 1).padStart(2, "0")}T08:00:00.000Z`,
    author: "Admin",
    note: `Historical follow ${followIndex} ${"x".repeat(120)}`,
    isSystem: false
  }));
  opportunities.push({
    id: opportunityId,
    customerId,
    productId: "product-v1",
    productName: "V1",
    stage: T.list,
    owner: isPublicPool ? T.publicPool : "Admin",
    ownerId: isPublicPool ? "" : 1,
    followPerson: isPublicPool ? T.publicPool : "Admin",
    unitId: "unit-a",
    unit: T.unit,
    createdBy: "Admin",
    createdAt,
    ownershipStatus: isPublicPool ? "public_pool" : "locked",
    publicPoolAt: isPublicPool ? `${createdAt}T09:00:00.000Z` : "",
    manualFollowCount: followUps.length,
    followCount: followUps.length,
    latestManualFollowAt: followUps.at(-1).createdAt,
    lastFollow: followUps.at(-1).date,
    lastNote: followUps.at(-1).note,
    followUps
  });
}

const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  stages: [T.list, "\u7ebf\u7d22", "\u5546\u673a", "\u6210\u4ea4"],
  roles: [
    { id: "role-admin", name: T.admin, customerScope: "all", permissions: ["dashboard", "customers", "admin"] },
    { id: "role-sales", name: T.sales, customerScope: "self", permissions: ["dashboard", "customers"] }
  ],
  units: [{ id: "unit-a", name: T.unit, parentId: "", type: "unit", active: true }],
  users: [
    { id: 1, name: "Admin", account: "admin", password: "778899", role: T.admin, roleId: "role-admin", unitId: "unit-a", unit: T.unit, status: "\u542f\u7528" },
    { id: 2, name: "Sales", account: "sales", password: "123456", role: T.sales, roleId: "role-sales", unitId: "unit-a", unit: T.unit, status: "\u542f\u7528" }
  ],
  products: [{ id: "product-v1", name: "V1", price: 0, active: true }],
  channelSources: [{ id: "channel-other", name: T.other, active: true }],
  customers,
  opportunities,
  activities: [],
  visits: [],
  routes: [],
  targets: [],
  knowledge: [],
  resources: [],
  securityLogs: []
};

fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify(seed));
fs.writeFileSync(path.join(tempDir, "seed.json"), JSON.stringify(seed));

let child = null;
let output = "";

function startServer() {
  child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: tempDir,
      UPLOAD_DIR: path.join(tempDir, "uploads"),
      AUTH_TOKEN_SECRET: "performance-stability-test-secret",
      STATE_WRITE_DELAY_MS: "60000"
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
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      if ((await request("/health")).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(output);
}

async function run() {
  startServer();
  await waitForServer();
  const login = await request("/auth/login", {
    method: "POST",
    body: { account: "admin", password: "778899", moneyUnit: "yuan" }
  });
  assert.equal(login.status, 200, JSON.stringify(login.data));

  const startedAt = Date.now();
  const board = await request(`/customer-board?paginated=1&page=1&pageSize=20&stage=${encodeURIComponent(T.list)}`, { token: login.data.token });
  const durationMs = Date.now() - startedAt;
  assert.equal(board.status, 200, JSON.stringify(board.data));
  assert.equal(board.data.total, customerCount / 2);
  assert.equal(board.data.items.length, 20);
  assert.equal(board.data.stageCounts[T.list], customerCount / 2);
  assert.ok(board.data.items.every((item) => !Object.prototype.hasOwnProperty.call(item, "followUps")), "list rows must not include full follow-up history");
  assert.ok(Buffer.byteLength(JSON.stringify(board.data)) < 300 * 1024, "first page response should stay lightweight");
  assert.ok(durationMs < 5000, `8000-row first page took ${durationMs}ms`);

  const salesLogin = await request("/auth/login", {
    method: "POST",
    body: { account: "sales", password: "123456", moneyUnit: "yuan" }
  });
  assert.equal(salesLogin.status, 200, JSON.stringify(salesLogin.data));
  const publicStartedAt = Date.now();
  const publicBoard = await request(`/customer-board?paginated=1&page=1&pageSize=20&stage=${encodeURIComponent(T.publicPool)}`, { token: salesLogin.data.token });
  const publicDurationMs = Date.now() - publicStartedAt;
  assert.equal(publicBoard.status, 200, JSON.stringify(publicBoard.data));
  assert.equal(publicBoard.data.total, customerCount / 2);
  assert.equal(publicBoard.data.items.length, 20);
  assert.ok(publicBoard.data.items.every((item) => item.phone !== undefined), "public pool list should return lightweight rows");
  assert.ok(publicDurationMs < 5000, `4000-row public pool first page took ${publicDurationMs}ms`);
  console.log(`performance stability tests passed (private ${durationMs}ms, public ${publicDurationMs}ms)`);
}

run()
  .then(() => {
    child?.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  })
  .catch((error) => {
    console.error(error);
    console.error(output);
    child?.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.exitCode = 1;
  });
