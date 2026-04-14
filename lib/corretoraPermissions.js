// lib/corretoraPermissions.js
//
// Regras de permissão por role dentro da corretora. Fonte única da
// verdade usada em middlewares e controllers do painel.
//
// Matriz:
//
//   Capacidade                owner | manager | sales | viewer
//   ───────────────────────────────────────────────────────────
//   leads.view                  ✓   │   ✓     │   ✓   │   ✓
//   leads.update (status/nota)  ✓   │   ✓     │   ✓   │   ✗
//   leads.export                ✓   │   ✓     │   ✗   │   ✗
//   profile.edit                ✓   │   ✓     │   ✗   │   ✗
//   team.view                   ✓   │   ✓     │   ✗   │   ✗
//   team.invite                 ✓   │   ✗     │   ✗   │   ✗
//   team.remove                 ✓   │   ✗     │   ✗   │   ✗
//   team.change_role            ✓   │   ✗     │   ✗   │   ✗
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

const ROLES = ["owner", "manager", "sales", "viewer"];

const CAPABILITIES = {
  "leads.view":          ["owner", "manager", "sales", "viewer"],
  "leads.update":        ["owner", "manager", "sales"],
  "leads.export":        ["owner", "manager"],
  "profile.edit":        ["owner", "manager"],
  "team.view":           ["owner", "manager"],
  "team.invite":         ["owner"],
  "team.remove":         ["owner"],
  "team.change_role":    ["owner"],
};

function hasCapability(role, capability) {
  const allowed = CAPABILITIES[capability];
  if (!allowed) {
    throw new Error(`Unknown capability: ${capability}`);
  }
  return allowed.includes(role);
}

/**
 * Middleware Express: valida que req.corretoraUser.role tem a
 * capability exigida. Usa-se após verifyCorretora.
 */
function requireCapability(capability) {
  return (req, _res, next) => {
    const role = req.corretoraUser?.role;
    if (!role) {
      return next(
        new AppError(
          "Sessão inválida.",
          ERROR_CODES.UNAUTHORIZED,
          401,
        ),
      );
    }
    if (!hasCapability(role, capability)) {
      return next(
        new AppError(
          "Você não tem permissão para esta ação.",
          ERROR_CODES.FORBIDDEN,
          403,
        ),
      );
    }
    next();
  };
}

module.exports = {
  ROLES,
  CAPABILITIES,
  hasCapability,
  requireCapability,
};
