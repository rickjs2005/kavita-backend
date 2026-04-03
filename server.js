require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const fs = require("fs");

const config = require("./config/env");
const pool = require("./config/pool");
const corsConfig = require("./config/cors");
const helmetConfig = require("./config/helmet");
const { startWorkers } = require("./bootstrap/workers");
const { registerShutdownHandlers } = require("./bootstrap/shutdown");
const { setupDocs } = require("./docs/swagger");
const redis = require("./lib/redis");
const RedisRateLimiterStore = require("./lib/redisRateLimiterStore");

const apiRoutes = require("./routes");
const createAdaptiveRateLimiter = require("./middleware/adaptiveRateLimiter");
const { issueCsrfToken } = require("./middleware/csrfProtection");
const requestLogger = require("./middleware/requestLogger");
const requestTimeout = require("./middleware/requestTimeout");
const errorHandler = require("./middleware/errorHandler");
const AppError = require("./errors/AppError");
const ERROR_CODES = require("./constants/ErrorCodes");

const app = express();

// Necessário para req.ip correto atrás de nginx/proxy reverso
app.set("trust proxy", 1);

/* ============================
 * Garantir que o diretório de uploads exista
 * ============================ */
const UPLOADS_DIR = path.resolve(__dirname, "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.info(`📁 Diretório de uploads criado: ${UPLOADS_DIR}`);
} else {
  console.info(`📁 Diretório de uploads OK: ${UPLOADS_DIR}`);
}

console.info("🌐 CORS - ORIGENS PERMITIDAS:", corsConfig.ALLOWED_ORIGINS);

/* ============================
 * CORS
 * ============================ */
app.use("/uploads", cors(corsConfig.withoutCredentials));
app.use("/uploads", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=31536000");
  next();
});
app.use("/api", cors(corsConfig.withCredentials));

/* ============================
 * Segurança: Helmet
 * ============================ */
app.use(helmet(helmetConfig));

// Cross-Origin-Resource-Policy: cross-origin para /uploads
// (Helmet define same-origin globalmente; sobrescreve só para arquivos estáticos)
app.use("/uploads", (_req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

/* ============================
 * Logging
 * ============================ */
app.use(requestLogger);

/* ============================
 * Middlewares Globais
 * ============================ */
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ============================
 * Arquivos estáticos: uploads
 * ============================ */
app.use("/uploads", express.static(UPLOADS_DIR));

// Debug de uploads (apenas fora de produção)
if (process.env.NODE_ENV !== "production") {
  app.use("/uploads", (req, _res, next) => {
    try {
      const raw = req.originalUrl;
      const decoded = decodeURIComponent(raw);
      const rel = decoded.replace(/^\/uploads\/?/i, "");
      const diskPath = path.resolve(UPLOADS_DIR, String(rel).trim());
      const isInsideUploads = diskPath === UPLOADS_DIR || diskPath.startsWith(UPLOADS_DIR + path.sep);
      console.info("[uploads-debug] arquivo não servido pelo express.static:", {
        method: req.method, raw, decoded, rel, diskPath, isInsideUploads,
      });
    } catch (err) {
      console.warn("[uploads-debug] erro ao processar caminho:", err.message);
    }
    next();
  });
}

/* ============================
 * Health Check
 * ============================ */
app.get("/health", async (_req, res) => {
  const checks = {};

  // --- Database (critical) ---
  const t0db = Date.now();
  try {
    await pool.query("SELECT 1");
    checks.database = { status: "ok", latency_ms: Date.now() - t0db };
  } catch {
    checks.database = { status: "error", detail: "unreachable" };
  }

  // --- Redis (optional — app has in-memory fallback) ---
  if (redis.client) {
    const t0r = Date.now();
    try {
      await redis.client.ping();
      checks.redis = { status: "ok", latency_ms: Date.now() - t0r };
    } catch {
      checks.redis = { status: "error", detail: "unreachable" };
    }
  } else {
    checks.redis = { status: "disabled" };
  }

  // --- Storage (optional — missing dir blocks uploads, not API) ---
  try {
    await fs.promises.access(UPLOADS_DIR, fs.constants.R_OK | fs.constants.W_OK);
    checks.storage = { status: "ok", path: "/uploads" };
  } catch {
    checks.storage = { status: "error", path: "/uploads", detail: "not writable" };
  }

  const dbOk = checks.database.status === "ok";
  const allOk = dbOk
    && checks.redis.status !== "error"
    && checks.storage.status === "ok";
  const overall = !dbOk ? "error" : !allOk ? "degraded" : "ok";

  return res.status(dbOk ? 200 : 503).json({
    status: overall,
    ts: new Date().toISOString(),
    env: process.env.NODE_ENV,
    uptime: Math.floor(process.uptime()),
    checks,
  });
});

/* ============================
 * Rate Limiter
 * Usa Redis se disponível; fallback para Map in-memory.
 * ============================ */
const rateLimiterStore = redis.ready
  ? new RedisRateLimiterStore(redis.client, { prefix: "rl:global:", ttlMs: 15 * 60_000 })
  : new Map();

const rateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => req.ip || crypto.randomUUID(),
  store: rateLimiterStore,
});
app.use(rateLimiter);

