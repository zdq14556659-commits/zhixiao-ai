const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-public-pool-test-"));
const uploadDir = path.join(tempDir, "uploads");
const port = 20000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const now = Date.now();
const isoDaysAgo = (days, extraMinutes = 0) => new Date(now - days * 24 * 60 * 60 * 1000 - extraMinutes * 60 * 1000).toISOString();
const dateDaysAgo = (days, extraMinutes = 0) => isoDaysAgo(days, extraMinutes).slice(0, 10);

function customer(id, overrides = {}) {
  const manualAt = overrides.manualAt || isoDaysAgo(29);
  return {
    id,
    name: `测试客户${id}`,
    phone: `1380000${String(id).padStart(4, "0")}`,
    phoneNormalized: `1380000${String(id).padStart(4, "0")}`,
    stage: "线索",
    ownerId: 1,
    owner: "销售甲",
    followPerson: "销售甲",
    unitId: "unit-east",
    unit: "东部一部",
    zone: "东部战区",
    region: "东部战区",
    createdAt: dateDaysAgo(60),
    ownershipStatus: "locked",
    effectiveFollowUpAt: manualAt,
    claimUntil: "",
    photos: [`/uploads/customer-${id}.jpg`],
    followUps: [{ date: manualAt.slice(0, 10), createdAt: manualAt, author: "销售甲", note: "人工有效跟进", nextFollow: "", isSystem: false }],
    ...overrides
  };
}

