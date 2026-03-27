import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import morgan from "morgan";
import path from "path";
import { registerRoutes } from "./routes";
import type { Express } from "express";
import {
  ALLOWED_ORIGINS_DEV_REGEX,
  ALLOWED_ORIGINS_PROD_REGEX,
  API_ENDPOINTS,
} from "./config";

dotenv.config();

const app: Express = express();

// Vercel/reverse-proxy setups require trust proxy for correct client IP detection.
// This avoids express-rate-limit proxy validation warnings and global limiting.
const trustProxyEnv = process.env.TRUST_PROXY;
if (trustProxyEnv !== undefined) {
  const normalized = trustProxyEnv.trim().toLowerCase();
  if (normalized === "true") {
    app.set("trust proxy", true);
  } else if (normalized === "false") {
    app.set("trust proxy", false);
  } else {
    const parsed = Number(trustProxyEnv);
    app.set("trust proxy", Number.isFinite(parsed) ? parsed : 1);
  }
} else if (process.env.VERCEL) {
  app.set("trust proxy", 1);
}

// ===================
// 1. Basic Security
// ===================
app.use(helmet());
app.disable("x-powered-by");

// ===================
// 2. CORS
// ===================
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowedPatterns =
        process.env.NODE_ENV === "development"
          ? ALLOWED_ORIGINS_DEV_REGEX
          : ALLOWED_ORIGINS_PROD_REGEX;

      const isAllowed = allowedPatterns.some((pattern) => pattern.test(origin));

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("CORS ERROR"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cache-Control",
      "X-Requested-With",
    ],
    credentials: true,
  }),
);

// ===================
// 3. Body Parsing
// ===================
app.use(express.json({ limit: "5mb" }));

// ===================
// 4. Request Logging
// ===================
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ===================
// 4.1 Static Assets
// ===================
app.use(express.static(path.join(process.cwd(), "public")));

// ===================
// 5. Rate Limiting
// ===================
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// ===================
// 6. Health Check
// ===================
app.get(
  API_ENDPOINTS.PING,
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  (_, res) => {
    res.json({ success: true, message: "Server is running" });
  },
);

// ===================
// 7. Feature Routes
// ===================
registerRoutes(app);

// ===================
// 8. Start Server
// ===================
// On Vercel, Express apps run as a Serverless Function.
// Export the app so Vercel can invoke it without binding a port.
export = app;

// For local/dev or traditional servers, keep `listen`.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 8100;
  app.listen(PORT, () => {
    const timestamp = new Date().toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    console.log(
      `Aixel Labs backend running on port ${PORT} [${process.env.NODE_ENV}] - Started at ${timestamp}...`,
    );
  });
}
