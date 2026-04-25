"use strict";

const pool = require("../config/pool");
const { decryptCPF } = require("../utils/cpfCrypto");

// ---------------------------------------------------------------------------
// Query fragments
// ---------------------------------------------------------------------------

const ORDER_SELECT = `
  SELECT
    p.id                          AS pedido_id,
    p.usuario_id,
    u.nome                        AS usuario_nome,
    u.email                       AS usuario_email,
    u.telefone                    AS usuario_telefone,
    u.cpf                         AS usuario_cpf,
    p.endereco,
    p.forma_pagamento,
    p.status_pagamento,
    p.status_entrega,
    p.total,
    COALESCE(p.shipping_price, 0) AS shipping_price,
    p.data_pedido,
    (SELECT COUNT(*) FROM pedido_ocorrencias oc
     WHERE oc.pedido_id = p.id
       AND oc.status IN ('aberta','em_analise','aguardando_retorno')
    ) AS ocorrencias_abertas
  FROM pedidos p
  JOIN usuarios u ON p.usuario_id = u.id
`;

const ITENS_SELECT = `
  SELECT
    pp.pedido_id,
    pr.name           AS produto_nome,
    pp.quantidade,
    pp.valor_unitario AS preco_unitario
  FROM pedidos_produtos pp
  JOIN products pr ON pp.produto_id = pr.id
`;

// ---------------------------------------------------------------------------
// Standalone reads
// ---------------------------------------------------------------------------

/**
 * Returns all order rows, ordered by date descending.
 *
 * @returns {object[]}
 */
async function findAllOrderRows() {
  const [rows] = await pool.query(`${ORDER_SELECT} ORDER BY p.data_pedido DESC`);
  return rows.map((r) => ({ ...r, usuario_cpf: decryptCPF(r.usuario_cpf) }));
}

/**
 * Returns all order item rows (unfiltered — caller joins with order rows by pedido_id).
 *
 * @returns {object[]}
 */
async function findAllOrderItems() {
  const [rows] = await pool.query(ITENS_SELECT);
  return rows;
}

/**
 * Returns a single order row by ID, or null if not found.
 *
 * @param {number|string} id
 * @returns {object|null}
 */
async function findOrderRowById(id) {
  const [[row]] = await pool.query(`${ORDER_SELECT} WHERE p.id = ?`, [id]);
  if (!row) return null;
  return { ...row, usuario_cpf: decryptCPF(row.usuario_cpf) };
}

/**
 * Returns item rows for a specific order.
 *
 * @param {number|string} id  Order ID
 * @returns {object[]}
 */
async function findOrderItemsById(id) {
  const [rows] = await pool.query(`${ITENS_SELECT} WHERE pp.pedido_id = ?`, [id]);
  return rows;
}

// ---------------------------------------------------------------------------
// Standalone writes
// ---------------------------------------------------------------------------

/**
 * Updates status_pagamento and status (mirror) for an order.
 * Returns the number of affected rows.
 *
 * @param {number|string} pedidoId
 * @param {string}        newStatus
 * @returns {number}
 */
async function setPaymentStatus(pedidoId, newStatus) {
  const [result] = await pool.query(
    "UPDATE pedidos SET status_pagamento = ?, status = ? WHERE id = ?",
    [newStatus, newStatus, pedidoId]
  );
  return result.affectedRows;
}

/**
 * Updates status_entrega for an order.
 * Accepts pool (standalone) or conn (inside a transaction).
 * Returns the number of affected rows.
 *
 * @param {object} db  pool or connection
 * @param {number|string} pedidoId
 * @param {string}        newStatus
 * @returns {number}
 */
async function setDeliveryStatus(db, pedidoId, newStatus) {
  const [result] = await db.query(
    "UPDATE pedidos SET status_entrega = ? WHERE id = ?",
    [newStatus, pedidoId]
  );
  return result.affectedRows;
}

/**
 * Updates the endereco (JSON) for an order.
 * @returns {number} affectedRows
 */
async function setOrderAddress(pedidoId, serializedAddress) {
  const [result] = await pool.query(
    "UPDATE pedidos SET endereco = ? WHERE id = ?",
    [serializedAddress, pedidoId]
  );
  return result.affectedRows;
}

