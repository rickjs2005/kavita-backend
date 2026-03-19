require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const logger = console;

const config = require("./config/env");
const pool = require("./config/pool");
const { setupDocs } = require("./docs/swagger");

// Imports refatorados
const apiRoutes = require("./routes");
const createAdaptiveRateLimiter = require("./middleware/adaptiveRateLimiter");
const { issueCsrfToken } = require("./middleware/csrfProtection");

// ✅ Importações para tratamento de erro
const errorHandler = require("./middleware/errorHandler");
const AppError = require("./errors/AppError");
const ERROR_CODES = require("./constants/ErrorCodes");

// ✅ WORKER: notificações de carrinho abandonado (email automático)
let startAbandonedCartNotificationsWorker;
try {
  ({ startAbandonedCartNotificationsWorker } = require("./workers/abandonedCartNotificationsWorker"));
} catch (err) {
  logger.warn(
    "⚠️ Worker de notificações não carregado (arquivo ausente ou erro no require):",
    err.message
  );
}

const app = express();

// ✅ SEGURANÇA: necessário para req.ip correto atrás de nginx/proxy reverso
app.set("trust proxy", 1);

/* ============================
 * Garantir que o diretório de uploads exista
 * ============================ */

// ✅ IMPORTANTE: caminho estável (evita CWD diferente no Windows/PM2/Tasks)
const UPLOADS_DIR = path.resolve(__dirname, "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  logger.info(`📁 Diretório de uploads criado: ${UPLOADS_DIR}`);
} else {
  logger.info(`📁 Diretório de uploads OK: ${UPLOADS_DIR}`);
}

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

// ✅ CORS Config com credentials (para /api)
const corsWithCredentials = {
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
  credentials: true,  // ✅ PARA AUTENTICAÇÃO (login, cookies)
};

// ✅ CORS Config SEM credentials (para /uploads)
const corsWithoutCredentials = {
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
  // ✅ SEM credentials (arquivos estáticos não precisam)
};

// ✅ APLICAR CORS: UPLOADS PRIMEIRO (sem credentials)
app.use("/uploads", cors(corsWithoutCredentials));

// ✅ NOVO: Middleware extra para garantir CORS em 304s e outras respostas
app.use("/uploads", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=31536000");
  next();
});

// ✅ APLICAR CORS: API DEPOIS (com credentials)
app.use("/api", cors(corsWithCredentials));

/* ============================
 * Segurança: Helmet (Security Headers)
 * ============================ */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
          "https:",
          "http://localhost:5000",
          "http://127.0.0.1:5000",
          "http://localhost:3000",
          "http://127.0.0.1:3000",
        ],
        connectSrc: [
          "'self'",
          "http://localhost:5000",
          "http://127.0.0.1:5000",
          "http://localhost:3000",
        ],
        mediaSrc: [
          "'self'",
          "http://localhost:5000",
          "http://127.0.0.1:5000",
          "https:",
        ],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

/* ============================
 * Cross-Origin-Resource-Policy para /uploads
 * Helmet define CORP: same-origin globalmente.
 * Arquivos estáticos precisam de CORP: cross-origin para carregar em
 * origens diferentes (ex: frontend em localhost:3000 carregando
 * imagens de localhost:5000 via <img> / <video>).
 * Este middleware sobrescreve apenas para /uploads, preservando
 * a política same-origin no restante das rotas.
 * ============================ */
app.use("/uploads", (_req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

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

// ✅ Middleware de debug para /uploads
app.use("/uploads", (req, _res, next) => {
  try {
    const raw = req.originalUrl;
    const decoded = decodeURIComponent(raw);
    const rel = decoded.replace(/^\/uploads\/?/i, "");
    const cleanedRel = String(rel).trim();

    const diskPath = path.resolve(UPLOADS_DIR, cleanedRel);
    const isInsideUploads =
      diskPath === UPLOADS_DIR || diskPath.startsWith(UPLOADS_DIR + path.sep);

    logger.info("[uploads-debug] arquivo não servido pelo express.static:", {
      method: req.method,
      raw,
      decoded,
      rel,
      cleanedRel,
      diskPath,
      isInsideUploads,
    });
  } catch (err) {
    logger.warn("[uploads-debug] erro ao processar caminho:", err.message);
  }

  next();
});

/* ============================
 * Health Check
 * Montado antes do rate limiter para responder sempre,
 * independente de carga ou estado do limitador.
 * ============================ */
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({
      status: "ok",
      ts: new Date().toISOString(),
      env: process.env.NODE_ENV,
    });
  } catch {
    return res.status(503).json({
      status: "error",
      detail: "database unreachable",
    });
  }
});

