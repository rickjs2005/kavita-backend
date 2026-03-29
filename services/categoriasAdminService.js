"use strict";
// services/categoriasAdminService.js
// Business rules for the categories admin module.
//
// Owns: slug generation, field-merge logic on PUT, NOT_FOUND / CONFLICT
// detection, and the is_active ↔ 0/1 conversion contract.

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/categoriasRepository");

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------

/**
 * Converts an arbitrary string into a URL-safe slug.
 * Strips diacritics, lowercases, removes non-alphanumeric chars, collapses
 * spaces and repeated hyphens.
 *
 * @param {string} str
 * @returns {string}
 */
function slugify(str = "") {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")      // drop everything else
    .replace(/\s+/g, "-")              // spaces → hyphens
    .replace(/-+/g, "-");              // collapse consecutive hyphens
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Returns all categories ordered by sort_order then name.
 */
async function list() {
  return repo.listCategories();
}

/**
 * Creates a category.
 * Slug is derived from `slug` param (if provided and non-empty) or from `name`.
 * Returns the full row as it would appear in a subsequent SELECT.
 *
 * @param {{ name: string, slug?: string, sort_order?: number }} data
 * @returns {{ id, name, slug, is_active, sort_order }}
 * @throws {AppError} 409 CONFLICT when the slug already exists in the table
 */
async function create({ name, slug, sort_order = 0 }) {
  const finalSlug = slug && slug.trim() ? slugify(slug) : slugify(name);

  try {
    const id = await repo.createCategory({ name, slug: finalSlug, sort_order });
    return { id, name, slug: finalSlug, is_active: 1, sort_order };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      throw new AppError(
        "Já existe uma categoria com esse slug.",
        ERROR_CODES.CONFLICT,
        409
      );
    }
    throw err;
  }
}

/**
 * Updates a category's name, slug and/or sort_order.
 *
 * Field-merge rules (preserved from legacy):
 *   name       — kept as-is when omitted; updated to trimmed value when present
 *   slug       — kept as-is when omitted or empty; slugified when a non-empty
 *                value is sent; falls back to slugify(newName) if current slug
 *                is also empty (edge-case for pre-existing bad data)
 *   sort_order — kept as-is when omitted or null; coerced to int when present
 *
 * @param {number} id
 * @param {{ name?: string, slug?: string, sort_order?: number }} patch
 * @returns {{ id, name, slug, sort_order, is_active }}
 * @throws {AppError} 404 NOT_FOUND when category does not exist
 */
async function update(id, { name, slug, sort_order } = {}) {
  const current = await repo.findCategoryById(id);
  if (!current) {
    throw new AppError("Categoria não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }

  const newName =
    name !== undefined ? String(name).trim() : current.name;

  const newSlug =
    slug !== undefined && String(slug).trim()
      ? slugify(slug)
      : current.slug || slugify(newName);

  const newOrder =
    sort_order !== undefined && sort_order !== null
      ? Number(sort_order) || 0
      : current.sort_order;

  await repo.updateCategory(id, { name: newName, slug: newSlug, sort_order: newOrder });

  return {
    id: current.id,
    name: newName,
    slug: newSlug,
    sort_order: newOrder,
    is_active: current.is_active,
  };
}

/**
 * Activates or deactivates a category.
 *
 * @param {number} id
 * @param {boolean} is_active
 * @throws {AppError} 404 NOT_FOUND when category does not exist
 */
async function updateStatus(id, is_active) {
  const affected = await repo.updateCategoryStatus(id, is_active);
  if (!affected) {
    throw new AppError("Categoria não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
}

/**
 * Hard-deletes a category.
 * Prefer setting is_active = 0 to avoid breaking products in that category.
 *
 * @param {number} id
 * @throws {AppError} 404 NOT_FOUND when category does not exist
 */
async function remove(id) {
  const affected = await repo.deleteCategory(id);
  if (!affected) {
    throw new AppError("Categoria não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { slugify, list, create, update, updateStatus, remove };
