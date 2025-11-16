const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * @openapi
 * /api/admin/colaboradores:
 *   post:
 *     tags: [Admin, Colaboradores]
 *     summary: Cadastra um novo colaborador
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, whatsapp, especialidade_id]
 *             properties:
 *               nome: { type: string }
 *               cargo: { type: string }
 *               whatsapp: { type: string }
 *               imagem: { type: string, nullable: true }
 *               descricao: { type: string, nullable: true }
 *               especialidade_id: { type: integer }
 *     responses:
 *       201:
 *         description: Colaborador cadastrado com sucesso
 *       400:
 *         description: Campos obrigatórios ausentes ou inválidos
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno no servidor
 */

/**
 * @openapi
 * /api/admin/colaboradores/{id}:
 *   delete:
 *     tags: [Admin, Colaboradores]
 *     summary: Exclui colaborador pelo ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Colaborador removido com sucesso
 *       404:
 *         description: Colaborador não encontrado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao deletar colaborador
 */

// ✅ POST /admin/colaboradores — Cadastra um novo colaborador
router.post("/", verifyAdmin, async (req, res) => {
  const { nome, cargo, whatsapp, imagem, descricao, especialidade_id } = req.body;

  // Verifica se os campos obrigatórios foram fornecidos
  if (!nome || !whatsapp || !especialidade_id) {
    return res.status(400).json({ message: "Campos obrigatórios: nome, WhatsApp e especialidade." });
  }

  try {
    // Garante que o ID da especialidade é um número
    const especialidadeId = parseInt(especialidade_id);
    if (isNaN(especialidadeId)) {
      return res.status(400).json({ message: "ID da especialidade inválido." });
    }

    // Insere novo colaborador no banco
    await pool.query(
      `INSERT INTO colaboradores (nome, cargo, whatsapp, imagem, descricao, especialidade_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nome, cargo, whatsapp, imagem, descricao, especialidadeId]
    );

    res.status(201).json({ message: "Colaborador cadastrado com sucesso!" });
  } catch (err) {
    console.error("Erro ao salvar colaborador:", err);
    res.status(500).json({ message: "Erro ao salvar colaborador." });
  }
});

// ✅ DELETE /admin/colaboradores/:id — Exclui colaborador pelo ID
router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Remove o colaborador pelo ID
    const [result] = await pool.query(
      "DELETE FROM colaboradores WHERE id = ?",
      [id]
    );

    // Se não encontrou nada para excluir, retorna erro
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Colaborador não encontrado." });
    }

    res.status(200).json({ message: "Colaborador removido com sucesso." });
  } catch (err) {
    console.error("Erro ao deletar colaborador:", err);
    res.status(500).json({ message: "Erro ao deletar colaborador." });
  }
});

module.exports = router;
