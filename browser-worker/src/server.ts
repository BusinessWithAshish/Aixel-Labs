// Load `.env` before any local module reads `process.env` into constants (e.g. PROXY_CONFIG).
import "dotenv/config";
import express from "express";
import { registerRoutes } from "./routes";
import { PORT } from "./config";
import type { Express } from "express";

const app: Express = express();

// ===================
// 1. Body Parsing
// ===================
app.use(express.json({ limit: "5mb" }));

// ===================
// 2. Feature Routes
// ===================
registerRoutes(app);

// ===================
// 3. Start Server
// ===================
app.listen(PORT, () => {
  console.log(`browser-worker running on port ${PORT} [${process.env.NODE_ENV ?? "development"}]`);
});
