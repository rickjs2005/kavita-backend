"use strict";
// services/productStockSyncService.js
//
// A1+A2 — Sincronização entre `products.quantity` e `products.is_active`.
//
// Regras (decisão A1+A2 em 2026-04-24):
//
//   1. Se quantity ≤ 0 e produto está ativo:
//      desativa e marca deactivated_by='system'.
//
//   2. Se quantity > 0 e produto está inativo:
//      reativa SOMENTE se deactivated_by='system'.
//      Se deactivated_by='manual' (admin desativou de propósito),
//      mantém inativo — admin precisa reativar manualmente.
//
//   3. Caso contrário, no-op.
//
// Como usar:
//   Após qualquer UPDATE de products.quantity (checkout, restore,
//   admin edit), chamar `syncActiveByStock(conn, productId)` na MESMA
//   conexão/transação. O sync usa SELECT FOR UPDATE pra serializar
//   com checkouts simultâneos no mesmo produto.
//
// Não roda fora de transação — exige conn (não pool). Isso garante
// atomicidade: ou tudo (mudança de quantity + ajuste de is_active)
// ou nada.

const logger = require("../lib/logger");

/**
 * Sincroniza is_active com quantity, respeitando deactivated_by.
 *
 * @param {object} conn Conexão MySQL2 dentro de uma transação
 * @param {number} productId
 * @returns {Promise<"deactivated"|"reactivated"|"noop">}
 */
async function syncActiveByStock(conn, productId) {
  if (!conn || !productId) return "noop";

  const [[p]] = await conn.query(
    `SELECT id, quantity, is_active, deactivated_by
       FROM products
      WHERE id = ?
      FOR UPDATE`,
    [productId],
  );
  if (!p) return "noop";

  const qty = Number(p.quantity ?? 0);
  const active = Number(p.is_active) === 1;

  // Caso 1: esgotou estoque e está ativo → sistema desativa
  if (qty <= 0 && active) {
    await conn.query(
      `UPDATE products
          SET is_active = 0, deactivated_by = 'system'
        WHERE id = ?`,
      [productId],
    );
    logger.info(
      { productId, quantity: qty },
      "products.stock_sync.deactivated_by_system",
    );
    return "deactivated";
  }

  // Caso 2: voltou estoque e foi o sistema que desativou → reativa
  if (qty > 0 && !active && p.deactivated_by === "system") {
    await conn.query(
      `UPDATE products
          SET is_active = 1, deactivated_by = NULL
        WHERE id = ?`,
      [productId],
    );
    logger.info(
      { productId, quantity: qty },
      "products.stock_sync.reactivated_by_system",
    );
    return "reactivated";
  }

  // Caso 3: produto desativado manualmente, ou estado já consistente — no-op
  return "noop";
}

/**
 * Versão batch: roda syncActiveByStock pra cada productId.
 * Usado pelo restoreStock que move estoque de N produtos do mesmo pedido.
 *
 * @param {object} conn
 * @param {Array<number>} productIds
 */
async function syncActiveByStockBatch(conn, productIds) {
  if (!Array.isArray(productIds) || productIds.length === 0) return;
  // Loop sequencial intencional — cada SELECT FOR UPDATE serializa
  // o produto correspondente, evitando deadlock que viria de
  // operações paralelas adquirindo locks em ordem diferente.
  for (const id of productIds) {
    await syncActiveByStock(conn, id);
  }
}

module.exports = {
  syncActiveByStock,
  syncActiveByStockBatch,
};
