"use strict";
// routes/admin/adminConfigUpload.js
//
// Rota magra — apenas wiring.
// verifyAdmin + validateCSRF + requirePermission("config.editar") aplicados pelo mount() em adminRoutes.js.

const express = require("express");
const router = express.Router();
const mediaService = require("../../services/mediaService");
const ctrl = require("../../controllers/shopConfigUploadController");
const ERROR_CODES = require("../../constants/ErrorCodes");

const upload = mediaService.upload;

// POST /api/admin/shop-config/upload/logo
router.post("/logo", upload.single("logo"), ctrl.uploadLogo);

// Handler de erros do multer (tamanho/formato)
router.use((err, req, res, next) => {
  const msg = err?.message || "Erro no upload.";
  if (msg.includes("File too large") || err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ ok: false, code: ERROR_CODES.VALIDATION_ERROR, message: "Arquivo muito grande. Envie até 2MB." });
  }
  if (msg.includes("Formato inválido")) {
    return res.status(400).json({ ok: false, code: ERROR_CODES.VALIDATION_ERROR, message: msg });
  }
  return next(err);
});

module.exports = router;