/* ============================
 * Debug de uploads (rota protegida)
 * ============================ */
if (process.env.NODE_ENV !== "production") {
  const verifyAdmin = require("./middleware/verifyAdmin");
  app.get("/__debug/uploads", verifyAdmin, (_req, res) => {
    const uploadsExists = fs.existsSync(UPLOADS_DIR);
    const result = { uploadsDir: UPLOADS_DIR, uploadsExists, subdirs: {} };

    if (uploadsExists) {
      try {
        const entries = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subdirPath = path.join(UPLOADS_DIR, entry.name);
            try {
              const files = fs.readdirSync(subdirPath);
              result.subdirs[entry.name] = files.map((filename) => {
                const filePath = path.join(subdirPath, filename);
                try {
                  const stat = fs.statSync(filePath);
                  return { filename, size: stat.size, mtime: stat.mtime, url: `/uploads/${entry.name}/${filename}` };
                } catch {
                  return { filename, error: "stat failed" };
                }
              });
            } catch {
              result.subdirs[entry.name] = [];
            }
          }
        }
      } catch (err) {
        result.error = err.message;
      }
    }

    return res.json(result);
  });
}

/* ============================
 * Rotas da API
 * ============================ */
app.use("/api", requestTimeout(30_000)); // 30s timeout para rotas de API
app.get("/api/csrf-token", issueCsrfToken);
app.use("/api", apiRoutes);
console.info("✅ Sistema de rotas centralizado carregado em /api");

/* ============================
 * Swagger — disabled in production to prevent API documentation leak
 * ============================ */
if (process.env.NODE_ENV !== "production") {
  setupDocs(app);
}

/* ============================
 * Tratamento de Erros (404 & 500)
 * ============================ */
app.use((req, _res, next) => {
  next(new AppError(`Rota não encontrada: ${req.method} ${req.originalUrl}`, ERROR_CODES.NOT_FOUND, 404));
});

app.use(errorHandler);

/* ============================
 * Inicialização do Servidor
 * ============================ */
if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 5000;

  const server = app.listen(PORT, () => {
    console.info(`✅ Server rodando em http://localhost:${PORT}`);
    console.info(`📚 Swagger em: http://localhost:${PORT}/docs`);
    console.info(`🌐 APP_URL configurada: ${config.appUrl}`);
    console.info(`🖼️  Uploads servidos em: http://localhost:${PORT}/uploads (dir: ${UPLOADS_DIR})`);

    if (redis.ready) {
      console.info("[rateLimiter] Store Redis-backed ativo — contadores compartilhados entre instâncias.");
    } else {
      console.warn(
        "⚠️ [rateLimiter] Redis indisponível — fallback para store in-memory (Map por processo)."
      );
    }

    startWorkers();
  });

  registerShutdownHandlers(server);
}

module.exports = app;
