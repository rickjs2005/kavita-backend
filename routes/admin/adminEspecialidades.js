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
const express = require("express");
const router = express.Router();
const pool = require("../../config/pool");
const verifyAdmin = require("../../middleware/verifyAdmin");
const ERROR_CODES = require("../../constants/ErrorCodes");

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
    res.status(500).json({ ok: false, code: ERROR_CODES.SERVER_ERROR, message: "Erro ao buscar especialidades." });
  }
});
/**
 * @openapi
 * /api/admin/especialidades/public:
 *   get:
 *     tags: [Public, Especialidades]
 *     summary: Lista especialidades de colaboradores para o site público
 *     responses:
 *       200:
 *         description: Lista de especialidades retornada
 */

// ✅ GET /api/admin/especialidades/public — uso na página Trabalhe Conosco
router.get("/public", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, nome FROM especialidades");
    res.json(rows);
  } catch (err) {
    console.error("Erro ao buscar especialidades (público):", err);
    res.status(500).json({ ok: false, code: ERROR_CODES.SERVER_ERROR, message: "Erro ao buscar especialidades." });
  }
});


module.exports = router;
