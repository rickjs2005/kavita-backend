"use strict";

// repositories/newsWhatsappRepository.js
// Queries para news_whatsapp_subscribers — captura de números do WhatsApp
// pelo card "Central no WhatsApp" da home /news.
//
// Telefone é guardado SEMPRE como dígitos puros (sem máscara, sem DDI).
// O schema garante 10 ou 11 dígitos antes de chegar aqui.
//
// confirm_token é gerado no createSubscriber (32 bytes hex = 64 chars) e
// usado pelos endpoints públicos de confirm/unsubscribe.

const crypto = require("crypto");
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
    confirm_token,
    confirmed_at,
    unsubscribed_at,
    criado_em,
    atualizado_em
  FROM news_whatsapp_subscribers
`;

/** Token de confirmação opaco. 32 bytes hex = 64 chars urlsafe. */
function generateConfirmToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function getById(id) {
  return queryOne(`${SELECT} WHERE id = ? LIMIT 1`, [id]);
}

async function getByPhone(phone) {
  return queryOne(`${SELECT} WHERE phone = ? LIMIT 1`, [phone]);
}

async function getByConfirmToken(token) {
  if (!token || typeof token !== "string") return null;
  return queryOne(`${SELECT} WHERE confirm_token = ? LIMIT 1`, [token]);
}

async function createSubscriber({
  phone,
  source = "home_news",
  ip = null,
  user_agent = null,
}) {
  const confirm_token = generateConfirmToken();
  const res = await query(
    `INSERT INTO news_whatsapp_subscribers (phone, source, ip, user_agent, confirm_token)
     VALUES (?, ?, ?, ?, ?)`,
    [phone, source, ip, user_agent, confirm_token],
  );
  return { insertId: res.insertId, affectedRows: res.affectedRows ?? 0, confirm_token };
}

/**
 * Marca como active. Idempotente: chamadas repetidas só atualizam o registro
 * se ele estava pending. unsubscribed NÃO volta a active aqui — usar
 * updateStatus do admin para reativar manualmente.
 */
async function confirmSubscriber(id) {
  const res = await query(
    `UPDATE news_whatsapp_subscribers
     SET status = 'active', confirmed_at = COALESCE(confirmed_at, NOW())
     WHERE id = ? AND status IN ('pending', 'active')`,
    [id],
  );
  return { affectedRows: res.affectedRows ?? 0 };
}

/**
 * Marca como unsubscribed. Idempotente — pode ser chamado em pending,
 * active ou unsubscribed sem erro. unsubscribed_at só é setado na primeira
 * vez (preserva timestamp original).
 */
async function unsubscribeSubscriber(id) {
  const res = await query(
    `UPDATE news_whatsapp_subscribers
     SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, NOW())
     WHERE id = ?`,
    [id],
  );
  return { affectedRows: res.affectedRows ?? 0 };
}

/**
 * Update bruto de status — usado pelo admin (PATCH) quando ele recebe a
 * mensagem de opt-in pelo WhatsApp e marca manualmente. Limpa timestamps
 * de forma coerente: confirmed_at é setado quando passa para active;
 * unsubscribed_at é setado quando passa para unsubscribed.
 */
async function updateStatus(id, status) {
  const validStatuses = new Set(["pending", "active", "unsubscribed"]);
  if (!validStatuses.has(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  let extraSet = "";
  if (status === "active") {
    extraSet = ", confirmed_at = COALESCE(confirmed_at, NOW())";
  } else if (status === "unsubscribed") {
    extraSet = ", unsubscribed_at = COALESCE(unsubscribed_at, NOW())";
  }

  const res = await query(
    `UPDATE news_whatsapp_subscribers SET status = ?${extraSet} WHERE id = ?`,
    [status, id],
  );
  return { affectedRows: res.affectedRows ?? 0 };
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
  generateConfirmToken,
  getById,
  getByPhone,
  getByConfirmToken,
  createSubscriber,
  confirmSubscriber,
  unsubscribeSubscriber,
  updateStatus,
  listSubscribers,
};
