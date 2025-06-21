const express = require("express");
const router = express.Router();
const pool = require("../config/pool"); // Conexão com o banco de dados
const verifyAdmin = require("../middleware/verifyAdmin"); // Middleware para verificar se é admin autenticado

// 🔍 GET /admin/produtos — Lista todos os produtos cadastrados
router.get("/", verifyAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products"); // Consulta todos os produtos
    res.json(rows); // Retorna lista de produtos
  } catch (err) {
    console.error("Erro ao buscar produtos:", err);
    res.status(500).json({ message: "Erro ao buscar produtos" });
  }
});

// ➕ POST /admin/produtos — Adiciona novo produto ao sistema
router.post("/", verifyAdmin, async (req, res) => {
  // Extrai os dados enviados no corpo da requisição
  const { name, description, price, image, quantity, category_id } = req.body;

  // Verifica se todos os campos foram preenchidos
  if (!name || !description || !price || !image || !quantity || !category_id) {
    return res.status(400).json({ message: "Todos os campos são obrigatórios." });
  }

  try {
    // Insere novo produto na tabela products
    await pool.query(
      `INSERT INTO products (name, description, price, image, quantity, category_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, description, price, image, quantity, category_id]
    );

    res.status(201).json({ message: "Produto adicionado com sucesso." });
  } catch (err) {
    console.error("Erro ao adicionar produto:", err);
    res.status(500).json({ message: "Erro ao adicionar produto." });
  }
});

// ✏️ PUT /admin/produtos/:id — Atualiza produto existente
router.put("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params; // ID do produto vindo da URL
  const { name, description, price, image, quantity, category_id } = req.body;

  // Verifica se todos os campos estão presentes
  if (!name || !description || !price || !image || !quantity || !category_id) {
    return res.status(400).json({ message: "Todos os campos são obrigatórios." });
  }

  try {
    // Atualiza os dados do produto
    const [result] = await pool.query(
      `UPDATE products
       SET name = ?, description = ?, price = ?, image = ?, quantity = ?, category_id = ?
       WHERE id = ?`,
      [name, description, price, image, quantity, category_id, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }

    res.json({ message: "Produto atualizado com sucesso." });
  } catch (err) {
    console.error("Erro ao atualizar produto:", err);
    res.status(500).json({ message: "Erro ao atualizar produto." });
  }
});

// ❌ DELETE /admin/produtos/:id — Remove um produto do sistema
router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params; // ID do produto a ser removido

  try {
    const [result] = await pool.query("DELETE FROM products WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }

    res.json({ message: "Produto removido com sucesso." });
  } catch (err) {
    console.error("Erro ao remover produto:", err);
    res.status(500).json({ message: "Erro ao remover produto." });
  }
});

module.exports = router; // Exporta as rotas do módulo
