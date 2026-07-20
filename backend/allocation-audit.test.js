const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const JSZip = require(require.resolve("jszip", {
  paths: [path.resolve("node_modules/.pnpm/jszip@3.10.1/node_modules")]
}));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-allocation-audit-test-"));
const port = 30000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const now = new Date().toISOString();
const today = now.slice(0, 10);
const outsideAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();

function ownership(type, toOwnerId, toOwner, operatorId, operator, reason, createdAt = now) {
  return { type, fromOwnerId: "", fromOwner: "", toOwnerId, toOwner, operatorId, operator, reason, createdAt };
}

const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  units: [
    { id: "org-root", name: "智销AI", parentId: "", type: "root", active: true },
    { id: "org-staff", name: "参谋部", parentId: "org-root", type: "department", active: true },
    { id: "org-war", name: "战区部", parentId: "org-root", type: "department", active: true },
    { id: "org-zone-east", name: "东部战区", parentId: "org-war", type: "battle_zone", zone: "东部战区", active: true },
    { id: "unit-east", name: "测试单位", parentId: "org-zone-east", type: "unit", zone: "东部战区", active: true }
  ],
  users: [
    { id: 1, name: "管理员", account: "admin", password: "778899", role: "管理员", roleId: "role-admin", unitId: "org-staff", unit: "参谋部" },
    { id: 2, name: "销售甲", account: "sales-a", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-east", unit: "测试单位", zone: "东部战区" },
    { id: 3, name: "销售乙", account: "sales-b", password: "123456", role: "销售", roleId: "role-sales", unitId: "unit-east", unit: "测试单位", zone: "东部战区" },
    { id: 4, name: "运营甲", account: "ops", password: "123456", role: "运营", roleId: "role-ops", unitId: "org-staff", unit: "参谋部" },
    { id: 5, name: "负责人", account: "owner", password: "123456", role: "总负责人", roleId: "role-owner", unitId: "org-staff", unit: "参谋部" },
    { id: 6, name: "主管甲", account: "supervisor", password: "123456", role: "主管", roleId: "role-supervisor", unitId: "unit-east", unit: "测试单位", zone: "东部战区" }
  ],
  customers: [
    { id: 100, name: "地推运营资源", phone: "13800009001", channelSource: "地推", lifecycleStatus: "active", createdAt: today },
    { id: 200, name: "公众号运营资源", phone: "13800009002", channelSource: "公众号", ownerId: 2, owner: "销售甲", unitId: "unit-east", unit: "测试单位", lifecycleStatus: "active", createdAt: today },
    { id: 300, name: "自主认领资源", phone: "13800009003", channelSource: "其他", ownerId: 3, owner: "销售乙", unitId: "unit-east", unit: "测试单位", lifecycleStatus: "active", createdAt: today },
    { id: 400, name: "官网手工录入", phone: "13800009004", channelSource: "官网留言", ownerId: 2, owner: "销售甲", unitId: "unit-east", unit: "测试单位", lifecycleStatus: "active", createdAt: today },
    { id: 500, name: "范围外运营资源", phone: "13800009005", channelSource: "自媒体", lifecycleStatus: "active", createdAt: outsideAt.slice(0, 10) },
    { id: 600, name: "旧数据运营资源", phone: "13800009006", channelSource: "渠道介绍", lifecycleStatus: "active", createdAt: today }
  ],
  opportunities: [
    {
      id: 101, customerId: 100, productId: "product-v1", productName: "V1", stage: "名单",
      ownerId: "", owner: "公海", unitId: "", unit: "", ownershipStatus: "public_pool",
      publicPoolAt: now, publicPoolReason: "operations_import", createdBy: "运营甲", createdAt: today,
      ownershipHistory: [ownership("created", "", "公海", 4, "运营甲", "运营导入公海机会")], followUps: []
    },
    {
      id: 201, customerId: 200, productId: "product-v1", productName: "V1", stage: "线索",
      ownerId: 2, owner: "销售甲", unitId: "unit-east", unit: "测试单位", ownershipStatus: "locked",
      createdBy: "运营甲", createdAt: today,
      ownershipHistory: [
        ownership("created", "", "公海", 4, "运营甲", "运营导入公海机会"),
        ownership("assigned", 2, "销售甲", 5, "负责人", "主管分配")
      ],
      followUps: [{ id: "follow-201", date: today, createdAt: now, author: "销售甲", note: "已电话联系客户并确认需求。", nextFollow: today, isSystem: false }]
    },
    {
      id: 301, customerId: 300, productId: "product-v1", productName: "V1", stage: "商机",
      ownerId: 3, owner: "销售乙", unitId: "unit-east", unit: "测试单位", ownershipStatus: "locked",
      createdBy: "运营甲", createdAt: today,
      ownershipHistory: [
        ownership("created", "", "公海", 4, "运营甲", "运营导入公海机会"),
        ownership("claimed_public_pool", 3, "销售乙", 3, "销售乙", "公海销售机会认领")
      ], followUps: []
    },
    {
      id: 401, customerId: 400, productId: "product-v1", productName: "V1", stage: "线索",
      ownerId: 2, owner: "销售甲", unitId: "unit-east", unit: "测试单位", ownershipStatus: "locked",
      createdBy: "管理员", createdAt: today,
      ownershipHistory: [ownership("created", 2, "销售甲", 1, "管理员", "首次录入")], followUps: []
    },
    {
      id: 501, customerId: 500, productId: "product-v1", productName: "V1", stage: "成交",
      ownerId: "", owner: "公海", unitId: "", unit: "", ownershipStatus: "public_pool",
      publicPoolAt: outsideAt, publicPoolReason: "operations_import", createdBy: "运营甲", createdAt: outsideAt.slice(0, 10),
      ownershipHistory: [ownership("created", "", "公海", 4, "运营甲", "运营导入公海机会", outsideAt)], followUps: []
    },
    {
      id: 601, customerId: 600, productId: "product-v1", productName: "V1", stage: "名单",
      ownerId: "", owner: "公海", unitId: "", unit: "", ownershipStatus: "public_pool",
      publicPoolAt: now, publicPoolReason: "operations_import", createdBy: "运营甲", createdAt: today,
      ownershipHistory: [], followUps: []
    }
  ],
  visits: [], activities: [], knowledge: [], resources: [], routes: [], targets: []
};

fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify(seed, null, 2));

let child;
let output = "";

function startServer() {
  child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: tempDir,
      UPLOAD_DIR: path.join(tempDir, "uploads"),
      AUTH_TOKEN_SECRET: "allocation-audit-test-secret"
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
  if (options.raw) {
    return { status: response.status, headers: response.headers, data: Buffer.from(await response.arrayBuffer()) };
  }
  return { status: response.status, data: await response.json() };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await request("/health")).status === 200) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(output);
}

async function login(account, password) {
  const result = await request("/auth/login", { method: "POST", body: { account, password } });
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
  const sales = await login("sales-a", "123456");
  const ops = await login("ops", "123456");
  const owner = await login("owner", "123456");
  const supervisor = await login("supervisor", "123456");

  const initial = await request(`/reports/allocation-audit?start=${today}&end=${today}`, { token: ops });
  assert.equal(initial.status, 200, JSON.stringify(initial.data));
  assert.equal(initial.data.total, 4, "all operations public-pool imports in range should be included regardless of channel");
  assert.equal(initial.data.totals.followed, 1);
  assert.equal(initial.data.totals.lead, 1);
  assert.equal(initial.data.totals.opportunity, 1);
  assert.ok(initial.data.items.some((item) => item.customerName === "地推运营资源"));
  assert.ok(initial.data.items.some((item) => item.customerName === "公众号运营资源"));
  assert.ok(initial.data.items.some((item) => item.customerName === "旧数据运营资源"));
  assert.ok(!initial.data.items.some((item) => item.customerName === "官网手工录入"));
  assert.ok(!initial.data.items.some((item) => item.customerName === "范围外运营资源"));
  const claimed = initial.data.items.find((item) => Number(item.opportunityId) === 301);
  assert.equal(claimed.allocatorDisplay, "销售乙（自主认领）");
  const followed = initial.data.items.find((item) => Number(item.opportunityId) === 201);
  assert.equal(followed.followCount, 1);
  assert.equal(followed.followHistory[0].note, "已电话联系客户并确认需求。");

  const atomicFailure = await request("/opportunities/assign", {
    method: "POST", token: admin,
    body: { ids: [101, 999999], assignments: [{ ownerId: 3, count: 2 }] }
  });
  assert.equal(atomicFailure.status, 409, JSON.stringify(atomicFailure.data));
  assert.equal(atomicFailure.data.code, "ASSIGNMENT_PREFLIGHT_FAILED");
  assert.equal(atomicFailure.data.assigned, 0);

  const firstAssignment = await request("/opportunities/assign", {
    method: "POST", token: admin,
    body: { ids: [101], assignments: [{ ownerId: 3, count: 1 }] }
  });
  assert.equal(firstAssignment.status, 200, JSON.stringify(firstAssignment.data));
  const secondAssignment = await request("/opportunities/assign", {
    method: "POST", token: admin,
    body: { ids: [101], assignments: [{ ownerId: 2, count: 1 }] }
  });
  assert.equal(secondAssignment.status, 200, JSON.stringify(secondAssignment.data));

  const afterReassignment = await request(`/reports/allocation-audit?start=${today}&end=${today}`, { token: owner });
  assert.equal(afterReassignment.status, 200, JSON.stringify(afterReassignment.data));
  assert.equal(afterReassignment.data.total, 4, "reassignment must not duplicate imported resources");
  const reassigned = afterReassignment.data.items.find((item) => Number(item.opportunityId) === 101);
  assert.equal(reassigned.owner, "销售甲");
  assert.equal(reassigned.allocator, "管理员");

  const allocatorFiltered = await request(`/reports/allocation-audit?start=${today}&end=${today}&allocatorId=1`, { token: owner });
  assert.equal(allocatorFiltered.status, 200);
  assert.equal(allocatorFiltered.data.total, 1);
  assert.equal(Number(allocatorFiltered.data.items[0].opportunityId), 101);

  const legacyOperatorFilter = await request(`/reports/allocation-audit?start=${today}&end=${today}&operatorId=1`, { token: owner });
  assert.equal(legacyOperatorFilter.status, 200);
  assert.equal(legacyOperatorFilter.data.total, 1, "operatorId must remain a compatible alias");

  const exportResult = await request(`/reports/allocation-audit/export?start=${today}&end=${today}`, { token: ops, raw: true });
  assert.equal(exportResult.status, 200);
  assert.match(exportResult.headers.get("content-type") || "", /spreadsheetml/);
  assert.equal(exportResult.data.slice(0, 2).toString("utf8"), "PK");
  const workbook = await JSZip.loadAsync(exportResult.data);
  const sheetXml = await workbook.file("xl/worksheets/sheet1.xml").async("string");
  assert.ok(sheetXml.includes("地推运营资源"));
  assert.ok(sheetXml.includes("公众号运营资源"));
  assert.ok(sheetXml.includes("已电话联系客户并确认需求。"));
  assert.ok(!sheetXml.includes("官网手工录入"));

  const salesAudit = await request(`/reports/allocation-audit?start=${today}&end=${today}`, { token: sales });
  assert.equal(salesAudit.status, 403);
  const supervisorAudit = await request(`/reports/allocation-audit?start=${today}&end=${today}`, { token: supervisor });
  assert.equal(supervisorAudit.status, 403);
  const adminAudit = await request(`/reports/allocation-audit?start=${today}&end=${today}`, { token: admin });
  assert.equal(adminAudit.status, 403);

  await stopServer();
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("allocation audit tests passed");
}

run().catch(async (error) => {
  await stopServer();
  console.error(error);
  console.error(output);
  fs.rmSync(tempDir, { recursive: true, force: true });
  process.exit(1);
});
