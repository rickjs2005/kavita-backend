// services/authAdminService.js
const pool = require("../config/pool");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const redis = require("../lib/redis");

const COOKIE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Permission cache TTL: 60 s — curto o suficiente para que mudanças de role
// propaguem rapidamente sem sacrificar a redução de queries ao banco.
const PERM_CACHE_TTL_SEC = 60;

function permCacheKey(adminId, tokenVersion) {
  return `admin:perm:${adminId}:${tokenVersion ?? 0}`;
}

// Temporary in-memory store for MFA challenges
// Map<challengeId, { adminId, ip, expiresAt, mfaSecret }>
const mfaChallenges = new Map();

// Periodic cleanup — skipped in test environment to prevent open handles
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

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

async function findAdminByEmail(email) {
  const [rows] = await pool.query(
    `SELECT
       a.id,
       a.nome,
       a.email,
       a.senha,
       a.role,
       a.ativo,
       a.mfa_secret,
       a.mfa_active,
       a.tokenVersion,
       r.id AS role_id
     FROM admins a
     LEFT JOIN admin_roles r ON r.slug = a.role
     WHERE a.email = ?`,
    [email]
  );
  return rows[0] ?? null;
}

/**
 * Busca admin por ID, incluindo campo `ativo`.
 * Usado tanto no middleware verifyAdmin quanto no controller de auth.
 */
async function findAdminById(id) {
  const [rows] = await pool.query(
    `SELECT
       a.id,
       a.nome,
       a.email,
       a.role,
       a.ativo,
       a.tokenVersion,
       r.id AS role_id
     FROM admins a
     LEFT JOIN admin_roles r ON r.slug = a.role
     WHERE a.id = ?`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Carrega permissões granulares do admin.
 * Usa cache Redis quando disponível (TTL: PERM_CACHE_TTL_SEC).
 * A chave inclui tokenVersion para que o cache seja naturalmente
 * invalidado após logout (o token antigo nunca mais é enviado).
 *
 * @param {number} adminId
 * @param {number} [tokenVersion] — versão atual do token (para cache key)
 */
async function getAdminPermissions(adminId, tokenVersion) {
  if (!adminId) return [];

  const cacheKey = permCacheKey(adminId, tokenVersion);

  // Tenta ler do cache Redis
  if (redis.ready) {
    try {
      const cached = await redis.client.get(cacheKey);
      if (cached !== null) {
        return JSON.parse(cached);
      }
    } catch {
      // Cache miss — segue para o banco
    }
  }

  const [rows] = await pool.query(
    `SELECT DISTINCT p.chave
     FROM admins a
     JOIN admin_roles r ON r.slug = a.role
     JOIN admin_role_permissions rp ON rp.role_id = r.id
     JOIN admin_permissions p ON p.id = rp.permission_id
     WHERE a.id = ?`,
    [adminId]
  );

  const permissions = rows.map((r) => r.chave);

  // Armazena no Redis (fire-and-forget — não derruba o request se falhar)
  if (redis.ready) {
    redis.client
      .set(cacheKey, JSON.stringify(permissions), "EX", PERM_CACHE_TTL_SEC)
      .catch(() => {});
  }

  return permissions;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function verifyPassword(plain, hash) {
  return bcrypt.compare(String(plain), hash);
}

function buildTokenPayload(admin, permissions) {
  return {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    role_id: admin.role_id || null,
    permissions,
    tokenVersion: admin.tokenVersion ?? 0,
  };
}

function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "2h" });
}

async function updateLastLogin(adminId) {
  try {
    await pool.query(
      "UPDATE admins SET ultimo_login = NOW() WHERE id = ?",
      [adminId]
    );
  } catch (err) {
    console.warn(
      "⚠️ Não foi possível atualizar ultimo_login para admin:",
      adminId,
      err
    );
  }
}

async function incrementTokenVersion(adminId) {
  await pool.query(
    "UPDATE admins SET tokenVersion = COALESCE(tokenVersion, 0) + 1 WHERE id = ?",
    [adminId]
  );
}

// ---------------------------------------------------------------------------
// MFA challenge store
// ---------------------------------------------------------------------------

function createMfaChallenge(adminId, ip, mfaSecret) {
  const challengeId = crypto.randomBytes(32).toString("hex");
  mfaChallenges.set(challengeId, {
    adminId,
    ip,
    expiresAt: Date.now() + MFA_CHALLENGE_TTL_MS,
    mfaSecret,
  });
  return challengeId;
}

function getMfaChallenge(challengeId) {
  return mfaChallenges.get(String(challengeId)) ?? null;
}

function deleteMfaChallenge(challengeId) {
  mfaChallenges.delete(String(challengeId));
}

module.exports = {
  findAdminByEmail,
  findAdminById,
  getAdminPermissions,
  verifyPassword,
  buildTokenPayload,
  generateToken,
  updateLastLogin,
  incrementTokenVersion,
  createMfaChallenge,
  getMfaChallenge,
  deleteMfaChallenge,
  COOKIE_MAX_AGE_MS,
  MFA_CHALLENGE_TTL_MS,
};
