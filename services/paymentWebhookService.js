// services/paymentWebhookService.js
"use strict";

const { Payment } = require("mercadopago");
const { getMPClient } = require("../config/mercadopago");
const { withTransaction } = require("../lib/withTransaction");
const repo = require("../repositories/paymentRepository");
const orderRepo = require("../repositories/orderRepository");
const logger = require("../lib/logger");
const sentry = require("../lib/sentry");

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
 * @returns {Promise<"processed"|"idempotent"|"ignored"|"parked">}
 *   - "processed": evento aplicado (status atualizado ou bloqueado por guard)
 *   - "idempotent": já estava processado, no-op
 *   - "ignored": evento sem informação útil, descartado
 *   - "parked": pedido referenciado em metadata.pedidoId não existe;
 *     evento aguarda retry futuro via marker PARKED:PENDING_ORDER_MATCH:*
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

    // Lookup do pedido referenciado em metadata.pedidoId. Pode ser null se
    // o pedido foi cancelado/deletado entre /payment/start e o webhook, se
    // o metadata.pedidoId está corrompido, ou se o webhook chegou antes do
    // pedido aparecer (race em ambiente de testes).
    const pedido = await repo.findPedidoForUpdate(conn, pedidoId);

    // Bug A — pedido órfão. Antes do fix, o código caía em fallback
    // `currentStatus = "pendente"` e fazia UPDATE com 0 affected rows
    // silenciosamente (cliente pagou, sistema "esqueceu"). Agora parqueamos
    // o evento via marker PARKED:PENDING_ORDER_MATCH:* e alertamos via
    // Sentry. processed_at fica NULL — um retry job futuro reprocessa
    // quando o pedido aparecer no banco.
    if (!pedido) {
      logger.warn(
        { pedidoId, dataId, eventId, novoStatus },
        "payment.race_check pedido_inexistente"
      );
      sentry.captureMessage(
        "Webhook MP referenciou pedido inexistente — evento parqueado",
        "warning",
        {
          tags: { domain: "payment.webhook.parked_pending_order" },
          extra: { pedidoId, dataId, eventId, novoStatus },
        }
      );
      await repo.markWebhookEventParkedPendingMatch(conn, dbEventId, pedidoId);
      return "parked";
    }

    // Guard: check current order status and block dangerous backward transitions.
    // Prevents edge cases where a stale API response could regress a "pago" order.
    const currentStatus = pedido.status_pagamento || "pendente";

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

    // B1 — webhook MP agora dispara comunicação automática quando o
    // pagamento é aprovado. O comunicacaoService faz anti-duplicação
    // por (pedido, template, canal), então webhook que chega 2x com
    // event_id diferente não vira mensagem duplicada pro cliente.
    //
    // Fire-and-forget DEPOIS do commit — falha não reverte o status.
    // Wrap em setImmediate pra não acoplar ao tempo do webhook handshake.
    if (novoStatus === "pago") {
      setImmediate(() => {
        // Evitar require circular: orderService → comunicacaoService → ...
        // → paymentWebhookService. Só importamos comunicacaoService aqui dentro.
        const { dispararEventoComunicacao } = require("./comunicacaoService");
        dispararEventoComunicacao("pagamento_aprovado", Number(pedidoId)).catch(
          (err) =>
            logger.warn(
              { err, pedidoId },
              "webhook.payment.notification_failed",
            ),
        );
      });
    }

    return "processed";
  });
}

module.exports = { mapMPStatusToDomain, isStatusTransitionSafe, handleWebhookEvent };
