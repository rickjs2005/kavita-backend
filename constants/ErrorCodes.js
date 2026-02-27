const ERROR_CODES = {
  // Auth / Permissões (já usados em testes e middlewares)
  AUTH_ERROR: "AUTH_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // Validação / Input
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",

  // Recursos / Sistema
  NOT_FOUND: "NOT_FOUND",
  SERVER_ERROR: "SERVER_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // Pagamento
  PAYMENT_ERROR: "PAYMENT_ERROR",

  // Rate limit
  RATE_LIMIT: "RATE_LIMIT",

  // Regras de negócio
  STOCK_LIMIT: "STOCK_LIMIT",

  // News/Clima/Cotações (geocoding/provider)
  GEOCODING_ERROR: "GEOCODING_ERROR",
  GEOCODE_NOT_FOUND: "GEOCODE_NOT_FOUND",
  PROVIDER_NOT_IMPLEMENTED: "PROVIDER_NOT_IMPLEMENTED",
};

module.exports = ERROR_CODES;