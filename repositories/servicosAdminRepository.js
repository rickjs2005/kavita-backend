"use strict";
// repositories/servicosAdminRepository.js
//
// Escopo: CRUD admin de colaboradores/serviços.
// Tabelas: colaboradores, colaborador_images, especialidades.
//
// ⚠️  NÃO confundir com servicosRepository.js, que é o domínio PÚBLICO:
//     listagem filtrada por verificado=1, paginada, com avaliações.
//
// Consumidor: services/servicosAdminService.js
//
// Convenção de conexão:
//   Funções de leitura simples: pool.query interno.
//   Funções transacionais: recebem `conn` como 1º argumento.

const pool = require("../config/pool");

const COLAB_TABLE = "colaboradores";
const IMAGES_TABLE = "colaborador_images";

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Lista todos os colaboradores (sem filtro de verificado) com JOIN de especialidade.
 * @returns {object[]}
 */
async function findAll() {
  const [rows] = await pool.query(`
    SELECT
      c.id,
      c.nome,
      c.cargo,
      c.whatsapp,
      c.imagem,
      c.descricao,
      c.especialidade_id,
      c.verificado,
      e.nome AS especialidade_nome
    FROM ${COLAB_TABLE} c
    LEFT JOIN especialidades e ON c.especialidade_id = e.id
    ORDER BY c.id DESC
  `);
  return rows;
}

/**
 * Busca imagens de múltiplos colaboradores em uma única query (evita N+1).
 * @param {number[]} ids
 * @returns {{ colaborador_id: number, path: string }[]}
 */
async function findImagesBatch(ids) {
  if (!ids.length) return [];
  const [imgs] = await pool.query(
    `SELECT colaborador_id, path FROM ${IMAGES_TABLE} WHERE colaborador_id IN (?)`,
    [ids]
  );
  return imgs;
}

/**
 * Busca imagens de um único colaborador. Usa `conn` para operar dentro de transação.
 * @param {import("mysql2").Connection} conn
 * @param {number} colaboradorId
 * @returns {{ id: number, path: string }[]}
 */
async function findImagesByColaboradorId(conn, colaboradorId) {
  const [rows] = await conn.query(
    `SELECT id, path FROM ${IMAGES_TABLE} WHERE colaborador_id = ?`,
    [colaboradorId]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Escrita — colaboradores
// ---------------------------------------------------------------------------

/**
 * Insere novo colaborador (sempre verificado = 1 para criações admin).
 * @param {import("mysql2").Connection} conn
 * @param {{ nome, cargo, whatsapp, descricao, especialidade_id }} data
 * @returns {number} insertId
 */
async function insertServico(conn, { nome, cargo, whatsapp, descricao, especialidade_id }) {
  const [result] = await conn.query(
    `INSERT INTO ${COLAB_TABLE} (nome, cargo, whatsapp, imagem, descricao, especialidade_id, verificado)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [nome, cargo || null, whatsapp, null, descricao || null, especialidade_id]
  );
  return result.insertId;
}

/**
 * Atualiza campos textuais do colaborador.
 * @param {import("mysql2").Connection} conn
 * @param {number} id
 * @param {{ nome, cargo, whatsapp, descricao, especialidade_id }} data
 */
async function updateServico(conn, id, { nome, cargo, whatsapp, descricao, especialidade_id }) {
  await conn.query(
    `UPDATE ${COLAB_TABLE}
     SET nome = ?, cargo = ?, whatsapp = ?, descricao = ?, especialidade_id = ?
     WHERE id = ?`,
    [nome, cargo || null, whatsapp, descricao || null, especialidade_id, id]
  );
}

/**
 * Atualiza a imagem principal (campo `imagem`) do colaborador.
 * @param {import("mysql2").Connection} conn
 * @param {number} id
 * @param {string|null} imagePath
 */
async function updateMainImage(conn, id, imagePath) {
  await conn.query(
    `UPDATE ${COLAB_TABLE} SET imagem = ? WHERE id = ?`,
    [imagePath, id]
  );
}

/**
 * Remove o colaborador. Retorna affectedRows (0 = não encontrado).
 * @param {import("mysql2").Connection} conn
 * @param {number} id
 * @returns {number}
 */
async function deleteServico(conn, id) {
  const [result] = await conn.query(
    `DELETE FROM ${COLAB_TABLE} WHERE id = ?`,
    [id]
  );
  return result.affectedRows;
}

/**
 * Atualiza o campo verificado. Opera diretamente no pool (sem transação).
 * @param {number} id
 * @param {boolean} verificado
 * @returns {number} affectedRows
 */
async function setVerificado(id, verificado) {
  const [result] = await pool.query(
    `UPDATE ${COLAB_TABLE} SET verificado = ? WHERE id = ?`,
    [verificado ? 1 : 0, id]
  );
  return result.affectedRows;
}

// ---------------------------------------------------------------------------
// Escrita — imagens
// ---------------------------------------------------------------------------

/**
 * Insere múltiplas imagens para um colaborador.
 * @param {import("mysql2").Connection} conn
 * @param {number} colaboradorId
 * @param {string[]} paths
 */
async function insertImages(conn, colaboradorId, paths) {
  if (!paths.length) return;
  const values = paths.map((p) => [colaboradorId, p]);
  await conn.query(
    `INSERT INTO ${IMAGES_TABLE} (colaborador_id, path) VALUES ?`,
    [values]
  );
}

/**
 * Remove imagens por IDs (mantém escopo por colaborador para segurança).
 * @param {import("mysql2").Connection} conn
 * @param {number[]} ids
 * @param {number} colaboradorId
 */
async function deleteImagesByIds(conn, ids, colaboradorId) {
  if (!ids.length) return;
  await conn.query(
    `DELETE FROM ${IMAGES_TABLE} WHERE id IN (?) AND colaborador_id = ?`,
    [ids, colaboradorId]
  );
}

/**
 * Remove todas as imagens de um colaborador.
 * @param {import("mysql2").Connection} conn
 * @param {number} colaboradorId
 */
async function deleteAllImages(conn, colaboradorId) {
  await conn.query(
    `DELETE FROM ${IMAGES_TABLE} WHERE colaborador_id = ?`,
    [colaboradorId]
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  findAll,
  findImagesBatch,
  findImagesByColaboradorId,
  insertServico,
  updateServico,
  updateMainImage,
  deleteServico,
  setVerificado,
  insertImages,
  deleteImagesByIds,
  deleteAllImages,
};
