// routes/index.js
const router = require("express").Router();

// Middlewares / auth
const verifyAdmin = require("../middleware/verifyAdmin");
const { validateCSRF } = require("../middleware/csrfProtection");

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

// ✅ FIX: Configuração pública da loja (já existe o arquivo, faltava montar)
loadRoute("/config", "./publicShopConfigRoutes");

/* ============================
 * Autenticação e Usuários
 * ============================ */

loadRoute("/login", "./login");
loadRoute("/users", "./users");

// Authenticated user routes — apply CSRF protection for state-changing operations
try {
  const userProfileRoutes = require("./userProfile");
  router.use("/users", validateCSRF, userProfileRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./userProfile:", err.message);
}
try {
  const userAddressesRoutes = require("./userAddresses");
  router.use("/users/addresses", validateCSRF, userAddressesRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./userAddresses:", err.message);
}
try {
  const cartRoutes = require("./cart");
  router.use("/cart", validateCSRF, cartRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./cart:", err.message);
}
try {
  const favoritesRoutes = require("./favorites");
  router.use("/favorites", validateCSRF, favoritesRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./favorites:", err.message);
}
loadRoute("/public/site-hero", "./publicSiteHero");

// Este arquivo inteiro será montado em "/api"
loadRoute("/", "./authRoutes");

// checkout, pedidos e frete
loadRoute("/shipping", "./shippingRoutes");
try {
  const checkoutRoutes = require("./checkoutRoutes");
  router.use("/checkout", validateCSRF, checkoutRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./checkoutRoutes:", err.message);
}
loadRoute("/payment", "./payment");
try {
  const pedidosRoutes = require("./pedidos");
  router.use("/pedidos", validateCSRF, pedidosRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./pedidos:", err.message);
}

/* ============================
 * Área Admin - Rotas Públicas (Login)
 * ============================ */

loadRoute("/admin", "./adminLogin");

// Kavita News (Público)
loadRoute("/news", "./newsPublicRoutes");

/* ============================
 * Módulo Kavita Drones
 * ============================ */
loadRoute("/public/drones", "./publicDrones");

console.log("✅ publicDrones montado!");

/* ============================
 * Área Admin - Rotas Protegidas
 * ============================ */

// Categorias
try {
  const adminCategoriasRoutes = require("./adminCategorias");
  router.use("/admin/categorias", verifyAdmin, validateCSRF, adminCategoriasRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminCategorias:", err.message);
}

// Colaboradores
try {
  const adminColaboradoresRoutes = require("./adminColaboradores");
  router.use("/admin/colaboradores", verifyAdmin, validateCSRF, adminColaboradoresRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminColaboradores:", err.message);
}

/// Marketing > Promoções
try {
  const adminMarketingPromocoesRoutes = require("./adminMarketingPromocoes");
  router.use(
    "/admin/marketing/promocoes",
    verifyAdmin,
    validateCSRF,
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
  router.use("/admin/especialidades", verifyAdmin, validateCSRF, adminEspecialidadesRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminEspecialidades:", err.message);
}

// Pedidos
try {
  const adminPedidosRoutes = require("./adminPedidos");
  router.use("/admin/pedidos", verifyAdmin, validateCSRF, adminPedidosRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminPedidos:", err.message);
}

// Produtos
try {
  const adminProdutosRoutes = require("./adminProdutos");
  router.use("/admin/produtos", verifyAdmin, validateCSRF, adminProdutosRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminProdutos:", err.message);
}

// Serviços
try {
  const adminServicosRoutes = require("./adminServicos");
  router.use("/admin/servicos", verifyAdmin, validateCSRF, adminServicosRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminServicos:", err.message);
}

// Solicitações de serviços
try {
  const adminSolicitacoesServicosRoutes = require("./adminSolicitacoesServicos");
  router.use(
    "/admin/servicos/solicitacoes",
    verifyAdmin,
    validateCSRF,
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
  router.use("/admin/users", verifyAdmin, validateCSRF, adminUsersRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminUsers:", err.message);
}

// Stats
try {
  const adminStatsRoutes = require("./adminStats");
  router.use("/admin/stats", verifyAdmin, validateCSRF, adminStatsRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminStats:", err.message);
}

// Carrinhos
try {
  const adminCartsRoutes = require("./adminCarts");
  router.use("/admin/carrinhos", verifyAdmin, validateCSRF, adminCartsRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminCarts:", err.message);
}

// Comunicação
try {
  const adminComunicacaoRoutes = require("./adminComunicacao");
  router.use("/admin/comunicacao", verifyAdmin, validateCSRF, adminComunicacaoRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminComunicacao:", err.message);
}

// Cupons
try {
  const adminCuponsRoutes = require("./adminCupons");
  router.use("/admin/cupons", verifyAdmin, validateCSRF, adminCuponsRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminCupons:", err.message);
}

// Configurações
try {
  const adminConfigRoutes = require("./adminConfigRoutes");
  router.use("/admin/config", verifyAdmin, validateCSRF, adminConfigRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminConfigRoutes:", err.message);
}

// Relatórios
try {
  const adminRelatoriosRoutes = require("./adminRelatorios");
  router.use("/admin/relatorios", verifyAdmin, validateCSRF, adminRelatoriosRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminRelatorios:", err.message);
}

// Kavita News (Admin)
try {
  const adminNewsRoutes = require("./adminNewsRoutes");
  router.use("/admin/news", verifyAdmin, validateCSRF, adminNewsRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminNewsRoutes:", err.message);
}

// ✅ NOVO: Admin Drones (Kavita Drones)
try {
  const adminDronesRoutes = require("./adminDrones");
  router.use("/admin/drones", verifyAdmin, validateCSRF, adminDronesRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminDrones:", err.message);
}

/** ✅ NOVO: Admin Shipping (Frete por zonas UF/cidades)
 * O arquivo define rotas /zones, então montamos em /admin/shipping
 */
try {
  const adminShippingZonesRoutes = require("./adminShippingZonesRoutes");
  router.use("/admin/shipping", verifyAdmin, validateCSRF, adminShippingZonesRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminShippingZonesRoutes:", err.message);
}
// Site Hero (Admin)
try {
  const adminSiteHeroRoutes = require("./adminSiteHero");
  router.use("/admin/site-hero", verifyAdmin, validateCSRF, adminSiteHeroRoutes);
} catch (err) {
  console.error("❌ Erro ao carregar ./adminSiteHero:", err.message);
}

/* ============================
 * Rotas Admin específicas (continuam protegidas)
 * ============================ */

router.use("/admin/logs", verifyAdmin, validateCSRF, adminLogsRoutes);
router.use("/admin/permissions", verifyAdmin, validateCSRF, adminPermissionsRoutes);
router.use("/admin/roles", verifyAdmin, validateCSRF, adminRolesRoutes);
router.use("/admin/admins", verifyAdmin, validateCSRF, adminAdminsRoutes);

module.exports = router;
