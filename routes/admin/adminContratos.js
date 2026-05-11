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

// Fase 10.10 — listagem admin paginada com filtros básicos.
// `mercado_cafe_view` é piso para leitura do módulo.
router.get(
  "/",
  requirePermission("mercado_cafe_view"),
  ctrl.listForAdmin,
);

// Reusa a granular já existente `mercado_cafe_plan_manage` para o stub
// (quem gerencia planos pode disparar rituais do módulo). A ClickSign
// real, quando plugada, poderá exigir uma granular dedicada.
router.post(
  "/:id/simular-assinatura",
  requirePermission("mercado_cafe_plan_manage"),
  ctrl.simularAssinatura,
);

// Fase 10.5 — leitura da trilha de auditoria do contrato. Apenas
// leitura: `mercado_cafe_view` (visualização do módulo) é suficiente.
// Mutação não existe — a tabela é append-only e os eventos são
// gravados pelos próprios services do ciclo de vida.
router.get(
  "/:id/audit-log",
  requirePermission("mercado_cafe_view"),
  ctrl.listAuditLog,
);

module.exports = router;
