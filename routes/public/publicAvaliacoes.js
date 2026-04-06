"use strict";
// routes/public/publicAvaliacoes.js
// ✅ Padrão moderno — rota magra.
// Sem auth — endpoints públicos de avaliação de produtos + quick search.
// Renomeado de publicProdutos.js — nome anterior era enganoso (serve avaliações, não produtos).
//
// authenticateToken é aplicado apenas no POST (criar avaliação).

const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/authenticateToken");
const { validate } = require("../../middleware/validate");
const {
  criarAvaliacaoBodySchema,
  produtoIdParamSchema,
  buscaProdutosQuerySchema,
} = require("../../schemas/avaliacoesSchemas");
const ctrl = require("../../controllers/avaliacoesController");

// GET /api/public/produtos?busca=&limit=
router.get("/", validate(buscaProdutosQuerySchema, "query"), ctrl.quickSearch);

// POST /api/public/produtos/avaliacoes (auth obrigatória)
router.post(
  "/avaliacoes",
  authenticateToken,
  validate(criarAvaliacaoBodySchema),
  ctrl.createReview
);

// GET /api/public/produtos/:id/avaliacoes
router.get(
  "/:id/avaliacoes",
  validate(produtoIdParamSchema, "params"),
  ctrl.listReviews
);

module.exports = router;
