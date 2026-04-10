// repositories/corretoraLeadsRepository.js
//
// Acesso à tabela corretora_leads. Todas as queries de leitura
// escopam por corretora_id para evitar vazamento entre corretoras.
"use strict";

const pool = require("../config/pool");

async function create({
  corretora_id,
  nome,
  telefone,
  cidade,
  mensagem,
  source_ip,
  user_agent,
}) {
  const [result] = await pool.query(
    `INSERT INTO corretora_leads
       (corretora_id, nome, telefone, cidade, mensagem, source_ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      corretora_id,
      nome,
      telefone,
      cidade ?? null,
      mensagem ?? null,
      source_ip ?? null,
      user_agent ?? null,
    ]
  );
  return result.insertId;
}

async function findByIdForCorretora(id, corretoraId) {
  const [rows] = await pool.query(
    "SELECT * FROM corretora_leads WHERE id = ? AND corretora_id = ? LIMIT 1",
    [id, corretoraId]
  );
  return rows[0] ?? null;
}

async function list({ corretoraId, status, page, limit }) {
  const where = ["corretora_id = ?"];
  const params = [corretoraId];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const whereClause = where.join(" AND ");

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM corretora_leads WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT *
     FROM corretora_leads
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { items: rows, total, page, limit };
}

async function update(id, corretoraId, data) {
  const allowed = ["status", "nota_interna"];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  if (sets.length === 0) return 0;

  values.push(id, corretoraId);
  const [result] = await pool.query(
    `UPDATE corretora_leads SET ${sets.join(", ")} WHERE id = ? AND corretora_id = ?`,
    values
  );
  return result.affectedRows;
}

async function summary(corretoraId) {
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS total
     FROM corretora_leads
     WHERE corretora_id = ?
     GROUP BY status`,
    [corretoraId]
  );

  const result = { total: 0, new: 0, contacted: 0, closed: 0, lost: 0 };
  for (const row of rows) {
    const count = Number(row.total || 0);
    result[row.status] = count;
    result.total += count;
  }
  return result;
}

module.exports = {
  create,
  findByIdForCorretora,
  list,
  update,
  summary,
};
