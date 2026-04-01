// routes/index.js
//
// Ponto central de montagem de todas as rotas da API.
//
// Contextos e contratos de middleware por seção:
//
//   UTILITÁRIOS    — sem auth, sem CSRF
//   PÚBLICO        — sem auth, sem CSRF (leitura aberta)
//   AUTENTICAÇÃO   — sem CSRF (são o ponto de entrada da sessão)
//   USUÁRIO        — authenticateToken (dentro da rota) + validateCSRF no index
//   ECOMMERCE      — authenticateToken (dentro da rota) + validateCSRF no index
//   ADMIN-LOGIN    — sem CSRF (ponto de entrada da sessão admin)
//   ADMIN          — verifyAdmin + validateCSRF em todas (aplicados aqui)
//
// Regra: nunca adicionar router.use() diretamente em server.js.
// Toda nova rota entra aqui, no grupo correto.

const router = require("express").Router();

// Middlewares de auth e proteção
const verifyAdmin = require("../middleware/verifyAdmin");
const { validateCSRF } = require("../middleware/csrfProtection");
const requirePermission = require("../middleware/requirePermission");

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

/* ============================================================
 * UTILITÁRIOS
 * Sem autenticação. Prefixo /uploads para assets físicos.
 * ============================================================ */

loadRoute("/uploads", "./utils/uploadsCheck");

/* ============================================================
 * ROTAS PÚBLICAS
 * Sem autenticação e sem CSRF.
 * Qualquer dado retornado aqui é legível por qualquer cliente.
 * ============================================================ */

// — Produtos e catálogo —
// publicProducts.js é o ponto único de montagem de /products.
// GET /:id (legado) é delegado internamente por publicProducts.js.
loadRoute("/products", "./public/publicProducts");
loadRoute("/public/categorias", "./public/publicCategorias");
loadRoute("/public/servicos", "./public/publicServicos");
loadRoute("/public/promocoes", "./public/publicPromocoes");
loadRoute("/public/produtos", "./public/_legacy/publicProdutos"); // avaliações de produtos

// — Configuração e visual —
loadRoute("/config", "./public/_legacy/publicShopConfig");
loadRoute("/public/site-hero", "./public/publicSiteHero");

// — Editorial: notícias e drones —
loadRoute("/news", "./public/publicNews");
loadRoute("/public/drones", "./public/publicDrones");

/* ============================================================
 * AUTENTICAÇÃO
 * Rotas de entrada de sessão — sem CSRF (o token ainda não existe).
 * ============================================================ */

// Login de usuário e admin (pontos de entrada de sessão — sem CSRF)
loadRoute("/login", "./auth/login");
loadRoute("/admin", "./auth/adminLogin");

// Registro, forgot/reset password, logout, csrf-token (usuário)
loadRoute("/", "./auth/authRoutes");

/* ============================================================
 * USUÁRIO AUTENTICADO
 * authenticateToken é aplicado dentro de cada sub-roteador.
 * validateCSRF é aplicado aqui para proteger todas as mutações.
 * ============================================================ */

// Cadastro básico e recuperação de senha (sem CSRF — não é mutação de sessão autenticada)
loadRoute("/users", "./auth/userRegister");

// Perfil e endereços (autenticados + CSRF)
try {
  const userProfileRoutes = require("./auth/_legacy/userProfile");
  router.use("/users", validateCSRF, userProfileRoutes);
} catch (err) {
  handleRouteLoadError("./auth/_legacy/userProfile", err);
}
try {
  const userAddressesRoutes = require("./auth/userAddresses");
  router.use("/users/addresses", validateCSRF, userAddressesRoutes);
} catch (err) {
  handleRouteLoadError("./auth/userAddresses", err);
}

/* ============================================================
 * ECOMMERCE
 * authenticateToken é aplicado dentro de cada sub-roteador.
 * validateCSRF é aplicado aqui nas rotas de mutação.
 * /shipping e /payment são exceções: não requerem CSRF neste nível
 * (shipping é público; payment aplica validateMPSignature internamente).
 * ============================================================ */

