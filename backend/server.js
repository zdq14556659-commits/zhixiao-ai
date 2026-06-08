const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8787);
const AMAP_KEY = process.env.AMAP_KEY || "";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const SEED_FILE = path.join(DATA_DIR, "seed.json");
const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, "uploads");
const FALLBACK_SEED_FILE = path.join(__dirname, "data", "seed.json");
const PUBLIC_ROOT = path.resolve(__dirname, "..");
const STAGES = ["名单", "线索", "商机", "成交"];
const ADMIN_ROLES = ["主管", "区域经理", "运营", "管理员"];
const DEMO_ACCOUNTS = {
  林晨: "linchen",
  周扬: "zhouyang",
  陈主管: "chen",
  王区域: "wang",
  运营小组: "admin"
};

ensureDataFile();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "server error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`智销AI backend running: http://localhost:${PORT}`);
});

async function routeApi(req, res, url) {
  if (req.method === "OPTIONS") return sendNoContent(res);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "zhixiao-ai-backend" });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const state = readState();
    const account = cleanAccount(body.account || body.username || body.phone || "");
    const password = String(body.password || "");
    const user = state.users.find((item) => {
      const keys = [item.account, item.username, item.phone].map(cleanAccount).filter(Boolean);
      return keys.includes(account);
    });
    if (!user || String(user.password || "") !== password) {
      return sendJson(res, 401, { error: "账号或密码错误" });
    }
    if (user.status === "停用") {
      return sendJson(res, 403, { error: "账号已停用，请联系管理员" });
    }
    state.currentUserId = user.id;
    writeState(state);
    return sendJson(res, 200, {
      token: makeToken(user),
      user: publicUser(user),
      state: toMiniState(state)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    const client = url.searchParams.get("client") || "web";
    const state = readState();
    return sendJson(res, 200, client === "mini" ? toMiniState(state) : publicState(state));
  }

  if (req.method === "PUT" && url.pathname === "/api/state") {
    const body = await readBody(req);
    const nextState = normalizeIncomingState(body);
    writeState(nextState);
    return sendJson(res, 200, { ok: true, state: publicState(nextState) });
  }

  if (req.method === "POST" && url.pathname === "/api/customers") {
    const body = await readBody(req);
    const state = readState();
    const customer = normalizeCustomer({ id: Date.now(), ...body });
    state.customers.unshift(customer);
    state.activities.push({ date: today(), owner: customer.owner, type: customer.stage, customerId: customer.id });
    writeState(state);
    return sendJson(res, 201, toMiniCustomer(customer));
  }

  const customerFollow = url.pathname.match(/^\/api\/customers\/(\d+)\/follow$/);
  if (req.method === "POST" && customerFollow) {
    const body = await readBody(req);
    const state = readState();
    const customer = state.customers.find((item) => item.id === Number(customerFollow[1]));
    if (!customer) return sendJson(res, 404, { error: "customer not found" });
    customer.followUps = customer.followUps || [];
    customer.followUps.push({
      date: body.date || today(),
      note: body.note || "更新了下次跟进时间。",
      nextFollow: body.nextFollow || ""
    });
    writeState(state);
    return sendJson(res, 200, toMiniCustomer(customer));
  }

  const customerPatch = url.pathname.match(/^\/api\/customers\/(\d+)$/);
  if ((req.method === "PATCH" || req.method === "PUT") && customerPatch) {
    const body = await readBody(req);
    const state = readState();
    const index = state.customers.findIndex((item) => item.id === Number(customerPatch[1]));
    if (index < 0) return sendJson(res, 404, { error: "customer not found" });
    const previousStage = state.customers[index].stage;
    state.customers[index] = normalizeCustomer({ ...state.customers[index], ...body, id: state.customers[index].id });
    if (body.stage && body.stage !== previousStage) {
      state.activities.push({
        date: body.date || today(),
        owner: state.customers[index].owner,
        type: body.stage,
        customerId: state.customers[index].id
      });
    }
    writeState(state);
    return sendJson(res, 200, toMiniCustomer(state.customers[index]));
  }

  if (req.method === "POST" && url.pathname === "/api/visits") {
    const body = await readBody(req);
    const state = readState();
    const visit = normalizeVisit({ id: Date.now(), date: today(), photos: [], ...body });
    state.visits.unshift(visit);
    writeState(state);
    return sendJson(res, 201, visit);
  }

  if (req.method === "POST" && url.pathname === "/api/uploads") {
    const upload = await saveMultipartUpload(req);
    return sendJson(res, 201, upload);
  }

  if (req.method === "POST" && url.pathname === "/api/import/customers") {
    const result = await importCustomers(req);
    return sendJson(res, 201, result);
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    const body = await readBody(req);
    const state = readState();
    const account = cleanAccount(body.account || body.username || body.phone || "");
    if (!body.name || !account || !body.password) {
      return sendJson(res, 400, { error: "员工姓名、登录账号、初始密码必填" });
    }
    if (state.users.some((item) => cleanAccount(item.account) === account || cleanAccount(item.phone) === account)) {
      return sendJson(res, 409, { error: "登录账号已存在" });
    }
    const user = normalizeUser({
      id: Date.now(),
      name: body.name,
      phone: body.phone || "",
      account,
      password: String(body.password),
      role: body.role || "销售",
      unit: body.unit || body.region || "待分配",
      region: body.region || "待分区",
      status: "启用"
    });
    state.users.push(user);
    writeState(state);
    return sendJson(res, 201, publicUser(user));
  }

  if (req.method === "POST" && url.pathname === "/api/knowledge") {
    const body = await readBody(req);
    const state = readState();
    const item = {
      id: Date.now(),
      question: body.question || "",
      answer: body.answer || "",
      createdAt: today()
    };
    state.knowledge.unshift(item);
    writeState(state);
    return sendJson(res, 201, item);
  }

  if (req.method === "POST" && url.pathname === "/api/ai/script") {
    const body = await readBody(req);
    const state = readState();
    const result = await generateXiaozhiStrategy(body.question || "", state.knowledge || [], body.customer || null);
    return sendJson(res, 200, result);
  }

  if (req.method === "GET" && url.pathname === "/api/amap/regeo") {
    const longitude = url.searchParams.get("longitude");
    const latitude = url.searchParams.get("latitude");
    if (!longitude || !latitude) return sendJson(res, 400, { error: "longitude and latitude required" });
    const result = await amapRegeo(longitude, latitude);
    return sendJson(res, 200, result);
  }

  sendJson(res, 404, { error: "not found" });
}

