"use strict";

// Repository para mensagens de suporte corretora <-> admin.
//
// Thread implicita: todas as mensagens de uma corretora formam uma
// unica conversa ordenada por created_at. Por isso "thread" aqui e
// um agrupamento por corretora_id, nao uma entidade separada.

const pool = require("../config/pool");

async function create({
  corretora_id,
  sender_type,
  sender_id,
  sender_name,
  body,
}) {
  const [result] = await pool.query(
    `INSERT INTO corretora_support_messages
       (corretora_id, sender_type, sender_id, sender_name, body)
     VALUES (?, ?, ?, ?, ?)`,
    [corretora_id, sender_type, sender_id ?? null, sender_name ?? null, body],
  );
  return result.insertId;
}

async function listForCorretora(corretora_id, { limit = 100 } = {}) {
  const [rows] = await pool.query(
    `SELECT id, corretora_id, sender_type, sender_id, sender_name,
            body, read_at, created_at
       FROM corretora_support_messages
      WHERE corretora_id = ?
      ORDER BY created_at ASC
      LIMIT ?`,
    [corretora_id, Number(limit)],
  );
  return rows;
}

/**
 * Lista threads agrupadas por corretora — usado no admin para ver
 * todas as conversas. Retorna ultima mensagem + count de nao-lidas
 * (sender_type='corretora' AND read_at IS NULL) para priorizacao.
 */
async function listThreadsForAdmin({ limit = 100 } = {}) {
  const [rows] = await pool.query(
    `SELECT
        c.id AS corretora_id,
        c.name AS corretora_name,
        c.slug AS corretora_slug,
        c.city AS corretora_city,
        c.state AS corretora_state,
        (
          SELECT COUNT(*) FROM corretora_support_messages m2
           WHERE m2.corretora_id = c.id
             AND m2.sender_type = 'corretora'
             AND m2.read_at IS NULL
        ) AS unread_from_corretora,
        (
          SELECT COUNT(*) FROM corretora_support_messages m3
           WHERE m3.corretora_id = c.id
        ) AS total_messages,
        (
          SELECT MAX(m4.created_at) FROM corretora_support_messages m4
           WHERE m4.corretora_id = c.id
        ) AS last_message_at,
        (
          SELECT m5.body FROM corretora_support_messages m5
           WHERE m5.corretora_id = c.id
           ORDER BY m5.created_at DESC
           LIMIT 1
        ) AS last_message_body,
        (
          SELECT m6.sender_type FROM corretora_support_messages m6
           WHERE m6.corretora_id = c.id
           ORDER BY m6.created_at DESC
           LIMIT 1
        ) AS last_message_sender_type
       FROM corretoras c
      WHERE c.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM corretora_support_messages m
           WHERE m.corretora_id = c.id
        )
      ORDER BY last_message_at DESC
      LIMIT ?`,
    [Number(limit)],
  );
  return rows;
}

/**
 * Marca mensagens recebidas (de uma direcao) como lidas. Usado quando
 * a contraparte abre o thread:
 *   - admin abre thread -> marca mensagens 'corretora' como lidas
 *   - corretora carrega /support/messages -> marca 'admin' como lidas
 */
async function markRead({ corretora_id, sender_type }) {
  const [result] = await pool.query(
    `UPDATE corretora_support_messages
        SET read_at = NOW()
      WHERE corretora_id = ?
        AND sender_type = ?
        AND read_at IS NULL`,
    [corretora_id, sender_type],
  );
  return result.affectedRows;
}

/**
 * Conta mensagens nao lidas para a corretora (mensagens que o admin
 * mandou e ainda nao foram visualizadas).
 */
async function countUnreadForCorretora(corretora_id) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS n
       FROM corretora_support_messages
      WHERE corretora_id = ?
        AND sender_type = 'admin'
        AND read_at IS NULL`,
    [corretora_id],
  );
  return Number(row?.n || 0);
}

module.exports = {
  create,
  listForCorretora,
  listThreadsForAdmin,
  markRead,
  countUnreadForCorretora,
};
