import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "../db.ts";

export const SESSION_COOKIE = "jt_session";
export const SESSION_DAYS = 7;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Only the hash is stored, so a leaked sessions table can't be used to log in
export async function createSession(pool: Pool, userId: number) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))`,
    [hashToken(token), userId, SESSION_DAYS]
  );
  return token;
}

export async function findSessionUser(pool: Pool, token: string) {
  const { rows } = await pool.query<{ id: number; email: string; name: string }>(
    `SELECT u.id, u.email, u.name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)]
  );
  return rows[0] ?? null;
}

export async function deleteSession(pool: Pool, token: string) {
  await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

export function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
