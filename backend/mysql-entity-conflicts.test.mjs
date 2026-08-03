import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import {
  analyzeMysqlEntityConflicts,
  assertMysqlEntityConflictFree,
  formatMysqlEntityConflictDetails,
  formatMysqlEntityConflictSummary,
  formatMysqlEntityRepairSummary,
  repairMysqlEntityConflicts
} from "../scripts/mysql/entity-conflicts.mjs";

const clean = analyzeMysqlEntityConflicts({
  customers: [
    { id: 1, phone: "13800000001" },
    { id: 2, phoneNormalized: "13800000002" }
  ],
  opportunities: [{ id: 10 }, { id: 11 }]
});
assert.equal(clean.projectedCustomers, 2);
assert.equal(clean.projectedOpportunities, 2);
assert.doesNotThrow(() => assertMysqlEntityConflictFree(clean));

const conflicted = analyzeMysqlEntityConflicts({
  customers: [
    { id: "001", phone: "+86 138-0000-0001" },
    { id: 1, phone: "13800000002" },
    { id: 2, phoneNormalized: "13800000001" },
    { id: "bad-id", phone: "13800000003" }
  ],
  opportunities: [
    { id: 10 },
    { id: "010" },
    { id: "" }
  ]
});
assert.equal(conflicted.customerDuplicateIdRows, 1);
assert.equal(conflicted.customerDuplicatePhoneRows, 1);
assert.equal(conflicted.invalidCustomerIds.length, 1);
assert.equal(conflicted.projectedCustomers, 2);
assert.equal(conflicted.opportunityDuplicateIdRows, 1);
assert.equal(conflicted.invalidOpportunityIds.length, 1);
assert.equal(conflicted.projectedOpportunities, 2);
assert.throws(() => assertMysqlEntityConflictFree(conflicted), /preflight found/);

const details = formatMysqlEntityConflictDetails(conflicted);
assert.ok(details.some((line) => line.includes("type=customer_id key=1")));
assert.ok(details.some((line) => line.includes("type=customer_phone hash=")));
assert.ok(details.some((line) => line.includes("type=opportunity_id key=10")));
assert.ok(!details.some((line) => line.includes("13800000001")));
assert.ok(formatMysqlEntityConflictSummary(conflicted).includes("projectedCustomers=2"));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-entity-conflicts-"));
try {
  const dataFile = path.join(temp, "db.json");
  const followDir = path.join(temp, "followups");
  fs.mkdirSync(followDir, { recursive: true });
  fs.writeFileSync(dataFile, "{}", "utf8");
  fs.writeFileSync(path.join(followDir, "2026-08.jsonl"), [
    JSON.stringify({ opportunityId: 10, note: "conflicted opportunity follow" }),
    JSON.stringify({ opportunityId: 99, note: "unrelated follow" })
  ].join("\n"), "utf8");
  const externalSource = {
    customers: [{ id: 1, ownerId: 8 }, { id: 1, ownerId: 9 }],
    opportunities: [
      { id: 10, customerId: 1, ownerId: 8 },
      { id: 10, customerId: 1, ownerId: 9 }
    ]
  };
  const withExternal = analyzeMysqlEntityConflicts(externalSource, { sourceFile: dataFile });
  assert.equal(withExternal.customerRelations.length, 1);
  assert.equal(withExternal.customerRelations[0].opportunities.length, 2);
  assert.notEqual(
    withExternal.customerRelations[0].customers[0].compatibilityHash,
    withExternal.customerRelations[0].customers[1].compatibilityHash
  );
  assert.equal(withExternal.externalFollowUpConflicts.length, 1);
  assert.equal(withExternal.externalFollowUpConflicts[0].entries.length, 1);
  assert.ok(formatMysqlEntityConflictDetails(withExternal).some((line) => line.includes("type=customer_relation")));
  assert.ok(formatMysqlEntityConflictDetails(withExternal).some((line) => line.includes("type=duplicate_opportunity_external_follows")));
  assert.throws(
    () => repairMysqlEntityConflicts(externalSource, { sourceFile: dataFile }),
    /external follow-ups/
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

const repairSource = {
  customers: [
    { id: 100, phone: "13800000001", ownerId: 8, contacts: [{ id: "100-contact-1" }] },
    { id: 100, phone: "13800000002", ownerId: 9, contacts: [{ id: "100-contact-1" }] }
  ],
  opportunities: [
    { id: 101, customerId: 100, ownerId: 8, followUps: [{ id: "follow-a", customerId: 100, opportunityId: 101 }] },
    { id: 101, customerId: 100, ownerId: 9, followUps: [{ id: "follow-b", customerId: 100, opportunityId: 101 }] },
    { id: 102, customerId: 100, ownerId: 8, followUps: [{ id: "follow-c" }] }
  ],
  visits: [
    { id: 201, customerId: 100, opportunityId: 101, phone: "13800000001" },
    { id: 202, customerId: 100, opportunityId: 101, phone: "13800000002" }
  ],
  activities: [
    { id: 301, customerId: 100, opportunityId: 101, ownerId: 8 },
    { id: 302, customerId: 100, opportunityId: 101, ownerId: 9 }
  ]
};
const repaired = repairMysqlEntityConflicts(repairSource);
assert.equal(repaired.state.customers.length, 2);
assert.equal(repaired.state.opportunities.length, 3);
assert.deepEqual(repaired.state.customers.map((item) => item.id), [100, 101]);
// Customer lookup preserves the first occurrence; opportunity lookup preserves
// the last occurrence, matching the existing runtime indexes.
assert.deepEqual(repaired.state.opportunities.map((item) => item.id), [103, 101, 102]);
assert.deepEqual(repaired.state.opportunities.map((item) => item.customerId), [100, 101, 100]);
assert.equal(repaired.state.opportunities[0].followUps[0].opportunityId, 103);
assert.equal(repaired.state.opportunities[1].followUps[0].customerId, 101);
assert.equal(repaired.state.customers[1].contacts[0].id, "101-contact-1");
assert.deepEqual(repaired.state.visits.map((item) => [item.customerId, item.opportunityId]), [[100, 103], [101, 101]]);
assert.deepEqual(repaired.state.activities.map((item) => item.opportunityId), [103, 101]);
assert.equal(repaired.repairs.customersRekeyed.length, 1);
assert.equal(repaired.repairs.opportunitiesRekeyed.length, 1);
assert.ok(formatMysqlEntityRepairSummary(repaired).includes("customersRekeyed=1"));
assert.doesNotThrow(() => assertMysqlEntityConflictFree(analyzeMysqlEntityConflicts(repaired.state)));
assert.deepEqual(repairSource.customers.map((item) => item.id), [100, 100]);

assert.throws(() => repairMysqlEntityConflicts({
  customers: [{ id: 1, ownerId: 8 }],
  opportunities: [
    { id: 10, customerId: 1, ownerId: 8 },
    { id: 10, customerId: 1, ownerId: 9 }
  ]
}), /cannot be distinguished by customer relation/);

console.log("mysql entity conflict tests passed");
