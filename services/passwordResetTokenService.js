"use strict";

/**
 * services/passwordResetTokenService.js
 *
 * Gerencia tokens de reset de senha.
 * A tabela `password_reset_tokens` é criada pela migration
 * 2026022420502106-create-settings-tables-3977c29bbf.js — este serviço
 * assume que ela já existe.
 *
 * A coluna `scope` foi adicionada pela migration
 * 2026041000000003-add-scope-to-password-reset-tokens.js e permite
 * separar namespaces de user_id entre usuários comuns e corretora_users.
 *
 * Todas as funções aceitam um `scope` opcional com default `"user"`,
 * mantendo retrocompatibilidade com chamadas existentes.
 *
 * Interface pública:
 *   generateToken()                                         → string
 *   storeToken(userId, token, expiresAt, scope?)            → Promise<hash>
 *   findValidToken(token, scope?)                           → Promise<row|null>
 *   revokeToken(id)                                         → Promise<void>
 *   revokeAllForUser(userId, scope?)                        → Promise<void>
 *   purgeExpired()                                          → Promise<void>
 */

const crypto = require("crypto");
const pool = require("../config/pool");

const TABLE_NAME = "password_reset_tokens";
const DEFAULT_SCOPE = "user";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function revokeAllForUser(userId, scope = DEFAULT_SCOPE, conn = pool) {
  await conn.execute(
    `UPDATE ${TABLE_NAME}
       SET revoked_at = NOW()
     WHERE user_id = ? AND scope = ? AND revoked_at IS NULL`,
    [userId, scope]
  );
}

async function storeToken(userId, token, expiresAt, scope = DEFAULT_SCOPE, conn = pool) {
  const tokenHash = hashToken(token);
  await conn.execute(
    `INSERT INTO ${TABLE_NAME} (user_id, scope, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [userId, scope, tokenHash, expiresAt]
  );
  return tokenHash;
}

async function findValidToken(token, scope = DEFAULT_SCOPE) {
  const tokenHash = hashToken(token);
  const [rows] = await pool.execute(
    `SELECT * FROM ${TABLE_NAME}
     WHERE token_hash = ?
       AND scope = ?
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash, scope]
  );
  return rows[0] || null;
}

async function revokeToken(id) {
  await pool.execute(
    `UPDATE ${TABLE_NAME} SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL`,
    [id]
  );
}

async function purgeExpired() {
  await pool.execute(`DELETE FROM ${TABLE_NAME} WHERE expires_at <= NOW()`);
}

module.exports = {
  generateToken,
  storeToken,
  findValidToken,
  revokeToken,
  revokeAllForUser,
  purgeExpired,
};
