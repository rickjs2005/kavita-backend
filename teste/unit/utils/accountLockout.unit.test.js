/**
 * teste/unit/utils/accountLockout.unit.test.js
 *
 * Unit tests for utils/accountLockout.js
 *
 * Cobertura:
 * - Comportamento in-memory (NODE_ENV=test, sem Redis)
 * - syncFromRedis: no-op sem Redis disponível
 * - syncFromRedis: popula in-memory com lockout do Redis (simula restart)
 *
 * Nota: os testes de warning de Redis foram movidos para
 * teste/unit/lib/redis.unit.test.js após a migração de accountLockout.js
 * para usar lib/redis.js como cliente centralizado.
 */

"use strict";

// Import fresh instance each test by clearing module cache
function getLockout() {
  jest.resetModules();
  return require("../../../security/accountLockout");
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

// -----------------------------------------------------------------------
// syncFromRedis: restaura lockout do Redis para in-memory (cenário pós-restart)
// -----------------------------------------------------------------------
describe("accountLockout — syncFromRedis", () => {
  afterEach(() => {
    jest.resetModules();
  });

  test("syncFromRedis é no-op quando Redis não está disponível (redis.ready=false)", async () => {
    jest.resetModules();
    // lib/redis.js em NODE_ENV=test retorna ready=false — comportamento padrão
    const { syncFromRedis, assertNotLocked } = require("../../../security/accountLockout");
    const key = "user:noop-sync@test.com";

    await syncFromRedis(key); // deve retornar sem fazer nada
    expect(() => assertNotLocked(key)).not.toThrow();
  });

  test("syncFromRedis popula in-memory com lockout do Redis e assertNotLocked lança (simula restart)", async () => {
    jest.resetModules();

    // Simula lib/redis.js com cliente conectado e lockout ativo no Redis
    jest.doMock("../../../lib/redis", () => ({
      get ready() { return true; },
      get client() {
        return {
          // Redis tem 5 falhas para esta chave
          get: async (key) => key.includes("failures:") ? "5" : null,
          // Redis tem lockout ativo com TTL de ~30min
          ttl: async (key) => key.includes("locked:") ? 1799 : -2,
        };
      },
    }));

    const { syncFromRedis, assertNotLocked } = require("../../../security/accountLockout");
    const key = "user:restart-locked@test.com";

    // In-memory está vazia (simula restart), Redis tem o lockout
    // Antes do sync: não lança
    expect(() => assertNotLocked(key)).not.toThrow();

    // Sync popula in-memory com o estado do Redis
    await syncFromRedis(key);

    // Após o sync: deve lançar com locked=true
    const err = (() => { try { assertNotLocked(key); } catch (e) { return e; } })();
    expect(err).toBeDefined();
    expect(err.locked).toBe(true);
    expect(err.status).toBe(429);
    expect(err.message).toContain("bloqueada");
  });

  test("syncFromRedis é no-op quando Redis não tem lockout para a chave (TTL=-2)", async () => {
    jest.resetModules();

    // Redis disponível mas sem lockout para essa chave
    jest.doMock("../../../lib/redis", () => ({
      get ready() { return true; },
      get client() {
        return {
          get: async () => null,   // sem failures
          ttl: async () => -2,    // chave inexistente
        };
      },
    }));

    const { syncFromRedis, assertNotLocked } = require("../../../security/accountLockout");
    const key = "user:no-lockout@test.com";

    await syncFromRedis(key);
    expect(() => assertNotLocked(key)).not.toThrow();
  });
});

