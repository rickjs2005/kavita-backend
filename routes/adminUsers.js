const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Lista todos os usuários do sistema
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuários
 *       500:
 *         description: Erro interno
 */
router.get("/", verifyAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id,
        nome,
        email,
        telefone,
        cpf,
        endereco,
        cidade,
        estado,
        cep,
        pais,
        ponto_referencia,
        status_conta,
        criado_em
      FROM usuarios
      ORDER BY criado_em DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro ao listar usuários:", err);
    res.status(500).json({ message: "Erro ao listar usuários" });
  }
});

/**
 * @openapi
 * /api/admin/users/{id}/block:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Bloqueia ou desbloqueia um usuário para compras
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status_conta:
 *                 type: string
 *                 enum: [ativo, bloqueado]
 *     responses:
 *       200:
 *         description: Status atualizado
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro interno
 */
router.put("/:id/block", verifyAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status_conta } = req.body || {};

  if (!id) {
    return res.status(400).json({ message: "ID inválido." });
  }

  if (!["ativo", "bloqueado"].includes(status_conta)) {
    return res.status(400).json({
      message: "status_conta deve ser 'ativo' ou 'bloqueado'.",
    });
  }

  try {
    const [result] = await pool.query(
      "UPDATE usuarios SET status_conta = ? WHERE id = ?",
      [status_conta, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    return res.json({
      message: "Status da conta atualizado com sucesso.",
      status_conta,
    });
  } catch (err) {
    console.error("Erro ao atualizar status_conta:", err);
    return res
      .status(500)
      .json({ message: "Erro ao atualizar status do usuário." });
  }
});

module.exports = router;
