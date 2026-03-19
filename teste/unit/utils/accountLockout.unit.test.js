/**
 * teste/unit/utils/accountLockout.unit.test.js
 *
 * Unit tests for utils/accountLockout.js
 *
 * Cobertura:
 * - Comportamento in-memory (NODE_ENV=test, sem Redis)
 * - Warning de produção quando Redis não está disponível (NODE_ENV=production + ioredis mock)
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

// -----------------------------------------------------------------------
// Visibilidade operacional: warning em produção quando Redis falha
// -----------------------------------------------------------------------
describe("accountLockout — production Redis warning", () => {
  const savedNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
    jest.resetModules();
  });

  test("emite console.warn em produção quando connect() falha", async () => {
    jest.resetModules();
    process.env.NODE_ENV = "production";

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // Suprimir console.info do ready event que não vai disparar
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    // Mock ioredis: connect rejeita imediatamente; sem evento "ready"
    const EventEmitter = require("events");
    jest.doMock("ioredis", () => {
      return class FakeRedis extends EventEmitter {
        constructor() { super(); }
        connect() {
          return Promise.reject(new Error("ECONNREFUSED"));
        }
      };
    });

    require("../../../utils/accountLockout");

    // Aguarda o microtask queue processar o .catch()
    await Promise.resolve();
    // Segundo tick para garantir que o handler disparou
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[accountLockout] Redis indisponível"),
      expect.stringContaining("Lockout NÃO persiste"),
      expect.any(String)
    );

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test("NÃO emite console.warn em desenvolvimento quando Redis falha", async () => {
    jest.resetModules();
    process.env.NODE_ENV = "development";

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const EventEmitter = require("events");
    jest.doMock("ioredis", () => {
      return class FakeRedis extends EventEmitter {
        constructor() { super(); }
        connect() {
          return Promise.reject(new Error("ECONNREFUSED"));
        }
      };
    });

    require("../../../utils/accountLockout");
    await Promise.resolve();
    await Promise.resolve();

    // Em dev, nenhum warn sobre Redis deve ser emitido pelo connect().catch()
    const redisWarns = warnSpy.mock.calls.filter(
      (args) => args[0] && String(args[0]).includes("[accountLockout]")
    );
    expect(redisWarns).toHaveLength(0);

    warnSpy.mockRestore();
  });

  test("emite console.warn quando Redis desconecta após estar conectado", () => {
    jest.resetModules();
    process.env.NODE_ENV = "production";

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    let capturedInstance;
    const EventEmitter = require("events");
    jest.doMock("ioredis", () => {
      return class FakeRedis extends EventEmitter {
        constructor() { super(); capturedInstance = this; }
        connect() { return Promise.resolve(); }
      };
    });

    require("../../../utils/accountLockout");

    // Simula Redis tendo ficado ready (redisReady = true)
    capturedInstance.emit("ready");

    // Agora simula erro de desconexão
    capturedInstance.emit("error", new Error("Connection reset by peer"));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[accountLockout] Redis desconectado:"),
      expect.stringContaining("Connection reset by peer"),
      expect.stringContaining("fallback in-memory")
    );

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