loadRoute("/shipping", "./ecommerce/shipping");

try {
  const cartRoutes = require("./ecommerce/cart");
  router.use("/cart", validateCSRF, cartRoutes);
} catch (err) {
  handleRouteLoadError("./ecommerce/cart", err);
}
try {
  const favoritesRoutes = require("./ecommerce/_legacy/favorites");
  router.use("/favorites", validateCSRF, favoritesRoutes);
} catch (err) {
  handleRouteLoadError("./ecommerce/_legacy/favorites", err);
}
try {
  const checkoutRoutes = require("./ecommerce/checkout");
  router.use("/checkout", validateCSRF, checkoutRoutes);
} catch (err) {
  handleRouteLoadError("./ecommerce/checkout", err);
}

loadRoute("/payment", "./ecommerce/payment");

try {
  const pedidosRoutes = require("./ecommerce/_legacy/pedidos");
  router.use("/pedidos", validateCSRF, pedidosRoutes);
} catch (err) {
  handleRouteLoadError("./ecommerce/_legacy/pedidos", err);
}

/* ============================================================
 * ADMIN — ROTAS PROTEGIDAS
 * Todas as rotas abaixo aplicam: verifyAdmin + validateCSRF.
 * Algumas adicionam requirePermission para operações sensíveis.
 *
 * Sub-grupos:
 *   Catálogo     — produtos, categorias, promoções, cupons
 *   Conteúdo     — news, hero, colaboradores, serviços, drones
 *   Operações    — pedidos, carrinhos, stats, relatórios
 *   Configuração — config, uploads, frete
 *   Sistema      — comunicação, logs, permissões, roles, admins
 * ============================================================ */

// — Catálogo —

