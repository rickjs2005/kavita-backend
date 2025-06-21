// routes/publicServicos.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool"); // Conexão com banco MySQL

// 🔓 GET /api/public/servicos — Lista de colaboradores com suas especialidades (público)
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.id,                    -- ID do colaborador
        c.nome,                  -- Nome do colaborador
        c.cargo,                 -- Cargo/função
        c.whatsapp,              -- Contato para WhatsApp
        c.imagem,                -- Foto ou imagem do colaborador
        c.descricao,             -- Descrição dos serviços que ele faz
        e.nome AS especialidade_nome -- Nome da especialidade associada
      FROM colaboradores c
      LEFT JOIN especialidades e ON c.especialidade_id = e.id
    `);
    res.json(rows); // Retorna a lista de serviços públicos
  } catch (err) {
    console.error("Erro ao buscar serviços públicos:", err);
    res.status(500).json({ message: "Erro ao buscar serviços." });
  }
});

module.exports = router;
