import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiClient, registerUser, startTestServer, type TestContext } from "./helpers.ts";

let ctx: TestContext;
let client: ApiClient;

beforeAll(async () => {
  ctx = await startTestServer();
  ({ client } = await registerUser(ctx.baseUrl));
});

afterAll(async () => {
  await ctx.close();
});

async function createApplication(body: Record<string, unknown>) {
  const res = await client.post("/api/applications", body);
  expect(res.status).toBe(201);
  return res.body.data;
}

describe("applications", () => {
  it("creates an application and its company in one request", async () => {
    const app = await createApplication({
      company_name: "Acme Corp",
      role_title: "Frontend Developer",
      applied_on: "2026-09-01",
      salary_min: 60000,
      salary_max: 80000,
    });
    expect(app).toMatchObject({
      company_name: "Acme Corp",
      role_title: "Frontend Developer",
      status: "applied",
      applied_on: "2026-09-01",
    });
  });

  it("reuses an existing company with the same name", async () => {
    await createApplication({ company_name: "Acme Corp", role_title: "Backend Developer" });
    const companies = await client.get("/api/companies");
    expect(companies.body.data).toHaveLength(1);
    expect(companies.body.data[0].application_count).toBe(2);
  });

  it("validates input", async () => {
    const res = await client.post("/api/applications", {
      role_title: "",
      status: "ghosted",
      salary_min: 90000,
      salary_max: 50000,
      job_url: "not a url",
    });
    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty("role_title");
    expect(res.body.details).toHaveProperty("status");
    expect(res.body.details).toHaveProperty("salary_max");
    expect(res.body.details).toHaveProperty("job_url");
    expect(res.body.details).toHaveProperty("company_name");
  });

  it("records status changes in the history", async () => {
    const app = await createApplication({ company_name: "Globex", role_title: "Software Engineer" });
    await client.patch(`/api/applications/${app.id}`, { status: "interviewing" });
    await client.patch(`/api/applications/${app.id}`, { notes: "Recruiter call went well" });
    await client.patch(`/api/applications/${app.id}`, { status: "offer" });

    const res = await client.get(`/api/applications/${app.id}`);
    expect(res.body.data.status).toBe("offer");
    expect(res.body.data.notes).toBe("Recruiter call went well");
    expect(res.body.data.history.map((h: { to_status: string }) => h.to_status)).toEqual([
      "applied",
      "interviewing",
      "offer",
    ]);
  });

  it("filters, searches and paginates", async () => {
    for (let i = 1; i <= 5; i++) {
      await createApplication({ company_name: "Initech", role_title: `QA Engineer ${i}`, status: "rejected" });
    }

    const filtered = await client.get("/api/applications?status=rejected&limit=2&page=2");
    expect(filtered.body.total).toBe(5);
    expect(filtered.body.totalPages).toBe(3);
    expect(filtered.body.data).toHaveLength(2);

    const search = await client.get("/api/applications?q=initech");
    expect(search.body.total).toBe(5);

    const pastEnd = await client.get("/api/applications?status=rejected&limit=2&page=10");
    expect(pastEnd.body.data).toHaveLength(0);
    expect(pastEnd.body.total).toBe(5);

    const bad = await client.get("/api/applications?status=nope");
    expect(bad.status).toBe(400);
  });

  it("manages interviews", async () => {
    const app = await createApplication({ company_name: "Hooli", role_title: "Full Stack Developer" });
    const created = await client.post(`/api/applications/${app.id}/interviews`, {
      stage: "Technical",
      scheduled_at: "2030-01-15T15:00:00Z",
    });
    expect(created.status).toBe(201);
    expect(created.body.data.outcome).toBe("pending");

    const updated = await client.patch(`/api/applications/${app.id}/interviews/${created.body.data.id}`, {
      outcome: "passed",
    });
    expect(updated.body.data.outcome).toBe("passed");

    const removed = await client.delete(`/api/applications/${app.id}/interviews/${created.body.data.id}`);
    expect(removed.status).toBe(204);
  });

  it("does not let users see each other's data", async () => {
    const app = await createApplication({ company_name: "Private Co", role_title: "Secret Role" });
    const { client: other } = await registerUser(ctx.baseUrl);

    expect((await other.get(`/api/applications/${app.id}`)).status).toBe(404);
    expect((await other.patch(`/api/applications/${app.id}`, { status: "offer" })).status).toBe(404);
    expect((await other.delete(`/api/applications/${app.id}`)).status).toBe(404);
    expect((await other.get("/api/applications")).body.total).toBe(0);
  });

  it("deletes an application", async () => {
    const app = await createApplication({ company_name: "Umbrella", role_title: "DevOps Engineer" });
    expect((await client.delete(`/api/applications/${app.id}`)).status).toBe(204);
    expect((await client.get(`/api/applications/${app.id}`)).status).toBe(404);
  });

  it("rejects a non-numeric id", async () => {
    expect((await client.get("/api/applications/abc")).status).toBe(400);
  });
});

describe("stats", () => {
  it("serves cached stats until data changes", async () => {
    const first = await client.get("/api/stats");
    expect(first.status).toBe(200);
    expect(first.headers.get("x-cache")).toBe("MISS");

    const second = await client.get("/api/stats");
    expect(second.headers.get("x-cache")).toBe("HIT");
    expect(second.body).toEqual(first.body);

    await createApplication({ company_name: "Stark Industries", role_title: "Engineer", status: "wishlist" });
    const third = await client.get("/api/stats");
    expect(third.headers.get("x-cache")).toBe("MISS");
    expect(third.body.data.total).toBe(first.body.data.total + 1);
    expect(third.body.data.weekly).toHaveLength(12);
  });
});

describe("companies", () => {
  it("adds and removes contacts", async () => {
    const company = await client.post("/api/companies", { name: "Wayne Enterprises", website: "https://wayne.example" });
    expect(company.status).toBe(201);

    const contact = await client.post(`/api/companies/${company.body.data.id}/contacts`, {
      name: "Lucius Fox",
      email: "lucius@wayne.example",
      title: "Hiring Manager",
    });
    expect(contact.status).toBe(201);

    const detail = await client.get(`/api/companies/${company.body.data.id}`);
    expect(detail.body.data.contacts).toHaveLength(1);

    const removed = await client.delete(`/api/companies/${company.body.data.id}/contacts/${contact.body.data.id}`);
    expect(removed.status).toBe(204);
  });

  it("rejects duplicate company names", async () => {
    const res = await client.post("/api/companies", { name: "Wayne Enterprises" });
    expect(res.status).toBe(409);
  });
});
