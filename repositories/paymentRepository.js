// repositories/paymentRepository.js
"use strict";

// ---------------------------------------------------------------------------
// All SQL for the payment domain.
// Functions that participate in a transaction receive `conn` as first param.
// Functions that run standalone acquire their own connection from pool.
// ---------------------------------------------------------------------------

const pool = require("../config/pool");

/* ---- Payment methods --------------------------------------------------- */

async function getActiveMethods() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
         FROM payment_methods
        WHERE is_active = 1
        ORDER BY sort_order ASC, id ASC`
    );
    return rows;
  } finally {
    conn.release();
  }
}

async function getAllMethods() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
         FROM payment_methods
        ORDER BY sort_order ASC, id ASC`
    );
    return rows;
  } finally {
    conn.release();
  }
}

async function findMethodById(id) {
  const conn = await pool.getConnection();
  try {
    const [[row]] = await conn.query(
      `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
         FROM payment_methods
        WHERE id = ?`,
      [id]
    );
    return row || null;
  } finally {
    conn.release();
  }
}

async function createMethod({ code, label, description, is_active, sort_order }) {
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      `INSERT INTO payment_methods (code, label, description, is_active, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [code, label, description, is_active, sort_order]
    );
    const [[created]] = await conn.query(
      `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
         FROM payment_methods
        WHERE id = ?`,
      [result.insertId]
    );
    return created;
  } finally {
    conn.release();
  }
}

async function updateMethodById(id, fields, values) {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `UPDATE payment_methods
          SET ${fields.join(", ")}, updated_at = NOW()
        WHERE id = ?`,
      [...values, id]
    );
    const [[updated]] = await conn.query(
      `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
         FROM payment_methods
        WHERE id = ?`,
      [id]
    );
    return updated;
  } finally {
    conn.release();
  }
}

async function softDeleteMethod(id) {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `UPDATE payment_methods
          SET is_active = 0, updated_at = NOW()
        WHERE id = ?`,
      [id]
    );
  } finally {
    conn.release();
  }
}

/* ---- Pedidos -------------------------------------------------------------- */

async function getTotalPedido(pedidoId) {
  const [[row]] = await pool.query(
    `SELECT (total + COALESCE(shipping_price, 0)) AS total_final
       FROM pedidos
      WHERE id = ?`,
    [pedidoId]
  );
  return Number((row?.total_final || 0).toFixed(2));
}

async function getPedidoById(pedidoId) {
  const [[row]] = await pool.query(
    `SELECT id, forma_pagamento, usuario_id, status_pagamento
       FROM pedidos
      WHERE id = ?`,
    [pedidoId]
  );
  return row || null;
}

async function setPedidoStatusPendente(pedidoId) {
  await pool.query(
    `UPDATE pedidos
        SET status_pagamento = 'pendente', status = 'pendente'
      WHERE id = ?`,
    [pedidoId]
  );
}

/* ---- Webhook events ------------------------------------------------------- */

/**
 * Busca evento com FOR UPDATE (uso dentro de transação).
 * @param {import("mysql2").PoolConnection} conn
 */
async function findWebhookEventForUpdate(conn, eventId) {
  const [[row]] = await conn.query(
    `SELECT id, status, processed_at
       FROM webhook_events
      WHERE event_id = ?
      FOR UPDATE`,
    [eventId]
  );
  return row || null;
}

/**
 * @param {import("mysql2").PoolConnection} conn
 */
async function insertWebhookEvent(conn, { eventId, signature, type, payload }) {
  const [result] = await conn.query(
    `INSERT INTO webhook_events (event_id, signature, event_type, payload, status, created_at)
     VALUES (?, ?, ?, ?, 'received', NOW())`,
    [eventId, signature, type || null, payload]
  );
  return result.insertId;
}

/**
 * @param {import("mysql2").PoolConnection} conn
 */
async function markWebhookEventReceived(conn, dbEventId, { signature, type, payload }) {
  await conn.query(
    `UPDATE webhook_events
        SET signature = ?, event_type = ?, payload = ?, status = 'received', updated_at = NOW()
      WHERE id = ?`,
    [signature, type || null, payload, dbEventId]
  );
}

/**
 * @param {import("mysql2").PoolConnection} conn
 */
async function markWebhookEventIgnored(conn, dbEventId) {
  await conn.query(
    `UPDATE webhook_events
        SET status = 'ignored', processed_at = NOW(), updated_at = NOW()
      WHERE id = ?`,
    [dbEventId]
  );
}

/**
 * @param {import("mysql2").PoolConnection} conn
 */
async function markWebhookEventProcessed(conn, dbEventId, status) {
  await conn.query(
    `UPDATE webhook_events
        SET status = ?, processed_at = NOW(), updated_at = NOW()
      WHERE id = ?`,
    [status, dbEventId]
  );
}

/**
 * Atualiza status_pagamento, status e pagamento_id de forma idempotente.
 * Só executa se o estado ou pagamento_id mudou.
 * @param {import("mysql2").PoolConnection} conn
 */
async function updatePedidoPayment(conn, pedidoId, status, paymentId) {
  await conn.query(
    `UPDATE pedidos
        SET status_pagamento = ?, status = ?, pagamento_id = ?
      WHERE id = ?
        AND (status_pagamento <> ? OR pagamento_id <> ?)`,
    [status, status, String(paymentId), pedidoId, status, String(paymentId)]
  );
}

module.exports = {
  // Payment methods
  getActiveMethods,
  getAllMethods,
  findMethodById,
  createMethod,
  updateMethodById,
  softDeleteMethod,
  // Pedidos
  getTotalPedido,
  getPedidoById,
  setPedidoStatusPendente,
  // Webhook events
  findWebhookEventForUpdate,
  insertWebhookEvent,
  markWebhookEventReceived,
  markWebhookEventIgnored,
  markWebhookEventProcessed,
  updatePedidoPayment,
};
