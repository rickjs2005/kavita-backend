// routes/login.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const pool = require("../config/pool");

/**
 * @openapi
 * /api/login:
 *   post:
 *     tags: [Public, Autenticação]
 *     summary: Realiza login de usuário comum
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "usuario@email.com" }
 *               password: { type: string, example: "123456" }
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     nome: { type: string }
 *                     email: { type: string }
 *       401:
 *         description: Usuário não encontrado ou senha incorreta
 *       500:
 *         description: Erro interno do servidor
 */

router.post("/", async (req, res) => {
  const { email, senha, password } = req.body;
  const plain = senha || password; // aceita ambos

  try {
    const [rows] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]);
    if (!rows.length) {
      return res.status(401).json({ message: "Usuário não encontrado" });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(plain, user.senha); // ✅ usa plain
    if (!ok) {
      return res.status(401).json({ message: "Senha incorreta" });
    }

    res.json({
      message: "Login bem-sucedido!",
      user: { id: user.id, nome: user.nome, email: user.email },
    });
  } catch (err) {
    console.error("Erro no login:", err);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});


module.exports = router;
