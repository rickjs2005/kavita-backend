"use strict";
// lib/redis.js
// Cliente Redis centralizado — disponível para uso futuro via:
//   const { client: redis, ready: redisReady } = require("../lib/redis");
//   if (redisReady) await redis.set("chave", "valor", "EX", 60);
//
// ATENÇÃO: este módulo NÃO é importado por nenhum módulo ativo atualmente.
//   - utils/accountLockout.js gerencia seu próprio cliente Redis independente.
//   - middleware/adaptiveRateLimiter.js usa Map in-memory (store Redis-backed bloqueado por interface síncrona).
//   - routes/adminLogin.js não usa Redis diretamente.
//
// Próxima ação recomendada: migrar accountLockout.js para usar este cliente compartilhado
// em vez de criar sua própria conexão. Isso elimina a conexão duplicada.
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
