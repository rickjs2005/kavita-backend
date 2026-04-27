/**
 * Webhook processing markers stored in webhook_events.processing_error
 *
 * NULL                       → processed successfully
 * IGNORED:<reason>           → discarded intentionally, will NOT retry
 * BLOCKED:<from>-><to>       → invalid status transition, will NOT retry
 * PARKED:<reason>:<context>  → awaiting condition, eligible for retry
 *
 * Dashboards listing real errors should filter:
 *   WHERE processing_error NOT LIKE 'IGNORED:%'
 *     AND processing_error NOT LIKE 'BLOCKED:%'
 *     AND processing_error NOT LIKE 'PARKED:%'
 */
const ERROR_CODES = {
  // Auth / Permissões
  // AUTH_ERROR    → credenciais inválidas (senha errada, token inválido) — HTTP 401
  // UNAUTHORIZED  → usuário não autenticado (sem cookie/token) — HTTP 401
  // FORBIDDEN     → autenticado mas sem permissão — HTTP 403
  AUTH_ERROR: "AUTH_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // Validação / Input
  // VALIDATION_ERROR → falha de schema Zod ou validação de parâmetro de entrada — HTTP 400
  VALIDATION_ERROR: "VALIDATION_ERROR",

  // Recursos / Sistema
  NOT_FOUND: "NOT_FOUND",
  // CONFLICT → recurso já existe ou estado incompatível — HTTP 409
  CONFLICT: "CONFLICT",
  // SERVER_ERROR → erro interno não previsto — HTTP 500
  SERVER_ERROR: "SERVER_ERROR",

  // Pagamento
  PAYMENT_ERROR: "PAYMENT_ERROR",

  // Rate limit
  RATE_LIMIT: "RATE_LIMIT",

  // Regras de negócio
  STOCK_LIMIT: "STOCK_LIMIT",
  UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",
  // PLAN_CAPABILITY_REQUIRED → endpoint exige capability ausente no
  // plano atual da corretora (SaaS Mercado do Café) — HTTP 403.
  // Payload inclui `details.capability` + `details.current_plan` +
  // `details.upgrade_url` para o frontend oferecer CTA de upgrade.
  PLAN_CAPABILITY_REQUIRED: "PLAN_CAPABILITY_REQUIRED",

  // News/Clima/Cotações (geocoding/provider)
  GEOCODING_ERROR: "GEOCODING_ERROR",
  GEOCODE_NOT_FOUND: "GEOCODE_NOT_FOUND",
  PROVIDER_NOT_IMPLEMENTED: "PROVIDER_NOT_IMPLEMENTED",

  // ---------------------------------------------------------------------------
  // Webhook event markers — NÃO são códigos de erro HTTP.
  //
  // Usados como prefixo no campo `processing_error` da tabela `webhook_events`
  // para distinguir parqueamento intencional de erros reais. Dashboards de
  // erro devem filtrar:  WHERE processing_error NOT LIKE 'PARKED:%'
  //
  // Marker completo de pedido órfão:
  //   PARKED:PENDING_ORDER_MATCH:pedidoId=<id>
  // ---------------------------------------------------------------------------
  PARKED_PREFIX: "PARKED:",
  PENDING_ORDER_MATCH: "PENDING_ORDER_MATCH",
};

module.exports = ERROR_CODES;
