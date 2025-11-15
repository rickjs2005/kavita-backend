// ===========================================================
// USERS ROUTES — Cadastro, Esqueci a senha e Reset de senha
// ===========================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/pool');
const createAdaptiveRateLimiter = require('../middleware/adaptiveRateLimiter');
const AuthController = require('../controllers/authController');

const router = express.Router();

// -----------------------------------------------------------
// ✅ Novo validador (cadastro rápido estilo e-commerce)
// -----------------------------------------------------------
const validarCamposBasicos = ({ nome, email, senha }) => {
  return Boolean(nome && email && senha);
};

const forgotPasswordLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const email = req.body.email ? req.body.email.toLowerCase() : 'anon';
    return `forgot:${req.ip}:${email}`;
  },
});

const resetPasswordLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const token = req.body.token || 'sem-token';
    return `reset:${req.ip}:${token}`;
  },
});

// ===========================================================
// ✅ POST /register — Cadastro rápido de novo usuário
// ===========================================================
router.post('/register', async (req, res) => {
  const { nome, email, senha } = req.body;

  if (!validarCamposBasicos(req.body)) {
    return res.status(400).json({ mensagem: 'Nome, email e senha são obrigatórios.' });
  }

  try {
    const [rows] = await pool.execute('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (rows.length > 0) {
      return res
        .status(400)
        .json({ mensagem: 'Este e-mail já está cadastrado. Tente outro ou faça login.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    await pool.execute('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)', [
      nome,
      email,
      senhaHash,
    ]);

    return res.status(201).json({
      mensagem: 'Conta criada com sucesso! Faça login para continuar.',
    });
  } catch (error) {
    console.error('Erro ao cadastrar usuário:', error);
    return res.status(500).json({
      mensagem: 'Erro interno no servidor. Tente novamente mais tarde.',
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

// ===========================================================
// ✅ POST /forgot-password — Enviar link de redefinição de senha
// ===========================================================
router.post('/forgot-password', forgotPasswordLimiter, (req, res) =>
  AuthController.forgotPassword(req, res)
);

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
router.post('/reset-password', resetPasswordLimiter, (req, res) =>
  AuthController.resetPassword(req, res)
);

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
