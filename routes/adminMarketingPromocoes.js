// routes/adminMarketingPromocoes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * @openapi
 * /api/admin/marketing/promocoes:
 *   get:
 *     tags: [Admin, Marketing]
 *     summary: Lista promoções de produtos (módulo de Marketing)
 *     description: >
 *       Retorna todas as promoções cadastradas, com informações do produto,
 *       preço original, preço promocional calculado e status (ATIVA / INATIVA).
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de promoções de produtos
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
 *                   image: { type: string, nullable: true }
 *                   original_price: { type: number }
 *                   final_price: { type: number }
 *                   discount_percent: { type: number, nullable: true }
 *                   promo_price: { type: number, nullable: true }
 *                   title: { type: string, nullable: true }
 *                   type: { type: string, enum: ["PROMOCAO","FLASH"] }
 *                   start_at: { type: string, format: date-time, nullable: true }
 *                   end_at: { type: string, format: date-time, nullable: true }
 *                   is_active: { type: integer }
 *                   status: { type: string }
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao buscar promoções
 */

/**
 * @openapi
 * /api/admin/marketing/promocoes:
 *   post:
 *     tags: [Admin, Marketing]
 *     summary: Cria uma nova promoção de produto
 *     description: >
 *       Cria uma promoção ligada a um produto. Você pode informar desconto em porcentagem
 *       ou um preço promocional fixo. Caso ambos sejam enviados, o sistema usa o promo_price.
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
 *               product_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [PROMOCAO, FLASH]
 *                 default: PROMOCAO
 *               discount_percent:
 *                 type: number
 *                 format: float
 *               promo_price:
 *                 type: number
 *                 format: float
 *               start_at:
 *                 type: string
 *                 format: date-time
 *               end_at:
 *                 type: string
 *                 format: date-time
 *               is_active:
 *                 type: integer
 *                 description: 1 = ativa, 0 = pausada
 *     responses:
 *       201:
 *         description: Promoção criada com sucesso
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Produto não encontrado
 *       409:
 *         description: Já existe promoção para este produto
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao criar promoção
 */

/**
 * @openapi
 * /api/admin/marketing/promocoes/{id}:
 *   put:
 *     tags: [Admin, Marketing]
 *     summary: Atualiza uma promoção de produto
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               type: { type: string, enum: [PROMOCAO, FLASH] }
 *               discount_percent: { type: number, format: float }
 *               promo_price: { type: number, format: float }
 *               start_at: { type: string, format: date-time }
 *               end_at: { type: string, format: date-time }
 *               is_active: { type: integer }
 *     responses:
 *       200:
 *         description: Promoção atualizada com sucesso
 *       404:
 *         description: Promoção não encontrada
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao atualizar promoção
 */

/**
 * @openapi
 * /api/admin/marketing/promocoes/{id}:
 *   delete:
 *     tags: [Admin, Marketing]
 *     summary: Remove uma promoção de produto
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Promoção removida com sucesso
 *       404:
 *         description: Promoção não encontrada
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao remover promoção
 */

