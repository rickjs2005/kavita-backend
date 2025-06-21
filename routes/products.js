const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // Conexão com o banco de dados (MySQL)

// ✅ GET /api/products?category=xxx — Buscar produtos por categoria
router.get("/", async (req, res) => {
  const { category } = req.query; // Lê o parâmetro da URL, ex: ?category=bovinos

  // Se não houver categoria na query, retorna erro
  if (!category) {
    return res.status(400).json({ message: "Categoria não informada." });
  }

  try {
    // Se categoria for "all", retorna todos os produtos do banco
    if (category === "all") {
      const [allProducts] = await pool.query("SELECT * FROM products");
      return res.status(200).json(allProducts);
    }

    // Busca o ID da categoria pelo nome (caso seja nomeado, ex: "fertilizantes")
    const [categoryRow] = await pool.execute(
      "SELECT id FROM categories WHERE name = ?",
      [category]
    );

    // Se não encontrar a categoria informada, retorna erro
    if (categoryRow.length === 0) {
      return res.status(404).json({ message: "Categoria não encontrada." });
    }

    const categoryId = categoryRow[0].id;

    // Busca todos os produtos que pertencem àquela categoria
    const [products] = await pool.execute(
      "SELECT * FROM products WHERE category_id = ?",
      [categoryId]
    );

    res.status(200).json(products); // Retorna os produtos encontrados
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// ✅ GET /api/products/:id — Buscar produto específico por ID
router.get("/:id", async (req, res) => {
  const { id } = req.params; // ID do produto passado na URL

  try {
    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }

    res.status(200).json(rows[0]); // Retorna apenas o produto encontrado
  } catch (error) {
    console.error("Erro ao buscar produto por ID:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

module.exports = router; // Exporta as rotas para uso na aplicação
