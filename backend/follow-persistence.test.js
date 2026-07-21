const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-follow-persistence-test-"));
const uploadDir = path.join(tempDir, "uploads");
const dataFile = path.join(tempDir, "db.json");
const backupFile = path.join(tempDir, "db.backup.json");
const port = 29000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const loadSizeArg = process.argv.find((value) => value.startsWith("--load-mb="));
const loadSizeMb = Math.max(0, Number(loadSizeArg?.split("=")[1] || 0));

const T = {
  admin: "\u7ba1\u7406\u5458",
  sales: "\u9500\u552e",
  list: "\u540d\u5355",
  unit: "\u6d4b\u8bd5\u5355\u4f4d",
  eastZone: "\u4e1c\u90e8\u6218\u533a",
  other: "\u5176\u4ed6",
  v1: "V1"
};
const recentDate = new Date().toISOString().slice(0, 10);

const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  units: [{ id: "unit-a", name: T.unit, parentId: "org-zone-east", type: "unit", zone: T.eastZone }],
  users: [
    { id: 1, name: "Admin", account: "admin", password: "778899", role: T.admin, roleId: "role-admin", unitId: "unit-a", unit: T.unit, zone: T.eastZone },
    { id: 2, name: "Sales", account: "sales", password: "123456", role: T.sales, roleId: "role-sales", unitId: "unit-a", unit: T.unit, zone: T.eastZone }
  ],
  customers: [{
    id: 100,
    name: "Follow Factory",
    phone: "13900000011",
    phoneNormalized: "13900000011",
    channelSource: T.other,
    createdBy: "Admin",
    owner: "Sales",
    ownerId: 2,
    followPerson: "Sales",
    unitId: "unit-a",
    unit: T.unit,
    zone: T.eastZone,
    createdAt: recentDate,
    contacts: [{ name: "Primary", phone: "13900000011", isPrimary: true }]
  }],
  opportunities: [{
    id: 101,
    customerId: 100,
    productId: "product-v1",
    productName: T.v1,
    stage: T.list,
    owner: "Sales",
    ownerId: 2,
    followPerson: "Sales",
    unitId: "unit-a",
    unit: T.unit,
    zone: T.eastZone,
    createdBy: "Admin",
    createdAt: recentDate,
    ownershipStatus: "locked",
    followUps: []
  }],
  channelSources: [{ id: "channel-other", name: T.other, active: true }],
  products: [{ id: "product-v1", name: T.v1, price: 150000, sort: 1, active: true }],
  visits: [],
  activities: [],
  knowledge: [],
  resources: loadSizeMb ? [{ id: "load-fixture", content: "x".repeat(loadSizeMb * 1024 * 1024) }] : [],
  routes: [],
  targets: []
};

fs.mkdirSync(uploadDir, { recursive: true });
fs.writeFileSync(dataFile, JSON.stringify(seed, null, 2));
fs.writeFileSync(path.join(tempDir, "seed.json"), JSON.stringify(seed, null, 2));

let child = null;
let output = "";

function startServer() {
  output = "";
  child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: tempDir,
      UPLOAD_DIR: uploadDir,
      AUTH_TOKEN_SECRET: "follow-persistence-test-secret",
      STATE_WRITE_DELAY_MS: "25",
      STATE_BACKUP_INTERVAL_MS: "600000"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
}

async function stopServer() {
  if (!child) return;
  const current = child;
  child = null;
  if (current.exitCode !== null) return;
  current.kill();
  await new Promise((resolve) => current.once("exit", resolve));
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

async function waitForPersistedState(expectedNote) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const disk = JSON.parse(fs.readFileSync(dataFile, "utf8"));
      const opportunity = disk.opportunities.find((item) => Number(item.id) === 101);
      const health = await request("/health");
      const persistence = health.data.persistence || {};
      if (opportunity?.lastNote === expectedNote
        && persistence.dirty === false
        && Number(persistence.persistedRevision) === Number(persistence.revision)) {
        return disk;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`state did not persist: ${expectedNote}\n${output}`);
}

