// routes/index.js
const router = require("express").Router();

// Middlewares / auth
const verifyAdmin = require("../middleware/verifyAdmin");
const { validateCSRF } = require("../middleware/csrfProtection");
const requirePermission = require("../middleware/requirePermission");

// Rotas Admin protegidas específicas (carregadas diretamente para garantir proteção)
const adminLogsRoutes = require("./admin/adminLogs");
const adminPermissionsRoutes = require("./admin/adminPermissions");
const adminRolesRoutes = require("./admin/adminRoles");
const adminAdminsRoutes = require("./admin/adminAdmins");

// ---------------------------------------------------------------------------
// Helpers de carregamento de rotas
// ---------------------------------------------------------------------------

/**
 * Trata falha de carregamento de rota:
 * - Em produção: lança erro para abortar a inicialização do processo.
 *   O supervisor (PM2, Docker) detectará a falha e não subirá a instância.
 * - Fora de produção: loga com aviso proeminente e continua (dev/CI).
 */
function handleRouteLoadError(moduleName, err) {
  const msg = `❌ Falha ao carregar rota "${moduleName}": ${err.message}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error(msg);
  }
  console.error(msg);
  console.error("⚠️  ATENÇÃO: esta rota está INDISPONÍVEL. Corrija antes de ir para produção.\n");
}

function loadRoute(path, moduleName) {
  try {
    const routeModule = require(moduleName);
    router.use(path, routeModule);
  } catch (err) {
    handleRouteLoadError(moduleName, err);
  }
}

/* ============================
 * Uploads — verificação de arquivos em disco
 * ============================ */
loadRoute("/uploads", "./uploadsCheckRoutes");

/* ============================
 * Rotas Públicas e Produtos
 * ============================ */

// Produtos públicos
loadRoute("/products", "./public/publicProducts");
loadRoute("/products", "./public/publicProductById");

// Catálogo Público
loadRoute("/public/categorias", "./public/publicCategorias");
loadRoute("/public/servicos", "./public/publicServicos");
loadRoute("/public/servicos", "./public/publicAvaliacaoColaborador");

// Promoções
loadRoute("/public/promocoes", "./public/publicPromocoes");

// Avaliações de produtos
loadRoute("/public/produtos", "./public/publicProdutos");

// Configuração pública da loja
loadRoute("/config", "./public/publicShopConfig");

/* ============================
 * Autenticação e Usuários
 * ============================ */

loadRoute("/login", "./auth/login");
loadRoute("/users", "./auth/users");

// Rotas autenticadas de usuário (requerem CSRF)
try {
  const userProfileRoutes = require("./auth/userProfile");
  router.use("/users", validateCSRF, userProfileRoutes);
} catch (err) {
  handleRouteLoadError("./auth/userProfile", err);
}
try {
  const userAddressesRoutes = require("./auth/userAddresses");
  router.use("/users/addresses", validateCSRF, userAddressesRoutes);
} catch (err) {
  handleRouteLoadError("./auth/userAddresses", err);
}
try {
  const cartRoutes = require("./ecommerce/cart");
  router.use("/cart", validateCSRF, cartRoutes);
} catch (err) {
  handleRouteLoadError("./ecommerce/cart", err);
}
try {
  const favoritesRoutes = require("./ecommerce/favorites");
  router.use("/favorites", validateCSRF, favoritesRoutes);
} catch (err) {
  handleRouteLoadError("./ecommerce/favorites", err);
}
loadRoute("/public/site-hero", "./public/publicSiteHero");

// Auth (registro, refresh, logout, csrf-token)
loadRoute("/", "./auth/authRoutes");

// Checkout, pedidos e frete
loadRoute("/shipping", "./ecommerce/shipping");
try {
  const checkoutRoutes = require("./ecommerce/checkout");
  router.use("/checkout", validateCSRF, checkoutRoutes);
} catch (err) {
  handleRouteLoadError("./ecommerce/checkout", err);
}
loadRoute("/payment", "./ecommerce/payment");
try {
  const pedidosRoutes = require("./ecommerce/pedidos");
  router.use("/pedidos", validateCSRF, pedidosRoutes);
} catch (err) {
  handleRouteLoadError("./ecommerce/pedidos", err);
}

/* ============================
 * Área Admin - Login
 * ============================ */

loadRoute("/admin", "./admin/adminLogin");

/* ============================
 * Kavita News (Público)
 * ============================ */
loadRoute("/news", "./public/publicNews");

/* ============================
 * Módulo Kavita Drones (Público)
 * ============================ */
loadRoute("/public/drones", "./public/publicDrones");

console.log("✅ publicDrones montado!");

/* ============================
 * Área Admin - Rotas Protegidas
 * ============================ */

// Categorias
try {
  const adminCategoriasRoutes = require("./admin/adminCategorias");
  router.use("/admin/categorias", verifyAdmin, validateCSRF, adminCategoriasRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminCategorias", err);
}

// Colaboradores
try {
  const adminColaboradoresRoutes = require("./admin/adminColaboradores");
  router.use("/admin/colaboradores", verifyAdmin, validateCSRF, adminColaboradoresRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminColaboradores", err);
}

// Marketing > Promoções
try {
  const adminMarketingPromocoesRoutes = require("./admin/adminMarketingPromocoes");
  router.use(
    "/admin/marketing/promocoes",
    verifyAdmin,
    validateCSRF,
    adminMarketingPromocoesRoutes
  );
} catch (err) {
  handleRouteLoadError("./admin/adminMarketingPromocoes", err);
}

// Especialidades
try {
  const adminEspecialidadesRoutes = require("./admin/adminEspecialidades");
  router.use("/admin/especialidades", verifyAdmin, validateCSRF, adminEspecialidadesRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminEspecialidades", err);
}

// Pedidos (sensível: impacto financeiro)
try {
  const adminPedidosRoutes = require("./admin/adminPedidos");
  router.use("/admin/pedidos", verifyAdmin, validateCSRF, requirePermission("pedidos.ver"), adminPedidosRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminPedidos", err);
}

// Produtos
try {
  const adminProdutosRoutes = require("./admin/adminProdutos");
  router.use("/admin/produtos", verifyAdmin, validateCSRF, adminProdutosRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminProdutos", err);
}

// Serviços
try {
  const adminServicosRoutes = require("./admin/adminServicos");
  router.use("/admin/servicos", verifyAdmin, validateCSRF, adminServicosRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminServicos", err);
}

// Solicitações de serviços
try {
  const adminSolicitacoesServicosRoutes = require("./admin/adminSolicitacoesServicos");
  router.use(
    "/admin/servicos/solicitacoes",
    verifyAdmin,
    validateCSRF,
    adminSolicitacoesServicosRoutes
  );
} catch (err) {
  handleRouteLoadError("./admin/adminSolicitacoesServicos", err);
}

// Usuários (sensível: gerencia contas de clientes)
try {
  const adminUsersRoutes = require("./admin/adminUsers");
  router.use("/admin/users", verifyAdmin, validateCSRF, requirePermission("usuarios.ver"), adminUsersRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminUsers", err);
}

// Stats
try {
  const adminStatsRoutes = require("./admin/adminStats");
  router.use("/admin/stats", verifyAdmin, validateCSRF, adminStatsRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminStats", err);
}

// Carrinhos
try {
  const adminCartsRoutes = require("./admin/adminCarts");
  router.use("/admin/carrinhos", verifyAdmin, validateCSRF, adminCartsRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminCarts", err);
}

// Comunicação
try {
  const adminComunicacaoRoutes = require("./admin/adminComunicacao");
  router.use("/admin/comunicacao", verifyAdmin, validateCSRF, adminComunicacaoRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminComunicacao", err);
}

// Cupons
try {
  const adminCuponsRoutes = require("./admin/adminCupons");
  router.use("/admin/cupons", verifyAdmin, validateCSRF, adminCuponsRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminCupons", err);
}

// Configurações (sensível: altera comportamento global da loja)
try {
  const adminConfigRoutes = require("./admin/adminConfig");
  router.use("/admin/config", verifyAdmin, validateCSRF, requirePermission("config.editar"), adminConfigRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminConfig", err);
}

// Upload de logo e configurações da loja
try {
  const adminConfigUploadRoutes = require("./admin/adminConfigUpload");
  router.use("/admin/shop-config/upload", verifyAdmin, validateCSRF, requirePermission("config.editar"), adminConfigUploadRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminConfigUpload", err);
}

// Relatórios (sensível: requer permissão explícita além de verifyAdmin)
try {
  const adminRelatoriosRoutes = require("./admin/adminRelatorios");
  router.use("/admin/relatorios", verifyAdmin, validateCSRF, requirePermission("relatorios.ver"), adminRelatoriosRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminRelatorios", err);
}

// Kavita News (Admin)
try {
  const adminNewsRoutes = require("./admin/adminNews");
  router.use("/admin/news", verifyAdmin, validateCSRF, adminNewsRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminNews", err);
}

// Admin News — upload de imagens (separado para multer)
try {
  const adminNewsUploadRoutes = require("./admin/adminNewsUpload");
  router.use("/admin/news", verifyAdmin, validateCSRF, adminNewsUploadRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminNewsUpload", err);
}

// Admin Drones (Kavita Drones)
try {
  const adminDronesRoutes = require("./admin/adminDrones");
  router.use("/admin/drones", verifyAdmin, validateCSRF, adminDronesRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminDrones", err);
}

// Admin Shipping (Frete por zonas UF/cidades)
try {
  const adminShippingZonesRoutes = require("./admin/adminShippingZones");
  router.use("/admin/shipping", verifyAdmin, validateCSRF, adminShippingZonesRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminShippingZones", err);
}

// Site Hero (Admin)
try {
  const adminSiteHeroRoutes = require("./admin/adminSiteHero");
  router.use("/admin/site-hero", verifyAdmin, validateCSRF, adminSiteHeroRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminSiteHero", err);
}

/* ============================
 * Rotas Admin específicas (logs, permissões, roles, admins)
 * ============================ */

router.use("/admin/logs", verifyAdmin, validateCSRF, adminLogsRoutes);
router.use("/admin/permissions", verifyAdmin, validateCSRF, adminPermissionsRoutes);
router.use("/admin/roles", verifyAdmin, validateCSRF, adminRolesRoutes);
router.use("/admin/admins", verifyAdmin, validateCSRF, adminAdminsRoutes);

module.exports = router;
