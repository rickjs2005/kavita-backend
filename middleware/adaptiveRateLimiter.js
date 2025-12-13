// middleware/adaptiveRateLimiter.js
const ERROR_CODES = require("../constants/ErrorCodes");

const DEFAULT_SCHEDULE = [0, 60_000, 300_000, 900_000];
const DEFAULT_DECAY_MS = 15 * 60_000;

function createAdaptiveRateLimiter({
  keyGenerator,
  schedule = DEFAULT_SCHEDULE,
  decayMs = DEFAULT_DECAY_MS,
} = {}) {
  if (typeof keyGenerator !== "function") {
    throw new Error("keyGenerator é obrigatório no rate limiter.");
  }

  const store = new Map();

  return function adaptiveRateLimiter(req, res, next) {
    req.rateLimit = req.rateLimit || { fail: () => {}, reset: () => {} };

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
        code: "RATE_LIMIT", // ou: ERROR_CODES.VALIDATION_ERROR (mas o ideal é RATE_LIMIT)
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
