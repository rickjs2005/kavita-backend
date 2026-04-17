// services/corretoraPaymentService.js
//
// Facade de pagamento agnóstica ao gateway PARA O MÓDULO CORRETORA.
// Este service é separado do `paymentService.js` (que serve o
// e-commerce/Mercado Pago) por dois motivos:
//   1. Isolamento de domínio — mexer em plano de corretora não pode
//      afetar checkout de pedido da loja.
//   2. Gateways diferentes — o e-commerce usa MP; aqui a escolha é
//      Asaas (Pix recorrente nativo, melhor para SaaS BR mensal).
//
// Contrato de adapter (obrigatório):
//   - PROVIDER: string constante
//   - isConfigured(): boolean — se há credenciais pra chamar o gateway
//   - upsertCustomer({ corretoraId, name, email, phone, cnpj }) → customer_id
//   - createSubscription({ customerId, valueCents, cycle,
//                           description, externalReference }) →
//       { subscription_id, status, next_due_date, checkout_url }
//   - cancelSubscription(subscription_id) → { deleted: boolean, id }
//   - verifySignature(req) → boolean (valida header do webhook)
//   - translateWebhookEvent(payload) → domain event:
//       { type, provider, provider_event_id, payment_id,
//         subscription_id, raw_event, meta }
//
// Tipos de domain event (type):
//   payment_confirmed      | payment_overdue
//   payment_refunded       | subscription_canceled
//   ignored                → evento informativo, marca processed e segue
//
// Modo dev (sem credenciais): isConfigured() retorna false. O caller
// (planCorretoraController.requestUpgrade, futuro endpoint checkout)
// detecta e cai no fluxo manual atual — nada quebra. Sem scaffolds
// mortos: se o gateway não está configurado, o fluxo de upgrade
// simplesmente não muda.
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");
const webhookEventsRepo = require("../repositories/webhookEventsRepository");
const asaasAdapter = require("./payment/asaasAdapter");

// Registro de adapters. Para adicionar Pagar.me: implementar com a
// mesma interface e registrar aqui. Tudo o resto funciona igual.
const ADAPTERS = {
  asaas: asaasAdapter,
};

function getAdapter(provider) {
  if (!provider || typeof provider !== "string") return null;
  return ADAPTERS[provider.toLowerCase()] ?? null;
}

function getDefaultAdapter() {
  const envChoice = (
    process.env.CORRETORA_PAYMENT_PROVIDER || "asaas"
  ).toLowerCase();
  const adapter = getAdapter(envChoice);
  if (!adapter) return null;
  return adapter.isConfigured() ? adapter : null;
}

/**
 * Feature-flag simples para o resto do código checar se deve oferecer
 * checkout automático ou cair no fluxo manual.
 */
function isGatewayActive() {
  return getDefaultAdapter() !== null;
}

// ---------------------------------------------------------------------------
// Operações de checkout
// ---------------------------------------------------------------------------

async function createCheckoutForCorretora({
  corretora,
  plan,
  externalReference,
}) {
  const adapter = getDefaultAdapter();
  if (!adapter) {
    throw new AppError(
      "Gateway de pagamento não está configurado. Usando fluxo manual.",
      ERROR_CODES.SERVER_ERROR,
      503,
    );
  }

  if (!plan?.price_cents || Number(plan.price_cents) <= 0) {
    throw new AppError(
      "Plano selecionado não tem preço positivo — upgrade automático indisponível.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  const customerId = await adapter.upsertCustomer({
    corretoraId: corretora.id,
    name: corretora.name,
    email: corretora.email,
    phone: corretora.whatsapp || corretora.phone,
    cnpj: corretora.cnpj || null, // chegará com verificação documental
  });

  const sub = await adapter.createSubscription({
    customerId,
    valueCents: Number(plan.price_cents),
    cycle: plan.billing_cycle || "monthly",
    description: `Kavita · ${plan.name}`,
    externalReference:
      externalReference || `kavita-corretora-${corretora.id}-${plan.slug}`,
  });

  logger.info(
    {
      provider: adapter.PROVIDER,
      corretoraId: corretora.id,
      planId: plan.id,
      subscriptionId: sub.subscription_id,
    },
    "corretora.payment.checkout.created",
  );

  return {
    provider: adapter.PROVIDER,
    customer_id: customerId,
    subscription_id: sub.subscription_id,
    checkout_url: sub.checkout_url,
    next_due_date: sub.next_due_date,
  };
}

async function cancelRemoteSubscription({ provider, subscriptionId }) {
  const adapter = getAdapter(provider) || getDefaultAdapter();
  if (!adapter) {
    throw new AppError(
      "Gateway indisponível para cancelamento remoto.",
      ERROR_CODES.SERVER_ERROR,
      503,
    );
  }
  return adapter.cancelSubscription(subscriptionId);
}

// ---------------------------------------------------------------------------
// Ingestão de webhook
// ---------------------------------------------------------------------------

/**
 * Processa payload recebido de um webhook. Fluxo:
 *   1. Identifica provider pelo endpoint que chamou.
 *   2. Valida assinatura (adapter-specific).
 *   3. Traduz payload em domain event.
 *   4. Registra em webhook_events com INSERT IGNORE (idempotência).
 *   5. Se novo, retorna o domain event para o handler de domínio aplicar.
 *
 * O handler de domínio (transição de subscription) fica FORA deste
 * service — vai ser plugado na Etapa C (controller do webhook + handler
 * dedicado). Aqui entregamos só o ponto de ingestão seguro.
 */
async function ingestWebhook({ provider, req }) {
  const adapter = getAdapter(provider);
  if (!adapter) {
    throw new AppError(
      `Provider desconhecido: ${provider}.`,
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  if (!adapter.verifySignature(req)) {
    logger.warn(
      { provider, ip: req.ip },
      "corretora.payment.webhook.signature_invalid",
    );
    throw new AppError(
      "Assinatura inválida.",
      ERROR_CODES.AUTH_ERROR,
      401,
    );
  }

  const domainEvent = adapter.translateWebhookEvent(req.body);
  if (!domainEvent) {
    logger.info(
      { provider, bodyKeys: Object.keys(req.body || {}) },
      "corretora.payment.webhook.untranslatable",
    );
    return { stored: false, domainEvent: null };
  }

  const record = await webhookEventsRepo.recordIfNew({
    provider: domainEvent.provider,
    provider_event_id: domainEvent.provider_event_id,
    event_type: domainEvent.raw_event,
    payload: req.body,
  });

  if (!record.inserted) {
    logger.info(
      {
        provider,
        provider_event_id: domainEvent.provider_event_id,
      },
      "corretora.payment.webhook.duplicate_ignored",
    );
    return { stored: false, duplicate: true, domainEvent: null };
  }

  return {
    stored: true,
    duplicate: false,
    webhookEventId: record.id,
    domainEvent,
  };
}

async function markEventProcessed(webhookEventId) {
  return webhookEventsRepo.markProcessed(webhookEventId);
}

async function markEventFailed(webhookEventId, error) {
  return webhookEventsRepo.markFailed(webhookEventId, error);
}

module.exports = {
  getAdapter,
  getDefaultAdapter,
  isGatewayActive,
  createCheckoutForCorretora,
  cancelRemoteSubscription,
  ingestWebhook,
  markEventProcessed,
  markEventFailed,
};
