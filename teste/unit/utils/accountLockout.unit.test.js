/**
 * teste/unit/utils/accountLockout.unit.test.js
 *
 * Unit tests for utils/accountLockout.js
 *
 * Cobertura:
 * - Comportamento in-memory (NODE_ENV=test, sem Redis)
 *
 * Nota: os testes de warning de Redis foram movidos para
 * teste/unit/lib/redis.unit.test.js após a migração de accountLockout.js
 * para usar lib/redis.js como cliente centralizado.
 */

"use strict";

// Import fresh instance each test by clearing module cache
function getLockout() {
  jest.resetModules();
  return require("../../../utils/accountLockout");
}

describe("accountLockout", () => {
  test("assertNotLocked does not throw for a new identifier", () => {
    const { assertNotLocked } = getLockout();
    expect(() => assertNotLocked("user:new@example.com")).not.toThrow();
  });

  test("incrementFailure below threshold does not lock the account", () => {
    const { assertNotLocked, incrementFailure } = getLockout();
    const key = "user:test1@example.com";

    incrementFailure(key);
    incrementFailure(key);
    incrementFailure(key);

    // Should not throw yet (below threshold of 5)
    expect(() => assertNotLocked(key)).not.toThrow();
  });

  test("account is locked after 5 failures", () => {
    const { assertNotLocked, incrementFailure } = getLockout();
    const key = "user:locked@example.com";

    for (let i = 0; i < 5; i++) {
      incrementFailure(key);
    }

    expect(() => assertNotLocked(key)).toThrow();
    const err = (() => {
      try { assertNotLocked(key); } catch (e) { return e; }
    })();
    expect(err.locked).toBe(true);
    expect(err.status).toBe(429);
    expect(err.message).toContain("bloqueada");
  });

  test("resetFailures clears the lockout", () => {
    const { assertNotLocked, incrementFailure, resetFailures } = getLockout();
    const key = "user:reset@example.com";

    for (let i = 0; i < 5; i++) {
      incrementFailure(key);
    }

    // Locked now
    expect(() => assertNotLocked(key)).toThrow();

    resetFailures(key);

    // No longer locked
    expect(() => assertNotLocked(key)).not.toThrow();
  });

  test("different identifiers have independent counters", () => {
    const { assertNotLocked, incrementFailure } = getLockout();

    const keyA = "user:a@example.com";
    const keyB = "user:b@example.com";

    for (let i = 0; i < 5; i++) {
      incrementFailure(keyA);
    }

    // A is locked, B is not
    expect(() => assertNotLocked(keyA)).toThrow();
    expect(() => assertNotLocked(keyB)).not.toThrow();
  });
});

