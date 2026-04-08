// services/paymentWebhookService.js
"use strict";

const { Payment } = require("mercadopago");
const { getMPClient } = require("../config/mercadopago");
const { withTransaction } = require("../lib/withTransaction");
const repo = require("../repositories/paymentRepository");
const orderRepo = require("../repositories/orderRepository");
const logger = require("../lib/logger");

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

/**
 * Converte o status do Mercado Pago para o domínio interno.
 *
 * @param {string} mpStatus  status retornado pela API do MP
 * @returns {"pago"|"falhou"|"pendente"|"estornado"}
 */
function mapMPStatusToDomain(mpStatus) {
  if (mpStatus === "approved") return "pago";
  if (mpStatus === "rejected" || mpStatus === "cancelled") return "falhou";
  if (mpStatus === "in_process" || mpStatus === "pending") return "pendente";
  if (mpStatus === "charged_back" || mpStatus === "refunded") return "estornado";
  return "pendente";
}

/**
 * Guards against dangerous backward status transitions.
 * Even though Layer 2 (API fetch) always gets the real current status,
 * this provides defense-in-depth against edge cases (API caching, race conditions).
 *
 * Allowed transitions:
 *   pendente → pago, falhou, estornado
 *   falhou   → pago, pendente (retry)
 *   pago     → estornado (chargeback/refund only)
 *   estornado → (final — no transitions allowed)
 *
 * @returns {boolean} true if the transition is safe
 */
function isStatusTransitionSafe(currentStatus, newStatus) {
  if (currentStatus === newStatus) return true; // no-op, harmless

  const BLOCKED = {
    pago: new Set(["falhou", "pendente"]),
    estornado: new Set(["pago", "falhou", "pendente"]),
  };

  return !BLOCKED[currentStatus]?.has(newStatus);
}

// ---------------------------------------------------------------------------
// Event handler
// ---------------------------------------------------------------------------

/**
 * Processa um evento de webhook do Mercado Pago com idempotência garantida.
 * Gerencia a transação internamente — o caller não precisa conhecer o pool.
 *
 * @param {object} opts
 * @param {string}  opts.eventId        Identificador único do evento (req.body.id)
 * @param {string}  opts.type           Tipo do evento (req.body.type)
 * @param {string|number} opts.dataId   ID do pagamento no MP (req.body.data.id)
 * @param {string}  opts.payload        JSON.stringify(req.body)
 * @param {string}  opts.signatureHeader req.get("x-signature")
 *
 * @returns {Promise<"processed"|"idempotent"|"ignored">}
 */
async function handleWebhookEvent({
  eventId,
  type,
  dataId,
  payload,
  signatureHeader,
}) {
  return withTransaction(async (conn) => {
    // Layer 3: idempotência — UNIQUE(event_id) + FOR UPDATE previne race conditions
    const existingEvent = await repo.findWebhookEventForUpdate(conn, eventId);

    let dbEventId = existingEvent?.id;

    if (!existingEvent) {
      dbEventId = await repo.insertWebhookEvent(conn, {
        eventId,
        signature: signatureHeader,
        type,
        payload,
      });
    } else if (existingEvent.processed_at) {
      // Evento já processado — resposta idempotente
      return "idempotent";
    } else {
      dbEventId = existingEvent.id;
      await repo.markWebhookEventReceived(conn, dbEventId, {
        signature: signatureHeader,
        type,
        payload,
      });
    }

    // Ignora eventos que não são de pagamento ou não têm ID de pagamento
    if (type !== "payment" || !dataId) {
      await repo.markWebhookEventIgnored(conn, dbEventId);
      return "ignored";
    }

    // Layer 2: consulta o status REAL do pagamento na API do MP.
    // Erros aqui são transitórios (MP fora do ar, timeout, etc.) —
    // a transação é revertida e o caller deve retornar 5xx para que o MP retente.
    let payment;
    try {
      const paymentClient = new Payment(getMPClient());
      payment = await paymentClient.get({ id: dataId });
    } catch (mpErr) {
      logger.error({ err: mpErr, dataId }, "MP API error fetching payment status");
      // Rethrow como erro transitório marcado — o controller decidirá o status HTTP
      const transient = new Error(`MP API error: ${mpErr.message}`);
      transient.transient = true;
      throw transient;
    }

    const pedidoId = payment.metadata?.pedidoId;

    if (!pedidoId) {
      logger.warn({ dataId }, "payment missing metadata.pedidoId — ignored");
      await repo.markWebhookEventIgnored(conn, dbEventId);
      return "ignored";
    }

    const novoStatus = mapMPStatusToDomain(payment.status);

    // Guard: check current order status and block dangerous backward transitions.
    // Prevents edge cases where a stale API response could regress a "pago" order.
    const pedidoRow = await conn.query(
      "SELECT status_pagamento FROM pedidos WHERE id = ? FOR UPDATE",
      [pedidoId]
    );
    const currentStatus = pedidoRow[0]?.[0]?.status_pagamento || "pendente";

    if (!isStatusTransitionSafe(currentStatus, novoStatus)) {
      logger.warn({ pedidoId, currentStatus, novoStatus, dataId }, "status transition blocked");
      await repo.markWebhookEventProcessed(conn, dbEventId, `blocked:${currentStatus}->${novoStatus}`);
      return "processed";
    }

    // Restaura estoque ANTES de atualizar status para que a guarda de idempotência
    // funcione corretamente em duplicatas com event_id diferente.
    if (novoStatus === "falhou") {
      await orderRepo.restoreStockOnFailure(conn, pedidoId);
    }

    await repo.updatePedidoPayment(conn, pedidoId, novoStatus, dataId);
    await repo.markWebhookEventProcessed(conn, dbEventId, novoStatus);

    return "processed";
  });
}

module.exports = { mapMPStatusToDomain, isStatusTransitionSafe, handleWebhookEvent };
