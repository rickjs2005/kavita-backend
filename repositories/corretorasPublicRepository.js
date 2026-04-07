// repositories/corretorasPublicRepository.js
//
// Public read-only queries for corretoras.
// Pair: corretorasAdminRepository.js (admin CRUD + submissions).
"use strict";

const pool = require("../config/pool");

/**
 * List active corretoras with optional filters and pagination.
 * Featured corretoras come first, then sorted by sort_order, name.
 */
async function list({ city, featured, search, page, limit }) {
  const where = ["c.status = 'active'"];
  const params = [];

  if (city) {
    where.push("c.city = ?");
    params.push(city);
  }

  if (featured === "1") {
    where.push("c.is_featured = 1");
  }

  if (search) {
    where.push("(c.name LIKE ? OR c.city LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term);
  }

  const whereClause = where.join(" AND ");

  const countSql = `SELECT COUNT(*) AS total FROM corretoras c WHERE ${whereClause}`;
  const [countRows] = await pool.query(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  const offset = (page - 1) * limit;
  const dataSql = `
    SELECT c.id, c.name, c.slug, c.contact_name, c.description, c.logo_path,
           c.city, c.state, c.region, c.phone, c.whatsapp, c.email,
           c.website, c.instagram, c.facebook, c.is_featured
    FROM corretoras c
    WHERE ${whereClause}
    ORDER BY c.is_featured DESC, c.sort_order ASC, c.name ASC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...params, limit, offset]);

  return { items: rows, total, page, limit };
}

/**
 * Get a single active corretora by slug.
 */
async function findBySlug(slug) {
  const sql = `
    SELECT c.id, c.name, c.slug, c.contact_name, c.description, c.logo_path,
           c.city, c.state, c.region, c.phone, c.whatsapp, c.email,
           c.website, c.instagram, c.facebook, c.is_featured
    FROM corretoras c
    WHERE c.slug = ? AND c.status = 'active'
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [slug]);
  return rows[0] ?? null;
}

/**
 * List distinct cities that have active corretoras — used for filters.
 */
async function listCities() {
  const sql = `
    SELECT DISTINCT c.city
    FROM corretoras c
    WHERE c.status = 'active'
    ORDER BY c.city ASC
  `;
  const [rows] = await pool.query(sql);
  return rows.map((r) => r.city);
}

module.exports = {
  list,
  findBySlug,
  listCities,
};
