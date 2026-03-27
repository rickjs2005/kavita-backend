"use strict";
// lib/redis.js
const logger = require("./logger");
// Cliente Redis centralizado. Usado por:
//   - security/accountLockout.js (lockout de login)
//
// Uso em outros módulos:
//   const redis = require("../lib/redis");
//   if (redis.ready) await redis.client.set("chave", "valor", "EX", 60);
//
// Pendente:
//   - middleware/adaptiveRateLimiter.js ainda usa Map in-memory
//     (bloqueador: interface de store é síncrona; Redis é assíncrono)
//
// O app sobe normalmente mesmo sem Redis — fallback in-memory em cada módulo.

let _client = null;
let _ready  = false;

try {
  const Redis = require("ioredis");

  const BASE = {
    lazyConnect:          true,
    enableOfflineQueue:   false,
    maxRetriesPerRequest: 1,
    connectTimeout:       3_000,
    retryStrategy:        () => null, // sem auto-reconexão — failover manual
  };

  _client = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, BASE)
    : new Redis({
        ...BASE,
        host:     process.env.REDIS_HOST     || "127.0.0.1",
        port:     Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD  || undefined,
      });

  _client.on("ready", () => {
    _ready = true;
    logger.info("redis connected");
  });

  _client.on("error", (err) => {
    const wasReady = _ready;
    _ready = false;
    if (wasReady) {
      logger.warn({ err }, "redis disconnected — in-memory fallback active");
    }
  });

  _client.on("end", () => { _ready = false; });

  if (process.env.NODE_ENV !== "test") {
    _client.connect().catch((err) => {
      _ready = false;
      if (process.env.NODE_ENV === "production") {
        logger.warn({ err }, "redis unavailable in production — in-memory fallback active");
      }
    });
  }
} catch {
  _client = null;
  _ready  = false;
}

module.exports = {
  get client() { return _client; },
  get ready()  { return _ready;  },
};
