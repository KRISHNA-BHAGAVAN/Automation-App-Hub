import app from "./app";
import { logger } from "./lib/logger";
import { initializeDatabase } from "@workspace/db";

const rawPort = process.env["PORT"] || "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  await initializeDatabase();

  app.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "Server listening on 0.0.0.0");
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
