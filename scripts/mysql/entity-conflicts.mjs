import crypto from "crypto";
import fs from "fs";
import path from "path";

export function analyzeMysqlEntityConflicts(source = {}, options = {}) {
  const customers = Array.isArray(source.customers) ? source.customers : [];
  const opportunities = Array.isArray(source.opportunities) ? source.opportunities : [];
  const customerIds = groupProjectedIds(customers);
  const opportunityIds = groupProjectedIds(opportunities);
  const customerPhones = groupCustomerPhones(customers);
  const customerRelations = buildDuplicateCustomerRelations(customers, opportunities, customerIds.duplicates);
  const externalFollowUpConflicts = findExternalFollowUpConflicts(
    options.sourceFile || "",
    opportunityIds.duplicates.map((group) => group.key)
  );

  return {
    customers: customers.length,
    opportunities: opportunities.length,
    projectedCustomers: projectedCustomerCount(customers),
    projectedOpportunities: opportunityIds.uniqueCount,
    customerDuplicateIds: customerIds.duplicates,
    customerDuplicateIdRows: duplicateRowCount(customerIds.duplicates),
    customerDuplicatePhones: customerPhones.duplicates,
    customerDuplicatePhoneRows: duplicateRowCount(customerPhones.duplicates),
    invalidCustomerIds: customerIds.invalid,
    customerRelations,
    opportunityDuplicateIds: opportunityIds.duplicates,
    opportunityDuplicateIdRows: duplicateRowCount(opportunityIds.duplicates),
    invalidOpportunityIds: opportunityIds.invalid,
    externalFollowUpConflicts
  };
}

export function formatMysqlEntityConflictSummary(report = {}) {
  return [
    `customers=${report.customers || 0}`,
    `projectedCustomers=${report.projectedCustomers || 0}`,
    `customerDuplicateIdGroups=${report.customerDuplicateIds?.length || 0}`,
    `customerDuplicateIdRows=${report.customerDuplicateIdRows || 0}`,
    `customerDuplicatePhoneGroups=${report.customerDuplicatePhones?.length || 0}`,
    `customerDuplicatePhoneRows=${report.customerDuplicatePhoneRows || 0}`,
    `invalidCustomerIds=${report.invalidCustomerIds?.length || 0}`,
    `opportunities=${report.opportunities || 0}`,
    `projectedOpportunities=${report.projectedOpportunities || 0}`,
    `opportunityDuplicateIdGroups=${report.opportunityDuplicateIds?.length || 0}`,
    `opportunityDuplicateIdRows=${report.opportunityDuplicateIdRows || 0}`,
    `invalidOpportunityIds=${report.invalidOpportunityIds?.length || 0}`,
    `externalFollowUpsOnDuplicateOpportunities=${(report.externalFollowUpConflicts || []).reduce((sum, group) => sum + group.entries.length, 0)}`
  ].join(" ");
}

export function formatMysqlEntityConflictDetails(report = {}, limit = 50) {
  const lines = [];
  for (const group of report.customerDuplicateIds || []) {
    lines.push(
      `type=customer_id key=${group.key} occurrences=${group.indexes.length} indexes=${group.indexes.join(",")} `
      + `recordHashes=${group.recordHashes.join(",")}`
    );
  }
  for (const group of report.customerDuplicatePhones || []) {
    lines.push(
      `type=customer_phone hash=${group.hash} occurrences=${group.indexes.length} `
      + `customerIds=${group.customerIds.join(",")} indexes=${group.indexes.join(",")} `
      + `recordHashes=${group.recordHashes.join(",")}`
    );
  }
  for (const relation of report.customerRelations || []) {
    lines.push(
      `type=customer_relation key=${relation.key} `
      + `customers=${relation.customers.map((item) => `${item.index}:${item.compatibilityHash}`).join(",")} `
      + `opportunities=${relation.opportunities.map((item) => `${item.index}:${item.id}:${item.compatibilityHash}`).join(",") || "none"}`
    );
  }
  for (const item of report.invalidCustomerIds || []) {
    lines.push(`type=invalid_customer_id value=${safeLogValue(item.value)} index=${item.index}`);
  }
  for (const group of report.opportunityDuplicateIds || []) {
    lines.push(
      `type=opportunity_id key=${group.key} occurrences=${group.indexes.length} indexes=${group.indexes.join(",")} `
      + `customerIds=${group.customerIds.join(",")} recordHashes=${group.recordHashes.join(",")}`
    );
  }
  for (const item of report.invalidOpportunityIds || []) {
    lines.push(`type=invalid_opportunity_id value=${safeLogValue(item.value)} index=${item.index}`);
  }
  for (const group of report.externalFollowUpConflicts || []) {
    lines.push(
      `type=duplicate_opportunity_external_follows key=${group.key} count=${group.entries.length} `
      + `origins=${group.entries.map((entry) => entry.origin).join(",")} `
      + `recordHashes=${group.entries.map((entry) => entry.recordHash).join(",")}`
    );
  }
  return lines.slice(0, Math.max(1, Number(limit) || 50));
}

export function assertMysqlEntityConflictFree(report = {}) {
  const conflictRows = Number(report.customerDuplicateIdRows || 0)
    + Number(report.customerDuplicatePhoneRows || 0)
    + Number(report.opportunityDuplicateIdRows || 0)
    + Number(report.invalidCustomerIds?.length || 0)
    + Number(report.invalidOpportunityIds?.length || 0);
  if (!conflictRows) return;
  throw new Error(
    `MySQL migration preflight found ${conflictRows} conflicting or invalid entity rows; `
    + `projected customers=${report.projectedCustomers}/${report.customers}, `
    + `opportunities=${report.projectedOpportunities}/${report.opportunities}`
  );
}

