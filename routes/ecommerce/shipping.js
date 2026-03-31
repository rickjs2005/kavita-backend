// routes/ecommerce/shipping.js
//
// Rota magra: wiring de handler.
// Lógica de negócio: services/shippingQuoteService.js
// Handler + parsers de input: controllers/shippingController.js
// Documentação: docs/swagger/shipping.js
//
// Contrato de resposta atual: { success: true, ...quote } — divergente do padrão { ok: true }.
// NÃO alterar sem alinhar com o frontend. Ver CLAUDE.md § "Contratos divergentes".
const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/shippingController");

router.get("/quote", ctrl.getShippingQuote);

module.exports = router;
