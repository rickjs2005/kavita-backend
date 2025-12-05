// routes/index.js
const router = require("express").Router();

// Middlewares / auth
const verifyAdmin = require("../middleware/verifyAdmin");

// Rotas Admin protegidas específicas
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

//  Rotas Públicas e Produtos
loadRoute("/products", "./products");
loadRoute("/products", "./productById");

//  Catálogo Público
loadRoute("/public/categorias", "./publicCategorias");
loadRoute("/public/servicos", "./publicServicos");
loadRoute("/public/servicos", "./publicAvaliacaoColaborador");

// 🔁 ANTIGO: /public/destaques -> agora usamos /public/promocoes
// loadRoute("/public/destaques", "./publicDestaques");

// ✅ NOVO: rota pública de promoções (Marketing)
loadRoute("/public/promocoes", "./publicPromocoes");

loadRoute("/public/produtos", "./publicProdutos");

//  Autenticação e Usuários
loadRoute("/login", "./login");
loadRoute("/users", "./users");
loadRoute("/users", "./userProfile");
loadRoute("/users/addresses", "./userAddresses");
loadRoute("/cart", "./cart");
loadRoute("/favorites", "./favorites");

// Esta rota estava como "/api" no server.js, então aqui ela fica na raiz "/"
// pois este arquivo inteiro será montado em "/api"
loadRoute("/", "./authRoutes");

//  Checkout e Pagamento
loadRoute("/checkout", "./checkoutRoutes");
loadRoute("/payment", "./payment");
loadRoute("/pedidos", "./pedidos");

//  Área Admin (rotas gerais)
loadRoute("/admin", "./adminLogin");
loadRoute("/admin/categorias", "./adminCategorias");
loadRoute("/admin/colaboradores", "./adminColaboradores");

// 🔁 ANTIGO: /admin/destaques -> agora módulo de Marketing/Promoções
// loadRoute("/admin/destaques", "./adminDestaques");

// ✅ NOVO: módulo Marketing > Promoções
loadRoute("/admin/marketing/promocoes", "./adminMarketingPromocoes");

loadRoute("/admin/especialidades", "./adminEspecialidades");
loadRoute("/admin/pedidos", "./adminPedidos");
loadRoute("/admin/produtos", "./adminProdutos");
loadRoute("/admin/servicos", "./adminServicos");
loadRoute("/admin/servicos", "./adminSolicitacoesServicos");
loadRoute("/admin/users", "./adminUsers");
loadRoute("/admin/stats", "./adminStats");
loadRoute("/admin/carrinhos", "./adminCarts");
loadRoute("/admin/comunicacao", "./adminComunicacao");
loadRoute("/admin/cupons", "./adminCupons");
loadRoute("/admin/config", "./adminConfigRoutes");
loadRoute("/admin/relatorios", "./adminRelatorios");

//  Área Admin — rotas específicas com verifyAdmin na frente
//  (essas ficarão como /api/admin/logs, /api/admin/permissions, etc.)
router.use("/admin/logs", verifyAdmin, adminLogsRoutes);
router.use("/admin/permissions", verifyAdmin, adminPermissionsRoutes);
router.use("/admin/roles", verifyAdmin, adminRolesRoutes);
router.use("/admin/admins", verifyAdmin, adminAdminsRoutes);

module.exports = router;