function normalizeIncomingState(input) {
  const current = readState();
  return migrateState({
    ...current,
    ...input,
    users: mergeUsers(input.users, current.users),
    customers: (input.customers || current.customers).map(normalizeCustomer),
    activities: input.activities || current.activities || [],
    visits: (input.visits || current.visits || []).map(normalizeVisit),
    knowledge: input.knowledge || current.knowledge || [],
    resources: input.resources || current.resources || []
  });
}

function mergeUsers(incomingUsers, existingUsers) {
  if (!Array.isArray(incomingUsers)) return existingUsers || [];
  return incomingUsers.map((user) => {
    const existing = (existingUsers || []).find((item) => {
      return (
        Number(item.id) === Number(user.id) ||
        (user.account && cleanAccount(item.account) === cleanAccount(user.account)) ||
        (user.phone && cleanAccount(item.phone) === cleanAccount(user.phone))
      );
    });
    return {
      ...existing,
      ...user,
      account: user.account || user.username || existing?.account || existing?.username,
      password: user.password || existing?.password || "123456"
    };
  });
}

function migrateState(state) {
  const users = normalizeUsers(state.users || []);
  return {
    version: state.version || "backend-v2",
    currentUserId: Number(state.currentUserId || users[0]?.id || 0),
    stages: Array.isArray(state.stages) && state.stages.length ? state.stages : STAGES,
    users,
    customers: (state.customers || []).map(normalizeCustomer),
    activities: state.activities || [],
    visits: (state.visits || []).map(normalizeVisit),
    knowledge: state.knowledge || [],
    resources: state.resources || []
  };
}

