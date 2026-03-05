// middleware/csrfProtection.js
const crypto = require("crypto");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/**
 * CSRF Protection Middleware (Double-Submit Cookie Strategy)
 * 
 * IMPORTANTE: NÃO aplicar globalmente em /api
 * Aplicar seletivamente em rotas que usam cookies (admin, cart, checkout, etc)
 * 
 * Flow:
 * 1. GET /api/csrf-token → returns { csrfToken } + sets cookie
 * 2. Client armazena token em memória (não localStorage)
 * 3. Client envia token em X-CSRF-Token header
 * 4. Middleware valida
 */

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

function generateCSRFToken() {
  return crypto.randomBytes(32).toString("hex");
}

function setCSRFTokenCookie(res, token) {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // Compatível com subdomínios/redirecionamentos
    path: "/api", // Reduz escopo do cookie
    maxAge: 24 * 60 * 60 * 1000, // 24h
  });
}

/**
 * Middleware: valida CSRF token em mutações
 * Aplique APENAS em rotas autenticadas (admin, cart, etc)
 */
function validateCSRF(req, res, next) {
  // Skip GET/HEAD/OPTIONS (safe methods)
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  // Get token from cookie
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  if (!cookieToken) {
    return next(
      new AppError(
        "CSRF token missing. Call GET /api/csrf-token first.",
        ERROR_CODES.AUTH_ERROR,
        403
      )
    );
  }

  // Get token from header
  const headerToken = req.get(CSRF_HEADER_NAME);
  if (!headerToken) {
    return next(
      new AppError(
        "CSRF token header missing (X-CSRF-Token).",
        ERROR_CODES.AUTH_ERROR,
        403
      )
    );
  }

  // Timing-safe comparison
  const bufCookie = Buffer.from(cookieToken, "utf8");
  const bufHeader = Buffer.from(headerToken, "utf8");

  if (
    bufCookie.length !== bufHeader.length ||
    !crypto.timingSafeEqual(bufCookie, bufHeader)
  ) {
    console.warn("[CSRF] Token mismatch (potential CSRF attack)");
    return next(
      new AppError(
        "CSRF token invalid.",
        ERROR_CODES.AUTH_ERROR,
        403
      )
    );
  }

  return next();
}

/**
 * Endpoint: GET /api/csrf-token (público, sem autenticação)
 * Retorna token + seta cookie
 */
function csrfTokenEndpoint(req, res) {
  const token = generateCSRFToken();
  setCSRFTokenCookie(res, token);
  return res.json({ csrfToken: token });
}

module.exports = {
  validateCSRF,
  csrfTokenEndpoint,
  generateCSRFToken,
  setCSRFTokenCookie,
};