// routes/publicDestaques.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

/**
 * GET /api/public/destaques
 * Retorna produtos em destaque para o site público
 * - Garante price como número (DECIMAL)
 * - Garante quantity (0 quando nulo)
 * - Pega a primeira imagem do produto (product_images.path)
 */
router.get("/", async (_req, res) => {
  try {
    const sql = `
      SELECT
        p.id AS id,
        p.name,
        p.description,
        CAST(p.price AS DECIMAL(10,2)) AS price,
        COALESCE(p.quantity, 0) AS quantity,
        COALESCE(
          SUBSTRING_INDEX(
            GROUP_CONCAT(pi.path ORDER BY pi.id ASC SEPARATOR ','), ',', 1
          ),
          ''
        ) AS image
      FROM destaques d
      JOIN products p       ON p.id = d.product_id
      LEFT JOIN product_images pi ON pi.product_id = p.id
      GROUP BY p.id, p.name, p.description, p.price, p.quantity
      ORDER BY d.created_at DESC, d.id DESC
    `;

    const [rows] = await pool.query(sql);
    return res.json(rows);
  } catch (err) {
    console.error("[publicDestaques][GET] erro SQL:", err?.sqlMessage || err);
    return res.status(500).json({ message: "Erro ao buscar destaques." });
  }
});

module.exports = router;
