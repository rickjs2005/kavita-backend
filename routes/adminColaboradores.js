const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

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
