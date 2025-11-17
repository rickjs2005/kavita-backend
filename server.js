require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const logger = console;
const cookieParser = require("cookie-parser");
const config = require("./config/env");
const { setupDocs } = require("./docs/swagger");

const app = express();

/* ============================
 *  CORS: origens permitidas
 * ============================ */

// normaliza origem: remove barra final
const normalizeOrigin = (origin) => {
  if (!origin) return null;
  return origin.replace(/\/$/, "").trim();
};

// monta lista de origens possíveis
const rawOrigins = [
  process.env.ALLOWED_ORIGINS, // pode ter várias separadas por vírgula
  config.appUrl,
  config.backendUrl,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

// quebra por vírgula, normaliza e remove vazios
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

/* ============================
 *  Middleware base
 * ============================ */

app.use(
  cors({
    origin: (origin, cb) => {
      // requisições sem origin (Postman, curl) são permitidas
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

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// arquivos estáticos
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use(cookieParser());

/* ============================
 *  Helper para registrar rotas
 * ============================ */

function safeUse(pathPrefix, routePath) {
  try {
    // eslint-disable-next-line global-require
    const router = require(routePath);
    app.use(pathPrefix, router);
    logger.info(`✅ Rotas carregadas: ${routePath} em ${pathPrefix}`);
  } catch (err) {
    logger.error(`❌ Erro ao carregar rotas de ${routePath}:`, err.message);
  }
}

/* ============================
 *  Rotas públicas e de usuário
 * ============================ */

// Produtos públicos
safeUse("/api/products", "./routes/products");
safeUse("/api/products", "./routes/productById"); // se esse for só /:id, pode manter aqui

// Catálogo público
safeUse("/api/public/categorias", "./routes/publicCategorias");
safeUse("/api/public/servicos", "./routes/publicServicos");
safeUse("/api/public/destaques", "./routes/publicDestaques");
safeUse("/api/public/produtos", "./routes/publicProdutos");

// Autenticação / usuários
safeUse("/api/login", "./routes/login");
safeUse("/api/users", "./routes/users");
safeUse("/api/users", "./routes/userProfile");
safeUse("/api", "./routes/authRoutes");

// Checkout / pagamento / pedidos do cliente
safeUse("/api/checkout", "./routes/checkoutRoutes");
safeUse("/api/payment", "./routes/payment");
safeUse("/api/pedidos", "./routes/pedidos");

/* ============================
 *  Rotas admin
 * ============================ */

safeUse("/api/admin", "./routes/adminLogin");
safeUse("/api/admin/categorias", "./routes/adminCategorias");
safeUse("/api/admin/colaboradores", "./routes/adminColaboradores");
safeUse("/api/admin/destaques", "./routes/adminDestaques");
safeUse("/api/admin/especialidades", "./routes/adminEspecialidades");
safeUse("/api/admin/pedidos", "./routes/adminPedidos");
safeUse("/api/admin/produtos", "./routes/adminProdutos");
safeUse("/api/admin/servicos", "./routes/adminServicos");

/* ============================
 *  Swagger (antes do 404)
 * ============================ */

setupDocs(app);

/* ============================
 *  404 - rota não encontrada
 * ============================ */

app.use((req, _res, next) => {
  const err = new Error(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
});

/* ============================
 *  Handler de erro central
 * ============================ */

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const payload = {
    message: err.message || "Erro interno",
    requestId: crypto.randomUUID?.() || String(Date.now()),
  };

  // Em desenvolvimento, mostra stack pra ajudar
  if (process.env.NODE_ENV !== "production" && err.stack) {
    payload.stack = err.stack;
  }

  if (status >= 500) {
    logger.error("💥 Erro interno:", err);
  } else {
    logger.warn("⚠️ Erro:", err.message);
  }

  res.status(status).json(payload);
});

/* ============================
 *  Start condicional
 * ============================ */

if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    logger.info(`✅ Server rodando em http://localhost:${PORT}`);
    logger.info(`📚 Swagger em: http://localhost:${PORT}/docs`);
    logger.info(`🌐 APP_URL configurada: ${config.appUrl}`);
    logger.info(`🛠️ BACKEND_URL configurada: ${config.backendUrl}`);
  });
}

// Exporta o app para testes (Jest, Supertest, etc.)
module.exports = app;
