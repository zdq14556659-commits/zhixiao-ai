const crypto = require("crypto");

function createMysqlStore(options = {}) {
  const url = String(options.url || process.env.MYSQL_URL || "").trim();
  if (!url) throw new Error("MYSQL_URL is required when STORAGE_MODE=mysql");
  const mysql = loadMysqlClient();
  const connection = parseMysqlUrl(url);

  const pool = mysql.createPool({
    ...connection,
    connectionLimit: Math.max(2, Number(options.connectionLimit || process.env.MYSQL_POOL_SIZE || 6)),
    connectTimeout: Math.max(1000, Number(options.connectTimeout || process.env.MYSQL_CONNECT_TIMEOUT_MS || 3000)),
    waitForConnections: true,
    queueLimit: Math.max(0, Number(process.env.MYSQL_QUEUE_LIMIT || 100)),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: "utf8mb4"
  });

  let lastError = "";
  let lastWriteAt = "";
  let lastWriteDurationMs = 0;

  async function connect() {
    const connection = await pool.getConnection();
    try {
      await connection.query("SELECT 1 AS ok");
      lastError = "";
    } finally {
      connection.release();
    }
  }

  async function close() {
    await pool.end();
  }

  async function counts() {
    const [rows] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM customers) AS customers,
        (SELECT COUNT(*) FROM opportunities) AS opportunities,
        (SELECT COUNT(*) FROM follow_ups) AS followUps,
        (SELECT COUNT(*) FROM visits) AS visits`
    );
    const row = rows[0] || {};
    return {
      customers: Number(row.customers || 0),
      opportunities: Number(row.opportunities || 0),
      followUps: Number(row.followUps || 0),
      visits: Number(row.visits || 0)
    };
  }

  async function loadCoreState() {
    const startedAt = Date.now();
    const connection = await pool.getConnection();
    try {
      await connection.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await connection.beginTransaction();
      const [customerRows] = await connection.query("SELECT id, data FROM customers ORDER BY id");
      const [opportunityRows] = await connection.query("SELECT id, customer_id, data FROM opportunities ORDER BY id");
      const [followRows] = await connection.query("SELECT source_key, opportunity_id, customer_id, data FROM follow_ups ORDER BY id");
      const [visitRows] = await connection.query("SELECT id, data FROM visits ORDER BY id");
      await connection.commit();

      const customers = customerRows.map((row) => ({ ...parseJson(row.data), id: numberId(row.id) }));
      const opportunities = opportunityRows.map((row) => ({
        ...parseJson(row.data),
        id: numberId(row.id),
        customerId: numberId(parseJson(row.data).customerId || row.customer_id),
        followUps: []
      }));
      const followUps = followRows.map((row) => ({
        ...parseJson(row.data),
        sourceKey: String(row.source_key || ""),
        opportunityId: numberId(parseJson(row.data).opportunityId || row.opportunity_id),
        customerId: numberId(parseJson(row.data).customerId || row.customer_id)
      }));
      const visits = visitRows.map((row) => ({ ...parseJson(row.data), id: numberId(row.id) }));
      return {
        customers,
        opportunities,
        followUps,
        visits,
        counts: {
          customers: customers.length,
          opportunities: opportunities.length,
          followUps: followUps.length,
          visits: visits.length
        },
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      lastError = error.message || String(error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async function persistChanges(changes = {}) {
    const startedAt = Date.now();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const id of uniqueIds(changes.deletedCustomerIds)) {
        await connection.execute("DELETE FROM follow_ups WHERE customer_id = ?", [id]);
        await connection.execute("DELETE FROM visits WHERE customer_id = ?", [id]);
        await connection.execute("DELETE FROM opportunities WHERE customer_id = ?", [id]);
        await connection.execute("DELETE FROM customers WHERE id = ?", [id]);
      }
      for (const id of uniqueIds(changes.deletedOpportunityIds)) {
        await connection.execute("DELETE FROM follow_ups WHERE opportunity_id = ?", [id]);
        await connection.execute("DELETE FROM opportunities WHERE id = ?", [id]);
      }
      for (const id of uniqueIds(changes.deletedVisitIds)) {
        await connection.execute("DELETE FROM visits WHERE id = ?", [id]);
      }
      for (const customer of uniqueEntities(changes.customers)) await upsertCustomer(connection, customer);
      for (const opportunity of uniqueEntities(changes.opportunities)) await upsertOpportunity(connection, opportunity);
      for (const follow of uniqueFollowUps(changes.followUps)) await upsertFollowUp(connection, follow);
      for (const visit of uniqueEntities(changes.visits)) await upsertVisit(connection, visit);
      await connection.commit();
      lastWriteAt = new Date().toISOString();
      lastWriteDurationMs = Date.now() - startedAt;
      lastError = "";
      return { ok: true, durationMs: lastWriteDurationMs };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      lastError = error.message || String(error);
      throw error;
    } finally {
      connection.release();
    }
  }

  function status() {
    return { lastError, lastWriteAt, lastWriteDurationMs };
  }

  return { connect, close, counts, loadCoreState, persistChanges, status };
}

function loadMysqlClient() {
  try {
    return require("mysql2/promise");
  } catch (error) {
    const wrapped = new Error("MySQL runtime requires the mysql2 package; run npm install before enabling STORAGE_MODE=mysql");
    wrapped.cause = error;
    throw wrapped;
  }
}

function parseMysqlUrl(value) {
  const parsed = new URL(value);
  if (!/^mysql:$/.test(parsed.protocol)) throw new Error("MYSQL_URL must use the mysql:// protocol");
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, ""))
  };
}

async function upsertCustomer(db, customer = {}) {
  const id = numberId(customer.id);
  await db.execute(
    `INSERT INTO customers (id, name, phone, phone_normalized, city, address, channel_source, created_by, created_by_id,
      owner, owner_id, unit_id, unit, zone, lifecycle_status, created_at, updated_at, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone), phone_normalized=VALUES(phone_normalized),
       city=VALUES(city), address=VALUES(address), channel_source=VALUES(channel_source), created_by=VALUES(created_by),
       created_by_id=VALUES(created_by_id), owner=VALUES(owner), owner_id=VALUES(owner_id), unit_id=VALUES(unit_id),
       unit=VALUES(unit), zone=VALUES(zone), lifecycle_status=VALUES(lifecycle_status), created_at=VALUES(created_at),
       updated_at=VALUES(updated_at), data=VALUES(data)`,
    [
      id,
      bounded(customer.name, 255),
      bounded(customer.phone, 255),
      bounded(customer.phoneNormalized || normalizePhone(customer.phone), 80) || null,
      bounded(customer.city, 120),
      bounded(customer.address, 800),
      bounded(customer.channelSource, 120),
      bounded(customer.createdBy, 120),
      nullableNumber(customer.createdById),
      bounded(customer.owner, 120),
      nullableNumber(customer.ownerId),
      bounded(customer.unitId, 80),
      bounded(customer.unit, 160),
      bounded(customer.zone, 80),
      bounded(customer.lifecycleStatus, 40),
      dateValue(customer.createdAt),
      dateValue(customer.updatedAt || new Date().toISOString()),
      JSON.stringify(customer)
    ]
  );
}

async function upsertOpportunity(db, opportunity = {}) {
  const id = numberId(opportunity.id);
  const data = { ...opportunity, followUps: [] };
  await db.execute(
    `INSERT INTO opportunities (id, customer_id, stage, product_id, product_name, owner, owner_id, follow_person,
      created_by, created_by_id, unit_id, unit, zone, ownership_status, lifecycle_status, outcome_status, public_pool_at,
      assigned_at, last_follow_at, next_follow_at, created_at, updated_at, amount, contract_amount, payment_amount, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id), stage=VALUES(stage), product_id=VALUES(product_id),
       product_name=VALUES(product_name), owner=VALUES(owner), owner_id=VALUES(owner_id), follow_person=VALUES(follow_person),
       created_by=VALUES(created_by), created_by_id=VALUES(created_by_id), unit_id=VALUES(unit_id), unit=VALUES(unit),
       zone=VALUES(zone), ownership_status=VALUES(ownership_status), lifecycle_status=VALUES(lifecycle_status),
       outcome_status=VALUES(outcome_status), public_pool_at=VALUES(public_pool_at), assigned_at=VALUES(assigned_at),
       last_follow_at=VALUES(last_follow_at), next_follow_at=VALUES(next_follow_at), created_at=VALUES(created_at),
       updated_at=VALUES(updated_at), amount=VALUES(amount), contract_amount=VALUES(contract_amount),
       payment_amount=VALUES(payment_amount), data=VALUES(data)`,
    [
      id,
      numberId(opportunity.customerId),
      bounded(opportunity.stage, 60),
      bounded(opportunity.productId, 80),
      bounded(opportunity.productName, 160),
      bounded(opportunity.owner, 120),
      nullableNumber(opportunity.ownerId),
      bounded(opportunity.followPerson, 120),
      bounded(opportunity.createdBy, 120),
      nullableNumber(opportunity.createdById),
      bounded(opportunity.unitId, 80),
      bounded(opportunity.unit, 160),
      bounded(opportunity.zone, 80),
      bounded(opportunity.ownershipStatus, 60),
      bounded(opportunity.lifecycleStatus, 60),
      bounded(opportunity.outcomeStatus, 60),
      dateValue(opportunity.publicPoolAt),
      dateValue(opportunity.assignedAt || latestOwnershipAt(opportunity)),
      dateValue(opportunity.latestManualFollowAt || opportunity.lastFollow),
      dateValue(opportunity.nextFollow),
      dateValue(opportunity.createdAt),
      dateValue(opportunity.updatedAt || new Date().toISOString()),
      money(opportunity.amount),
      money(opportunity.contractAmount),
      money(opportunity.paymentAmount),
      JSON.stringify(data)
    ]
  );
}

async function upsertFollowUp(db, follow = {}) {
  const opportunityId = nullableNumber(follow.opportunityId);
  const customerId = nullableNumber(follow.customerId);
  const sourceKey = bounded(
    follow.sourceKey || `runtime:${opportunityId || 0}:${follow.id || hash(JSON.stringify(follow))}`,
    160
  );
  await db.execute(
    `INSERT INTO follow_ups (source_key, opportunity_id, customer_id, follow_date, next_follow_at, author, author_id, note, is_manual, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE opportunity_id=VALUES(opportunity_id), customer_id=VALUES(customer_id),
       follow_date=VALUES(follow_date), next_follow_at=VALUES(next_follow_at), author=VALUES(author),
       author_id=VALUES(author_id), note=VALUES(note), is_manual=VALUES(is_manual), data=VALUES(data)`,
    [
      sourceKey,
      opportunityId,
      customerId,
      dateValue(follow.createdAt || follow.date),
      dateValue(follow.nextFollow),
      bounded(follow.author || follow.owner || follow.followPerson, 120),
      nullableNumber(follow.authorId || follow.ownerId),
      String(follow.note || ""),
      follow.isSystem ? 0 : 1,
      JSON.stringify({ ...follow, sourceKey })
    ]
  );
}

async function upsertVisit(db, visit = {}) {
  const id = numberId(visit.id);
  await db.execute(
    `INSERT INTO visits (id, customer_id, opportunity_id, factory, city, address, owner, owner_id, visit_date, latitude, longitude, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id), opportunity_id=VALUES(opportunity_id), factory=VALUES(factory),
       city=VALUES(city), address=VALUES(address), owner=VALUES(owner), owner_id=VALUES(owner_id), visit_date=VALUES(visit_date),
       latitude=VALUES(latitude), longitude=VALUES(longitude), data=VALUES(data)`,
    [
      id,
      nullableNumber(visit.customerId),
      nullableNumber(visit.opportunityId),
      bounded(visit.factory || visit.name, 255),
      bounded(visit.city, 120),
      bounded(visit.address, 800),
      bounded(visit.owner, 120),
      nullableNumber(visit.ownerId),
      dateValue(visit.date || visit.createdAt),
      coordinate(visit.latitude, -90, 90),
      coordinate(visit.longitude, -180, 180),
      JSON.stringify(visit)
    ]
  );
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object" && !Buffer.isBuffer(value)) return value;
  try { return JSON.parse(Buffer.isBuffer(value) ? value.toString("utf8") : String(value)); } catch { return {}; }
}

function uniqueEntities(items = []) {
  const map = new Map();
  for (const item of items || []) if (item && item.id !== undefined) map.set(String(item.id), item);
  return [...map.values()];
}

function uniqueFollowUps(items = []) {
  const map = new Map();
  for (const item of items || []) {
    if (!item) continue;
    const key = item.sourceKey || `${item.opportunityId || 0}:${item.id || hash(JSON.stringify(item))}`;
    map.set(key, item);
  }
  return [...map.values()];
}

function uniqueIds(items = []) {
  return [...new Set((items || []).map(numberId).filter(Number.isFinite))];
}

function numberId(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && value !== "" && value !== null && value !== undefined ? number : null;
}

function bounded(value, max) {
  const text = String(value ?? "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

function normalizePhone(value) {
  return String(value || "").replace(/^\+?86|^0086/, "").replace(/[^\d]/g, "");
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.max(-999999999999.99, Math.min(999999999999.99, number)) * 100) / 100;
}

function coordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 20000 && value <= 80000) return formatDate(new Date(Math.round((value - 25569) * 86400000)));
    if (value >= 946684800000 && value <= 7258118400000) return formatDate(new Date(value));
    if (value >= 946684800 && value <= 7258118400) return formatDate(new Date(value * 1000));
    return null;
  }
  let text = String(value).trim();
  if (!text) return null;
  if (/^\d{8}$/.test(text)) text = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  text = text.replace(/[年/.]/g, "-").replace(/月/g, "-").replace(/日/g, "").trim();
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return formatDate(new Date(parsed));
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function latestOwnershipAt(opportunity = {}) {
  return [...(opportunity.ownershipHistory || [])]
    .map((item) => item && (item.createdAt || item.at || item.date || item.time))
    .filter(Boolean)
    .sort()
    .pop() || "";
}

function hash(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 24);
}

module.exports = { createMysqlStore };
