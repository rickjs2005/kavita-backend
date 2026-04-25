"use strict";
// repositories/motoristasRepository.js
//
// CRUD basico de motoristas. Telefone como chave natural (UNIQUE).
// Auth e' separado: ver services/motoristaAuthService.js.

const pool = require("../config/pool");

const PUBLIC_FIELDS = `
  id, nome, telefone, email, veiculo_padrao, ativo, ultimo_login_em,
  token_version, created_at, updated_at
`;

async function findById(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT ${PUBLIC_FIELDS} FROM motoristas WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findByTelefone(telefone, conn = pool) {
  const [rows] = await conn.query(
    `SELECT ${PUBLIC_FIELDS} FROM motoristas WHERE telefone = ? LIMIT 1`,
    [telefone],
  );
  return rows[0] || null;
}

async function list({ ativo, search } = {}, conn = pool) {
  const where = ["1=1"];
  const params = [];
  if (ativo === true || ativo === 1) {
    where.push("ativo = 1");
  } else if (ativo === false || ativo === 0) {
    where.push("ativo = 0");
  }
  if (search) {
    where.push("(nome LIKE ? OR telefone LIKE ? OR email LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  const [rows] = await conn.query(
    `SELECT ${PUBLIC_FIELDS} FROM motoristas
      WHERE ${where.join(" AND ")}
      ORDER BY ativo DESC, nome ASC`,
    params,
  );
  return rows;
}

async function create({ nome, telefone, email, veiculo_padrao }, conn = pool) {
  const [r] = await conn.query(
    `INSERT INTO motoristas (nome, telefone, email, veiculo_padrao)
     VALUES (?, ?, ?, ?)`,
    [nome, telefone, email ?? null, veiculo_padrao ?? null],
  );
  return r.insertId;
}

async function update(id, patch, conn = pool) {
  const allowed = ["nome", "telefone", "email", "veiculo_padrao"];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      sets.push(`${k} = ?`);
      params.push(patch[k]);
    }
  }
  if (sets.length === 0) return 0;
  params.push(id);
  const [r] = await conn.query(
    `UPDATE motoristas SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  return r.affectedRows;
}

async function setAtivo(id, ativo, conn = pool) {
  const [r] = await conn.query(
    `UPDATE motoristas SET ativo = ? WHERE id = ?`,
    [ativo ? 1 : 0, id],
  );
  return r.affectedRows;
}

async function touchLogin(id, conn = pool) {
  await conn.query(
    `UPDATE motoristas SET ultimo_login_em = NOW() WHERE id = ?`,
    [id],
  );
}

async function bumpTokenVersion(id, conn = pool) {
  await conn.query(
    `UPDATE motoristas SET token_version = token_version + 1 WHERE id = ?`,
    [id],
  );
}

module.exports = {
  findById,
  findByTelefone,
  list,
  create,
  update,
  setAtivo,
  touchLogin,
  bumpTokenVersion,
};
