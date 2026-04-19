// routes/admin/adminPlans.js
"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/admin/adminPlansController");
const requirePermission = require("../../middleware/requirePermission");

// Bloco 5 — permissões granulares:
//   - `mercado_cafe_view` é o piso (já aplicado no mount — leitura ok)
//   - `mercado_cafe_plan_manage` protege CRUD de plans e broadcast
//   - `mercado_cafe_financial` protege subscriptions e reconciliação
//   - super-permissão `mercado_cafe_manage` satisfaz qualquer uma
//     (middleware trata no hasPermission)

// Plans — leitura já liberada pelo piso do mount.
router.get("/plans", ctrl.listPlans);
router.post(
  "/plans",
  requirePermission("mercado_cafe_plan_manage"),
  ctrl.createPlan,
);
router.get(
  "/plans/:id/broadcast-preview",
  requirePermission("mercado_cafe_plan_manage"),
  ctrl.getBroadcastPreview,
);
router.put(
  "/plans/:id",
  requirePermission("mercado_cafe_plan_manage"),
  ctrl.updatePlan,
);

// Fase 6 — reconciliação Asaas / manual — leitura com view, retry exige financial.
const reconCtrl = require("../../controllers/admin/adminReconciliationController");
router.get("/reconciliation/summary", reconCtrl.getSummary);
router.get("/reconciliation/subscriptions", reconCtrl.listSubscriptions);
router.get("/reconciliation/webhook-events", reconCtrl.listWebhookEvents);
router.post(
  "/reconciliation/webhook-events/:id/retry",
  requirePermission("mercado_cafe_financial"),
  reconCtrl.retryWebhookEvent,
);

// Subscriptions por corretora — leitura com view, mutações exigem financial.
router.get(
  "/corretoras/:corretoraId/subscription",
  ctrl.getCorretoraSubscription,
);
router.post(
  "/corretoras/:corretoraId/subscription",
  requirePermission("mercado_cafe_financial"),
  ctrl.assignPlanToCorretora,
);
router.put(
  "/corretoras/:corretoraId/subscription",
  requirePermission("mercado_cafe_financial"),
  ctrl.updateCorretoraSubscription,
);
router.delete(
  "/corretoras/:corretoraId/subscription",
  requirePermission("mercado_cafe_financial"),
  ctrl.cancelCorretoraSubscription,
);

// Destaques pagos por cidade — plan_manage (destaque é visibilidade de plano).
router.get("/city-promotions", ctrl.listCityPromotions);
router.post(
  "/city-promotions",
  requirePermission("mercado_cafe_plan_manage"),
  ctrl.createCityPromotion,
);
router.delete(
  "/city-promotions/:id",
  requirePermission("mercado_cafe_plan_manage"),
  ctrl.deactivateCityPromotion,
);

module.exports = router;
