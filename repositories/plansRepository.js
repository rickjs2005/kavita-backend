// repositories/plansRepository.js
"use strict";

const pool = require("../config/pool");

function parseJsonCol(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizePlan(row) {
  if (!row) return null;
  return {
    ...row,
    capabilities: parseJsonCol(row.capabilities) ?? {},
    is_public: Boolean(row.is_public),
    is_active: Boolean(row.is_active),
  };
}

async function listPublic() {
  const [rows] = await pool.query(
    `SELECT * FROM plans
     WHERE is_active = 1 AND is_public = 1
     ORDER BY sort_order ASC, price_cents ASC`,
  );
  return rows.map(normalizePlan);
}

async function listAll() {
  const [rows] = await pool.query(
    `SELECT * FROM plans ORDER BY sort_order ASC, price_cents ASC`,
  );
  return rows.map(normalizePlan);
}

async function findById(id) {
  const [[row]] = await pool.query("SELECT * FROM plans WHERE id = ? LIMIT 1", [
    id,
  ]);
  return normalizePlan(row);
}

async function findBySlug(slug) {
  const [[row]] = await pool.query("SELECT * FROM plans WHERE slug = ? LIMIT 1", [
    slug,
  ]);
  return normalizePlan(row);
}

async function create(data) {
  const [result] = await pool.query(
    `INSERT INTO plans
       (slug, name, description, price_cents, billing_cycle,
        capabilities, sort_order, is_public, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.slug,
      data.name,
      data.description ?? null,
      data.price_cents ?? 0,
      data.billing_cycle ?? "monthly",
      data.capabilities ? JSON.stringify(data.capabilities) : null,
      data.sort_order ?? 0,
      data.is_public ? 1 : 0,
      data.is_active === false ? 0 : 1,
    ],
  );
  return result.insertId;
}

async function update(id, data) {
  const allowed = {
    name: (v) => v,
    description: (v) => v,
    price_cents: (v) => v,
    billing_cycle: (v) => v,
    capabilities: (v) => (v ? JSON.stringify(v) : null),
    sort_order: (v) => v,
    is_public: (v) => (v ? 1 : 0),
    is_active: (v) => (v ? 1 : 0),
  };
  const sets = [];
  const values = [];
  for (const [key, transform] of Object.entries(allowed)) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(transform(data[key]));
    }
  }
  if (sets.length === 0) return 0;
  values.push(id);
  const [result] = await pool.query(
    `UPDATE plans SET ${sets.join(", ")} WHERE id = ?`,
    values,
  );
  return result.affectedRows;
}

module.exports = {
  listPublic,
  listAll,
  findById,
  findBySlug,
  create,
  update,
};
