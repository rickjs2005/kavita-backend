"use strict";
// repositories/logsRepository.js

const pool = require("../config/pool");

const BASE_SELECT = `
  SELECT l.id, l.acao, l.entidade, l.entidade_id, l.data AS criado_em,
         l.admin_id, a.nome AS admin_nome, a.email AS admin_email, a.role AS admin_role
  FROM admin_logs l
  JOIN admins a ON a.id = l.admin_id`;

async function findAll({ where = "", params = [], limit = 20, offset = 0 }) {
  const [rows] = await pool.query(
    `${BASE_SELECT} ${where} ORDER BY l.data DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(`${BASE_SELECT} WHERE l.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

module.exports = { findAll, findById };
