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
  for (const opportunity of source.opportunities || []) await upsertOpportunity(db, opportunity);
  for (const follow of collectFollowUps(source, dataFile)) await upsertFollowUp(db, follow);
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
      fieldText(role.name, 80, "role", role.id, "name"),
      fieldText(role.customerScope, 40, "role", role.id, "customer_scope"),
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
      fieldText(unit.name, 160, "unit", unit.id, "name"),
      fieldText(unit.parentId, 80, "unit", unit.id, "parent_id"),
      fieldText(unit.type, 40, "unit", unit.id, "type"),
      nullableNumber(unit.level),
      fieldText(unit.path || unit.orgPath, 800, "unit", unit.id, "path_text"),
      fieldText(unit.zone, 80, "unit", unit.id, "zone"),
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
      fieldText(user.account, 80, "user", user.id, "account"),
      fieldText(user.username, 80, "user", user.id, "username"),
      fieldText(user.phone, 40, "user", user.id, "phone"),
      fieldText(user.name, 120, "user", user.id, "name"),
      fieldText(user.role, 80, "user", user.id, "role"),
      fieldText(user.roleId, 80, "user", user.id, "role_id"),
      fieldText(user.unitId, 80, "user", user.id, "unit_id"),
      fieldText(user.unit, 160, "user", user.id, "unit"),
      fieldText(user.zone, 80, "user", user.id, "zone"),
      fieldText(user.orgPath || user.path, 800, "user", user.id, "org_path"),
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
      fieldText(customer.name, 255, "customer", customerId, "name"),
      phone,
      phoneNormalized,
      fieldText(customer.city, 120, "customer", customerId, "city"),
      fieldText(customer.address, 800, "customer", customerId, "address"),
      fieldText(customer.channelSource, 120, "customer", customerId, "channel_source"),
      fieldText(customer.createdBy, 120, "customer", customerId, "created_by"),
      nullableNumber(customer.createdById),
      fieldText(customer.owner, 120, "customer", customerId, "owner"),
      nullableNumber(customer.ownerId),
      fieldText(customer.unitId, 80, "customer", customerId, "unit_id"),
      fieldText(customer.unit, 160, "customer", customerId, "unit"),
      fieldText(customer.zone, 80, "customer", customerId, "zone"),
      fieldText(customer.lifecycleStatus, 40, "customer", customerId, "lifecycle_status"),
      dateValue(customer.createdAt),
      dateValue(customer.updatedAt),
      JSON.stringify(customer)
    ]
  );
}

async function upsertOpportunity(db, opportunity) {
  const opportunityId = number(opportunity.id);
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
      opportunityId,
      number(opportunity.customerId),
      fieldText(opportunity.stage, 60, "opportunity", opportunityId, "stage"),
      fieldText(opportunity.productId, 80, "opportunity", opportunityId, "product_id"),
      fieldText(opportunity.productName, 160, "opportunity", opportunityId, "product_name"),
      fieldText(opportunity.owner, 120, "opportunity", opportunityId, "owner"),
      nullableNumber(opportunity.ownerId),
      fieldText(opportunity.followPerson, 120, "opportunity", opportunityId, "follow_person"),
      fieldText(opportunity.createdBy, 120, "opportunity", opportunityId, "created_by"),
      nullableNumber(opportunity.createdById),
      fieldText(opportunity.unitId, 80, "opportunity", opportunityId, "unit_id"),
      fieldText(opportunity.unit, 160, "opportunity", opportunityId, "unit"),
      fieldText(opportunity.zone, 80, "opportunity", opportunityId, "zone"),
      fieldText(opportunity.ownershipStatus, 60, "opportunity", opportunityId, "ownership_status"),
      fieldText(opportunity.lifecycleStatus, 60, "opportunity", opportunityId, "lifecycle_status"),
      fieldText(opportunity.outcomeStatus, 60, "opportunity", opportunityId, "outcome_status"),
      dateValue(opportunity.publicPoolAt),
      dateValue(opportunity.assignedAt || latestOwnershipAt(opportunity)),
      dateValue(opportunity.lastFollow || latestFollow(opportunity)?.date),
      dateValue(opportunity.nextFollow || latestFollow(opportunity)?.nextFollow),
      dateValue(opportunity.createdAt),
      dateValue(opportunity.updatedAt),
      money(opportunity.amount, `opportunity=${opportunityId} field=amount`),
      money(opportunity.contractAmount, `opportunity=${opportunityId} field=contract_amount`),
      money(opportunity.paymentAmount, `opportunity=${opportunityId} field=payment_amount`),
      JSON.stringify(opportunity)
    ]
  );
}

