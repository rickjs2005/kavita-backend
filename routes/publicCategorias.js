// routes/publicCategorias.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

/** GET /api/public/categorias */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.name,
             COUNT(p.id) AS total_products
        FROM categories c
   LEFT JOIN products p
          ON p.category_id = c.id
    GROUP BY c.id, c.name
    ORDER BY c.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("[GET /api/public/categorias] Erro:", err);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

module.exports = router;
