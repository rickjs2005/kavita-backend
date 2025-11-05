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

/**
 * GET /api/products
 * Query:
 *  - category: "all" (default) | <id numérico> | <slug/nome>
 *  - search: termo para LIKE em name/description
 */
router.get("/", async (req, res) => {
  try {
    const { category = "all", search } = req.query;

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

    const sql = `
      SELECT p.*
        FROM products p
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY p.id DESC
    `;

    const [rows] = await pool.query(sql, params);
    const withImages = await attachImages(rows);
    res.json(withImages);
  } catch (err) {
    console.error("[GET /api/products] Erro:", err);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

module.exports = router;
