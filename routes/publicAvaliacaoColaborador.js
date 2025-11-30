const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

/**
 * @openapi
 * /api/public/servicos/avaliacoes:
 *   post:
 *     tags: [Serviços Públicos]
 *     summary: Avalia um colaborador
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [colaborador_id, nota]
 *             properties:
 *               colaborador_id:
 *                 type: integer
 *               nota:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comentario:
 *                 type: string
 *     responses:
 *       201:
 *         description: Avaliação registrada
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro interno
 */
router.post("/avaliacoes", async (req, res) => {
  const { colaborador_id, nota, comentario } = req.body || {};

  if (!colaborador_id || !nota || nota < 1 || nota > 5) {
    return res
      .status(400)
      .json({ message: "Informe colaborador_id e nota entre 1 e 5." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO colaborador_avaliacoes (colaborador_id, nota, comentario)
       VALUES (?, ?, ?)`,
      [colaborador_id, nota, comentario || null]
    );

    // recalcula média e quantidade
    const [[stats]] = await conn.query(
      `SELECT AVG(nota) AS media, COUNT(*) AS total
       FROM colaborador_avaliacoes
       WHERE colaborador_id = ?`,
      [colaborador_id]
    );

    await conn.query(
      `UPDATE colaboradores
       SET rating_avg = ?, rating_count = ?
       WHERE id = ?`,
      [stats.media || 0, stats.total || 0, colaborador_id]
    );

    await conn.commit();
    return res
      .status(201)
      .json({ message: "Avaliação registrada com sucesso." });
  } catch (err) {
    await conn.rollback();
    console.error("Erro ao avaliar colaborador:", err);
    return res.status(500).json({ message: "Erro ao registrar avaliação." });
  } finally {
    conn.release();
  }
});

/**
 * @openapi
 * /api/public/servicos/{id}/avaliacoes:
 *   get:
 *     tags: [Serviços Públicos]
 *     summary: Lista avaliações de um colaborador
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de avaliações
 *       500:
 *         description: Erro interno
 */
router.get("/:id/avaliacoes", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT nota, comentario, created_at
       FROM colaborador_avaliacoes
       WHERE colaborador_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [id]
    );
    return res.json(rows);
  } catch (err) {
    console.error("Erro ao listar avaliações:", err);
    return res.status(500).json({ message: "Erro ao listar avaliações." });
  }
});

module.exports = router;
