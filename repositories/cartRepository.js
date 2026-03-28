"use strict";
// repositories/cartRepository.js
//
// Escopo: domínio de CARRINHO DO USUÁRIO (ecommerce).
// Responsabilidades: leitura do carrinho ativo com itens, queries de checkout.
//
// ⚠️  NÃO confundir com cartsRepository.js, que é o domínio de
//     CARRINHOS ABANDONADOS para o painel admin.
//
// Consumidores: services/cartService.js, services/checkoutService.js

const pool = require("../config/pool");

// ---------------------------------------------------------------------------
// Standalone reads (use pool internally)
// ---------------------------------------------------------------------------

/**
 * Returns the open cart for a user with all items and product details.
 * Standalone — two separate queries, no transaction.
 *
 * @param {number} userId
 * @returns {{ cart: object|null, items: object[] }}
 */
async function getCartWithItems(userId) {
  const [[cart]] = await pool.query(
    'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
    [userId]
  );

  if (!cart) return { cart: null, items: [] };

  const [items] = await pool.query(
    `SELECT
        ci.id AS item_id,
        ci.produto_id,
        ci.quantidade,
        ci.valor_unitario,
        p.name     AS nome,
        p.image    AS image,
        p.quantity AS stock
     FROM carrinho_itens ci
     JOIN products p ON p.id = ci.produto_id
     WHERE ci.carrinho_id = ?`,
    [cart.id]
  );

  return { cart, items };
}

// ---------------------------------------------------------------------------
// Transactional or dual-context operations
// Accepts `db` — can be either pool or a connection (both have .query()).
// ---------------------------------------------------------------------------

/**
 * Finds the open cart for a user.
 * Returns the cart row or null.
 *
 * @param {object} db   pool or connection
 * @param {number} userId
 * @returns {object|null}
 */
async function findOpenCart(db, userId) {
  const [[row]] = await db.query(
    'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
    [userId]
  );
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Transactional writes — MUST be called inside an open transaction.
// ---------------------------------------------------------------------------

/**
 * Creates a new open cart for a user.
 * Returns the new cart ID.
 *
 * @param {object} conn  MySQL2 connection (inside a transaction)
 * @param {number} userId
 * @returns {number}
 */
async function createCart(conn, userId) {
  const [result] = await conn.query(
    "INSERT INTO carrinhos (usuario_id) VALUES (?)",
    [userId]
  );
  return result.insertId;
}

/**
 * Locks and returns a product row (id, price, quantity) with FOR UPDATE.
 * Returns the product row or null.
 *
 * @param {object} conn
 * @param {number} productId
 * @returns {object|null}
 */
async function lockProduct(conn, productId) {
  const [[row]] = await conn.query(
    "SELECT id, price, quantity FROM products WHERE id = ? FOR UPDATE",
    [productId]
  );
  return row ?? null;
}

/**
 * Locks and returns an existing cart item for a given product with FOR UPDATE.
 * Returns the item row (id, quantidade) or null.
 *
 * @param {object} conn
 * @param {number} carrinhoId
 * @param {number} productId
 * @returns {object|null}
 */
async function lockCartItem(conn, carrinhoId, productId) {
  const [[row]] = await conn.query(
    "SELECT id, quantidade FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ? FOR UPDATE",
    [carrinhoId, productId]
  );
  return row ?? null;
}

/**
 * Updates a cart item quantity by its row ID (used in the addItem/increment path).
 *
 * @param {object} conn
 * @param {number} itemId
 * @param {number} quantidade
 */
async function updateCartItemById(conn, itemId, quantidade) {
  await conn.query(
    "UPDATE carrinho_itens SET quantidade = ? WHERE id = ?",
    [quantidade, itemId]
  );
}

/**
 * Updates a cart item quantity by cart + product (used in the updateItem/replace path).
 *
 * @param {object} conn
 * @param {number} carrinhoId
 * @param {number} productId
 * @param {number} quantidade
 */
async function updateCartItemByProduct(conn, carrinhoId, productId, quantidade) {
  await conn.query(
    "UPDATE carrinho_itens SET quantidade = ? WHERE carrinho_id = ? AND produto_id = ?",
    [quantidade, carrinhoId, productId]
  );
}

/**
 * Inserts a new item into a cart.
 *
 * @param {object} conn
 * @param {number} carrinhoId
 * @param {number} productId
 * @param {number} quantidade
 * @param {number} price
 */
async function insertCartItem(conn, carrinhoId, productId, quantidade, price) {
  await conn.query(
    `INSERT INTO carrinho_itens (carrinho_id, produto_id, quantidade, valor_unitario)
     VALUES (?, ?, ?, ?)`,
    [carrinhoId, productId, quantidade, price]
  );
}

/**
 * Deletes a specific product from a cart.
 *
 * @param {object} conn
 * @param {number} carrinhoId
 * @param {number} productId
 */
async function deleteCartItem(conn, carrinhoId, productId) {
  await conn.query(
    "DELETE FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?",
    [carrinhoId, productId]
  );
}

/**
 * Deletes all items from a cart.
 *
 * @param {object} conn
 * @param {number} carrinhoId
 */
async function deleteAllCartItems(conn, carrinhoId) {
  await conn.query(
    "DELETE FROM carrinho_itens WHERE carrinho_id = ?",
    [carrinhoId]
  );
}

/**
 * Marks a cart as "fechado".
 *
 * @param {object} conn
 * @param {number} carrinhoId
 */
async function closeCart(conn, carrinhoId) {
  await conn.query(
    'UPDATE carrinhos SET status = "fechado" WHERE id = ?',
    [carrinhoId]
  );
}

/**
 * Marks all open carts for a user as "convertido".
 * Standalone — runs outside of any transaction (post-checkout, post-commit).
 *
 * @param {number} userId
 */
async function convertCart(userId) {
  await pool.query(
    'UPDATE carrinhos SET status = "convertido" WHERE usuario_id = ? AND status = "aberto"',
    [userId]
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getCartWithItems,
  findOpenCart,
  createCart,
  lockProduct,
  lockCartItem,
  updateCartItemById,
  updateCartItemByProduct,
  insertCartItem,
  deleteCartItem,
  deleteAllCartItems,
  closeCart,
  convertCart,
};
