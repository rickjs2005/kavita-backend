"use strict";
// repositories/categoriasRepository.js
// All SQL for the categories table. No business logic — callers decide meaning.

const pool = require("../config/pool");

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all active categories with their product count.
 * Used by the public endpoint GET /api/public/categorias.
 *
 * @returns {Array<{ id, name, slug, is_active, sort_order, total_products }>}
 */
async function findActiveCategories() {
  const [rows] = await pool.query(`
    SELECT
      c.id,
      c.name,
      c.slug,
      c.is_active,
      c.sort_order,
      COUNT(p.id) AS total_products
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
    WHERE c.is_active = 1
    GROUP BY c.id, c.name, c.slug, c.is_active, c.sort_order
    ORDER BY c.sort_order ASC, c.name ASC
  `);
  return rows;
}

/**
 * Returns all categories ordered by sort_order ASC then name ASC.
 * @returns {Array<{ id, name, slug, is_active, sort_order }>}
 */
async function listCategories() {
  const [rows] = await pool.query(
    "SELECT id, name, slug, is_active, sort_order FROM categories ORDER BY sort_order ASC, name ASC"
  );
  return rows;
}

/**
 * Returns a single category by ID, or null if not found.
 * @param {number} id
 * @returns {{ id, name, slug, sort_order, is_active }|null}
 */
async function findCategoryById(id) {
  const [rows] = await pool.query(
    "SELECT id, name, slug, sort_order, is_active FROM categories WHERE id = ?",
    [id]
  );
  return rows[0] || null;
}

/**
 * Inserts a new category. Always starts with is_active = 1.
 * Throws with code ER_DUP_ENTRY when slug already exists.
 *
 * @param {{ name: string, slug: string, sort_order: number }} data
 * @returns {number} insertId
 */
async function createCategory({ name, slug, sort_order }) {
  const [result] = await pool.query(
    "INSERT INTO categories (name, slug, is_active, sort_order) VALUES (?, ?, 1, ?)",
    [name, slug, sort_order]
  );
  return result.insertId;
}

/**
 * Updates name, slug and sort_order for an existing category.
 * Does NOT update is_active — that is owned by updateCategoryStatus.
 *
 * @param {number} id
 * @param {{ name: string, slug: string, sort_order: number }} data
 */
async function updateCategory(id, { name, slug, sort_order }) {
  await pool.query(
    "UPDATE categories SET name = ?, slug = ?, sort_order = ? WHERE id = ?",
    [name, slug, sort_order, id]
  );
}

/**
 * Flips the is_active flag for a single category.
 *
 * @param {number} id
 * @param {boolean} is_active
 * @returns {number} affectedRows — 0 means category does not exist
 */
async function updateCategoryStatus(id, is_active) {
  const [result] = await pool.query(
    "UPDATE categories SET is_active = ? WHERE id = ?",
    [is_active ? 1 : 0, id]
  );
  return result.affectedRows;
}

/**
 * Hard-deletes a category row.
 *
 * @param {number} id
 * @returns {number} affectedRows — 0 means category does not exist
 */
async function deleteCategory(id) {
  const [result] = await pool.query(
    "DELETE FROM categories WHERE id = ?",
    [id]
  );
  return result.affectedRows;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  findActiveCategories,
  listCategories,
  findCategoryById,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  deleteCategory,
};
