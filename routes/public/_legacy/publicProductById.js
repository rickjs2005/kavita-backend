// =============================================================================
// ARQUIVO LEGADO — NÃO USE COMO REFERÊNCIA DE IMPLEMENTAÇÃO
// =============================================================================
// Este arquivo usa o padrão antigo: SQL inline na rota, validação manual
// e res.json() direto, sem controller/service/repository separados.
//
// Padrão canônico atual:
//   rota magra → controller → service → repository  (+  Zod em schemas/)
//   Referência: routes/admin/adminDrones.js
//
// Ao modificar este arquivo:
//   - prefira migrar para o padrão canônico na mesma PR
//   - se a mudança for pontual, adicione ou atualize o teste correspondente
//   - nunca amplie o padrão legado com novas rotas neste arquivo
// =============================================================================
//
// Escopo: detalhe de produto por ID.
// Prefixo montado: /api/products  →  GET /api/products/:id
//
// Montado no mesmo prefixo que publicProducts.js (que cobre GET / e GET /search).
// =============================================================================
// routes/productById.js
const express = require("express");
const router = express.Router();
const pool = require("../../../config/pool");

async function getImages(productId) {
  const [imgs] = await pool.query(
    "SELECT path AS image_url FROM product_images WHERE product_id = ? ORDER BY id ASC",
    [productId]
  );
  return imgs.map(i => i.image_url);
}

/**
 * @openapi
 * /api/products/{id}:
 *   get:
 *     tags: [Public, Produtos]
 *     summary: Retorna detalhes de um produto específico por ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalhes do produto retornados com sucesso
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Product' }
 *       400:
 *         description: ID inválido
 *       404:
 *         description: Produto não encontrado
 *       500:
 *         description: Erro interno no servidor
 */

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [id]);
    if (!rows.length) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }

    const produto = rows[0];
    const images = await getImages(id);
    res.json({ ...produto, images });
  } catch (err) {
    console.error("[GET /api/products/:id] Erro:", err);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

module.exports = router;
