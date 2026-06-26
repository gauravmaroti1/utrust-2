import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "dotenv/config";

import { migrate, seed } from "./seed.js";
import { authRouter, usersRouter, branchRouter } from "./routes/auth.js";
import { stockRouter } from "./routes/stock.js";
import { productivityRouter } from "./routes/productivity.js";
import {
  evalRouter, proposalRouter, refurbRouter, quoteRouter, reserveRouter,
} from "./routes/deals.js";
import { analyticsRouter, configRouter } from "./routes/analytics.js";
import { catalogRouter, valuationRouter } from "./routes/valuation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

// ---- API routes ----
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/branches", branchRouter);
app.use("/api/stock", stockRouter);
app.use("/api/productivity", productivityRouter);
app.use("/api/evaluations", evalRouter);
app.use("/api/proposals", proposalRouter);
app.use("/api/refurbishment", refurbRouter);
app.use("/api/quotations", quoteRouter);
app.use("/api/reservations", reserveRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/valuation-config", configRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/valuation", valuationRouter);

// ---- Serve built frontend in production ----
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) =>
    res.json({ message: "U TRUST API running. Build the client to serve the UI." }));
}

const PORT = Number(process.env.PORT) || 8080;

async function boot() {
  try {
    if (process.env.AUTO_MIGRATE !== "false" && process.env.DATABASE_URL) {
      await migrate();
      await seed();
    }
  } catch (e) {
    console.error("[boot] migration/seed error:", (e as Error).message);
  }
  app.listen(PORT, () => console.log(`[server] U TRUST listening on :${PORT}`));
}

boot();
