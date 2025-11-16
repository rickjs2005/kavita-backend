const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * @openapi
 * /api/admin/especialidades:
 *   get:
 *     tags: [Admin, Especialidades]
 *     summary: Lista todas as especialidades de colaboradores
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de especialidades retornada
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   nome: { type: string }
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao buscar especialidades
 */

// ✅ GET /admin/especialidades — lista todas as especialidades dos colaboradores
router.get("/", verifyAdmin, async (req, res) => {
  try {
    // Busca especialidades com id e nome
    const [rows] = await pool.query("SELECT id, nome FROM especialidades");
    res.json(rows);
  } catch (err) {
    console.error("Erro ao buscar especialidades:", err);
    res.status(500).json({ message: "Erro ao buscar especialidades." });
  }
});

module.exports = router;
