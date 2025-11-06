const express = require("express");
const router = express.Router();
const pool = require("../config/pool"); // Conexão com o banco de dados

/**
 * @openapi
 * /api/public/produtos:
 *   get:
 *     tags: [Public, Produtos]
 *     summary: Busca rápida de produtos por nome
 *     description: Retorna até 10 produtos correspondentes ao termo informado na query `busca`.
 *     parameters:
 *       - name: busca
 *         in: query
 *         required: true
 *         schema: { type: string, example: "fertilizante" }
 *         description: Termo parcial do nome do produto.
 *     responses:
 *       200:
 *         description: Produtos encontrados
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   price: { type: number }
 *                   image: { type: string, nullable: true }
 *       500:
 *         description: Erro interno ao buscar produtos
 */

// ✅ GET /api/public/produtos?busca=xxx — Busca rápida por nome do produto
router.get("/", async (req, res) => {
  const busca = req.query.busca; // Termo que o usuário digita no frontend

  // Se busca for vazia ou apenas espaços, retorna lista vazia
  if (!busca || busca.trim().length === 0) {
    return res.json([]);
  }

  try {
    // Consulta com LIKE para encontrar produtos que "parecem" com o termo
    const query = `
      SELECT 
        id AS id,
        name AS name,
        CAST(price AS DECIMAL(10,2)) AS price, -- Formata o preço com 2 casas decimais
        image AS image
      FROM products
      WHERE name LIKE ?
      LIMIT 10
    `;

    const [rows] = await pool.query(query, [`%${busca}%`]); // Ex: busca="fer" → fertilizante

    console.log("🟢 Produtos encontrados:", rows); // Log para debug
    res.json(rows); // Retorna os resultados encontrados (máximo 10)
  } catch (err) {
    console.error("🔴 Erro ao buscar produtos:", err);
    res.status(500).json({ message: "Erro ao buscar produtos." });
  }
});

module.exports = router; // Exporta as rotas
