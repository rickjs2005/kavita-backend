// repositories/corretoraAdminNotesRepository.js
//
// Notas internas do admin Kavita sobre uma corretora. NUNCA expostas
// ao painel da corretora — só a equipe Kavita vê.
"use strict";

const pool = require("../config/pool");

async function listForCorretora(corretoraId, { limit = 100 } = {}) {
  const [rows] = await pool.query(
    `SELECT id, corretora_id, admin_id, admin_nome, body, category, created_at
       FROM corretora_admin_notes
      WHERE corretora_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [corretoraId, Number(limit)],
  );
  return rows;
}

async function create({ corretora_id, admin_id, admin_nome, body, category }) {
  const [result] = await pool.query(
    `INSERT INTO corretora_admin_notes
       (corretora_id, admin_id, admin_nome, body, category)
     VALUES (?, ?, ?, ?, ?)`,
    [
      corretora_id,
      admin_id ?? null,
      admin_nome ?? null,
      body,
      category ?? null,
    ],
  );
  return result.insertId;
}

async function deleteById({ id, corretora_id }) {
  const [result] = await pool.query(
    `DELETE FROM corretora_admin_notes
      WHERE id = ? AND corretora_id = ?`,
    [id, corretora_id],
  );
  return result.affectedRows;
}

/**
 * Anti-spam para alertas automáticos (G5 — kyc_stale_alert e similares).
 * Retorna true se já existe nota da mesma category criada hoje (date local
 * do servidor MySQL).
 */
async function hasNoteTodayByCategory({ corretora_id, category }) {
  const [rows] = await pool.query(
    `SELECT id FROM corretora_admin_notes
      WHERE corretora_id = ?
        AND category = ?
        AND DATE(created_at) = CURDATE()
      LIMIT 1`,
    [corretora_id, category],
  );
  return rows.length > 0;
}

module.exports = { listForCorretora, create, deleteById, hasNoteTodayByCategory };
