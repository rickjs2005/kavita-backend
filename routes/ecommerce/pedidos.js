"use strict";
// routes/ecommerce/pedidos.js
//
// Rota magra — apenas wiring.
// authenticateToken aplicado via router.use().
// validateCSRF aplicado no mount em ecommerceRoutes.js.

const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/authenticateToken");
const { validate } = require("../../middleware/validate");
const { createOcorrenciaSchema, replyOcorrenciaSchema } = require("../../schemas/pedidoOcorrenciasSchemas");
const ctrl = require("../../controllers/pedidosUserController");

router.use(authenticateToken);

// GET /api/pedidos
router.get("/", ctrl.listPedidos);

// GET /api/pedidos/:id
router.get("/:id", ctrl.getPedidoById);

// POST /api/pedidos/:id/ocorrencias — cliente sinaliza problema no endereço
router.post("/:id/ocorrencias", validate(createOcorrenciaSchema), ctrl.createOcorrencia);

// PUT /api/pedidos/:id/ocorrencias/:ocorrenciaId/resposta — cliente responde ocorrência
router.put("/:id/ocorrencias/:ocorrenciaId/resposta", validate(replyOcorrenciaSchema), ctrl.replyOcorrencia);

module.exports = router;
