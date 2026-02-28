// middleware/routeSpecificRateLimiter.js
//
// Aplica limites de taxa diferenciados por tipo de rota:
//   sensitive : 3 tentativas / 15 min  →  bloqueio de 1 h
//   moderate  : 10 tentativas / 1 min  →  bloqueio de 5 min
//   default   : 100 tentativas / 1 min →  bloqueio de 5 min
//
// Rotas sensíveis (brute-force / replay attack críticos):
//   POST /api/login
//   POST /api/admin/login
//   POST /api/users/register
//   POST /api/users/forgot-password
//   POST /api/users/reset-password
//   POST /api/payment/webhook
//
// Rotas moderadas:
//   /api/checkout/*

const ERROR_CODES = require("../constants/ErrorCodes");

// ---------------------------------------------------------------------------
// Configuração por categoria
// ---------------------------------------------------------------------------

const routeConfig = {
  sensitive: {
    maxAttempts: 3,
    windowMs: 15 * 60 * 1000, // 15 min
    blockMs: 60 * 60 * 1000,  // 1 h
  },
  moderate: {
    maxAttempts: 10,
    windowMs: 60 * 1000,      // 1 min
    blockMs: 5 * 60 * 1000,   // 5 min
  },
  default: {
    maxAttempts: 100,
    windowMs: 60 * 1000,      // 1 min
    blockMs: 5 * 60 * 1000,   // 5 min
  },
};

// ---------------------------------------------------------------------------
// Padrões de rota
// ---------------------------------------------------------------------------

const sensitiveRoutes = [
  /^\/api\/login$/,
  /^\/api\/admin\/login$/,
  /^\/api\/users\/register$/,
  /^\/api\/users\/forgot-password$/,
  /^\/api\/users\/reset-password$/,
  /^\/api\/payment\/webhook$/,
];

const moderateRoutes = [/^\/api\/checkout/];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRouteCategory(path) {
  if (sensitiveRoutes.some((r) => r.test(path))) return "sensitive";
  if (moderateRoutes.some((r) => r.test(path))) return "moderate";
  return "default";
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createRouteSpecificRateLimiter() {
  const store = new Map();

  return function routeSpecificRateLimiter(req, res, next) {
    const path = req.path;
    const category = getRouteCategory(path);
    const config = routeConfig[category];

    const key = `${category}:${req.ip}:${path}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry) {
      entry = { count: 0, windowStart: now, blockedUntil: 0 };
      store.set(key, entry);
    }

    // Bloquear se ainda dentro do período de bloqueio
    if (entry.blockedUntil > now) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        code: ERROR_CODES.RATE_LIMIT,
        message: "Muitas tentativas. Tente novamente mais tarde.",
        retryAfter,
      });
    }

    // Reiniciar janela se expirada
    if (now - entry.windowStart >= config.windowMs) {
      entry.count = 0;
      entry.windowStart = now;
      entry.blockedUntil = 0;
    }

    entry.count += 1;

    if (entry.count > config.maxAttempts) {
      entry.blockedUntil = now + config.blockMs;
      const retryAfter = Math.ceil(config.blockMs / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        code: ERROR_CODES.RATE_LIMIT,
        message: "Muitas tentativas. Tente novamente mais tarde.",
        retryAfter,
      });
    }

    return next();
  };
}

module.exports = createRouteSpecificRateLimiter;
module.exports.routeConfig = routeConfig;
module.exports.sensitiveRoutes = sensitiveRoutes;
module.exports.moderateRoutes = moderateRoutes;
module.exports.getRouteCategory = getRouteCategory;
