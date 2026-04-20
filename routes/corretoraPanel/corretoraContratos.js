// routes/corretoraPanel/corretoraContratos.js
//
// Rotas do painel autenticado da corretora para o ciclo de vida do
// contrato (Fase 10.1). verifyCorretora + validateCSRF já aplicados
// no mount central (corretoraPanelRoutes.js).
"use strict";

const express = require("express");
const router = express.Router();

const { requireCapability } = require("../../lib/corretoraPermissions");
const ctrl = require("../../controllers/corretoraPanel/contratosCorretoraController");

// Listagem por lead — qualquer role com leads.view pode ler.
router.get("/", requireCapability("leads.view"), ctrl.listContratosPorLead);

// Geração e ciclo de vida exigem capacidade de alterar o lead
// (mesmo nível de proposta/status).
router.post("/", requireCapability("leads.update"), ctrl.createContrato);
router.post(
  "/:id/enviar",
  requireCapability("leads.update"),
  ctrl.enviarContrato,
);
router.post(
  "/:id/cancelar",
  requireCapability("leads.update"),
  ctrl.cancelarContrato,
);

// Download do PDF — leitura, basta leads.view.
router.get("/:id/pdf", requireCapability("leads.view"), ctrl.baixarPdf);

module.exports = router;
