"use strict";

// routes/admin/adminTotp.js
//
// F1 — endpoints autenticados de gestão do 2FA do admin. Login +
// verificação inicial (challenge MFA) continua em routes/auth/adminLogin.js.
//
// Mount: routes/adminRoutes.js já aplica verifyAdmin + validateCSRF
// para qualquer rota /admin/* — não precisa repetir aqui.

const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/admin/adminTotpController");

router.get("/status", ctrl.getStatus);
router.post("/setup", ctrl.setup);
router.post("/confirm", ctrl.confirm);
router.post("/regenerate-backup-codes", ctrl.regenerateBackupCodes);
router.post("/disable", ctrl.disable);

module.exports = router;
