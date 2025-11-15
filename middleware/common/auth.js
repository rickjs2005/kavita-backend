const jwt = require("jsonwebtoken");
const { normalizeError } = require("../responseEnvelope");

class AuthenticationError extends Error {
  constructor(message = "Não autorizado", status = 401, details) {
    super(message);
    this.name = "AuthenticationError";
    this.status = status;
    if (details) {
      this.details = details;
    }
  }
}

const extractToken = (header = "") => {
  if (!header) return null;
  if (header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return header.trim() || null;
};

function requireAuth(options = {}) {
  const {
    roles,
    secret = process.env.JWT_SECRET,
    tokenResolver = (req) => extractToken(req.headers.authorization),
  } = options;

  if (!secret) {
    throw new Error("JWT_SECRET não configurado para middleware de autenticação");
  }

  return (req, _res, next) => {
    try {
      const token = tokenResolver(req);
      if (!token) {
        throw new AuthenticationError("Token não fornecido");
      }

      const payload = jwt.verify(token, secret);
      req.user = payload;

      if (roles && roles.length) {
        const allowed = Array.isArray(roles) ? roles : [roles];
        if (!allowed.includes(payload.role)) {
          throw new AuthenticationError("Acesso negado", 403, { requiredRoles: allowed });
        }
      }

      next();
    } catch (error) {
      if (!(error instanceof AuthenticationError)) {
        const normalized = normalizeError(error);
        const err = new AuthenticationError(normalized?.message || "Token inválido", 401);
        err.details = normalized?.details || normalized;
        return next(err);
      }
      return next(error);
    }
  };
}

function requireAdmin(options = {}) {
  const roles = options.roles || ["admin", "ADMIN"];
  return requireAuth({ ...options, roles });
}

module.exports = { requireAuth, requireAdmin, AuthenticationError };
