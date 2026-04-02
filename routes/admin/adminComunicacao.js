"use strict";
// routes/admin/adminComunicacao.js
//
// Rota magra — apenas wiring.
// verifyAdmin + validateCSRF são aplicados pelo mount() em adminRoutes.js.

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const {
  enviarEmailSchema,
  enviarWhatsappSchema,
} = require("../../schemas/comunicacaoSchemas");
const ctrl = require("../../controllers/comunicacaoController");

/**
 * @openapi
 * tags:
 *   - name: Admin - Comunicação
 *     description: Envio de e-mails e WhatsApp pelo painel admin
 */

// GET  /api/admin/comunicacao/templates
router.get("/templates", ctrl.listTemplates);

// POST /api/admin/comunicacao/email
router.post(
  "/email",
  validate(enviarEmailSchema, "body"),
  ctrl.enviarEmail
);

// POST /api/admin/comunicacao/whatsapp
router.post(
  "/whatsapp",
  validate(enviarWhatsappSchema, "body"),
  ctrl.enviarWhatsapp
);

module.exports = router;
