// routes/admin/adminCorretoraKyc.js
//
// Endpoints admin do KYC (Fase 10.2). Montado em /admin/mercado-do-cafe/corretoras/:id/kyc
// via adminRoutes.js — verifyAdmin + validateCSRF já aplicados no mount.
"use strict";

const express = require("express");
// mergeParams traz :id da rota pai (que monta como /:id/kyc).
const router = express.Router({ mergeParams: true });

const requirePermission = require("../../middleware/requirePermission");
const ctrl = require("../../controllers/admin/corretoraKycAdminController");

// Leitura — qualquer admin do módulo pode ver.
router.get(
  "/",
  requirePermission("mercado_cafe_view"),
  ctrl.getStatus,
);

// Mutações — só quem modera (approve/reject).
router.post(
  "/run-check",
  requirePermission("mercado_cafe_moderate"),
  ctrl.runCheck,
);
router.post(
  "/approve",
  requirePermission("mercado_cafe_moderate"),
  ctrl.approve,
);
router.post(
  "/approve-manual",
  requirePermission("mercado_cafe_moderate"),
  ctrl.approveManual,
);
router.post(
  "/reject",
  requirePermission("mercado_cafe_moderate"),
  ctrl.reject,
);

module.exports = router;
