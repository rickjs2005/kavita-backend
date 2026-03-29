// routes/admin/adminColaboradores.js
// ✅ Padrão moderno — rota magra.
// verifyAdmin + validateCSRF são aplicados no mount em routes/index.js.
//
// NOTA ARQUITETURAL: /public foi originalmente concebido como um endpoint público
// ("Trabalhe conosco"), mas routes/index.js monta o router inteiro com verifyAdmin,
// tornando-o efetivamente protegido. Comportamento preservado da versão legada.
// Para torná-lo genuinamente público, mover para routes/public/publicColaboradores.js.
"use strict";

const express = require("express");
const router = express.Router();
const { validate } = require("../../middleware/validate");
const {
  ColaboradorIdParamSchema,
  CreateColaboradorSchema,
} = require("../../schemas/colaboradoresSchemas");
const mediaService = require("../../services/mediaService");
const ctrl = require("../../controllers/colaboradoresController");

const upload = mediaService.upload;

// POST /api/admin/colaboradores/public  — "Trabalhe conosco"
router.post(
  "/public",
  upload.single("imagem"),
  validate(CreateColaboradorSchema),
  ctrl.createPublic
);

// POST /api/admin/colaboradores  — cadastro direto pelo painel admin
router.post(
  "/",
  upload.single("imagem"),
  validate(CreateColaboradorSchema),
  ctrl.create
);

// GET /api/admin/colaboradores/pending
router.get("/pending", ctrl.listPending);

// PUT /api/admin/colaboradores/:id/verify
router.put(
  "/:id/verify",
  validate(ColaboradorIdParamSchema, "params"),
  ctrl.verify
);

// DELETE /api/admin/colaboradores/:id
router.delete(
  "/:id",
  validate(ColaboradorIdParamSchema, "params"),
  ctrl.remove
);

module.exports = router;
