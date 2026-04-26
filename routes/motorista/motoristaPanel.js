"use strict";
// routes/motorista/motoristaPanel.js
//
// Endpoints autenticados do motorista. Mountado em /api/motorista via
// motoristaRoutes.js — verifyMotorista + validateCSRF aplicados no mount.

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/motorista/motoristaController");
const mediaService = require("../../services/mediaService");
const {
  finalizarRotaSchema,
  reportarProblemaSchema,
  marcarEntregueSchema,
  fixarPosicaoSchema,
} = require("../../schemas/rotasSchemas");

router.get("/me", ctrl.me);
router.get("/rota-hoje", ctrl.rotaHoje);
router.get("/rotas/:id", ctrl.rotaDetalhe);

router.post("/rotas/:id/iniciar", ctrl.iniciarRota);
router.post(
  "/rotas/:id/finalizar",
  validate(finalizarRotaSchema),
  ctrl.finalizarRota,
);

router.post("/paradas/:id/abrir", ctrl.abrirParada);
router.post(
  "/paradas/:id/entregue",
  validate(marcarEntregueSchema),
  ctrl.marcarEntregue,
);
router.post(
  "/paradas/:id/problema",
  validate(reportarProblemaSchema),
  ctrl.reportarProblema,
);
router.post(
  "/paradas/:id/posicao",
  validate(fixarPosicaoSchema),
  ctrl.fixarPosicao,
);

// Fase 5 — comprovante (foto + assinatura). Multipart com 1 arquivo
// 'foto' (opcional) + body string 'assinaturaBase64' (opcional, PNG canvas).
router.post(
  "/paradas/:id/comprovante",
  mediaService.upload.single("foto"),
  ctrl.salvarComprovante,
);

module.exports = router;
