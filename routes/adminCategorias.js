const express = require("express"); // Framework para rotas e servidor
const router = express.Router(); // Cria um agrupador de rotas
const pool = require("../config/pool"); // Conexão com o banco de dados
const verifyAdmin = require("../middleware/verifyAdmin"); // Middleware para verificar token de admin

/**
 * @openapi
 * /api/admin/categorias:
 *   get:
 *     tags: [Admin, Categorias]
 *     summary: Lista todas as categorias cadastradas
 *     security:
 *       - BearerAuth: []
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
 *       401:
 *         description: Não autorizado (token ausente ou inválido)
 *       500:
 *         description: Erro interno ao buscar categorias
 */

// 🔒 GET /admin/categorias — lista todas as categorias (rota protegida)
router.get("/", verifyAdmin, async (req, res) => {
  try {
    // Consulta SQL para buscar categorias (id e nome)
    const [rows] = await pool.query("SELECT id, name FROM categories");
    res.json(rows); // Retorna a lista como resposta
  } catch (err) {
    console.error("Erro ao buscar categorias:", err);
    res.status(500).json({ message: "Erro ao buscar categorias" }); // Retorna erro genérico
  }
});

module.exports = router; // Exporta as rotas para serem usadas na aplicação
