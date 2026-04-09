"use strict";
// repositories/contatoRepository.js
//
// Acesso a dados para mensagens de contato publico.
// Tabela: mensagens_contato.

const pool = require("../config/pool");

/**
 * Insere uma nova mensagem de contato.
 * @returns {{ insertId: number }}
 */
async function create({ nome, email, telefone, assunto, mensagem, ip }) {
  const [result] = await pool.query(
    `INSERT INTO mensagens_contato (nome, email, telefone, assunto, mensagem, ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nome, email, telefone || null, assunto, mensagem, ip || null]
  );
  return { insertId: result.insertId };
}

/**
 * Conta mensagens do mesmo IP nas ultimas N horas.
 * Usado para rate limiting por IP.
 */
async function countByIpSince(ip, hours = 1) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM mensagens_contato
     WHERE ip = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [ip, hours]
  );
  return rows[0].total;
}

module.exports = { create, countByIpSince };
