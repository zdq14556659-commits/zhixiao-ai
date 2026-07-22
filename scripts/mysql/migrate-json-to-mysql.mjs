import fs from "fs";
import path from "path";
import process from "process";
import mysql from "mysql2/promise";

const root = path.resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const defaultDataFile = path.join(root, "backend", "data", "db.json");
const dataFile = path.resolve(process.env.DATA_FILE || defaultDataFile);
const databaseUrl = process.env.MYSQL_URL || "";
const reset = process.argv.includes("--reset");
const snapshot = process.argv.includes("--snapshot");
const projectionWarnings = [];

if (!databaseUrl) {
  fail("Missing MYSQL_URL. Example: mysql://zhixiao_user:password@127.0.0.1:3306/zhixiao_ai");
}

if (!fs.existsSync(dataFile)) {
  fail(`DATA_FILE not found: ${dataFile}`);
}

const state = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const connection = await mysql.createConnection(databaseUrl);

try {
  await connection.beginTransaction();
  if (reset) await resetTables(connection);
  await importState(connection, state);
  if (snapshot) {
    await connection.execute(
      "INSERT INTO raw_state_snapshots (source_file, state_version, data) VALUES (?, ?, ?)",
      [dataFile, String(state.version || ""), JSON.stringify(state)]
    );
  }
  await connection.commit();
  if (projectionWarnings.length) {
    console.warn(`MYSQL_IMPORT_WARNINGS count=${projectionWarnings.length}`);
    for (const warning of projectionWarnings.slice(0, 20)) console.warn(`WARN ${warning}`);
    if (projectionWarnings.length > 20) {
      console.warn(`WARN ${projectionWarnings.length - 20} additional projection warnings omitted`);
    }
  }
  console.log(`MYSQL_IMPORT_OK customers=${count(state.customers)} opportunities=${count(state.opportunities)} users=${count(state.users)}`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}

async function importState(db, source) {
  await upsertMeta(db, "stateVersion", source.version || "");
  await upsertMeta(db, "moneyUnit", source.moneyUnit || "");
  await upsertMeta(db, "businessRules", source.businessRules || {});
  await upsertMeta(db, "stages", source.stages || []);
  await upsertMeta(db, "zones", source.zones || []);

  await upsertDictionary(db, "channelSource", source.channelSources || []);
  await upsertDictionary(db, "product", source.products || []);
  await upsertDictionary(db, "competitor", source.competitors || []);
  await upsertDictionary(db, "lossReason", source.lossReasons || []);
  await upsertDictionary(db, "knowledge", source.knowledge || []);
  await upsertDictionary(db, "resource", source.resources || []);
  await upsertDictionary(db, "target", source.targets || []);

  for (const role of source.roles || []) await upsertRole(db, role);
  for (const unit of source.units || []) await upsertUnit(db, unit);
  for (const user of source.users || []) await upsertUser(db, user);
  for (const customer of source.customers || []) await upsertCustomer(db, customer);
  for (const opportunity of source.opportunities || []) {
    await upsertOpportunity(db, opportunity);
    await upsertFollowUps(db, opportunity);
  }
  for (const visit of source.visits || []) await upsertVisit(db, visit);
  for (const activity of source.activities || []) await upsertAudit(db, "activity", activity);
  for (const log of source.securityLogs || []) await upsertAudit(db, "securityLog", log);
}

async function upsertMeta(db, key, value) {
  await db.execute(
    "INSERT INTO app_meta (meta_key, meta_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)",
    [key, JSON.stringify(value)]
  );
}

async function upsertRole(db, role) {
  await db.execute(
    `INSERT INTO roles (id, name, customer_scope, active, data)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), customer_scope=VALUES(customer_scope), active=VALUES(active), data=VALUES(data)`,
    [
      asId(role.id || role.name),
      text(role.name),
      text(role.customerScope),
      bool(role.active, true),
      JSON.stringify(role)
    ]
  );
}

async function upsertUnit(db, unit) {
  await db.execute(
    `INSERT INTO org_units (id, name, parent_id, type, level_no, path_text, zone, sort_no, active, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), parent_id=VALUES(parent_id), type=VALUES(type), level_no=VALUES(level_no),
       path_text=VALUES(path_text), zone=VALUES(zone), sort_no=VALUES(sort_no), active=VALUES(active), data=VALUES(data)`,
    [
      asId(unit.id || unit.name),
      text(unit.name),
      text(unit.parentId),
      text(unit.type),
      nullableNumber(unit.level),
      text(unit.path || unit.orgPath),
      text(unit.zone),
      number(unit.sort),
      bool(unit.active, true),
      JSON.stringify(unit)
    ]
  );
}

async function upsertUser(db, user) {
  await db.execute(
    `INSERT INTO users (id, account, username, phone, name, role, role_id, unit_id, unit, zone, org_path, active, auth_version, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE account=VALUES(account), username=VALUES(username), phone=VALUES(phone), name=VALUES(name),
       role=VALUES(role), role_id=VALUES(role_id), unit_id=VALUES(unit_id), unit=VALUES(unit), zone=VALUES(zone),
       org_path=VALUES(org_path), active=VALUES(active), auth_version=VALUES(auth_version), data=VALUES(data)`,
    [
      number(user.id),
      text(user.account),
      text(user.username),
      text(user.phone),
      text(user.name),
      text(user.role),
      text(user.roleId),
      text(user.unitId),
      text(user.unit),
      text(user.zone),
      text(user.orgPath || user.path),
      bool(user.active, true),
      number(user.authVersion),
      JSON.stringify(user)
    ]
  );
}

async function upsertCustomer(db, customer) {
  const customerId = number(customer.id);
  const phone = boundedText(customer.phone, 255, `customer=${customerId} field=phone`);
  const phoneNormalized = normalizedPhoneValue(
    customer.phoneNormalized || normalizePhone(customer.phone),
    customerId
  );
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
      customerId,
      text(customer.name),
      phone,
      phoneNormalized,
      text(customer.city),
      text(customer.address),
      text(customer.channelSource),
      text(customer.createdBy),
      nullableNumber(customer.createdById),
      text(customer.owner),
      nullableNumber(customer.ownerId),
      text(customer.unitId),
      text(customer.unit),
      text(customer.zone),
      text(customer.lifecycleStatus),
      dateValue(customer.createdAt),
      dateValue(customer.updatedAt),
      JSON.stringify(customer)
    ]
  );
}