try {
  const adminProdutosRoutes = require("./admin/adminProdutos");
  router.use("/admin/produtos", verifyAdmin, validateCSRF, adminProdutosRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminProdutos", err);
}
try {
  const adminCategoriasRoutes = require("./admin/adminCategorias");
  router.use("/admin/categorias", verifyAdmin, validateCSRF, adminCategoriasRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminCategorias", err);
}
try {
  const adminMarketingPromocoesRoutes = require("./admin/_legacy/adminMarketingPromocoes");
  router.use(
    "/admin/marketing/promocoes",
    verifyAdmin,
    validateCSRF,
    adminMarketingPromocoesRoutes
  );
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminMarketingPromocoes", err);
}
try {
  const adminCuponsRoutes = require("./admin/_legacy/adminCupons");
  router.use("/admin/cupons", verifyAdmin, validateCSRF, adminCuponsRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminCupons", err);
}

// — Conteúdo editorial —

try {
  const adminNewsRoutes = require("./admin/adminNews");
  router.use("/admin/news", verifyAdmin, validateCSRF, adminNewsRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminNews", err);
}
// Separado de adminNews porque usa multer (ver adminNewsUpload.js)
try {
  const adminNewsUploadRoutes = require("./admin/adminNewsUpload");
  router.use("/admin/news", verifyAdmin, validateCSRF, adminNewsUploadRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminNewsUpload", err);
}
try {
  const adminSiteHeroRoutes = require("./admin/adminSiteHero");
  router.use("/admin/site-hero", verifyAdmin, validateCSRF, adminSiteHeroRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminSiteHero", err);
}
try {
  const adminColaboradoresRoutes = require("./admin/adminColaboradores");
  router.use("/admin/colaboradores", verifyAdmin, validateCSRF, adminColaboradoresRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminColaboradores", err);
}
try {
  const adminServicosRoutes = require("./admin/_legacy/adminServicos");
  router.use("/admin/servicos", verifyAdmin, validateCSRF, adminServicosRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminServicos", err);
}
try {
  const adminSolicitacoesServicosRoutes = require("./admin/_legacy/adminSolicitacoesServicos");
  router.use(
    "/admin/servicos/solicitacoes",
    verifyAdmin,
    validateCSRF,
    adminSolicitacoesServicosRoutes
  );
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminSolicitacoesServicos", err);
}
try {
  const adminEspecialidadesRoutes = require("./admin/_legacy/adminEspecialidades");
  router.use("/admin/especialidades", verifyAdmin, validateCSRF, adminEspecialidadesRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminEspecialidades", err);
}
try {
  const adminDronesRoutes = require("./admin/adminDrones");
  router.use("/admin/drones", verifyAdmin, validateCSRF, adminDronesRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminDrones", err);
}

// — Operações de negócio —

try {
  const adminPedidosRoutes = require("./admin/adminPedidos");
  router.use("/admin/pedidos", verifyAdmin, validateCSRF, requirePermission("pedidos.ver"), adminPedidosRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminPedidos", err);
}
try {
  const adminCartsRoutes = require("./admin/adminCarts");
  router.use("/admin/carrinhos", verifyAdmin, validateCSRF, adminCartsRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminCarts", err);
}
try {
  const adminStatsRoutes = require("./admin/_legacy/adminStats");
  router.use("/admin/stats", verifyAdmin, validateCSRF, adminStatsRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminStats", err);
}
try {
  const adminRelatoriosRoutes = require("./admin/_legacy/adminRelatorios");
  router.use("/admin/relatorios", verifyAdmin, validateCSRF, requirePermission("relatorios.ver"), adminRelatoriosRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminRelatorios", err);
}

// — Configuração da loja —

try {
  const adminConfigRoutes = require("./admin/adminConfig");
  router.use("/admin/config", verifyAdmin, validateCSRF, requirePermission("config.editar"), adminConfigRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminConfig", err);
}
// Upload de logo e assets de configuração (separado de adminConfig por usar multer)
try {
  const adminConfigUploadRoutes = require("./admin/_legacy/adminConfigUpload");
  router.use("/admin/shop-config/upload", verifyAdmin, validateCSRF, requirePermission("config.editar"), adminConfigUploadRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminConfigUpload", err);
}
try {
  const adminShippingZonesRoutes = require("./admin/_legacy/adminShippingZones");
  router.use("/admin/shipping", verifyAdmin, validateCSRF, adminShippingZonesRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminShippingZones", err);
}

// — Sistema e segurança —
// Nota: usuários, roles e permissões são sensíveis; qualquer acesso aqui
// já está coberto por verifyAdmin. requirePermission adicional pode ser
// aplicado dentro dos sub-roteadores quando necessário.

try {
  const adminComunicacaoRoutes = require("./admin/_legacy/adminComunicacao");
  router.use("/admin/comunicacao", verifyAdmin, validateCSRF, adminComunicacaoRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminComunicacao", err);
}
try {
  const adminUsersRoutes = require("./admin/_legacy/adminUsers");
  router.use("/admin/users", verifyAdmin, validateCSRF, requirePermission("usuarios.ver"), adminUsersRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminUsers", err);
}
try {
  const adminAdminsRoutes = require("./admin/_legacy/adminAdmins");
  router.use("/admin/admins", verifyAdmin, validateCSRF, adminAdminsRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminAdmins", err);
}
try {
  const adminRolesRoutes = require("./admin/adminRoles");
  router.use("/admin/roles", verifyAdmin, validateCSRF, adminRolesRoutes);
} catch (err) {
  handleRouteLoadError("./admin/adminRoles", err);
}
try {
  const adminPermissionsRoutes = require("./admin/_legacy/adminPermissions");
  router.use("/admin/permissions", verifyAdmin, validateCSRF, adminPermissionsRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminPermissions", err);
}
try {
  const adminLogsRoutes = require("./admin/_legacy/adminLogs");
  router.use("/admin/logs", verifyAdmin, validateCSRF, adminLogsRoutes);
} catch (err) {
  handleRouteLoadError("./admin/_legacy/adminLogs", err);
}

module.exports = router;
