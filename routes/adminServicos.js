// routes/adminServicos.js

const express = require("express");
const router = express.Router();
const pool = require("../config/pool"); // Conexão com o banco MySQL
const verifyAdmin = require("../middleware/verifyAdmin"); // Middleware de autenticação

// 🔐 GET /admin/servicos — Lista todos os colaboradores com suas especialidades
router.get("/", verifyAdmin, async (req, res) => {
  try {
    // Consulta JOIN: retorna os dados dos colaboradores + nome da especialidade
    const [rows] = await pool.query(`
      SELECT 
        c.id,
        c.nome,
        c.cargo,
        c.whatsapp,
        c.imagem,
        c.descricao,
        c.especialidade_id,
        e.nome AS especialidade_nome
      FROM colaboradores c
      LEFT JOIN especialidades e ON c.especialidade_id = e.id
    `);

    res.json(rows); // Retorna o array de objetos com os dados dos serviços
  } catch (err) {
    console.error("Erro ao buscar serviços:", err);
    res.status(500).json({ message: "Erro ao buscar serviços." });
  }
});

module.exports = router; // Exporta o roteador
