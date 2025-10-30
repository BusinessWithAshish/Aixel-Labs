import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import morgan from "morgan";

dotenv.config();

const app = express();

// ===================
// 1️⃣ Basic Security
// ===================
app.use(helmet()); // Secure HTTP headers
app.disable("x-powered-by"); // Hide "Express" in headers

// ===================
// 2️⃣ CORS (Configurable)
// ===================
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

// ===================
// 3️⃣ Body Parsing
// ===================
app.use(express.json({ limit: "1mb" })); // limit to avoid abuse

// ===================
// 4️⃣ Request Logging
// ===================
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ===================
// 5️⃣ Rate Limiting
// ===================
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  limit: Number(process.env.RATE_LIMIT_MAX) || 100, // requests per IP
  standardHeaders: true,
  legacyHeaders: false,
}));

// ===================
// 6️⃣ Health Check
// ===================
app.get("/v1/ping", (_, res) => {
  res.json({ success: true, message: "Server is running" });
});

// ===================
// 7️⃣ Routes
// ===================
import { GMAPS_SCRAPE } from "./apis/GMAPS_SCRAPE.js";
import { GMAPS_SEARCH_API_SCRAPE } from "./apis/GMAPS_SEARCH_API_SCRAPE.js";

app.post("/gmaps/scrape", GMAPS_SCRAPE);
app.post("/gmaps/search_scrape", GMAPS_SEARCH_API_SCRAPE);

// ===================
// 9️⃣ Start Server
// ===================
const PORT = process.env.PORT || 8100;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
});
