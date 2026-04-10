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

/**
 * Atualiza a senha de um corretora_user e incrementa token_version
 * na mesma query — invalida sessões ativas imediatamente após o reset.
 */
async function updatePasswordAndBumpTokenVersion(id, passwordHash) {
  const [result] = await pool.query(
    `UPDATE corretora_users
       SET password_hash = ?,
           token_version = token_version + 1
     WHERE id = ?`,
    [passwordHash, id]
  );
  return result.affectedRows;
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

/**
 * Retorna o primeiro (e único, por regra de negócio atual) usuário de
 * uma corretora, ou null. Usado pelo fluxo de convite para detectar
 * se a corretora já tem conta criada ou pendente.
 */
async function findByCorretoraId(corretoraId) {
  const [rows] = await pool.query(
    `SELECT cu.*, c.status AS corretora_status, c.name AS corretora_name, c.slug AS corretora_slug
     FROM corretora_users cu
     JOIN corretoras c ON c.id = cu.corretora_id
     WHERE cu.corretora_id = ?
     ORDER BY cu.id ASC
     LIMIT 1`,
    [corretoraId]
  );
  return rows[0] ?? null;
}

async function create({ corretora_id, nome, email, password_hash }) {
  const [result] = await pool.query(
    `INSERT INTO corretora_users (corretora_id, nome, email, password_hash)
     VALUES (?, ?, ?, ?)`,
    [corretora_id, nome, email, password_hash]
  );
  return result.insertId;
}

/**
 * Cria um usuário de corretora em estado "convite pendente":
 * password_hash é gravado como NULL. A corretora define a senha
 * ao usar o link de primeiro acesso enviado por e-mail.
 */
async function createPending({ corretora_id, nome, email }) {
  const [result] = await pool.query(
    `INSERT INTO corretora_users (corretora_id, nome, email, password_hash)
     VALUES (?, ?, ?, NULL)`,
    [corretora_id, nome, email]
  );
  return result.insertId;
}

/**
 * Atualiza apenas nome e e-mail (usado quando admin corrige dados de
 * um convite pendente antes de reenviar). Não toca password_hash.
 */
async function updateContactFields(id, { nome, email }) {
  const [result] = await pool.query(
    `UPDATE corretora_users SET nome = ?, email = ? WHERE id = ?`,
    [nome, email, id]
  );
  return result.affectedRows;
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
  findByCorretoraId,
  countByCorretoraId,
  create,
  createPending,
  updateContactFields,
  updateLastLogin,
  incrementTokenVersion,
  updatePasswordAndBumpTokenVersion,
};
