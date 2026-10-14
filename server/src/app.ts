import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "./db.ts";
import { TtlCache } from "./lib/cache.ts";
import { requireAuth } from "./middleware/auth.ts";
import { errorHandler } from "./middleware/errors.ts";
import { applicationsRouter } from "./routes/applications.ts";
import { authRouter } from "./routes/auth.ts";
import { companiesRouter } from "./routes/companies.ts";
import { statsRouter, type Stats } from "./routes/stats.ts";

const STATS_TTL_MS = 5 * 60 * 1000;

export function createApp(pool: Pool, options: { statsTtlMs?: number } = {}) {
  const app = express();
  const statsCache = new TtlCache<Stats>(options.statsTtlMs ?? STATS_TTL_MS);
  // Any write to a user's data makes their cached dashboard stale
  const invalidate = (userId: number) => statsCache.delete(String(userId));

  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter(pool));
  app.use("/api/companies", requireAuth(pool), companiesRouter(pool, invalidate));
  app.use("/api/applications", requireAuth(pool), applicationsRouter(pool, invalidate));
  app.use("/api/stats", requireAuth(pool), statsRouter(pool, statsCache));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // In production the API also serves the built React app
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
