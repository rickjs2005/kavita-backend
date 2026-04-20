// routes/admin/adminContratos.js
//
// Endpoints admin para o módulo de contratos. Hoje existe apenas o
// stub de simulação de assinatura (Fase 10.1). Na Fase 10.1 - PR 2
// aqui poderá entrar reenvio manual, troca de provedor, etc.
"use strict";

const express = require("express");
const router = express.Router();

const requirePermission = require("../../middleware/requirePermission");
const ctrl = require("../../controllers/admin/adminContratosController");

// Reusa a granular já existente `mercado_cafe_plan_manage` para o stub
// (quem gerencia planos pode disparar rituais do módulo). A ClickSign
// real, quando plugada, poderá exigir uma granular dedicada.
router.post(
  "/:id/simular-assinatura",
  requirePermission("mercado_cafe_plan_manage"),
  ctrl.simularAssinatura,
);

module.exports = router;
