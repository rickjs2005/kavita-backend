// routes/products.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool"); // <— use o mesmo pool do resto do projeto

function normalize(input) {
  if (!input) return "";
  const s = String(input).trim();
  if (/^\d+$/.test(s)) return s;              // id numérico
  return s.replace(/-/g, " ").trim();         // pragas-e-insetos -> pragas e insetos
}

// GET /api/products?category=<all|id|nome|slug>
router.get("/", async (req, res) => {
  try {
    const { category } = req.query;
    if (!category) return res.status(400).json({ message: "Categoria não informada." });

    // all -> retorna todos
    if (category === "all") {
      const [rows] = await pool.query("SELECT * FROM products");
      return res.json(rows);
    }

    // id numérico -> busca direta
    if (/^\d+$/.test(category)) {
      const [rows] = await pool.execute(
        "SELECT * FROM products WHERE category_id = ?",
        [Number(category)]
      );
      return res.json(rows);
    }

    // nome/slug -> resolve category_id
    const name = normalize(category);
    const [cat] = await pool.execute(
      "SELECT id FROM categories WHERE LOWER(name) = LOWER(?)",
      [name]
    );
    if (!cat.length) return res.status(404).json({ message: "Categoria não encontrada." });

    const [rows] = await pool.execute(
      "SELECT * FROM products WHERE category_id = ?",
      [cat[0].id]
    );
    res.json(rows);
  } catch (err) {
    console.error("[GET /api/products] Erro:", err);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

module.exports = router;
