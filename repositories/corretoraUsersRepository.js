// repositories/corretoraUsersRepository.js
//
// Acesso à tabela corretora_users (login da corretora).
"use strict";

const pool = require("../config/pool");

async function findByEmail(email) {
  const [rows] = await pool.query(
    `SELECT cu.*, c.status AS corretora_status, c.name AS corretora_name, c.slug AS corretora_slug
     FROM corretora_users cu
     JOIN corretoras c ON c.id = cu.corretora_id
     WHERE cu.email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT cu.*, c.status AS corretora_status, c.name AS corretora_name, c.slug AS corretora_slug
     FROM corretora_users cu
     JOIN corretoras c ON c.id = cu.corretora_id
     WHERE cu.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

async function countByCorretoraId(corretoraId) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM corretora_users WHERE corretora_id = ?",
    [corretoraId]
  );
  return Number(rows[0]?.total || 0);
}

async function create({ corretora_id, nome, email, password_hash }) {
  const [result] = await pool.query(
    `INSERT INTO corretora_users (corretora_id, nome, email, password_hash)
     VALUES (?, ?, ?, ?)`,
    [corretora_id, nome, email, password_hash]
  );
  return result.insertId;
}

async function updateLastLogin(id) {
  await pool.query(
    "UPDATE corretora_users SET last_login_at = NOW() WHERE id = ?",
    [id]
  );
}

async function incrementTokenVersion(id) {
  await pool.query(
    "UPDATE corretora_users SET token_version = token_version + 1 WHERE id = ?",
    [id]
  );
}

module.exports = {
  findByEmail,
  findById,
  countByCorretoraId,
  create,
  updateLastLogin,
  incrementTokenVersion,
};
