// server.js (refatorado)
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
  // monta uma rota sem proteção
  app.use(base, require(file));
};
const protect = (base, file) => {
  // monta rota protegida por JWT admin
  app.use(base, verifyAdmin, require(file));
};

/* =========================
   Rotas Públicas (/api/public)
========================= */
try { mount("/api/public/produtos", "./routes/publicProdutos"); } catch {}
try { mount("/api/public/destaques", "./routes/publicDestaques"); } catch {}
try { mount("/api/public/servicos", "./routes/publicServicos"); } catch {}

// compat legado (se ainda usa)
try { mount("/api/products", "./routes/products"); } catch {}
try { mount("/api/checkout", "./routes/checkoutRoutes"); } catch {}

/* =========================
   Autenticação
========================= */
// login admin (público)
try { mount("/api/admin", "./routes/adminLogin"); } catch {}

// login usuário comum (se existir)
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
// se tiver módulo users administrativo
try { protect("/api/admin/users", "./routes/users"); } catch {}

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