function groupProjectedIds(items = []) {
  const groups = new Map();
  const invalid = [];
  items.forEach((item, index) => {
    const projected = projectedNumericId(item?.id);
    if (!projected.valid) invalid.push({ index, value: item?.id });
    const indexes = groups.get(projected.key) || [];
    indexes.push(index);
    groups.set(projected.key, indexes);
  });
  return {
    uniqueCount: groups.size,
    invalid,
    duplicates: [...groups.entries()]
      .filter(([, indexes]) => indexes.length > 1)
      .map(([key, indexes]) => ({
        key,
        indexes,
        customerIds: indexes.map((index) => projectedNumericId(items[index]?.customerId).key),
        recordHashes: indexes.map((index) => recordHash(items[index]))
      }))
  };
}

function groupCustomerPhones(customers = []) {
  const groups = new Map();
  customers.forEach((customer, index) => {
    const phone = projectedPhone(customer);
    if (!phone) return;
    const entries = groups.get(phone) || [];
    entries.push({ index, customerId: projectedNumericId(customer?.id).key, recordHash: recordHash(customer) });
    groups.set(phone, entries);
  });
  return {
    duplicates: [...groups.entries()]
      .filter(([, entries]) => entries.length > 1)
      .map(([phone, entries]) => ({
        hash: crypto.createHash("sha256").update(phone).digest("hex").slice(0, 16),
        indexes: entries.map((entry) => entry.index),
        customerIds: entries.map((entry) => entry.customerId),
        recordHashes: entries.map((entry) => entry.recordHash)
      }))
  };
}

function projectedCustomerCount(customers = []) {
  if (!customers.length) return 0;
  const parents = customers.map((_, index) => index);
  const byId = new Map();
  const byPhone = new Map();
  const find = (index) => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  customers.forEach((customer, index) => {
    const id = projectedNumericId(customer?.id).key;
    if (byId.has(id)) union(index, byId.get(id));
    else byId.set(id, index);
    const phone = projectedPhone(customer);
    if (!phone) return;
    if (byPhone.has(phone)) union(index, byPhone.get(phone));
    else byPhone.set(phone, index);
  });
  return new Set(customers.map((_, index) => find(index))).size;
}

function buildDuplicateCustomerRelations(customers, opportunities, duplicateGroups) {
  return duplicateGroups.map((group) => ({
    key: group.key,
    customers: group.indexes.map((index) => ({
      index,
      compatibilityHash: compatibilityHash(customers[index])
    })),
    opportunities: opportunities
      .map((opportunity, index) => ({ opportunity, index }))
      .filter(({ opportunity }) => projectedNumericId(opportunity?.customerId).key === group.key)
      .map(({ opportunity, index }) => ({
        index,
        id: projectedNumericId(opportunity?.id).key,
        compatibilityHash: compatibilityHash(opportunity)
      }))
  }));
}

function findExternalFollowUpConflicts(sourceFile, duplicateOpportunityIds) {
  if (!sourceFile || !duplicateOpportunityIds.length) return [];
  const wanted = new Set(duplicateOpportunityIds);
  const found = new Map();
  const followDir = path.join(path.dirname(sourceFile), "followups");
  if (!fs.existsSync(followDir)) return [];
  for (const name of fs.readdirSync(followDir).filter((item) => item.endsWith(".jsonl")).sort()) {
    const lines = fs.readFileSync(path.join(followDir, name), "utf8").split(/\r?\n/).filter(Boolean);
    lines.forEach((line, index) => {
      let entry;
      try { entry = JSON.parse(line); } catch { return; }
      const key = projectedNumericId(entry?.opportunityId).key;
      if (!wanted.has(key)) return;
      const entries = found.get(key) || [];
      entries.push({ origin: `${name}:${index + 1}`, recordHash: recordHash(entry) });
      found.set(key, entries);
    });
  }
  return [...found.entries()].map(([key, entries]) => ({ key, entries }));
}

function compatibilityHash(value = {}) {
  const fields = [
    "stage", "ownerId", "owner", "followPerson", "unitId", "unit", "zone", "orgPath", "region",
    "createdBy", "createdAt", "assignedAt", "amount", "demoAt", "quoteAmount", "expectedDealDate",
    "contractAmount", "paymentAmount", "paymentDate", "ownershipStatus", "claimUntil", "effectiveFollowUpAt",
    "publicPoolAt", "publicPoolReason", "leadAt", "opportunityAt", "dealAt", "nextFollow", "lastFollow", "lastNote"
  ];
  const projection = Object.fromEntries(fields.map((field) => [field, value?.[field] ?? ""]));
  return recordHash(projection);
}

function projectedNumericId(value) {
  const numberValue = Number(value || 0);
  const valid = Number.isSafeInteger(numberValue) && numberValue > 0;
  return { key: Number.isFinite(numberValue) ? String(numberValue) : "0", valid };
}

function projectedPhone(customer = {}) {
  const value = String(customer.phoneNormalized || normalizePhone(customer.phone) || "").trim();
  return value && value.length <= 80 ? value : "";
}

function normalizePhone(value) {
  return String(value || "").replace(/^\+?86|^0086/, "").replace(/[^\d]/g, "");
}

function duplicateRowCount(groups = []) {
  return groups.reduce((total, group) => total + Math.max(0, group.indexes.length - 1), 0);
}

function recordHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value || {})).digest("hex").slice(0, 16);
}

function safeLogValue(value) {
  return JSON.stringify(value === undefined ? null : value).slice(0, 120);
}
