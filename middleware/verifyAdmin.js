// middleware/verifyAdmin.js
const jwt = require("jsonwebtoken");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const authAdminService = require("../services/authAdminService");

const SECRET_KEY = process.env.JWT_SECRET;

/**
 * Middleware de autenticação/autorização do admin.
 *
 * Queries de banco e cache Redis são delegadas a authAdminService,
 * que é a fonte canônica para acesso a dados de admin.
 */
async function verifyAdmin(req, _res, next) {
  if (!SECRET_KEY) {
    console.error("JWT_SECRET não definido no .env");
    return next(
      new AppError(
        "Erro de configuração de autenticação.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }

  let token = null;

  // Cookie HttpOnly only — Bearer tokens are not accepted
  if (req.cookies?.adminToken) {
    token = req.cookies.adminToken;
  }

  if (!token) {
    return next(
      new AppError(
        "Token não fornecido.",
        ERROR_CODES.AUTH_ERROR,
        401
      )
    );
  }

  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_KEY);
  } catch (err) {
    console.warn("verifyAdmin: token inválido:", err.message);
    return next(
      new AppError(
        "Token inválido ou expirado.",
        ERROR_CODES.AUTH_ERROR,
        401
      )
    );
  }

  try {
    const admin = await authAdminService.findAdminById(decoded.id);

    if (!admin) {
      return next(
        new AppError(
          "Admin não encontrado.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    if (typeof admin.ativo !== "undefined" && admin.ativo === 0) {
      return next(
        new AppError(
          "Admin inativo.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    // Validate tokenVersion for logout revocation support.
    // Tratar null como 0 — sem esse fallback, admins pré-migração com
    // tokenVersion NULL no banco ignoram a verificação de revogação.
    const dbVersion = admin.tokenVersion ?? 0;
    const jwtVersion = decoded.tokenVersion ?? 0;
    if (jwtVersion !== dbVersion) {
      return next(
        new AppError(
          "Sessão inválida. Faça login novamente.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    // Permissões SEMPRE vêm do banco (ou cache Redis) — nunca do JWT.
    // tokenVersion é passado para que o cache seja vinculado à sessão atual.
    const dbPermissions = await authAdminService.getAdminPermissions(
      admin.id,
      dbVersion
    );

    req.admin = {
      id: admin.id,
      email: admin.email,
      nome: admin.nome,
      role: admin.role,
      role_id: admin.role_id ?? null,
      permissions: Array.isArray(dbPermissions) ? dbPermissions : [],
    };

    return next();
  } catch (err) {
    console.error("Erro ao validar admin no banco:", err.message);
    return next(
      new AppError(
        "Erro ao validar admin no banco.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }
}

module.exports = verifyAdmin;
