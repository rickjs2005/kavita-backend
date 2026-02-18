// middleware/verifyUser.js
const authenticateToken = require("./authenticateToken");

/**
 * Middleware de autenticação para usuários públicos.
 * Reutiliza o authenticateToken (JWT em cookie ou Bearer).
 *
 * Usado em:
 * - comentários
 * - uploads públicos autenticados
 * - interações protegidas
 */
module.exports = function verifyUser(req, res, next) {
  return authenticateToken(req, res, next);
};
