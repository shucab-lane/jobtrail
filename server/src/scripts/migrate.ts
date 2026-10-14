import { createPool } from "../db.ts";
import { runMigrations } from "../db/migrate.ts";
import { config } from "../config.ts";

const pool = createPool(config.databaseUrl);
try {
  const ran = await runMigrations(pool);
  console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Database is up to date");
} finally {
  await pool.end();
}
