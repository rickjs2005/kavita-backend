// services/payment/asaasAdapter.js
//
// Adapter do gateway Asaas para o paymentService. Implementa contrato
// mínimo para checkout + webhook, sem expor detalhes do provider ao
// restante do sistema. Troca por Pagar.me (ou outro) é trocar este
// arquivo mantendo a mesma interface.
//
// Política de erro: qualquer falha HTTP ou timeout vira exception do
// JS com { status, body } para o caller logar + fire-and-forget no
// webhook retry. Nunca silencia erro — pagamento exige observabilidade
// máxima.
//
// Modo dev (sem ASAAS_API_KEY): adapter retorna `isConfigured: false`
// e os métodos de chamada lançam NotConfiguredError. O paymentService
// usa isso para cair no fluxo manual sem ruído de erro.
"use strict";

const crypto = require("node:crypto");

class AsaasError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "AsaasError";
    this.status = status ?? null;
    this.body = body ?? null;
  }
}

class NotConfiguredError extends Error {
  constructor(message = "Asaas não está configurado (ASAAS_API_KEY ausente).") {
    super(message);
    this.name = "NotConfiguredError";
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const PROVIDER = "asaas";

function getConfig() {
  return {
    apiUrl: process.env.ASAAS_API_URL || "https://sandbox.asaas.com/api/v3",
    apiKey: process.env.ASAAS_API_KEY || null,
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN || null,
  };
}

/**
 * Retorna true se o gateway Asaas tem credenciais suficientes para
 * chamar endpoints de escrita. paymentService usa isso para escolher
 * entre fluxo automático e fluxo manual (payment_method="manual").
 */
function isConfigured() {
  return Boolean(getConfig().apiKey);
}

/**
 * Wrapper em torno de fetch nativo (Node 18+). Inclui timeout,
 * injeta access_token via header `access_token` (padrão Asaas),
 * parse de JSON e tradução de 4xx/5xx em AsaasError.
 */
async function request(
  path,
  { method = "GET", body = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const cfg = getConfig();
  if (!cfg.apiKey) throw new NotConfiguredError();

  const url = `${cfg.apiUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        access_token: cfg.apiKey,
        "User-Agent": "Kavita/1.0 (mercado-do-cafe)",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new AsaasError(
      err?.name === "AbortError"
        ? "Asaas: timeout na requisição."
        : `Asaas: erro de rede — ${err?.message ?? "desconhecido"}.`,
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!res.ok) {
    throw new AsaasError(
      `Asaas: HTTP ${res.status} — ${summarize(parsed)}`,
      { status: res.status, body: parsed },
    );
  }

  return parsed;
}

function summarize(body) {
  if (!body) return "sem corpo";
  if (typeof body === "string") return body.slice(0, 120);
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((e) => e.description || e.code).join("; ");
  }
  if (body?.raw) return body.raw.slice(0, 120);
  return JSON.stringify(body).slice(0, 120);
}

// ---------------------------------------------------------------------------
// Operações de checkout e assinatura
// ---------------------------------------------------------------------------

/**
 * Cria ou atualiza customer no Asaas a partir dos dados da corretora.
 * Retorna o `customer_id` do Asaas para vincular à subscription.
 * Idempotente por externalReference (corretora_id no Kavita).
 */
async function upsertCustomer({ corretoraId, name, email, phone, cnpj }) {
  const external = `kavita-corretora-${corretoraId}`;

  // Tentativa de GET por externalReference — Asaas aceita filtro.
  const existing = await request(
    `/customers?externalReference=${encodeURIComponent(external)}&limit=1`,
  );
  if (existing?.data?.length > 0) {
    return existing.data[0].id;
  }

  const created = await request("/customers", {
    method: "POST",
    body: {
      name,
      email,
      mobilePhone: phone ? phone.replace(/\D/g, "") : undefined,
      cpfCnpj: cnpj ? cnpj.replace(/\D/g, "") : undefined,
      externalReference: external,
      notificationDisabled: true, // Asaas não manda e-mail — Kavita controla
    },
  });
  return created.id;
}

/**
 * Cria subscription recorrente. Retorna { subscription_id, checkout_url }
 * para o frontend redirecionar o usuário. Asaas gera link hosted que
 * aceita Pix/cartão/boleto conforme `billingType`.
 *
 * billingType:
 *   UNDEFINED  → usuário escolhe no checkout (recomendado)
 *   PIX        → força Pix QR
 *   CREDIT_CARD → força cartão
 *   BOLETO     → força boleto
 *
 * cycle: MONTHLY | YEARLY (espelha plans.billing_cycle do Kavita)
 */
async function createSubscription({
  customerId,
  valueCents,
  cycle = "monthly",
  description,
  externalReference,
  dueDateInDays = 1,
}) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + Math.max(0, dueDateInDays));

  const body = {
    customer: customerId,
    billingType: "UNDEFINED",
    value: Number((valueCents / 100).toFixed(2)),
    cycle: cycle === "yearly" ? "YEARLY" : "MONTHLY",
    nextDueDate: dueDate.toISOString().slice(0, 10),
    description: description || "Assinatura Kavita · Mercado do Café",
    externalReference: externalReference || undefined,
  };

  const created = await request("/subscriptions", { method: "POST", body });

  // Asaas não retorna checkout_url direto na subscription;
  // precisamos pegar a 1ª payment associada e usar seu invoiceUrl.
  let checkoutUrl = null;
  try {
    const payments = await request(
      `/subscriptions/${encodeURIComponent(created.id)}/payments?limit=1`,
    );
    if (payments?.data?.length > 0) {
      checkoutUrl =
        payments.data[0].invoiceUrl ||
        payments.data[0].bankSlipUrl ||
        null;
    }
  } catch {
    // Não bloqueia — caller pode buscar depois via getPaymentUrl.
  }

  return {
    subscription_id: created.id,
    status: created.status, // ACTIVE, INACTIVE, EXPIRED
    next_due_date: created.nextDueDate,
    checkout_url: checkoutUrl,
  };
}

/**
 * Cancela subscription no Asaas. Não gera refund nem afeta pagamentos
 * já confirmados — só impede próxima cobrança.
 */
async function cancelSubscription(subscriptionId) {
  const res = await request(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
  });
  return { deleted: res?.deleted === true, id: res?.id ?? subscriptionId };
}

// ---------------------------------------------------------------------------
// Validação de webhook
// ---------------------------------------------------------------------------

/**
 * Valida assinatura do webhook Asaas. Asaas envia o token configurado
 * no header `asaas-access-token`. Comparação constant-time para evitar
 * timing attacks.
 *
 * Se o token não está configurado (dev local), a validação falha
 * por default — caller decide se aceita ou não.
 */
function verifySignature(req) {
  const { webhookToken } = getConfig();
  if (!webhookToken) return false;

  const received = req.get?.("asaas-access-token") ?? null;
  if (!received || typeof received !== "string") return false;
  if (received.length !== webhookToken.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(received, "utf8"),
      Buffer.from(webhookToken, "utf8"),
    );
  } catch {
    return false;
  }
}

/**
 * Traduz payload do Asaas em evento de domínio do Kavita. Evita que
 * o paymentService precise conhecer nomenclatura do provider.
 *
 * Retorno: { type, subscription_id, payment_id, meta } ou null se o
 * evento não for relevante (o caller marca como processed sem ação).
 *
 * Tipos mapeados:
 *   PAYMENT_CONFIRMED / PAYMENT_RECEIVED → payment_confirmed
 *   PAYMENT_OVERDUE                      → payment_overdue
 *   PAYMENT_REFUNDED                     → payment_refunded
 *   SUBSCRIPTION_CREATED (informativo)   → null (apenas log)
 *   SUBSCRIPTION_UPDATED                 → null
 *   SUBSCRIPTION_DELETED                 → subscription_canceled
 */
function translateWebhookEvent(payload) {
  if (!payload || typeof payload !== "object") return null;
  const event = payload.event || payload.type;
  if (!event) return null;

  const payment = payload.payment || {};
  const subscription = payload.subscription || payment.subscription || null;

  const base = {
    provider: PROVIDER,
    provider_event_id:
      payload.id ||
      // fallback: alguns eventos não têm id próprio; combinamos
      `${event}:${payment.id || subscription || "unknown"}:${payload.dateCreated || ""}`,
    raw_event: event,
    payment_id: payment.id || null,
    subscription_id:
      typeof subscription === "string"
        ? subscription
        : subscription?.id || null,
  };

  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return { ...base, type: "payment_confirmed", meta: { value: payment.value } };
    case "PAYMENT_OVERDUE":
      return { ...base, type: "payment_overdue", meta: {} };
    case "PAYMENT_REFUNDED":
      return { ...base, type: "payment_refunded", meta: { value: payment.value } };
    case "PAYMENT_DELETED":
    case "SUBSCRIPTION_DELETED":
      return { ...base, type: "subscription_canceled", meta: {} };
    default:
      // Evento informativo que não muda estado local — retorna com
      // type "ignored" para o service apenas registrar e seguir.
      return { ...base, type: "ignored", meta: {} };
  }
}

module.exports = {
  PROVIDER,
  AsaasError,
  NotConfiguredError,
  isConfigured,
  upsertCustomer,
  createSubscription,
  cancelSubscription,
  verifySignature,
  translateWebhookEvent,
  // Export para permitir override em teste (injection explícita).
  _request: request,
};
