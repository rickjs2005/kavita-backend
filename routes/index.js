"use strict";
// routes/index.js
//
// Agregador central — monta os quatro sub-índices de contexto.
// Toda nova rota entra no sub-índice correto, nunca diretamente aqui.
// Nunca adicionar router.use() diretamente em server.js.
//
// Sub-índices:
//   publicRoutes.js    — utilitários + endpoints sem auth
//   authIndex.js       — autenticação + usuário autenticado
//   ecommerceRoutes.js — carrinho, checkout, pagamento, frete
//   adminRoutes.js     — painel admin (verifyAdmin + validateCSRF em todas)

const router = require("express").Router();

router.use(require("./publicRoutes"));
router.use(require("./authIndex"));
router.use(require("./ecommerceRoutes"));
router.use(require("./corretoraPanelRoutes"));
router.use(require("./producerRoutes"));
router.use(require("./motoristaRoutes"));
router.use(require("./adminRoutes"));

module.exports = router;