// LISTAR PROMOÇÕES
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
        CAST(p.price AS DECIMAL(10,2)) AS original_price,
        d.promo_price,
        d.discount_percent,
        d.title,
        d.type,
        d.start_at,
        d.end_at,
        d.is_active,
        CASE
          WHEN d.is_active = 1
           AND (d.start_at IS NULL OR d.start_at <= NOW())
           AND (d.end_at   IS NULL OR d.end_at   >= NOW())
          THEN 'ATIVA'
          ELSE 'INATIVA'
        END AS status,
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
      JOIN products p ON p.id = d.product_id
      ORDER BY d.created_at DESC, d.id DESC
    `;

    const [rows] = await pool.query(sql);
    return res.json(rows);
  } catch (err) {
    console.error("[adminMarketingPromocoes][GET] erro SQL:", err?.sqlMessage || err);
    return res.status(500).json({ message: "Erro ao buscar promoções." });
  }
});

// CRIAR PROMOÇÃO
router.post("/", verifyAdmin, async (req, res) => {
  const {
    product_id,
    title = null,
    type = "PROMOCAO",
    discount_percent = null,
    promo_price = null,
    start_at = null,
    end_at = null,
    is_active = 1,
  } = req.body || {};

  if (!product_id) {
    return res.status(400).json({ message: "ID do produto é obrigatório." });
  }

  if (!discount_percent && !promo_price) {
    return res.status(400).json({
      message: "Informe discount_percent ou promo_price para criar uma promoção.",
    });
  }

  try {
    // Verifica se o produto existe
    const [p] = await pool.query(
      "SELECT id, price FROM products WHERE id = ? LIMIT 1",
      [product_id]
    );
    if (!p.length) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }

    // Regra simples: apenas 1 promoção por produto (pode mudar futuramente)
    const [dup] = await pool.query(
      "SELECT id FROM product_promotions WHERE product_id = ? LIMIT 1",
      [product_id]
    );
    if (dup.length) {
      return res.status(409).json({ message: "Já existe uma promoção para este produto." });
    }

    const insertSql = `
      INSERT INTO product_promotions
        (product_id, title, type, discount_percent, promo_price, start_at, end_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await pool.query(insertSql, [
      product_id,
      title,
      type,
      discount_percent,
      promo_price,
      start_at,
      end_at,
      is_active ? 1 : 0,
    ]);

    return res.status(201).json({ message: "Promoção criada com sucesso." });
  } catch (err) {
    console.error("[adminMarketingPromocoes][POST] erro SQL:", err?.sqlMessage || err);
    return res.status(500).json({ message: "Erro ao criar promoção." });
  }
});

// ATUALIZAR PROMOÇÃO
router.put("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    title,
    type,
    discount_percent,
    promo_price,
    start_at,
    end_at,
    is_active,
  } = req.body || {};

  try {
    const [exists] = await pool.query(
      "SELECT id FROM product_promotions WHERE id = ? LIMIT 1",
      [id]
    );
    if (!exists.length) {
      return res.status(404).json({ message: "Promoção não encontrada." });
    }

    // Monta update dinâmico só com os campos enviados
    const fields = [];
    const values = [];

    if (title !== undefined) {
      fields.push("title = ?");
      values.push(title);
    }
    if (type !== undefined) {
      fields.push("type = ?");
      values.push(type);
    }
    if (discount_percent !== undefined) {
      fields.push("discount_percent = ?");
      values.push(discount_percent);
    }
    if (promo_price !== undefined) {
      fields.push("promo_price = ?");
      values.push(promo_price);
    }
    if (start_at !== undefined) {
      fields.push("start_at = ?");
      values.push(start_at);
    }
    if (end_at !== undefined) {
      fields.push("end_at = ?");
      values.push(end_at);
    }
    if (is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(is_active ? 1 : 0);
    }

    if (!fields.length) {
      return res.status(400).json({ message: "Nenhum campo para atualizar." });
    }

    const updateSql = `
      UPDATE product_promotions
      SET ${fields.join(", ")}
      WHERE id = ?
    `;
    values.push(id);

    await pool.query(updateSql, values);

    return res.json({ message: "Promoção atualizada com sucesso." });
  } catch (err) {
    console.error("[adminMarketingPromocoes][PUT] erro SQL:", err?.sqlMessage || err);
    return res.status(500).json({ message: "Erro ao atualizar promoção." });
  }
});

// REMOVER PROMOÇÃO
router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [r] = await pool.query("DELETE FROM product_promotions WHERE id = ?", [id]);
    if (!r.affectedRows) {
      return res.status(404).json({ message: "Promoção não encontrada." });
    }
    return res.json({ message: "Promoção removida com sucesso." });
  } catch (err) {
    console.error("[adminMarketingPromocoes][DELETE] erro SQL:", err?.sqlMessage || err);
    return res.status(500).json({ message: "Erro ao remover promoção." });
  }
});

module.exports = router;
