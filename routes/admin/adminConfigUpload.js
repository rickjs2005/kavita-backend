"use strict";
// routes/admin/adminConfigUpload.js
//
// Rota magra — apenas wiring.
// verifyAdmin + validateCSRF + requirePermission("config.editar") aplicados pelo mount() em adminRoutes.js.
// Erros de multer (tamanho/formato) sao tratados pelo errorHandler global.

const express = require("express");
const router = express.Router();
const mediaService = require("../../services/mediaService");
const ctrl = require("../../controllers/shopConfigUploadController");

const upload = mediaService.upload;

// POST /api/admin/shop-config/upload/logo
router.post("/logo", upload.single("logo"), ctrl.uploadLogo);

module.exports = router;
