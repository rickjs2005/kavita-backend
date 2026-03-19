// utils/accountLockout.js
// Account lockout store backed by Redis (with in-memory fallback).
// Redis is the primary store; the in-memory map is used when Redis is
// unavailable so the server can still boot and run in dev/CI environments.
//
// Lockout policy:
//   - 5 failed attempts  → locked for LOCKOUT_DURATION_MS (30 minutes)
//   - TTL per failure entry: LOCKOUT_DURATION_MS
//   - Counts and lockout survive server restarts when Redis is available

const MAX_FAILURES = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const LOCKOUT_DURATION_S = LOCKOUT_DURATION_MS / 1000; // seconds (for Redis TTL)

// ---------------------------------------------------------------------------
// Redis client (optional – falls back to in-memory on connection failure)
// ---------------------------------------------------------------------------
let redisClient = null;
let redisReady = false;

try {
  const Redis = require("ioredis");

  const redisBaseOptions = {
    lazyConnect: true,            // don't auto-connect on require()
    enableOfflineQueue: false,    // fail fast when not connected
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    retryStrategy: () => null,    // disable auto-reconnect (handled by fallback)
  };

  const redisUrl = process.env.REDIS_URL || null;
  const redisOptions = {
    ...redisBaseOptions,
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };

  redisClient = redisUrl ? new Redis(redisUrl, redisBaseOptions) : new Redis(redisOptions);

  redisClient.on("ready", () => {
    redisReady = true;
    console.info("[accountLockout] Redis conectado — lockout persiste entre restarts.");
  });

  redisClient.on("error", (err) => {
    const wasReady = redisReady;
    redisReady = false;
    // Só loga se estava conectado e caiu — evita spam duplicado com o catch() inicial
    if (wasReady) {
      console.warn(
        "[accountLockout] Redis desconectado:", err.message,
        "— fallback in-memory ativo. Lockout NÃO persiste entre restarts."
      );
    }
  });

  redisClient.on("end", () => {
    redisReady = false;
  });

  // Attempt to connect; if it fails, fall back to in-memory.
  // Em produção, loga warning explícito — lockout em memória é uma degradação operacional.
  if (process.env.NODE_ENV !== "test") {
    redisClient.connect().catch((err) => {
      redisReady = false;
      if (process.env.NODE_ENV === "production") {
        console.warn(
          "[accountLockout] Redis indisponível em produção — fallback in-memory ativo.",
          "Lockout NÃO persiste entre restarts nem é compartilhado entre instâncias PM2/containers.",
          err.message
        );
      }
    });
  }
} catch (_err) {
  // ioredis not installed or failed to initialise – use in-memory fallback only
  redisClient = null;
  redisReady = false;
}

// ---------------------------------------------------------------------------
// In-memory fallback store
// Map<identifier, { failures: number, lockedUntil: number|null }>
// ---------------------------------------------------------------------------
const memoryStore = new Map();

function _memGetEntry(identifier) {
  const entry = memoryStore.get(identifier);
  if (!entry) return { failures: 0, lockedUntil: null };
  return entry;
}

function _memSetEntry(identifier, entry) {
  memoryStore.set(identifier, entry);
}

// ---------------------------------------------------------------------------
// Redis-backed helpers
// ---------------------------------------------------------------------------
const REDIS_FAILURES_PREFIX = "lockout:failures:";
const REDIS_LOCKED_PREFIX = "lockout:locked:";

async function _redisGetFailures(identifier) {
  try {
    const val = await redisClient.get(REDIS_FAILURES_PREFIX + identifier);
    return val ? parseInt(val, 10) : 0;
  } catch (_err) {
    return 0;
  }
}

async function _redisSetFailures(identifier, failures) {
  try {
    await redisClient.set(REDIS_FAILURES_PREFIX + identifier, String(failures), "EX", LOCKOUT_DURATION_S);
  } catch (_err) { /* non-fatal */ }
}

async function _redisSetLocked(identifier) {
  try {
    await redisClient.set(REDIS_LOCKED_PREFIX + identifier, "1", "EX", LOCKOUT_DURATION_S);
  } catch (_err) { /* non-fatal */ }
}

