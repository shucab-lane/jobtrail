import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/errors.ts";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  // Postgres unique violation
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    res.status(409).json({ error: "That record already exists" });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
}
