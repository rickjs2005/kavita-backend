"use strict";

// services/checkoutNotificationService.js
//
// Abstraction layer between checkoutService and comunicacaoService.
// Owns the responsibility of dispatching post-checkout notifications so that
// checkoutService has no direct dependency on communication infrastructure.
//
// Called in a fire-and-forget block after transaction commit — failures are
// caught and logged by the caller; they must not abort the order flow.

const { dispararEventoComunicacao } = require("./comunicacaoService");

/**
 * Dispatches the post-checkout notification for a newly created order.
 *
 * @param {number} pedidoId
 */
async function notifyOrderCreated(pedidoId) {
  await dispararEventoComunicacao("pedido_criado", pedidoId);
}

module.exports = { notifyOrderCreated };
