"use strict";
// routes/motorista/motoristaPanel.js
//
// Endpoints autenticados do motorista. Mountado em /api/motorista via
// motoristaRoutes.js — verifyMotorista + validateCSRF aplicados no mount.

const express = require("express");
const multer = require("multer");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/motorista/motoristaController");
const mediaService = require("../../services/mediaService");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const {
  finalizarRotaSchema,
  reportarProblemaSchema,
  marcarEntregueSchema,
  fixarPosicaoSchema,
} = require("../../schemas/rotasSchemas");

// Wrapper que converte erros do multer em AppError amigaveis (4xx) em vez
// de stack trace cru. Errors esperados: Unexpected field (form-data com
// nome errado), LIMIT_FILE_SIZE, MIME bloqueado pelo fileFilter.
function uploadFotoMiddleware(req, res, next) {
  mediaService.upload.single("foto")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const code = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return next(
        new AppError(
          `Upload de foto rejeitado: ${err.message}.`,
          ERROR_CODES.VALIDATION_ERROR,
          code,
          { field: err.field || "foto" },
        ),
      );
    }
    // Erros do fileFilter (mimetype) ja vem com .status = 400
    if (err.status && err.message) {
      return next(new AppError(err.message, ERROR_CODES.VALIDATION_ERROR, err.status));
    }
    return next(err);
  });
}

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
// uploadFotoMiddleware traduz erros do multer (campo errado, MIME, tamanho)
// em AppError 4xx — sem isso, frontend recebia stack trace cru.
router.post(
  "/paradas/:id/comprovante",
  uploadFotoMiddleware,
  ctrl.salvarComprovante,
);

module.exports = router;
