"use strict";
// routes/admin/adminServicos.js
//
// Rota magra — apenas wiring.
// verifyAdmin + validateCSRF são aplicados pelo mount() em adminRoutes.js.

const express = require("express");
const router = express.Router();

const mediaService = require("../../services/mediaService");
const { validate } = require("../../middleware/validate");
const {
  createServicoSchema,
  updateServicoBodySchema,
  setVerificadoSchema,
  idParamSchema,
} = require("../../schemas/servicosAdminSchemas");
const ctrl = require("../../controllers/servicosAdminController");

const upload = mediaService.upload;

/**
 * @openapi
 * tags:
 *   - name: Admin - Serviços
 *     description: CRUD admin de colaboradores/serviços
 */

// GET  /api/admin/servicos
router.get("/", ctrl.listServicos);

// POST /api/admin/servicos
router.post(
  "/",
  upload.array("images"),
  validate(createServicoSchema, "body"),
  ctrl.createServico
);

// PUT  /api/admin/servicos/:id
router.put(
  "/:id",
  upload.array("images"),
  validate(idParamSchema, "params"),
  validate(updateServicoBodySchema, "body"),
  ctrl.updateServico
);

// DELETE /api/admin/servicos/:id
router.delete(
  "/:id",
  validate(idParamSchema, "params"),
  ctrl.deleteServico
);

// PATCH /api/admin/servicos/:id/verificado
router.patch(
  "/:id/verificado",
  validate(idParamSchema, "params"),
  validate(setVerificadoSchema, "body"),
  ctrl.setVerificado
);

module.exports = router;
