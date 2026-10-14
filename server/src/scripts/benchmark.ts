// Measures the effect of the composite indexes and the stats cache.
// Run `npm run seed -- --bulk` first so there is enough data to matter.
import type { AddressInfo } from "node:net";
import type pg from "pg";
import { createApp } from "../app.ts";
import { config } from "../config.ts";
import { createPool } from "../db.ts";

const RUNS = 200;
const pool = createPool(config.databaseUrl);

const INDEXES = [
  "idx_applications_user_status",
  "idx_applications_user_applied",
  "idx_applications_company",
  "idx_interviews_application",
];

const listQuery = `
  SELECT a.id, a.role_title, a.status, a.applied_on, c.name AS company_name,
         COUNT(*) OVER()::int AS total_count
  FROM applications a
  JOIN companies c ON c.id = a.company_id
  WHERE a.user_id = $1 AND a.status = $2
  ORDER BY a.applied_on DESC NULLS LAST, a.id DESC
  LIMIT 20`;

const statusQuery = `
  SELECT status, COUNT(*)::int AS count
  FROM applications WHERE user_id = $1
  GROUP BY status`;

function avg(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function timeQueries(client: pg.PoolClient, userIds: number[]) {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const userId = userIds[i % userIds.length];
    const start = performance.now();
    await client.query(listQuery, [userId, "applied"]);
    await client.query(statusQuery, [userId]);
    times.push(performance.now() - start);
  }
  return avg(times);
}

async function benchmarkIndexes(userIds: number[]) {
  const client = await pool.connect();
  try {
    await timeQueries(client, userIds); // warm up
    const withIndexes = await timeQueries(client, userIds);

    // DDL is transactional in Postgres, so the indexes come back on ROLLBACK
    await client.query("BEGIN");
    for (const name of INDEXES) await client.query(`DROP INDEX ${name}`);
    const withoutIndexes = await timeQueries(client, userIds);
    await client.query("ROLLBACK");

    return { withIndexes, withoutIndexes };
  } finally {
    client.release();
  }
}

async function timeEndpoint(statsTtlMs: number, email: string) {
  const server = createApp(pool, { statsTtlMs }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;

  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];

  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const res = await fetch(`${base}/api/stats`, { headers: { Cookie: cookie } });
    await res.json();
    times.push(performance.now() - start);
  }
  await new Promise((resolve) => server.close(resolve));
  return avg(times.slice(10));
}

try {
  const { rows } = await pool.query<{ id: number; email: string }>(
    "SELECT id, email FROM users WHERE email LIKE 'bulk%@example.com' ORDER BY id"
  );
  if (rows.length === 0) {
    throw new Error("No bulk data found. Run `npm run seed -- --bulk` first.");
  }
  const { rows: count } = await pool.query("SELECT COUNT(*)::int AS n FROM applications");
  console.log(`Dataset: ${rows.length} users, ${count[0].n} applications\n`);

  const idx = await benchmarkIndexes(rows.map((r) => r.id));
  const idxGain = ((idx.withoutIndexes - idx.withIndexes) / idx.withoutIndexes) * 100;
  console.log("List + status queries (avg per request)");
  console.log(`  without indexes: ${idx.withoutIndexes.toFixed(2)} ms`);
  console.log(`  with indexes:    ${idx.withIndexes.toFixed(2)} ms`);
  console.log(`  improvement:     ${idxGain.toFixed(1)}%\n`);

  const uncached = await timeEndpoint(0, rows[0].email);
  const cached = await timeEndpoint(5 * 60 * 1000, rows[0].email);
  const cacheGain = ((uncached - cached) / uncached) * 100;
  console.log("GET /api/stats response time (avg)");
  console.log(`  no cache:    ${uncached.toFixed(2)} ms`);
  console.log(`  with cache:  ${cached.toFixed(2)} ms`);
  console.log(`  improvement: ${cacheGain.toFixed(1)}%`);
} finally {
  await pool.end();
}
