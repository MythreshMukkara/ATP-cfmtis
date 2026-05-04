import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import pinoHttp from "pino-http";
import authRoutes from "./routes/auth.js";
import caseRoutes from "./routes/cases.js";
import analysisRoutes from "./routes/analysis.js";
import freezeRoutes from "./routes/freeze.js";
import fileRoutes from "./routes/files.js";
import analyzerRoutes from "./routes/analyzer.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { env } from "./utils/env.js";
import { logger } from "./utils/logger.js";

const app = express();

app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(pinoHttp({ logger }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/cases", fileRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/cases", analysisRoutes);
app.use("/api/cases", freezeRoutes);
app.use("/api", analyzerRoutes);
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`CFMTIS server listening on port ${env.PORT}`);
});
