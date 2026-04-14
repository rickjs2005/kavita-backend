// routes/corretoraPanel/corretoraLeads.js
//
// Rotas do painel da corretora para gestão dos próprios leads.
// verifyCorretora + validateCSRF são aplicados no mount do índice.
"use strict";

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const { updateLeadSchema } = require("../../schemas/corretoraAuthSchemas");
const ctrl = require("../../controllers/corretoraPanel/leadsCorretoraController");

router.get("/", ctrl.listMine);
router.get("/summary", ctrl.getSummary);
router.get("/export", ctrl.exportLeads);
router.patch("/:id", validate(updateLeadSchema), ctrl.updateLead);

module.exports = router;