async function upsertOpportunity(db, opportunity) {
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
      number(opportunity.id),
      number(opportunity.customerId),
      text(opportunity.stage),
      text(opportunity.productId),
      text(opportunity.productName),
      text(opportunity.owner),
      nullableNumber(opportunity.ownerId),
      text(opportunity.followPerson),
      text(opportunity.createdBy),
      nullableNumber(opportunity.createdById),
      text(opportunity.unitId),
      text(opportunity.unit),
      text(opportunity.zone),
      text(opportunity.ownershipStatus),
      text(opportunity.lifecycleStatus),
      text(opportunity.outcomeStatus),
      dateValue(opportunity.publicPoolAt),
      dateValue(opportunity.assignedAt || latestOwnershipAt(opportunity)),
      dateValue(opportunity.lastFollow || latestFollow(opportunity)?.date),
      dateValue(opportunity.nextFollow || latestFollow(opportunity)?.nextFollow),
      dateValue(opportunity.createdAt),
      dateValue(opportunity.updatedAt),
      money(opportunity.amount),
      money(opportunity.contractAmount),
      money(opportunity.paymentAmount),
      JSON.stringify(opportunity)
    ]
  );
}

async function upsertFollowUps(db, opportunity) {
  const customerId = nullableNumber(opportunity.customerId);
  const opportunityId = nullableNumber(opportunity.id);
  const followUps = opportunity.followUps || [];
  for (let index = 0; index < followUps.length; index += 1) {
    const follow = followUps[index] || {};
    const sourceKey = `opportunity:${opportunityId}:follow:${follow.id || index}:${follow.date || ""}:${hash(follow.note || "")}`;
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
        dateValue(follow.date),
        dateValue(follow.nextFollow),
        text(follow.author || follow.owner || follow.followPerson),
        nullableNumber(follow.authorId || follow.ownerId),
        text(follow.note),
        isManualFollow(follow) ? 1 : 0,
        JSON.stringify(follow)
      ]
    );
  }
}

async function upsertVisit(db, visit) {
  await db.execute(
    `INSERT INTO visits (id, customer_id, opportunity_id, factory, city, address, owner, owner_id, visit_date, latitude, longitude, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id), opportunity_id=VALUES(opportunity_id), factory=VALUES(factory),
       city=VALUES(city), address=VALUES(address), owner=VALUES(owner), owner_id=VALUES(owner_id), visit_date=VALUES(visit_date),
       latitude=VALUES(latitude), longitude=VALUES(longitude), data=VALUES(data)`,
    [
      number(visit.id),
      nullableNumber(visit.customerId),
      nullableNumber(visit.opportunityId),
      text(visit.factory || visit.name),
      text(visit.city),
      text(visit.address),
      text(visit.owner),
      nullableNumber(visit.ownerId),
      dateValue(visit.date || visit.createdAt),
      nullableNumber(visit.latitude),
      nullableNumber(visit.longitude),
      JSON.stringify(visit)
    ]
  );
}

