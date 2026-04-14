// routes/corretoraPanel/corretoraLeads.js
//
// Rotas do painel da corretora para gestão dos próprios leads.
// verifyCorretora + validateCSRF são aplicados no mount do índice.
"use strict";

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const { requireCapability } = require("../../lib/corretoraPermissions");
const { updateLeadSchema } = require("../../schemas/corretoraAuthSchemas");
const ctrl = require("../../controllers/corretoraPanel/leadsCorretoraController");

router.get("/", requireCapability("leads.view"), ctrl.listMine);
router.get("/summary", requireCapability("leads.view"), ctrl.getSummary);
router.get("/export", requireCapability("leads.export"), ctrl.exportLeads);
router.patch(
  "/:id",
  requireCapability("leads.update"),
  validate(updateLeadSchema),
  ctrl.updateLead,
);

module.exports = router;
