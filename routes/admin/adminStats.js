"use strict";
// routes/admin/adminStats.js
// ✅ Padrão moderno — rota magra.
// verifyAdmin + validateCSRF aplicados no mount em adminRoutes.js.

const express = require("express");
const router = express.Router();
const { validate } = require("../../middleware/validate");
const { vendasQuerySchema, topProdutosQuerySchema } = require("../../schemas/statsSchemas");
const ctrl = require("../../controllers/statsController");

router.get("/resumo", ctrl.getResumo);
router.get("/vendas", validate(vendasQuerySchema, "query"), ctrl.getVendas);
router.get("/produtos-mais-vendidos", validate(topProdutosQuerySchema, "query"), ctrl.getTopProdutos);
router.get("/alertas", ctrl.getAlertas);
router.get("/modulos-status", ctrl.getModulesStatus);

module.exports = router;
