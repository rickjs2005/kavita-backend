// middleware/dronesCommentThrottle.js

const attempts = new Map();

// Configuração segura e flexível
const WINDOW_MS = 30 * 1000; // 30 segundos
const MAX_ATTEMPTS = 2;      // até 2 tentativas no intervalo

module.exports = function dronesCommentThrottle(req, res, next) {
  const userKey = req.user?.id || req.ip;

  const now = Date.now();
  const entry = attempts.get(userKey);

  if (!entry) {
    attempts.set(userKey, { count: 1, first: now });
    return next();
  }

  // Se passou o tempo, reseta
  if (now - entry.first > WINDOW_MS) {
    attempts.set(userKey, { count: 1, first: now });
    return next();
  }

  // Se ainda está no limite
  if (entry.count >= MAX_ATTEMPTS) {
    return res.status(429).json({
      message: "Você já enviou um comentário recentemente. Tente novamente em alguns segundos.",
    });
  }

  entry.count += 1;
  attempts.set(userKey, entry);
  next();
};
