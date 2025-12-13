// routes/index.js
const router = require("express").Router();

// Middlewares / auth
const verifyAdmin = require("../middleware/verifyAdmin");

// Rotas Admin protegidas específicas (já existiam)
const adminLogsRoutes = require("./adminLogsRoutes");
const adminPermissionsRoutes = require("./adminPermissionsRoutes");
const adminRolesRoutes = require("./adminRolesRoutes");
const adminAdminsRoutes = require("./adminAdminsRoutes");

// Função auxiliar para carregar rotas com tratamento de erros
function loadRoute(path, moduleName) {
  try {
    const routeModule = require(moduleName);
    router.use(path, routeModule);
  } catch (err) {
    console.error(`❌ Erro ao carregar rota ${moduleName}:`, err.message);
  }
}

/* ============================
 * Rotas Públicas e Produtos
 * ============================ */

// Produtos públicos
loadRoute("/products", "./products");
loadRoute("/products", "./productById");

// Catálogo Público
loadRoute("/public/categorias", "./publicCategorias");
loadRoute("/public/servicos", "./publicServicos");
loadRoute("/public/servicos", "./publicAvaliacaoColaborador");

// ✅ NOVO: rota pública de promoções (Marketing)
loadRoute("/public/promocoes", "./publicPromocoes");

loadRoute("/public/produtos", "./publicProdutos");

/* ============================
 * Autenticação e Usuários
 * ============================ */

loadRoute("/login", "./login");
loadRoute("/users", "./users");
loadRoute("/users", "./userProfile");
loadRoute("/users/addresses", "./userAddresses");
loadRoute("/cart", "./cart");
loadRoute("/favorites", "./favorites");

// Este arquivo inteiro será montado em "/api"
loadRoute("/", "./authRoutes");

/* ============================
 * Checkout e Pagamento
 * ============================ */

loadRoute("/checkout", "./checkoutRoutes");
loadRoute("/payment", "./payment");
loadRoute("/pedidos", "./pedidos");

/* ============================
 * Área Admin - Rotas Públicas (Login)
 * ============================ */

loadRoute("/admin", "./adminLogin");

/* ============================
 * Área Admin - Rotas Protegidas
 * ============================ */

// Categorias
try {
  const adminCategoriasRoutes = require("./adminCategorias");
  router.use("/admin/categorias", verifyAdmin, adminCategoriasRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminCategorias:", err.message);
}

// Colaboradores
try {
  const adminColaboradoresRoutes = require("./adminColaboradores");
  router.use("/admin/colaboradores", verifyAdmin, adminColaboradoresRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminColaboradores:", err.message);
}

// Marketing > Promoções
try {
  const adminMarketingPromocoesRoutes = require("./adminMarketingPromocoes");
  router.use(
    "/admin/marketing/promocoes",
    verifyAdmin,
    adminMarketingPromocoesRoutes
  );
} catch (err) {
  console.error(
    "❌ Erro ao carregar ./adminMarketingPromocoes:",
    err.message
  );
}

// Especialidades
try {
  const adminEspecialidadesRoutes = require("./adminEspecialidades");
  router.use("/admin/especialidades", verifyAdmin, adminEspecialidadesRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminEspecialidades:", err.message);
}

// Pedidos
try {
  const adminPedidosRoutes = require("./adminPedidos");
  router.use("/admin/pedidos", verifyAdmin, adminPedidosRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminPedidos:", err.message);
}

// Produtos
try {
  const adminProdutosRoutes = require("./adminProdutos");
  router.use("/admin/produtos", verifyAdmin, adminProdutosRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminProdutos:", err.message);
}

// Serviços
try {
  const adminServicosRoutes = require("./adminServicos");
  router.use("/admin/servicos", verifyAdmin, adminServicosRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminServicos:", err.message);
}

// Solicitações de serviços
try {
  const adminSolicitacoesServicosRoutes = require("./adminSolicitacoesServicos");
  router.use(
    "/admin/servicos/solicitacoes",
    verifyAdmin,
    adminSolicitacoesServicosRoutes
  );
} catch (err) {
  console.error(
    "❌ Erro ao carregar ./adminSolicitacoesServicos:",
    err.message
  );
}

// Usuários
try {
  const adminUsersRoutes = require("./adminUsers");
  router.use("/admin/users", verifyAdmin, adminUsersRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminUsers:", err.message);
}

// Stats
try {
  const adminStatsRoutes = require("./adminStats");
  router.use("/admin/stats", verifyAdmin, adminStatsRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminStats:", err.message);
}

// Carrinhos
try {
  const adminCartsRoutes = require("./adminCarts");
  router.use("/admin/carrinhos", verifyAdmin, adminCartsRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminCarts:", err.message);
}

// Comunicação
try {
  const adminComunicacaoRoutes = require("./adminComunicacao");
  router.use("/admin/comunicacao", verifyAdmin, adminComunicacaoRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminComunicacao:", err.message);
}

// Cupons
try {
  const adminCuponsRoutes = require("./adminCupons");
  router.use("/admin/cupons", verifyAdmin, adminCuponsRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminCupons:", err.message);
}

// Configurações
try {
  const adminConfigRoutes = require("./adminConfigRoutes");
  router.use("/admin/config", verifyAdmin, adminConfigRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminConfigRoutes:", err.message);
}

// Relatórios
try {
  const adminRelatoriosRoutes = require("./adminRelatorios");
  router.use("/admin/relatorios", verifyAdmin, adminRelatoriosRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminRelatorios:", err.message);
}

/* ============================
 * Rotas Admin específicas (continuam protegidas)
 * ============================ */

router.use("/admin/logs", verifyAdmin, adminLogsRoutes);
router.use("/admin/permissions", verifyAdmin, adminPermissionsRoutes);
router.use("/admin/roles", verifyAdmin, adminRolesRoutes);
router.use("/admin/admins", verifyAdmin, adminAdminsRoutes);

module.exports = router;
