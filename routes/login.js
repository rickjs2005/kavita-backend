// routes/login.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const pool = require("../config/pool");

router.post("/", async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]);
    if (!rows.length) return res.status(401).json({ message: "Usuário não encontrado" });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.senha);
    if (!ok) return res.status(401).json({ message: "Senha incorreta" });

    res.json({ message: "Login bem-sucedido!", user: { id: user.id, nome: user.nome, email: user.email } });
  } catch (err) {
    console.error("Erro no login:", err);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

module.exports = router;
