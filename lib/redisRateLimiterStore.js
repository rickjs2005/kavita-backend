"use strict";

// lib/redisRateLimiterStore.js
// Redis-backed store for adaptiveRateLimiter.
// Implements the same { get, set, delete } interface as Map,
// but all methods return Promises (await-compatible).
//
// TTL is set to decayMs (default 15 min) so Redis auto-expires stale entries
// without needing a manual cleanup interval.

class RedisRateLimiterStore {
  /**
   * @param {import("ioredis").Redis} client - ioredis client instance
   * @param {object} [opts]
   * @param {string} [opts.prefix="rl:"] - Redis key prefix
   * @param {number} [opts.ttlMs=900000] - TTL in milliseconds (default: 15 min)
   */
  constructor(client, { prefix = "rl:", ttlMs = 900_000 } = {}) {
    this.client = client;
    this.prefix = prefix;
    this.ttlSec = Math.ceil(ttlMs / 1000);
  }

  async get(key) {
    try {
      const raw = await this.client.get(this.prefix + key);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }

  async set(key, value) {
    try {
      await this.client.set(
        this.prefix + key,
        JSON.stringify(value),
        "EX",
        this.ttlSec
      );
    } catch {
      // Silently ignore Redis errors — rate limiting degrades gracefully
    }
  }

  async delete(key) {
    try {
      await this.client.del(this.prefix + key);
    } catch {
      // Silently ignore
    }
  }
}

module.exports = RedisRateLimiterStore;
