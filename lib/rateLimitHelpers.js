"use strict";

// lib/rateLimitHelpers.js
//
// Helper para acessar com segurança o `req.rateLimit` em controllers.
//
// Por que existe:
//   No pipeline atual de login (loja/admin/corretora) há DOIS rate
//   limiters em sequência:
//     1. absoluteLoginLimiter — vem da `express-rate-limit` e seta
//        `req.rateLimit = { limit, used, remaining, resetTime }`. NÃO
//        expõe `.fail()` nem `.reset()`.
//     2. adaptiveRateLimiter — middleware interno que sobrescreve
//        `req.rateLimit.fail` e `req.rateLimit.reset` com fire-and-forget
//        para penalidade adaptativa por falha de credencial.
//
//   Os controllers que chamam `req.rateLimit.fail()` historicamente
//   confiam em (2) já ter rodado. Mas quando (2) é mockado em testes
//   ou não está montado num router, sobra o objeto de (1) — truthy
//   mas SEM as funções esperadas. O fallback comum
//
//     const rateLimit = req.rateLimit || { fail: () => {}, reset: () => {} };
//
//   NÃO cobre esse caso, e a chamada subsequente lança
//   "TypeError: rateLimit.fail is not a function" em runtime.
//
// O helper abaixo normaliza o objeto retornando funções no-op quando
// faltam, garantindo que o controller nunca exploda por causa do
// pipeline de middlewares.

/**
 * Retorna um objeto com `fail()` e `reset()` garantidos como funções.
 * Bind preserva o `this` original quando o middleware real estiver
 * presente (importante para o adaptiveRateLimiter que usa closures).
 *
 * @param {import('express').Request} req
 * @returns {{ fail: () => void, reset: () => void }}
 */
function safeRateLimit(req) {
  const rl = req?.rateLimit;
  const fail =
    rl && typeof rl.fail === "function" ? rl.fail.bind(rl) : () => {};
  const reset =
    rl && typeof rl.reset === "function" ? rl.reset.bind(rl) : () => {};
  return { fail, reset };
}

module.exports = { safeRateLimit };
