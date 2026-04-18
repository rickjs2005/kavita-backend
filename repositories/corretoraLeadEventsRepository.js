// repositories/corretoraLeadEventsRepository.js
//
// Timeline de eventos de um lead. Cada ação importante no CRM emite
// uma linha aqui — status_changed, note_added, sample_requested,
// proposal_sent, deal_won, etc. Leitura via listForLead retorna em
// ordem cronológica (mais recente primeiro).
"use strict";

const pool = require("../config/pool");

function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function listForLead({ leadId, corretoraId, limit = 200 }) {
  const [rows] = await pool.query(
    `SELECT e.id, e.lead_id, e.corretora_id, e.actor_user_id,
            e.actor_type, e.event_type, e.title, e.meta, e.created_at,
            u.nome AS actor_nome
       FROM corretora_lead_events e
       LEFT JOIN corretora_users u ON u.id = e.actor_user_id
      WHERE e.lead_id = ?
        AND e.corretora_id = ?
      ORDER BY e.created_at DESC
      LIMIT ?`,
    [leadId, corretoraId, Number(limit)],
  );
  return rows.map((r) => ({ ...r, meta: parseJsonField(r.meta) }));
}

/**
 * Registra evento. Service é responsável por escolher event_type,
 * title, actor_type correto. Chamado fire-and-forget na maioria dos
 * casos — falha não deve reverter a ação principal do lead.
 */
async function create({
  lead_id,
  corretora_id,
  actor_user_id,
  actor_type,
  event_type,
  title,
  meta,
}) {
  const [result] = await pool.query(
    `INSERT INTO corretora_lead_events
       (lead_id, corretora_id, actor_user_id, actor_type,
        event_type, title, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      lead_id,
      corretora_id,
      actor_user_id ?? null,
      actor_type ?? "corretora_user",
      event_type,
      title ?? null,
      meta ? JSON.stringify(meta) : null,
    ],
  );
  return result.insertId;
}

module.exports = {
  listForLead,
  create,
};
