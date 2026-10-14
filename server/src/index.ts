import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { createPool } from "./db.ts";

const pool = createPool(config.databaseUrl);
const app = createApp(pool);

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
