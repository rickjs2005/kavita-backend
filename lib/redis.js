"use strict";
// lib/redis.js
// Cliente Redis único compartilhado por todo o projeto:
//   - utils/accountLockout.js  (lockout de login)
//   - middleware/adaptiveRateLimiter.js (rate limiting)
//   - routes/adminLogin.js (MFA challenges)
//
// USO:
//   const { client: redis, ready: redisReady } = require("../lib/redis");
//   if (redisReady) await redis.set("chave", "valor", "EX", 60);
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

  _client.on("ready", () => { _ready = true;  });
  _client.on("error", () => { _ready = false; });
  _client.on("end",   () => { _ready = false; });

  if (process.env.NODE_ENV !== "test") {
    _client.connect().catch(() => { _ready = false; });
  }
} catch {
  _client = null;
  _ready  = false;
}

module.exports = {
  get client() { return _client; },
  get ready()  { return _ready;  },
};
