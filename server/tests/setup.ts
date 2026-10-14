import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must be set to run the tests");
}
