const path = require('path');

function buildRoute(mountPath, relativeModulePath) {
  return {
    mountPath,
    modulePath: path.resolve(__dirname, '..', relativeModulePath),
  };
}

const ROUTES = [
  buildRoute('/api/products', 'routes/products'),
  buildRoute('/api/products', 'routes/productById'),
  buildRoute('/api/public/categorias', 'routes/publicCategorias'),
  buildRoute('/api/public/servicos', 'routes/publicServicos'),
  buildRoute('/api/public/destaques', 'routes/publicDestaques'),
  buildRoute('/api/public/produtos', 'routes/publicProdutos'),
  buildRoute('/api/login', 'routes/login'),
  buildRoute('/api/users', 'routes/users'),
  buildRoute('/api/checkout', 'routes/checkoutRoutes'),
  buildRoute('/api/payment', 'routes/payment'),
  buildRoute('/api', 'routes/authRoutes'),
  buildRoute('/api/pedidos', 'routes/pedidos'),
  buildRoute('/api/admin', 'routes/adminLogin'),
  buildRoute('/api/admin/categorias', 'routes/adminCategorias'),
  buildRoute('/api/admin/colaboradores', 'routes/adminColaboradores'),
  buildRoute('/api/admin/destaques', 'routes/adminDestaques'),
  buildRoute('/api/admin/especialidades', 'routes/adminEspecialidades'),
  buildRoute('/api/admin/pedidos', 'routes/adminPedidos'),
  buildRoute('/api/admin/produtos', 'routes/adminProdutos'),
  buildRoute('/api/admin/servicos', 'routes/adminServicos'),
];

function registerRoutes(app, { logger = console, requireFn = require } = {}) {
  ROUTES.forEach(({ mountPath, modulePath }) => {
    try {
      const routeModule = requireFn(modulePath);
      app.use(mountPath, routeModule);
      if (logger && typeof logger.info === 'function') {
        logger.info({
          event: 'route_registered',
          mountPath,
          module: modulePath,
        });
      }
    } catch (error) {
      if (logger && typeof logger.error === 'function') {
        logger.error({
          event: 'route_registration_failed',
          mountPath,
          module: modulePath,
          error: error.message,
        });
      }
      throw error;
    }
  });
}

module.exports = {
  ROUTES,
  registerRoutes,
};
