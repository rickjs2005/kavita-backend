// routes/products.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

// normaliza slug -> nome (ou retorna id numérico como string)
function normalize(input) {
  if (!input) return "";
  const s = String(input).trim();
  if (/^\d+$/.test(s)) return s;          // id numérico
  return s.replace(/-/g, " ").trim();     // pragas-e-insetos -> pragas e insetos
}

// Agrega imagens por product_id usando product_images.path
async function attachImages(products) {
  if (!products?.length) return products;

  const ids = products.map(p => p.id);
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

  return products.map(p => ({
    ...p,
    images: map.get(p.id) || [],
  }));
}

// Whitelist de colunas para ORDER BY
const SORT_MAP = {
  id: "p.id",
  name: "p.name",
  price: "p.price",
  quantity: "p.quantity",
  // adicione aqui se sua tabela tiver as colunas:
  // created_at: "p.created_at",
};

/**
 * @openapi
 * /api/products:
 *   get:
 *     tags: [Public, Produtos]
 *     summary: Lista produtos com paginação, filtro e ordenação
 *     parameters:
 *       - name: category
 *         in: query
 *         required: false
 *         schema: { type: string, example: "fertilizantes" }
 *         description: Nome ou ID da categoria. Use "all" para todas.
 *       - name: search
 *         in: query
 *         required: false
 *         schema: { type: string }
 *         description: Termo de busca (em nome ou descrição)
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *       - $ref: '#/components/parameters/OrderParam'
 *     responses:
 *       200:
 *         description: Lista paginada de produtos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedProducts'
 *       404:
 *         description: Categoria não encontrada
 *       500:
 *         description: Erro interno no servidor
 */

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
    const sortCol = SORT_MAP[sortKey] || SORT_MAP.id;
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

module.exports = router;
