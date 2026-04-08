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

  // News/Clima/Cotações (geocoding/provider)
  GEOCODING_ERROR: "GEOCODING_ERROR",
  GEOCODE_NOT_FOUND: "GEOCODE_NOT_FOUND",
  PROVIDER_NOT_IMPLEMENTED: "PROVIDER_NOT_IMPLEMENTED",
};

module.exports = ERROR_CODES;
