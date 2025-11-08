require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const logger = console;
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
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const payload = {
    message: err.message || "Erro interno",
    requestId: crypto.randomUUID?.() || String(Date.now()),
  };
  if (process.env.NODE_ENV !== "production" && err.stack) {
    payload.stack = err.stack;
  }
  res.status(status).json(payload);
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