async function upsertDictionary(db, type, items) {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const object = typeof item === "string" ? { id: `${type}-${hash(item)}`, name: item, active: true, sort: index } : item;
    await db.execute(
      `INSERT INTO dictionary_items (type, id, name, active, sort_no, data)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), active=VALUES(active), sort_no=VALUES(sort_no), data=VALUES(data)`,
      [
        type,
        asId(object.id || object.name || `${type}-${index}`),
        text(object.name || object.question || object.title || object.id),
        bool(object.active, true),
        number(object.sort ?? index),
        JSON.stringify(object)
      ]
    );
  }
}

async function upsertAudit(db, type, item) {
  const sourceKey = `${type}:${item.id || hash(JSON.stringify(item))}`;
  await db.execute(
    `INSERT INTO audit_events (source_key, event_type, actor, actor_id, target_id, event_at, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE event_type=VALUES(event_type), actor=VALUES(actor), actor_id=VALUES(actor_id),
       target_id=VALUES(target_id), event_at=VALUES(event_at), data=VALUES(data)`,
    [
      sourceKey,
      text(item.type || item.action || type),
      text(item.actor || item.owner || item.operator),
      nullableNumber(item.actorId || item.ownerId || item.operatorId),
      text(item.customerId || item.opportunityId || item.targetId),
      dateValue(item.date || item.time || item.createdAt),
      JSON.stringify(item)
    ]
  );
}

async function resetTables(db) {
  const tables = [
    "raw_state_snapshots",
    "audit_events",
    "visits",
    "follow_ups",
    "opportunities",
    "customers",
    "users",
    "org_units",
    "roles",
    "dictionary_items",
    "app_meta"
  ];
  await db.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of tables) await db.query(`TRUNCATE TABLE ${table}`);
  await db.query("SET FOREIGN_KEY_CHECKS = 1");
}

function latestFollow(opportunity) {
  return [...(opportunity.followUps || [])]
    .filter((item) => item && item.date)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0] || null;
}

function latestOwnershipAt(opportunity) {
  return [...(opportunity.ownershipHistory || [])]
    .map((item) => item && (item.at || item.date || item.time))
    .filter(Boolean)
    .sort()
    .pop() || "";
}

function isManualFollow(follow) {
  const note = String(follow.note || "").trim();
  if (!note) return false;
  const type = String(follow.type || "").toLowerCase();
  return !["system", "import", "assign", "claim", "auto"].includes(type);
}

function normalizePhone(value) {
  return String(value || "").replace(/^\+?86|^0086/, "").replace(/[^\d]/g, "");
}

function normalizedPhoneValue(value, customerId) {
  const normalized = text(value);
  if (!normalized) return null;
  if (normalized.length <= 80) return normalized;
  projectionWarnings.push(
    `customer=${customerId} field=phone_normalized length=${normalized.length}; index value omitted, original preserved in data`
  );
  return null;
}

function boundedText(value, maxLength, context) {
  const textValue = text(value);
  if (!textValue || textValue.length <= maxLength) return textValue;
  projectionWarnings.push(
    `${context} length=${textValue.length}; projected value truncated to ${maxLength}, original preserved in data`
  );
  return textValue.slice(0, maxLength);
}

function dateValue(value) {
  if (!value) return null;
  const textValue = String(value).trim();
  if (!textValue) return null;
  const normalized = textValue.length === 10 ? `${textValue} 00:00:00` : textValue.replace("T", " ").replace(/\.\d+Z$/, "");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return normalized.slice(0, 19);
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback ? 1 : 0;
  return value === false || value === 0 || value === "0" ? 0 : 1;
}

function money(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function number(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function text(value) {
  if (value === undefined || value === null) return null;
  const textValue = String(value).trim();
  return textValue || null;
}

function asId(value) {
  return String(value || "").trim() || `id-${Date.now()}`;
}

function count(items) {
  return Array.isArray(items) ? items.length : 0;
}

function hash(value) {
  let result = 0;
  const textValue = String(value || "");
  for (let index = 0; index < textValue.length; index += 1) {
    result = ((result << 5) - result + textValue.charCodeAt(index)) | 0;
  }
  return Math.abs(result).toString(36);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
