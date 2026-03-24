"use strict";

const pool = require("../config/pool");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

function makeStockLimitError({ max, requested, current }) {
  const err = new AppError("Limite de estoque atingido.", "STOCK_LIMIT", 409);
  err.meta = { max, requested, current };
  return err;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Returns the open cart for a user, including items with product info.
 *
 * @param {number} userId
 * @returns {{ carrinho_id: number|null, items: object[] }}
 */
async function getCart(userId) {
  const [[carrinho]] = await pool.query(
    'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
    [userId]
  );

  if (!carrinho) return { carrinho_id: null, items: [] };

  const [itens] = await pool.query(
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
    [carrinho.id]
  );

  return { carrinho_id: carrinho.id, items: itens };
}

/**
 * Adds or increments an item in the user's open cart.
 * Creates the cart if none is open.
 * Validates stock availability before writing.
 *
 * Throws AppError("STOCK_LIMIT", 409) with err.meta = { max, requested, current }
 * when the desired quantity would exceed available stock.
 *
 * @param {number} userId
 * @param {{ produto_id: number|string, quantidade: number|string }} params
 * @returns {{ produto_id: number, quantidade: number, stock: number }}
 */
async function addItem(userId, { produto_id, quantidade }) {
  const produtoIdNum = toInt(produto_id);
  const qtdNum = toInt(quantidade);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) find or create open cart
    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    let carrinhoId = carrinho?.id;

    if (!carrinhoId) {
      const [newCart] = await conn.query(
        "INSERT INTO carrinhos (usuario_id) VALUES (?)",
        [userId]
      );
      carrinhoId = newCart.insertId;
    }

    // 2) lock product row (stock + price)
    const [[produto]] = await conn.query(
      "SELECT id, price, quantity FROM products WHERE id = ? FOR UPDATE",
      [produtoIdNum]
    );

    if (!produto) {
      throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    const stock = Number(produto.quantity ?? 0);
    if (!Number.isFinite(stock) || stock <= 0) {
      throw makeStockLimitError({ max: 0, requested: qtdNum, current: 0 });
    }

    // 3) lock existing cart item (if any)
    const [[existente]] = await conn.query(
      "SELECT id, quantidade FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ? FOR UPDATE",
      [carrinhoId, produtoIdNum]
    );

    const currentQty = Number(existente?.quantidade ?? 0);
    const desired = currentQty + qtdNum;

    if (desired > stock) {
      throw makeStockLimitError({ max: stock, requested: desired, current: currentQty });
    }

    // 4) update or insert
    if (existente) {
      await conn.query(
        "UPDATE carrinho_itens SET quantidade = ? WHERE id = ?",
        [desired, existente.id]
      );
    } else {
      await conn.query(
        `INSERT INTO carrinho_itens (carrinho_id, produto_id, quantidade, valor_unitario)
         VALUES (?, ?, ?, ?)`,
        [carrinhoId, produtoIdNum, desired, produto.price]
      );
    }

    await conn.commit();
    return { produto_id: produtoIdNum, quantidade: desired, stock };
  } catch (e) {
    try {
      await conn.rollback();
    } catch (rb) {
      console.error("cartService.addItem rollback erro:", rb);
    }
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Sets the quantity of an existing cart item (replace, not increment).
 * Validates stock before writing.
 *
 * Throws AppError("STOCK_LIMIT", 409) with err.meta = { max, requested, current }
 * when the desired quantity exceeds available stock.
 *
 * @param {number} userId
 * @param {{ produto_id: number|string, quantidade: number|string }} params
 * @returns {{ produto_id: number, quantidade: number, stock: number, emptyCart: boolean }}
 */
async function updateItem(userId, { produto_id, quantidade }) {
  const produtoIdNum = toInt(produto_id);
  const qtdNum = toInt(quantidade);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) {
      await conn.commit();
      return { produto_id: produtoIdNum, quantidade: 0, stock: 0, emptyCart: true };
    }

    // lock product row (stock)
    const [[produto]] = await conn.query(
      "SELECT id, quantity FROM products WHERE id = ? FOR UPDATE",
      [produtoIdNum]
    );

    if (!produto) {
      throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    const stock = Number(produto.quantity ?? 0);
    if (!Number.isFinite(stock) || stock <= 0) {
      throw makeStockLimitError({ max: 0, requested: qtdNum, current: 0 });
    }

    if (qtdNum > stock) {
      throw makeStockLimitError({ max: stock, requested: qtdNum, current: null });
    }

    await conn.query(
      "UPDATE carrinho_itens SET quantidade = ? WHERE carrinho_id = ? AND produto_id = ?",
      [qtdNum, carrinho.id, produtoIdNum]
    );

    await conn.commit();
    return { produto_id: produtoIdNum, quantidade: qtdNum, stock, emptyCart: false };
  } catch (e) {
    try {
      await conn.rollback();
    } catch (rb) {
      console.error("cartService.updateItem rollback erro:", rb);
    }
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Removes a specific product from the user's open cart.
 * No-op (returns removed=false) if cart does not exist.
 *
 * @param {number} userId
 * @param {number} produtoId
 * @returns {{ removed: boolean }}
 */
async function removeItem(userId, produtoId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) {
      await conn.commit();
      return { removed: false };
    }

    await conn.query(
      "DELETE FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?",
      [carrinho.id, produtoId]
    );

    await conn.commit();
    return { removed: true };
  } catch (e) {
    try {
      await conn.rollback();
    } catch (rb) {
      console.error("cartService.removeItem rollback erro:", rb);
    }
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Clears all items from the user's open cart and marks the cart as "fechado".
 * No-op (returns cleared=false) if no open cart exists.
 *
 * @param {number} userId
 * @returns {{ cleared: boolean }}
 */
async function clearCart(userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) {
      await conn.commit();
      return { cleared: false };
    }

    await conn.query(
      "DELETE FROM carrinho_itens WHERE carrinho_id = ?",
      [carrinho.id]
    );

    await conn.query(
      'UPDATE carrinhos SET status = "fechado" WHERE id = ?',
      [carrinho.id]
    );

    await conn.commit();
    return { cleared: true };
  } catch (e) {
    try {
      await conn.rollback();
    } catch (rb) {
      console.error("cartService.clearCart rollback erro:", rb);
    }
    throw e;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { getCart, addItem, updateItem, removeItem, clearCart };
