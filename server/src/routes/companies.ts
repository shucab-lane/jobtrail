import { Router } from "express";
import type { Pool } from "../db.ts";
import { notFound } from "../lib/errors.ts";
import { Validator, parseId } from "../lib/validate.ts";
import { currentUser } from "../middleware/auth.ts";

export function companiesRouter(pool: Pool, onChange: (userId: number) => void) {
  const router = Router();

  async function findCompany(userId: number, id: number) {
    const { rows } = await pool.query(
      "SELECT id, name, website, location, created_at FROM companies WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    if (!rows[0]) throw notFound("Company");
    return rows[0];
  }

  router.get("/", async (_req, res) => {
    const user = currentUser(res);
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.website, c.location,
              COUNT(a.id)::int AS application_count
       FROM companies c
       LEFT JOIN applications a ON a.company_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.name`,
      [user.id]
    );
    res.json({ data: rows });
  });

  router.post("/", async (req, res) => {
    const user = currentUser(res);
    const v = new Validator(req.body);
    const name = v.string("name", { required: true, max: 150 });
    const website = v.url("website");
    const location = v.string("location", { max: 150 });
    v.check();

    const { rows } = await pool.query(
      `INSERT INTO companies (user_id, name, website, location)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, website, location, created_at`,
      [user.id, name, website, location]
    );
    res.status(201).json({ data: rows[0] });
  });

  router.get("/:id", async (req, res) => {
    const user = currentUser(res);
    const company = await findCompany(user.id, parseId(req.params.id));

    const [contacts, applications] = await Promise.all([
      pool.query(
        "SELECT id, name, email, title FROM contacts WHERE company_id = $1 ORDER BY name",
        [company.id]
      ),
      pool.query(
        `SELECT id, role_title, status, applied_on
         FROM applications
         WHERE company_id = $1
         ORDER BY applied_on DESC NULLS LAST`,
        [company.id]
      ),
    ]);

    res.json({ data: { ...company, contacts: contacts.rows, applications: applications.rows } });
  });

  router.patch("/:id", async (req, res) => {
    const user = currentUser(res);
    const company = await findCompany(user.id, parseId(req.params.id));
    const v = new Validator(req.body);
    const name = v.has("name") ? v.string("name", { required: true, max: 150 }) : company.name;
    const website = v.has("website") ? v.url("website") : company.website;
    const location = v.has("location") ? v.string("location", { max: 150 }) : company.location;
    v.check();

    const { rows } = await pool.query(
      `UPDATE companies SET name = $1, website = $2, location = $3
       WHERE id = $4
       RETURNING id, name, website, location, created_at`,
      [name, website, location, company.id]
    );
    onChange(user.id);
    res.json({ data: rows[0] });
  });

  router.delete("/:id", async (req, res) => {
    const user = currentUser(res);
    const company = await findCompany(user.id, parseId(req.params.id));
    await pool.query("DELETE FROM companies WHERE id = $1", [company.id]);
    onChange(user.id);
    res.status(204).end();
  });

  router.post("/:id/contacts", async (req, res) => {
    const user = currentUser(res);
    const company = await findCompany(user.id, parseId(req.params.id));
    const v = new Validator(req.body);
    const name = v.string("name", { required: true, max: 100 });
    const email = v.has("email") && req.body.email ? v.email("email") : null;
    const title = v.string("title", { max: 100 });
    v.check();

    const { rows } = await pool.query(
      `INSERT INTO contacts (company_id, name, email, title)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, title`,
      [company.id, name, email, title]
    );
    res.status(201).json({ data: rows[0] });
  });

  router.delete("/:id/contacts/:contactId", async (req, res) => {
    const user = currentUser(res);
    const company = await findCompany(user.id, parseId(req.params.id));
    const result = await pool.query(
      "DELETE FROM contacts WHERE id = $1 AND company_id = $2",
      [parseId(req.params.contactId), company.id]
    );
    if (!result.rowCount) throw notFound("Contact");
    res.status(204).end();
  });

  return router;
}
