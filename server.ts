import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer as createViteServer } from "vite";
import app from "./artifacts/api-server/src/app";
import { initializeDatabase } from "./lib/db/src/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";

async function startServer() {
  // Ensure database tables exist (PostgreSQL DDL bootstrapping)
  try {
    await initializeDatabase();
  } catch (err) {
    console.warn("[Server] Database initialization warning:", err);
  }

  const clientPath = path.resolve(__dirname, "artifacts/automation-hub");

  if (!isProduction) {
    // Mount Vite in middleware mode for hot reload in development
    const vite = await createViteServer({
      root: clientPath,
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        port: PORT,
      },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    // In production, serve built static assets from dist
    const distPath = path.resolve(clientPath, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.info(`[Server] Automation Hub running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
  process.exit(1);
});
