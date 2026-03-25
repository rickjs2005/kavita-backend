// repositories/addressRepository.js
// All SQL for the enderecos_usuario table.
"use strict";

const pool = require("../config/pool");

const SELECT_FIELDS = `
  id,
  apelido,
  cep,
  endereco,
  numero,
  bairro,
  cidade,
  estado,
  complemento,
  ponto_referencia,
  telefone,
  is_default,
  tipo_localidade,
  comunidade,
  observacoes_acesso
`;

/**
 * Returns all addresses for a user ordered by default first, then newest.
 *
 * @param {number} userId
 * @returns {object[]}
 */
async function findByUserId(userId) {
  const [rows] = await pool.query(
    `SELECT ${SELECT_FIELDS} FROM enderecos_usuario WHERE usuario_id = ? ORDER BY is_default DESC, id DESC`,
    [userId]
  );
  return rows;
}

/**
 * Clears the is_default flag for all addresses of a user.
 * Must be called within a transaction.
 *
 * @param {object} conn  Active DB connection
 * @param {number} userId
 */
async function clearDefaultForUser(conn, userId) {
  await conn.query(
    "UPDATE enderecos_usuario SET is_default = 0 WHERE usuario_id = ?",
    [userId]
  );
}

/**
 * Inserts a new address. Must be called within a transaction.
 *
 * @param {object} conn  Active DB connection
 * @param {number} userId
 * @param {object} data  Normalized address fields
 */
async function createAddress(conn, userId, data) {
  await conn.query(
    `INSERT INTO enderecos_usuario (
      usuario_id, apelido, cep, endereco, numero, bairro, cidade, estado,
      complemento, ponto_referencia, telefone, is_default, tipo_localidade,
      comunidade, observacoes_acesso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      data.apelido,
      data.cep,
      data.endereco,
      data.numero,
      data.bairro,
      data.cidade,
      data.estado,
      data.complemento,
      data.ponto_referencia,
      data.telefone,
      data.is_default,
      data.tipo_localidade,
      data.comunidade,
      data.observacoes_acesso,
    ]
  );
}

/**
 * Updates an address. Must be called within a transaction.
 * Uses `WHERE id = ? AND usuario_id = ?` to prevent cross-user edits.
 *
 * @param {object} conn
 * @param {number} addressId
 * @param {number} userId
 * @param {object} data  Normalized address fields
 * @returns {{ affectedRows: number }}
 */
async function updateAddress(conn, addressId, userId, data) {
  const [result] = await conn.query(
    `UPDATE enderecos_usuario
     SET apelido = ?, cep = ?, endereco = ?, numero = ?, bairro = ?, cidade = ?,
         estado = ?, complemento = ?, ponto_referencia = ?, telefone = ?,
         is_default = ?, tipo_localidade = ?, comunidade = ?, observacoes_acesso = ?
     WHERE id = ? AND usuario_id = ?`,
    [
      data.apelido,
      data.cep,
      data.endereco,
      data.numero,
      data.bairro,
      data.cidade,
      data.estado,
      data.complemento,
      data.ponto_referencia,
      data.telefone,
      data.is_default,
      data.tipo_localidade,
      data.comunidade,
      data.observacoes_acesso,
      addressId,
      userId,
    ]
  );
  return result;
}

/**
 * Deletes an address.
 * Uses `WHERE id = ? AND usuario_id = ?` to prevent cross-user deletes.
 *
 * @param {number} userId
 * @param {number} addressId
 * @returns {{ affectedRows: number }}
 */
async function deleteById(userId, addressId) {
  const [result] = await pool.query(
    "DELETE FROM enderecos_usuario WHERE id = ? AND usuario_id = ?",
    [addressId, userId]
  );
  return result;
}

module.exports = {
  findByUserId,
  clearDefaultForUser,
  createAddress,
  updateAddress,
  deleteById,
};