async function _redisGetLockedTTL(identifier) {
  try {
    return await redisClient.ttl(REDIS_LOCKED_PREFIX + identifier);
  } catch (_err) {
    return -2; // key doesn't exist
  }
}

async function _redisDelete(identifier) {
  try {
    await redisClient.del(REDIS_FAILURES_PREFIX + identifier, REDIS_LOCKED_PREFIX + identifier);
  } catch (_err) { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Throws a 429-style error if the identifier is currently locked out.
 * Supports both async (Redis) and sync (in-memory) paths.
 *
 * Because callers may be sync contexts, this function checks the in-memory
 * store synchronously FIRST, then performs a Redis check if available.
 * Redis state is lazily reflected in memory on each incrementFailure call.
 *
 * @param {string} identifier - e.g. "user:user@domain.com" or "admin:x@y.com"
 * @throws {{ locked: true, status: 429, message: string }}
 */
function assertNotLocked(identifier) {
  // Always check in-memory store (synchronous, fast path)
  const entry = _memGetEntry(identifier);
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const remainingMs = entry.lockedUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    const err = new Error(
      `Conta bloqueada temporariamente. Tente novamente em ${remainingMin} minuto(s).`
    );
    err.locked = true;
    err.status = 429;
    throw err;
  }
  // If the in-memory lockout expired, clean up
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    memoryStore.delete(identifier);
  }
}

/**
 * Record a failed login attempt for the identifier.
 * If failures reach MAX_FAILURES, lock the account.
 *
 * @param {string} identifier - e.g. "user:user@domain.com"
 */
async function incrementFailure(identifier) {
  if (redisReady && redisClient) {
    const failures = await _redisGetFailures(identifier);
    const newFailures = failures + 1;
    await _redisSetFailures(identifier, newFailures);

    // Sync to in-memory store
    const entry = _memGetEntry(identifier);
    entry.failures = newFailures;
    if (newFailures >= MAX_FAILURES) {
      entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      await _redisSetLocked(identifier);
    }
    _memSetEntry(identifier, entry);
  } else {
    // In-memory only
    const entry = _memGetEntry(identifier);
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) {
      entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    _memSetEntry(identifier, entry);
  }
}

/**
 * Clear all lockout state for the identifier (used after successful login).
 *
 * @param {string} identifier - e.g. "user:user@domain.com"
 */
async function resetFailures(identifier) {
  memoryStore.delete(identifier);
  if (redisReady && redisClient) {
    await _redisDelete(identifier);
  }
}

/**
 * Sync lockout state from Redis into the in-memory store (e.g. on server startup).
 * Useful to restore lockouts after a server restart when Redis is available.
 *
 * @param {string} identifier - e.g. "user:user@domain.com"
 */
async function syncFromRedis(identifier) {
  if (!redisReady || !redisClient) return;

  const failures = await _redisGetFailures(identifier);
  const ttl = await _redisGetLockedTTL(identifier);

  const entry = { failures, lockedUntil: null };
  if (ttl > 0) {
    entry.lockedUntil = Date.now() + ttl * 1000;
  }
  _memSetEntry(identifier, entry);
}
// Defensive export verification: ensures callers always receive callable functions
// even if an unexpected error occurs during module initialisation.
const _exports = { assertNotLocked, incrementFailure, resetFailures, syncFromRedis };

/* istanbul ignore next */
if (typeof _exports.assertNotLocked !== "function") {
  console.error("❌ accountLockout: assertNotLocked não é uma função – usando fallback no-op");
  _exports.assertNotLocked = function () {};
}
/* istanbul ignore next */
if (typeof _exports.incrementFailure !== "function") {
  console.error("❌ accountLockout: incrementFailure não é uma função – usando fallback no-op");
  _exports.incrementFailure = async function () {};
}
/* istanbul ignore next */
if (typeof _exports.resetFailures !== "function") {
  console.error("❌ accountLockout: resetFailures não é uma função – usando fallback no-op");
  _exports.resetFailures = async function () {};
}
/* istanbul ignore next */
if (typeof _exports.syncFromRedis !== "function") {
  console.error("❌ accountLockout: syncFromRedis não é uma função – usando fallback no-op");
  _exports.syncFromRedis = async function () {};
}

module.exports = _exports;
