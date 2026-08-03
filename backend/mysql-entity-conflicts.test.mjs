import assert from "assert";
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

console.log("mysql entity conflict tests passed");
