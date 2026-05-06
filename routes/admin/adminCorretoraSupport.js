"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/admin/adminCorretoraSupportController");
const requirePermission = require("../../middleware/requirePermission");
const { validate } = require("../../middleware/validate");
const schemas = require("../../schemas/corretoraSupportSchemas");

// Listar / ver thread — piso `mercado_cafe_view` (ja aplicado no mount).
router.get("/threads", ctrl.listThreads);
router.get("/threads/:corretoraId", ctrl.getThread);

// Responder — exige permissao de manage (mesmo piso de quem altera
// dados da corretora).
router.post(
  "/threads/:corretoraId/messages",
  requirePermission("mercado_cafe_manage"),
  validate(schemas.sendMessageBodySchema),
  ctrl.replyToThread,
);

module.exports = router;
