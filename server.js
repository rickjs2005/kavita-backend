// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

// Middlewares/infra
const verifyAdmin = require("./middleware/verifyAdmin");
const pool = require("./config/pool");

const app = express();

/* =========================
   CORS & Body Parser
========================= */
const ALLOWED = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // permite Postman/Thunder (sem origin)
      if (!origin) return cb(null, true);
      if (ALLOWED.includes(origin)) return cb(null, true);
      return cb(new Error("Origin não permitido pelo CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

/* =========================
   Healthcheck & Meta
========================= */
app.get("/", (_req, res) => res.json({ ok: true, name: "kavita-backend" }));

app.get("/api/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "up" });
  } catch (e) {
    res.status(500).json({ ok: false, db: "down", error: e.message });
  }
});

/* =========================
   Helpers p/ montar rotas
========================= */
const mount = (base, file) => {
  app.use(base, require(file)); // monta rota pública
};
const protect = (base, file) => {
  app.use(base, verifyAdmin, require(file)); // rota protegida (admin)
};

/* =========================
   Rotas Públicas
========================= */
// Produtos (lista + filtros: category=all|id|slug, search=...)
// -> routes/products.js
try { mount("/api/products", "./routes/products"); } catch {}

// Produto por ID: GET /api/products/:id
// -> routes/productById.js
try { mount("/api/products", "./routes/productById"); } catch {}

// Categorias públicas: GET /api/public/categorias
// -> routes/publicCategorias.js
try { mount("/api/public/categorias", "./routes/publicCategorias"); } catch {}

// Outras públicas que você já usa (se existirem)
try { mount("/api/public/produtos", "./routes/publicProdutos"); } catch {}
try { mount("/api/public/destaques", "./routes/publicDestaques"); } catch {}
try { mount("/api/public/servicos", "./routes/publicServicos"); } catch {}

// Checkout (se existir)
try { mount("/api/checkout", "./routes/checkoutRoutes"); } catch {}

/* =========================
   Autenticação
========================= */
// Login admin
try { mount("/api/admin", "./routes/adminLogin"); } catch {}

// Login usuário comum (se existir)
try { mount("/api/login", "./routes/login"); } catch {}

/* =========================
   Rotas Admin (protegidas)
========================= */
try { protect("/api/admin/categorias", "./routes/adminCategorias"); } catch {}
try { protect("/api/admin/colaboradores", "./routes/adminColaboradores"); } catch {}
try { protect("/api/admin/destaques", "./routes/adminDestaques"); } catch {}
try { protect("/api/admin/especialidades", "./routes/adminEspecialidades"); } catch {}
try { protect("/api/admin/pedidos", "./routes/adminPedidos"); } catch {}
try { protect("/api/admin/produtos", "./routes/adminProdutos"); } catch {}
try { protect("/api/admin/servicos", "./routes/adminServicos"); } catch {}
// Se tiver módulo de usuários admin
try { protect("/api/admin/users", "./routes/users"); } catch {}
// E versão pública (se existir)
try { mount("/api/users", "./routes/users"); } catch {}

/* =========================
   404 & Error Handler
========================= */
app.use((req, _res, next) => {
  const err = new Error(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const payload = { message: err.message || "Erro interno do servidor" };
  if (process.env.NODE_ENV !== "production" && err.stack) payload.stack = err.stack;
  res.status(status).json(payload);
});

/* =========================
   Start
========================= */
const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server rodando em http://localhost:${PORT}`);
  console.log(`   CORS: ${ALLOWED.join(", ")}`);
});