async function run() {
  startServer();
  await waitForServer();
  assert.ok(fs.existsSync(backupFile), "startup migration should create a verified backup");
  const backupMtimeBeforeFollow = fs.statSync(backupFile).mtimeMs;
  const token = await login("sales");
  const note = "manual follow persists";
  const nextFollow = "2026-06-29";

  const follow = await request("/opportunities/101/follow", {
    method: "POST",
    token,
    body: { note, nextFollow, productId: "product-v1" }
  });
  assert.equal(follow.status, 200, JSON.stringify(follow.data));
  assert.equal(follow.data.nextFollow, nextFollow);
  assert.ok(follow.data.followUps.some((item) => item.note === note && item.nextFollow === nextFollow && item.isSystem === false));

  const immediateState = await request("/state?lite=1", { token });
  assert.equal(immediateState.status, 200, JSON.stringify(immediateState.data));
  const immediateOpportunity = immediateState.data.opportunities.find((item) => Number(item.id) === 101);
  assert.ok(immediateOpportunity, "followed opportunity should be visible immediately");
  assert.equal(immediateOpportunity.nextFollow, nextFollow);
  assert.equal(immediateOpportunity.lastNote, note);
  const immediateDetail = await request("/opportunities/101/detail", { token });
  assert.equal(immediateDetail.status, 200, JSON.stringify(immediateDetail.data));
  assert.ok(immediateDetail.data.followUps.some((item) => item.note === note));

  const disk = await waitForPersistedState(note);
  assert.equal(fs.statSync(backupFile).mtimeMs, backupMtimeBeforeFollow, "queued writes should respect the backup interval");
  const diskOpportunity = disk.opportunities.find((item) => Number(item.id) === 101);
  assert.ok(!diskOpportunity.followUps.some((item) => item.note === note && item.nextFollow === nextFollow));
  assert.equal(diskOpportunity.lastNote, note);
  assert.equal(diskOpportunity.nextFollow, nextFollow);
  const followLogDir = path.join(tempDir, "followups");
  const followLogContent = fs.readdirSync(followLogDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => fs.readFileSync(path.join(followLogDir, name), "utf8"))
    .join("\n");
  assert.ok(followLogContent.includes(note));
  const followLogFile = fs.readdirSync(followLogDir).find((name) => name.endsWith(".jsonl"));
  assert.ok(followLogFile, "follow-up log file should exist");
  const indexedFile = path.join(followLogDir, followLogFile);
  const hiddenFile = `${indexedFile}.indexed`;
  fs.renameSync(indexedFile, hiddenFile);
  const indexedDetail = await request("/opportunities/101/detail", { token });
  assert.equal(indexedDetail.status, 200, JSON.stringify(indexedDetail.data));
  assert.ok(indexedDetail.data.followUps.some((item) => item.note === note), "detail should use the startup follow-up index");
  fs.renameSync(hiddenFile, indexedFile);
  assert.equal(
    fs.readdirSync(tempDir).filter((name) => name.endsWith(".tmp")).length,
    0,
    "atomic persistence should not leave temporary files"
  );

  await stopServer();
  startServer();
  await waitForServer();
  const tokenAfterRestart = await login("sales");
  const restartedState = await request("/state?lite=1", { token: tokenAfterRestart });
  assert.equal(restartedState.status, 200, JSON.stringify(restartedState.data));
  const restartedOpportunity = restartedState.data.opportunities.find((item) => Number(item.id) === 101);
  assert.equal(restartedOpportunity.lastNote, note);
  assert.equal(restartedOpportunity.nextFollow, nextFollow);
  const restartedDetail = await request("/opportunities/101/detail", { token: tokenAfterRestart });
  assert.equal(restartedDetail.status, 200, JSON.stringify(restartedDetail.data));
  assert.ok(restartedDetail.data.followUps.some((item) => item.note === note && item.nextFollow === nextFollow));
}

run()
  .then(async () => {
    await stopServer();
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log("follow persistence tests passed");
  })
  .catch(async (error) => {
    await stopServer();
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.error(error);
    console.error(output);
    process.exitCode = 1;
  });
