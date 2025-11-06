const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * Ajuste estes 2 valores conforme seu schema real:
 * - Se sua tabela for outro nome, mude IMAGE_TABLE.
 * - Se a coluna da imagem for "image_url" (comum), mude IMAGE_COL para "image_url".
 * - Se não existir coluna de capa, deixe COVER_COL = null.
 */
const IMAGE_TABLE = "product_images";
const IMAGE_COL   = "image_url"; // <<<<< MUDE AQUI se for "url" ou "path"
const COVER_COL   = null;        // <<<<< se tiver "is_cover", use "is_cover"; se não, mantenha null

/**
 * @openapi
 * /api/admin/destaques:
 *   get:
 *     tags: [Admin, Destaques]
 *     summary: Lista todos os produtos destacados
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de produtos em destaque
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   product_id: { type: integer }
 *                   name: { type: string }
 *                   image: { type: string }
 *                   price: { type: number }
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao buscar destaques
 */

/**
 * @openapi
 * /api/admin/destaques:
 *   post:
 *     tags: [Admin, Destaques]
 *     summary: Adiciona um produto aos destaques
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [product_id]
 *             properties:
 *               product_id: { type: integer }
 *     responses:
 *       201:
 *         description: Produto adicionado aos destaques
 *       400:
 *         description: ID do produto é obrigatório
 *       404:
 *         description: Produto não encontrado
 *       409:
 *         description: Produto já está nos destaques
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao adicionar destaque
 */

/**
 * @openapi
 * /api/admin/destaques/{id}:
 *   delete:
 *     tags: [Admin, Destaques]
 *     summary: Remove um produto dos destaques
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Destaque removido com sucesso
 *       404:
 *         description: Destaque não encontrado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao remover destaque
 */

router.get("/", verifyAdmin, async (_req, res) => {
  try {
    const sql = `
      SELECT
        d.id,
        d.product_id,
        p.name,
        COALESCE(
          p.image,
          (
            SELECT pi.\`path\`
            FROM product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.id ASC
            LIMIT 1
          )
        ) AS image,
        CAST(p.price AS DECIMAL(10,2)) AS price
      FROM destaques d
      JOIN products p ON p.id = d.product_id
      ORDER BY d.created_at DESC, d.id DESC
    `;

    const [rows] = await pool.query(sql);
    return res.json(rows);
  } catch (err) {
    console.error("[adminDestaques][GET] erro SQL:", err?.sqlMessage || err);
    return res.status(500).json({ message: "Erro ao buscar destaques." });
  }
});

router.post("/", verifyAdmin, async (req, res) => {
  const { product_id } = req.body || {};
  if (!product_id) return res.status(400).json({ message: "ID do produto é obrigatório." });

  try {
    const [p] = await pool.query("SELECT id FROM products WHERE id = ? LIMIT 1", [product_id]);
    if (!p.length) return res.status(404).json({ message: "Produto não encontrado." });

    const [dup] = await pool.query("SELECT id FROM destaques WHERE product_id = ? LIMIT 1", [product_id]);
    if (dup.length) return res.status(409).json({ message: "Produto já está em destaques." });

    await pool.query("INSERT INTO destaques (product_id) VALUES (?)", [product_id]);
    return res.status(201).json({ message: "Produto adicionado aos destaques." });
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Produto já está em destaques." });
    }
    console.error("[adminDestaques][POST] erro SQL:", err?.sqlMessage || err);
    return res.status(500).json({ message: "Erro ao adicionar destaque." });
  }
});

router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [r] = await pool.query("DELETE FROM destaques WHERE id = ?", [id]);
    if (!r.affectedRows) return res.status(404).json({ message: "Destaque não encontrado." });
    return res.json({ message: "Destaque removido com sucesso." });
  } catch (err) {
    console.error("[adminDestaques][DELETE] erro SQL:", err?.sqlMessage || err);
    return res.status(500).json({ message: "Erro ao remover destaque." });
  }
});

module.exports = router;
