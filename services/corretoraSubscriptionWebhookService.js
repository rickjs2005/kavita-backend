// services/corretoraSubscriptionWebhookService.js
//
// STUB / PLACEHOLDER — ainda não conectado ao Mercado Pago.
//
// Este módulo é o ponto de integração para webhook de assinatura de
// planos (Mercado Pago Preapproval). Hoje, planos são atribuídos
// manualmente pelo admin via POST /api/admin/monetization/assign.
//
// Para ativar em produção:
//
// 1) Criar preapproval_plan no dashboard MP para cada plano (Pro/Premium).
//    Guardar o `preapproval_plan_id` em `plans.meta.mp_preapproval_plan_id`.
//
// 2) No cadastro/upgrade da corretora, gerar um init_point via
//    POST https://api.mercadopago.com/preapproval apontando para o
//    plano + email do usuário + back_url. Persistir `preapproval_id`
//    retornado em `corretora_subscriptions.provider_subscription_id`
//    com provider='mercadopago' e status='trialing'.
//
// 3) Registrar em Notificações do Mercado Pago a URL
//    POST /api/webhooks/mercado-pago/subscriptions com tópico "preapproval"
//    e "authorized_payment".
//
// 4) Implementar `handleSubscriptionEvent` abaixo seguindo o padrão
//    de `services/paymentWebhookService.js`:
//    - Validação de assinatura HMAC (header x-signature).
//    - Idempotência via UNIQUE(event_id) + FOR UPDATE (nova tabela
//      `webhook_events_subscription` análoga a `webhook_events`).
//    - Fetch em `/preapproval/:id` para obter status real (não confiar
//      no payload do webhook).
//    - Map de status MP → domínio:
//        authorized  → active
//        paused      → past_due
//        cancelled   → canceled
//        finished    → expired
//    - Guards de transição (não permitir canceled → active sem rehire).
//    - Aplicar via `planService.assignPlan` (já transacional) ou
//      `subscriptionsRepository.updateStatus` para mudanças simples.
//
// Até a ativação, esta função lança NOT_IMPLEMENTED se for montada
// na rota — segurança contra deploy acidental sem código real.
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");

/**
 * @param {object} _opts — mesmo shape de paymentWebhookService.handleWebhookEvent
 * @returns {Promise<"processed"|"idempotent"|"ignored">}
 */
async function handleSubscriptionEvent(_opts) {
  logger.warn(
    { opts: _opts },
    "corretora.subscription.webhook.stub_called"
  );
  throw new AppError(
    "Webhook de assinatura Mercado Pago ainda não implementado. Planos são atribuídos manualmente via admin.",
    ERROR_CODES.NOT_IMPLEMENTED ?? "NOT_IMPLEMENTED",
    501,
  );
}

module.exports = {
  handleSubscriptionEvent,
};
