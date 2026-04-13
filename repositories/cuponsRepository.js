"use strict";
// repositories/cuponsRepository.js
// SQL queries for admin coupon CRUD.

const pool = require("../config/pool");

const FIELDS = "id, codigo, tipo, valor, minimo, expiracao, usos, max_usos, max_usos_por_usuario, ativo";

async function findAll() {
  const [rows] = await pool.query(
    `SELECT ${FIELDS} FROM cupons ORDER BY id DESC`
  );

  // Attach restrictions for each coupon
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const [restricoes] = await pool.query(
      "SELECT id, cupom_id, tipo, target_id FROM cupom_restricoes WHERE cupom_id IN (?)",
      [ids]
    );

    const restricoesMap = {};
    for (const r of restricoes) {
      if (!restricoesMap[r.cupom_id]) restricoesMap[r.cupom_id] = [];
      restricoesMap[r.cupom_id].push({ id: r.id, tipo: r.tipo, target_id: r.target_id });
    }

    for (const row of rows) {
      row.restricoes = restricoesMap[row.id] || [];
    }
  }

  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${FIELDS} FROM cupons WHERE id = ?`,
    [id]
  );
  const cupom = rows[0] || null;
  if (cupom) {
    const [restricoes] = await pool.query(
      "SELECT id, tipo, target_id FROM cupom_restricoes WHERE cupom_id = ?",
      [cupom.id]
    );
    cupom.restricoes = restricoes;
  }
  return cupom;
}

async function create({ codigo, tipo, valor, minimo, expiracao, max_usos, max_usos_por_usuario, ativo, restricoes }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO cupons (codigo, tipo, valor, minimo, expiracao, usos, max_usos, max_usos_por_usuario, ativo)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [codigo, tipo, valor, minimo, expiracao, max_usos, max_usos_por_usuario, ativo]
    );
    const cupomId = result.insertId;

    if (Array.isArray(restricoes) && restricoes.length > 0) {
      const values = restricoes.map((r) => [cupomId, r.tipo, r.target_id]);
      await conn.query(
        "INSERT INTO cupom_restricoes (cupom_id, tipo, target_id) VALUES ?",
        [values]
      );
    }

    await conn.commit();
    return findById(cupomId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function update(id, { codigo, tipo, valor, minimo, expiracao, max_usos, max_usos_por_usuario, ativo, restricoes }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `UPDATE cupons
       SET codigo = ?, tipo = ?, valor = ?, minimo = ?, expiracao = ?,
           max_usos = ?, max_usos_por_usuario = ?, ativo = ?
       WHERE id = ?`,
      [codigo, tipo, valor, minimo, expiracao, max_usos, max_usos_por_usuario, ativo, id]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return null;
    }

    // Replace restrictions: delete all then re-insert
    await conn.query("DELETE FROM cupom_restricoes WHERE cupom_id = ?", [id]);

    if (Array.isArray(restricoes) && restricoes.length > 0) {
      const values = restricoes.map((r) => [id, r.tipo, r.target_id]);
      await conn.query(
        "INSERT INTO cupom_restricoes (cupom_id, tipo, target_id) VALUES ?",
        [values]
      );
    }

    await conn.commit();
    return findById(id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function remove(id) {
  // cupom_restricoes e cupom_usos têm ON DELETE CASCADE
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
