// controllers/corretoraPanel/authCorretoraController.js
//
// Login, sessão e logout do usuário de corretora (Fase 2).
// Não depende de RBAC — o único papel é "corretora".
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const authService = require("../../services/corretoraAuthService");
const analyticsService = require("../../services/analyticsService");
const logger = require("../../lib/logger");

const COOKIE_NAME = "corretoraToken";

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: authService.COOKIE_MAX_AGE_MS,
    path: "/",
  };
}

/**
 * POST /api/corretora/login
 * Body validado por validate(corretoraLoginSchema).
 */
async function login(req, res, next) {
  const rateLimit = req.rateLimit || { fail: () => {}, reset: () => {} };
  const { email, senha } = req.body;

  try {
    const user = await authService.findUserByEmail(email);

    if (!user) {
      rateLimit.fail();
      logger.warn(
        { email, ip: req.ip },
        "corretora.login.failed: user_not_found"
      );
      return next(
        new AppError("Credenciais inválidas.", ERROR_CODES.AUTH_ERROR, 401)
      );
    }

    if (!user.is_active) {
      rateLimit.fail();
      logger.warn(
        { userId: user.id, email, ip: req.ip },
        "corretora.login.blocked: user_inactive"
      );
      return next(
        new AppError("Credenciais inválidas.", ERROR_CODES.AUTH_ERROR, 401)
      );
    }

    if (user.corretora_status !== "active") {
      rateLimit.fail();
      logger.warn(
        { userId: user.id, corretoraId: user.corretora_id, ip: req.ip },
        "corretora.login.blocked: corretora_inactive"
      );
      return next(
        new AppError(
          "Corretora inativa. Entre em contato com o administrador.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    // Conta com convite pendente: existe row mas ainda não definiu senha.
    // Login fica bloqueado até que a corretora use o link de primeiro
    // acesso enviado por e-mail (ou "Esqueci minha senha" para recuperar).
    if (authService.isPendingFirstAccess(user)) {
      rateLimit.fail();
      logger.warn(
        { userId: user.id, corretoraId: user.corretora_id, ip: req.ip },
        "corretora.login.blocked: pending_first_access"
      );
      return next(
        new AppError(
          "Sua conta ainda não tem senha definida. Verifique o e-mail de primeiro acesso ou use 'Esqueci minha senha'.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    const ok = await authService.verifyPassword(senha, user.password_hash);
    if (!ok) {
      rateLimit.fail();
      logger.warn(
        { userId: user.id, email, ip: req.ip },
        "corretora.login.failed: wrong_password"
      );
      return next(
        new AppError("Credenciais inválidas.", ERROR_CODES.AUTH_ERROR, 401)
      );
    }

    rateLimit.reset();

    const token = authService.generateToken(user);
    await authService.updateLastLogin(user.id);

    res.cookie(COOKIE_NAME, token, getCookieOptions());

    logger.info(
      { userId: user.id, corretoraId: user.corretora_id, ip: req.ip },
      "corretora.login.ok"
    );

    analyticsService.track({
      name: "corretora_login",
      actorType: "corretora_user",
      actorId: user.id,
      corretoraId: user.corretora_id,
      props: { email: user.email },
      req,
    });

    return response.ok(
      res,
      {
        user: {
          id: user.id,
          nome: user.nome,
          email: user.email,
          corretora_id: user.corretora_id,
          corretora_name: user.corretora_name,
          corretora_slug: user.corretora_slug,
        },
      },
      "Login realizado com sucesso."
    );
  } catch (err) {
    logger.error({ err }, "corretora login error");
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro interno ao fazer login.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
}

/**
 * GET /api/corretora/me
 */
async function getMe(req, res, next) {
  try {
    const u = req.corretoraUser;
    if (!u) {
      return next(
        new AppError("Não autenticado.", ERROR_CODES.AUTH_ERROR, 401)
      );
    }

    return response.ok(res, {
      id: u.id,
      nome: u.nome,
      email: u.email,
      corretora_id: u.corretora_id,
      corretora_name: u.corretora_name,
      corretora_slug: u.corretora_slug,
    });
  } catch (err) {
    return next(
      new AppError(
        "Erro ao carregar perfil.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }
}

/**
 * POST /api/corretora/logout
 */
async function logout(req, res) {
  const userId = req.corretoraUser?.id;

  if (userId) {
    try {
      await authService.incrementTokenVersion(userId);
    } catch (err) {
      logger.warn(
        { err, userId },
        "falha ao incrementar token_version no logout"
      );
    }
  }

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return response.ok(res, null, "Logout realizado com sucesso.");
}

module.exports = { login, getMe, logout };
