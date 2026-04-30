"use strict";

// repositories/adminBackupCodesRepository.js
//
// Acesso a `admin_backup_codes`. Usado por services/adminTotpService
// no fluxo de setup, regenerate e consume de backup codes.
//
// Convenção: hashes bcrypt vêm prontos do service. Repository NÃO
// hashea — separação de camadas.

const pool = require("../config/pool");

/**
 * Substitui todos os backup codes do admin por um novo conjunto.
 * Idempotente: roda dentro de uma transação curta (DELETE + INSERT N).
 */
async function replaceAllForAdmin({ adminId, hashes }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM admin_backup_codes WHERE admin_id = ?", [adminId]);
    if (Array.isArray(hashes) && hashes.length > 0) {
      const values = hashes.map((h) => [adminId, h]);
      await conn.query(
        "INSERT INTO admin_backup_codes (admin_id, code_hash) VALUES ?",
        [values]
      );
    }
    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* noop */ }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Lista codes não usados do admin. Usado pelo service no consumo
 * (compara um a um via bcrypt — lista é pequena, ≤10).
 */
async function listUnused(adminId) {
  const [rows] = await pool.query(
    "SELECT id, code_hash FROM admin_backup_codes WHERE admin_id = ? AND used_at IS NULL",
    [adminId]
  );
  return rows;
}

/**
 * Marca um code específico como usado. Idempotente: se já foi usado,
 * UPDATE não afeta nenhuma linha (used_at IS NULL).
 */
async function markUsed(id) {
  await pool.query(
    "UPDATE admin_backup_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL",
    [id]
  );
}

/**
 * Apaga todos os backup codes do admin. Usado em disableMfa.
 */
async function deleteAllForAdmin(adminId) {
  await pool.query(
    "DELETE FROM admin_backup_codes WHERE admin_id = ?",
    [adminId]
  );
}

/**
 * Conta backup codes não usados — útil para alertar admin que ainda
 * não regenerou após consumir alguns.
 */
async function countUnused(adminId) {
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS n FROM admin_backup_codes WHERE admin_id = ? AND used_at IS NULL",
    [adminId]
  );
  return Number(row?.n || 0);
}

module.exports = {
  replaceAllForAdmin,
  listUnused,
  markUsed,
  deleteAllForAdmin,
  countUnused,
};
