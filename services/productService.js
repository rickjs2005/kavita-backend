// services/productService.js
// Business logic for the public products domain.
"use strict";
const ERROR_CODES = require("../constants/ErrorCodes");

const productRepo = require("../repositories/productRepository");
const AppError = require("../errors/AppError");

// ---------------------------------------------------------------------------
// Query parameter parsers — private to this module
// ---------------------------------------------------------------------------

/** Normalizes a category slug to a plain name: "pragas-e-insetos" → "pragas e insetos" */
function _normalizeSlug(input) {
  if (!input) return "";
  const s = String(input).trim();
  if (/^\d+$/.test(s)) return s;
  return s.replace(/-/g, " ").trim();
}

/** Parses "1,2,3" → [1, 2, 3] (filters invalid entries) */
function _parseCsvIntList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => /^\d+$/.test(s))
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Resolves category ID from query, accepting three compatible keys:
 * categories=1,2,3 | category_id=7 | category=7
 */
function _parseCategoryIds(query) {
  const ids = _parseCsvIntList(query.categories);
  if (ids.length) return ids;

  const cid = query.category_id;
  if (cid != null && cid !== "") {
    const n = Number(cid);
    if (Number.isFinite(n) && n > 0) return [n];
  }

  const c = query.category;
  if (c != null && c !== "") {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return [n];
  }

  return [];
}

function _parseNumberOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// ---------------------------------------------------------------------------
// Image attachment (shared between list and search)
// ---------------------------------------------------------------------------

async function _attachImages(products) {
  if (!products?.length) return products;
  const ids = products.map((p) => p.id);
  const imageRows = await productRepo.findProductImages(ids);
  const map = new Map();
  for (const r of imageRows) {
    if (!map.has(r.product_id)) map.set(r.product_id, []);
    map.get(r.product_id).push(r.image_url);
  }
  return products.map((p) => ({ ...p, images: map.get(p.id) || [] }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a paginated product list.
 * Resolves category slugs to IDs via DB lookup.
 *
 * @param {object} query  req.query
 * @returns {{ items: object[], total: number, page: number, limit: number }}
 * @throws {AppError} 404 when category slug is not found
 */
async function listProducts(query) {
  const {
    category = "all",
    search,
    page = "1",
    limit = "12",
    sort = "id",
    order = "desc",
  } = query;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 100);
  const sortKey = String(sort).toLowerCase();
  const orderDir = String(order).toUpperCase() === "ASC" ? "ASC" : "DESC";

  let category_id = null;

  if (category !== "all") {
    if (/^\d+$/.test(category)) {
      category_id = Number(category);
    } else {
      const name = _normalizeSlug(category);
      const cat = await productRepo.findCategoryByName(name);
      if (!cat) {
        throw new AppError("Categoria não encontrada.", ERROR_CODES.NOT_FOUND, 404);
      }
      category_id = cat.id;
    }
  }

  const searchTerm =
    search && String(search).trim() !== "" ? String(search).trim() : null;

  const { rows, total } = await productRepo.findProducts({
    category_id,
    search: searchTerm,
    sort: sortKey,
    order: orderDir,
    page: pageNum,
    limit: limitNum,
  });

  const data = await _attachImages(rows);

  return { items: data, total, page: pageNum, limit: limitNum };
}

/**
 * Advanced product search with price range, category, and promotion filters.
 *
 * @param {object} query  req.query
 * @returns {{ items: object[], total: number, page: number, limit: number }}
 * @throws {AppError} 400 when minPrice or maxPrice is non-numeric
 */
async function searchProducts(query) {
  const {
    q,
    minPrice,
    maxPrice,
    promo,
    sort = "newest",
    page = "1",
    limit = "12",
  } = query;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 60);

  const minP = _parseNumberOrNull(minPrice);
  const maxP = _parseNumberOrNull(maxPrice);

  if (minP != null && Number.isNaN(minP)) {
    throw new AppError("minPrice inválido", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  if (maxP != null && Number.isNaN(maxP)) {
    throw new AppError("maxPrice inválido", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const catIds = _parseCategoryIds(query);
  const searchTerm = q && String(q).trim() ? String(q).trim() : null;
  const sortKey = String(sort).toLowerCase();
  const isPromo = String(promo).toLowerCase() === "true";

  const { rows, total } = await productRepo.searchProducts({
    q: searchTerm,
    catIds,
    minPrice: minP,
    maxPrice: maxP,
    promo: isPromo,
    sort: sortKey,
    page: pageNum,
    limit: limitNum,
  });

  const products = await _attachImages(rows);

  return { items: products, total, page: pageNum, limit: limitNum };
}

module.exports = { listProducts, searchProducts };
