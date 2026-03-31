"use strict";

/**
 * services/passwordResetTokenService.js
 *
 * Gerencia tokens de reset de senha.
 * A tabela `password_reset_tokens` é criada pela migration
 * 2026022420502106-create-settings-tables-3977c29bbf.js — este serviço
 * assume que ela já existe.
 *
 * Interface pública:
 *   generateToken()                          → string (hex 64 chars)
 *   storeToken(userId, token, expiresAt)     → Promise<tokenHash>
 *   findValidToken(token)                    → Promise<row | null>
 *   revokeToken(id)                          → Promise<void>
 *   revokeAllForUser(userId)                 → Promise<void>
 *   purgeExpired()                           → Promise<void>
 */

const crypto = require("crypto");
const pool = require("../config/pool");

const TABLE_NAME = "password_reset_tokens";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function revokeAllForUser(userId) {
  await pool.execute(
    `UPDATE ${TABLE_NAME} SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
}

async function storeToken(userId, token, expiresAt) {
  const tokenHash = hashToken(token);
  await pool.execute(
    `INSERT INTO ${TABLE_NAME} (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAt]
  );
  return tokenHash;
}

async function findValidToken(token) {
  const tokenHash = hashToken(token);
  const [rows] = await pool.execute(
    `SELECT * FROM ${TABLE_NAME} WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
    [tokenHash]
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