function normalizeUsers(users) {
  const used = new Set();
  return users.map((user, index) => {
    const next = normalizeUser(user, index);
    const base = next.account || `user${next.id}`;
    let account = base;
    let suffix = 2;
    while (used.has(account)) {
      account = `${base}${suffix}`;
      suffix += 1;
    }
    used.add(account);
    next.account = account;
    next.username = account;
    return next;
  });
}

function normalizeUser(user = {}, index = 0) {
  const id = Number(user.id || Date.now() + index);
  const name = user.name || `员工${index + 1}`;
  const role = user.role || "销售";
  const fallbackAccount = DEMO_ACCOUNTS[name] || (ADMIN_ROLES.includes(role) ? "admin" : `user${id}`);
  const account = cleanAccount(user.account || user.username || user.login || user.phone || fallbackAccount);
  return {
    id,
    name,
    phone: user.phone || "",
    account,
    username: account,
    password: String(user.password || user.initialPassword || "123456"),
    role,
    unit: user.unit || user.region || "待分配",
    region: user.region || user.unit || "待分区",
    status: user.status || "启用",
    createdAt: user.createdAt || today()
  };
}

function normalizeCustomer(customer) {
  const followUps = Array.isArray(customer.followUps) && customer.followUps.length
    ? customer.followUps
    : [
        {
          date: customer.lastFollow || customer.createdAt || today(),
          note: customer.lastNote || "新增客户。",
          nextFollow: customer.nextFollow || ""
        }
      ];
  return {
    id: Number(customer.id || Date.now()),
    name: customer.name || "",
    phone: customer.phone || "待补充",
    stage: customer.stage || "名单",
    owner: customer.owner || "林晨",
    region: customer.region || "待分区",
    amount: Number(customer.amount || 15),
    software: customer.software || "待补充",
    createdAt: customer.createdAt || today(),
    followUps
  };
}

function normalizeVisit(visit = {}) {
  return {
    id: Number(visit.id || Date.now()),
    factory: visit.factory || "",
    line: visit.line || "待补充",
    software: visit.software || "待补充",
    status: visit.status || "跟进中",
    latitude: Number(visit.latitude || 0),
    longitude: Number(visit.longitude || 0),
    city: visit.city || "",
    address: visit.address || "",
    owner: visit.owner || "",
    ownerId: visit.ownerId || "",
    photos: Array.isArray(visit.photos) ? visit.photos : [],
    date: visit.date || today()
  };
}

function publicState(state) {
  return {
    ...state,
    users: (state.users || []).map(publicUser)
  };
}

function publicUser(user) {
  const { password, passwordHash, ...safe } = user;
  return safe;
}

function toMiniState(state) {
  const next = publicState(state);
  return {
    ...next,
    customers: next.customers.map(toMiniCustomer)
  };
}

function toMiniCustomer(customer) {
  const latest = (customer.followUps || [])[customer.followUps.length - 1] || {};
  return {
    ...customer,
    lastFollow: latest.date || "",
    nextFollow: latest.nextFollow || "",
    lastNote: latest.note || "",
    followUps: undefined
  };
}

function readState() {
  ensureDataFile();
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const migrated = migrateState(raw);
  if (JSON.stringify(raw) !== JSON.stringify(migrated)) writeState(migrated);
  return migrated;
}

