// routes/corretoraPanel/corretoraAnalytics.js
"use strict";

const express = require("express");
const router = express.Router();

const { requireCapability } = require("../../lib/corretoraPermissions");
const { requirePlanCapability } = require("../../services/planService");
const ctrl = require("../../controllers/corretoraPanel/analyticsCorretoraController");

// Analytics é feature paga (PRO+). G1 auditoria 2026-04-24 reverteu a
// decisão anterior de deixar aberto — o dashboard de analytics é
// diferencial comercial do PRO, não preview da compra.
router.get(
  "/",
  requireCapability("leads.view"),
  requirePlanCapability("advanced_reports"),
  ctrl.getDashboard,
);

module.exports = router;
