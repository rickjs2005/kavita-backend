// routes/corretoraPanel/corretoraLeads.js
//
// Rotas do painel da corretora para gestão dos próprios leads.
// verifyCorretora + validateCSRF são aplicados no mount do índice.
"use strict";

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const { requireCapability } = require("../../lib/corretoraPermissions");
const { requirePlanCapability } = require("../../services/planService");
const {
  updateLeadSchema,
  createLeadNoteSchema,
  updateLeadProposalSchema,
  updateLeadNextActionSchema,
} = require("../../schemas/corretoraAuthSchemas");
const ctrl = require("../../controllers/corretoraPanel/leadsCorretoraController");

router.get("/", requireCapability("leads.view"), ctrl.listMine);
router.get("/summary", requireCapability("leads.view"), ctrl.getSummary);
router.get(
  "/export",
  requireCapability("leads.export"),
  requirePlanCapability("leads_export"),
  ctrl.exportLeads,
);

// Fase 3 — detalhe + notas + eventos + proposta + próxima ação
router.get("/:id", requireCapability("leads.view"), ctrl.getLeadDetail);
router.post(
  "/:id/notes",
  requireCapability("leads.update"),
  validate(createLeadNoteSchema),
  ctrl.addLeadNote,
);
router.delete(
  "/:id/notes/:noteId",
  requireCapability("leads.update"),
  ctrl.deleteLeadNote,
);
router.patch(
  "/:id/proposal",
  requireCapability("leads.update"),
  validate(updateLeadProposalSchema),
  ctrl.updateLeadProposal,
);
router.patch(
  "/:id/next-action",
  requireCapability("leads.update"),
  validate(updateLeadNextActionSchema),
  ctrl.updateLeadNextAction,
);

// Mantém o update genérico por último para evitar match greedy em
// rotas mais específicas acima (/proposal, /next-action, /notes).
router.patch(
  "/:id",
  requireCapability("leads.update"),
  validate(updateLeadSchema),
  ctrl.updateLead,
);

module.exports = router;
