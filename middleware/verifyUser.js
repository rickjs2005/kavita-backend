// middleware/verifyUser.js
const authenticateToken = require("./authenticateToken");

/**
 * Alias semântico de authenticateToken — sem lógica adicional.
 *
 * Comportamento idêntico a authenticateToken:
 *   - lê cookie auth_token
 *   - verifica JWT
 *   - consulta tokenVersion no banco (usuarios)
 *   - seta req.user = { id, nome, email, role }
 *   - retorna 401 se ausente/inválido/revogado
 *
 * Consumer atual: routes/publicDrones.js (POST /api/public/drones/comentarios)
 *
 * Para novas rotas: prefira authenticateToken diretamente,
 * que é o padrão do projeto (ver CLAUDE.md).
 */
module.exports = function verifyUser(req, res, next) {
  return authenticateToken(req, res, next);
};
