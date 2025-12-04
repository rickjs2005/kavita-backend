// routes/publicCategorias.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

/**
 * @openapi
 * /api/public/categorias:
 *   get:
 *     tags: [Public, Categorias]
 *     summary: Lista todas as categorias ativas com contagem de produtos
 *     responses:
 *       200:
 *         description: Lista de categorias retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   slug: { type: string }
 *                   is_active: { type: boolean }
 *                   total_products: { type: integer }
 *       500:
 *         description: Erro interno no servidor
 */

router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.slug,
        c.is_active,
        COUNT(p.id) AS total_products
      FROM categories c
      LEFT JOIN products p
        ON p.category_id = c.id
      WHERE c.is_active = 1
      GROUP BY c.id, c.name, c.slug, c.is_active
      ORDER BY c.sort_order ASC, c.name ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error("[GET /api/public/categorias] Erro:", err);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

module.exports = router;
