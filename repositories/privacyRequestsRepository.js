// repositories/privacyRequestsRepository.js
//
// Persistência de solicitações LGPD. Admin consulta via
// listPending; titular consulta via listForSubject (últimas 10).
"use strict";

const pool = require("../config/pool");

function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hydrate(row) {
  if (!row) return null;
  return { ...row, request_meta: parseJsonField(row.request_meta) };
}

async function create({
  subject_type,
  subject_id,
  subject_email,
  request_type,
  status_reason,
  scheduled_purge_at,
  request_meta,
}) {
  const [result] = await pool.query(
    `INSERT INTO privacy_requests
       (subject_type, subject_id, subject_email, request_type,
        status_reason, scheduled_purge_at, request_meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      subject_type,
      subject_id,
      subject_email,
      request_type,
      status_reason ?? null,
      scheduled_purge_at ?? null,
      request_meta ? JSON.stringify(request_meta) : null,
    ],
  );
  return result.insertId;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM privacy_requests WHERE id = ? LIMIT 1`,
    [id],
  );
  return hydrate(rows[0]);
}

async function listForSubject(subject_type, subject_id, limit = 10) {
  const [rows] = await pool.query(
    `SELECT id, request_type, status, status_reason,
            requested_at, processed_at, scheduled_purge_at
       FROM privacy_requests
      WHERE subject_type = ? AND subject_id = ?
      ORDER BY requested_at DESC
      LIMIT ?`,
    [subject_type, subject_id, Number(limit)],
  );
  return rows;
}

async function findActivePendingDeletion(subject_type, subject_id) {
  const [rows] = await pool.query(
    `SELECT * FROM privacy_requests
      WHERE subject_type = ?
        AND subject_id = ?
        AND request_type = 'delete'
        AND status IN ('pending', 'processing')
      ORDER BY requested_at DESC
      LIMIT 1`,
    [subject_type, subject_id],
  );
  return hydrate(rows[0]);
}

async function updateStatus(id, status, patch = {}) {
  const sets = ["status = ?"];
  const values = [status];
  for (const key of ["status_reason", "processed_at", "admin_user_id"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      sets.push(`${key} = ?`);
      values.push(patch[key] ?? null);
    }
  }
  values.push(id);
  await pool.query(
    `UPDATE privacy_requests SET ${sets.join(", ")} WHERE id = ?`,
    values,
  );
}

async function listAdminPending({ limit = 50 } = {}) {
  const [rows] = await pool.query(
    `SELECT id, subject_type, subject_id, subject_email,
            request_type, status, requested_at, scheduled_purge_at
       FROM privacy_requests
      WHERE status IN ('pending', 'processing')
      ORDER BY requested_at ASC
      LIMIT ?`,
    [Number(limit)],
  );
  return rows;
}

module.exports = {
  create,
  findById,
  listForSubject,
  findActivePendingDeletion,
  updateStatus,
  listAdminPending,
};
