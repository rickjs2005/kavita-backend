"use strict";
// repositories/cuponsRepository.js
// SQL queries for admin coupon CRUD.

const pool = require("../config/pool");

const FIELDS = "id, codigo, tipo, valor, minimo, expiracao, usos, max_usos, ativo";

async function findAll() {
  const [rows] = await pool.query(
    `SELECT ${FIELDS} FROM cupons ORDER BY id DESC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${FIELDS} FROM cupons WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function create({ codigo, tipo, valor, minimo, expiracao, max_usos, ativo }) {
  const [result] = await pool.query(
    `INSERT INTO cupons (codigo, tipo, valor, minimo, expiracao, usos, max_usos, ativo)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [codigo, tipo, valor, minimo, expiracao, max_usos, ativo]
  );
  return findById(result.insertId);
}

async function update(id, { codigo, tipo, valor, minimo, expiracao, max_usos, ativo }) {
  const [result] = await pool.query(
    `UPDATE cupons
     SET codigo = ?, tipo = ?, valor = ?, minimo = ?, expiracao = ?, max_usos = ?, ativo = ?
     WHERE id = ?`,
    [codigo, tipo, valor, minimo, expiracao, max_usos, ativo, id]
  );
  return result.affectedRows > 0 ? findById(id) : null;
}

async function remove(id) {
  const [result] = await pool.query(
    "DELETE FROM cupons WHERE id = ?",
    [id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
};
