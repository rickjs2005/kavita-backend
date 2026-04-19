// repositories/subscriptionEventsRepository.js
//
// Log append-only de eventos de assinatura (Sprint 3). Toda mudança
// relevante em corretora_subscriptions dispara uma linha aqui para
// auditoria financeira e análise de churn.
"use strict";

const pool = require("../config/pool");

/**
 * Grava um evento. Fire-and-forget do ponto de vista do caller — o
 * padrão no service é não deixar falha de log quebrar o fluxo
 * principal (o caller envelopa em try/catch com logger.warn).
 *
 * Campos JSON (plan_snapshot, meta) são serializados aqui para
 * manter o controller/service lookando objetos JS normais.
 */
async function create(data, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO subscription_events
       (corretora_id, subscription_id, event_type,
        from_plan_id, to_plan_id, from_status, to_status,
        plan_snapshot, meta, actor_type, actor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.corretora_id,
      data.subscription_id ?? null,
      data.event_type,
      data.from_plan_id ?? null,
      data.to_plan_id ?? null,
      data.from_status ?? null,
      data.to_status ?? null,
      data.plan_snapshot ? JSON.stringify(data.plan_snapshot) : null,
      data.meta ? JSON.stringify(data.meta) : null,
      data.actor_type ?? null,
      data.actor_id ?? null,
    ],
  );
  return result.insertId;
}

/**
 * Timeline de eventos de uma corretora (mais recente primeiro).
 * Usado pelo painel da corretora e pelo admin para inspecionar
 * histórico de plano.
 */
async function listForCorretora(corretoraId, { limit = 50 } = {}) {
  const [rows] = await pool.query(
    `SELECT e.*,
            pf.slug AS from_plan_slug, pf.name AS from_plan_name,
            pt.slug AS to_plan_slug,   pt.name AS to_plan_name
     FROM subscription_events e
     LEFT JOIN plans pf ON pf.id = e.from_plan_id
     LEFT JOIN plans pt ON pt.id = e.to_plan_id
     WHERE e.corretora_id = ?
     ORDER BY e.created_at DESC
     LIMIT ?`,
    [corretoraId, limit],
  );
  return rows.map((r) => ({
    ...r,
    plan_snapshot: parseJson(r.plan_snapshot),
    meta: parseJson(r.meta),
  }));
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Bloco 3 — checa se já existe evento com o mesmo `event_type` e
 * mesmo `meta.bucket` para esta subscription. Idempotência do job
 * de lembrete de trial: garante no máximo 1 e-mail por bucket
 * (7d / 3d / 1d / expired) por subscription.
 */
async function hasEventWithBucket(subscriptionId, eventType, bucket) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS n
       FROM subscription_events
      WHERE subscription_id = ?
        AND event_type = ?
        AND JSON_EXTRACT(meta, '$.bucket') = JSON_QUOTE(?)`,
    [subscriptionId, eventType, bucket],
  );
  return Number(row?.n ?? 0) > 0;
}

module.exports = { create, listForCorretora, hasEventWithBucket };
