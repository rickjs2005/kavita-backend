"use strict";
// repositories/contatoRepository.js
//
// Acesso a dados para mensagens de contato publico.
// Tabela: mensagens_contato.

const pool = require("../config/pool");

/**
 * Insere uma nova mensagem de contato.
 * @returns {{ insertId: number }}
 */
async function create({ nome, email, telefone, assunto, mensagem, ip }) {
  const [result] = await pool.query(
    `INSERT INTO mensagens_contato (nome, email, telefone, assunto, mensagem, ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nome, email, telefone || null, assunto, mensagem, ip || null]
  );
  return { insertId: result.insertId };
}

/**
 * Conta mensagens do mesmo IP nas ultimas N horas.
 * Usado para rate limiting por IP.
 */
async function countByIpSince(ip, hours = 1) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM mensagens_contato
     WHERE ip = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [ip, hours]
  );
  return rows[0].total;
}

/**
 * Lista todas as mensagens de contato com filtros opcionais.
 */
async function findAll({ status, limit = 50, offset = 0 } = {}) {
  let where = "1=1";
  const params = [];

  if (status) {
    where += " AND status = ?";
    params.push(status);
  }

  const countSql = `SELECT COUNT(*) AS total FROM mensagens_contato WHERE ${where}`;
  const dataSql = `
    SELECT id, nome, email, telefone, assunto, mensagem, status, ip, created_at, updated_at
    FROM mensagens_contato
    WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?`;

  const [countRows] = await pool.query(countSql, params);
  const [rows] = await pool.query(dataSql, [...params, limit, offset]);

  return { rows, total: countRows[0].total };
}

/**
 * Busca uma mensagem por ID.
 */
async function findById(id) {
  const [rows] = await pool.query(
    "SELECT * FROM mensagens_contato WHERE id = ?",
    [id]
  );
  return rows[0] || null;
}

/**
 * Atualiza o status de uma mensagem.
 */
async function updateStatus(id, status) {
  const [result] = await pool.query(
    "UPDATE mensagens_contato SET status = ? WHERE id = ?",
    [status, id]
  );
  return result.affectedRows;
}

/**
 * Remove uma mensagem.
 */
async function deleteById(id) {
  const [result] = await pool.query(
    "DELETE FROM mensagens_contato WHERE id = ?",
    [id]
  );
  return result.affectedRows;
}

/**
 * Conta mensagens agrupadas por status.
 */
async function countByStatus() {
  const [rows] = await pool.query(
    "SELECT status, COUNT(*) AS total FROM mensagens_contato GROUP BY status"
  );
  return rows;
}

/* ── Analytics ──────────────────────────────────────────────────── */

const VALID_EVENTS = new Set([
  "faq_topic_view",
  "faq_search",
  "form_start",
  "whatsapp_hero_click",
]);

/**
 * Registra um evento de analytics.
 */
async function insertEvent(eventType, eventValue) {
  if (!VALID_EVENTS.has(eventType)) return;
  await pool.query(
    "INSERT INTO contato_analytics (event_type, event_value) VALUES (?, ?)",
    [eventType, (eventValue || "").slice(0, 255) || null]
  );
}

/**
 * Retorna contagens agregadas de analytics para o admin.
 * @param {number} days — janela de dias para agregar
 */
async function getAnalytics(days = 30) {
  const [topTopics] = await pool.query(
    `SELECT event_value AS topic, COUNT(*) AS views
     FROM contato_analytics
     WHERE event_type = 'faq_topic_view'
       AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY event_value
     ORDER BY views DESC
     LIMIT 20`,
    [days]
  );

  const [topSearches] = await pool.query(
    `SELECT event_value AS term, COUNT(*) AS searches
     FROM contato_analytics
     WHERE event_type = 'faq_search'
       AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY event_value
     ORDER BY searches DESC
     LIMIT 20`,
    [days]
  );

  const [eventCounts] = await pool.query(
    `SELECT event_type, COUNT(*) AS total
     FROM contato_analytics
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY event_type`,
    [days]
  );

  return { topTopics, topSearches, eventCounts };
}

module.exports = {
  create,
  countByIpSince,
  findAll,
  findById,
  updateStatus,
  deleteById,
  countByStatus,
  insertEvent,
  getAnalytics,
};
