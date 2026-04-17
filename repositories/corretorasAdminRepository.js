// repositories/corretorasAdminRepository.js
//
// Admin CRUD for corretoras + submission management.
// Pair: corretorasPublicRepository.js (public read-only).
"use strict";

const pool = require("../config/pool");

// ─── Corretoras CRUD ────────────────────────────────────────────────────────

async function list({ status, city, is_featured, search, page, limit }) {
  const where = ["1=1"];
  const params = [];

  if (status) {
    where.push("c.status = ?");
    params.push(status);
  }
  if (city) {
    where.push("c.city = ?");
    params.push(city);
  }
  if (is_featured === "1") {
    where.push("c.is_featured = 1");
  }
  if (search) {
    where.push("(c.name LIKE ? OR c.city LIKE ? OR c.contact_name LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const whereClause = where.join(" AND ");

  const countSql = `SELECT COUNT(*) AS total FROM corretoras c WHERE ${whereClause}`;
  const [countRows] = await pool.query(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  const offset = (page - 1) * limit;
  const dataSql = `
    SELECT c.*,
           p.slug AS plan_slug,
           p.name AS plan_name,
           cs.status AS sub_status,
           cs.trial_ends_at AS sub_trial_ends_at,
           cs.current_period_end AS sub_period_end
    FROM corretoras c
    LEFT JOIN corretora_subscriptions cs
      ON cs.corretora_id = c.id
      AND cs.status IN ('active','trialing','past_due')
    LEFT JOIN plans p ON p.id = cs.plan_id
    WHERE ${whereClause}
    ORDER BY c.is_featured DESC, c.sort_order ASC, c.name ASC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(dataSql, [...params, limit, offset]);

  return { items: rows, total, page, limit };
}

async function findById(id) {
  const [rows] = await pool.query("SELECT * FROM corretoras WHERE id = ?", [id]);
  return rows[0] ?? null;
}

async function findBySlug(slug, conn = pool) {
  const [rows] = await conn.query("SELECT * FROM corretoras WHERE slug = ?", [slug]);
  return rows[0] ?? null;
}

// Campos JSON precisam ser serializados antes do INSERT/UPDATE. Lista
// centralizada para facilitar manutenção.
const JSON_FIELDS = ["cidades_atendidas", "tipos_cafe"];

function serializeJsonFields(data) {
  const out = { ...data };
  for (const field of JSON_FIELDS) {
    if (out[field] !== undefined && out[field] !== null) {
      out[field] = JSON.stringify(out[field]);
    }
  }
  return out;
}

async function create(data, conn = pool) {
  const fields = [
    "name", "slug", "contact_name", "description", "logo_path",
    "city", "state", "region", "phone", "whatsapp", "email",
    "website", "instagram", "facebook", "status", "is_featured",
    "sort_order", "submission_id", "created_by",
    // Regional (Sprint 2)
    "cidades_atendidas", "tipos_cafe", "perfil_compra",
    "horario_atendimento", "anos_atuacao", "foto_responsavel_path",
  ];
  const payload = serializeJsonFields(data);
  const placeholders = fields.map(() => "?").join(", ");
  const values = fields.map((f) => payload[f] ?? null);

  const sql = `INSERT INTO corretoras (${fields.join(", ")}) VALUES (${placeholders})`;
  const [result] = await conn.query(sql, values);
  return result.insertId;
}

async function update(id, data) {
  const allowed = [
    "name", "slug", "contact_name", "description", "logo_path",
    "city", "state", "region", "phone", "whatsapp", "email",
    "website", "instagram", "facebook", "status", "is_featured",
    "sort_order",
    // Regional (Sprint 2)
    "cidades_atendidas", "tipos_cafe", "perfil_compra",
    "horario_atendimento", "anos_atuacao", "foto_responsavel_path",
  ];

  const payload = serializeJsonFields(data);
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (payload[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(payload[key]);
    }
  }

  if (sets.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE corretoras SET ${sets.join(", ")} WHERE id = ?`;
  const [result] = await pool.query(sql, values);
  return result.affectedRows;
}

async function updateStatus(id, status) {
  const sql = "UPDATE corretoras SET status = ? WHERE id = ?";
  const [result] = await pool.query(sql, [status, id]);
  return result.affectedRows;
}

async function updateFeatured(id, is_featured) {
  const sql = "UPDATE corretoras SET is_featured = ? WHERE id = ?";
  const [result] = await pool.query(sql, [is_featured, id]);
  return result.affectedRows;
}

async function clearFeatured(id) {
  const sql = "UPDATE corretoras SET is_featured = 0 WHERE id = ?";
  await pool.query(sql, [id]);
}

/**
 * Conta corretoras ativas em destaque. Usado pelo service para aplicar
 * o cap global (MAX_FEATURED_CORRETORAS) antes de permitir novo destaque.
 * Só conta status = 'active' porque destaque de inativa é bloqueado.
 */
async function countFeatured() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM corretoras WHERE is_featured = 1 AND status = 'active'",
  );
  return Number(rows[0]?.total || 0);
}

// ─── Submissions ────────────────────────────────────────────────────────────

async function listSubmissions({ status, page, limit }) {
  const where = ["1=1"];
  const params = [];

  if (status) {
    where.push("s.status = ?");
    params.push(status);
  }

  const whereClause = where.join(" AND ");

  const countSql = `SELECT COUNT(*) AS total FROM corretora_submissions s WHERE ${whereClause}`;
  const [countRows] = await pool.query(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  const offset = (page - 1) * limit;
  const dataSql = `
    SELECT s.*
    FROM corretora_submissions s
    WHERE ${whereClause}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(dataSql, [...params, limit, offset]);

  return { items: rows, total, page, limit };
}

async function findSubmissionById(id, conn = pool) {
  const [rows] = await conn.query(
    "SELECT * FROM corretora_submissions WHERE id = ?",
    [id]
  );
  return rows[0] ?? null;
}

async function createSubmission(data) {
  const fields = [
    "name", "contact_name", "description", "logo_path",
    "city", "state", "region", "phone", "whatsapp", "email",
    "website", "instagram", "facebook", "password_hash",
  ];
  const placeholders = fields.map(() => "?").join(", ");
  const values = fields.map((f) => data[f] ?? null);

  const sql = `INSERT INTO corretora_submissions (${fields.join(", ")}) VALUES (${placeholders})`;
  const [result] = await pool.query(sql, values);
  return result.insertId;
}

/**
 * Higiene: zera password_hash de uma submission. Usado ao rejeitar
 * uma submissão para não guardar hash de pessoa que nunca virou
 * corretora.
 */
async function clearSubmissionPassword(id, conn = pool) {
  await conn.query(
    "UPDATE corretora_submissions SET password_hash = NULL WHERE id = ?",
    [id]
  );
}

/**
 * Verifica se há submission pendente com o mesmo e-mail. Usado no
 * fluxo de signup para evitar dois cadastros duplicados na fila.
 */
async function findPendingSubmissionByEmail(email, conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, email, status FROM corretora_submissions
     WHERE email = ? AND status = 'pending'
     LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
}

async function approveSubmission(id, { reviewed_by, corretora_id }, conn = pool) {
  const sql = `
    UPDATE corretora_submissions
    SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), corretora_id = ?
    WHERE id = ?
  `;
  const [result] = await conn.query(sql, [reviewed_by, corretora_id, id]);
  return result.affectedRows;
}

async function rejectSubmission(id, { reviewed_by, rejection_reason }, conn = pool) {
  const sql = `
    UPDATE corretora_submissions
    SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ?
    WHERE id = ?
  `;
  const [result] = await conn.query(sql, [reviewed_by, rejection_reason, id]);
  return result.affectedRows;
}

async function countPending() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM corretora_submissions WHERE status = 'pending'"
  );
  return Number(rows[0]?.total || 0);
}

module.exports = {
  // Corretoras
  list,
  findById,
  findBySlug,
  create,
  update,
  updateStatus,
  updateFeatured,
  clearFeatured,
  countFeatured,
  // Submissions
  listSubmissions,
  findSubmissionById,
  createSubmission,
  approveSubmission,
  rejectSubmission,
  countPending,
  clearSubmissionPassword,
  findPendingSubmissionByEmail,
};