async function upsertFollowUp(db, follow) {
  const customerId = nullableNumber(follow.customerId);
  const opportunityId = nullableNumber(follow.opportunityId);
  const sourceKey = follow.sourceKey;
  await db.execute(
    `INSERT INTO follow_ups (source_key, opportunity_id, customer_id, follow_date, next_follow_at, author, author_id, note, is_manual, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE opportunity_id=VALUES(opportunity_id), customer_id=VALUES(customer_id),
       follow_date=VALUES(follow_date), next_follow_at=VALUES(next_follow_at), author=VALUES(author),
       author_id=VALUES(author_id), note=VALUES(note), is_manual=VALUES(is_manual), data=VALUES(data)`,
    [
      boundedText(sourceKey, 160, `opportunity=${opportunityId} field=follow_source_key`),
      opportunityId,
      customerId,
      dateValue(follow.createdAt || follow.date),
      dateValue(follow.nextFollow),
      fieldText(follow.author || follow.owner || follow.followPerson, 120, "follow", sourceKey, "author"),
      nullableNumber(follow.authorId || follow.ownerId),
      text(follow.note),
      isManualFollow(follow) ? 1 : 0,
      JSON.stringify(follow)
    ]
  );
}

function collectFollowUps(source, sourceFile) {
  const opportunityById = new Map((source.opportunities || []).map((item) => [Number(item.id), item]));
  const collected = new Map();
  const add = (raw = {}, fallback = {}) => {
    const opportunityId = nullableNumber(raw.opportunityId ?? fallback.opportunityId);
    if (!opportunityId || !opportunityById.has(opportunityId)) return;
    const opportunity = opportunityById.get(opportunityId) || {};
    const customerId = nullableNumber(raw.customerId ?? fallback.customerId ?? opportunity.customerId);
    const identity = raw.id || hash([
      raw.createdAt || raw.date || "",
      raw.author || raw.owner || raw.followPerson || "",
      raw.note || "",
      raw.nextFollow || ""
    ].join("|"));
    const sourceKey = `follow:${opportunityId}:${identity}`;
    if (collected.has(sourceKey)) return;
    collected.set(sourceKey, { ...raw, opportunityId, customerId, sourceKey });
  };

  for (const opportunity of source.opportunities || []) {
    for (const follow of opportunity.followUps || []) {
      add(follow, { opportunityId: opportunity.id, customerId: opportunity.customerId });
    }
  }

  const followDir = path.join(path.dirname(sourceFile), "followups");
  if (fs.existsSync(followDir)) {
    for (const name of fs.readdirSync(followDir).filter((item) => item.endsWith(".jsonl")).sort()) {
      const file = path.join(followDir, name);
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
      lines.forEach((line, index) => {
        try {
          add(JSON.parse(line), { sourceKey: `${name}:${index + 1}` });
        } catch {
          projectionWarnings.push(`followup file=${name} line=${index + 1} malformed and skipped`);
        }
      });
    }
  }
  console.log(`MYSQL_FOLLOWUPS_COLLECTED count=${collected.size}`);
  return [...collected.values()];
}

