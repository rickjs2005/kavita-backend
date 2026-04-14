// repositories/adminAuditLogsRepository.js
"use strict";

const pool = require("../config/pool");

function parseMeta(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function create({
  admin_id,
  admin_nome,
  action,
  target_type,
  target_id,
  meta,
  ip,
  user_agent,
}) {
  const [result] = await pool.query(
    `INSERT INTO admin_audit_logs
       (admin_id, admin_nome, action, target_type, target_id,
        meta, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      admin_id ?? null,
      admin_nome ?? null,
      action,
      target_type ?? null,
      target_id ?? null,
      meta ? JSON.stringify(meta) : null,
      ip ?? null,
      user_agent ?? null,
    ],
  );
  return result.insertId;
}

async function list({ action, target_type, target_id, admin_id, page = 1, limit = 50 } = {}) {
  const where = ["1=1"];
  const params = [];

  if (action) {
    where.push("action = ?");
    params.push(action);
  }
  if (target_type) {
    where.push("target_type = ?");
    params.push(target_type);
  }
  if (target_id) {
    where.push("target_id = ?");
    params.push(target_id);
  }
  if (admin_id) {
    where.push("admin_id = ?");
    params.push(admin_id);
  }

  const whereClause = where.join(" AND ");

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM admin_audit_logs WHERE ${whereClause}`,
    params,
  );
  const total = Number(countRow.total || 0);

  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT *
     FROM admin_audit_logs
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return {
    items: rows.map((r) => ({ ...r, meta: parseMeta(r.meta) })),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

module.exports = { create, list };
