const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * @openapi
 * components:
 *   schemas:
 *     SolicitaçãoServico:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         colaborador_id: { type: integer }
 *         colaborador_nome: { type: string }
 *         nome_contato: { type: string }
 *         whatsapp: { type: string }
 *         descricao: { type: string }
 *         status:
 *           type: string
 *           enum: [novo, em_contato, concluido, cancelado]
 *         origem: { type: string }
 *         created_at: { type: string, format: date-time }
 */

/**
 * @openapi
 * /api/admin/servicos/solicitacoes:
 *   get:
 *     tags: [Admin, Serviços]
 *     summary: Lista solicitações de serviço
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de solicitações
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SolicitaçãoServico'
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
router.get("/solicitacoes", verifyAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        s.id,
        s.colaborador_id,
        c.nome AS colaborador_nome,
        s.nome_contato,
        s.whatsapp,
        s.descricao,
        s.status,
        s.origem,
        s.created_at
      FROM solicitacoes_servico s
      JOIN colaboradores c ON c.id = s.colaborador_id
      ORDER BY s.created_at DESC
    `
    );

    return res.json(rows);
  } catch (err) {
    console.error("Erro ao listar solicitações:", err);
    return res
      .status(500)
      .json({ message: "Erro ao listar solicitações de serviço." });
  }
});

/**
 * @openapi
 * /api/admin/servicos/solicitacoes/{id}/status:
 *   patch:
 *     tags: [Admin, Serviços]
 *     summary: Atualiza status da solicitação
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [novo, em_contato, concluido, cancelado]
 *     responses:
 *       200:
 *         description: Status atualizado
 *       400:
 *         description: Status inválido
 *       404:
 *         description: Solicitação não encontrada
 *       500:
 *         description: Erro interno
 */
router.patch("/solicitacoes/:id/status", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!["novo", "em_contato", "concluido", "cancelado"].includes(status)) {
    return res.status(400).json({ message: "Status inválido." });
  }

  try {
    const [result] = await pool.query(
      `UPDATE solicitacoes_servico SET status = ? WHERE id = ?`,
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Solicitação não encontrada." });
    }

    // se marcar como concluído, soma 1 em total_servicos do colaborador
    if (status === "concluido") {
      await pool.query(
        `
        UPDATE colaboradores c
        JOIN solicitacoes_servico s ON s.colaborador_id = c.id
           SET c.total_servicos = c.total_servicos + 1
         WHERE s.id = ?
      `,
        [id]
      );
    }

    return res.json({ message: "Status atualizado com sucesso." });
  } catch (err) {
    console.error("Erro ao atualizar status da solicitação:", err);
    return res
      .status(500)
      .json({ message: "Erro ao atualizar status da solicitação." });
  }
});

module.exports = router;
