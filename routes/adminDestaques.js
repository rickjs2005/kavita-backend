const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

// 🔹 GET /admin/destaques — listar produtos em destaque
router.get("/", verifyAdmin, async (req, res) => {
  try {
    // Faz JOIN com a tabela de produtos para trazer os dados do destaque
    const [rows] = await pool.query(`
      SELECT d.id, p.id AS product_id, p.name, p.image, p.price
      FROM destaques d
      JOIN products p ON d.product_id = p.id
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar destaques." });
  }
});

// 🔹 POST /admin/destaques — adicionar novo destaque
router.post("/", verifyAdmin, async (req, res) => {
  const { product_id } = req.body;

  if (!product_id) {
    return res.status(400).json({ message: "ID do produto é obrigatório." });
  }

  try {
    // Adiciona o produto à lista de destaques
    await pool.query("INSERT INTO destaques (product_id) VALUES (?)", [product_id]);
    res.status(201).json({ message: "Produto adicionado aos destaques!" });
  } catch (error) {
    res.status(500).json({ message: "Erro ao adicionar destaque." });
  }
});

// 🔹 DELETE /admin/destaques/:id — remover destaque
router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Remove o destaque pelo ID
    await pool.query("DELETE FROM destaques WHERE id = ?", [id]);
    res.json({ message: "Destaque removido com sucesso." });
  } catch (error) {
    res.status(500).json({ message: "Erro ao remover destaque." });
  }
});

module.exports = router;
