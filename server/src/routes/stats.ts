import { Router } from "express";
import type { Pool } from "../db.ts";
import type { TtlCache } from "../lib/cache.ts";
import { currentUser } from "../middleware/auth.ts";

export type Stats = {
  total: number;
  byStatus: Record<string, number>;
  responseRate: number;
  weekly: { week: string; count: number }[];
  upcomingInterviews: {
    id: number;
    application_id: number;
    stage: string;
    scheduled_at: string;
    role_title: string;
    company_name: string;
  }[];
};

export async function loadStats(pool: Pool, userId: number): Promise<Stats> {
  const [statusRows, weeklyRows, upcoming] = await Promise.all([
    pool.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count
       FROM applications WHERE user_id = $1
       GROUP BY status`,
      [userId]
    ),
    pool.query<{ week: string; count: number }>(
      `SELECT to_char(weeks.week, 'YYYY-MM-DD') AS week, COUNT(a.id)::int AS count
       FROM generate_series(
              date_trunc('week', CURRENT_DATE) - interval '11 weeks',
              date_trunc('week', CURRENT_DATE),
              interval '1 week'
            ) AS weeks(week)
       LEFT JOIN applications a
         ON a.user_id = $1
        AND a.applied_on >= weeks.week
        AND a.applied_on < weeks.week + interval '1 week'
       GROUP BY weeks.week
       ORDER BY weeks.week`,
      [userId]
    ),
    pool.query(
      `SELECT i.id, i.application_id, i.stage, i.scheduled_at, a.role_title, c.name AS company_name
       FROM interviews i
       JOIN applications a ON a.id = i.application_id
       JOIN companies c ON c.id = a.company_id
       WHERE a.user_id = $1 AND i.scheduled_at >= now() AND i.outcome = 'pending'
       ORDER BY i.scheduled_at
       LIMIT 5`,
      [userId]
    ),
  ]);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of statusRows.rows) {
    byStatus[row.status] = row.count;
    total += row.count;
  }

  // Of the applications actually sent, how many got any reply
  const sent = total - (byStatus.wishlist ?? 0);
  const heardBack = (byStatus.interviewing ?? 0) + (byStatus.offer ?? 0) + (byStatus.rejected ?? 0);
  const responseRate = sent > 0 ? Math.round((heardBack / sent) * 100) : 0;

  return { total, byStatus, responseRate, weekly: weeklyRows.rows, upcomingInterviews: upcoming.rows };
}

export function statsRouter(pool: Pool, cache: TtlCache<Stats>) {
  const router = Router();

  router.get("/", async (_req, res) => {
    const user = currentUser(res);
    const key = String(user.id);
    let stats = cache.get(key);
    res.set("X-Cache", stats ? "HIT" : "MISS");
    if (!stats) {
      stats = await loadStats(pool, user.id);
      cache.set(key, stats);
    }
    res.json({ data: stats });
  });

  return router;
}
