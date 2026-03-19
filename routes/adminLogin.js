// routes/adminLogin.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/pool");
const logAdminAction = require("../utils/adminLogger");
const verifyAdmin = require("../middleware/verifyAdmin");
const createAdaptiveRateLimiter = require("../middleware/adaptiveRateLimiter");
const { assertNotLocked, incrementFailure, resetFailures, syncFromRedis } = require("../utils/accountLockout");
const { ADMIN_LOGIN_SCHEDULE } = require("../config/rateLimitSchedules");
require("dotenv").config();

const SECRET_KEY = process.env.JWT_SECRET;

// Verificação de segurança: impede que o servidor rode sem chave JWT definida
if (!SECRET_KEY) {
  throw new Error("❌ JWT_SECRET não definido no .env");
}

const COOKIE_NAME = "adminToken";
const COOKIE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Temporary in-memory store for MFA challenges: Map<challengeId, { adminId, ip, expiresAt, mfaSecret }>
const mfaChallenges = new Map();

// Periodic cleanup: remove expired MFA challenges every 5 minutes to prevent memory leaks
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    const now = Date.now();
    for (const [id, challenge] of mfaChallenges) {
      if (now > challenge.expiresAt) {
        mfaChallenges.delete(id);
      }
    }
  }, 5 * 60 * 1000).unref();
}

// Load speakeasy once at module load (optional dependency for MFA)
let speakeasy = null;
try { speakeasy = require("speakeasy"); } catch { /* optional */ }

const adminLoginRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const email = req.body && req.body.email
      ? String(req.body.email).trim().toLowerCase()
      : "anon";
    return `admin_login:${req.ip}:${email}`;
  },
  schedule: ADMIN_LOGIN_SCHEDULE,
});

const mfaRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const challengeId = req.body && req.body.challengeId
      ? String(req.body.challengeId).slice(0, 64)
      : "anon";
    return `admin_mfa:${req.ip}:${challengeId}`;
  },
  schedule: ADMIN_LOGIN_SCHEDULE,
});

/**
 * Carrega as permissões granulares do admin com base no role (slug).
 *
 * @param {number} adminId - ID do administrador
 * @returns {Promise<string[]>} - Lista de chaves de permissão (ex: ["admin.logs.view", "admin.config.edit"])
 */
async function getAdminPermissions(adminId) {
  if (!adminId) return [];

  const [rows] = await pool.query(
    `
      SELECT DISTINCT p.chave
      FROM admins a
      JOIN admin_roles r
        ON r.slug = a.role
      JOIN admin_role_permissions rp
        ON rp.role_id = r.id
      JOIN admin_permissions p
        ON p.id = rp.permission_id
      WHERE a.id = ?
    `,
    [adminId]
  );

  return rows.map((r) => r.chave);
}

/**
 * @openapi
 * /api/admin/login:
 *   post:
 *     tags: [Public, Login]
 *     summary: Realiza login de administrador e gera token JWT
 *     description: |
 *       Autentica um administrador pelo e-mail e senha, gera um token JWT com
 *       **id**, **email**, **role**, **role_id** e **permissions** e o envia em um
 *       **cookie HttpOnly (`adminToken`)**, recomendado para uso no painel admin.
 *       O token não é retornado no corpo da resposta.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, senha]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "admin@kavita.com"
 *               senha:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login bem-sucedido, retorna dados do admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Login realizado com sucesso."
 *                 admin:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     email:
 *                       type: string
 *                       example: "admin@kavita.com"
 *                     nome:
 *                       type: string
 *                       example: "Admin Master"
 *                     role:
 *                       type: string
 *                       example: "master"
 *                     role_id:
 *                       type: integer
 *                       nullable: true
 *                       example: 1
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example:
 *                         - "admin.logs.view"
 *                         - "admin.config.edit"
 *       400:
 *         description: Campos obrigatórios ausentes
 *       401:
 *         description: Credenciais inválidas
 *       429:
 *         description: Muitas tentativas. Tente novamente mais tarde.
 *       500:
 *         description: Erro interno no servidor
 */

