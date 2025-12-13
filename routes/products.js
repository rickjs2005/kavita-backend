// routes/products.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

// normaliza slug -> nome (ou retorna id numérico como string)
function normalize(input) {
  if (!input) return "";
  const s = String(input).trim();
  if (/^\d+$/.test(s)) return s; // id numérico
  return s.replace(/-/g, " ").trim(); // pragas-e-insetos -> pragas e insetos
}

// Agrega imagens por product_id usando product_images.path
async function attachImages(products) {
  if (!products?.length) return products;

  const ids = products.map((p) => p.id);
  const placeholders = ids.map(() => "?").join(",");

  const [rows] = await pool.query(
    `SELECT product_id, path AS image_url
       FROM product_images
      WHERE product_id IN (${placeholders})
      ORDER BY id ASC`,
    ids
  );

  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.product_id)) map.set(r.product_id, []);
    map.get(r.product_id).push(r.image_url);
  }

  return products.map((p) => ({
    ...p,
    images: map.get(p.id) || [],
  }));
}

// =============== LISTAGEM PADRÃO (/api/products) ===============

// Whitelist de colunas para ORDER BY
const LIST_SORT_MAP = {
  id: "p.id",
  name: "p.name",
  price: "p.price",
  quantity: "p.quantity",
  // created_at: "p.created_at",
};

/**
 * GET /api/products
 * Query:
 *  - category: "all" (default) | <id numérico> | <slug/nome>
 *  - search: termo para LIKE em name/description
 *  - page: número da página (default 1)
 *  - limit: itens por página (default 12, máx 100)
 *  - sort: id | name | price | quantity (default id)
 *  - order: asc | desc (default desc)
 */
router.get("/", async (req, res) => {
  try {
    const {
      category = "all",
      search,
      page = "1",
      limit = "12",
      sort = "id",
      order = "desc",
    } = req.query;

    // paginação segura
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    // ordenação segura
    const sortKey = String(sort).toLowerCase();
    const sortCol = LIST_SORT_MAP[sortKey] || LIST_SORT_MAP.id;
    const orderDir = String(order).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const where = [];
    const params = [];

    // filtro de categoria (modelo 1:N -> products.category_id)
    if (category !== "all") {
      if (/^\d+$/.test(category)) {
        where.push("p.category_id = ?");
        params.push(Number(category));
      } else {
        const name = normalize(category);
        const [cat] = await pool.execute(
          "SELECT id FROM categories WHERE LOWER(name) = LOWER(?)",
          [name]
        );
        if (!cat.length) {
          return res.status(404).json({ message: "Categoria não encontrada." });
        }
        where.push("p.category_id = ?");
        params.push(cat[0].id);
      }
    }

    // filtro de busca
    if (search && String(search).trim() !== "") {
      const like = `%${search}%`;
      where.push("(p.name LIKE ? OR p.description LIKE ?)");
      params.push(like, like);
    }

    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    // total para paginação
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM products p
        ${whereSql}`,
      params
    );

    // dados paginados + ordenados
    const [rows] = await pool.query(
      `
      SELECT p.*
        FROM products p
       ${whereSql}
       ORDER BY ${sortCol} ${orderDir}
       LIMIT ? OFFSET ?
      `,
      [...params, limitNum, offset]
    );

    const data = await attachImages(rows);

    res.json({
      data,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      sort: sortKey,
      order: orderDir.toLowerCase(),
    });
  } catch (err) {
    console.error("[GET /api/products] Erro:", err);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// =============== BUSCA AVANÇADA (/api/products/search) ===============

// Whitelist de ORDER BY (nunca confie no input do usuário)
const SEARCH_SORT_MAP = {
  price_asc: "final_price ASC, p.id DESC",
  price_desc: "final_price DESC, p.id DESC",
  newest: "p.created_at DESC, p.id DESC",
  discount: "discount_percent DESC, p.id DESC",
  best_sellers: "p.sold_count DESC, p.id DESC", // requer coluna/materialização
};

function parseCsvIntList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => /^\d+$/.test(s))
    .map((s) => Number(s));
}

/**
 * GET /api/products/search
 * Query:
 *  - q: termo de busca (name/description)
 *  - categories: "1,2,3" (ids)
 *  - minPrice / maxPrice
 *  - promo=true
 *  - sort: newest | price_asc | price_desc | discount | best_sellers
 *  - page / limit
 */
router.get("/search", async (req, res) => {
  try {
    const {
      q,
      categories,
      minPrice,
      maxPrice,
      promo,
      sort = "newest",
      page = "1",
      limit = "12",
    } = req.query;

    // Paginação (limites conservadores)
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 60);
    const offset = (pageNum - 1) * limitNum;

    // Sanitização de filtros numéricos
    const minP = minPrice != null && minPrice !== "" ? Number(minPrice) : null;
    const maxP = maxPrice != null && maxPrice !== "" ? Number(maxPrice) : null;
    if (minP != null && Number.isNaN(minP))
      return res.status(400).json({ message: "minPrice inválido" });
    if (maxP != null && Number.isNaN(maxP))
      return res.status(400).json({ message: "maxPrice inválido" });

    const catIds = parseCsvIntList(categories);

    // WHERE dinâmico com placeholders
    const where = [];
    const params = [];

    // Busca textual (nome + descrição) – LIKE parcial
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      where.push("(p.name LIKE ? OR p.description LIKE ?)");
      params.push(like, like);
    }

    // Categorias múltiplas
    if (catIds.length) {
      const placeholders = catIds.map(() => "?").join(",");
      where.push(`p.category_id IN (${placeholders})`);
      params.push(...catIds);
    }

    // Promo subquery (1 promo ativa por produto)
    const promoJoin = `
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

    // Campos calculados (final_price/discount)
    const calcFinalPrice = `
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

    const calcDiscountPercent = `
      CAST(
        CASE
          WHEN promo.discount_percent IS NOT NULL THEN promo.discount_percent
          WHEN promo.promo_price IS NOT NULL AND p.price > 0
            THEN ((p.price - promo.promo_price) / p.price) * 100
          ELSE 0
        END
      AS DECIMAL(10,2))
    `;

    // Filtro promo=true
    if (String(promo).toLowerCase() === "true") {
      where.push(`promo.id IS NOT NULL AND ${calcFinalPrice} < p.price`);
    }

    // Filtro preço usando final_price (não price base)
    if (minP != null) {
      where.push(`${calcFinalPrice} >= ?`);
      params.push(minP);
    }
    if (maxP != null) {
      where.push(`${calcFinalPrice} <= ?`);
      params.push(maxP);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // ORDER BY via whitelist
    const sortKey = String(sort).toLowerCase();
    const orderBy = SEARCH_SORT_MAP[sortKey] || SEARCH_SORT_MAP.newest;

    // COUNT (para total)
    const [[{ total }]] = await pool.query(
      `
      SELECT COUNT(*) AS total
        FROM products p
        ${promoJoin}
        ${whereSql}
      `,
      params
    );

    // SELECT paginado
    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.description,
        p.category_id,
        CAST(p.price AS DECIMAL(10,2)) AS original_price,
        ${calcFinalPrice} AS final_price,
        ${calcDiscountPercent} AS discount_percent,
        (promo.id IS NOT NULL AND ${calcFinalPrice} < p.price) AS is_promo,
        p.created_at,
        p.sold_count,
        p.quantity
      FROM products p
      ${promoJoin}
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
      `,
      [...params, limitNum, offset]
    );

    const products = await attachImages(rows);

    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("[GET /api/products/search] Erro:", err);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

module.exports = router;
