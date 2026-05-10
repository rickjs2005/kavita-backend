"use strict";

// repositories/newsWhatsappRepository.js
// Queries para news_whatsapp_subscribers — captura de números do WhatsApp
// pelo card "Central no WhatsApp" da home /news.
//
// Telefone é guardado SEMPRE como dígitos puros (sem máscara, sem DDI).
// O schema garante 10 ou 11 dígitos antes de chegar aqui.

const db = require("../config/pool");

async function query(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows?.[0] || null;
}

const SELECT = `
  SELECT
    id,
    phone,
    status,
    source,
    ip,
    user_agent,
    criado_em,
    atualizado_em
  FROM news_whatsapp_subscribers
`;

async function getByPhone(phone) {
  return queryOne(`${SELECT} WHERE phone = ? LIMIT 1`, [phone]);
}

async function createSubscriber({ phone, source = "home_news", ip = null, user_agent = null }) {
  const res = await query(
    `INSERT INTO news_whatsapp_subscribers (phone, source, ip, user_agent)
     VALUES (?, ?, ?, ?)`,
    [phone, source, ip, user_agent],
  );
  return { insertId: res.insertId, affectedRows: res.affectedRows ?? 0 };
}

async function listSubscribers({ limit = 50, offset = 0, status = null } = {}) {
  const where = [];
  const params = [];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit, offset);

  const rows = await query(
    `${SELECT}
     ${whereSql}
     ORDER BY criado_em DESC
     LIMIT ? OFFSET ?`,
    params,
  );

  // Conta total para paginação
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM news_whatsapp_subscribers ${whereSql.replace(/\bLIMIT.*$/, "")}`,
    status ? [status] : [],
  );

  return { rows, total: Number(total) || 0 };
}

module.exports = {
  getByPhone,
  createSubscriber,
  listSubscribers,
};
