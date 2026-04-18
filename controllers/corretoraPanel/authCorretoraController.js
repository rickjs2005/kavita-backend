// controllers/corretoraPanel/authCorretoraController.js
//
// Login, sessão e logout do usuário de corretora (Fase 2).
// Não depende de RBAC — o único papel é "corretora".
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const authService = require("../../services/corretoraAuthService");
const totpService = require("../../services/corretoraTotpService");
const usersRepo = require("../../repositories/corretoraUsersRepository");
const mailService = require("../../services/mailService");
const analyticsService = require("../../services/analyticsService");
const auditLogsRepo = require("../../repositories/adminAuditLogsRepository");
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

    // ETAPA 2.2 — se 2FA está ativo, NÃO seta o cookie de sessão aqui.
    // Retornamos um challenge_token (JWT curto, 5min) que o frontend
    // vai trocar em POST /login/totp junto com o código OTP.
    if (user.totp_enabled) {
      const challengeToken = authService.generateTotpChallengeToken(user);
      logger.info(
        { userId: user.id, corretoraId: user.corretora_id, ip: req.ip },
        "corretora.login.totp_challenge_issued",
      );
      return response.ok(
        res,
        {
          requires_totp: true,
          challenge_token: challengeToken,
        },
        "Digite o código do aplicativo de autenticação.",
      );
    }

    await finalizeLogin({ req, res, user });
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
      role: u.role,
      corretora_id: u.corretora_id,
      corretora_name: u.corretora_name,
      corretora_slug: u.corretora_slug,
      impersonation: u.impersonation ?? null,
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

/**
 * POST /api/corretora/exit-impersonation
 * Só responde 204 quando a sessão atual é de fato impersonada.
 * Para sessão normal, devolve 400 — sem efeito colateral — para não
 * permitir que a UI do banner seja "forçada" a aparecer via request
 * direto. Não incrementa token_version: a sessão original do user
 * segue válida no outro cookie (se existir).
 */
