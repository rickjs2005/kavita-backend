// repositories/corretoraUsersRepository.js
//
// Acesso à tabela corretora_users (login da corretora).
"use strict";

const pool = require("../config/pool");

async function findByEmail(email, conn = pool) {
  const [rows] = await conn.query(
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
async function findByCorretoraId(corretoraId, conn = pool) {
  const [rows] = await conn.query(
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

async function create({ corretora_id, nome, email, password_hash, role }, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO corretora_users (corretora_id, nome, email, password_hash, role)
     VALUES (?, ?, ?, ?, ?)`,
    [corretora_id, nome, email, password_hash, role ?? "owner"],
  );
  return result.insertId;
}

/**
 * Cria um usuário de corretora em estado "convite pendente":
 * password_hash é gravado como NULL. A corretora define a senha
 * ao usar o link de primeiro acesso enviado por e-mail.
 */
async function createPending({ corretora_id, nome, email, role }, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO corretora_users (corretora_id, nome, email, password_hash, role)
     VALUES (?, ?, ?, NULL, ?)`,
    [corretora_id, nome, email, role ?? "owner"],
  );
  return result.insertId;
}

// ─── Multi-usuário (Sprint 6A) ──────────────────────────────────────────────

/** Lista toda a equipe de uma corretora (usada no painel de Equipe). */
async function listTeamByCorretoraId(corretoraId) {
  const [rows] = await pool.query(
    `SELECT
       id, nome, email, role, is_active, last_login_at,
       password_hash IS NOT NULL AS activated,
       created_at, updated_at
     FROM corretora_users
     WHERE corretora_id = ?
     ORDER BY
       CASE role
         WHEN 'owner' THEN 0
         WHEN 'manager' THEN 1
         WHEN 'sales' THEN 2
         WHEN 'viewer' THEN 3
         ELSE 4
       END,
       created_at ASC`,
    [corretoraId],
  );
  return rows.map((r) => ({
    ...r,
    activated: Boolean(r.activated),
    is_active: Boolean(r.is_active),
  }));
}

async function countOwnersByCorretoraId(corretoraId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM corretora_users
     WHERE corretora_id = ? AND role = 'owner' AND is_active = 1`,
    [corretoraId],
  );
  return Number(row.total || 0);
}

/** Atualiza role. Controller deve garantir que nunca reduza o último owner. */
async function updateRole(id, corretoraId, role) {
  const [result] = await pool.query(
    `UPDATE corretora_users SET role = ? WHERE id = ? AND corretora_id = ?`,
    [role, id, corretoraId],
  );
  return result.affectedRows;
}

/** Desativa um usuário (remove acesso sem perder auditoria). */
async function deactivate(id, corretoraId) {
  const [result] = await pool.query(
    `UPDATE corretora_users
       SET is_active = 0,
           token_version = token_version + 1
     WHERE id = ? AND corretora_id = ?`,
    [id, corretoraId],
  );
  return result.affectedRows;
}

async function findByIdInCorretora(id, corretoraId) {
  const [[row]] = await pool.query(
    `SELECT * FROM corretora_users
     WHERE id = ? AND corretora_id = ?
     LIMIT 1`,
    [id, corretoraId],
  );
  return row ?? null;
}

/**
 * Atualiza apenas nome e e-mail (usado quando admin corrige dados de
 * um convite pendente antes de reenviar). Não toca password_hash.
 */
async function updateContactFields(id, { nome, email }, conn = pool) {
  const [result] = await conn.query(
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
  findByIdInCorretora,
  countByCorretoraId,
  countOwnersByCorretoraId,
  listTeamByCorretoraId,
  create,
  createPending,
  updateContactFields,
  updateRole,
  deactivate,
  updateLastLogin,
  incrementTokenVersion,
  updatePasswordAndBumpTokenVersion,
};
