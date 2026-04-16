// repositories/subscriptionsRepository.js
"use strict";

const pool = require("../config/pool");

async function getCurrentForCorretora(corretoraId, conn = pool) {
  // Pega o subscription ativo mais recente.
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
  let capabilities = row.plan_capabilities;
  if (capabilities && typeof capabilities === "string") {
    try {
      capabilities = JSON.parse(capabilities);
    } catch {
      capabilities = {};
    }
  }
  return { ...row, plan_capabilities: capabilities ?? {} };
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
 */
async function create(data, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO corretora_subscriptions
       (corretora_id, plan_id, status,
        current_period_start, current_period_end,
        provider, provider_subscription_id, provider_status, meta,
        payment_method, monthly_price_cents, trial_ends_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ],
  );
  return result.insertId;
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
};