function writeState(state) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(migrateState(state), null, 2), "utf8");
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SEED_FILE)) fs.copyFileSync(FALLBACK_SEED_FILE, SEED_FILE);
  if (!fs.existsSync(DATA_FILE)) fs.copyFileSync(SEED_FILE, DATA_FILE);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid json body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end();
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith("/uploads/")) {
    const uploadPath = path.resolve(UPLOAD_DIR, pathname.replace("/uploads/", ""));
    if (!uploadPath.startsWith(path.resolve(UPLOAD_DIR)) || !fs.existsSync(uploadPath)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(uploadPath).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(uploadPath).pipe(res);
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(PUBLIC_ROOT, `.${pathname}`);
  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json"
  }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

async function saveMultipartUpload(req) {
  const multipart = await parseMultipart(req);
  const file = multipart.files.find((item) => item.name === "file") || multipart.files[0];
  if (!file || !file.buffer.length) throw new Error("upload file missing");
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = getUploadExt(file);
  const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
  const filePath = path.join(UPLOAD_DIR, fileName);
  fs.writeFileSync(filePath, file.buffer);
  return { url: `/uploads/${fileName}`, size: file.buffer.length };
}

async function importCustomers(req) {
  const multipart = await parseMultipart(req);
  const stage = multipart.fields.stage || "名单";
  const owner = multipart.fields.owner || "林晨";
  const text = multipart.files[0] ? multipart.files[0].buffer.toString("utf8") : multipart.fields.rows || "";
  const rows = parseCustomerRows(text);
  const state = readState();
  const customers = rows.map((row, index) => {
    const customer = normalizeCustomer({
      id: Date.now() + index,
      name: row.name,
      phone: row.phone,
      stage,
      owner,
      region: row.region,
      amount: row.amount,
      software: row.software,
      createdAt: today(),
      lastFollow: today(),
      nextFollow: today(),
      lastNote: "名单文件导入。"
    });
    state.activities.push({ date: today(), owner, type: stage, customerId: customer.id });
    return customer;
  });
  state.customers.unshift(...customers);
  writeState(state);
  return { imported: customers.length, customers: customers.map(toMiniCustomer) };
}

function parseCustomerRows(text) {
  return text
    .replace(/^\ufeff/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => index !== 0 || !/(客户|名称|手机号|phone)/i.test(line))
    .map((line) => {
      const [name, phone = "待补充", region = "待分区", amount = "15", software = "待补充"] = line
        .split(/,|，|\t/)
        .map((item) => item.trim());
      return { name, phone, region, amount: Number(amount) || 15, software };
    })
    .filter((row) => row.name);
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
    if (!boundaryMatch) return reject(new Error("multipart boundary missing"));
    const boundary = boundaryMatch[1];
    const delimiter = Buffer.from(`--${boundary}`);
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > 30 * 1024 * 1024) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks);
        const fields = {};
        const files = [];
        let boundaryPos = body.indexOf(delimiter);

        while (boundaryPos >= 0) {
          let partStart = boundaryPos + delimiter.length;
          if (body.slice(partStart, partStart + 2).toString("utf8") === "--") break;
          if (body.slice(partStart, partStart + 2).toString("utf8") === "\r\n") partStart += 2;

          const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), partStart);
          if (headerEnd < 0) break;
          const header = body.slice(partStart, headerEnd).toString("utf8");
          const contentStart = headerEnd + 4;
          const nextBoundary = body.indexOf(Buffer.from(`\r\n--${boundary}`), contentStart);
          if (nextBoundary < 0) break;

          const name = (header.match(/name="([^"]+)"/) || [])[1];
          const filename = (header.match(/filename="([^"]*)"/) || [])[1];
          const contentTypeHeader = (header.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || "";
          const buffer = body.slice(contentStart, nextBoundary);
          if (filename) {
            files.push({ name, filename, contentType: contentTypeHeader, header, buffer });
          } else if (name) {
            fields[name] = buffer.toString("utf8");
          }
          boundaryPos = nextBoundary + 2;
        }
        resolve({ fields, files });
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function generateXiaozhiStrategy(question, knowledge, customer) {
  const matched = rankKnowledge(question, knowledge).slice(0, 4);
  if (!DEEPSEEK_API_KEY) {
    return fallbackXiaozhi(question, matched, customer, "未配置 DEEPSEEK_API_KEY，当前使用知识库本地策略。");
  }
  const system = [
    "你是智销AI的小智，是全屋定制软件销售跟进助手。",
    "你必须结合知识库给出销售可执行的话术和跟进策略。",
    "输出结构：客户意图、推荐话术、成交策略、下一步动作、风险提醒。语言简洁，适合销售马上照着用。"
  ].join("\n");
  const context = matched.map((item, index) => `${index + 1}. 问题：${item.question}\n答案：${item.answer}`).join("\n\n");
  const user = `客户问题：${question}\n\n客户信息：${customer ? JSON.stringify(customer) : "暂无"}\n\n知识库：\n${context || "暂无匹配知识库"}`;
  try {
    const data = await deepseekChat(system, user);
    return {
      source: "deepseek",
      name: "小智",
      matched,
      answer: data.choices?.[0]?.message?.content || "",
      model: data.model || DEEPSEEK_MODEL
    };
  } catch (error) {
    return fallbackXiaozhi(question, matched, customer, `DeepSeek 调用失败：${error.message}`);
  }
}

