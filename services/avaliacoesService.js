"use strict";
// services/avaliacoesService.js
// Business logic for product reviews — transactional insert + rating recalc.

const pool = require("../config/pool");
const repo = require("../repositories/avaliacoesRepository");

async function createReview(produtoId, usuarioId, nota, comentario) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await repo.createReview(conn, produtoId, usuarioId, nota, comentario);
    await repo.recalcRating(conn, produtoId);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  createReview,
};
