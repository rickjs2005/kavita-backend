// routes/ecommerce/checkout.js
//
// Rota magra: middleware + wiring de handlers.
// Lógica de negócio: services/checkoutService.js
// Handlers:         controllers/checkoutController.js
// Frete:            middleware/recalcShipping.js
// Documentação:     docs/swagger/checkout.js

const express = require("express");
const router = express.Router();
const controller = require("../../controllers/checkoutController");
const authenticateToken = require("../../middleware/authenticateToken");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const recalcShipping = require("../../middleware/recalcShipping");
const { validateCSRF } = require("../../middleware/csrfProtection");
const { validate } = require("../../middleware/validate");
const { checkoutBodySchema } = require("../../schemas/checkoutSchemas");

/* ------------------------------------------------------------------ */
/*                 Resolve o handler do controller                     */
/* ------------------------------------------------------------------ */

let checkoutHandler;

if (typeof controller === "function") {
  checkoutHandler = controller;
} else if (controller && typeof controller.create === "function") {
  checkoutHandler = controller.create;
} else {
  checkoutHandler = (_req, _res, next) => {
    console.error(
      "[checkoutRoutes] checkoutController não configurado corretamente. Esperado função ou { create }."
    );
    return next(
      new AppError(
        "Checkout não está configurado corretamente no servidor.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  };
}

/* ------------------------------------------------------------------ */
/*   Autenticação — todas as rotas abaixo exigem token válido         */
/* ------------------------------------------------------------------ */

// Aplicado uma vez no mount: qualquer nova rota adicionada aqui já nasce protegida.
router.use(authenticateToken);

router.post("/preview-cupom", validateCSRF, controller.previewCoupon);

// POST /api/checkout
// Ordem intencional:
// - autenticação: já aplicada via router.use(authenticateToken) acima
// - valida CSRF (impede cross-site form submit criando pedido real)
// - valida body (inclui regras URBANA/RURAL e RETIRADA)
// - recalcula frete (ENTREGA) ou força pickup (RETIRADA) — injeta req.body.shipping_*
// - chama controller (shipping_* persistido dentro da transação do controller)
router.post(
  "/",
  validateCSRF,
  validate(checkoutBodySchema),
  recalcShipping,
  checkoutHandler
);

module.exports = router;
