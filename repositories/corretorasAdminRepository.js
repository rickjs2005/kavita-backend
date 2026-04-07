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
    SELECT c.*
    FROM corretoras c
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

async function findBySlug(slug) {
  const [rows] = await pool.query("SELECT * FROM corretoras WHERE slug = ?", [slug]);
  return rows[0] ?? null;
}

async function create(data) {
  const fields = [
    "name", "slug", "contact_name", "description", "logo_path",
    "city", "state", "region", "phone", "whatsapp", "email",
    "website", "instagram", "facebook", "status", "is_featured",
    "sort_order", "submission_id", "created_by",
  ];
  const placeholders = fields.map(() => "?").join(", ");
  const values = fields.map((f) => data[f] ?? null);

  const sql = `INSERT INTO corretoras (${fields.join(", ")}) VALUES (${placeholders})`;
  const [result] = await pool.query(sql, values);
  return result.insertId;
}

async function update(id, data) {
  const allowed = [
    "name", "slug", "contact_name", "description", "logo_path",
    "city", "state", "region", "phone", "whatsapp", "email",
    "website", "instagram", "facebook", "status", "is_featured",
    "sort_order",
  ];

  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(data[key]);
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

async function findSubmissionById(id) {
  const [rows] = await pool.query(
    "SELECT * FROM corretora_submissions WHERE id = ?",
    [id]
  );
  return rows[0] ?? null;
}

async function createSubmission(data) {
  const fields = [
    "name", "contact_name", "description", "logo_path",
    "city", "state", "region", "phone", "whatsapp", "email",
    "website", "instagram", "facebook",
  ];
  const placeholders = fields.map(() => "?").join(", ");
  const values = fields.map((f) => data[f] ?? null);

  const sql = `INSERT INTO corretora_submissions (${fields.join(", ")}) VALUES (${placeholders})`;
  const [result] = await pool.query(sql, values);
  return result.insertId;
}

async function approveSubmission(id, { reviewed_by, corretora_id }) {
  const sql = `
    UPDATE corretora_submissions
    SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), corretora_id = ?
    WHERE id = ?
  `;
  const [result] = await pool.query(sql, [reviewed_by, corretora_id, id]);
  return result.affectedRows;
}

async function rejectSubmission(id, { reviewed_by, rejection_reason }) {
  const sql = `
    UPDATE corretora_submissions
    SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ?
    WHERE id = ?
  `;
  const [result] = await pool.query(sql, [reviewed_by, rejection_reason, id]);
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
  // Submissions
  listSubmissions,
  findSubmissionById,
  createSubmission,
  approveSubmission,
  rejectSubmission,
  countPending,
};
