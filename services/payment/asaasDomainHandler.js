// services/payment/asaasDomainHandler.js
//
// ETAPA 1.2/1.3 — handler de domínio que APLICA o domainEvent que o
// corretoraPaymentService.ingestWebhook traduziu do payload do Asaas.
//
// O service de ingestão (corretoraPaymentService) só traduz + grava
// em webhook_events com idempotência. Este handler faz a transição
// real na corretora_subscriptions:
//
//   payment_confirmed    → subscription.status = active,
//                          provider_status = active,
//                          pending_checkout_url/at = NULL
//   payment_overdue      → status = past_due, provider_status = overdue
//   payment_refunded     → status = canceled, provider_status = refunded
//   subscription_canceled→ status = canceled, canceled_at = NOW()
//
// Guards:
//   - Acha subscription por provider_subscription_id
//   - Se não achar (evento órfão), loga e retorna sem erro — pode
//     ser webhook de teste antes de o usuário virar cliente
//   - Sem transições inválidas ativadas aqui (não validamos transição
//     complexa porque o gateway é a fonte de verdade — webhook é
//     sinal pós-fato)
//
// Usado tanto pelo POST /webhooks/asaas quanto pelo botão "Reprocessar"
// na tela de reconciliação admin (ETAPA 1.3).
"use strict";

const subsRepo = require("../../repositories/subscriptionsRepository");
const subEventsRepo = require("../../repositories/subscriptionEventsRepository");
const logger = require("../../lib/logger");

/**
 * @param {object} domainEvent — shape: { type, provider_subscription_id,
 *   payment_id, provider, meta, raw_event }
 * @returns {Promise<{applied: boolean, reason?: string, subscription_id?: number}>}
 */
async function applyDomainEvent(domainEvent) {
  if (!domainEvent || !domainEvent.type) {
    return { applied: false, reason: "no_type" };
  }
  if (domainEvent.type === "ignored") {
    return { applied: false, reason: "ignored_by_adapter" };
  }

  const providerSubId = domainEvent.provider_subscription_id;
  if (!providerSubId) {
    logger.warn(
      { type: domainEvent.type, paymentId: domainEvent.payment_id },
      "asaas.domain.event_without_subscription_id",
    );
    return { applied: false, reason: "missing_provider_subscription_id" };
  }

  const sub = await subsRepo.findByProviderSubscription(providerSubId);
  if (!sub) {
    logger.warn(
      { providerSubId, type: domainEvent.type },
      "asaas.domain.subscription_not_found",
    );
    return { applied: false, reason: "subscription_not_found" };
  }

  const patch = {};
  let eventType = null;
  let toStatus = null;

  switch (domainEvent.type) {
    case "payment_confirmed":
      patch.status = "active";
      patch.provider_status = "active";
      // ETAPA 1.2 — checkout concluído, zera pendência
      patch.pending_checkout_url = null;
      patch.pending_checkout_at = null;
      eventType = "payment_confirmed";
      toStatus = "active";
      break;

    case "payment_overdue":
      patch.status = "past_due";
      patch.provider_status = "overdue";
      eventType = "payment_overdue";
      toStatus = "past_due";
      break;

    case "payment_refunded":
      patch.status = "canceled";
      patch.provider_status = "refunded";
      patch.canceled_at = new Date();
      eventType = "payment_refunded";
      toStatus = "canceled";
      break;

    case "subscription_canceled":
      patch.status = "canceled";
      patch.provider_status = "canceled";
      patch.canceled_at = new Date();
      eventType = "subscription_canceled";
      toStatus = "canceled";
      break;

    default:
      logger.info(
        { type: domainEvent.type, providerSubId },
        "asaas.domain.event_unhandled",
      );
      return { applied: false, reason: `unhandled_type:${domainEvent.type}` };
  }

  await subsRepo.update(sub.id, patch);

  // Timeline separada (fire-and-forget; não derruba o handler)
  subEventsRepo
    .create({
      corretora_id: sub.corretora_id,
      subscription_id: sub.id,
      event_type: eventType,
      from_plan_id: sub.plan_id,
      to_plan_id: sub.plan_id,
      from_status: sub.status,
      to_status: toStatus,
      plan_snapshot: null,
      meta: {
        payment_id: domainEvent.payment_id ?? null,
        provider_event_id: domainEvent.provider_event_id ?? null,
        raw_event: domainEvent.raw_event ?? null,
      },
      actor_type: "system",
      actor_id: null,
    })
    .catch((err) =>
      logger.warn(
        { err: err?.message ?? String(err), subId: sub.id },
        "asaas.domain.event_log_failed",
      ),
    );

  logger.info(
    {
      type: domainEvent.type,
      subscriptionId: sub.id,
      corretoraId: sub.corretora_id,
      toStatus,
    },
    "asaas.domain.event_applied",
  );

  return { applied: true, subscription_id: sub.id };
}

module.exports = { applyDomainEvent };
