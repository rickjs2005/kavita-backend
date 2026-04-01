// controllers/admin/authAdminController.js
const { logAdminAction } = require("../../services/adminLogs");
const {
  assertNotLocked,
  incrementFailure,
  resetFailures,
  syncFromRedis,
} = require("../../security/accountLockout");
const authAdminService = require("../../services/authAdminService");
const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");

// Load speakeasy once at module load (optional dependency for MFA)
let speakeasy = null;
try { speakeasy = require("speakeasy"); } catch { /* optional */ }

const COOKIE_NAME = "adminToken";

function getAdminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: authAdminService.COOKIE_MAX_AGE_MS,
    path: "/",
  };
}

async function login(req, res, next) {
  const { email, senha } = req.body || {};
  const rateLimit = req.rateLimit || { fail: () => {}, reset: () => {} };

  if (!email || !senha) {
    rateLimit.fail();
    return next(new AppError("Email e senha são obrigatórios.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  const emailNormalizado = String(email).trim().toLowerCase();
  const lockoutKey = `admin:${emailNormalizado}`;

  try {
    await syncFromRedis(lockoutKey);
    assertNotLocked(lockoutKey);

    console.log("🔐 Tentativa de login de admin");

    const admin = await authAdminService.findAdminByEmail(emailNormalizado);

    if (!admin) {
      await incrementFailure(lockoutKey);
      rateLimit.fail();
      return next(new AppError("Credenciais inválidas.", ERROR_CODES.AUTH_ERROR, 401));
    }

    const senhaCorreta = await authAdminService.verifyPassword(senha, admin.senha);

    if (!senhaCorreta) {
      await incrementFailure(lockoutKey);
      rateLimit.fail();
      return next(new AppError("Credenciais inválidas.", ERROR_CODES.AUTH_ERROR, 401));
    }

    await resetFailures(lockoutKey);
    rateLimit.reset();

    if (admin.mfa_active && admin.mfa_secret) {
      const challengeId = await authAdminService.createMfaChallenge(
        admin.id,
        req.ip,
        admin.mfa_secret
      );
      return response.ok(res, { mfaRequired: true, challengeId });
    }

    const permissions = await authAdminService.getAdminPermissions(admin.id);
    const payload = authAdminService.buildTokenPayload(admin, permissions);
    const token = authAdminService.generateToken(payload);

    await authAdminService.updateLastLogin(admin.id);

    console.log("✅ Login de admin bem-sucedido, id:", admin.id);

    logAdminAction({
      adminId: admin.id,
      acao: "login_sucesso",
      entidade: "admin",
      entidadeId: admin.id,
    });

    res.cookie(COOKIE_NAME, token, getAdminCookieOptions());

    return response.ok(res, {
      admin: {
        id: admin.id,
        email: admin.email,
        nome: admin.nome,
        role: admin.role,
        role_id: admin.role_id || null,
        permissions,
      },
    }, "Login realizado com sucesso.");
  } catch (err) {
    if (err.locked) {
      return next(new AppError(err.message, ERROR_CODES.AUTH_ERROR, 429));
    }
    rateLimit.fail();
    console.error("❌ Erro no login do admin:", err);
    return next(new AppError("Erro interno no servidor ao fazer login.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function loginMfa(req, res, next) {
  const { challengeId, code } = req.body || {};

  if (!challengeId || !code) {
    return next(new AppError("challengeId e código são obrigatórios.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  const challenge = await authAdminService.getMfaChallenge(challengeId);

  if (!challenge) {
    return next(new AppError("Sessão de verificação inválida.", ERROR_CODES.AUTH_ERROR, 401));
  }

  if (challenge.ip && challenge.ip !== req.ip) {
    await authAdminService.deleteMfaChallenge(challengeId);
    return next(new AppError("Sessão de verificação inválida.", ERROR_CODES.AUTH_ERROR, 401));
  }

  if (Date.now() > challenge.expiresAt) {
    await authAdminService.deleteMfaChallenge(challengeId);
    return next(new AppError("Sessão de verificação expirada. Faça login novamente.", ERROR_CODES.AUTH_ERROR, 401));
  }

  if (!speakeasy) {
    console.error("❌ speakeasy não instalado — MFA não pode ser validado");
    return next(new AppError("Erro interno ao validar MFA.", ERROR_CODES.SERVER_ERROR, 500));
  }

  const codeValid = speakeasy.totp.verify({
    secret: challenge.mfaSecret,
    encoding: "base32",
    token: String(code).replace(/\s/g, ""),
    window: 1,
  });

  if (!codeValid) {
    req.rateLimit?.fail?.();
    return next(new AppError("Credenciais inválidas.", ERROR_CODES.AUTH_ERROR, 401));
  }

  await authAdminService.deleteMfaChallenge(challengeId);

  try {
    const admin = await authAdminService.findAdminById(challenge.adminId);

    if (!admin) {
      return next(new AppError("Credenciais inválidas.", ERROR_CODES.AUTH_ERROR, 401));
    }

    const permissions = await authAdminService.getAdminPermissions(admin.id);
    const payload = authAdminService.buildTokenPayload(admin, permissions);
    const token = authAdminService.generateToken(payload);

    await authAdminService.updateLastLogin(admin.id);

    logAdminAction({
      adminId: admin.id,
      acao: "login_mfa_sucesso",
      entidade: "admin",
      entidadeId: admin.id,
    });

    res.cookie(COOKIE_NAME, token, getAdminCookieOptions());

    return response.ok(res, {
      admin: {
        id: admin.id,
        email: admin.email,
        nome: admin.nome,
        role: admin.role,
        role_id: admin.role_id || null,
        permissions,
      },
    }, "Login realizado com sucesso.");
  } catch (err) {
    return next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const adminId = req.admin?.id;

    if (!adminId) {
      return next(new AppError("Token inválido ou administrador não autenticado.", ERROR_CODES.AUTH_ERROR, 401));
    }

    const admin = await authAdminService.findAdminById(adminId);

    if (!admin) {
      return next(new AppError("Admin não encontrado", ERROR_CODES.NOT_FOUND, 404));
    }

    const permissions = await authAdminService.getAdminPermissions(admin.id);

    return response.ok(res, {
      id: admin.id,
      nome: admin.nome,
      email: admin.email,
      role: admin.role,
      role_id: admin.role_id || null,
      permissions,
    });
  } catch (err) {
    console.error("❌ Erro ao carregar perfil do admin (/me):", err);
    return next(new AppError("Erro interno ao carregar perfil do admin.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function logout(req, res) {
  const adminId = req.admin?.id;

  if (adminId) {
    try {
      await authAdminService.incrementTokenVersion(adminId);
    } catch (err) {
      console.warn(
        "⚠️ Não foi possível incrementar tokenVersion para admin:",
        adminId,
        err
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

module.exports = { login, loginMfa, getMe, logout };
