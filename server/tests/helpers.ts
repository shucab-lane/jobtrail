import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.ts";
import { createPool, type Pool } from "../src/db.ts";
import { runMigrations } from "../src/db/migrate.ts";

export type TestContext = {
  pool: Pool;
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startTestServer(): Promise<TestContext> {
  const pool = createPool(process.env.TEST_DATABASE_URL!);
  await runMigrations(pool);
  await pool.query("TRUNCATE users, companies, applications RESTART IDENTITY CASCADE");

  const server: Server = createApp(pool).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    pool,
    baseUrl: `http://localhost:${port}`,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    },
  };
}

// Tiny client that keeps the session cookie between requests, like a browser would
export class ApiClient {
  private cookie = "";
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request(method: string, path: string, body?: unknown) {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  }

  get = (path: string) => this.request("GET", path);
  post = (path: string, body?: unknown) => this.request("POST", path, body ?? {});
  patch = (path: string, body: unknown) => this.request("PATCH", path, body);
  delete = (path: string) => this.request("DELETE", path);
}

let userCounter = 0;

export async function registerUser(baseUrl: string) {
  const client = new ApiClient(baseUrl);
  userCounter++;
  const res = await client.post("/api/auth/register", {
    name: `Test User ${userCounter}`,
    email: `user${userCounter}@example.com`,
    password: "password123",
  });
  if (res.status !== 201) throw new Error(`Register failed: ${JSON.stringify(res.body)}`);
  return { client, user: res.body.user };
}
