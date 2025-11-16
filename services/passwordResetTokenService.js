const crypto = require('crypto');
const pool = require('../config/pool');

const TABLE_NAME = 'password_reset_tokens';
let ensureTablePromise;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function ensureTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token_hash (token_hash),
        INDEX idx_user_expires (user_id, expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }
  await ensureTablePromise;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function revokeAllForUser(userId) {
  await ensureTable();
  await pool.execute(
    `UPDATE ${TABLE_NAME} SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
}

async function storeToken(userId, token, expiresAt) {
  await ensureTable();
  const tokenHash = hashToken(token);
  await pool.execute(
    `INSERT INTO ${TABLE_NAME} (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAt]
  );
  return tokenHash;
}

async function findValidToken(token) {
  await ensureTable();
  const tokenHash = hashToken(token);
  const [rows] = await pool.execute(
    `SELECT * FROM ${TABLE_NAME} WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function revokeToken(id) {
  await ensureTable();
  await pool.execute(
    `UPDATE ${TABLE_NAME} SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL`,
    [id]
  );
}

async function purgeExpired() {
  await ensureTable();
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
