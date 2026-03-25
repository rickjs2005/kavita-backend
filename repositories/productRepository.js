// repositories/productRepository.js
// All SQL for the products public domain.
"use strict";

const pool = require("../config/pool");

// ---------------------------------------------------------------------------
// Sort whitelists — defined here so SQL column aliases never leave the repo
// ---------------------------------------------------------------------------

const LIST_SORT_MAP = {
  id: "p.id",
  name: "p.name",
  price: "p.price",
  quantity: "p.quantity",
};

const SEARCH_SORT_MAP = {
  price_asc: "final_price ASC, p.id DESC",
  price_desc: "final_price DESC, p.id DESC",
  newest: "p.created_at DESC, p.id DESC",
  discount: "discount_percent DESC, p.id DESC",
  best_sellers: "p.sold_count DESC, p.id DESC",
};

// ---------------------------------------------------------------------------
// Promotion SQL fragments (shared by count and data queries in searchProducts)
// ---------------------------------------------------------------------------

const PROMO_JOIN = `
  LEFT JOIN (
    SELECT d.*
    FROM product_promotions d
    JOIN (
      SELECT product_id, MAX(id) AS max_id
      FROM product_promotions
      WHERE is_active = 1
        AND (start_at IS NULL OR start_at <= NOW())
        AND (end_at   IS NULL OR end_at   >= NOW())
      GROUP BY product_id
    ) x ON x.product_id = d.product_id AND x.max_id = d.id
  ) promo ON promo.product_id = p.id
`;

const CALC_FINAL_PRICE = `
  CAST(
    CASE
      WHEN promo.promo_price IS NOT NULL
        THEN promo.promo_price
      WHEN promo.discount_percent IS NOT NULL
        THEN p.price - (p.price * (promo.discount_percent / 100))
      ELSE p.price
    END
  AS DECIMAL(10,2))
`;

const CALC_DISCOUNT_PERCENT = `
  CAST(
    CASE
      WHEN promo.discount_percent IS NOT NULL THEN promo.discount_percent
      WHEN promo.promo_price IS NOT NULL AND p.price > 0
        THEN ((p.price - promo.promo_price) / p.price) * 100
      ELSE 0
    END
  AS DECIMAL(10,2))
`;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Finds a category by name (case-insensitive).
 * Used for slug-to-ID resolution in listProducts.
 *
 * @param {string} name  Already-normalized name (dashes replaced with spaces)
 * @returns {{ id: number }|null}
 */
async function findCategoryByName(name) {
  const [rows] = await pool.execute(
    "SELECT id FROM categories WHERE LOWER(name) = LOWER(?)",
    [name]
  );
  return rows[0] || null;
}

/**
 * Returns a paginated list of products with optional category and search filters.
 *
 * @param {{ category_id?: number, search?: string, sort: string, order: string, page: number, limit: number }} filters
 * @returns {{ rows: object[], total: number }}
 */
async function findProducts({ category_id, search, sort, order, page, limit }) {
  const sortCol = LIST_SORT_MAP[sort] || LIST_SORT_MAP.id;
  const orderDir = order === "ASC" ? "ASC" : "DESC";
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];

  if (category_id != null) {
    where.push("p.category_id = ?");
    params.push(category_id);
  }

  if (search) {
    const like = `%${search}%`;
    where.push("(p.name LIKE ? OR p.description LIKE ?)");
    params.push(like, like);
  }

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM products p ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT p.*
       FROM products p
      ${whereSql}
      ORDER BY ${sortCol} ${orderDir}
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total };
}

/**
 * Advanced product search with promotion JOIN, price range, and promo filters.
 *
 * @param {{ q?: string, catIds?: number[], minPrice?: number, maxPrice?: number,
 *           promo: boolean, sort: string, page: number, limit: number }} filters
 * @returns {{ rows: object[], total: number }}
 */
async function searchProducts({ q, catIds, minPrice, maxPrice, promo, sort, page, limit }) {
  const orderBy = SEARCH_SORT_MAP[sort] || SEARCH_SORT_MAP.newest;
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];

  if (q) {
    const like = `%${q}%`;
    where.push("(p.name LIKE ? OR p.description LIKE ?)");
    params.push(like, like);
  }

  if (catIds && catIds.length) {
    const placeholders = catIds.map(() => "?").join(",");
    where.push(`p.category_id IN (${placeholders})`);
    params.push(...catIds);
  }

  if (promo) {
    where.push(`promo.id IS NOT NULL AND ${CALC_FINAL_PRICE} < p.price`);
  }

  if (minPrice != null) {
    where.push(`${CALC_FINAL_PRICE} >= ?`);
    params.push(minPrice);
  }

  if (maxPrice != null) {
    where.push(`${CALC_FINAL_PRICE} <= ?`);
    params.push(maxPrice);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM products p
       ${PROMO_JOIN}
       ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT
       p.id,
       p.name,
       p.description,
       p.category_id,
       CAST(p.price AS DECIMAL(10,2)) AS original_price,
       ${CALC_FINAL_PRICE} AS final_price,
       ${CALC_DISCOUNT_PERCENT} AS discount_percent,
       (promo.id IS NOT NULL AND ${CALC_FINAL_PRICE} < p.price) AS is_promo,
       p.created_at,
       p.sold_count,
       p.quantity
     FROM products p
     ${PROMO_JOIN}
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total };
}

/**
 * Returns product images for a set of product IDs.
 *
 * @param {number[]} ids
 * @returns {{ product_id: number, image_url: string }[]}
 */
async function findProductImages(ids) {
  if (!ids || !ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT product_id, path AS image_url
       FROM product_images
      WHERE product_id IN (${placeholders})
      ORDER BY id ASC`,
    ids
  );
  return rows;
}

module.exports = {
  findCategoryByName,
  findProducts,
  searchProducts,
  findProductImages,
};
