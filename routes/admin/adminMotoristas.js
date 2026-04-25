"use strict";
// routes/admin/adminMotoristas.js
//
// CRUD admin de motoristas. Mountado em /api/admin/motoristas via
// adminRoutes.js — verifyAdmin + validateCSRF + requirePermission ja
// aplicados no nivel do mount.

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/admin/motoristasAdminController");
const {
  createMotoristaSchema,
  updateMotoristaSchema,
  setAtivoSchema,
} = require("../../schemas/motoristasSchemas");

router.get("/", ctrl.listar);
router.post("/", validate(createMotoristaSchema), ctrl.criar);
router.put("/:id", validate(updateMotoristaSchema), ctrl.atualizar);
router.patch("/:id/ativo", validate(setAtivoSchema), ctrl.setAtivo);
router.post("/:id/enviar-link", ctrl.enviarLink);

module.exports = router;
