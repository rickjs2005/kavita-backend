"use strict";

// middleware/absoluteRateLimit.js
//
// Fase 1 go-live — B5: rate limit ABSOLUTO por IP/tempo.
//
// Diferença para middleware/adaptiveRateLimiter.js:
//   - adaptiveRateLimiter penaliza apenas DEPOIS de o caller chamar
//     `req.rateLimit.fail()` (ex.: tentativa de login com senha errada).
//     Não protege contra request flood em rotas como /api/checkout,
//     /api/payment/webhook ou /api/public/produtos.
//   - absoluteRateLimit limita N requisições / janela / IP, sem
//     depender de feedback da rota. É a primeira linha de defesa
//     contra DoS, scraping e força bruta de assinatura.
//
// Backend: usa rate-limit-redis quando REDIS está pronto; fallback
// para memory store quando o Redis está offline (mesma estratégia do
// rateLimiter global existente).
//
// Cada limiter retorna 429 com payload `{ ok:false, code:"RATE_LIMIT",
// message, retryAfter }` para casar com o contrato `lib/response.js`
// que o frontend já entende.

const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const RedisStore = require("rate-limit-redis").default || require("rate-limit-redis");

const redis = require("../lib/redis");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");

const ENV = process.env;

function envInt(key, fallback) {
  const raw = ENV[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function buildStore(prefix) {
  if (!redis.ready || !redis.client) return undefined;
  try {
    return new RedisStore({
      sendCommand: (...args) => redis.client.call(...args),
      prefix,
    });
  } catch (err) {
    logger.warn({ err, prefix }, "absoluteRateLimit: redis store unavailable, using memory");
    return undefined;
  }
}

function rateLimitResponder(_req, res /*, _next, options */) {
  const retryAfter = Number(res.getHeader("Retry-After")) || 60;
  return res.status(429).json({
    ok: false,
    code: ERROR_CODES.RATE_LIMIT,
    message: "Muitas requisições. Aguarde alguns segundos e tente novamente.",
    retryAfter,
  });
}

const ONE_MINUTE = 60 * 1000;

function makeIpLimiter({ name, windowMs, max, keyGenerator }) {
  // express-rate-limit 8.x:
  //   - `max` foi removido em favor de `limit`
  //   - keyGenerator default precisa de normalização IPv6 via ipKeyGenerator
  //     que recebe a STRING do IP (não o request) e devolve um agrupamento /56
  //     para clientes IPv6 (impede burlar limit variando os bits finais).
  const finalKeyGen = keyGenerator || ((req) => ipKeyGenerator(req.ip || "unknown"));
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: rateLimitResponder,
    skip: (req) => req.path === "/health",
    keyGenerator: finalKeyGen,
    store: buildStore(`rl:${name}:`),
  });
}

// Limiter global: 300 req/min/IP (override via env). Não bloqueia /health.
const globalLimiter = makeIpLimiter({
  name: "global",
  windowMs: ONE_MINUTE,
  max: envInt("RATE_LIMIT_GLOBAL_PER_MINUTE", 300),
});

// Webhook MP/Asaas/ClickSign — limites por IP. ClickSign + MP tipicamente
// chamam de IPs estáveis, mas um limit de 60/min/IP é folgado em caso de
// burst e mata flood de attacker forjando webhooks (cada miss já é caro
// por causa do HMAC).
const webhookLimiter = makeIpLimiter({
  name: "webhook",
  windowMs: ONE_MINUTE,
  max: envInt("RATE_LIMIT_WEBHOOK_PER_MINUTE", 60),
});

// Checkout: 10 / min — chave preferencial = userId quando logado, IP como
// fallback. Casado com o advisory lock por usuário no checkoutService.
const checkoutLimiter = makeIpLimiter({
  name: "checkout",
  windowMs: ONE_MINUTE,
  max: envInt("RATE_LIMIT_CHECKOUT_PER_MINUTE", 10),
  keyGenerator: (req) => {
    const uid = req.user?.id;
    return uid ? `u:${uid}` : `ip:${ipKeyGenerator(req.ip || "unknown")}`;
  },
});

// Login (loja, admin, corretora, motorista magic-link) — 10/min/IP.
// Combina com o adaptiveRateLimiter existente, que ainda escala bloqueio
// quando há failures consecutivos.
const loginLimiter = makeIpLimiter({
  name: "login",
  windowMs: ONE_MINUTE,
  max: envInt("RATE_LIMIT_LOGIN_PER_MINUTE", 10),
});

// Magic-link motorista (passwordless via WhatsApp) — 5/min/IP. Mais
// agressivo porque cada chamada PODE consumir crédito de WhatsApp Cloud
// API e expor enumeração de telefones.
const motoristaMagicLinkLimiter = makeIpLimiter({
  name: "motorista_magic",
  windowMs: ONE_MINUTE,
  max: envInt("RATE_LIMIT_MOTORISTA_MAGIC_PER_MINUTE", 5),
});

// Cadastro de novo usuário — 3/min/IP. Cobre tanto loja (/api/users/register)
// quanto fluxos públicos de "esqueci minha senha".
const registerLimiter = makeIpLimiter({
  name: "register",
  windowMs: ONE_MINUTE,
  max: envInt("RATE_LIMIT_REGISTER_PER_MINUTE", 3),
});

// Producer magic-link (passwordless via email).
const producerMagicLinkLimiter = makeIpLimiter({
  name: "producer_magic",
  windowMs: ONE_MINUTE,
  max: envInt("RATE_LIMIT_PRODUCER_MAGIC_PER_MINUTE", 5),
});

module.exports = {
  globalLimiter,
  webhookLimiter,
  checkoutLimiter,
  loginLimiter,
  motoristaMagicLinkLimiter,
  registerLimiter,
  producerMagicLinkLimiter,
};
