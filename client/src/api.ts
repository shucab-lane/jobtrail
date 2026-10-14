export const STATUSES = ["wishlist", "applied", "interviewing", "offer", "rejected", "withdrawn"] as const;
export type Status = (typeof STATUSES)[number];

export type User = { id: number; name: string; email: string };

export type ApplicationSummary = {
  id: number;
  role_title: string;
  status: Status;
  applied_on: string | null;
  salary_min: number | null;
  salary_max: number | null;
  updated_at: string;
  company_id: number;
  company_name: string;
};

export type Interview = {
  id: number;
  stage: string;
  scheduled_at: string;
  outcome: "pending" | "passed" | "failed";
  notes: string | null;
};

export type StatusChange = {
  id: number;
  from_status: Status | null;
  to_status: Status;
  changed_at: string;
};

export type Application = ApplicationSummary & {
  job_url: string | null;
  notes: string | null;
  created_at: string;
  interviews: Interview[];
  history: StatusChange[];
};

export type Company = {
  id: number;
  name: string;
  website: string | null;
  location: string | null;
  application_count?: number;
};

export type Contact = { id: number; name: string; email: string | null; title: string | null };

export type CompanyDetail = Company & {
  contacts: Contact[];
  applications: Pick<ApplicationSummary, "id" | "role_title" | "status" | "applied_on">[];
};

export type Paginated<T> = { data: T[]; page: number; limit: number; total: number; totalPages: number };

export type Stats = {
  total: number;
  byStatus: Partial<Record<Status, number>>;
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

export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;

  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "Request failed", data.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: (path: string) => request<void>("DELETE", path),
};
