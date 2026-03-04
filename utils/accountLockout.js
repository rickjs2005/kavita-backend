// utils/accountLockout.js
// In-memory account lockout store.
// For production, replace with Redis or a DB-backed store.

const MAX_FAILURES = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Map<identifier, { failures: number, lockedUntil: number|null }>
const store = new Map();

function _getEntry(identifier) {
  const entry = store.get(identifier);
  if (!entry) return { failures: 0, lockedUntil: null };
  return entry;
}

function _setEntry(identifier, entry) {
  store.set(identifier, entry);
}

/**
 * Throws a 429-style error object if the identifier is currently locked out.
 * Does NOT increment the failure counter.
 *
 * @param {string} identifier - e.g. "email:user@domain.com" or "ip:1.2.3.4"
 * @throws {{ locked: true, message: string }}
 */
function assertNotLocked(identifier) {
  const entry = _getEntry(identifier);
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

  // If the lockout window expired, clean up
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    store.delete(identifier);
  }
}

/**
 * Records a failed login attempt. Locks the account after MAX_FAILURES attempts.
 *
 * @param {string} identifier
 */
function incrementFailure(identifier) {
  const entry = _getEntry(identifier);
  const failures = (entry.failures || 0) + 1;
  const lockedUntil = failures >= MAX_FAILURES ? Date.now() + LOCKOUT_WINDOW_MS : null;
  _setEntry(identifier, { failures, lockedUntil });
}

/**
 * Clears all failure records for an identifier (call on successful login).
 *
 * @param {string} identifier
 */
function resetFailures(identifier) {
  store.delete(identifier);
}

module.exports = { assertNotLocked, incrementFailure, resetFailures };
