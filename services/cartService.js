"use strict";

const pool = require("../config/pool");
const cartRepo = require("../repositories/cartRepository");
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
  const { cart, items } = await cartRepo.getCartWithItems(userId);
  if (!cart) return { carrinho_id: null, items: [] };
  return { carrinho_id: cart.id, items };
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
    const carrinho = await cartRepo.findOpenCart(conn, userId);
    const carrinhoId = carrinho?.id ?? await cartRepo.createCart(conn, userId);

    // 2) lock product row (stock + price)
    const produto = await cartRepo.lockProduct(conn, produtoIdNum);

    if (!produto) {
      throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    const stock = Number(produto.quantity ?? 0);
    if (!Number.isFinite(stock) || stock <= 0) {
      throw makeStockLimitError({ max: 0, requested: qtdNum, current: 0 });
    }

    // 3) lock existing cart item (if any)
    const existente = await cartRepo.lockCartItem(conn, carrinhoId, produtoIdNum);

    const currentQty = Number(existente?.quantidade ?? 0);
    const desired = currentQty + qtdNum;

    if (desired > stock) {
      throw makeStockLimitError({ max: stock, requested: desired, current: currentQty });
    }

    // 4) update or insert
    if (existente) {
      await cartRepo.updateCartItemById(conn, existente.id, desired);
    } else {
      await cartRepo.insertCartItem(conn, carrinhoId, produtoIdNum, desired, produto.price);
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

    const carrinho = await cartRepo.findOpenCart(conn, userId);

    if (!carrinho) {
      await conn.commit();
      return { produto_id: produtoIdNum, quantidade: 0, stock: 0, emptyCart: true };
    }

    // lock product row (stock)
    const produto = await cartRepo.lockProduct(conn, produtoIdNum);

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

    await cartRepo.updateCartItemByProduct(conn, carrinho.id, produtoIdNum, qtdNum);

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

    const carrinho = await cartRepo.findOpenCart(conn, userId);

    if (!carrinho) {
      await conn.commit();
      return { removed: false };
    }

    await cartRepo.deleteCartItem(conn, carrinho.id, produtoId);

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

    const carrinho = await cartRepo.findOpenCart(conn, userId);

    if (!carrinho) {
      await conn.commit();
      return { cleared: false };
    }

    await cartRepo.deleteAllCartItems(conn, carrinho.id);
    await cartRepo.closeCart(conn, carrinho.id);

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
