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
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = isForm ? {} : { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : isForm ? options.body : JSON.stringify(options.body)
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

function crc32(buffer) {
  const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  }));
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  entries.forEach(([name, content]) => {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  });
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function sparseChannelWorkbook() {
  const strings = ["客户", "客户电话", "状态", "城市", "客户地址", "渠道来源", "意向产品", "单位", "录入人", "跟进人", "跟进记录", "最新跟进时间", "下次跟进时间", "当前使用软件", "预计金额（元）", "设计师", "自主注册"];
  const shared = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((item) => `<si><t>${item}</t></si>`).join("")}</sst>`;
  const header = strings.slice(0, 15).map((_, index) => `<c r="${String.fromCharCode(65 + index)}1" t="s"><v>${index}</v></c>`).join("");
  const row = [
    '<c r="A2" t="s"><v>15</v></c>',
    '<c r="B2"><v>13900000003</v></c>',
    '<c r="C2"/>',
    '<c r="D2"/>',
    '<c r="E2"/>',
    '<c r="F2" t="s"><v>16</v></c>',
    '<c r="G2"/>',
    '<c r="H2"/>',
    '<c r="I2"/>',
    '<c r="J2"/>'
  ].join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${header}</row><row r="2">${row}</row></sheetData></worksheet>`;
  return zipStored([
    ["xl/sharedStrings.xml", shared],
    ["xl/worksheets/sheet1.xml", sheet]
  ]);
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

  const form = new FormData();
  form.append("file", new Blob([sparseChannelWorkbook()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "sparse-channel.xlsx");
  form.append("target", "public_pool");
  const xlsxImported = await request("/import/customers?target=public_pool", { method: "POST", token: ops, body: form });
  assert.equal(xlsxImported.status, 201, JSON.stringify(xlsxImported.data));
  assert.equal(xlsxImported.data.imported, 1);
  assert.equal(xlsxImported.data.channelUnrecognized, 0);
  const publicPoolAfterXlsx = await request("/public-pool", { token: sales });
  const sparseCustomer = publicPoolAfterXlsx.data.items.find((item) => item.name === "设计师" && item.customerId !== official.customerId);
  assert.equal(sparseCustomer.channelSource, "自主注册");
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
