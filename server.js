require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const logger = console;
const config = require("./config/env");
const { setupDocs } = require("./docs/swagger");

// Imports refatorados
const apiRoutes = require("./routes");
const createAdaptiveRateLimiter = require("./middleware/adaptiveRateLimiter");

// ✅ Importações para tratamento de erro
const errorHandler = require("./middleware/errorHandler");
const AppError = require("./errors/AppError");
const ERROR_CODES = require("./constants/ErrorCodes");

const app = express();

/* ============================
 * CORS: origens permitidas
 * ============================ */
const normalizeOrigin = (origin) => {
  if (!origin) return null;
  return origin.replace(/\/$/, "").trim();
};

const rawOrigins = [
  process.env.ALLOWED_ORIGINS,
  config.appUrl,
  config.backendUrl,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
];

const ALLOWED_ORIGINS = Array.from(
  new Set(
    rawOrigins
      .filter(Boolean)
      .flatMap((value) => String(value).split(","))
      .map((s) => normalizeOrigin(s))
      .filter(Boolean)
  )
);

logger.info("🌐 CORS - ORIGENS PERMITIDAS:", ALLOWED_ORIGINS);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const normalized = normalizeOrigin(origin);
      if (normalized && ALLOWED_ORIGINS.includes(normalized)) {
        return cb(null, true);
      }
      const msg = `CORS bloqueado para origem: ${origin}`;
      if (process.env.NODE_ENV !== "production") {
        logger.warn(msg, { normalized, ALLOWED_ORIGINS });
      }
      return cb(new Error(msg));
    },
    credentials: true,
  })
);

/* ============================
 * Middlewares Globais
 * ============================ */
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use(cookieParser());

/* ============================
 * Segurança: Rate Limiter
 * ============================ */
const rateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => req.ip,
});
app.use(rateLimiter);

/* ============================
 * Rotas da API (Centralizadas)
 * ============================ */
app.use("/api", apiRoutes);
logger.info("✅ Sistema de rotas centralizado carregado em /api");

/* ============================
 * Swagger
 * ============================ */
setupDocs(app);

/* ============================
 * Tratamento de Erros (404 & 500)
 * ============================ */
app.use((req, _res, next) => {
  next(
    new AppError(
      `Rota não encontrada: ${req.method} ${req.originalUrl}`,
      ERROR_CODES.NOT_FOUND,
      404
    )
  );
});

app.use(errorHandler);

/* ============================
 * Inicialização do Servidor
 * ============================ */
if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    logger.info(`✅ Server rodando em http://localhost:${PORT}`);
    logger.info(`📚 Swagger em: http://localhost:${PORT}/docs`);
    logger.info(`🌐 APP_URL configurada: ${config.appUrl}`);
  });
}

module.exports = app;