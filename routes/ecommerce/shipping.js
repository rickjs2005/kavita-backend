// routes/ecommerce/shipping.js
// =============================================================================
// ⚠️  CONTRATO CONGELADO — controller retorna { success: true }, não { ok: true }
// =============================================================================
// Rota magra: wiring de handler.
// Lógica de negócio: services/shippingQuoteService.js
// Handler + parsers de input: controllers/shippingController.js
//
// O shippingController tem contrato congelado por dependência de frontend.
// NÃO copie este padrão. NÃO altere shapes sem coordenar com frontend.
// Ver CLAUDE.md § "Contratos de resposta" e header de shippingController.js.
// =============================================================================
const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/shippingController");

router.get("/quote", ctrl.getShippingQuote);

module.exports = router;
