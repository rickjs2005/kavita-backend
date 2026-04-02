"use strict";
// lib/withTransaction.js
//
// Helper para encapsular o boilerplate de transação MySQL2.
// Substitui o padrão repetido em 10+ services:
//   const conn = await pool.getConnection();
//   try { await conn.beginTransaction(); ... await conn.commit(); }
//   catch { await conn.rollback(); throw; }
//   finally { conn.release(); }
//
// Uso:
//   const { withTransaction } = require("../lib/withTransaction");
//   const result = await withTransaction(async (conn) => {
//     await repo.insert(conn, data);
//     return { id };
//   });

const pool = require("../config/pool");

/**
 * Executes `fn(conn)` inside a MySQL transaction.
 * Handles: getConnection, beginTransaction, commit, rollback, release.
 *
 * @param {(conn: object) => Promise<T>} fn  Receives the connection, returns a value.
 * @returns {Promise<T>} The value returned by `fn`.
 * @throws Re-throws any error from `fn` after rollback.
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { withTransaction };
