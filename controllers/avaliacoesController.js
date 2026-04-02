"use strict";
// controllers/avaliacoesController.js
//
// Product reviews (avaliações) — public endpoints.
// Consumer: routes/public/publicProdutos.js

const { response } = require("../lib");
const repo = require("../repositories/avaliacoesRepository");
const service = require("../services/avaliacoesService");

// ---------------------------------------------------------------------------
// GET /api/public/produtos?busca=&limit=
// ---------------------------------------------------------------------------

const quickSearch = async (req, res, next) => {
  try {
    const { busca, limit } = req.query;
    if (!busca) {
      return response.ok(res, []);
    }
    const data = await repo.quickSearch(busca, limit);
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/public/produtos/avaliacoes
// ---------------------------------------------------------------------------

const createReview = async (req, res, next) => {
  try {
    const { produto_id, nota, comentario } = req.body;
    await service.createReview(produto_id, req.user.id, nota, comentario);
    response.created(res, null, "Avaliação registrada com sucesso.");
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/public/produtos/:id/avaliacoes
// ---------------------------------------------------------------------------

const listReviews = async (req, res, next) => {
  try {
    const data = await repo.findByProductId(req.params.id);
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  quickSearch,
  createReview,
  listReviews,
};
