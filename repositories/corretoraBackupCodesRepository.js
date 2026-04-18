// repositories/corretoraBackupCodesRepository.js
//
// ETAPA 2.1 — backup codes do 2FA. Cada user tem ~10 códigos de 8
// chars, 1 uso cada. bcrypt hash no DB; plaintext só aparece no
// modal de setup (usuário copia/imprime e nunca mais vemos).
"use strict";

const pool = require("../config/pool");

async function replaceAllForUser({ userId, hashes }) {
  // Dentro da transação: apaga todos anteriores + insere novo batch.
  // Idempotente por chamada (regenerar também chama isto).
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "DELETE FROM corretora_user_backup_codes WHERE user_id = ?",
      [userId],
    );
    if (hashes.length > 0) {
      const values = hashes.map(() => "(?, ?)").join(", ");
      const params = [];
      for (const h of hashes) {
        params.push(userId, h);
      }
      await conn.query(
        `INSERT INTO corretora_user_backup_codes (user_id, code_hash)
         VALUES ${values}`,
        params,
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function listUnused(userId) {
  const [rows] = await pool.query(
    `SELECT id, code_hash FROM corretora_user_backup_codes
      WHERE user_id = ? AND used_at IS NULL`,
    [userId],
  );
  return rows;
}

async function markUsed(id) {
  const [result] = await pool.query(
    `UPDATE corretora_user_backup_codes
        SET used_at = NOW()
      WHERE id = ? AND used_at IS NULL`,
    [id],
  );
  return result.affectedRows;
}

async function countUnused(userId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM corretora_user_backup_codes
      WHERE user_id = ? AND used_at IS NULL`,
    [userId],
  );
  return Number(row?.total || 0);
}

async function deleteAllForUser(userId) {
  await pool.query(
    "DELETE FROM corretora_user_backup_codes WHERE user_id = ?",
    [userId],
  );
}

module.exports = {
  replaceAllForUser,
  listUnused,
  markUsed,
  countUnused,
  deleteAllForUser,
};
