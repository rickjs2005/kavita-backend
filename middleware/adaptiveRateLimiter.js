// middleware/adaptiveRateLimiter.js
//
// LIMITAÇÃO CONHECIDA: o store padrão é um Map() em memória por processo.
// Em deployments com múltiplas instâncias (PM2 cluster, containers horizontais),
// o estado de rate limit NÃO é compartilhado entre processos — cada instância
// mantém seu próprio contador. Reiniciar o servidor zera todos os contadores.
//
// Para produção multi-instância: passe um store compatível com a interface Map
// (get/set/delete) implementado sobre Redis (ex: usando ioredis).
// O accountLockout.js já usa ioredis e pode servir de referência.
//
const ERROR_CODES = require("../constants/ErrorCodes");

const DEFAULT_SCHEDULE = [0, 60_000, 300_000, 900_000];
const DEFAULT_DECAY_MS = 15 * 60_000;

function createAdaptiveRateLimiter({
  keyGenerator,
  schedule = DEFAULT_SCHEDULE,
  decayMs = DEFAULT_DECAY_MS,
  // store: permite injetar store externo (ex: Redis-backed) para ambientes multi-instância.
  // Interface mínima: { get(key), set(key, value), delete(key) } — compatível com Map.
  store = new Map(),
} = {}) {
  if (typeof keyGenerator !== "function") {
    throw new Error("keyGenerator é obrigatório no rate limiter.");
  }

  return function adaptiveRateLimiter(req, res, next) {
    req.rateLimit = req.rateLimit || { fail: () => { }, reset: () => { } };

    const key = keyGenerator(req);
    if (!key) return next();

    const now = Date.now();
    let entry = store.get(key);
    if (!entry) {
      entry = { failCount: 0, blockedUntil: 0, lastFailure: 0 };
      store.set(key, entry);
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

    req.rateLimit.fail = () => {
      entry.failCount += 1;
      entry.lastFailure = Date.now();

      const index = Math.min(entry.failCount, schedule.length - 1);
      const blockDuration = schedule[index];

      if (blockDuration > 0) {
        entry.blockedUntil = Date.now() + blockDuration;
      }
    };

    req.rateLimit.reset = () => {
      store.delete(key);
    };

    return next();
  };
}

module.exports = createAdaptiveRateLimiter;
module.exports.DEFAULT_SCHEDULE = DEFAULT_SCHEDULE;
module.exports.DEFAULT_DECAY_MS = DEFAULT_DECAY_MS;
