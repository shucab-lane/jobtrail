import { HttpError } from "./errors.ts";

type Body = Record<string, unknown>;

// Collects field errors so the client gets all of them in one response
export class Validator {
  private errors: Record<string, string> = {};
  private body: Body;

  constructor(body: unknown) {
    this.body = body && typeof body === "object" ? (body as Body) : {};
  }

  has(field: string) {
    return this.body[field] !== undefined;
  }

  string(field: string, opts: { required?: boolean; max?: number; min?: number } = {}) {
    const value = this.body[field];
    if (value === undefined || value === null || value === "") {
      if (opts.required) this.errors[field] = "is required";
      return null;
    }
    if (typeof value !== "string") {
      this.errors[field] = "must be a string";
      return null;
    }
    const trimmed = value.trim();
    if (opts.required && !trimmed) this.errors[field] = "is required";
    else if (opts.min && trimmed.length < opts.min) this.errors[field] = `must be at least ${opts.min} characters`;
    else if (opts.max && trimmed.length > opts.max) this.errors[field] = `must be at most ${opts.max} characters`;
    return trimmed || null;
  }

  email(field: string) {
    const value = this.string(field, { required: true, max: 255 });
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) this.errors[field] = "must be a valid email";
    return value?.toLowerCase() ?? "";
  }

  int(field: string, opts: { required?: boolean; min?: number } = {}) {
    const value = this.body[field];
    if (value === undefined || value === null || value === "") {
      if (opts.required) this.errors[field] = "is required";
      return null;
    }
    const num = typeof value === "string" ? Number(value) : value;
    if (typeof num !== "number" || !Number.isInteger(num)) {
      this.errors[field] = "must be a whole number";
      return null;
    }
    if (opts.min !== undefined && num < opts.min) this.errors[field] = `must be at least ${opts.min}`;
    return num;
  }

  oneOf<T extends string>(field: string, allowed: readonly T[], opts: { required?: boolean } = {}) {
    const value = this.string(field, opts);
    if (value && !allowed.includes(value as T)) {
      this.errors[field] = `must be one of: ${allowed.join(", ")}`;
      return null;
    }
    return value as T | null;
  }

  date(field: string, opts: { required?: boolean } = {}) {
    const value = this.string(field, opts);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) {
      this.errors[field] = "must be a date (YYYY-MM-DD)";
      return null;
    }
    return value;
  }

  datetime(field: string, opts: { required?: boolean } = {}) {
    const value = this.string(field, opts);
    if (value && Number.isNaN(Date.parse(value))) {
      this.errors[field] = "must be a valid date and time";
      return null;
    }
    return value ? new Date(value).toISOString() : null;
  }

  url(field: string) {
    const value = this.string(field, { max: 500 });
    if (value && !/^https?:\/\/\S+$/i.test(value)) this.errors[field] = "must start with http:// or https://";
    return value;
  }

  addError(field: string, message: string) {
    this.errors[field] = message;
  }

  check() {
    if (Object.keys(this.errors).length > 0) {
      throw new HttpError(400, "Validation failed", this.errors);
    }
  }
}

export function parseId(value: string | undefined) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
  return id;
}