// ---------------------------------------------------------------------------
// Transactional — MUST be called inside an open transaction.
// ---------------------------------------------------------------------------

/**
 * Locks an order row with FOR UPDATE.
 * Returns the row (status_entrega, status_pagamento) or null.
 *
 * @param {object} conn  MySQL2 connection (inside a transaction)
 * @param {number|string} pedidoId
 * @returns {object|null}
 */
async function lockOrderForUpdate(conn, pedidoId) {
  const [[row]] = await conn.query(
    "SELECT status_entrega, status_pagamento FROM pedidos WHERE id = ? FOR UPDATE",
    [pedidoId]
  );
  return row ?? null;
}

/**
 * Lê os produto_ids dos itens de um pedido. Usado pelo restoreStock
 * para saber quais produtos receber sync de estoque (A1+A2) após o
 * UPDATE em massa.
 */
async function listProductIdsByOrder(db, pedidoId) {
  const [rows] = await db.query(
    "SELECT DISTINCT produto_id FROM pedidos_produtos WHERE pedido_id = ?",
    [pedidoId],
  );
  return rows.map((r) => r.produto_id);
}

/**
 * Restores stock for all items of a cancelled order.
 *
 * Accepts pool (standalone) or conn (inside a transaction). Callers em
 * produção SEMPRE passam conn (orderService.updateDeliveryStatus dentro
 * de withTransaction).
 *
 * No SQL-level idempotency guard — callers MUST apply the pre-check:
 *   status_entrega <> 'cancelado' AND status_pagamento <> 'falhou'
 * (see orderService.updateDeliveryStatus for the authoritative guard)
 *
 * Após restaurar, executa syncActiveByStock pra cada produto afetado
 * (A1+A2) — produto que estava auto-desativado por estoque zerado é
 * reativado se voltar a ter estoque. Produto desativado manualmente
 * não é tocado.
 *
 * @param {object} db  pool or connection
 * @param {number|string} pedidoId
 */
async function restoreStock(db, pedidoId) {
  const productIds = await listProductIdsByOrder(db, pedidoId);
  await db.query(
    `UPDATE products p
        JOIN pedidos_produtos pp ON pp.produto_id = p.id
        SET p.quantity = p.quantity + pp.quantidade
      WHERE pp.pedido_id = ?`,
    [pedidoId]
  );
  // Require local pra evitar ciclo: orderRepository → service → repository.
  const {
    syncActiveByStockBatch,
  } = require("../services/productStockSyncService");
  await syncActiveByStockBatch(db, productIds);
}

/**
 * Restores stock for all items of a payment-failed order.
 * Used exclusively by the payment webhook path.
 *
 * Unlike restoreStock, the idempotency guard is embedded in the SQL:
 *   AND ped.status_pagamento <> 'falhou'
 * This prevents double-restore when a webhook fires twice with different
 * event IDs: the first run sets status to 'falhou', the second run sees it
 * and skips the UPDATE automatically.
 *
 * Must be called inside an open transaction on `conn`.
 *
 * Após restaurar, executa syncActiveByStock pra cada produto afetado
 * (A1+A2). Mesma lógica do restoreStock — só reativa quem foi auto.
 *
 * @param {object} conn  MySQL2 connection (inside a transaction)
 * @param {number|string} pedidoId
 */
async function restoreStockOnFailure(conn, pedidoId) {
  const productIds = await listProductIdsByOrder(conn, pedidoId);
  await conn.query(
    `UPDATE products p
        JOIN pedidos_produtos pp ON pp.produto_id = p.id
        JOIN pedidos ped         ON ped.id        = pp.pedido_id
       SET p.quantity = p.quantity + pp.quantidade
     WHERE pp.pedido_id = ?
       AND ped.status_pagamento <> 'falhou'`,
    [pedidoId]
  );
  const {
    syncActiveByStockBatch,
  } = require("../services/productStockSyncService");
  await syncActiveByStockBatch(conn, productIds);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  findAllOrderRows,
  findAllOrderItems,
  findOrderRowById,
  findOrderItemsById,
  setPaymentStatus,
  setDeliveryStatus,
  setOrderAddress,
  lockOrderForUpdate,
  restoreStock,
  restoreStockOnFailure,
};
