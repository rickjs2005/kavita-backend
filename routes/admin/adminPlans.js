// routes/admin/adminPlans.js
"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/admin/adminPlansController");

// Plans
router.get("/plans", ctrl.listPlans);
router.post("/plans", ctrl.createPlan);
router.get("/plans/:id/broadcast-preview", ctrl.getBroadcastPreview);
router.put("/plans/:id", ctrl.updatePlan);

// Fase 6 — reconciliação Asaas / manual
const reconCtrl = require("../../controllers/admin/adminReconciliationController");
router.get("/reconciliation/summary", reconCtrl.getSummary);
router.get("/reconciliation/subscriptions", reconCtrl.listSubscriptions);
router.get("/reconciliation/webhook-events", reconCtrl.listWebhookEvents);
// ETAPA 1.3 — retry manual de webhook event com erro
router.post(
  "/reconciliation/webhook-events/:id/retry",
  reconCtrl.retryWebhookEvent,
);

// Subscriptions por corretora
router.get(
  "/corretoras/:corretoraId/subscription",
  ctrl.getCorretoraSubscription,
);
router.post(
  "/corretoras/:corretoraId/subscription",
  ctrl.assignPlanToCorretora,
);
router.put(
  "/corretoras/:corretoraId/subscription",
  ctrl.updateCorretoraSubscription,
);
router.delete(
  "/corretoras/:corretoraId/subscription",
  ctrl.cancelCorretoraSubscription,
);

// Destaques pagos por cidade
router.get("/city-promotions", ctrl.listCityPromotions);
router.post("/city-promotions", ctrl.createCityPromotion);
router.delete("/city-promotions/:id", ctrl.deactivateCityPromotion);

module.exports = router;