// 📌 POST /api/admin/login — realiza login do administrador
router.post("/login", adminLoginRateLimiter, async (req, res) => {
  const { email, senha } = req.body || {};

  // Rate limiter is applied as middleware; access via req.rateLimit
  const rateLimit = req.rateLimit || { fail: () => {}, reset: () => {} };

  // 1. Validação básica
  if (!email || !senha) {
    rateLimit.fail();
    return res
      .status(400)
      .json({ message: "Email e senha são obrigatórios." });
  }

  const emailNormalizado = String(email).trim().toLowerCase();
  const lockoutKey = `admin:${emailNormalizado}`;

  try {
    // 2. Verifica lockout ANTES de validar credenciais.
    // syncFromRedis garante que lockouts persistidos no Redis sejam respeitados
    // na primeira tentativa após restart (sem Redis, vira no-op).
    await syncFromRedis(lockoutKey);
    assertNotLocked(lockoutKey);

    console.log("🔐 Tentativa de login de admin:", emailNormalizado);

    // 3. Busca o admin no banco de dados pelo email + role_id via admin_roles
    const [rows] = await pool.query(
      `
        SELECT
          a.id,
          a.nome,
          a.email,
          a.senha,
          a.role,
          a.mfa_secret,
          a.mfa_active,
          a.tokenVersion,
          r.id AS role_id
        FROM admins a
        LEFT JOIN admin_roles r
          ON r.slug = a.role
        WHERE a.email = ?
      `,
      [emailNormalizado]
    );

    if (!rows || rows.length === 0) {
      await incrementFailure(lockoutKey);
      rateLimit.fail();
      return res.status(401).json({ message: "Credenciais inválidas." });
    }

    const admin = rows[0];

    // 4. Compara a senha informada com a hash armazenada no banco
    const senhaCorreta = await bcrypt.compare(String(senha), admin.senha);

    if (!senhaCorreta) {
      await incrementFailure(lockoutKey);
      rateLimit.fail();
      return res.status(401).json({ message: "Credenciais inválidas." });
    }

    // 5. Credenciais válidas — reset lockout counter
    await resetFailures(lockoutKey);
    rateLimit.reset();

    // 6. Se MFA estiver ativo, emitir challengeId em vez do token completo
    if (admin.mfa_active && admin.mfa_secret) {
      const challengeId = crypto.randomBytes(32).toString("hex");
      mfaChallenges.set(challengeId, {
        adminId: admin.id,
        ip: req.ip,
        expiresAt: Date.now() + MFA_CHALLENGE_TTL_MS,
        mfaSecret: admin.mfa_secret,
      });

      return res.status(200).json({
        mfaRequired: true,
        challengeId,
      });
    }

    // 7. Carrega permissões corporativas para esse admin
    const permissions = await getAdminPermissions(admin.id);

    // 8. Gera o token JWT com role_id, role e permissions (2h de duração)
    const tokenPayload = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      role_id: admin.role_id || null,
      permissions,
      // ✅ FIX: usar 0 como fallback (não 1) para alinhar com verifyAdmin que usa 0
      tokenVersion: admin.tokenVersion ?? 0,
    };

    const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: "2h" });

    // 8.1 Atualiza último login no banco
    try {
      await pool.query(
        "UPDATE admins SET ultimo_login = NOW() WHERE id = ?",
        [admin.id]
      );
    } catch (updateErr) {
      console.warn(
        "⚠️ Não foi possível atualizar ultimo_login para admin:",
        admin.id,
        updateErr
      );
    }

    console.log("✅ Login bem-sucedido:", admin.email);

    // 9. Registra log de auditoria
    logAdminAction({
      adminId: admin.id,
      acao: "login_sucesso",
      entidade: "admin",
      entidadeId: admin.id,
    });

    // 10. Define cookie HttpOnly com o token JWT
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    };

    res.cookie(COOKIE_NAME, token, cookieOptions);

    // 11. Retorna dados do admin (token enviado apenas via cookie HttpOnly)
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
});

