"use strict";
// repositories/permissionsRepository.js

const pool = require("../config/pool");

async function findAll() {
  const [rows] = await pool.query(
    "SELECT id, chave, grupo, descricao FROM admin_permissions ORDER BY grupo ASC, chave ASC"
  );
  return rows;
}

async function findByChave(chave) {
  const [rows] = await pool.query("SELECT id FROM admin_permissions WHERE chave = ?", [chave]);
  return rows[0] || null;
}

async function insert(chave, grupo, descricao) {
  const [result] = await pool.query(
    "INSERT INTO admin_permissions (chave, grupo, descricao) VALUES (?, ?, ?)",
    [chave, grupo, descricao]
  );
  return result.insertId;
}

async function update(id, fields, values) {
  const [result] = await pool.query(
    `UPDATE admin_permissions SET ${fields.join(", ")} WHERE id = ?`,
    [...values, id]
  );
  return result.affectedRows;
}

async function deleteById(id) {
  const [result] = await pool.query("DELETE FROM admin_permissions WHERE id = ?", [id]);
  return result.affectedRows;
}

module.exports = { findAll, findByChave, insert, update, deleteById };
