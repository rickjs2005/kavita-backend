// middleware/requirePermission.js
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// Roles que têm acesso irrestrito — não precisam de permissão explícita no banco.
// Altere se o seu modelo de roles for diferente.
const SUPERUSER_ROLES = new Set(["master"]);

/**
 * Verifica se o admin autenticado possui a permissão solicitada.
 * Admins com role "master" têm bypass automático.
 *
 * Exemplo:
 *   router.post('/admin/produtos', verifyAdmin, requirePermission('produtos.criar'), handler);
 *
 * Chaves de permissão convencionadas por módulo:
 *   <modulo>.ver | <modulo>.criar | <modulo>.editar | <modulo>.deletar
 */
function requirePermission(permissionKey) {
  return function (req, _res, next) {
    const role = req.admin?.role || "";

    // Superusuários têm acesso total sem verificação de permissão individual
    if (SUPERUSER_ROLES.has(role)) {
      return next();
    }

    const perms = req.admin?.permissions || [];

    if (!perms.includes(permissionKey)) {
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

module.exports = requirePermission;
