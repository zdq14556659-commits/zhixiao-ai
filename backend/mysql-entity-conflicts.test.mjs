import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import {
  analyzeMysqlEntityConflicts,
  assertMysqlEntityConflictFree,
  formatMysqlEntityConflictDetails,
  formatMysqlEntityConflictSummary
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
  const withExternal = analyzeMysqlEntityConflicts({
    customers: [{ id: 1, ownerId: 8 }, { id: 1, ownerId: 9 }],
    opportunities: [
      { id: 10, customerId: 1, ownerId: 8 },
      { id: 10, customerId: 1, ownerId: 9 }
    ]
  }, { sourceFile: dataFile });
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
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log("mysql entity conflict tests passed");
