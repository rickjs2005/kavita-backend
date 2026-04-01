// services/authAdminService.js
const adminRepo = require("../repositories/adminRepository");
const { logger } = require("../lib");
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

// Fallback in-memory store for MFA challenges (used when Redis is unavailable)
// Map<challengeId, { adminId, ip, expiresAt, mfaSecret }>
const mfaChallenges = new Map();

// ---------------------------------------------------------------------------
// Queries — delegadas a adminRepository
// ---------------------------------------------------------------------------

async function findAdminByEmail(email) {
  return adminRepo.findAdminByEmail(email);
}

/**
 * Busca admin por ID, incluindo campo `ativo`.
 * Usado tanto no middleware verifyAdmin quanto no controller de auth.
 */
async function findAdminById(id) {
  return adminRepo.findAdminById(id);
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

  const permissions = await adminRepo.findAdminPermissions(adminId);

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
    await adminRepo.updateLastLogin(adminId);
  } catch (err) {
    logger.warn({ adminId, err }, "Não foi possível atualizar ultimo_login");
  }
}

async function incrementTokenVersion(adminId) {
  return adminRepo.incrementTokenVersion(adminId);
}

// ---------------------------------------------------------------------------
// MFA challenge store — Redis primary, in-memory Map fallback
// ---------------------------------------------------------------------------

const MFA_CHALLENGE_TTL_SEC = MFA_CHALLENGE_TTL_MS / 1000; // 300 s

function mfaKey(challengeId) {
  return `mfa:challenge:${challengeId}`;
}

async function createMfaChallenge(adminId, ip, mfaSecret) {
  const challengeId = crypto.randomBytes(32).toString("hex");
  const payload = { adminId, ip, expiresAt: Date.now() + MFA_CHALLENGE_TTL_MS, mfaSecret };

  if (redis.ready) {
    try {
      await redis.client.set(mfaKey(challengeId), JSON.stringify(payload), "EX", MFA_CHALLENGE_TTL_SEC);
      return challengeId;
    } catch {
      // Fall through to in-memory
    }
  }

  mfaChallenges.set(challengeId, payload);
  return challengeId;
}

async function getMfaChallenge(challengeId) {
  const key = mfaKey(String(challengeId));

  if (redis.ready) {
    try {
      const raw = await redis.client.get(key);
      if (raw !== null) return JSON.parse(raw);
    } catch {
      // Fall through to in-memory
    }
  }

  return mfaChallenges.get(String(challengeId)) ?? null;
}

async function deleteMfaChallenge(challengeId) {
  if (redis.ready) {
    try {
      await redis.client.del(mfaKey(String(challengeId)));
    } catch {
      // Best-effort — key will expire via TTL
    }
  }
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
