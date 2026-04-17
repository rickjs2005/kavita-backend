// repositories/corretoraSlugHistoryRepository.js
//
// Mapa slug antigo → corretora atual. Usado para redirect 301 na
// camada pública quando a corretora foi renomeada depois que o slug
// antigo foi indexado externamente. Insere no update e consulta no
// findBySlug quando ativa não é achada.
"use strict";

const pool = require("../config/pool");

/**
 * Registra que o slug antigo foi aposentado. INSERT IGNORE deixa a
 * operação idempotente: se o slug já existe no histórico (ex.: em
 * rename em cascata), mantemos a primeira retirada como válida.
 */
async function record(oldSlug, corretoraId, conn = pool) {
  if (!oldSlug) return;
  await conn.query(
    `INSERT IGNORE INTO corretora_slug_history (old_slug, corretora_id)
     VALUES (?, ?)`,
    [oldSlug, corretoraId],
  );
}

/**
 * Busca o slug atual para um slug antigo. Retorna null quando não
 * houve rename — aí a camada pública devolve 404 normalmente.
 */
async function resolveRedirect(oldSlug) {
  // Só redireciona se a corretora atual está ativa e não arquivada.
  // Corretora inativa/arquivada vira 404 natural — redirecionar para
  // /slug 404 é pior SEO do que servir o 404 de cara.
  const [rows] = await pool.query(
    `SELECT c.slug AS current_slug, h.corretora_id
     FROM corretora_slug_history h
     JOIN corretoras c ON c.id = h.corretora_id
     WHERE h.old_slug = ?
       AND c.status = 'active'
       AND c.deleted_at IS NULL
     LIMIT 1`,
    [oldSlug],
  );
  return rows[0] ?? null;
}

module.exports = { record, resolveRedirect };
