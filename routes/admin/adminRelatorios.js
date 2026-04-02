"use strict";
// routes/admin/adminRelatorios.js
// ✅ Padrão moderno — rota magra.
// verifyAdmin + validateCSRF aplicados no mount em adminRoutes.js.

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/relatoriosController");

router.get("/vendas", ctrl.getVendas);
router.get("/produtos-mais-vendidos", ctrl.getProdutosMaisVendidos);
router.get("/clientes-top", ctrl.getClientesTop);
router.get("/estoque", ctrl.getEstoque);
router.get("/estoque-baixo", ctrl.getEstoqueBaixo);
router.get("/servicos", ctrl.getServicos);
router.get("/servicos-ranking", ctrl.getServicosRanking);

module.exports = router;
