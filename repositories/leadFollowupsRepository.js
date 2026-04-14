"use strict";

// repositories/leadFollowupsRepository.js
//
// Acesso à tabela corretora_lead_followups.
// A idempotência é garantida no INSERT IGNORE + UNIQUE (lead_id, kind).

const pool = require("../config/pool");

/**
 * Seleciona leads elegíveis para follow-up 7d:
 *   - criados entre `from` e `to` (janela de 24h, ex.: 7-8 dias atrás)
 *   - com email do produtor preenchido (joined via producer_accounts por telefone_normalizado)
 *   - sem review já submetida para esta corretora pelo mesmo email
 *   - sem entrada em corretora_lead_followups(kind='review_request_7d')
 *   - com corretora em status 'approved'
 *
 * Retorna campos mínimos p/ montar email + gravar follow-up.
 */
async function findEligibleForReviewRequest7d({ from, to, limit = 200 }) {
  const [rows] = await pool.query(
    `
    SELECT
      l.id            AS lead_id,
      l.corretora_id,
      l.nome          AS lead_nome,
      l.telefone_normalizado,
      c.slug          AS corretora_slug,
      c.nome          AS corretora_nome,
      pa.email        AS producer_email
    FROM corretora_leads l
    JOIN corretoras c        ON c.id = l.corretora_id AND c.status = 'approved'
    JOIN producer_accounts pa ON pa.telefone_normalizado = l.telefone_normalizado
                               AND pa.telefone_normalizado IS NOT NULL
                               AND pa.is_active = 1
    LEFT JOIN corretora_lead_followups f
           ON f.lead_id = l.id AND f.kind = 'review_request_7d'
    LEFT JOIN corretora_reviews r
           ON r.corretora_id = l.corretora_id
          AND r.producer_account_id = pa.id
    WHERE l.created_at >= ?
      AND l.created_at <  ?
      AND f.id IS NULL
      AND r.id IS NULL
    ORDER BY l.id ASC
    LIMIT ?
    `,
    [from, to, Number(limit)],
  );
  return rows;
}

/**
 * Registra o envio. UNIQUE garante "uma vez só" mesmo em concorrência.
 * Retorna true se inseriu, false se já existia.
 */
async function recordSent({ leadId, kind = "review_request_7d" }) {
  try {
    const [res] = await pool.query(
      `INSERT INTO corretora_lead_followups (lead_id, kind, sent_at)
       VALUES (?, ?, NOW())`,
      [leadId, kind],
    );
    return res.affectedRows > 0;
  } catch (err) {
    // ER_DUP_ENTRY — outro processo ganhou a corrida; tratamos como "já enviado".
    if (err && err.code === "ER_DUP_ENTRY") return false;
    throw err;
  }
}

async function recordError({ leadId, kind = "review_request_7d", message }) {
  await pool.query(
    `INSERT INTO corretora_lead_followups (lead_id, kind, error_at, error_message)
     VALUES (?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE error_at = NOW(), error_message = VALUES(error_message)`,
    [leadId, kind, String(message || "").slice(0, 500)],
  );
}

async function countSentBetween({ from, to, kind = "review_request_7d" }) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM corretora_lead_followups
      WHERE kind = ? AND sent_at >= ? AND sent_at < ?`,
    [kind, from, to],
  );
  return Number(rows[0]?.total || 0);
}

module.exports = {
  findEligibleForReviewRequest7d,
  recordSent,
  recordError,
  countSentBetween,
};
