const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const bcrypt = require("bcryptjs"); // Para criptografar senhas
const crypto = require("crypto");    // Para gerar tokens aleatórios
const nodemailer = require("nodemailer"); // Enviar email de recuperação

// Variáveis de ambiente ou fallback
const EMAIL_USER = process.env.EMAIL_USER || "seuemail@gmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS || "suasenha";

// 🧪 Função que valida se todos os campos obrigatórios foram preenchidos
const validarCampos = ({ nome, email, senha, endereco, data_nascimento, telefone, pais, estado, cidade, cep, ponto_referencia }) => {
  return nome && email && senha && endereco && data_nascimento && telefone && pais && estado && cidade && cep && ponto_referencia;
};

// 🔐 Função utilitária para gerar token seguro
const generateToken = () => crypto.randomBytes(32).toString("hex");

// ✅ POST /register — Cadastro de novo usuário
router.post("/register", async (req, res) => {
  const { nome, email, senha, endereco, data_nascimento, telefone, pais, estado, cidade, cep, ponto_referencia } = req.body;

  if (!validarCampos(req.body)) {
    return res.status(400).json({ mensagem: "Todos os campos são obrigatórios." });
  }

  try {
    // Verifica se e-mail já está cadastrado
    const [rows] = await pool.execute("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (rows.length > 0) {
      return res.status(400).json({ mensagem: "Esse e-mail já está cadastrado. Tente outro ou faça login." });
    }

    // Criptografa a senha antes de salvar
    const senhaHash = await bcrypt.hash(senha, 10);

    // Insere o novo usuário
    await pool.execute(`
      INSERT INTO usuarios (nome, email, senha, endereco, data_nascimento, telefone, pais, estado, cidade, cep, ponto_referencia)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [nome, email, senhaHash, endereco, data_nascimento, telefone, pais, estado, cidade, cep, ponto_referencia]);

    res.status(201).json({ mensagem: "Usuário cadastrado com sucesso!" });
  } catch (error) {
    console.error("Erro ao cadastrar usuário:", error);
    res.status(500).json({ mensagem: "Erro no servidor. Tente novamente mais tarde." });
  }
});

/**
 * @openapi
 * /api/users/register:
 *   post:
 *     tags: [Public, Usuários]
 *     summary: Cadastro de novo usuário
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               [nome, email, senha, endereco, data_nascimento, telefone, pais, estado, cidade, cep, ponto_referencia]
 *             properties:
 *               nome: { type: string }
 *               email: { type: string }
 *               senha: { type: string }
 *               endereco: { type: string }
 *               data_nascimento: { type: string, format: date }
 *               telefone: { type: string }
 *               pais: { type: string }
 *               estado: { type: string }
 *               cidade: { type: string }
 *               cep: { type: string }
 *               ponto_referencia: { type: string }
 *     responses:
 *       201:
 *         description: Usuário cadastrado com sucesso
 *       400:
 *         description: Campos obrigatórios ausentes ou email duplicado
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/users/forgot-password:
 *   post:
 *     tags: [Public, Usuários]
 *     summary: Envia email de recuperação de senha
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string, example: "usuario@email.com" }
 *     responses:
 *       200:
 *         description: Email de recuperação enviado (ou silenciosamente ignorado)
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/users/reset-password:
 *   post:
 *     tags: [Public, Usuários]
 *     summary: Redefine senha com token válido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, novaSenha]
 *             properties:
 *               token: { type: string }
 *               novaSenha: { type: string }
 *     responses:
 *       200:
 *         description: Senha redefinida com sucesso
 *       400:
 *         description: Token inválido ou expirado
 *       500:
 *         description: Erro interno
 */

// ✅ POST /forgot-password — Enviar link de redefinição de senha
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const [rows] = await pool.execute("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (!rows || rows.length === 0) {
      return res.status(200).json({
        mensagem: "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha."
      });
    }

    const user = rows[0];
    const token = generateToken(); // Gera um token único
    const expires = new Date(Date.now() + 3600000); // Expira em 1h

    // Salva o token no banco com data de validade
    await pool.execute(
      "UPDATE usuarios SET resetToken = ?, resetTokenExpires = ? WHERE id = ?",
      [token, expires, user.id]
    );

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });

    const resetLink = `http://localhost:3000/reset-password?token=${token}`; // Link para o frontend

    // Envia e-mail de recuperação
    await transporter.sendMail({
      from: `"Suporte" <${EMAIL_USER}>`,
      to: email,
      subject: "Redefinição de Senha",
      html: `
        <p>Você solicitou a redefinição de senha.</p>
        <p>Clique aqui para redefinir: <a href="${resetLink}">${resetLink}</a></p>
        <p>Se você não solicitou isso, ignore este e-mail.</p>
      `,
    });

    return res.status(200).json({
      mensagem: "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha."
    });
  } catch (error) {
    console.error("Erro em forgot-password:", error);
    return res.status(500).json({ mensagem: "Erro no servidor. Tente novamente mais tarde." });
  }
});

// ✅ POST /reset-password — Redefinir a senha com token
router.post("/reset-password", async (req, res) => {
  try {
    const { token, novaSenha } = req.body;

    const [rows] = await pool.execute(
      "SELECT id FROM usuarios WHERE resetToken = ? AND resetTokenExpires > NOW()",
      [token]
    );

    if (!rows || rows.length === 0) {
      return res.status(400).json({ mensagem: "Token inválido ou expirado." });
    }

    const user = rows[0];
    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

    await pool.execute(
      "UPDATE usuarios SET senha = ?, resetToken = NULL, resetTokenExpires = NULL WHERE id = ?",
      [novaSenhaHash, user.id]
    );

    return res.status(200).json({ mensagem: "Senha redefinida com sucesso!" });
  } catch (error) {
    console.error("Erro em reset-password:", error);
    return res.status(500).json({ mensagem: "Erro no servidor. Tente novamente mais tarde." });
  }
});

module.exports = router;
