// ===========================================================
// USERS ROUTES — Cadastro, Esqueci a senha e Reset de senha
// ===========================================================
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const bcrypt = require("bcryptjs"); // Criptografar senhas
const crypto = require("crypto"); // Tokens aleatórios
const nodemailer = require("nodemailer"); // Envio de emails

// Variáveis de ambiente ou fallback
const EMAIL_USER = process.env.EMAIL_USER || "seuemail@gmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS || "suasenha";

// -----------------------------------------------------------
// 🔐 Utilitário para gerar tokens seguros
// -----------------------------------------------------------
const generateToken = () => crypto.randomBytes(32).toString("hex");

// -----------------------------------------------------------
// ✅ Novo validador (cadastro rápido estilo e-commerce)
// -----------------------------------------------------------
const validarCamposBasicos = ({ nome, email, senha }) => {
  return Boolean(nome && email && senha);
};

// ===========================================================
// ✅ POST /register — Cadastro rápido de novo usuário
// ===========================================================
router.post("/register", async (req, res) => {
  const { nome, email, senha } = req.body;

  // 1️⃣ validação mínima
  if (!validarCamposBasicos(req.body)) {
    return res.status(400).json({ mensagem: "Nome, email e senha são obrigatórios." });
  }

  try {
    // 2️⃣ verifica duplicidade de e-mail
    const [rows] = await pool.execute("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (rows.length > 0) {
      return res.status(400).json({ mensagem: "Este e-mail já está cadastrado. Tente outro ou faça login." });
    }

    // 3️⃣ criptografa a senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // 4️⃣ insere novo usuário (mínimo)
    // ⚠️ As colunas extras (endereco, telefone etc.) devem aceitar NULL ou DEFAULT
    await pool.execute(
      "INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)",
      [nome, email, senhaHash]
    );

    // 5️⃣ resposta padronizada
    return res.status(201).json({
      mensagem: "Conta criada com sucesso! Faça login para continuar.",
    });
  } catch (error) {
    console.error("Erro ao cadastrar usuário:", error);
    return res.status(500).json({
      mensagem: "Erro interno no servidor. Tente novamente mais tarde.",
    });
  }
});

/**
 * @openapi
 * /api/users/register:
 *   post:
 *     tags: [Public, Usuários]
 *     summary: Cadastro de novo usuário
 *     description: >
 *       Cria uma nova conta de usuário com nome, email e senha.
 *       (Versão simplificada estilo e-commerce profissional)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, senha]
 *             properties:
 *               nome: { type: string, example: "João da Silva" }
 *               email: { type: string, example: "joao@email.com" }
 *               senha: { type: string, example: "123456" }
 *     responses:
 *       201:
 *         description: Conta criada com sucesso
 *       400:
 *         description: Dados inválidos ou e-mail duplicado
 *       500:
 *         description: Erro interno
 */

// -----------------------------------------------------------
// 📝 VERSÃO COMPLETA DO CADASTRO (comentada para referência futura)
// -----------------------------------------------------------
/*
// 🧪 Função que valida se todos os campos obrigatórios foram preenchidos
const validarCampos = ({
  nome, email, senha, endereco, data_nascimento, telefone,
  pais, estado, cidade, cep, ponto_referencia
}) => {
  return nome && email && senha && endereco && data_nascimento &&
         telefone && pais && estado && cidade && cep && ponto_referencia;
};

// ✅ POST /register — Cadastro completo (mantido comentado)
router.post("/register", async (req, res) => {
  const { nome, email, senha, endereco, data_nascimento, telefone, pais, estado, cidade, cep, ponto_referencia } = req.body;

  if (!validarCampos(req.body)) {
    return res.status(400).json({ mensagem: "Todos os campos são obrigatórios." });
  }

  try {
    const [rows] = await pool.execute("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (rows.length > 0) {
      return res.status(400).json({ mensagem: "Esse e-mail já está cadastrado. Tente outro ou faça login." });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

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
*/

// ===========================================================
// ✅ POST /forgot-password — Enviar link de redefinição de senha
// ===========================================================
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const [rows] = await pool.execute("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (!rows || rows.length === 0) {
      return res.status(200).json({
        mensagem: "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.",
      });
    }

    const user = rows[0];
    const token = generateToken();
    const expires = new Date(Date.now() + 3600000); // 1h

    // salva token no banco
    await pool.execute(
      "UPDATE usuarios SET resetToken = ?, resetTokenExpires = ? WHERE id = ?",
      [token, expires, user.id]
    );

    // configuração do e-mail
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });

    const resetLink = `http://localhost:3000/reset-password?token=${token}`;

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
      mensagem: "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.",
    });
  } catch (error) {
    console.error("Erro em forgot-password:", error);
    return res.status(500).json({
      mensagem: "Erro no servidor. Tente novamente mais tarde.",
    });
  }
});

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

// ===========================================================
// ✅ POST /reset-password — Redefinir senha com token
// ===========================================================
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
    return res.status(500).json({
      mensagem: "Erro no servidor. Tente novamente mais tarde.",
    });
  }
});

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

// ===========================================================
module.exports = router;
