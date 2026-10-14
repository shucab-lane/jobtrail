// Usage:
//   npm run seed            demo account with realistic data
//   npm run seed -- --bulk  also adds 500 users x 400 applications for benchmarking
import { createPool } from "../db.ts";
import { config } from "../config.ts";
import { hashPassword } from "../lib/password.ts";

export const DEMO_EMAIL = "demo@jobtrail.dev";
export const DEMO_PASSWORD = "demo1234";

const BULK_USERS = 500;
const BULK_APPS_PER_USER = 400;

const companies = [
  ["Shopify", "https://shopify.com", "Remote"],
  ["Stripe", "https://stripe.com", "Toronto, ON"],
  ["Wealthsimple", "https://wealthsimple.com", "Toronto, ON"],
  ["Atlassian", "https://atlassian.com", "Remote"],
  ["RBC", "https://rbc.com", "Toronto, ON"],
  ["Microsoft", "https://microsoft.com", "Vancouver, BC"],
  ["Amazon", "https://amazon.com", "Vancouver, BC"],
  ["Ecobee", "https://ecobee.com", "Toronto, ON"],
  ["Lightspeed", "https://lightspeedhq.com", "Montreal, QC"],
  ["Clio", "https://clio.com", "Burnaby, BC"],
  ["Koho", "https://koho.ca", "Remote"],
  ["Ada", "https://ada.cx", "Toronto, ON"],
];

const roles = [
  "Junior Software Developer",
  "Full Stack Developer",
  "Frontend Developer (React)",
  "Backend Developer (Node.js)",
  "Software Engineer I",
  "Web Developer",
];

const statuses = ["applied", "applied", "applied", "rejected", "rejected", "interviewing", "wishlist", "offer"];

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function seedDemo(pool: ReturnType<typeof createPool>) {
  await pool.query("DELETE FROM users WHERE email = $1", [DEMO_EMAIL]);
  const { rows } = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
    ["Demo User", DEMO_EMAIL, await hashPassword(DEMO_PASSWORD)]
  );
  const userId = rows[0].id;

  const companyIds: number[] = [];
  for (const [name, website, location] of companies) {
    const res = await pool.query(
      "INSERT INTO companies (user_id, name, website, location) VALUES ($1, $2, $3, $4) RETURNING id",
      [userId, name, website, location]
    );
    companyIds.push(res.rows[0].id);
  }

  await pool.query(
    "INSERT INTO contacts (company_id, name, email, title) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)",
    [companyIds[0], "Priya Patel", "priya@example.com", "Technical Recruiter",
     companyIds[2], "Marcus Chen", "marcus@example.com", "Engineering Manager"]
  );

  for (let i = 0; i < 28; i++) {
    const status = statuses[i % statuses.length];
    const appliedDaysAgo = i * 3;
    const app = await pool.query(
      `INSERT INTO applications (user_id, company_id, role_title, status, salary_min, salary_max, applied_on, job_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [userId, companyIds[i % companyIds.length], roles[i % roles.length],
       status, 60000 + (i % 4) * 5000, 75000 + (i % 4) * 5000,
       status === "wishlist" ? null : daysAgo(appliedDaysAgo),
       `https://jobs.example.com/posting/${1000 + i}`]
    );
    const appId = app.rows[0].id;

    await pool.query(
      "INSERT INTO status_history (application_id, from_status, to_status, changed_at) VALUES ($1, NULL, $2, $3)",
      [appId, status === "wishlist" ? "wishlist" : "applied", daysAgo(appliedDaysAgo)]
    );
    if (status !== "applied" && status !== "wishlist") {
      await pool.query(
        "INSERT INTO status_history (application_id, from_status, to_status, changed_at) VALUES ($1, 'applied', $2, $3)",
        [appId, status, daysAgo(Math.max(0, appliedDaysAgo - 7))]
      );
    }
    if (status === "interviewing" || status === "offer") {
      await pool.query(
        `INSERT INTO interviews (application_id, stage, scheduled_at, outcome)
         VALUES ($1, 'Recruiter screen', now() - interval '5 days', 'passed'),
                ($1, 'Technical interview', now() + make_interval(days => $2), $3)`,
        [appId, 2 + (i % 6), status === "offer" ? "passed" : "pending"]
      );
    }
  }
  console.log(`Demo account ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

// Generated in SQL with generate_series so 200k rows take seconds, not minutes
async function seedBulk(pool: ReturnType<typeof createPool>) {
  await pool.query("DELETE FROM users WHERE email LIKE 'bulk%@example.com'");
  const hash = await hashPassword("password123");

  await pool.query(
    `INSERT INTO users (name, email, password_hash)
     SELECT 'Bulk User ' || n, 'bulk' || n || '@example.com', $1
     FROM generate_series(1, $2) AS n`,
    [hash, BULK_USERS]
  );
  await pool.query(
    `INSERT INTO companies (user_id, name)
     SELECT u.id, 'Company ' || n
     FROM users u CROSS JOIN generate_series(1, 25) AS n
     WHERE u.email LIKE 'bulk%@example.com'`
  );
  await pool.query(
    `INSERT INTO applications (user_id, company_id, role_title, status, applied_on, salary_min, salary_max)
     SELECT u.id,
            (SELECT c.id FROM companies c WHERE c.user_id = u.id ORDER BY c.id OFFSET (n % 25) LIMIT 1),
            'Software Developer ' || n,
            (ARRAY['wishlist','applied','applied','interviewing','offer','rejected','rejected','withdrawn'])[1 + n % 8],
            CURRENT_DATE - (n % 120),
            50000 + (n % 10) * 3000,
            70000 + (n % 10) * 3000
     FROM users u CROSS JOIN generate_series(1, $1) AS n
     WHERE u.email LIKE 'bulk%@example.com'`,
    [BULK_APPS_PER_USER]
  );
  await pool.query(
    `INSERT INTO status_history (application_id, from_status, to_status, changed_at)
     SELECT a.id, NULL, a.status, a.applied_on
     FROM applications a JOIN users u ON u.id = a.user_id
     WHERE u.email LIKE 'bulk%@example.com'`
  );
  await pool.query(
    `INSERT INTO interviews (application_id, stage, scheduled_at, outcome)
     SELECT a.id, 'Technical interview', now() + ((a.id % 30) - 10) * interval '1 day',
            (ARRAY['pending','passed','failed'])[1 + a.id % 3]
     FROM applications a JOIN users u ON u.id = a.user_id
     WHERE u.email LIKE 'bulk%@example.com' AND a.status IN ('interviewing', 'offer')`
  );
  await pool.query("ANALYZE");

  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM applications");
  console.log(`Bulk data ready: ${BULK_USERS} users, ${rows[0].count} applications in total`);
}

const pool = createPool(config.databaseUrl);
try {
  await seedDemo(pool);
  if (process.argv.includes("--bulk")) await seedBulk(pool);
} finally {
  await pool.end();
}
