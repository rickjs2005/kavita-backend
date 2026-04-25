"use strict";

const { dispararEventoComunicacao } = require("./comunicacaoService");
const pool = require("../config/pool");
const { withTransaction } = require("../lib/withTransaction");
const orderRepo = require("../repositories/orderRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");
// ---------------------------------------------------------------------------
// Allowed status transitions — single source of truth for this domain.
// ---------------------------------------------------------------------------

const ALLOWED_PAYMENT_STATUSES = ["pendente", "pago", "falhou", "estornado"];
const ALLOWED_DELIVERY_STATUSES = [
  "em_separacao",
  "processando",
  "enviado",
  "entregue",
  "cancelado",
];

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Returns all orders with their items (raw rows), ordered by date descending.
 * Formatting for HTTP response is the controller's responsibility.
 *
 * @returns {{ pedidos: object[], itens: object[] }}
 */
async function listOrders() {
  const pedidos = await orderRepo.findAllOrderRows();
  const itens = await orderRepo.findAllOrderItems();
  return { pedidos, itens };
}

/**
 * Returns a single order with its items (raw rows), or null if not found.
 * Formatting for HTTP response is the controller's responsibility.
 *
 * @param {number|string} id
 * @returns {{ pedido: object, itens: object[] } | null}
 */
async function getOrderById(id) {
  const pedido = await orderRepo.findOrderRowById(id);
  if (!pedido) return null;

  const itens = await orderRepo.findOrderItemsById(id);
  return { pedido, itens };
}

/**
 * Updates the payment status of an order.
 *
 * Rules:
 * - `status` field mirrors `status_pagamento` — both updated together.
 * - Dispatches `pagamento_aprovado` event when newStatus === "pago".
 *
 * @param {number|string} pedidoId
 * @param {string}        newStatus — must be in ALLOWED_PAYMENT_STATUSES
 * @throws {AppError} 400 if newStatus is not valid
 * @returns {{ found: boolean }}
 */
async function updatePaymentStatus(pedidoId, newStatus) {
  if (!ALLOWED_PAYMENT_STATUSES.includes(newStatus)) {
    throw new AppError(
      `status_pagamento inválido: ${newStatus}`,
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const affectedRows = await orderRepo.setPaymentStatus(pedidoId, newStatus);
  if (affectedRows === 0) return { found: false };

  if (newStatus === "pago") {
    try {
      await dispararEventoComunicacao("pagamento_aprovado", Number(pedidoId));
    } catch (err) {
      logger.warn({ err, pedidoId }, "order: payment approved notification failed");
    }
  }

  return { found: true };
}

/**
 * Updates the delivery status of an order.
 *
 * Rules:
 * - Dispatches `pedido_enviado` event when newStatus === "enviado".
 * - Cancellation (newStatus === "cancelado") runs in a transaction:
 *     1. Locks the order row with FOR UPDATE (serializes concurrent cancels).
 *     2. Restores stock only if not already cancelled AND payment did not
 *        already fail — guard prevents double-restore with webhook.
 *     3. Sets status_entrega = 'cancelado'.
 *
 * @param {number|string} pedidoId
 * @param {string}        newStatus — must be in ALLOWED_DELIVERY_STATUSES
 * @throws {AppError} 400 if newStatus is not valid
 * @returns {{ found: boolean }}
 */
async function updateDeliveryStatus(pedidoId, newStatus) {
  if (!ALLOWED_DELIVERY_STATUSES.includes(newStatus)) {
    throw new AppError(
      `status_entrega inválido: ${newStatus}`,
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  if (newStatus === "cancelado") {
    const found = await withTransaction(async (conn) => {
      // FOR UPDATE serializes concurrent cancellations on the same order.
      const pedido = await orderRepo.lockOrderForUpdate(conn, pedidoId);

      if (!pedido) return false;

      // Idempotency guard: restore stock only if not already cancelled AND
      // the payment webhook has not already restored it on failure.
      // Both conditions together prevent double-restore in all scenarios.
      if (
        pedido.status_entrega !== "cancelado" &&
        pedido.status_pagamento !== "falhou"
      ) {
        await orderRepo.restoreStock(conn, pedidoId);
      }

      await orderRepo.setDeliveryStatus(conn, pedidoId, "cancelado");
      return true;
    });
    if (!found) return { found: false };
  } else {
    const affectedRows = await orderRepo.setDeliveryStatus(pool, pedidoId, newStatus);
    if (affectedRows === 0) return { found: false };
  }

  // B1 — dispara comunicação automática nos 4 estados terminais ou
  // intermediários relevantes pro cliente. Anti-duplicação fica por
  // conta do comunicacaoService (consulta jaEnviado).
  // "processando" não tem mensagem própria — é um detalhe operacional
  // interno entre "em_separacao" e "enviado".
  const eventoMap = {
    em_separacao: "pedido_em_separacao",
    enviado:      "pedido_enviado",
    entregue:     "pedido_entregue",
    cancelado:    "pedido_cancelado",
  };
  const evento = eventoMap[newStatus];
  if (evento) {
    try {
      await dispararEventoComunicacao(evento, Number(pedidoId));
    } catch (err) {
      logger.warn(
        { err, pedidoId, evento },
        "order: delivery notification failed",
      );
    }
  }

  return { found: true };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Atualiza o endereço de um pedido.
 * Valida e serializa via utils/address antes de persistir.
 *
 * @param {number|string} pedidoId
 * @param {object}        addressInput — objeto com cep, rua, numero, etc.
 * @returns {{ found: boolean, serialized: string }}
 */
async function updateOrderAddress(pedidoId, addressInput) {
  const { serializeAddress } = require("../utils/address");

  // serializeAddress normaliza + valida campos obrigatórios + retorna JSON string.
  // Lança Error se faltar campo obrigatório ou CEP inválido.
  const serialized = serializeAddress(addressInput);

  const affectedRows = await orderRepo.setOrderAddress(pedidoId, serialized);
  if (affectedRows === 0) return { found: false, serialized };

  return { found: true, serialized };
}

module.exports = {
  listOrders,
  getOrderById,
  updatePaymentStatus,
  updateDeliveryStatus,
  updateOrderAddress,
  ALLOWED_PAYMENT_STATUSES,
  ALLOWED_DELIVERY_STATUSES,
};
