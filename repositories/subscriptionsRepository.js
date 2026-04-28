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

/**
 * Fase 6 — lista para reconciliação admin. Junta subscription +
 * corretora + plano + status do gateway remoto. Filtros comuns:
 *   payment_status = overdue | pending_checkout | active_remote | manual
 *
 * Não traz webhook events — UI consulta separadamente pra não
 * inflar a página (eventos podem ser muitos por corretora).
 */
async function listForReconciliation({ payment_status, limit = 100 } = {}) {
  const where = [];
  const params = [];

  if (payment_status === "overdue") {
    where.push("s.status = 'past_due'");
  } else if (payment_status === "pending_checkout") {
    where.push("s.provider_status = 'pending_checkout'");
  } else if (payment_status === "active_remote") {
    where.push("s.provider IS NOT NULL");
    where.push("s.status IN ('active','trialing')");
    where.push("s.provider_status != 'pending_checkout'");
  } else if (payment_status === "manual") {
    where.push("(s.provider IS NULL OR s.payment_method = 'manual')");
  }
  where.push("s.status IN ('active','trialing','past_due','canceled')");
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT s.id, s.corretora_id, s.plan_id, s.status,
            s.payment_method, s.monthly_price_cents,
            s.current_period_start, s.current_period_end,
            s.trial_ends_at, s.canceled_at,
            s.provider, s.provider_subscription_id, s.provider_status,
            s.created_at, s.notes,
            c.name AS corretora_name, c.slug AS corretora_slug,
            c.city AS corretora_city, c.state AS corretora_state,
            p.slug AS plan_slug, p.name AS plan_name
       FROM corretora_subscriptions s
       JOIN corretoras c ON c.id = s.corretora_id
       JOIN plans p ON p.id = s.plan_id
       ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ?`,
    [...params, Number(limit)],
  );
  return rows;
}

/**
 * ETAPA 1.2 — lookup por provider_subscription_id. Usado pelo domain
 * handler do webhook Asaas para achar qual subscription local aplicar
 * a transição (active/past_due/canceled).
 */
async function findByProviderSubscription(providerSubscriptionId) {
  const [[row]] = await pool.query(
    `SELECT s.*, p.slug AS plan_slug, p.name AS plan_name,
            p.capabilities AS plan_capabilities
       FROM corretora_subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.provider_subscription_id = ?
      ORDER BY s.created_at DESC
      LIMIT 1`,
    [providerSubscriptionId],
  );
  return row ?? null;
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
 * Fase 5.4 preview — lista assinaturas ativas de um plano, com nome
 * da corretora e snapshot atual (se houver), para o admin decidir
 * conscientemente se vai broadcastear novas capabilities.
 */
async function listActiveByPlan(planId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT s.id, s.corretora_id, s.status, s.current_period_end,
            s.trial_ends_at, s.capabilities_snapshot,
            c.name AS corretora_name, c.slug AS corretora_slug,
            c.city AS corretora_city, c.state AS corretora_state
       FROM corretora_subscriptions s
       JOIN corretoras c ON c.id = s.corretora_id
      WHERE s.plan_id = ?
        AND s.status IN ('active','trialing','past_due')
      ORDER BY c.name ASC`,
    [planId],
  );
  return rows.map((r) => ({
    ...r,
    capabilities_snapshot: parseJsonField(r.capabilities_snapshot),
  }));
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
    // ETAPA 1.2 — checkout pendente. pending_checkout_at permite
    // mostrar "há 3h" na UI; null quando pago/cancelado.
    "pending_checkout_url",
    "pending_checkout_at",
    // ETAPA 1.1/1.2 — estes eram gravados só pelo service via INSERT
    // (Fase 6). Adicionados ao allowed list pra permitir UPDATE via
    // webhook handler também (marcar provider_status = active_remote).
    "provider",
    "provider_subscription_id",
    "provider_status",
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
    "UPDATE corretora_subscriptions SET status = ? WHERE id = ?",
    [status, id],
  );
  return result.affectedRows;
}

/**
 * Bloco 3 — lista subscriptions em trial que vencem dentro de N dias
 * (aprox.). `daysFromNow` é um inteiro (7, 3, 1, 0 etc.). 0 significa
 * "já expirou e ainda não foi movida de trialing". A janela é meia-dia
 * do dia-alvo ±12h para tolerar drift de cron/timezone.
 *
 * Retorna dados suficientes para o job decidir enviar e-mail:
 * corretora + e-mail institucional + lista de users ativos é buscada
 * separadamente no service (evita JOIN caro aqui).
 */
async function listTrialsEndingOn(daysFromNow) {
  // Centralizamos a janela em "daysFromNow dias no futuro, à meia-noite
  // local". Gera intervalo [00:00, 23:59:59] no tz do servidor (Sao Paulo).
  // Para `daysFromNow <= 0`, queremos trials cujo end já passou mas a
  // sub ainda está como "trialing".
  const nowMs = Date.now();
  const dayMs = 86_400_000;
  const target = new Date(nowMs + daysFromNow * dayMs);
  target.setHours(0, 0, 0, 0);
  const startIso = target.toISOString();
  const endTarget = new Date(target.getTime() + dayMs - 1);
  const endIso = endTarget.toISOString();

  let where;
  let params;
  if (daysFromNow <= 0) {
    // "Expirou" — trial_ends_at < now, mas status ainda é "trialing".
    where =
      "s.status = 'trialing' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at < NOW()";
    params = [];
  } else {
    where =
      "s.status = 'trialing' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at BETWEEN ? AND ?";
    params = [startIso, endIso];
  }

  const [rows] = await pool.query(
    `SELECT s.id, s.corretora_id, s.plan_id, s.status, s.trial_ends_at,
            p.slug AS plan_slug, p.name AS plan_name,
            c.name AS corretora_name, c.slug AS corretora_slug,
            c.email AS corretora_email
       FROM corretora_subscriptions s
       JOIN plans p ON p.id = s.plan_id
       JOIN corretoras c ON c.id = s.corretora_id
      WHERE ${where}
      ORDER BY s.trial_ends_at ASC`,
    params,
  );
  return rows;
}

module.exports = {
  getCurrentForCorretora,
  listForCorretora,
  listForReconciliation,
  findByProviderSubscription,
  create,
  update,
  cancelActiveForCorretora,
  updateStatus,
  listActiveByPlan,
  applyCapabilitiesSnapshotToActiveByPlan,
  listTrialsEndingOn,
};
