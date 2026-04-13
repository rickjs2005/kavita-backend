"use strict";

const pool = require("../config/pool");
const promoSql = require("./shared/promoSql");
const { encryptCPF, hashCPF } = require("../utils/cpfCrypto");

// ---------------------------------------------------------------------------
// Transactional — MUST be called inside an open transaction on `conn`,
// unless noted otherwise.
// ---------------------------------------------------------------------------

/**
 * Finds the open cart ID for a user.
 * Returns the cart row (with id) or null.
 *
 * @param {object} conn  MySQL2 connection (inside a transaction)
 * @param {number} userId
 * @returns {object|null}
 */
async function findOpenCartId(conn, userId) {
  const [rows] = await conn.query(
    `SELECT id
       FROM carrinhos
      WHERE usuario_id = ? AND status = "aberto"
      ORDER BY id DESC
      LIMIT 1`,
    [userId]
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

/**
 * Finds recent pending orders for the same user within the last 2 minutes.
 * Used for deduplication by product composition fingerprint.
 *
 * Returns rows with { pedido_id, composicao, cupom }.
 *
 * @param {object} conn
 * @param {number} userId
 * @returns {object[]}
 */
async function findRecentOrders(conn, userId) {
  const [rows] = await conn.query(
    `SELECT pp.pedido_id,
            GROUP_CONCAT(
              CONCAT(pp.produto_id, ':', pp.quantidade)
              ORDER BY pp.produto_id SEPARATOR ','
            ) AS composicao,
            p.cupom_codigo AS cupom
       FROM pedidos_produtos pp
       JOIN pedidos p ON p.id = pp.pedido_id
      WHERE p.usuario_id       = ?
        AND p.status           = 'pendente'
        AND p.status_pagamento = 'pendente'
        AND p.data_pedido      >= NOW() - INTERVAL 2 MINUTE
      GROUP BY pp.pedido_id, p.cupom_codigo`,
    [userId]
  );
  return rows;
}

/**
 * Creates a new order record with status = 'pendente'.
 * Returns the new order ID.
 *
 * @param {object} conn
 * @param {{ userId, enderecoStr, formaPagamento, cupomNorm }} data
 * @returns {number}
 */
async function createOrder(conn, { userId, enderecoStr, formaPagamento, cupomNorm }) {
  const [result] = await conn.query(
    `INSERT INTO pedidos (
       usuario_id, endereco, forma_pagamento,
       status, status_pagamento, status_entrega,
       total, data_pedido, pagamento_id, cupom_codigo
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
    [
      userId,
      enderecoStr,
      formaPagamento,
      "pendente",
      "pendente",
      "em_separacao",
      0,
      null,
      cupomNorm,
    ]
  );
  return result.insertId;
}

/**
 * Locks product rows (id, price, quantity) with FOR UPDATE.
 * Returns an array of product rows.
 *
 * @param {object} conn
 * @param {number[]} ids  Product IDs
 * @returns {object[]}
 */
async function lockProducts(conn, ids) {
  const [rows] = await conn.query(
    "SELECT id, price, quantity FROM products WHERE id IN (?) FOR UPDATE",
    [ids]
  );
  return rows;
}

/**
 * Returns active promotion prices for the given product IDs.
 * Uses the same formula as publicPromocoes.js and preview-cupom:
 *   promo_price > discount_percent > list price
 *
 * @param {object} conn
 * @param {number[]} ids  Product IDs
 * @returns {object[]}  Rows with { product_id, final_price }
 */
async function getActivePromotions(conn, ids) {
  const [rows] = await conn.query(
    `SELECT
       pp.product_id,
       ${promoSql.calcFinalPrice("pp")} AS final_price
     FROM product_promotions pp
     JOIN products p ON p.id = pp.product_id
     WHERE pp.product_id IN (?)
       AND ${promoSql.activePromoWhere("pp")}`,
    [ids]
  );
  return rows;
}

/**
 * Inserts a single order item.
 *
 * @param {object} conn
 * @param {number} pedidoId
 * @param {number} productId
 * @param {number} quantidade
 * @param {number} valorUnitario
 */
async function insertOrderItem(conn, pedidoId, productId, quantidade, valorUnitario) {
  await conn.query(
    `INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario)
     VALUES (?, ?, ?, ?)`,
    [pedidoId, productId, quantidade, valorUnitario]
  );
}

/**
 * Debits stock for a product by the given quantity.
 *
 * @param {object} conn
 * @param {number} productId
 * @param {number} quantidade
 */
async function debitStock(conn, productId, quantidade) {
  await conn.query(
    "UPDATE products SET quantity = quantity - ? WHERE id = ?",
    [quantidade, productId]
  );
}

/**
 * Returns product prices (id, price) for the given IDs.
 * Read-only — does not require a transaction.
 *
 * @param {object} dbOrConn  MySQL2 pool or connection
 * @param {number[]} ids  Product IDs
 * @returns {object[]}  Rows with { id, price }
 */
async function getProductPrices(dbOrConn, ids) {
  const [rows] = await dbOrConn.query(
    "SELECT id, price FROM products WHERE id IN (?)",
    [ids]
  );
  return rows;
}

/**
 * Finds a coupon by code without locking (read-only, for preview).
 * Use lockCoupon (FOR UPDATE) inside a transaction when actually applying it.
 *
 * @param {object} dbOrConn  MySQL2 pool or connection
 * @param {string} codigo
 * @returns {object|null}
 */
async function findCouponByCode(dbOrConn, codigo) {
  const [rows] = await dbOrConn.query(
    `SELECT id, codigo, tipo, valor, minimo, expiracao, usos, max_usos, max_usos_por_usuario, ativo
       FROM cupons
      WHERE codigo = ?
      LIMIT 1`,
    [codigo]
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

/**
 * Locks a coupon row with FOR UPDATE and returns it, or null if not found.
 *
 * @param {object} conn
 * @param {string} codigo
 * @returns {object|null}
 */
async function lockCoupon(conn, codigo) {
  const [rows] = await conn.query(
    `SELECT id, codigo, tipo, valor, minimo, expiracao, usos, max_usos, max_usos_por_usuario, ativo
       FROM cupons
      WHERE codigo = ?
      LIMIT 1
      FOR UPDATE`,
    [codigo]
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

/**
 * Increments the usage counter for a coupon.
 *
 * @param {object} conn
 * @param {number} couponId
 */
async function incrementCouponUsage(conn, couponId) {
  await conn.query(
    "UPDATE cupons SET usos = usos + 1 WHERE id = ?",
    [couponId]
  );
}

/**
 * Counts how many times a user has used a specific coupon.
 *
 * @param {object} conn  MySQL2 connection (inside a transaction)
 * @param {number} couponId
 * @param {number} userId
 * @returns {number}
 */
async function countCouponUsageByUser(conn, couponId, userId) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM cupom_usos WHERE cupom_id = ? AND usuario_id = ?",
    [couponId, userId]
  );
  return Number(rows[0]?.cnt || 0);
}

/**
 * Records a coupon usage for a user/order.
 *
 * @param {object} conn
 * @param {number} couponId
 * @param {number} userId
 * @param {number} pedidoId
 */
async function recordCouponUsage(conn, couponId, userId, pedidoId) {
  await conn.query(
    "INSERT INTO cupom_usos (cupom_id, usuario_id, pedido_id) VALUES (?, ?, ?)",
    [couponId, userId, pedidoId]
  );
}

/**
 * Returns coupon restrictions (category or product) for a given coupon.
 * If no restrictions exist, the coupon applies to all products.
 *
 * @param {object} dbOrConn  MySQL2 pool or connection
 * @param {number} couponId
 * @returns {object[]}  Rows with { tipo, target_id }
 */
async function getCouponRestrictions(dbOrConn, couponId) {
  const [rows] = await dbOrConn.query(
    "SELECT tipo, target_id FROM cupom_restricoes WHERE cupom_id = ?",
    [couponId]
  );
  return rows;
}

/**
 * Returns category IDs for the given product IDs.
 * Uses the product_categories join table.
 *
 * @param {object} dbOrConn  MySQL2 pool or connection
 * @param {number[]} productIds
 * @returns {object[]}  Rows with { product_id, category_id }
 */
async function getProductCategories(dbOrConn, productIds) {
  if (!productIds.length) return [];
  const [rows] = await dbOrConn.query(
    "SELECT product_id, category_id FROM product_categories WHERE product_id IN (?)",
    [productIds]
  );
  return rows;
}

/**
 * Sets the final total for an order.
 *
 * @param {object} conn
 * @param {number} pedidoId
 * @param {number} total
 */
async function updateOrderTotal(conn, pedidoId, total) {
  await conn.query(
    "UPDATE pedidos SET total = ? WHERE id = ?",
    [total, pedidoId]
  );
}

/**
 * Persists shipping data for an order.
 *
 * @param {object} conn
 * @param {number} pedidoId
 * @param {{ shipping_price, shipping_rule_applied, shipping_prazo_dias, shipping_cep }} data
 */
async function updateOrderShipping(conn, pedidoId, {
  shipping_price,
  shipping_rule_applied,
  shipping_prazo_dias,
  shipping_cep,
}) {
  await conn.query(
    `UPDATE pedidos
        SET shipping_price        = ?,
            shipping_rule_applied = ?,
            shipping_prazo_dias   = ?,
            shipping_cep          = ?
      WHERE id = ?`,
    [
      Number(shipping_price ?? 0),
      String(shipping_rule_applied ?? "ZONE"),
      shipping_prazo_dias == null ? null : Number(shipping_prazo_dias),
      shipping_cep == null ? null : String(shipping_cep),
      pedidoId,
    ]
  );
}

/**
 * Marks an abandoned cart entry as recovered.
 * Non-blocking — called inside the transaction but failure does not abort order.
 *
 * @param {object} conn
 * @param {number} carrinhoId
 */
async function markAbandonedCartRecovered(conn, carrinhoId) {
  await conn.query(
    `UPDATE carrinhos_abandonados
        SET recuperado    = 1,
            atualizado_em = NOW()
      WHERE carrinho_id = ?`,
    [carrinhoId]
  );
}

/**
 * Updates user profile fields (nome, telefone, cpf) from checkout data.
 * Only updates fields that have non-empty values.
 * Non-blocking — failure does not abort the order.
 *
 * @param {object} conn
 * @param {number} userId
 * @param {{ nome?, telefone?, cpf? }} data
 */
async function updateUserInfo(conn, userId, { nome, telefone, cpf }) {
  const campos = [];
  const valores = [];

  if (nome && String(nome).trim()) {
    campos.push("nome = ?");
    valores.push(String(nome).trim());
  }

  if (telefone && String(telefone).trim()) {
    const digits = String(telefone).replace(/\D/g, "");
    if (digits) {
      campos.push("telefone = ?");
      valores.push(digits);
    }
  }

  if (cpf && String(cpf).trim()) {
    const digits = String(cpf).replace(/\D/g, "");
    if (digits) {
      campos.push("cpf = ?", "cpf_hash = ?");
      valores.push(encryptCPF(digits), hashCPF(digits));
    }
  }

  if (campos.length > 0) {
    await conn.query(
      `UPDATE usuarios SET ${campos.join(", ")} WHERE id = ?`,
      [...valores, userId]
    );
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  findOpenCartId,
  findRecentOrders,
  createOrder,
  lockProducts,
  getProductPrices,
  getActivePromotions,
  insertOrderItem,
  debitStock,
  findCouponByCode,
  lockCoupon,
  incrementCouponUsage,
  countCouponUsageByUser,
  recordCouponUsage,
  getCouponRestrictions,
  getProductCategories,
  updateOrderTotal,
  updateOrderShipping,
  markAbandonedCartRecovered,
  updateUserInfo,
};
