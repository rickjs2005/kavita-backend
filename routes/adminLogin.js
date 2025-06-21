const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt"); // Utilizado para verificar senhas criptografadas
const jwt = require("jsonwebtoken"); // Utilizado para gerar o token de autenticação
const pool = require("../config/pool"); // Pool de conexão com MySQL
require("dotenv").config(); // Carrega variáveis de ambiente do arquivo .env

const SECRET_KEY = process.env.JWT_SECRET; // Chave secreta para assinar o token JWT

// Verificação de segurança: impede que o servidor rode sem chave JWT definida
if (!SECRET_KEY) {
  throw new Error("❌ JWT_SECRET não definido no .env");
}

// 📌 Rota POST /login — realiza login do administrador
router.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  // Verifica se todos os campos foram preenchidos
  if (!email || !senha) {
    return res.status(400).json({ message: "Email e senha são obrigatórios." });
  }

  try {
    console.log("🔐 Tentativa de login de admin:", email);

    // Busca o admin no banco de dados pelo email
    const [rows] = await pool.query("SELECT * FROM admins WHERE email = ?", [email]);

    if (rows.length === 0) {
      console.warn("⚠️ Admin não encontrado:", email);
      return res.status(404).json({ message: "Admin não encontrado." });
    }

    const admin = rows[0];

    // Compara a senha informada com a hash armazenada no banco
    const senhaCorreta = await bcrypt.compare(senha, admin.senha);

    if (!senhaCorreta) {
      console.warn("⚠️ Senha incorreta para:", email);
      return res.status(401).json({ message: "Senha incorreta." });
    }

    // Gera o token JWT válido por 2 horas
    const token = jwt.sign({ id: admin.id, email: admin.email }, SECRET_KEY, {
      expiresIn: "2h",
    });

    console.log("✅ Login bem-sucedido:", admin.email);

    // Retorna token e dados do admin autenticado
    return res.status(200).json({
      message: "Login realizado com sucesso.",
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        nome: admin.nome,
      },
    });
  } catch (err) {
    console.error("❌ Erro no login do admin:", err.message);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});

module.exports = router;
