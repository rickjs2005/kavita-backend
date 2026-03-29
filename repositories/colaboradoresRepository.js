"use strict";
// repositories/colaboradoresRepository.js
// All SQL for the colaboradores and colaborador_images tables.
// No business logic — callers decide meaning.

const pool = require("../config/pool");

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Returns colaboradores with verificado = 0, with image path from
 * colaborador_images table (overrides the denormalized imagem column).
 *
 * @returns {Array<object>}
 */
async function listPendingColaboradores() {
  const [rows] = await pool.query(
    `SELECT c.*, i.path AS imagem
     FROM colaboradores c
     LEFT JOIN colaborador_images i ON i.colaborador_id = c.id
     WHERE c.verificado = 0
     ORDER BY c.created_at DESC`
  );
  return rows;
}

/**
 * Returns email and nome for a single colaborador, or null if not found.
 *
 * @param {number|string} id
 * @returns {{ email: string, nome: string }|null}
 */
async function findColaboradorById(id) {
  const [rows] = await pool.query(
    "SELECT id, email, nome FROM colaboradores WHERE id = ?",
    [id]
  );
  return rows[0] || null;
}

/**
 * Returns all image paths for a colaborador.
 *
 * @param {number|string} id
 * @returns {Array<{ path: string }>}
 */
async function getColaboradorImages(id) {
  const [rows] = await pool.query(
    "SELECT path FROM colaborador_images WHERE colaborador_id = ?",
    [id]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Inserts a new colaborador row.
 * `verificado` must be 0 (public submission) or 1 (admin direct create).
 *
 * @param {{ nome, cargo, whatsapp, email, descricao, especialidade_id, verificado }} data
 * @returns {number} insertId
 */
async function createColaborador({
  nome,
  cargo,
  whatsapp,
  email,
  descricao,
  especialidade_id,
  verificado,
}) {
  const [result] = await pool.query(
    `INSERT INTO colaboradores
     (nome, cargo, whatsapp, email, descricao, especialidade_id, verificado)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [nome, cargo || null, whatsapp, email, descricao || null, especialidade_id, verificado]
  );
  return result.insertId;
}

/**
 * Records an image in colaborador_images.
 *
 * @param {number} colaboradorId
 * @param {string} imagePath  Relative public path, e.g. "/uploads/colaboradores/img.jpg"
 */
async function insertColaboradorImage(colaboradorId, imagePath) {
  await pool.query(
    "INSERT INTO colaborador_images (colaborador_id, path) VALUES (?, ?)",
    [colaboradorId, imagePath]
  );
}

/**
 * Updates the denormalized imagem column on the colaboradores row.
 *
 * @param {number} colaboradorId
 * @param {string} imagePath
 */
async function updateColaboradorImage(colaboradorId, imagePath) {
  await pool.query(
    "UPDATE colaboradores SET imagem = ? WHERE id = ?",
    [imagePath, colaboradorId]
  );
}

/**
 * Sets verificado = 1 for a colaborador.
 *
 * @param {number|string} id
 */
async function verifyColaborador(id) {
  await pool.query(
    "UPDATE colaboradores SET verificado = 1 WHERE id = ?",
    [id]
  );
}

/**
 * Deletes all image rows for a colaborador.
 *
 * @param {number|string} id
 */
async function deleteColaboradorImages(id) {
  await pool.query(
    "DELETE FROM colaborador_images WHERE colaborador_id = ?",
    [id]
  );
}

/**
 * Hard-deletes a colaborador row.
 *
 * @param {number|string} id
 * @returns {number} affectedRows — 0 means colaborador did not exist
 */
async function deleteColaborador(id) {
  const [result] = await pool.query(
    "DELETE FROM colaboradores WHERE id = ?",
    [id]
  );
  return result.affectedRows;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listPendingColaboradores,
  findColaboradorById,
  getColaboradorImages,
  createColaborador,
  insertColaboradorImage,
  updateColaboradorImage,
  verifyColaborador,
  deleteColaboradorImages,
  deleteColaborador,
};
