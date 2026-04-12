// middleware/csrfProtection.js
// Double-submit cookie strategy for CSRF protection
const crypto = require("crypto");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const COOKIE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h

/**
 * Generates a new CSRF token and sets it as a non-HttpOnly cookie
 * (must be readable by JS so the frontend can read and send it in a header).
 *
 * GET /api/csrf-token
 */
function issueCsrfToken(req, res) {
  const token = crypto.randomBytes(32).toString("hex");

  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // intentionally readable by JS (double-submit pattern)
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });

  return res.json({ csrfToken: token });
}

/**
 * Validates CSRF token using the double-submit cookie strategy:
 * - Cookie value must match the value sent in the X-CSRF-Token header.
 *
 * Apply to state-changing routes on admin/authenticated areas.
 */
function validateCSRF(req, res, next) {
  // Safe methods don't need CSRF protection
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE];
  const headerToken = req.headers && req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken) {
    return next(new AppError("CSRF token ausente.", ERROR_CODES.FORBIDDEN, 403));
  }

  // Constant-time comparison to prevent timing attacks
  const cookieBuf = Buffer.from(cookieToken);
  const headerBuf = Buffer.from(headerToken);

  if (
    cookieBuf.length !== headerBuf.length ||
    !crypto.timingSafeEqual(cookieBuf, headerBuf)
  ) {
    return next(new AppError("CSRF token inválido.", ERROR_CODES.FORBIDDEN, 403));
  }

  return next();
}

module.exports = { issueCsrfToken, validateCSRF };
