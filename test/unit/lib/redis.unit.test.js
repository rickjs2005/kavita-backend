/**
 * test/unit/lib/redis.unit.test.js
 *
 * Testa lib/redis.js — cliente Redis centralizado.
 *
 * Cobertura:
 * - Exporta { client, ready } como getters
 * - ready=false quando ioredis não está disponível
 * - Warning em produção quando connect() falha
 * - Sem warning em desenvolvimento quando connect() falha
 * - Warning quando Redis desconecta após estar pronto (wasReady)
 * - Info log quando conecta com sucesso
 */

"use strict";

const REDIS_PATH = require.resolve("../../../lib/redis");

function loadRedis() {
  jest.resetModules();
  return require(REDIS_PATH);
}

describe("lib/redis — exports e comportamento base", () => {
  afterEach(() => {
    jest.resetModules();
  });

  test("exporta client e ready como propriedades", () => {
    const redis = loadRedis();
    expect(redis).toHaveProperty("client");
    expect(redis).toHaveProperty("ready");
  });

  test("ready é false por padrão quando ioredis não conecta (NODE_ENV=test)", () => {
    const redis = loadRedis();
    // Em NODE_ENV=test, connect() nunca é chamado → _ready permanece false
    expect(redis.ready).toBe(false);
  });

  test("client é null quando ioredis lança exceção no require", () => {
    jest.resetModules();
    jest.doMock("ioredis", () => {
      throw new Error("ioredis not installed");
    });
    const redis = require(REDIS_PATH);
    expect(redis.client).toBeNull();
    expect(redis.ready).toBe(false);
  });
});

// -----------------------------------------------------------------------
// Visibilidade operacional: warnings de conexão Redis
// -----------------------------------------------------------------------
describe("lib/redis — production Redis warnings", () => {
  const savedNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
    jest.resetModules();
  });

  test("emite console.warn em produção quando connect() falha", async () => {
    jest.resetModules();
    process.env.NODE_ENV = "production";

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    const EventEmitter = require("events");
    jest.doMock("ioredis", () => {
      return class FakeRedis extends EventEmitter {
        constructor() { super(); }
        connect() {
          return Promise.reject(new Error("ECONNREFUSED"));
        }
      };
    });

    require(REDIS_PATH);

    // Aguarda o microtask queue processar o .catch()
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[redis] Indisponível"),
      expect.any(String)
    );

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test("NÃO emite console.warn em desenvolvimento quando connect() falha", async () => {
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

    require(REDIS_PATH);
    await Promise.resolve();
    await Promise.resolve();

    const redisWarns = warnSpy.mock.calls.filter(
      (args) => args[0] && String(args[0]).includes("[redis]")
    );
    expect(redisWarns).toHaveLength(0);

    warnSpy.mockRestore();
  });

  test("emite console.warn quando Redis desconecta após estar pronto", () => {
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

    const redis = require(REDIS_PATH);

    // Simula conexão bem-sucedida → _ready = true
    capturedInstance.emit("ready");
    expect(redis.ready).toBe(true);

    // Simula desconexão
    capturedInstance.emit("error", new Error("Connection reset by peer"));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[redis] Desconectado:"),
      expect.stringContaining("Connection reset by peer"),
      expect.stringContaining("fallback in-memory")
    );
    expect(redis.ready).toBe(false);

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test("emite console.info quando conecta com sucesso", () => {
    jest.resetModules();

    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    let capturedInstance;
    const EventEmitter = require("events");
    jest.doMock("ioredis", () => {
      return class FakeRedis extends EventEmitter {
        constructor() { super(); capturedInstance = this; }
        connect() { return Promise.resolve(); }
      };
    });

    const redis = require(REDIS_PATH);
    capturedInstance.emit("ready");

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("[redis] Conectado.")
    );
    expect(redis.ready).toBe(true);

    infoSpy.mockRestore();
  });

  test("error event NÃO loga quando Redis nunca esteve conectado (wasReady=false)", () => {
    jest.resetModules();
    process.env.NODE_ENV = "production";

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    let capturedInstance;
    const EventEmitter = require("events");
    jest.doMock("ioredis", () => {
      return class FakeRedis extends EventEmitter {
        constructor() { super(); capturedInstance = this; }
        connect() { return Promise.resolve(); }
      };
    });

    require(REDIS_PATH);

    // Emite erro SEM ter emitido ready antes — wasReady=false
    capturedInstance.emit("error", new Error("ECONNREFUSED"));

    const redisWarnCalls = warnSpy.mock.calls.filter(
      (args) => args[0] && String(args[0]).includes("[redis] Desconectado")
    );
    expect(redisWarnCalls).toHaveLength(0);

    warnSpy.mockRestore();
  });
});
