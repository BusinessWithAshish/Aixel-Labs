// Load `.env` before any local module reads `process.env` into constants (e.g. PROXY_CONFIG).
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import path from "path";
import { registerRoutes } from "./routes";
import type { Express } from "express";
import {
  ALLOWED_ORIGINS_DEV_REGEX,
  ALLOWED_ORIGINS_PROD_REGEX,
  API_ENDPOINTS,
} from "./config";

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
      "Accept",
      "mcp-session-id",
      "mcp-protocol-version",
      "X-Chunk-Offset",
    ],
    exposedHeaders: ["mcp-session-id"],
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
// Loopback callers are this host's own services — the Hermes gateways and
// their cron sessions, local Claude Code sessions — reaching `/mcp` directly on
// 127.0.0.1:8002. They must not share the public per-IP budget: every one of
// them arrives as 127.0.0.1, so they all drew from a single 100-per-15-minute
// bucket, and one MCP tool call is several HTTP requests. A cron run fanning
// out to four scouts exhausted it in minutes (2026-09-10: 69 x 429), which got
// the MCP connection parked and the run halted. Public traffic is unaffected:
// it arrives through Caddy with TRUST_PROXY=1, so `req.ip` resolves to the real
// client from X-Forwarded-For (which Caddy sets, so it cannot be spoofed to
// loopback), and the server itself only listens on 127.0.0.1.
const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => LOOPBACK_IPS.has(req.ip ?? ""),
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
  const PORT = Number(process.env.PORT) || 8002;
  // Production on this VPS is reached via Caddy on :443. Bind loopback so
  // Node is not on the public internet. Override with HOST=0.0.0.0 for LAN.
  const HOST =
    process.env.HOST ||
    (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");
  const server = app.listen(PORT, HOST, () => {
    const timestamp = new Date().toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    console.log(
      `Aixel Labs backend running on ${HOST}:${PORT} [${process.env.NODE_ENV}] - Started at ${timestamp}...`,
    );
  });

  /**
   * Node's `server.requestTimeout` defaults to 300_000ms (5 min) since v18 —
   * too short for long-running upstream calls. Raised app-wide (VPS and
   * local alike — both take this `!VERCEL` branch) since several scrape/AI
   * routes here can legitimately run long — in particular, the video
   * module's chunked diarization (see api/video/diarize/) makes several
   * sequential Gemini calls for long sources (one per ~15min chunk), so a
   * single `/video/diarize` request on a long source can itself run
   * considerably longer than any one Gemini call.
   * `headersTimeout` stays under this per Node's requirement.
   *
   * This block is unreachable on Vercel, and deliberately so: there is no
   * `http.Server` there to set these properties on (the app is exported and
   * invoked per-request rather than `.listen()`-ing). Vercel's own request
   * ceiling is `vercel.json`'s `functions.maxDuration` (plan-tier dependent,
   * commonly capped well under an hour) — set it there, not here, if it
   * ever needs to change.
   */
  server.requestTimeout = 60 * 60 * 1000;
  server.headersTimeout = 60 * 60 * 1000 - 1000;
}
