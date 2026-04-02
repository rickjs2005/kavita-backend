"use strict";
// routes/ecommerceRoutes.js
//
// Rotas de e-commerce do usuário autenticado.
//
// Contextos e contratos de middleware:
//   authenticateToken — aplicado dentro de cada sub-roteador
//   validateCSRF      — aplicado aqui nas rotas de mutação
//
//   Exceções sem CSRF neste nível:
//     /shipping — endpoint de cotação, sem mutação de estado
//     /payment  — aplica validateMPSignature internamente (webhook MP)

const router = require("express").Router();
const { validateCSRF } = require("../middleware/csrfProtection");
const { loadRoute, handleRouteLoadError } = require("./routeLoader");

const load = (path, mod) => loadRoute(router, path, mod);

/* ============================================================
 * ECOMMERCE
 * ============================================================ */

load("/shipping", "./ecommerce/shipping");

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
try {
  const checkoutRoutes = require("./ecommerce/checkout");
  router.use("/checkout", validateCSRF, checkoutRoutes);
} catch (err) {
  handleRouteLoadError("./ecommerce/checkout", err);
}

load("/payment", "./ecommerce/payment");

try {
  const pedidosRoutes = require("./ecommerce/_legacy/pedidos");
  router.use("/pedidos", validateCSRF, pedidosRoutes);
} catch (err) {
  handleRouteLoadError("./ecommerce/_legacy/pedidos", err);
}

module.exports = router;
