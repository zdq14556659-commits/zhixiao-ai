const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-mysql-fallback-test-"));
const port = 30500 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}/api`;
const seed = {
  version: "backend-v9",
  moneyUnit: "yuan",
  currentUserId: 1,
  stages: ["名单", "线索", "商机", "成交"],
  roles: [],
  units: [],
  users: [],
  customers: [{ id: 101, name: "JSON fallback customer", phone: "13800000001", createdAt: "2026-07-01" }],
  opportunities: [],
  products: [],
  competitors: [],
  channelSources: [],
  lossReasons: [],
  businessRules: {},
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

let child;
let output = "";

async function request(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return { status: response.status, data: await response.json() };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const result = await request("/health");
      if (result.status === 200) return result.data;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(output);
}

async function run() {
  child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: tempDir,
      UPLOAD_DIR: path.join(tempDir, "uploads"),
      AUTH_TOKEN_SECRET: "mysql-runtime-fallback-test-secret",
      STORAGE_MODE: "mysql",
      MYSQL_URL: "",
      MYSQL_FALLBACK_TO_JSON: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  const health = await waitForServer();
  assert.equal(health.storage.requested, "mysql");
  assert.equal(health.storage.active, "json");
  assert.equal(health.storage.mysqlDisabled, true);
  assert.ok(health.storage.startupError.includes("MYSQL_URL"));
  assert.ok(fs.existsSync(path.join(tempDir, ".mysql-runtime-disabled")));
}

run()
  .then(() => {
    console.log("mysql runtime fallback tests passed");
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
