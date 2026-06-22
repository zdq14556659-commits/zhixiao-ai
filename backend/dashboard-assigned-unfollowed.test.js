const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-dashboard-action-test-"));
const uploadDir = path.join(tempDir, "uploads");
const port = 27000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() + 7 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const TEXT = {
  admin: "\u7ba1\u7406\u5458",
  sales: "\u9500\u552e",
  supervisor: "\u4e3b\u7ba1",
  list: "\u540d\u5355",
  deal: "\u6210\u4ea4",
  unknown: "\u672a\u77e5",
  sanweijia: "\u4e09\u7ef4\u5bb6",
  eastZone: "\u4e1c\u90e8\u6218\u533a",
  unit: "\u6d4b\u8bd5\u5355\u4f4d",
  other: "\u5176\u4ed6"
};

function at(date, time) {
  return `${date}T${time}.000Z`;
}

function customer(id, overrides = {}) {
  return {
    id,
    name: `Factory ${id}`,
    phone: `1380000${String(id).padStart(4, "0")}`,
    phoneNormalized: `1380000${String(id).padStart(4, "0")}`,
    channelSource: TEXT.other,
    createdBy: "Admin",
    followPerson: "Sales A",
    owner: "Sales A",
    ownerId: 2,
    unitId: "unit-a",
    unit: TEXT.unit,
    zone: TEXT.eastZone,
    region: TEXT.eastZone,
    city: "Hangzhou",
    address: "",
    software: "",
    competitorProfiles: [],
    createdAt: at(today, "08:00:00"),
    ...overrides
  };
}

function opportunity(id, customerId, overrides = {}) {
  return {
    id,
    customerId,
    productId: "product-v1",
    productName: "V1",
    stage: TEXT.list,
    owner: "Sales A",
    ownerId: 2,
    followPerson: "Sales A",
    unitId: "unit-a",
    unit: TEXT.unit,
    zone: TEXT.eastZone,
    createdAt: at(today, "08:10:00"),
    ownershipStatus: "locked",
    ownershipHistory: [
      { type: "assigned", fromOwner: "Supervisor", toOwner: "Sales A", operator: "Supervisor", createdAt: at(today, "09:00:00") }
    ],
    followUps: [
      { date: today, createdAt: at(today, "09:02:00"), author: "System", note: "Created by system", isSystem: true, nextFollow: "" }
    ],
    ...overrides
  };
}

const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  units: [{ id: "unit-a", name: TEXT.unit, parentId: "org-zone-east", type: "unit", zone: TEXT.eastZone }],
  users: [
    { id: 1, name: "Admin", account: "admin", password: "778899", role: TEXT.admin, roleId: "role-admin", unitId: "unit-a", unit: TEXT.unit, zone: TEXT.eastZone },
    { id: 2, name: "Sales A", account: "sales-a", password: "123456", role: TEXT.sales, roleId: "role-sales", unitId: "unit-a", unit: TEXT.unit, zone: TEXT.eastZone },
    { id: 3, name: "Supervisor", account: "supervisor", password: "123456", role: TEXT.supervisor, roleId: "role-supervisor", unitId: "unit-a", unit: TEXT.unit, zone: TEXT.eastZone }
  ],
  customers: [
    customer(1),
    customer(2, { competitorProfiles: [{ id: "cp-2", competitorId: "competitor-3vjia", brand: TEXT.sanweijia, isPrimary: true }] }),
    customer(3),
    customer(4),
    customer(5)
  ],
  opportunities: [
    opportunity(101, 1),
    opportunity(102, 2, {
      followUps: [
        { date: today, createdAt: at(today, "09:30:00"), author: "Sales A", note: "Manual follow after assignment", isSystem: false, nextFollow: "" }
      ]
    }),
    opportunity(103, 3, {
      createdAt: at(yesterday, "08:10:00"),
      ownershipHistory: [{ type: "assigned", operator: "Supervisor", createdAt: at(yesterday, "09:00:00") }]
    }),
    opportunity(104, 4, { stage: TEXT.deal }),
    opportunity(105, 5, {
      owner: "Supervisor",
      ownerId: 3,
      followPerson: "Supervisor",
      ownershipStatus: "pending_followup",
      ownershipHistory: [{ type: "claimed_public_pool", operator: "Supervisor", createdAt: at(today, "10:00:00") }]
    })
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
    AUTH_TOKEN_SECRET: "dashboard-action-test-secret-with-sufficient-length"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

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
  const adminToken = await login("admin", "778899");
  const salesToken = await login("sales-a", "123456");

  const adminDashboard = await request("/dashboard", { token: adminToken });
  assert.equal(adminDashboard.status, 200, JSON.stringify(adminDashboard.data));
  const action = adminDashboard.data.actions.find((item) => item.key === "assignedTodayUnfollowed");
  assert.ok(action, "dashboard should include assignedTodayUnfollowed action");
  assert.equal(action.label, "\u4eca\u65e5\u5206\u914d\u672a\u8ddf\u8fdb");
  assert.equal(action.count, 2, JSON.stringify(action));
  assert.deepEqual(action.opportunityIds.sort((a, b) => a - b), [101, 105]);
  assert.ok(action.customers.every((item) => item.assignedAt && item.followPerson));
  assert.deepEqual(action.ownerSummary.map((item) => `${item.name}:${item.count}`).sort(), ["Sales A:1", "Supervisor:1"]);

  const salesDashboard = await request("/dashboard", { token: salesToken });
  assert.equal(salesDashboard.status, 200, JSON.stringify(salesDashboard.data));
  const salesAction = salesDashboard.data.actions.find((item) => item.key === "assignedTodayUnfollowed");
  assert.equal(salesAction.count, 1);
  assert.deepEqual(salesAction.opportunityIds, [101]);

  const software = adminDashboard.data.industry.software || [];
  assert.ok(!software.some((item) => item.name === TEXT.unknown), "unknown software must not affect competitor stats");
  assert.equal((software.find((item) => item.name === TEXT.sanweijia) || {}).count, 1);
}

run()
  .then(() => {
    child.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log("dashboard assigned-unfollowed tests passed");
  })
  .catch((error) => {
    child.kill();
    console.error(error);
    console.error(output);
    process.exitCode = 1;
  });