// 📌 POST /api/admin/login/mfa — verifica o código MFA usando o challengeId
router.post("/login/mfa", mfaRateLimiter, async (req, res) => {
  const { challengeId, code } = req.body || {};

  if (!challengeId || !code) {
    return res.status(400).json({ message: "challengeId e código são obrigatórios." });
  }

  const challenge = mfaChallenges.get(String(challengeId));

  if (!challenge) {
    return res.status(401).json({ message: "Sessão de verificação inválida." });
  }

  if (challenge.ip && challenge.ip !== req.ip) {
    mfaChallenges.delete(challengeId);
    return res.status(401).json({ message: "Sessão de verificação inválida." });
  }

  if (Date.now() > challenge.expiresAt) {
    mfaChallenges.delete(challengeId);
    return res.status(401).json({ message: "Sessão de verificação expirada. Faça login novamente." });
  }

  // Validate the TOTP code using speakeasy (loaded at module level)
  let codeValid = false;
  if (speakeasy) {
    codeValid = speakeasy.totp.verify({
      secret: challenge.mfaSecret,
      encoding: "base32",
      token: String(code).replace(/\s/g, ""),
      window: 1,
    });
  } else {
    // speakeasy not installed — MFA cannot be validated
    console.error("❌ speakeasy não instalado — MFA não pode ser validado");
    return res.status(500).json({ message: "Erro interno ao validar MFA." });
  }

  if (!codeValid) {
    req.rateLimit?.fail?.();
    return res.status(401).json({ message: "Credenciais inválidas." });
  }

  // Challenge is consumed — remove it
  mfaChallenges.delete(challengeId);

  // Load admin data to generate the JWT
  const [rows] = await pool.query(
    `
      SELECT
        a.id,
        a.nome,
        a.email,
        a.role,
        a.tokenVersion,
        r.id AS role_id
      FROM admins a
      LEFT JOIN admin_roles r
        ON r.slug = a.role
      WHERE a.id = ?
    `,
    [challenge.adminId]
  );

  if (!rows || rows.length === 0) {
    return res.status(401).json({ message: "Credenciais inválidas." });
  }

  const admin = rows[0];
  const permissions = await getAdminPermissions(admin.id);

  const tokenPayload = {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    role_id: admin.role_id || null,
    permissions,
    // ✅ FIX: usar 0 como fallback (não 1) para alinhar com verifyAdmin que usa 0
    tokenVersion: admin.tokenVersion ?? 0,
  };

  const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: "2h" });

  try {
    await pool.query("UPDATE admins SET ultimo_login = NOW() WHERE id = ?", [admin.id]);
  } catch { /* non-fatal */ }

  logAdminAction({
    adminId: admin.id,
    acao: "login_mfa_sucesso",
    entidade: "admin",
    entidadeId: admin.id,
  });

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  };

  res.cookie(COOKIE_NAME, token, cookieOptions);

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
});

/**
 * @openapi
 * /api/admin/me:
 *   get:
 *     tags: [Admin]
 *     summary: Retorna o administrador autenticado (perfil atual)
 *     description: >
 *       Retorna os dados do administrador autenticado com base no token JWT
 *       enviado em cookie HttpOnly (`adminToken`) ou no header Authorization.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do administrador autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 nome:
 *                   type: string
 *                   example: "Admin Master"
 *                 email:
 *                   type: string
 *                   example: "admin@kavita.com"
 *                 role:
 *                   type: string
 *                   example: "master"
 *                 role_id:
 *                   type: integer
 *                   nullable: true
 *                   example: 1
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example:
 *                     - "admin.logs.view"
 *                     - "admin.config.edit"
 *       401:
 *         description: Token ausente ou inválido
 *       404:
 *         description: Admin não encontrado
 *       500:
 *         description: Erro interno no servidor
 */

// 📌 GET /api/admin/me — retorna o administrador logado
router.get("/me", verifyAdmin, async (req, res) => {
  try {
    const adminId = req.admin && req.admin.id;

    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Token inválido ou administrador não autenticado." });
    }

    const [rows] = await pool.query(
      `
        SELECT
          a.id,
          a.nome,
          a.email,
          a.role,
          r.id AS role_id
        FROM admins a
        LEFT JOIN admin_roles r
          ON r.slug = a.role
        WHERE a.id = ?
      `,
      [adminId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Admin não encontrado" });
    }

    const admin = rows[0];

    // Recarrega as permissões para garantir que estejam atualizadas
    const permissions = await getAdminPermissions(admin.id);

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
});

/**
 * @openapi
 * /api/admin/logout:
 *   post:
 *     tags: [Admin]
 *     summary: Faz logout do administrador
 *     description: >
 *       Limpa o cookie HttpOnly (`adminToken`) e encerra a sessão do administrador.
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso.
 */
router.post("/logout", adminLoginRateLimiter, verifyAdmin, async (req, res) => {
  const clearOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };

  // Increment tokenVersion to invalidate all existing JWT tokens for this admin
  const adminId = req.admin?.id;
  if (adminId) {
    try {
      // ✅ FIX: COALESCE garante que NULL + 1 = 1 em vez de NULL (MySQL behavior)
      await pool.query(
        "UPDATE admins SET tokenVersion = COALESCE(tokenVersion, 0) + 1 WHERE id = ?",
        [adminId]
      );
    } catch (err) {
      console.warn("⚠️ Não foi possível incrementar tokenVersion para admin:", adminId, err);
    }
  }

  res.clearCookie(COOKIE_NAME, clearOptions);

  return res.status(200).json({
    message: "Logout realizado com sucesso.",
  });
});

module.exports = router;
