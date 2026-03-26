// controllers/admin/authAdminController.js
const { logAdminAction } = require("../../services/adminLogs");
const {
  assertNotLocked,
  incrementFailure,
  resetFailures,
  syncFromRedis,
} = require("../../security/accountLockout");
const authAdminService = require("../../services/authAdminService");

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

async function login(req, res) {
  const { email, senha } = req.body || {};
  const rateLimit = req.rateLimit || { fail: () => {}, reset: () => {} };

  if (!email || !senha) {
    rateLimit.fail();
    return res.status(400).json({ message: "Email e senha são obrigatórios." });
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
      return res.status(401).json({ message: "Credenciais inválidas." });
    }

    const senhaCorreta = await authAdminService.verifyPassword(senha, admin.senha);

    if (!senhaCorreta) {
      await incrementFailure(lockoutKey);
      rateLimit.fail();
      return res.status(401).json({ message: "Credenciais inválidas." });
    }

    await resetFailures(lockoutKey);
    rateLimit.reset();

    if (admin.mfa_active && admin.mfa_secret) {
      const challengeId = authAdminService.createMfaChallenge(
        admin.id,
        req.ip,
        admin.mfa_secret
      );
      return res.status(200).json({ mfaRequired: true, challengeId });
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

    return res.status(200).json({
      message: "Login realizado com sucesso.",
      admin: {
        id: admin.id,
        email: admin.email,
        nome: admin.nome,
        role: admin.role,
        role_id: admin.role_id || null,
        permissions,
      },
    });
  } catch (err) {
    if (err.locked) {
      return res.status(429).json({ message: err.message });
    }
    rateLimit.fail();
    console.error("❌ Erro no login do admin:", err);
    return res
      .status(500)
      .json({ message: "Erro interno no servidor ao fazer login." });
  }
}

async function loginMfa(req, res, next) {
  const { challengeId, code } = req.body || {};

  if (!challengeId || !code) {
    return res
      .status(400)
      .json({ message: "challengeId e código são obrigatórios." });
  }

  const challenge = authAdminService.getMfaChallenge(challengeId);

  if (!challenge) {
    return res.status(401).json({ message: "Sessão de verificação inválida." });
  }

  if (challenge.ip && challenge.ip !== req.ip) {
    authAdminService.deleteMfaChallenge(challengeId);
    return res.status(401).json({ message: "Sessão de verificação inválida." });
  }

  if (Date.now() > challenge.expiresAt) {
    authAdminService.deleteMfaChallenge(challengeId);
    return res
      .status(401)
      .json({ message: "Sessão de verificação expirada. Faça login novamente." });
  }

  if (!speakeasy) {
    console.error("❌ speakeasy não instalado — MFA não pode ser validado");
    return res.status(500).json({ message: "Erro interno ao validar MFA." });
  }

  const codeValid = speakeasy.totp.verify({
    secret: challenge.mfaSecret,
    encoding: "base32",
    token: String(code).replace(/\s/g, ""),
    window: 1,
  });

  if (!codeValid) {
    req.rateLimit?.fail?.();
    return res.status(401).json({ message: "Credenciais inválidas." });
  }

  authAdminService.deleteMfaChallenge(challengeId);

  try {
    const admin = await authAdminService.findAdminById(challenge.adminId);

    if (!admin) {
      return res.status(401).json({ message: "Credenciais inválidas." });
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

    return res.status(200).json({
      message: "Login realizado com sucesso.",
      admin: {
        id: admin.id,
        email: admin.email,
        nome: admin.nome,
        role: admin.role,
        role_id: admin.role_id || null,
        permissions,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getMe(req, res) {
  try {
    const adminId = req.admin?.id;

    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Token inválido ou administrador não autenticado." });
    }

    const admin = await authAdminService.findAdminById(adminId);

    if (!admin) {
      return res.status(404).json({ message: "Admin não encontrado" });
    }

    const permissions = await authAdminService.getAdminPermissions(admin.id);

    return res.status(200).json({
      id: admin.id,
      nome: admin.nome,
      email: admin.email,
      role: admin.role,
      role_id: admin.role_id || null,
      permissions,
    });
  } catch (err) {
    console.error("❌ Erro ao carregar perfil do admin (/me):", err);
    return res
      .status(500)
      .json({ message: "Erro interno ao carregar perfil do admin." });
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

  return res.status(200).json({ message: "Logout realizado com sucesso." });
}

module.exports = { login, loginMfa, getMe, logout };
