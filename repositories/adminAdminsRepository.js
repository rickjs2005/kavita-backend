"use strict";
// repositories/adminAdminsRepository.js

const pool = require("../config/pool");

async function findAll() {
  const [rows] = await pool.query(
    "SELECT id, nome, email, role, ativo, criado_em, ultimo_login FROM admins ORDER BY role = 'master' DESC, nome ASC"
  );
  return rows;
}

async function findRoleBySlug(slug) {
  const [rows] = await pool.query("SELECT id FROM admin_roles WHERE slug = ?", [slug]);
  return rows[0] || null;
}

async function findByEmail(email) {
  const [rows] = await pool.query("SELECT id FROM admins WHERE email = ?", [email]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query("SELECT id, role FROM admins WHERE id = ?", [id]);
  return rows[0] || null;
}

async function insert(nome, email, senhaHash, role) {
  const [result] = await pool.query(
    "INSERT INTO admins (nome, email, senha, role, ativo) VALUES (?, ?, ?, ?, 1)",
    [nome, email, senhaHash, role]
  );
  return result.insertId;
}

async function update(id, fields, values) {
  const [result] = await pool.query(
    `UPDATE admins SET ${fields.join(", ")} WHERE id = ?`,
    [...values, id]
  );
  return result.affectedRows;
}

async function deleteById(id) {
  await pool.query("DELETE FROM admins WHERE id = ?", [id]);
}

module.exports = { findAll, findRoleBySlug, findByEmail, findById, insert, update, deleteById };
