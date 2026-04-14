// repositories/corretoraNotificationsRepository.js
"use strict";

const pool = require("../config/pool");

async function create({ corretora_id, type, title, body, link, meta }) {
  const [result] = await pool.query(
    `INSERT INTO corretora_notifications
       (corretora_id, type, title, body, link, meta)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      corretora_id,
      type,
      title,
      body ?? null,
      link ?? null,
      meta != null ? JSON.stringify(meta) : null,
    ],
  );
  return result.insertId;
}

/**
 * Lista notificações da corretora com flag derivada `read_by_me`
 * indicando se o user atual leu.
 */
async function listForUser({ corretora_id, user_id, limit = 30 }) {
  const [rows] = await pool.query(
    `SELECT
       n.id, n.type, n.title, n.body, n.link, n.meta, n.created_at,
       (r.read_at IS NOT NULL) AS read_by_me
     FROM corretora_notifications n
     LEFT JOIN corretora_notification_reads r
       ON r.notification_id = n.id AND r.user_id = ?
     WHERE n.corretora_id = ?
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [user_id, corretora_id, limit],
  );
  return rows.map((r) => ({
    ...r,
    read_by_me: Boolean(r.read_by_me),
  }));
}

async function countUnreadForUser({ corretora_id, user_id }) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM corretora_notifications n
     LEFT JOIN corretora_notification_reads r
       ON r.notification_id = n.id AND r.user_id = ?
     WHERE n.corretora_id = ? AND r.read_at IS NULL`,
    [user_id, corretora_id],
  );
  return Number(row.total || 0);
}

async function markAsRead({ notification_id, user_id, corretora_id }) {
  // INSERT IGNORE garante idempotência (clicar 2x não duplica).
  // Primeiro valida que a notif pertence à corretora do user.
  const [[notif]] = await pool.query(
    `SELECT id FROM corretora_notifications
     WHERE id = ? AND corretora_id = ? LIMIT 1`,
    [notification_id, corretora_id],
  );
  if (!notif) return false;

  await pool.query(
    `INSERT IGNORE INTO corretora_notification_reads (notification_id, user_id)
     VALUES (?, ?)`,
    [notification_id, user_id],
  );
  return true;
}

async function markAllAsRead({ corretora_id, user_id }) {
  // Marca todas as notificações da corretora como lidas por este user
  // (só as que ainda não tinham read).
  await pool.query(
    `INSERT IGNORE INTO corretora_notification_reads (notification_id, user_id)
     SELECT n.id, ?
     FROM corretora_notifications n
     WHERE n.corretora_id = ?`,
    [user_id, corretora_id],
  );
}

module.exports = {
  create,
  listForUser,
  countUnreadForUser,
  markAsRead,
  markAllAsRead,
};
