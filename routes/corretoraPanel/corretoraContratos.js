// routes/corretoraPanel/corretoraContratos.js
//
// Rotas do painel autenticado da corretora para o ciclo de vida do
// contrato (Fase 10.1). verifyCorretora + validateCSRF já aplicados
// no mount central (corretoraPanelRoutes.js).
//
// Gate de plano (G1 auditoria 2026-04-24):
//   - Criar/enviar contrato exige capability `create_contract` (PRO+).
//   - Listar, baixar PDF e CANCELAR permanecem livres — corretoras FREE
//     que já possuem contratos continuam operando; cancelamento é
//     sempre humano e deve ser possível em qualquer plano.
"use strict";

const express = require("express");
const router = express.Router();

const { requireCapability } = require("../../lib/corretoraPermissions");
const { requirePlanCapability } = require("../../services/planService");
const ctrl = require("../../controllers/corretoraPanel/contratosCorretoraController");

// Listagem por lead — qualquer role com leads.view pode ler.
router.get("/", requireCapability("leads.view"), ctrl.listContratosPorLead);

// Criar contrato — requer capability de role (leads.update) + plano PRO+.
router.post(
  "/",
  requireCapability("leads.update"),
  requirePlanCapability("create_contract"),
  ctrl.createContrato,
);

// Enviar contrato — idem criar (feature paga).
router.post(
  "/:id/enviar",
  requireCapability("leads.update"),
  requirePlanCapability("create_contract"),
  ctrl.enviarContrato,
);

// Cancelar contrato — sem gate de plano. Cancelamento deve ser sempre
// acessível, mesmo em plano FREE (compromisso humano com o produtor).
router.post(
  "/:id/cancelar",
  requireCapability("leads.update"),
  ctrl.cancelarContrato,
);

// Download do PDF — leitura, basta leads.view.
router.get("/:id/pdf", requireCapability("leads.view"), ctrl.baixarPdf);

module.exports = router;
