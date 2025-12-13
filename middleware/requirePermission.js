// middleware/requirePermission.js
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/**
 * Exemplo:
 * router.get(
 *   '/admin/produtos',
 *   verifyAdmin,
 *   requirePermission('produtos.ver'),
 *   handler
 * );
 */
function requirePermission(permissionKey) {
  return function (req, _res, next) {
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
