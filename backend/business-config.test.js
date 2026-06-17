const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const STAGE_LIST = "\u540d\u5355";
const STAGE_LEAD = "\u7ebf\u7d22";
const STAGE_OPPORTUNITY = "\u5546\u673a";
const STAGE_DEAL = "\u6210\u4ea4";
const STAGE_TRIAL = "\u8bd5\u7528\u4e2d";
const STAGE_INTENT = "\u610f\u5411\u5ba2\u6237";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-business-config-test-"));
const uploadDir = path.join(tempDir, "uploads");
const port = 25000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const basePermissions = ["dashboard", "customers", "field", "assistant"];

const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  roles: [
    { id: "role-admin", name: "Admin", customerScope: "all", permissions: [...basePermissions, "publicPoolImport", "admin"] },
    { id: "role-sales", name: "Sales", customerScope: "self", permissions: basePermissions },
    { id: "role-ops", name: "Ops", customerScope: "all", permissions: [...basePermissions, "publicPoolImport"] }
  ],
  units: [{ id: "unit-a", name: "Unit A", zone: "Zone A", active: true }],
  users: [
    { id: 1, name: "Admin User", account: "admin", password: "778899", roleId: "role-admin", unitId: "unit-a", unit: "Unit A", zone: "Zone A" },
    { id: 2, name: "Sales A", account: "sales-a", password: "123456", roleId: "role-sales", unitId: "unit-a", unit: "Unit A", zone: "Zone A" },
    { id: 3, name: "Ops User", account: "ops", password: "123456", roleId: "role-ops", unitId: "unit-a", unit: "Unit A", zone: "Zone A" }
  ],
  products: [{ id: "product-base", name: "Base CRM", price: 5000, active: true, category: "Software", note: "Seed product", sort: 1 }],
  customers: [{
    id: 100,
    name: "Legacy Trial Factory",
    phone: "13900000000",
    phoneNormalized: "13900000000",
    stage: STAGE_TRIAL,
    ownerId: 2,
    owner: "Sales A",
    followPerson: "Sales A",
    unitId: "unit-a",
    unit: "Unit A",
    zone: "Zone A",
    address: "No. 1 Test Road",
    createdAt: "2026-06-01",
    ownershipStatus: "locked",
    followUps: [{ date: "2026-06-01", createdAt: "2026-06-01T00:00:00.000Z", author: "Sales A", note: "Legacy note", isSystem: false }]
  }],
  opportunities: [{
    id: 1100,
    customerId: 100,
    productId: "product-base",
    productName: "Base CRM",
    stage: STAGE_TRIAL,
    ownerId: 2,
    owner: "Sales A",
    followPerson: "Sales A",
    unitId: "unit-a",
    unit: "Unit A",
    zone: "Zone A",
    createdAt: "2026-06-01",
    ownershipStatus: "locked",
    followUps: [{ date: "2026-06-01", createdAt: "2026-06-01T00:00:00.000Z", author: "Sales A", note: "Legacy opportunity", isSystem: false }]
  }],
  visits: [],
  activities: [],
  targets: [],
  knowledge: [],
  resources: []
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
    AUTH_TOKEN_SECRET: "business-config-test-secret-with-sufficient-length"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
child.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
child.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

async function request(pathname, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { status: response.status, data };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await request("/health")).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(serverOutput);
}

