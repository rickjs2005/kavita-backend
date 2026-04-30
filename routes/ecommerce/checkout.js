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
const recalcShipping = require("../../middleware/recalcShipping");
const { validateCSRF } = require("../../middleware/csrfProtection");
const { validate } = require("../../middleware/validate");
const { checkoutBodySchema } = require("../../schemas/checkoutSchemas");
const createAdaptiveRateLimiter = require("../../middleware/adaptiveRateLimiter");
const { CHECKOUT_SCHEDULE, COUPON_PREVIEW_SCHEDULE } = require("../../config/rateLimitSchedules");
const { checkoutLimiter: absoluteCheckoutLimiter } = require("../../middleware/absoluteRateLimit");

const checkoutRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => req.user?.id ? `checkout:${req.user.id}` : null,
  schedule: CHECKOUT_SCHEDULE,
});

const couponPreviewRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => req.user?.id ? `coupon_preview:${req.user.id}` : null,
  schedule: COUPON_PREVIEW_SCHEDULE,
});

/* ------------------------------------------------------------------ */
/*   Autenticação — todas as rotas abaixo exigem token válido         */
/* ------------------------------------------------------------------ */

// Aplicado uma vez no mount: qualquer nova rota adicionada aqui já nasce protegida.
router.use(authenticateToken);

router.post("/preview-cupom", validateCSRF, couponPreviewRateLimiter, controller.previewCoupon);

// POST /api/checkout
// Ordem intencional:
// - autenticação: já aplicada via router.use(authenticateToken) acima
// - valida CSRF (impede cross-site form submit criando pedido real)
// - rate limit por userId (impede spam de pedidos)
// - valida body (inclui regras URBANA/RURAL e RETIRADA)
// - recalcula frete (ENTREGA) ou força pickup (RETIRADA) — injeta req.body.shipping_*
// - chama controller (shipping_* persistido dentro da transação do controller)
router.post(
  "/",
  validateCSRF,
  absoluteCheckoutLimiter,
  checkoutRateLimiter,
  validate(checkoutBodySchema),
  recalcShipping,
  controller.create
);

module.exports = router;
