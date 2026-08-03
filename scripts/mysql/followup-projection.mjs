import crypto from "crypto";
import fs from "fs";
import path from "path";

export function collectProjectedFollowUps(source = {}, sourceFile = "", options = {}) {
  const warn = typeof options.warn === "function" ? options.warn : () => {};
  const opportunities = Array.isArray(source.opportunities) ? source.opportunities : [];
  const opportunityById = new Map();
  const collected = new Map();
  const stats = {
    opportunities: opportunities.length,
    inlineRead: 0,
    externalRead: 0,
    accepted: 0,
    duplicates: 0,
    missingOpportunityId: 0,
    orphaned: 0,
    malformed: 0,
    files: 0
  };

  for (const opportunity of opportunities) {
    const key = canonicalId(opportunity?.id);
    if (key) opportunityById.set(key, opportunity);
  }

  const add = (raw = {}, fallback = {}, origin = "inline") => {
    const opportunityKey = canonicalId(firstMeaningful(raw.opportunityId, fallback.opportunityId));
    if (!opportunityKey) {
      stats.missingOpportunityId += 1;
      return;
    }
    const opportunity = opportunityById.get(opportunityKey);
    if (!opportunity) {
      stats.orphaned += 1;
      return;
    }
    const opportunityId = numericId(opportunity.id);
    const customerId = nullableNumericId(firstMeaningful(raw.customerId, fallback.customerId, opportunity.customerId));
    const identity = meaningfulText(raw.id) || hash([
      raw.createdAt || raw.date || "",
      raw.author || raw.owner || raw.followPerson || "",
      raw.note || "",
      raw.nextFollow || ""
    ].join("|"));
    const sourceKey = `follow:${opportunityKey}:${identity}`;
    if (collected.has(sourceKey)) {
      stats.duplicates += 1;
      return;
    }
    collected.set(sourceKey, { ...raw, opportunityId, customerId, sourceKey, migrationOrigin: origin });
  };

  for (const opportunity of opportunities) {
    const follows = Array.isArray(opportunity?.followUps) ? opportunity.followUps : [];
    for (const follow of follows) {
      stats.inlineRead += 1;
      add(follow, { opportunityId: opportunity.id, customerId: opportunity.customerId }, "inline");
    }
  }

  const followDir = path.join(path.dirname(sourceFile), "followups");
  if (sourceFile && fs.existsSync(followDir)) {
    const files = fs.readdirSync(followDir).filter((item) => item.endsWith(".jsonl")).sort();
    stats.files = files.length;
    for (const name of files) {
      const file = path.join(followDir, name);
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
      lines.forEach((line, index) => {
        stats.externalRead += 1;
        try {
          add(JSON.parse(line), {}, `external:${name}:${index + 1}`);
        } catch {
          stats.malformed += 1;
          warn(`followup file=${name} line=${index + 1} malformed and skipped`);
        }
      });
    }
  }

  stats.accepted = collected.size;
  return { entries: [...collected.values()], stats };
}

export function formatFollowUpProjectionStats(stats = {}) {
  return [
    `opportunities=${stats.opportunities || 0}`,
    `files=${stats.files || 0}`,
    `inlineRead=${stats.inlineRead || 0}`,
    `externalRead=${stats.externalRead || 0}`,
    `accepted=${stats.accepted || 0}`,
    `duplicates=${stats.duplicates || 0}`,
    `missingOpportunityId=${stats.missingOpportunityId || 0}`,
    `orphaned=${stats.orphaned || 0}`,
    `malformed=${stats.malformed || 0}`
  ].join(" ");
}

export function assertFollowUpProjectionComplete(stats = {}) {
  const invalid = Number(stats.missingOpportunityId || 0)
    + Number(stats.orphaned || 0)
    + Number(stats.malformed || 0);
  const read = Number(stats.inlineRead || 0) + Number(stats.externalRead || 0);
  const accounted = Number(stats.accepted || 0) + Number(stats.duplicates || 0) + invalid;
  if (accounted !== read) {
    throw new Error(`Follow-up projection accounting mismatch: read=${read} accounted=${accounted}`);
  }
  if (invalid > 0) {
    throw new Error(
      `Follow-up projection would lose ${invalid} records: missingOpportunityId=${stats.missingOpportunityId || 0} `
      + `orphaned=${stats.orphaned || 0} malformed=${stats.malformed || 0}`
    );
  }
}

function firstMeaningful(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function meaningfulText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function canonicalId(value) {
  const text = meaningfulText(value);
  if (!text) return "";
  if (/^[+-]?\d+(?:\.0+)?$/.test(text)) {
    return text.replace(/^\+/, "").replace(/\.0+$/, "").replace(/^(-?)0+(?=\d)/, "$1");
  }
  return text;
}

function numericId(value) {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted) || converted <= 0) {
    throw new Error(`Invalid numeric ID in MySQL projection: ${String(value)}`);
  }
  return converted;
}

function nullableNumericId(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return numericId(value);
}

function hash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 24);
}
