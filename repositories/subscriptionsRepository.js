// repositories/subscriptionsRepository.js
"use strict";

const pool = require("../config/pool");

// Helper compartilhado — o driver MySQL devolve JSON como string ou
// objeto dependendo da versão/configuração. Normaliza para objeto.
function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function getCurrentForCorretora(corretoraId, conn = pool) {
  // Pega o subscription ativo mais recente. Desde Fase 5.4, o
  // capabilities_snapshot da própria subscription tem prioridade
  // sobre p.capabilities — assim, editar um plano no admin NÃO
  // altera assinaturas existentes a menos que o admin faça
  // broadcast explícito. Fallback para p.capabilities preserva
  // comportamento para assinaturas pré-5.4 (snapshot = NULL).
  const [[row]] = await conn.query(
    `SELECT s.*, p.slug AS plan_slug, p.name AS plan_name,
            p.capabilities AS plan_capabilities, p.price_cents AS plan_price_cents
     FROM corretora_subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.corretora_id = ?
       AND s.status IN ('active','trialing','past_due')
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [corretoraId],
  );
  if (!row) return null;

  const planCapabilities = parseJsonField(row.plan_capabilities) ?? {};
  const snapshot = parseJsonField(row.capabilities_snapshot);
  const effectiveCapabilities = snapshot ?? planCapabilities;

  return {
    ...row,
    // Mantém compat com consumers antigos que leem plan_capabilities:
    // agora essa chave passa a SIGNIFICAR as capabilities efetivas
    // (snapshot quando existe, senão plano vivo). Mudança interna —
    // o nome do campo fica por consistência.
    plan_capabilities: effectiveCapabilities,
    // Campos separados para quem precisar distinguir (ex.: admin UI
    // mostrando "este plano mudou — sua assinatura ainda usa v1").
    capabilities_snapshot: snapshot,
    plan_capabilities_live: planCapabilities,
  };
}

async function listForCorretora(corretoraId) {
  const [rows] = await pool.query(
    `SELECT s.*, p.slug AS plan_slug, p.name AS plan_name
     FROM corretora_subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.corretora_id = ?
     ORDER BY s.created_at DESC`,
    [corretoraId],
  );
  return rows;
}

/**
 * Cria nova subscription. Caller (service) é responsável por cancelar
 * a anterior antes — mantemos o repo simples.
 *
 * Desde Fase 5.4: aceita `capabilities_snapshot` — objeto JS com as
 * capabilities congeladas no momento da assinatura. Null deixa o
 * service decidir fallback (mas o planService.assignPlan já sempre
 * passa o snapshot). Se null, getCurrentForCorretora cai no
 * comportamento legado (usa plan.capabilities vivo).
 */
async function create(data, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO corretora_subscriptions
       (corretora_id, plan_id, status,
        current_period_start, current_period_end,
        provider, provider_subscription_id, provider_status, meta,
        payment_method, monthly_price_cents, trial_ends_at, notes,
        capabilities_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.corretora_id,
      data.plan_id,
      data.status ?? "active",
      data.current_period_start ?? null,
      data.current_period_end ?? null,
      data.provider ?? null,
      data.provider_subscription_id ?? null,
      data.provider_status ?? null,
      data.meta ? JSON.stringify(data.meta) : null,
      data.payment_method ?? "manual",
      data.monthly_price_cents ?? null,
      data.trial_ends_at ?? null,
      data.notes ?? null,
      data.capabilities_snapshot
        ? JSON.stringify(data.capabilities_snapshot)
        : null,
    ],
  );
  return result.insertId;
}

/**
 * Broadcast: aplica um capabilities_snapshot a TODAS as assinaturas
 * ativas/trial/past_due do plano dado. Usado pelo admin quando
 * explicitamente marca "aplicar a assinaturas existentes" ao editar
 * um plano. Single UPDATE = atômico — ou todas atualizam ou nenhuma.
 *
 * Retorna o número de assinaturas afetadas para o caller logar no
 * audit_log.
 */
async function applyCapabilitiesSnapshotToActiveByPlan(
  planId,
  snapshotObject,
  conn = pool,
) {
  const [result] = await conn.query(
    `UPDATE corretora_subscriptions
        SET capabilities_snapshot = ?
      WHERE plan_id = ?
        AND status IN ('active','trialing','past_due')`,
    [
      snapshotObject ? JSON.stringify(snapshotObject) : null,
      planId,
    ],
  );
  return result.affectedRows;
}

async function update(id, data) {
  const allowed = [
    "plan_id",
    "status",
    "current_period_start",
    "current_period_end",
    "payment_method",
    "monthly_price_cents",
    "trial_ends_at",
    "notes",
    "canceled_at",
  ];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (sets.length === 0) return 0;
  values.push(id);
  const [result] = await pool.query(
    `UPDATE corretora_subscriptions SET ${sets.join(", ")} WHERE id = ?`,
    values,
  );
  return result.affectedRows;
}

async function cancelActiveForCorretora(corretoraId, conn = pool) {
  await conn.query(
    `UPDATE corretora_subscriptions
       SET status = 'canceled', canceled_at = NOW()
     WHERE corretora_id = ? AND status IN ('active','trialing','past_due')`,
    [corretoraId],
  );
}

async function updateStatus(id, status) {
  const [result] = await pool.query(
    `UPDATE corretora_subscriptions SET status = ? WHERE id = ?`,
    [status, id],
  );
  return result.affectedRows;
}

module.exports = {
  getCurrentForCorretora,
  listForCorretora,
  create,
  update,
  cancelActiveForCorretora,
  updateStatus,
  applyCapabilitiesSnapshotToActiveByPlan,
};
