// middleware/requireRole.js
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/**
 * Exemplo de uso:
 *   router.put('/pedidos/:id', verifyAdmin, requireRole(['master', 'gerente', 'suporte']), handler);
 *   router.delete('/produtos/:id', verifyAdmin, requireRole(['master', 'gerente']), handler);
 */
function requireRole(allowedRoles = []) {
  return function (req, _res, next) {
    const role = req.admin?.role;

    if (!role || !allowedRoles.includes(role)) {
      return next(
        new AppError(
          "Permissão insuficiente para executar esta ação.",
          ERROR_CODES.AUTH_ERROR,
          403
        )
      );
    }

    return next();
  };
}

module.exports = requireRole;
