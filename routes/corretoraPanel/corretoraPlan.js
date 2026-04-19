// routes/corretoraPanel/corretoraPlan.js
"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/corretoraPanel/planCorretoraController");

router.get("/", ctrl.getMyPlan);
router.get("/available", ctrl.listAvailablePlans);
router.get("/events", ctrl.listMyPlanEvents);
router.post("/upgrade", ctrl.requestUpgrade);
// Fase 6 — checkout via Asaas. Frontend chama e redireciona pro link.
router.post("/checkout", ctrl.createCheckout);
// Self-service de cancelamento — owner only. Volta a corretora pro FREE.
router.post("/cancel", ctrl.cancelMyPlan);

module.exports = router;
