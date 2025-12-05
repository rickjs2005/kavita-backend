// routes/publicPromocoes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

/**
 * @openapi
 * /api/public/promocoes:
 *   get:
 *     tags: [Public, Marketing]
 *     summary: Lista produtos em promoção para exibição no site público
 *     description: >
 *       Retorna apenas promoções ATIVAS no momento (intervalo de data válido),
 *       com preço original, preço final calculado, porcentagem de desconto e imagem.
 *     responses:
 *       200:
 *         description: Lista de produtos em promoção
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   description: { type: string }
 *                   original_price: { type: number, format: float }
 *                   final_price: { type: number, format: float }
 *                   discount_percent: { type: number, format: float, nullable: true }
 *                   promo_price: { type: number, format: float, nullable: true }
 *                   quantity: { type: integer }
 *                   image: { type: string, nullable: true }
 *                   type: { type: string, enum: ["PROMOCAO","FLASH"] }
 *                   title: { type: string, nullable: true }
 *                   ends_at: { type: string, format: date-time, nullable: true }
 *       500:
 *         description: Erro interno ao buscar promoções
 */

/**
 * GET /api/public/promocoes
 * Retorna promoções ativas para o site público
 * - Só traz promoções ativas e dentro da janela de tempo
 * - Calcula final_price com base em promo_price ou discount_percent
 * - Garante original_price e final_price como DECIMAL
 * - Pega a primeira imagem do produto (product_images.path)
 */
router.get("/", async (_req, res) => {
  try {
    const sql = `
      SELECT
        p.id AS id,
        p.name,
        p.description,
        CAST(p.price AS DECIMAL(10,2)) AS original_price,
        COALESCE(p.quantity, 0) AS quantity,
        d.title,
        d.type,
        d.discount_percent,
        d.promo_price,
        d.end_at AS ends_at,
        COALESCE(
          SUBSTRING_INDEX(
            GROUP_CONCAT(pi.path ORDER BY pi.id ASC SEPARATOR ','), ',', 1
          ),
          ''
        ) AS image,
        CAST(
          CASE
            WHEN d.promo_price IS NOT NULL
              THEN d.promo_price
            WHEN d.discount_percent IS NOT NULL
              THEN p.price - (p.price * (d.discount_percent / 100))
            ELSE p.price
          END
        AS DECIMAL(10,2)) AS final_price
      FROM product_promotions d
      JOIN products p            ON p.id = d.product_id
      LEFT JOIN product_images pi ON pi.product_id = p.id
      WHERE
        d.is_active = 1
        AND (d.start_at IS NULL OR d.start_at <= NOW())
        AND (d.end_at   IS NULL OR d.end_at   >= NOW())
      GROUP BY
        p.id, p.name, p.description, p.price, p.quantity,
        d.title, d.type, d.discount_percent, d.promo_price, d.end_at
      ORDER BY d.created_at DESC, d.id DESC
    `;

    const [rows] = await pool.query(sql);
    return res.json(rows);
  } catch (err) {
    console.error("[publicPromocoes][GET] erro SQL:", err?.sqlMessage || err);
    return res.status(500).json({ message: "Erro ao buscar promoções." });
  }
});

module.exports = router;
