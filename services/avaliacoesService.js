"use strict";
// services/avaliacoesService.js
// Business logic for product reviews — transactional insert + rating recalc.

const { withTransaction } = require("../lib/withTransaction");
const repo = require("../repositories/avaliacoesRepository");

async function createReview(produtoId, usuarioId, nota, comentario) {
  await withTransaction(async (conn) => {
    await repo.createReview(conn, produtoId, usuarioId, nota, comentario);
    await repo.recalcRating(conn, produtoId);
  });
}

module.exports = {
  createReview,
};
