// middleware/authenticateToken.js
const jwt = require("jsonwebtoken");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/**
 * Middleware de autenticação com JWT.
 *
 * Estratégia:
 * - Primeiro tenta ler o token do cookie HttpOnly: auth_token
 * - Fallback: Authorization: Bearer <token>
 * - Se válido, popula req.user
 */
function authenticateToken(req, _res, next) {
  const SECRET = process.env.JWT_SECRET;

  if (!SECRET) {
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

  // 1) Cookie HttpOnly
  if (req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  }

  // 2) Fallback Authorization header
  if (!token) {
    const authHeader =
      req.headers.authorization || req.headers["authorization"];

    if (typeof authHeader === "string") {
      const [scheme, value] = authHeader.split(" ");
      if (scheme === "Bearer" && value) {
        token = value;
      }
    }
  }

  if (!token) {
    console.warn("authenticateToken: token ausente");
    return next(
      new AppError(
        "Você precisa estar logado para acessar esta área.",
        ERROR_CODES.AUTH_ERROR,
        401
      )
    );
  }

  try {
    const payload = jwt.verify(token, SECRET);

    req.user = {
      id: payload.id,
      role: payload.role || null,
    };

    return next();
  } catch (error) {
    console.warn("authenticateToken: token inválido ou expirado", error.message);
    return next(
      new AppError(
        "Sua sessão expirou ou é inválida. Faça login novamente.",
        ERROR_CODES.AUTH_ERROR,
        401
      )
    );
  }
}

module.exports = authenticateToken;
