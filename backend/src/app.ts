import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Normalize URL rewritten by Vercel Serverless Function
app.use((req, _res, next) => {
  const customUrl = req.query?.__url;
  if (typeof customUrl === "string" && customUrl) {
    req.url = customUrl.startsWith("/") ? customUrl : `/${customUrl}`;
  } else if (typeof req.headers["x-matched-path"] === "string" && req.headers["x-matched-path"]) {
    req.url = req.headers["x-matched-path"];
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", router);
app.use("/", router);

app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Express Server Error]:", err);
  res.status(500).json({ error: err?.message || "Internal server error" });
});

export default app;
