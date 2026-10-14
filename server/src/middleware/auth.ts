import type { NextFunction, Request, Response } from "express";
import type { Pool } from "../db.ts";
import { HttpError } from "../lib/errors.ts";
import { SESSION_COOKIE, findSessionUser, readCookie } from "../lib/sessions.ts";

export type AuthUser = { id: number; email: string; name: string };

export function requireAuth(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const user = token ? await findSessionUser(pool, token) : null;
    if (!user) throw new HttpError(401, "Not logged in");
    res.locals.user = user;
    next();
  };
}

// Only call this in routes that sit behind requireAuth
export function currentUser(res: Response): AuthUser {
  const user = res.locals.user as AuthUser | undefined;
  if (!user) throw new HttpError(401, "Not logged in");
  return user;
}
