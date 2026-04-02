"use strict";

const pool = require("../config/pool");
const checkoutNotificationService = require("./checkoutNotificationService");
const checkoutRepo = require("../repositories/checkoutRepository");
const cartRepo = require("../repositories/cartRepository");
const orderRepo = require("../repositories/orderRepository");
const couponService = require("./couponService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// ---------------------------------------------------------------------------
// Stock operations — exported for backward compatibility.
// restoreStock is now owned by orderRepository; re-exported here so that
// existing callers (orderService) can migrate at their own pace.
// ---------------------------------------------------------------------------

/**
 * Inserts order items and debits stock for each product.
 * MUST be called inside an open transaction on `conn`.
 *
 * @param {object} conn          MySQL2 connection (inside a transaction)
 * @param {number} pedidoId
 * @param {Array<{ id: number, quantidade: number }>} produtos
 * @param {object} mapProdutos   { [productId]: { price, stock } } — from FOR UPDATE lock
 * @param {object} mapPromocoes  { [productId]: finalPrice } — from active promotions
 * @returns {{ total: number }} Sum of (valor_unitario * quantidade) for all items
 */
async function reserveStock(conn, pedidoId, produtos, mapProdutos, mapPromocoes) {
  let total = 0;

  for (const item of produtos) {
    const produtoId = Number(item.id);
    const qtd = Number(item.quantidade || 0);

    if (!produtoId || !Number.isFinite(qtd) || qtd <= 0) {
      throw new AppError(
        "Produto inválido no checkout.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    const info = mapProdutos[produtoId];
    if (!info) {
      throw new AppError(
        `Produto ${produtoId} não encontrado.`,
        ERROR_CODES.NOT_FOUND,
        404
      );
    }

    if (info.stock < qtd) {
      throw new AppError(
        `Estoque insuficiente para o produto ${produtoId}.`,
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    // Promotion price takes precedence; fall back to list price.
    const valorUnitario = mapPromocoes[produtoId] ?? info.price;

    await checkoutRepo.insertOrderItem(conn, pedidoId, produtoId, qtd, valorUnitario);
    await checkoutRepo.debitStock(conn, produtoId, qtd);

    total += valorUnitario * qtd;
  }

  return { total };
}

/**
 * Restores stock for all items of a cancelled or failed order.
 * Delegates to orderRepository.restoreStock.
 *
 * @param {object} connOrPool  MySQL2 connection (in transaction) or pool (standalone)
 * @param {number} pedidoId
 */
async function restoreStock(connOrPool, pedidoId) {
  await orderRepo.restoreStock(connOrPool, pedidoId);
}

// ---------------------------------------------------------------------------
// Internal helpers — private, extracted from create() for readability.
// Each handles one logical step of the checkout pipeline.
// ---------------------------------------------------------------------------

/**
 * Checks if an identical order (same products + coupon) was created
 * in the last 2 minutes. Returns the existing order or null.
 */
async function detectDuplicateOrder(conn, userId, produtos, cupomCodigo) {
  const cupomNorm = cupomCodigo
    ? String(cupomCodigo).trim().toUpperCase()
    : null;

  const sortedProds = [...produtos]
    .map((p) => `${Number(p.id)}:${Number(p.quantidade || 0)}`)
    .sort()
    .join(",");

  const recentOrders = await checkoutRepo.findRecentOrders(conn, userId);

  const match = recentOrders.find(
    (row) =>
      row.composicao === sortedProds &&
      (row.cupom ?? null) === cupomNorm
  );

  return match ? { pedido_id: match.pedido_id, cupomNorm } : { pedido_id: null, cupomNorm };
}

/**
 * Locks product rows (FOR UPDATE) and fetches active promotions.
 * Returns two maps: product info and promotion final prices.
 */
async function buildPricingMaps(conn, produtos) {
  const ids = produtos.map((p) => Number(p.id));

  const prodRows = await checkoutRepo.lockProducts(conn, ids);
  const mapProdutos = {};
  prodRows.forEach((row) => {
    mapProdutos[Number(row.id)] = {
      price: Number(row.price),
      stock: Number(row.quantity),
    };
  });

  const promoRows = await checkoutRepo.getActivePromotions(conn, ids);
  const mapPromocoes = {};
  promoRows.forEach((row) => {
    mapPromocoes[Number(row.product_id)] = Number(row.final_price);
  });

  return { mapProdutos, mapPromocoes };
}

/**
 * Validates and applies a coupon to the subtotal.
 * Returns discount info or zeroed defaults if no coupon was provided.
 */
async function applyCouponIfPresent(conn, cupomCodigo, subtotal) {
  if (!cupomCodigo || !String(cupomCodigo).trim()) {
    return { totalFinal: subtotal, descontoTotal: 0, cupomAplicado: null };
  }

  try {
    const { desconto, cupomAplicado } = await couponService.applyCoupon(
      conn, cupomCodigo, subtotal
    );
    return {
      totalFinal: subtotal - desconto,
      descontoTotal: desconto,
      cupomAplicado,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error("[checkoutService] Erro ao aplicar cupom:", err);
    throw new AppError(
      "Erro ao aplicar o cupom de desconto.",
      ERROR_CODES.SERVER_ERROR,
      500
    );
  }
}

/**
 * Post-commit side effects: notification + cart closure.
 * Both are fire-and-forget — failures do not affect the order.
 */
async function postCommitSideEffects(pedidoId, userId) {
  try {
    await checkoutNotificationService.notifyOrderCreated(pedidoId);
  } catch (err) {
    console.error("[checkoutService] Erro ao disparar comunicação:", err);
  }

  // Close open cart — outside transaction.
  // A crash here leaves the cart as "aberto" but the order exists — acceptable,
  // does not affect inventory or order integrity.
  try {
    await cartRepo.convertCart(userId);
  } catch (err) {
    console.error("[checkoutService] Erro ao fechar carrinho:", err);
  }
}

// ---------------------------------------------------------------------------
// Main checkout operation
// ---------------------------------------------------------------------------

/**
 * Creates an order for an authenticated user.
 *
 * Pipeline: advisory lock → deduplication → create order → price & reserve
 * stock → apply coupon → persist totals & shipping → mark cart recovered →
 * commit → notify + close cart.
 *
 * @param {number} userId
 * @param {object} body  Validated checkout payload (from req.body, after
 *                       validateCheckoutBody + recalcShippingMiddleware).
 *
 * @returns {object}
 *   Duplicate:  { idempotente: true,  pedido_id }
 *   New order:  { idempotente: false, pedido_id, total, total_sem_desconto,
 *                 desconto_total, cupom_aplicado }
 */
async function create(userId, body) {
  const {
    formaPagamento,
    endereco,
    produtos,
    nome,
    cpf,
    telefone,
    cupom_codigo,
    shipping_price,
    shipping_rule_applied,
    shipping_prazo_dias,
    shipping_cep,
  } = body;

  let connection;
  let lockAcquired = false;
  const lockName = `kavita_checkout_${userId}`;

  try {
    connection = await pool.getConnection();

    /* 0) Advisory lock — serializes concurrent checkouts from the same user. */
    const [[lockRow]] = await connection.query(
      "SELECT GET_LOCK(?, 5) AS ok",
      [lockName]
    );
    lockAcquired = lockRow?.ok === 1;

    if (!lockAcquired) {
      throw new AppError(
        "Outro checkout está em andamento para esta conta. Aguarde alguns segundos e tente novamente.",
        ERROR_CODES.VALIDATION_ERROR,
        409
      );
    }

    await connection.beginTransaction();

    /* 1) Update user info — non-blocking */
    try {
      await checkoutRepo.updateUserInfo(connection, userId, { nome, telefone, cpf });
    } catch (err) {
      console.error("[checkoutService] Erro ao atualizar dados do usuário:", err);
    }

    /* 2) Find open cart — non-blocking (used later to mark as recovered) */
    let carrinhoAberto = null;
    try {
      carrinhoAberto = await checkoutRepo.findOpenCartId(connection, userId);
    } catch (err) {
      console.error("[checkoutService] Erro ao buscar carrinho aberto:", err);
    }

    /* 3) Deduplication — same products + coupon within 2 min = idempotent */
    const { pedido_id: dupId, cupomNorm } = await detectDuplicateOrder(
      connection, userId, produtos, cupom_codigo
    );
    if (dupId) {
      await connection.rollback();
      return { idempotente: true, pedido_id: dupId };
    }

    /* 4) Create order record */
    const pedidoId = await checkoutRepo.createOrder(connection, {
      userId,
      enderecoStr: JSON.stringify(endereco || {}),
      formaPagamento,
      cupomNorm,
    });

    /* 5) Lock products + fetch active promotions → pricing maps */
    const { mapProdutos, mapPromocoes } = await buildPricingMaps(connection, produtos);

    /* 6) Insert order items + debit stock */
    const { total: subtotal } = await reserveStock(
      connection, pedidoId, produtos, mapProdutos, mapPromocoes
    );

    /* 7) Apply coupon (optional) */
    const { totalFinal, descontoTotal, cupomAplicado } = await applyCouponIfPresent(
      connection, cupom_codigo, subtotal
    );

    /* 8) Persist final total + shipping */
    await checkoutRepo.updateOrderTotal(connection, pedidoId, totalFinal);
    await checkoutRepo.updateOrderShipping(connection, pedidoId, {
      shipping_price,
      shipping_rule_applied,
      shipping_prazo_dias,
      shipping_cep,
    });

    /* 9) Mark abandoned cart as recovered — non-blocking */
    try {
      if (carrinhoAberto?.id) {
        await checkoutRepo.markAbandonedCartRecovered(connection, carrinhoAberto.id);
      }
    } catch (err) {
      console.error("[checkoutService] Erro ao marcar carrinho como recuperado:", err);
    }

    /* 10) Commit */
    await connection.commit();

    /* 11) Post-commit side effects (fire-and-forget) */
    await postCommitSideEffects(pedidoId, userId);

    return {
      idempotente: false,
      pedido_id: pedidoId,
      total: totalFinal,
      total_sem_desconto: subtotal,
      desconto_total: descontoTotal,
      cupom_aplicado: cupomAplicado,
    };
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rb) {
        console.error("[checkoutService] Erro ao dar rollback:", rb);
      }
    }
    throw err;
  } finally {
    if (connection) {
      if (lockAcquired) {
        await connection
          .query("SELECT RELEASE_LOCK(?)", [lockName])
          .catch(() => {});
      }
      connection.release();
    }
  }
}

// ---------------------------------------------------------------------------
// Preview coupon (read-only — no transaction, no usage increment)
// ---------------------------------------------------------------------------

/**
 * Calculates the discount for a coupon without creating an order.
 * Uses the same pricing rules and validation logic as the real checkout.
 *
 * @param {{ codigo: string, produtos: Array<{ id: number, quantidade: number }> }} params
 * @returns {{ desconto: number, total_original: number, total_com_desconto: number, cupom: object }}
 */
async function previewCoupon({ codigo, produtos }) {
  const codigoNorm = String(codigo).trim();

  const items = (Array.isArray(produtos) ? produtos : []).filter(
    (p) => Number.isFinite(Number(p.id)) && Number(p.id) > 0
  );

  if (!items.length) {
    throw new AppError(
      "Informe os produtos para calcular o cupom.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const ids = items.map((p) => Number(p.id));

  const [prodRows, promoRows, cupom] = await Promise.all([
    checkoutRepo.getProductPrices(pool, ids),
    checkoutRepo.getActivePromotions(pool, ids),
    checkoutRepo.findCouponByCode(pool, codigoNorm),
  ]);

  if (!cupom) {
    throw new AppError(
      "Cupom inválido ou não encontrado.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const precos = {};
  prodRows.forEach((r) => { precos[Number(r.id)] = Number(r.price); });
  const promos = {};
  promoRows.forEach((r) => { promos[Number(r.product_id)] = Number(r.final_price); });

  let subtotal = 0;
  for (const item of items) {
    const id = Number(item.id);
    const qty = Number(item.quantidade || 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const preco = promos[id] ?? precos[id] ?? 0;
    subtotal += preco * qty;
  }

  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    throw new AppError(
      "Total inválido para cálculo do cupom.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const { desconto, cupomAplicado } = couponService.validateCouponRules(cupom, subtotal);

  return {
    desconto,
    total_original: subtotal,
    total_com_desconto: subtotal - desconto,
    cupom: cupomAplicado,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { create, reserveStock, restoreStock, previewCoupon };
