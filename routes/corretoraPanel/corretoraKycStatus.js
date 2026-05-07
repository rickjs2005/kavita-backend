// routes/corretoraPanel/corretoraKycStatus.js
"use strict";

const express = require("express");
const router = express.Router();
const { requireCapability } = require("../../lib/corretoraPermissions");
const ctrl = require("../../controllers/corretoraPanel/kycStatusController");

router.get("/", requireCapability("leads.view"), ctrl.getMyKycStatus);

// Self-service: corretora informa proprio CNPJ. Permissao 'profile.edit'
// para alinhar com edicao de outros dados cadastrais (ja' restrita a
// owner/manager).
router.post(
  "/cnpj/verify",
  requireCapability("profile.edit"),
  ctrl.verifyMyCnpj,
);

module.exports = router;
