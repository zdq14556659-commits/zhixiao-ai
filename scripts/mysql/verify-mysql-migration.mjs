import fs from "fs";
import path from "path";
import process from "process";
import mysql from "mysql2/promise";

const root = path.resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const defaultDataFile = path.join(root, "backend", "data", "db.json");
const dataFile = path.resolve(process.env.DATA_FILE || defaultDataFile);
const databaseUrl = process.env.MYSQL_URL || "";

if (!databaseUrl) {
  console.error("Missing MYSQL_URL. Example: mysql://zhixiao_user:password@127.0.0.1:3306/zhixiao_ai");
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const db = await mysql.createConnection(databaseUrl);

try {
  const checks = [
    ["users", count(state.users)],
    ["customers", count(state.customers)],
    ["opportunities", count(state.opportunities)],
    ["visits", count(state.visits)]
  ];

  let failed = false;
  for (const [table, expected] of checks) {
    const actual = await tableCount(db, table);
    const ok = actual === expected;
    console.log(`${ok ? "OK" : "MISMATCH"} ${table}: mysql=${actual} json=${expected}`);
    if (!ok) failed = true;
  }

  const expectedFollowUps = (state.opportunities || []).reduce((sum, item) => sum + count(item.followUps), 0);
  const actualFollowUps = await tableCount(db, "follow_ups");
  const followOk = actualFollowUps === expectedFollowUps;
  console.log(`${followOk ? "OK" : "MISMATCH"} follow_ups: mysql=${actualFollowUps} json=${expectedFollowUps}`);
  if (!followOk) failed = true;

  const duplicatePhones = await queryValue(db, `
    SELECT COUNT(*) FROM (
      SELECT phone_normalized FROM customers
      WHERE phone_normalized IS NOT NULL AND phone_normalized <> ''
      GROUP BY phone_normalized HAVING COUNT(*) > 1
    ) t
  `);
  console.log(`INFO duplicate normalized phones in mysql=${duplicatePhones}`);

  if (failed) process.exit(2);
  console.log("MYSQL_VERIFY_OK");
} finally {
  await db.end();
}

async function tableCount(db, table) {
  const [rows] = await db.query(`SELECT COUNT(*) AS count FROM ${table}`);
  return Number(rows[0].count || 0);
}

async function queryValue(db, sql) {
  const [rows] = await db.query(sql);
  return Number(Object.values(rows[0] || { count: 0 })[0] || 0);
}

function count(items) {
  return Array.isArray(items) ? items.length : 0;
}
