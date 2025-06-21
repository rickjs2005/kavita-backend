// routes/publicDestaques.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool"); // Conexão com o banco de dados

// 🔓 GET /api/public/destaques — Lista de produtos em destaque visível ao público
router.get("/", async (req, res) => {
  try {
    // Consulta que faz JOIN entre a tabela de destaques e os produtos relacionados
    const [rows] = await pool.query(`
      SELECT 
        d.id,                 -- ID do destaque
        p.id AS product_id,   -- ID do produto relacionado
        p.name,               -- Nome do produto
        p.description,        -- Descrição do produto
        p.price,              -- Preço do produto
        p.image               -- Imagem do produto
      FROM destaques d
      JOIN products p ON d.product_id = p.id
    `);

    res.json(rows); // Retorna a lista formatada de produtos em destaque
  } catch (error) {
    console.error("Erro ao buscar destaques públicos:", error);
    res.status(500).json({ message: "Erro ao buscar destaques." });
  }
});

module.exports = router;
