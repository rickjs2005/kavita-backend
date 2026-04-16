// routes/admin/adminPlans.js
"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/admin/adminPlansController");

// Plans
router.get("/plans", ctrl.listPlans);
router.post("/plans", ctrl.createPlan);
router.put("/plans/:id", ctrl.updatePlan);

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
