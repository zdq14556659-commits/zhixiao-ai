import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import {
  assertFollowUpProjectionComplete,
  collectProjectedFollowUps
} from "../scripts/mysql/followup-projection.mjs";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "zhixiao-follow-projection-"));
try {
  const dataFile = path.join(temp, "db.json");
  const followDir = path.join(temp, "followups");
  fs.mkdirSync(followDir, { recursive: true });
  fs.writeFileSync(dataFile, "{}", "utf8");
  fs.writeFileSync(path.join(followDir, "2026-07.jsonl"), [
    JSON.stringify({ id: "external-1", opportunityId: "001001", customerId: "2001", note: "外置跟进", date: "2026-07-23" }),
    JSON.stringify({ id: "external-2", opportunityId: 1001, customerId: 2001, note: "第二条跟进", date: "2026-07-24" })
  ].join("\n") + "\n", "utf8");

  const state = {
    opportunities: [{
      id: 1001,
      customerId: 2001,
      followUps: [{ id: "inline-1", note: "内嵌跟进", date: "2026-07-22" }]
    }]
  };
  const projection = collectProjectedFollowUps(state, dataFile);
  assertFollowUpProjectionComplete(projection.stats);
  assert.equal(projection.entries.length, 3);
  assert.equal(projection.stats.inlineRead, 1);
  assert.equal(projection.stats.externalRead, 2);
  assert.equal(projection.stats.orphaned, 0);
  assert.ok(projection.entries.every((item) => item.opportunityId === 1001));

  const inlineOnlyFile = path.join(temp, "inline-only", "db.json");
  fs.mkdirSync(path.dirname(inlineOnlyFile), { recursive: true });
  fs.writeFileSync(inlineOnlyFile, "{}", "utf8");
  const inlineOnly = collectProjectedFollowUps(state, inlineOnlyFile);
  assert.equal(inlineOnly.entries.length, 1);
  assertFollowUpProjectionComplete(inlineOnly.stats);

  console.log("mysql follow-up projection tests passed");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
