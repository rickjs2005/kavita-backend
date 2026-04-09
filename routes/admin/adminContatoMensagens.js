"use strict";
// routes/admin/adminContatoMensagens.js
//
// Rota magra — so wiring.
// verifyAdmin + validateCSRF ja aplicados pelo mount() em adminRoutes.js.
//
// Endpoints:
//   GET    /           → listMensagens
//   GET    /stats      → getStats
//   GET    /analytics  → getAnalytics
//   GET    /:id        → getMensagem
//   PATCH  /:id/status → updateStatus
//   DELETE /:id        → deleteMensagem

const router = require("express").Router();
const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/contatoAdminController");
const {
  ContatoIdParamSchema,
  ContatoUpdateStatusSchema,
  ContatoListQuerySchema,
} = require("../../schemas/contatoSchemas");

router.get("/", validate(ContatoListQuerySchema, "query"), ctrl.listMensagens);
router.get("/stats", ctrl.getStats);
router.get("/analytics", ctrl.getAnalytics);
router.get("/:id", validate(ContatoIdParamSchema, "params"), ctrl.getMensagem);
router.patch(
  "/:id/status",
  validate(ContatoIdParamSchema, "params"),
  validate(ContatoUpdateStatusSchema),
  ctrl.updateStatus
);
router.delete("/:id", validate(ContatoIdParamSchema, "params"), ctrl.deleteMensagem);

module.exports = router;