async function upsertVisit(db, visit) {
  const visitId = number(visit.id);
  await db.execute(
    `INSERT INTO visits (id, customer_id, opportunity_id, factory, city, address, owner, owner_id, visit_date, latitude, longitude, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id), opportunity_id=VALUES(opportunity_id), factory=VALUES(factory),
       city=VALUES(city), address=VALUES(address), owner=VALUES(owner), owner_id=VALUES(owner_id), visit_date=VALUES(visit_date),
       latitude=VALUES(latitude), longitude=VALUES(longitude), data=VALUES(data)`,
    [
      visitId,
      nullableNumber(visit.customerId),
      nullableNumber(visit.opportunityId),
      fieldText(visit.factory || visit.name, 255, "visit", visitId, "factory"),
      fieldText(visit.city, 120, "visit", visitId, "city"),
      fieldText(visit.address, 800, "visit", visitId, "address"),
      fieldText(visit.owner, 120, "visit", visitId, "owner"),
      nullableNumber(visit.ownerId),
      dateValue(visit.date || visit.createdAt),
      coordinate(visit.latitude, -90, 90, `visit=${visitId} field=latitude`),
      coordinate(visit.longitude, -180, 180, `visit=${visitId} field=longitude`),
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
        boundedText(type, 60, `dictionary=${type}:${object.id || index} field=type`),
        asId(object.id || object.name || `${type}-${index}`),
        fieldText(object.name || object.question || object.title || object.id, 200, "dictionary", object.id || index, "name"),
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
      boundedText(sourceKey, 160, `audit=${item.id || "generated"} field=source_key`),
      fieldText(item.type || item.action || type, 100, "audit", item.id, "event_type"),
      fieldText(item.actor || item.owner || item.operator, 120, "audit", item.id, "actor"),
      nullableNumber(item.actorId || item.ownerId || item.operatorId),
      fieldText(item.customerId || item.opportunityId || item.targetId, 120, "audit", item.id, "target_id"),
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

function fieldText(value, maxLength, entityType, entityId, field) {
  return boundedText(value, maxLength, `${entityType}=${entityId ?? "unknown"} field=${field}`);
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 20_000 && value <= 80_000) {
      return formatUtcDate(new Date(Math.round((value - 25_569) * 86_400_000)));
    }
    if (value >= 946_684_800_000 && value <= 7_258_118_400_000) {
      return formatUtcDate(new Date(value));
    }
    if (value >= 946_684_800 && value <= 7_258_118_400) {
      return formatUtcDate(new Date(value * 1000));
    }
    return null;
  }

  let textValue = String(value).trim();
  if (!textValue) return null;

  if (/^\d{8}$/.test(textValue)) {
    textValue = `${textValue.slice(0, 4)}-${textValue.slice(4, 6)}-${textValue.slice(6, 8)}`;
  }

  const normalized = textValue
    .replace(/[年/.]/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace("T", " ")
    .replace(/\.\d+(?=Z|[+-]\d{2}:?\d{2}$|$)/, "")
    .replace(/Z$/, "")
    .replace(/[+-]\d{2}:?\d{2}$/, "")
    .trim();

  const match = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText = "0", minuteText = "0", secondText = "0"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    year < 1900 || year > 2200 ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day ||
    probe.getUTCHours() !== hour ||
    probe.getUTCMinutes() !== minute ||
    probe.getUTCSeconds() !== second
  ) {
    return null;
  }
  return formatDateParts(year, month, day, hour, minute, second);
}

function formatUtcDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return formatDateParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  );
}

function formatDateParts(year, month, day, hour, minute, second) {
  const pad = (numberValue) => String(numberValue).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback ? 1 : 0;
  return value === false || value === 0 || value === "0" ? 0 : 1;
}

function money(value, context = "money") {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue)) {
    projectionWarnings.push(`${context} invalid numeric value omitted, original preserved in data`);
    return 0;
  }
  const maxValue = 999_999_999_999.99;
  if (Math.abs(numberValue) > maxValue) {
    projectionWarnings.push(`${context} exceeds DECIMAL(14,2); projected value set to 0, original preserved in data`);
    return 0;
  }
  return Math.round(numberValue * 100) / 100;
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

function coordinate(value, min, max, context) {
  const numberValue = nullableNumber(value);
  if (numberValue === null) return null;
  if (numberValue < min || numberValue > max) {
    projectionWarnings.push(`${context} out of range; projected value omitted, original preserved in data`);
    return null;
  }
  return numberValue;
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