async function login(account, password = "123456") {
  const result = await request("/auth/login", { method: "POST", body: { account, password } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.token;
}

function stageById(config, id) {
  return config.salesStages.find((stage) => stage.id === id);
}

async function run() {
  await waitForServer();
  const admin = await login("admin", "778899");
  const sales = await login("sales-a");
  const ops = await login("ops");

  const initialState = await request("/state", { token: admin });
  assert.equal(initialState.status, 200);
  assert.ok(initialState.data.businessConfig);
  assert.ok(initialState.data.opportunities.some((item) => item.stage === STAGE_TRIAL && item.stageId));
  assert.ok(initialState.data.businessConfig.salesStages.some((stage) => stage.name === STAGE_TRIAL && stage.active === false));

  const configResult = await request("/business-config", { token: admin });
  assert.equal(configResult.status, 200);
  const config = configResult.data;

  const deniedSales = await request("/business-config", { method: "PUT", token: sales, body: config });
  assert.equal(deniedSales.status, 403);
  const deniedOps = await request("/business-config", { method: "PUT", token: ops, body: config });
  assert.equal(deniedOps.status, 403);

  const nextConfig = {
    ...config,
    customFields: [
      { key: "industry", label: "Industry", module: "customer", type: "select", options: ["Education", "Manufacturing"], required: true, active: true, showInList: true, sort: 10 },
      { key: "budgetLevel", label: "Budget Level", module: "opportunity", type: "select", options: ["High", "Low"], required: true, active: true, sort: 20 },
      { key: "visitMood", label: "Visit Mood", module: "visit", type: "text", required: false, active: true, sort: 30 }
    ],
    salesStages: [
      { id: "stage-list", name: STAGE_LIST, legacyName: STAGE_LIST, sort: 10, active: true, color: "#64748b", type: "start", requiredFields: [], overdueDays: 3 },
      { id: "stage-lead", name: STAGE_INTENT, legacyName: STAGE_LEAD, sort: 20, active: true, color: "#409eff", type: "normal", requiredFields: ["industry"], overdueDays: 9 },
      { id: "stage-opportunity", name: STAGE_OPPORTUNITY, legacyName: STAGE_OPPORTUNITY, sort: 30, active: true, color: "#8b5cf6", type: "normal", requiredFields: ["demoAt"], overdueDays: 12 },
      { id: "stage-deal", name: STAGE_DEAL, legacyName: STAGE_DEAL, sort: 40, active: true, color: "#67c23a", type: "won", requiredFields: ["contractAmount", "paymentOwnerId"], overdueDays: 0 }
    ],
    followTemplates: [
      { id: "follow-intent", name: "Intent follow", stageId: "stage-lead", scene: "Demo", content: "Confirm budget and timeline", nextFollowDays: 2, active: true, sort: 1 }
    ],
    map: {
      pointPopupFields: ["name", "stage", "industry", "productName"],
      filters: ["stage", "ownerId", "industry"],
      visitFields: ["factory", "status", "visitMood"],
      immutableFields: []
    },
    performance: {
      enabledTargetFields: ["leadTarget", "dealTarget", "contractTarget"],
      stageOverdueDays: { [STAGE_LIST]: 3, [STAGE_INTENT]: 9, [STAGE_OPPORTUNITY]: 12, [STAGE_DEAL]: 0 },
      claimProtectionDays: 5,
      publicPoolDays: 45,
      revenueAttribution: "paymentOwner"
    }
  };

  const savedConfig = await request("/business-config", { method: "PUT", token: admin, body: nextConfig });
  assert.equal(savedConfig.status, 200, JSON.stringify(savedConfig.data));
  assert.equal(savedConfig.data.updatedBy, "Admin User");
  assert.equal(stageById(savedConfig.data, "stage-lead").name, STAGE_INTENT);
  assert.equal(stageById(savedConfig.data, "stage-lead").legacyName, STAGE_LEAD);
  assert.ok(savedConfig.data.salesStages.some((stage) => stage.name === STAGE_TRIAL && stage.active === false));
  assert.equal(savedConfig.data.performance.claimProtectionDays, 5);
  assert.equal(savedConfig.data.performance.publicPoolDays, 45);
  assert.deepEqual(savedConfig.data.map.immutableFields.sort(), ["customerId", "latitude", "longitude", "opportunityId", "ownerId", "photos"].sort());

  const missingCustomFields = await request("/customers", {
    method: "POST",
    token: sales,
    body: { name: "Missing Required Fields", phone: "13900000001", stage: STAGE_INTENT, productId: "product-base" }
  });
  assert.equal(missingCustomFields.status, 400);

  const created = await request("/customers", {
    method: "POST",
    token: sales,
    body: {
      name: "Configurable CRM Factory",
      phone: "13900000002",
      address: "No. 2 Test Road",
      stage: STAGE_INTENT,
      productId: "product-base",
      customerCustomFields: { industry: "Education" },
      opportunityCustomFields: { budgetLevel: "High" }
    }
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.stage, STAGE_INTENT);
  assert.equal(created.data.stageId, "stage-lead");
  assert.equal(created.data.customFields.industry, "Education");
  assert.equal(created.data.customFields.budgetLevel, "High");

  const advanced = await request(`/opportunities/${created.data.id}/advance`, {
    method: "POST",
    token: sales,
    body: { note: "Demo completed", demoAt: "2026-06-17", nextFollow: "2026-06-20" }
  });
  assert.equal(advanced.status, 200, JSON.stringify(advanced.data));
  assert.equal(advanced.data.stage, STAGE_OPPORTUNITY);
  assert.equal(advanced.data.stageId, "stage-opportunity");

  const product = await request("/products", {
    method: "POST",
    token: admin,
    body: { id: "product-analytics", name: "Analytics", price: 12000, category: "BI", note: "Addon", sort: 3 }
  });
  assert.equal(product.status, 201, JSON.stringify(product.data));
  assert.equal(product.data.category, "BI");
  assert.equal(product.data.note, "Addon");
  assert.equal(product.data.sort, 3);
  const disabledProduct = await request("/products/product-analytics", {
    method: "PUT",
    token: admin,
    body: { name: "Analytics", price: 15000, category: "BI Suite", note: "Updated", sort: 4, active: false }
  });
  assert.equal(disabledProduct.status, 200, JSON.stringify(disabledProduct.data));
  assert.equal(disabledProduct.data.active, false);
  assert.equal(disabledProduct.data.category, "BI Suite");

  const board = await request("/customer-board", { token: sales });
  assert.equal(board.status, 200);
  assert.ok(board.data.businessConfig.salesStages.some((stage) => stage.name === STAGE_INTENT));
  assert.ok(board.data.stages.includes(STAGE_INTENT));
  assert.ok(board.data.stages.includes(STAGE_TRIAL));

  const miniState = await request("/state?client=mini", { token: sales });
  assert.equal(miniState.status, 200);
  assert.equal(stageById(miniState.data.businessConfig, "stage-lead").name, STAGE_INTENT);
  assert.ok(miniState.data.businessConfig.followTemplates.some((item) => item.id === "follow-intent"));

  const persisted = JSON.parse(fs.readFileSync(path.join(tempDir, "db.json"), "utf8"));
  const storedCustomer = persisted.customers.find((item) => item.name === "Configurable CRM Factory");
  const storedOpportunity = persisted.opportunities.find((item) => Number(item.id) === Number(created.data.id));
  assert.equal(storedCustomer.customFields.industry, "Education");
  assert.equal(storedOpportunity.customFields.budgetLevel, "High");
  assert.ok(persisted.businessConfig.salesStages.some((stage) => stage.name === STAGE_TRIAL && stage.active === false));
}

run()
  .then(() => {
    child.kill();
    console.log("business config tests passed");
  })
  .catch((error) => {
    child.kill();
    console.error(error);
    console.error(serverOutput);
    process.exitCode = 1;
  });