const legacyState = {
  version: "backend-v4",
  currentUserId: 1,
  units: [
    { id: "unit-east", name: "东部一部", zone: "东部战区" },
    { id: "unit-south", name: "南部一部", zone: "南部战区" }
  ],
  users: [
    { id: 1, name: "销售甲", account: "sales-a", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-east", unit: "东部一部", zone: "东部战区" },
    { id: 2, name: "销售乙", account: "sales-b", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-south", unit: "南部一部", zone: "南部战区" },
    { id: 3, name: "东部主管", account: "supervisor", password: "123456", role: "主管", roleId: "role-supervisor", unitId: "unit-east", unit: "东部一部", zone: "东部战区" }
  ],
  customers: [
    customer(1, { manualAt: isoDaysAgo(29) }),
    customer(2, { manualAt: isoDaysAgo(30, 1) }),
    customer(3, { stage: "成交", manualAt: isoDaysAgo(60), contractAmount: 20, dealAt: dateDaysAgo(50) }),
    customer(4, {
      stage: "名单",
      ownershipStatus: "pending_followup",
      claimUntil: isoDaysAgo(1),
      effectiveFollowUpAt: "",
      followUps: [{ date: dateDaysAgo(4), createdAt: isoDaysAgo(4), author: "系统", note: "新增客户。", nextFollow: "", isSystem: true }]
    }),
    customer(5, {
      manualAt: isoDaysAgo(31),
      followUps: [
        { date: dateDaysAgo(31), createdAt: isoDaysAgo(31), author: "销售甲", note: "人工有效跟进", nextFollow: "", isSystem: false },
        { date: dateDaysAgo(1), createdAt: isoDaysAgo(1), author: "系统", note: "客户推进至线索阶段。", nextFollow: "", isSystem: true }
      ]
    }),
    customer(6, { manualAt: isoDaysAgo(31) })
  ],
  visits: [{
    id: 200,
    customerId: 2,
    factory: "测试客户2",
    phone: "13800000002",
    ownerId: 1,
    owner: "销售甲",
    unitId: "unit-east",
    unit: "东部一部",
    zone: "东部战区",
    status: "线索",
    photos: ["/uploads/customer-2.jpg"],
    date: dateDaysAgo(40)
  }],
  activities: [],
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
    AUTH_TOKEN_SECRET: "public-pool-test-secret-with-sufficient-length"
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
      if ((await request("/health")).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`测试服务器未启动：${serverOutput}`);
}

async function login(account) {
  const response = await request("/auth/login", { method: "POST", body: { account, password: "123456" } });
  assert.equal(response.status, 200);
  return response.data.token;
}

async function run() {
  await waitForServer();
  const tokenA = await login("sales-a");
  const tokenB = await login("sales-b");

  const stateA = await request("/state?client=mini", { token: tokenA });
  const stateB = await request("/state?client=mini", { token: tokenB });
  assert.equal(stateA.status, 200);
  assert.equal(stateB.status, 200);
  assert.equal(stateA.data.customers.find((item) => item.id === 1).ownershipStatus, "locked");
  assert.equal(stateA.data.customers.find((item) => item.id === 3).ownershipStatus, "locked");
  assert.ok(!stateA.data.customers.some((item) => [2, 4, 5].includes(item.id)));
  const publicPoolA = await request("/public-pool", { token: tokenA });
  assert.ok([2, 4, 5].every((id) => publicPoolA.data.items.some((item) => item.customerId === id)));
  assert.ok(publicPoolA.data.items.every((item) => item.phone === "认领后可见"));
  assert.ok(!stateB.data.customers.some((item) => item.id === 2));
  const publicPoolB = await request("/public-pool", { token: tokenB });
  assert.equal(publicPoolB.status, 200);
  assert.ok(publicPoolB.data.items.some((item) => item.customerId === 2));
  assert.equal(publicPoolB.data.items.find((item) => item.customerId === 2).phone, "认领后可见");
  assert.ok(!stateB.data.customers.some((item) => item.id === 1));
  assert.ok(!stateB.data.customers.some((item) => item.id === 3));

  const blockedUpdate = await request("/customers/2", { method: "PUT", token: tokenA, body: { address: "新地址" } });
  assert.equal(blockedUpdate.status, 409);
  assert.equal(blockedUpdate.data.code, "CUSTOMER_CLAIM_REQUIRED");
  const blockedFollow = await request("/customers/2/follow", { method: "POST", token: tokenA, body: { note: "尝试跟进" } });
  assert.equal(blockedFollow.status, 409);
  assert.equal(blockedFollow.data.code, "CUSTOMER_CLAIM_REQUIRED");

  const claimed = await request("/customers/2/claim", { method: "POST", token: tokenB });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.data.ownerId, 2);
  assert.equal(claimed.data.ownershipStatus, "pending_followup");
  assert.deepEqual(claimed.data.photos, ["/uploads/customer-2.jpg"]);
  assert.ok(claimed.data.followUps.some((item) => item.note === "人工有效跟进"));
  const secondClaim = await request("/customers/2/claim", { method: "POST", token: tokenA });
  assert.equal(secondClaim.status, 409);

  const simultaneousClaims = await Promise.all([
    request("/customers/6/claim", { method: "POST", token: tokenA }),
    request("/customers/6/claim", { method: "POST", token: tokenB })
  ]);
  assert.deepEqual(simultaneousClaims.map((item) => item.status).sort(), [200, 409]);

  const afterClaimA = await request("/state?client=mini", { token: tokenA });
  assert.ok(!afterClaimA.data.customers.some((item) => item.id === 2));
  const afterClaimB = await request("/state?client=mini", { token: tokenB });
  assert.ok(afterClaimB.data.visits.some((item) => item.id === 200 && item.ownerId === 2));
  const follow = await request("/customers/2/follow", { method: "POST", token: tokenB, body: { note: "认领后的首次有效跟进", nextFollow: dateDaysAgo(-2) } });
  assert.equal(follow.status, 200);
  assert.equal(follow.data.ownershipStatus, "locked");

  const dashboardA = await request("/dashboard", { token: tokenA });
  assert.equal(dashboardA.status, 200);
  assert.ok(dashboardA.data.summary.publicPool >= 2);
  const dashboardIds = Object.values(dashboardA.data.drilldowns).flat().map((item) => item.id);
  assert.ok(!dashboardIds.includes(4));
  assert.ok(!dashboardIds.includes(5));

  const importResult = await request("/import/customers", {
    method: "POST",
    token: tokenB,
    body: {
      stage: "名单",
      rows: [
        "系统重复客户,13800000001,地推,杭州市",
        "新客户,13912345678,地推,杭州市",
        "文件重复客户,+86 139-1234-5678,地推,杭州市",
        "无效手机号客户,123,地推,杭州市"
      ].join("\n")
    }
  });
  assert.equal(importResult.status, 201);
  assert.equal(importResult.data.total, 4);
  assert.equal(importResult.data.imported, 1);
  assert.equal(importResult.data.duplicates, 2);
  assert.equal(importResult.data.failed, 1);
  assert.ok(importResult.data.skipped.some((item) => item.reason.includes("系统已有该客户")));
  assert.ok(importResult.data.skipped.some((item) => item.reason.includes("文件内手机号")));
  assert.ok(importResult.data.failures.some((item) => item.reason === "手机号无效"));
  assert.ok(importResult.data.reportUrl);
}

run()
  .then(() => {
    child.kill();
    console.log("customer public pool tests passed");
  })
  .catch((error) => {
    child.kill();
    console.error(error);
    console.error(serverOutput);
    process.exitCode = 1;
  });
