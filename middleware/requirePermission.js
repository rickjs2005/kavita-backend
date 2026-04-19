// middleware/requirePermission.js
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// Roles que têm acesso irrestrito — não precisam de permissão explícita no banco.
// Altere se o seu modelo de roles for diferente.
const SUPERUSER_ROLES = new Set(["master"]);

// Bloco 5 — super-permissões que satisfazem qualquer permissão do mesmo
// módulo. `mercado_cafe_manage` foi quebrada em 5 granulares
// (view/approve/moderate/plan_manage/financial); durante a migração
// suave, quem tem a `_manage` continua sendo tratado como se tivesse
// todas. Isso permite introduzir checks granulares em rotas sem
// precisar revisar cada role provisionada antes do deploy.
const MODULE_SUPER_PERMISSIONS = {
  mercado_cafe_view: "mercado_cafe_manage",
  mercado_cafe_approve: "mercado_cafe_manage",
  mercado_cafe_moderate: "mercado_cafe_manage",
  mercado_cafe_plan_manage: "mercado_cafe_manage",
  mercado_cafe_financial: "mercado_cafe_manage",
};

function hasPermission(admin, permissionKey) {
  const perms = admin?.permissions || [];
  if (perms.includes(permissionKey)) return true;
  const superKey = MODULE_SUPER_PERMISSIONS[permissionKey];
  if (superKey && perms.includes(superKey)) return true;
  return false;
}

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
    if (!req.admin) {
      return next(
        new AppError(
          "Não autenticado.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    const role = req.admin.role || "";

    // Superusuários têm acesso total sem verificação de permissão individual
    if (SUPERUSER_ROLES.has(role)) {
      return next();
    }

    if (!hasPermission(req.admin, permissionKey)) {
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

/**
 * Bloco 5 — requireAnyPermission("a", "b", ...). Autoriza se o admin
 * tem pelo menos uma das permissões listadas. Útil enquanto
 * convivemos com granulares novas + super-permissão legada
 * `mercado_cafe_manage` — embora o short-circuit de super-permissão
 * já trate esse caso, a função ajuda quando a rota é relevante para
 * múltiplas granulares (ex.: listar corretoras vale pra view, approve
 * ou moderate).
 */
function requireAnyPermission(...permissionKeys) {
  return function (req, _res, next) {
    if (!req.admin) {
      return next(
        new AppError(
          "Não autenticado.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }
    const role = req.admin.role || "";
    if (SUPERUSER_ROLES.has(role)) return next();
    for (const key of permissionKeys) {
      if (hasPermission(req.admin, key)) return next();
    }
    return next(
      new AppError(
        "Permissão insuficiente para executar esta ação.",
        ERROR_CODES.AUTH_ERROR,
        403,
      ),
    );
  };
}

module.exports = requirePermission;
module.exports.requirePermission = requirePermission;
module.exports.requireAnyPermission = requireAnyPermission;
module.exports.hasPermission = hasPermission;
module.exports.MODULE_SUPER_PERMISSIONS = MODULE_SUPER_PERMISSIONS;
