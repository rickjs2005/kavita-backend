// middleware/adaptiveRateLimiter.js
//
// Suporta dois tipos de store:
//   - Map (padrão, in-memory por processo) — sem dependências externas
//   - RedisRateLimiterStore (lib/redisRateLimiterStore.js) — compartilhado entre instâncias
//
// O middleware é async para suportar stores assíncronos (Redis).
// req.rateLimit.fail() e req.rateLimit.reset() são fire-and-forget:
//   não precisam ser awaited pelos callers existentes.
//
const ERROR_CODES = require("../constants/ErrorCodes");

const DEFAULT_SCHEDULE = [0, 60_000, 300_000, 900_000];
const DEFAULT_DECAY_MS = 15 * 60_000;

function createAdaptiveRateLimiter({
  keyGenerator,
  schedule = DEFAULT_SCHEDULE,
  decayMs = DEFAULT_DECAY_MS,
  store = new Map(),
} = {}) {
  if (typeof keyGenerator !== "function") {
    throw new Error("keyGenerator é obrigatório no rate limiter.");
  }

  // Limpeza periódica para o store Map in-memory (Redis gerencia TTL por conta própria).
  if (store instanceof Map && process.env.NODE_ENV !== "test") {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (entry.lastFailure && now - entry.lastFailure > decayMs) {
          store.delete(key);
        }
      }
    }, decayMs).unref();
  }

  return async function adaptiveRateLimiter(req, res, next) {
    req.rateLimit = req.rateLimit || { fail: () => {}, reset: () => {} };

    const key = keyGenerator(req);
    if (!key) return next();

    const now = Date.now();

    // Suporta store sync (Map) e async (Redis) via await
    let entry = await store.get(key);
    if (!entry) {
      entry = { failCount: 0, blockedUntil: 0, lastFailure: 0 };
      // Persiste a nova entrada (fire-and-forget)
      Promise.resolve(store.set(key, entry)).catch(() => {});
    }

    if (entry.blockedUntil > now) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
      res.set("Retry-After", String(retryAfter));

      return res.status(429).json({
        code: ERROR_CODES.RATE_LIMIT,
        message: "Muitas tentativas. Tente novamente mais tarde.",
        retryAfter,
      });
    }

    if (entry.lastFailure && now - entry.lastFailure > decayMs) {
      entry.failCount = 0;
      entry.blockedUntil = 0;
      entry.lastFailure = 0;
    }

    // fire-and-forget — callers não precisam awaitar
    req.rateLimit.fail = () => {
      entry.failCount += 1;
      entry.lastFailure = Date.now();

      const index = Math.min(entry.failCount, schedule.length - 1);
      const blockDuration = schedule[index];

      if (blockDuration > 0) {
        entry.blockedUntil = Date.now() + blockDuration;
      }

      // Escrita assíncrona — não bloqueia o caller
      Promise.resolve(store.set(key, entry)).catch(() => {});
    };

    req.rateLimit.reset = () => {
      // Escrita assíncrona — não bloqueia o caller
      Promise.resolve(store.delete(key)).catch(() => {});
    };

    return next();
  };
}

module.exports = createAdaptiveRateLimiter;
module.exports.DEFAULT_SCHEDULE = DEFAULT_SCHEDULE;
module.exports.DEFAULT_DECAY_MS = DEFAULT_DECAY_MS;