async function exitImpersonation(req, res, next) {
  try {
    const u = req.corretoraUser;
    if (!u?.impersonation) {
      return next(
        new AppError(
          "Sessão atual não é impersonada.",
          ERROR_CODES.VALIDATION_ERROR,
          400,
        ),
      );
    }

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    // Audit do encerramento — fire-and-forget. Usamos o repo direto
    // (não o adminAuditService) porque esta rota é da corretora e
    // não tem req.admin; o admin_id vem da claim preservada no JWT.
    auditLogsRepo
      .create({
        admin_id: u.impersonation.admin_id ?? null,
        admin_nome: u.impersonation.admin_nome ?? null,
        action: "corretora.impersonation_ended",
        target_type: "corretora",
        target_id: u.corretora_id,
        meta: {
          corretora_user_id: u.id,
          started_at: u.impersonation.started_at,
        },
        ip: req.ip,
        user_agent: req.get("user-agent")?.slice(0, 500) || null,
      })
      .catch((err) => {
        logger.warn(
          { err, corretoraUserId: u.id },
          "corretora.impersonation.exit_audit_failed",
        );
      });

    logger.info(
      {
        corretoraUserId: u.id,
        corretoraId: u.corretora_id,
        adminId: u.impersonation.admin_id,
        startedAt: u.impersonation.started_at,
      },
      "corretora.impersonation.exited",
    );

    return response.ok(res, null, "Impersonação encerrada.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao encerrar impersonação.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * Helper compartilhado: emite cookie corretoraToken, atualiza
 * last_login_* e dispara alerta de novo IP se houver mudança.
 * Chamado por login (sem 2FA) e verifyTotpStep (com 2FA).
 */
async function finalizeLogin({ req, res, user }) {
  const token = authService.generateToken(user, {
    totp_verified_at: user.totp_enabled ? Date.now() : null,
  });
  const currentIp = req.ip ?? null;
  const previousIp = user.last_login_ip ?? null;

  await authService.updateLastLogin(user.id);
  await usersRepo.updateLastLoginIp(user.id, currentIp);

  res.cookie(COOKIE_NAME, token, getCookieOptions());

  logger.info(
    { userId: user.id, corretoraId: user.corretora_id, ip: currentIp },
    "corretora.login.ok",
  );

  analyticsService.track({
    name: "corretora_login",
    actorType: "corretora_user",
    actorId: user.id,
    corretoraId: user.corretora_id,
    props: { email: user.email },
    req,
  });

  // ETAPA 2.3 — alerta de novo IP. Fire-and-forget. Só dispara
  // quando previousIp existe (não é o primeiro login) E é diferente.
  // Comparação simples por string — cobre a mudança grosseira; IPs
  // dinâmicos do mesmo ISP podem gerar alerta legítimo, o que é
  // aceitável (melhor falso positivo que silêncio em acesso estranho).
  if (previousIp && previousIp !== currentIp && user.email) {
    mailService
      .sendCorretoraNewIpAlertEmail({
        toEmail: user.email,
        corretoraName: user.corretora_name,
        ip: currentIp,
        userAgent: req.get("user-agent")?.slice(0, 200) || null,
        when: new Date(),
      })
      .catch((err) =>
        logger.warn(
          { err: err?.message ?? String(err), userId: user.id },
          "corretora.login.new_ip_alert_failed",
        ),
      );
  }
}

/**
 * POST /api/corretora/login/totp
 * Body: { challenge_token, code }
 *
 * ETAPA 2.2 — segundo passo do login. Aceita:
 *   - code de 6 dígitos gerado pelo app autenticador
 *   - OU backup code (8 chars alfanuméricos)
 *
 * Em sucesso, emite o cookie corretoraToken normal + alerta IP.
 */
async function verifyTotpStep(req, res, next) {
  const rateLimit = req.rateLimit || { fail: () => {}, reset: () => {} };
  try {
    const { challenge_token: challengeToken, code } = req.body ?? {};
    const decoded = authService.verifyTotpChallengeToken(challengeToken);
    if (!decoded) {
      rateLimit.fail();
      return next(
        new AppError(
          "Sessão de verificação expirou. Faça login novamente.",
          ERROR_CODES.AUTH_ERROR,
          401,
        ),
      );
    }

    const user = await authService.findUserById(decoded.id);
    if (!user || !user.totp_enabled) {
      rateLimit.fail();
      return next(
        new AppError(
          "2FA não está mais ativo nesta conta.",
          ERROR_CODES.AUTH_ERROR,
          401,
        ),
      );
    }
    // Guard: tokenVersion não pode ter mudado entre os dois passos
    // (admin desativou, senha resetada, etc.)
    if ((user.token_version ?? 0) !== (decoded.tokenVersion ?? 0)) {
      rateLimit.fail();
      return next(
        new AppError(
          "Sessão inválida, refaça o login.",
          ERROR_CODES.AUTH_ERROR,
          401,
        ),
      );
    }

    const input = String(code ?? "").trim();
    let via = "totp";
    let ok = totpService.verifyToken({ secret: user.totp_secret, code: input });
    if (!ok) {
      // Tenta consumir como backup code
      ok = await totpService.consumeBackupCode(user.id, input);
      if (ok) via = "backup_code";
    }
    if (!ok) {
      rateLimit.fail();
      logger.warn(
        { userId: user.id, ip: req.ip },
        "corretora.login.totp_invalid",
      );
      return next(
        new AppError(
          "Código inválido. Tente novamente ou use um código de backup.",
          ERROR_CODES.AUTH_ERROR,
          401,
        ),
      );
    }

    rateLimit.reset();
    await finalizeLogin({ req, res, user });
    logger.info(
      { userId: user.id, via, ip: req.ip },
      "corretora.login.totp_ok",
    );

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
        used_backup_code: via === "backup_code",
      },
      "Login realizado com sucesso.",
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro na verificação 2FA.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { login, verifyTotpStep, getMe, logout, exitImpersonation };
