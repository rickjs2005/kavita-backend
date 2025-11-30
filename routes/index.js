// routes/index.js
const router = require('express').Router();

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
loadRoute('/products', './products');
loadRoute('/products', './productById');

//  Catálogo Público
loadRoute('/public/categorias', './publicCategorias');
loadRoute('/public/servicos', './publicServicos');
loadRoute('/public/servicos', './publicAvaliacaoColaborador');
loadRoute('/public/destaques', './publicDestaques');
loadRoute('/public/produtos', './publicProdutos');

//  Autenticação e Usuários
loadRoute('/login', './login');
loadRoute('/users', './users');
loadRoute('/users', './userProfile');
loadRoute('/users/addresses', './userAddresses');
loadRoute('/cart', './cart');
loadRoute('/favorites', './favorites');

// Esta rota estava como "/api" no server.js, então aqui ela fica na raiz "/"
// pois este arquivo inteiro será montado em "/api"
loadRoute('/', './authRoutes');

//  Checkout e Pagamento
loadRoute('/checkout', './checkoutRoutes');
loadRoute('/payment', './payment');
loadRoute('/pedidos', './pedidos');

//  Área Admin
loadRoute('/admin',               './adminLogin');
loadRoute('/admin/categorias',    './adminCategorias');
loadRoute('/admin/colaboradores', './adminColaboradores');
loadRoute('/admin/destaques',     './adminDestaques');
loadRoute('/admin/especialidades','./adminEspecialidades');
loadRoute('/admin/pedidos',       './adminPedidos');
loadRoute('/admin/produtos',      './adminProdutos');
loadRoute('/admin/servicos',      './adminServicos');
loadRoute('/admin/servicos',      './adminSolicitacoesServicos');
loadRoute('/admin/users',         './adminUsers');
loadRoute('/admin/stats',         './adminStats');
loadRoute('/admin/carrinhos',     './adminCarts');
loadRoute('/admin/comunicacao',   './adminComunicacao');
loadRoute('/admin/cupons',        './adminCupons');
loadRoute('/admin/config',        './adminConfigRoutes');
loadRoute('/admin/relatorios',   './adminRelatorios');

module.exports = router;
