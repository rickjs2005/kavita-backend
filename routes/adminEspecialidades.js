const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

// ✅ GET /admin/especialidades — lista todas as especialidades dos colaboradores
router.get("/", verifyAdmin, async (req, res) => {
  try {
    // Busca especialidades com id e nome
    const [rows] = await pool.query("SELECT id, nome FROM especialidades");
    res.json(rows);
  } catch (err) {
    console.error("Erro ao buscar especialidades:", err);
    res.status(500).json({ message: "Erro ao buscar especialidades." });
  }
});

module.exports = router;