/* ============================
 * Segurança: Rate Limiter
 * ============================ */
// LIMITAÇÃO CONHECIDA: store in-memory (Map por processo).
// Em PM2 cluster ou múltiplas instâncias, cada worker tem contadores independentes.
// Para produção multi-instância, passe um store Redis-backed via opção `store`.
// BLOQUEADOR para Redis-backed store: a interface de store é síncrona (store.get()
// retorna valor direto). Redis é assíncrono — uma implementação Redis-backed exigiria
// tornar o middleware async, o que é uma mudança de arquitetura maior.
// Enquanto isso, o rate limit global opera apenas por processo.
const rateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => req.ip || crypto.randomUUID(),
});
app.use(rateLimiter);

/* ============================
 * Debug de uploads (após rate limiter)
 * Disponível apenas fora de produção (NODE_ENV !== "production")
 * ============================ */

if (process.env.NODE_ENV !== "production") {
  const verifyAdmin = require("./middleware/verifyAdmin");
  app.get("/__debug/uploads", verifyAdmin, (_req, res) => {
    const uploadsExists = fs.existsSync(UPLOADS_DIR);

    const result = {
      uploadsDir: UPLOADS_DIR,
      uploadsExists,
      subdirs: {},
    };

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
                  return {
                    filename,
                    size: stat.size,
                    mtime: stat.mtime,
                    url: `/uploads/${entry.name}/${filename}`,
                  };
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
 * Rotas da API (Centralizadas)
 * ============================ */
app.get("/api/csrf-token", issueCsrfToken);
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
 * Inicialização do Servidor + Workers
 * ============================ */
if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 5000;

  const server = app.listen(PORT, () => {
    logger.info(`✅ Server rodando em http://localhost:${PORT}`);
    logger.info(`📚 Swagger em: http://localhost:${PORT}/docs`);
    logger.info(`🌐 APP_URL configurada: ${config.appUrl}`);
    logger.info(
      `🖼️ Uploads servidos em: http://localhost:${PORT}/uploads (dir: ${UPLOADS_DIR})`
    );

    // ============================
    // AVISOS OPERACIONAIS DE STARTUP
    // ============================
    logger.warn(
      "⚠️ [rateLimiter] Store in-memory (Map por processo). " +
      "Em PM2 cluster/multi-instância os contadores NÃO são compartilhados entre workers. " +
      "Implemente store Redis-backed se necessário (ver comentário acima de createAdaptiveRateLimiter)."
    );

    // ============================
    // WORKERS
    // ============================
    const disableNotifs =
      String(process.env.DISABLE_NOTIFICATIONS || "false") === "true";

    if (disableNotifs) {
      logger.warn(
        "🚫 Notificações automáticas DESABILITADAS (DISABLE_NOTIFICATIONS=true)"
      );
      return;
    }

    if (typeof startAbandonedCartNotificationsWorker === "function") {
      startAbandonedCartNotificationsWorker();
      logger.info("📨 Worker de notificações de carrinho abandonado iniciado");
    } else {
      logger.warn(
        "⚠️ Worker de notificações NÃO iniciado (função startAbandonedCartNotificationsWorker indisponível)."
      );
    }
  });

  /* ============================
   * Graceful Shutdown
   * ============================ */
  const shutdown = async (signal) => {
    logger.warn(`[${signal}] Sinal recebido. Iniciando graceful shutdown...`);

    // Força saída após 30s caso alguma conexão trave o encerramento
    const forceExit = setTimeout(() => {
      logger.error("[shutdown] Timeout de 30s atingido. Forçando saída.");
      process.exit(1);
    }, 30_000);
    // Não impede o event loop de sair enquanto aguarda
    forceExit.unref();

    // Para de aceitar novas conexões e aguarda as ativas finalizarem
    server.close(async () => {
      logger.info("[shutdown] Servidor HTTP encerrado.");

      try {
        await pool.end();
        logger.info("[shutdown] Pool MySQL encerrado.");
      } catch (err) {
        logger.error("[shutdown] Erro ao encerrar pool MySQL:", err.message);
      }

      logger.info("[shutdown] Processo encerrado com sucesso.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

module.exports = app;