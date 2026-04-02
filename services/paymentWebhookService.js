// services/paymentWebhookService.js
"use strict";

const { Payment } = require("mercadopago");
const { getMPClient } = require("../config/mercadopago");
const { withTransaction } = require("../lib/withTransaction");
const repo = require("../repositories/paymentRepository");
const orderRepo = require("../repositories/orderRepository");

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

    // Layer 2: consulta o status REAL do pagamento na API do MP
    const paymentClient = new Payment(getMPClient());
    const payment = await paymentClient.get({ id: dataId });

    const pedidoId = payment.metadata?.pedidoId;

    if (!pedidoId) {
      console.warn("[payment/webhook] pagamento sem metadata.pedidoId", dataId);
      await repo.markWebhookEventIgnored(conn, dbEventId);
      return "ignored";
    }

    const novoStatus = mapMPStatusToDomain(payment.status);

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

module.exports = { mapMPStatusToDomain, handleWebhookEvent };
