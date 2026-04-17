// repositories/corretoraReviewsRepository.js
//
// Acesso à tabela corretora_reviews. Separação clara entre queries
// públicas (só 'approved') e admin (todas + filtros).
"use strict";

const pool = require("../config/pool");

// ─── Write ──────────────────────────────────────────────────────────────────

async function create({
  corretora_id,
  lead_id,
  nome_autor,
  cidade_autor,
  rating,
  comentario,
  source_ip,
  user_agent,
}) {
  const [result] = await pool.query(
    `INSERT INTO corretora_reviews
       (corretora_id, lead_id, nome_autor, cidade_autor, rating,
        comentario, status, source_ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      corretora_id,
      lead_id ?? null,
      nome_autor,
      cidade_autor ?? null,
      rating,
      comentario ?? null,
      source_ip ?? null,
      user_agent ?? null,
    ],
  );
  return result.insertId;
}

async function moderate({ id, status, reviewed_by, rejection_reason }, conn = pool) {
  const [result] = await conn.query(
    `UPDATE corretora_reviews
       SET status = ?,
           reviewed_by = ?,
           reviewed_at = NOW(),
           rejection_reason = ?
     WHERE id = ?`,
    [status, reviewed_by, rejection_reason ?? null, id],
  );
  return result.affectedRows;
}

// ─── Read — público (só approved) ───────────────────────────────────────────

async function listPublicByCorretoraId(corretoraId, { limit = 20 } = {}) {
  const [rows] = await pool.query(
    `SELECT
       id, lead_id, nome_autor, cidade_autor, rating, comentario, created_at,
       corretora_reply, replied_at
     FROM corretora_reviews
     WHERE corretora_id = ? AND status = 'approved'
     ORDER BY created_at DESC
     LIMIT ?`,
    [corretoraId, limit],
  );
  // lead_id não é exposto ao público, mas usamos para marcar
  // "cliente verificado" no cliente (boolean derivado).
  // replied_by NÃO entra no payload público — só serve para auditoria
  // interna do tenant (quem respondeu).
  return rows.map((r) => ({
    id: r.id,
    nome_autor: r.nome_autor,
    cidade_autor: r.cidade_autor,
    rating: Number(r.rating),
    comentario: r.comentario,
    verified_lead: Boolean(r.lead_id),
    created_at: r.created_at,
    corretora_reply: r.corretora_reply ?? null,
    replied_at: r.replied_at ?? null,
  }));
}

// ─── Read + Write — painel da corretora (tenant-scoped) ─────────────────────

/**
 * Lista reviews aprovadas da própria corretora. Inclui o reply para a UI
 * mostrar estado atual e permitir edição. Limitado a status='approved':
 * pending/rejected são problema do admin, não do tenant.
 */
async function listForCorretora(corretoraId, { limit = 50 } = {}) {
  const [rows] = await pool.query(
    `SELECT
       id, nome_autor, cidade_autor, rating, comentario, created_at,
       corretora_reply, replied_at, replied_by, lead_id
     FROM corretora_reviews
     WHERE corretora_id = ? AND status = 'approved'
     ORDER BY created_at DESC
     LIMIT ?`,
    [corretoraId, limit],
  );
  return rows.map((r) => ({
    ...r,
    rating: Number(r.rating),
    verified_lead: Boolean(r.lead_id),
  }));
}

/**
 * Grava (ou atualiza) o reply público da corretora. Guard duplo:
 * corretora_id garante isolamento tenant; status='approved' evita
 * responder reviews pending/rejected. Reply vazio/null limpa —
 * corretora pode retirar a resposta.
 */
async function setReply({ id, corretora_id, user_id, reply }) {
  const text = reply ? String(reply).trim() : "";
  if (text.length > 0) {
    const [result] = await pool.query(
      `UPDATE corretora_reviews
         SET corretora_reply = ?,
             replied_at = NOW(),
             replied_by = ?
       WHERE id = ? AND corretora_id = ? AND status = 'approved'`,
      [text, user_id ?? null, id, corretora_id],
    );
    return result.affectedRows;
  }
  const [result] = await pool.query(
    `UPDATE corretora_reviews
       SET corretora_reply = NULL,
           replied_at = NULL,
           replied_by = NULL
     WHERE id = ? AND corretora_id = ? AND status = 'approved'`,
    [id, corretora_id],
  );
  return result.affectedRows;
}

async function getAggregateByCorretoraId(corretoraId) {
  const [[row]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       AVG(rating) AS average
     FROM corretora_reviews
     WHERE corretora_id = ? AND status = 'approved'`,
    [corretoraId],
  );
  const total = Number(row.total || 0);
  return {
    total,
    average:
      total > 0 && row.average != null
        ? Math.round(Number(row.average) * 10) / 10
        : null,
  };
}

// ─── Read — admin (todas) ───────────────────────────────────────────────────

async function listAdmin({ status, corretora_id, page, limit }) {
  const where = ["1=1"];
  const params = [];

  if (status && status !== "all") {
    where.push("r.status = ?");
    params.push(status);
  }
  if (corretora_id) {
    where.push("r.corretora_id = ?");
    params.push(corretora_id);
  }

  const whereClause = where.join(" AND ");

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM corretora_reviews r WHERE ${whereClause}`,
    params,
  );
  const total = Number(countRow.total || 0);

  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT
       r.*,
       c.name AS corretora_name,
       c.slug AS corretora_slug,
       c.city AS corretora_city
     FROM corretora_reviews r
     JOIN corretoras c ON c.id = r.corretora_id
     WHERE ${whereClause}
     ORDER BY
       CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
       r.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return { items: rows, total, page, limit };
}

async function getPendingCount() {
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS total FROM corretora_reviews WHERE status = 'pending'",
  );
  return Number(row.total || 0);
}

async function findById(id, conn = pool) {
  const [[row]] = await conn.query(
    "SELECT * FROM corretora_reviews WHERE id = ?",
    [id],
  );
  return row ?? null;
}

module.exports = {
  create,
  moderate,
  listPublicByCorretoraId,
  getAggregateByCorretoraId,
  listForCorretora,
  setReply,
  listAdmin,
  getPendingCount,
  findById,
};