function deepseekChat(system, user) {
  const payload = JSON.stringify({
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.4,
    max_tokens: 900
  });
  return new Promise((resolve, reject) => {
    const request = https.request(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (response.statusCode >= 400) reject(new Error(json.error?.message || body));
            else resolve(json);
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

function rankKnowledge(question, knowledge) {
  const words = String(question || "").split(/[，。；、\s]+/).filter(Boolean);
  return [...knowledge]
    .map((item) => ({
      ...item,
      score: words.filter((word) => `${item.question}${item.answer}`.includes(word)).length
    }))
    .sort((a, b) => b.score - a.score);
}

function fallbackXiaozhi(question, matched, customer, note) {
  const best = matched[0];
  const answer = [
    "客户意图：客户正在确认软件能否解决真实生产痛点，重点关注落地风险和投入回报。",
    `推荐话术：${best ? best.answer : "先让客户提供一套真实订单，现场演示从设计、报价、拆单、开料标签到车间看板的完整流程。"}`,
    "成交策略：不要先讲功能清单，先围绕错单返工、板材浪费、交期延误和算账效率，再给两周样板产线试点。",
    "下一步动作：今天发送试点方案，约老板、设计主管、生产主管一起看演示，并确认设备品牌和现用软件。",
    `风险提醒：${note}`
  ].join("\n");
  return { source: "fallback", name: "小智", matched, answer, customer, question };
}

function getUploadExt(file) {
  const ext = path.extname(file.filename || "").toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return ext;
  const type = file.contentType || "";
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  return ".jpg";
}

function amapRegeo(longitude, latitude) {
  if (!AMAP_KEY) {
    return Promise.resolve({
      raw: null,
      city: "",
      address: "",
      error: "未配置 AMAP_KEY"
    });
  }
  const apiUrl = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(AMAP_KEY)}&location=${encodeURIComponent(`${longitude},${latitude}`)}&extensions=base&output=json`;
  return new Promise((resolve, reject) => {
    httpsGetJson(apiUrl, (error, data) => {
      if (error) return reject(error);
      const regeocode = data && data.regeocode;
      const component = regeocode && regeocode.addressComponent;
      const city = Array.isArray(component?.city) ? component?.province : component?.city || component?.province || "";
      resolve({
        raw: data,
        city,
        address: regeocode?.formatted_address || ""
      });
    });
  });
}

function httpsGetJson(apiUrl, callback) {
  https
    .get(apiUrl, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        try {
          callback(null, JSON.parse(body));
        } catch (error) {
          callback(error);
        }
      });
    })
    .on("error", callback);
}

function cleanAccount(value) {
  return String(value || "").trim().toLowerCase();
}

function makeToken(user) {
  const random = crypto.randomBytes(12).toString("hex");
  return Buffer.from(`${user.id}:${Date.now()}:${random}`).toString("base64url");
}

function today() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
