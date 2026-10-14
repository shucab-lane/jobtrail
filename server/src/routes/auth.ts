import { Router, type Response } from "express";
import type { Pool } from "../db.ts";
import { HttpError } from "../lib/errors.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { SESSION_COOKIE, SESSION_DAYS, createSession, deleteSession, readCookie } from "../lib/sessions.ts";
import { Validator } from "../lib/validate.ts";
import { currentUser, requireAuth } from "../middleware/auth.ts";
import { config } from "../config.ts";

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function authRouter(pool: Pool) {
  const router = Router();

  router.post("/register", async (req, res) => {
    const v = new Validator(req.body);
    const name = v.string("name", { required: true, max: 100 });
    const email = v.email("email");
    const password = v.string("password", { required: true, min: 8, max: 128 });
    v.check();

    const existing = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (existing.rowCount) {
      throw new HttpError(409, "An account with that email already exists");
    }

    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, await hashPassword(password!)]
    );
    setSessionCookie(res, await createSession(pool, rows[0].id));
    res.status(201).json({ user: rows[0] });
  });

  router.post("/login", async (req, res) => {
    const v = new Validator(req.body);
    const email = v.email("email");
    const password = v.string("password", { required: true });
    v.check();

    const { rows } = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [email]
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password!, user.password_hash))) {
      throw new HttpError(401, "Incorrect email or password");
    }

    setSessionCookie(res, await createSession(pool, user.id));
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  });

  router.post("/logout", async (req, res) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token) await deleteSession(pool, token);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
  });

  router.get("/me", requireAuth(pool), (_req, res) => {
    res.json({ user: currentUser(res) });
  });

  return router;
}
