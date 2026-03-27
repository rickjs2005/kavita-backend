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

const REDIS_PATH  = require.resolve("../../../lib/redis");
const LOGGER_PATH = require.resolve("../../../lib/logger");

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

  test("emite logger.warn em produção quando connect() falha", async () => {
    jest.resetModules();
    process.env.NODE_ENV = "production";

    const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.doMock(LOGGER_PATH, () => loggerMock);

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

    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "redis unavailable in production — in-memory fallback active"
    );
  });

  test("NÃO emite logger.warn em desenvolvimento quando connect() falha", async () => {
    jest.resetModules();
    process.env.NODE_ENV = "development";

    const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.doMock(LOGGER_PATH, () => loggerMock);

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

    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  test("emite logger.warn quando Redis desconecta após estar pronto", () => {
    jest.resetModules();
    process.env.NODE_ENV = "production";

    const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.doMock(LOGGER_PATH, () => loggerMock);

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

    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "redis disconnected — in-memory fallback active"
    );
    expect(redis.ready).toBe(false);
  });

  test("emite logger.info quando conecta com sucesso", () => {
    jest.resetModules();

    const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.doMock(LOGGER_PATH, () => loggerMock);

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

    expect(loggerMock.info).toHaveBeenCalledWith("redis connected");
    expect(redis.ready).toBe(true);
  });

  test("error event NÃO loga quando Redis nunca esteve conectado (wasReady=false)", () => {
    jest.resetModules();
    process.env.NODE_ENV = "production";

    const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.doMock(LOGGER_PATH, () => loggerMock);

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

    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});
