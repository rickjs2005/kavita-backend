// routes/public/publicCorretoras.js
//
// Public routes for Mercado do Café / Corretoras.
// No auth, no CSRF. Mounted at /api/public/corretoras via publicRoutes.js.
"use strict";

const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/corretorasPublicController");
const mediaService = require("../../services/mediaService");
const upload = mediaService.upload;
const { validate } = require("../../middleware/validate");
const { submitCorretoraSchema } = require("../../schemas/corretorasSchemas");

// Listagem pública de corretoras ativas
router.get("/", ctrl.listCorretoras);

// Lista de cidades disponíveis (para filtro)
router.get("/cities", ctrl.listCities);

// Submissão pública de cadastro (multipart para logo)
router.post(
  "/submit",
  upload.single("logo"),
  validate(submitCorretoraSchema),
  ctrl.submitCorretora
);

// Detalhe por slug (deve vir depois das rotas nomeadas)
router.get("/:slug", ctrl.getBySlug);

module.exports = router;
