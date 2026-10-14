import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiClient, startTestServer, type TestContext } from "./helpers.ts";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await startTestServer();
});

afterAll(async () => {
  await ctx.close();
});

describe("auth", () => {
  it("registers a user and logs them in", async () => {
    const client = new ApiClient(ctx.baseUrl);
    const res = await client.post("/api/auth/register", {
      name: "Jane Doe",
      email: "Jane@Example.com",
      password: "supersecret",
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Jane Doe", email: "jane@example.com" });
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");

    const me = await client.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("jane@example.com");
  });

  it("never stores the plain password", async () => {
    const { rows } = await ctx.pool.query("SELECT password_hash FROM users WHERE email = 'jane@example.com'");
    expect(rows[0].password_hash).not.toContain("supersecret");
    expect(rows[0].password_hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it("rejects a duplicate email", async () => {
    const res = await new ApiClient(ctx.baseUrl).post("/api/auth/register", {
      name: "Someone",
      email: "jane@example.com",
      password: "anotherpass",
    });
    expect(res.status).toBe(409);
  });

  it("returns every validation error at once", async () => {
    const res = await new ApiClient(ctx.baseUrl).post("/api/auth/register", {
      email: "not-an-email",
      password: "short",
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details).sort()).toEqual(["email", "name", "password"]);
  });

  it("rejects a wrong password", async () => {
    const res = await new ApiClient(ctx.baseUrl).post("/api/auth/login", {
      email: "jane@example.com",
      password: "wrongpassword",
    });
    expect(res.status).toBe(401);
  });

  it("logs in and out", async () => {
    const client = new ApiClient(ctx.baseUrl);
    const login = await client.post("/api/auth/login", { email: "jane@example.com", password: "supersecret" });
    expect(login.status).toBe(200);

    expect((await client.post("/api/auth/logout")).status).toBe(204);
    expect((await client.get("/api/auth/me")).status).toBe(401);
  });

  it("blocks protected routes without a session", async () => {
    const res = await new ApiClient(ctx.baseUrl).get("/api/applications");
    expect(res.status).toBe(401);
  });

  it("handles malformed JSON", async () => {
    const res = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad json",
    });
    expect(res.status).toBe(400);
  });
});
