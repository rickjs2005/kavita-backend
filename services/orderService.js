"use strict";

const { dispararEventoComunicacao } = require("./comunicacaoService");
const pool = require("../config/pool");
const orderRepo = require("../repositories/orderRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { parseAddress } = require("../utils/address");

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
// Formatting helpers
// ---------------------------------------------------------------------------

const onlyDigits = (v) => String(v ?? "").replace(/\D/g, "");

const formatCep = (cep) => {
  const d = onlyDigits(cep);
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return cep;
};

const normalizeEndereco = (endereco) => {
  if (!endereco || typeof endereco !== "object") return endereco;
  if (!("cep" in endereco)) return endereco;
  return { ...endereco, cep: formatCep(endereco.cep) };
};

function formatOrder(row, itens) {
  return {
    id: row.pedido_id,
    usuario_id: row.usuario_id,
    usuario: row.usuario_nome,
    email: row.usuario_email ?? null,
    telefone: row.usuario_telefone ?? null,
    cpf: row.usuario_cpf ?? null,
    endereco: normalizeEndereco(parseAddress(row.endereco)),
    forma_pagamento: row.forma_pagamento,
    status_pagamento: row.status_pagamento,
    status_entrega: row.status_entrega,
    // Total cobrado = subtotal de produtos + frete
    total: Number(row.total ?? 0) + Number(row.shipping_price ?? 0),
    shipping_price: Number(row.shipping_price ?? 0),
    data_pedido: row.data_pedido,
    itens: itens.map((i) => ({
      produto: i.produto_nome,
      quantidade: i.quantidade,
      preco_unitario: Number(i.preco_unitario),
    })),
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Returns all orders with their items, ordered by date descending.
 *
 * @returns {object[]}
 */
async function listOrders() {
  const pedidos = await orderRepo.findAllOrderRows();
  const itens = await orderRepo.findAllOrderItems();

  return pedidos.map((p) =>
    formatOrder(
      p,
      itens.filter((i) => i.pedido_id === p.pedido_id)
    )
  );
}

/**
 * Returns a single order with its items, or null if not found.
 *
 * @param {number|string} id
 * @returns {object|null}
 */
async function getOrderById(id) {
  const pedido = await orderRepo.findOrderRowById(id);
  if (!pedido) return null;

  const itens = await orderRepo.findOrderItemsById(id);
  return formatOrder(pedido, itens);
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
      console.error(
        "[orderService] Erro ao disparar comunicação de pagamento aprovado:",
        err
      );
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
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // FOR UPDATE serializes concurrent cancellations on the same order.
      const pedido = await orderRepo.lockOrderForUpdate(conn, pedidoId);

      if (!pedido) {
        await conn.rollback();
        return { found: false };
      }

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

      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  } else {
    const affectedRows = await orderRepo.setDeliveryStatus(pool, pedidoId, newStatus);
    if (affectedRows === 0) return { found: false };
  }

  if (newStatus === "enviado") {
    try {
      await dispararEventoComunicacao("pedido_enviado", Number(pedidoId));
    } catch (err) {
      console.error(
        "[orderService] Erro ao disparar comunicação de pedido enviado:",
        err
      );
    }
  }

  return { found: true };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listOrders,
  getOrderById,
  updatePaymentStatus,
  updateDeliveryStatus,
  ALLOWED_PAYMENT_STATUSES,
  ALLOWED_DELIVERY_STATUSES,
};
