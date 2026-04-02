"use strict";
// routes/admin/adminSolicitacoesServicos.js
//
// Rota magra — apenas wiring.
// verifyAdmin + validateCSRF aplicados pelo mount() em adminRoutes.js.

const express = require("express");
const router = express.Router();
const { validate } = require("../../middleware/validate");
const { updateStatusSchema, idParamSchema } = require("../../schemas/solicitacoesSchemas");
const ctrl = require("../../controllers/solicitacoesController");

// GET /api/admin/servicos/solicitacoes
router.get("/solicitacoes", ctrl.listSolicitacoes);

// PATCH /api/admin/servicos/solicitacoes/:id/status
router.patch(
  "/solicitacoes/:id/status",
  validate(idParamSchema, "params"),
  validate(updateStatusSchema, "body"),
  ctrl.updateStatus
);

module.exports = router;
