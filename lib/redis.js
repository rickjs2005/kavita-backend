"use strict";
// lib/redis.js
// Cliente Redis centralizado. Usado por:
//   - utils/accountLockout.js (lockout de login)
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
    console.info("[redis] Conectado.");
  });

  _client.on("error", (err) => {
    const wasReady = _ready;
    _ready = false;
    if (wasReady) {
      console.warn("[redis] Desconectado:", err.message, "— módulos com fallback in-memory assumem controle.");
    }
  });

  _client.on("end", () => { _ready = false; });

  if (process.env.NODE_ENV !== "test") {
    _client.connect().catch((err) => {
      _ready = false;
      if (process.env.NODE_ENV === "production") {
        console.warn(
          "[redis] Indisponível em produção — fallback in-memory ativo nos módulos dependentes.",
          err.message
        );
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
