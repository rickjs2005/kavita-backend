// utils/accountLockout.js
/**
 * Account lockout com Redis fallback para memória.
 * 
 * Métodos:
 * - assertNotLocked(identifier): verifica se está bloqueado (sem incrementar)
 * - incrementFailure(identifier): incrementa contador de falha
 * - resetFailures(identifier): limpa em login bem-sucedido
 */

class AccountLockout {
  constructor(redisClient = null) {
    this.redis = redisClient;
    this.inMemoryStore = new Map();

    this.MAX_FAILURES = 5;
    this.LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 min
    this.RESET_AFTER_MS = 60 * 60 * 1000; // 1h sem tentativas = reset
  }

  _lockoutKey(identifier) {
    return `lockout:${identifier}`;
  }

  /**
   * ✅ Check se está bloqueado (sem incrementar).
   * Lança erro se bloqueado.
   */
  async assertNotLocked(identifier) {
    const key = this._lockoutKey(identifier);
    const state = this.redis
      ? await this._getState_Redis(key)
      : this._getState_Memory(key);

    if (!state) return; // Não tem bloqueio

    const now = Date.now();

    // Lockout expirou?
    if (state.lockedUntil && state.lockedUntil <= now) {
      // Limpou automaticamente
      if (this.redis) {
        await this.redis.del(key);
      } else {
        this.inMemoryStore.delete(key);
      }
      return;
    }

    // Está bloqueado
    if (state.lockedUntil && state.lockedUntil > now) {
      const error = new Error("Account is locked due to too many failed attempts.");
      error.code = "ACCOUNT_LOCKED";
      error.retryAfterMs = state.lockedUntil - now;
      throw error;
    }
  }

  /**
   * ✅ Incrementar falha (chamar APÓS confirmar credenciais inválidas).
   */
  async incrementFailure(identifier) {
    const key = this._lockoutKey(identifier);

    if (this.redis) {
      return this._incrementFailure_Redis(key);
    } else {
      return this._incrementFailure_Memory(key);
    }
  }

  async _incrementFailure_Redis(key) {
    try {
      const data = await this.redis.get(key);
      let state = data ? JSON.parse(data) : { failures: 0, lockedUntil: 0, lastFailure: 0 };

      state.failures += 1;
      state.lastFailure = Date.now();

      // Block if max reached
      if (state.failures >= this.MAX_FAILURES) {
        state.lockedUntil = Date.now() + this.LOCKOUT_DURATION_MS;
      }

      await this.redis.setex(
        key,
        Math.ceil((this.LOCKOUT_DURATION_MS + 3600000) / 1000),
        JSON.stringify(state)
      );
    } catch (err) {
      console.warn("⚠️ Redis error in incrementFailure; using memory fallback:", err.message);
      this._incrementFailure_Memory(key);
    }
  }

  _incrementFailure_Memory(key) {
    const now = Date.now();
    let state = this.inMemoryStore.get(key) || {
      failures: 0,
      lockedUntil: 0,
      lastFailure: 0,
    };

    // Auto-reset se expirou
    if (state.lastFailure && now - state.lastFailure > this.RESET_AFTER_MS) {
      state.failures = 0;
      state.lockedUntil = 0;
    }

    state.failures += 1;
    state.lastFailure = now;

    if (state.failures >= this.MAX_FAILURES) {
      state.lockedUntil = now + this.LOCKOUT_DURATION_MS;
    }

    this.inMemoryStore.set(key, state);
  }

  /**
   * ✅ Reset em login bem-sucedido.
   */
  async resetFailures(identifier) {
    const key = this._lockoutKey(identifier);

    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (err) {
        console.warn("⚠️ Redis error in resetFailures:", err.message);
        this.inMemoryStore.delete(key);
      }
    } else {
      this.inMemoryStore.delete(key);
    }
  }

  /**
   * Helper: get state (Redis).
   */
  async _getState_Redis(key) {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.warn("⚠️ Redis error in getState:", err.message);
      return null;
    }
  }

  /**
   * Helper: get state (Memory).
   */
  _getState_Memory(key) {
    return this.inMemoryStore.get(key) || null;
  }

  async getState(identifier) {
    const key = this._lockoutKey(identifier);
    return this.redis
      ? this._getState_Redis(key)
      : this._getState_Memory(key);
  }
}

module.exports = AccountLockout;