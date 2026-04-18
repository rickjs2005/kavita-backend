// routes/corretoraPanel/corretoraTotp.js
//
// ETAPA 2.1/2.4 — rotas de 2FA + logout-all. Montadas sob
// /api/corretora/* pelo mount do corretoraPanelRoutes.
// verifyCorretora + validateCSRF aplicados no mount.
"use strict";

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const {
  confirmTotpSetupSchema,
  disableTotpSchema,
} = require("../../schemas/corretoraAuthSchemas");
const ctrl = require("../../controllers/corretoraPanel/totpCorretoraController");

router.get("/", ctrl.getStatus);
router.post("/setup", ctrl.startSetup);
router.post("/confirm", validate(confirmTotpSetupSchema), ctrl.confirmSetup);
router.post("/disable", validate(disableTotpSchema), ctrl.disable);
router.post("/backup-codes/regenerate", ctrl.regenerateBackupCodes);

module.exports = router;
