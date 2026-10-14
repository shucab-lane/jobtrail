import { Router } from "express";
import type { Pool } from "../db.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import { Validator, parseId } from "../lib/validate.ts";
import { currentUser } from "../middleware/auth.ts";

export const STATUSES = ["wishlist", "applied", "interviewing", "offer", "rejected", "withdrawn"] as const;
const OUTCOMES = ["pending", "passed", "failed"] as const;

// Whitelisted so the sort param can never be injected into the SQL
const SORTS: Record<string, string> = {
  newest: "a.applied_on DESC NULLS LAST, a.id DESC",
  oldest: "a.applied_on ASC NULLS LAST, a.id ASC",
  company: "c.name ASC, a.id DESC",
  updated: "a.updated_at DESC",
};

export function applicationsRouter(pool: Pool, onChange: (userId: number) => void) {
  const router = Router();

  async function findApplication(userId: number, id: number) {
    const { rows } = await pool.query(
      `SELECT a.*, c.name AS company_name
       FROM applications a
       JOIN companies c ON c.id = a.company_id
       WHERE a.id = $1 AND a.user_id = $2`,
      [id, userId]
    );
    if (!rows[0]) throw notFound("Application");
    return rows[0];
  }

  router.get("/", async (req, res) => {
    const user = currentUser(res);
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const sort = SORTS[String(req.query.sort)] ?? SORTS.newest;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const conditions = ["a.user_id = $1"];
    const params: unknown[] = [user.id];

    if (status) {
      if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
        throw new HttpError(400, "Invalid status filter");
      }
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(a.role_title ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }

    params.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(
      `SELECT a.id, a.role_title, a.status, a.applied_on, a.salary_min, a.salary_max,
              a.updated_at, c.id AS company_id, c.name AS company_name,
              COUNT(*) OVER()::int AS total_count
       FROM applications a
       JOIN companies c ON c.id = a.company_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${sort}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows[0]?.total_count ?? 0;
    res.json({
      data: rows.map(({ total_count, ...row }) => row),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  });

  router.post("/", async (req, res) => {
    const user = currentUser(res);
    const v = new Validator(req.body);
    const companyId = v.int("company_id", { min: 1 });
    const companyName = v.string("company_name", { max: 150 });
    const roleTitle = v.string("role_title", { required: true, max: 150 });
    const status = v.oneOf("status", STATUSES) ?? "applied";
    const jobUrl = v.url("job_url");
    const salaryMin = v.int("salary_min", { min: 0 });
    const salaryMax = v.int("salary_max", { min: 0 });
    const appliedOn = v.date("applied_on");
    const notes = v.string("notes", { max: 5000 });
    if (!companyId && !companyName) v.addError("company_name", "is required");
    if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
      v.addError("salary_max", "must be greater than the minimum");
    }
    v.check();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let resolvedCompanyId = companyId;
      if (resolvedCompanyId) {
        const owned = await client.query(
          "SELECT 1 FROM companies WHERE id = $1 AND user_id = $2",
          [resolvedCompanyId, user.id]
        );
        if (!owned.rowCount) throw notFound("Company");
      } else {
        // Reuse the company if the user already has one with this name
        const { rows } = await client.query(
          `INSERT INTO companies (user_id, name) VALUES ($1, $2)
           ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [user.id, companyName]
        );
        resolvedCompanyId = rows[0].id;
      }

      const { rows } = await client.query(
        `INSERT INTO applications
           (user_id, company_id, role_title, status, job_url, salary_min, salary_max, applied_on, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [user.id, resolvedCompanyId, roleTitle, status, jobUrl, salaryMin, salaryMax, appliedOn, notes]
      );
      await client.query(
        "INSERT INTO status_history (application_id, from_status, to_status) VALUES ($1, NULL, $2)",
        [rows[0].id, status]
      );

      await client.query("COMMIT");
      onChange(user.id);
      res.status(201).json({ data: await findApplication(user.id, rows[0].id) });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  router.get("/:id", async (req, res) => {
    const user = currentUser(res);
    const application = await findApplication(user.id, parseId(req.params.id));

    const [interviews, history] = await Promise.all([
      pool.query(
        `SELECT id, stage, scheduled_at, outcome, notes
         FROM interviews WHERE application_id = $1
         ORDER BY scheduled_at`,
        [application.id]
      ),
      pool.query(
        `SELECT id, from_status, to_status, changed_at
         FROM status_history WHERE application_id = $1
         ORDER BY changed_at, id`,
        [application.id]
      ),
    ]);

    res.json({ data: { ...application, interviews: interviews.rows, history: history.rows } });
  });

  router.patch("/:id", async (req, res) => {
    const user = currentUser(res);
    const current = await findApplication(user.id, parseId(req.params.id));
    const v = new Validator(req.body);

    const next = {
      role_title: v.has("role_title") ? v.string("role_title", { required: true, max: 150 }) : current.role_title,
      status: v.has("status") ? v.oneOf("status", STATUSES, { required: true }) : current.status,
      job_url: v.has("job_url") ? v.url("job_url") : current.job_url,
      salary_min: v.has("salary_min") ? v.int("salary_min", { min: 0 }) : current.salary_min,
      salary_max: v.has("salary_max") ? v.int("salary_max", { min: 0 }) : current.salary_max,
      applied_on: v.has("applied_on") ? v.date("applied_on") : current.applied_on,
      notes: v.has("notes") ? v.string("notes", { max: 5000 }) : current.notes,
    };
    if (next.salary_min !== null && next.salary_max !== null && next.salary_min > next.salary_max) {
      v.addError("salary_max", "must be greater than the minimum");
    }
    v.check();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE applications
         SET role_title = $1, status = $2, job_url = $3, salary_min = $4,
             salary_max = $5, applied_on = $6, notes = $7, updated_at = now()
         WHERE id = $8`,
        [next.role_title, next.status, next.job_url, next.salary_min,
         next.salary_max, next.applied_on, next.notes, current.id]
      );
      if (next.status !== current.status) {
        await client.query(
          "INSERT INTO status_history (application_id, from_status, to_status) VALUES ($1, $2, $3)",
          [current.id, current.status, next.status]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    onChange(user.id);
    res.json({ data: await findApplication(user.id, current.id) });
  });

  router.delete("/:id", async (req, res) => {
    const user = currentUser(res);
    const result = await pool.query(
      "DELETE FROM applications WHERE id = $1 AND user_id = $2",
      [parseId(req.params.id), user.id]
    );
    if (!result.rowCount) throw notFound("Application");
    onChange(user.id);
    res.status(204).end();
  });

  router.post("/:id/interviews", async (req, res) => {
    const user = currentUser(res);
    const application = await findApplication(user.id, parseId(req.params.id));
    const v = new Validator(req.body);
    const stage = v.string("stage", { required: true, max: 50 });
    const scheduledAt = v.datetime("scheduled_at", { required: true });
    const outcome = v.oneOf("outcome", OUTCOMES) ?? "pending";
    const notes = v.string("notes", { max: 5000 });
    v.check();

    const { rows } = await pool.query(
      `INSERT INTO interviews (application_id, stage, scheduled_at, outcome, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, stage, scheduled_at, outcome, notes`,
      [application.id, stage, scheduledAt, outcome, notes]
    );
    onChange(user.id);
    res.status(201).json({ data: rows[0] });
  });

  router.patch("/:id/interviews/:interviewId", async (req, res) => {
    const user = currentUser(res);
    const application = await findApplication(user.id, parseId(req.params.id));
    const { rows: found } = await pool.query(
      "SELECT * FROM interviews WHERE id = $1 AND application_id = $2",
      [parseId(req.params.interviewId), application.id]
    );
    const interview = found[0];
    if (!interview) throw notFound("Interview");

    const v = new Validator(req.body);
    const stage = v.has("stage") ? v.string("stage", { required: true, max: 50 }) : interview.stage;
    const scheduledAt = v.has("scheduled_at") ? v.datetime("scheduled_at", { required: true }) : interview.scheduled_at;
    const outcome = v.has("outcome") ? v.oneOf("outcome", OUTCOMES, { required: true }) : interview.outcome;
    const notes = v.has("notes") ? v.string("notes", { max: 5000 }) : interview.notes;
    v.check();

    const { rows } = await pool.query(
      `UPDATE interviews SET stage = $1, scheduled_at = $2, outcome = $3, notes = $4
       WHERE id = $5
       RETURNING id, stage, scheduled_at, outcome, notes`,
      [stage, scheduledAt, outcome, notes, interview.id]
    );
    onChange(user.id);
    res.json({ data: rows[0] });
  });

  router.delete("/:id/interviews/:interviewId", async (req, res) => {
    const user = currentUser(res);
    const application = await findApplication(user.id, parseId(req.params.id));
    const result = await pool.query(
      "DELETE FROM interviews WHERE id = $1 AND application_id = $2",
      [parseId(req.params.interviewId), application.id]
    );
    if (!result.rowCount) throw notFound("Interview");
    onChange(user.id);
    res.status(204).end();
  });

  return router;
}
