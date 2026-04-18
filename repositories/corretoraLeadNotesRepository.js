// repositories/corretoraLeadNotesRepository.js
//
// Notas internas da corretora sobre um lead. Tenant-scoped por
// corretora_id — listagem/criação sempre recebem o par (lead_id,
// corretora_id) pra evitar vazamento entre corretoras.
"use strict";

const pool = require("../config/pool");

async function listForLead({ leadId, corretoraId, limit = 100 }) {
  const [rows] = await pool.query(
    `SELECT n.id, n.lead_id, n.corretora_id, n.author_user_id,
            n.body, n.created_at,
            u.nome AS author_nome
       FROM corretora_lead_notes n
       LEFT JOIN corretora_users u ON u.id = n.author_user_id
      WHERE n.lead_id = ?
        AND n.corretora_id = ?
      ORDER BY n.created_at DESC
      LIMIT ?`,
    [leadId, corretoraId, Number(limit)],
  );
  return rows;
}

async function create({ lead_id, corretora_id, author_user_id, body }) {
  const [result] = await pool.query(
    `INSERT INTO corretora_lead_notes
       (lead_id, corretora_id, author_user_id, body)
     VALUES (?, ?, ?, ?)`,
    [lead_id, corretora_id, author_user_id ?? null, body],
  );
  return result.insertId;
}

async function deleteById({ id, lead_id, corretora_id }) {
  const [result] = await pool.query(
    `DELETE FROM corretora_lead_notes
      WHERE id = ? AND lead_id = ? AND corretora_id = ?`,
    [id, lead_id, corretora_id],
  );
  return result.affectedRows;
}

module.exports = {
  listForLead,
  create,
  deleteById,
};
