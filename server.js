require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const logger = require("./config/logger");
const requestLogger = require("./middleware/requestLogger");
const metricsMiddleware = require("./middleware/metrics");
const metrics = require("./monitoring/metrics");
const pool = require("./config/pool");
const { setupDocs } = require("./docs/swagger");

const app = express();

// ============================
// Middleware base
// ============================
const ALLOWED = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED.includes(origin)) return cb(null, true);
      cb(new Error(`CORS bloqueado para origem: ${origin}`));
    },
    credentials: true,
  })
);

app.use(requestLogger);
app.use(metricsMiddleware);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// arquivos estáticos
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ============================
// Rotas públicas e admin
// ============================
try { app.use("/api/products", require("./routes/products")); } catch {}
try { app.use("/api/products", require("./routes/productById")); } catch {}
try { app.use("/api/public/categorias", require("./routes/publicCategorias")); } catch {}
try { app.use("/api/public/servicos", require("./routes/publicServicos")); } catch {}
try { app.use("/api/public/destaques", require("./routes/publicDestaques")); } catch {}
try { app.use("/api/public/produtos", require("./routes/publicProdutos")); } catch {}
try { app.use("/api/login", require("./routes/login")); } catch {}
try { app.use("/api/users", require("./routes/users")); } catch {}
try { app.use("/api/checkout", require("./routes/checkoutRoutes")); } catch {}
try { app.use("/api/payment", require("./routes/payment")); } catch {}
try { app.use("/api", require("./routes/authRoutes")); } catch {}
try { app.use("/api/pedidos", require("./routes/pedidos")); } catch {}

// Admin
try { app.use("/api/admin", require("./routes/adminLogin")); } catch {}
try { app.use("/api/admin/categorias", require("./routes/adminCategorias")); } catch {}
try { app.use("/api/admin/colaboradores", require("./routes/adminColaboradores")); } catch {}
try { app.use("/api/admin/destaques", require("./routes/adminDestaques")); } catch {}
try { app.use("/api/admin/especialidades", require("./routes/adminEspecialidades")); } catch {}
try { app.use("/api/admin/pedidos", require("./routes/adminPedidos")); } catch {}
try { app.use("/api/admin/produtos", require("./routes/adminProdutos")); } catch {}
try { app.use("/api/admin/servicos", require("./routes/adminServicos")); } catch {}

// ============================
// Swagger (⚠️ antes do 404!)
// ============================
setupDocs(app);

app.get("/healthz", async (_req, res) => {
  const payload = {
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
    dependencies: {},
  };

  if (process.env.NODE_ENV === "test" || process.env.DISABLE_DB_HEALTHCHECK === "true") {
    payload.dependencies.database = { status: "skipped" };
    return res.status(200).json(payload);
  }

  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    payload.dependencies.database = { status: "up" };
  } catch (error) {
    payload.status = "degraded";
    payload.dependencies.database = {
      status: "down",
      error: process.env.NODE_ENV === "production" ? undefined : error.message,
    };
    logger.error({ error }, "Falha no health check do banco de dados");
  }

  const statusCode = payload.status === "ok" ? 200 : 503;
  res.status(statusCode).json(payload);
});

app.get("/metrics", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(metrics.getMetrics());
});

// ============================
// 404 - deve vir depois do setupDocs
// ============================
app.use((req, _res, next) => {
  const err = new Error(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
});

// ============================
// Handler de erro central
// ============================
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  const requestId = req?.id || res.getHeader("x-request-id") || uuidv4();
  res.setHeader("x-request-id", requestId);

  const isServerError = status >= 500;
  const message = isServerError && process.env.NODE_ENV === "production" ? "Erro interno" : err.message;
  const response = {
    message: message || "Erro interno",
    requestId,
  };

  if (process.env.NODE_ENV !== "production" && err.stack) {
    response.stack = err.stack;
  }

  if (res.locals) {
    res.locals.error = {
      message: err.message,
      status,
    };
  }

  const logPayload = {
    statusCode: status,
    requestId,
    path: req?.originalUrl,
    method: req?.method,
  };

  if (err instanceof Error) {
    logPayload.error = {
      message: err.message,
      stack: err.stack,
    };
  }

  const targetLogger = req?.log || logger;
  if (isServerError) {
    targetLogger.error(logPayload, message || "Erro interno");
  } else {
    targetLogger.warn(logPayload, message || "Erro");
  }

  res.status(status).json(response);
});

// ============================
// Start condicional (somente fora de teste)
// ============================
if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    logger.info(`✅ Server rodando em http://localhost:${PORT}`);
    logger.info(`📚 Swagger em: http://localhost:${PORT}/docs`);
  });
}

// Exporta o app para uso nos testes
module.exports = app;
