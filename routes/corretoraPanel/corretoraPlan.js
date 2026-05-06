// routes/corretoraPanel/corretoraPlan.js
"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/corretoraPanel/planCorretoraController");
const { validate } = require("../../middleware/validate");
const planSchemas = require("../../schemas/planSchemas");

router.get("/", ctrl.getMyPlan);
router.get("/available", ctrl.listAvailablePlans);
router.get("/events", ctrl.listMyPlanEvents);
// Self-service: FREE so. Plano pago vai pro /checkout; Enterprise
// vai pro /enterprise-contact. O backend bloqueia por valor.
router.post("/upgrade", validate(planSchemas.upgradeBodySchema), ctrl.requestUpgrade);
// Fase 6 — checkout via Asaas para PRO/MAX. Frontend redireciona pro link.
router.post("/checkout", validate(planSchemas.checkoutBodySchema), ctrl.createCheckout);
// Decisao Comercial 2026-05-06 — Enterprise abre contato comercial,
// nao ativa nada.
router.post(
  "/enterprise-contact",
  validate(planSchemas.enterpriseContactBodySchema),
  ctrl.enterpriseContact,
);
// Self-service de cancelamento — owner only. Volta a corretora pro FREE.
router.post("/cancel", validate(planSchemas.cancelBodySchema), ctrl.cancelMyPlan);

module.exports = router;
