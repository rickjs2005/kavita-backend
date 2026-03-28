// =============================================================================
// ARQUIVO LEGADO — NÃO USE COMO REFERÊNCIA DE IMPLEMENTAÇÃO
// =============================================================================
// Este arquivo usa o padrão antigo: SQL inline na rota, validação manual
// e res.json() direto, sem controller/service/repository separados.
//
// Padrão canônico atual:
//   rota magra → controller → service → repository  (+  Zod em schemas/)
//   Referência: routes/admin/adminDrones.js
//
// Ao modificar este arquivo:
//   - prefira migrar para o padrão canônico na mesma PR
//   - se a mudança for pontual, adicione ou atualize o teste correspondente
//   - nunca amplie o padrão legado com novas rotas neste arquivo
// =============================================================================

// ===========================================================
// USERS ROUTES — Cadastro, Esqueci a senha e Reset de senha
// ===========================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../../config/pool");
const createAdaptiveRateLimiter = require("../../middleware/adaptiveRateLimiter");
const AuthController = require("../../controllers/authController");
const { sanitizeCPF, isValidCPF } = require("../../utils/cpf"); // 👈 AQUI
const { registerValidators, forgotPasswordValidators, resetPasswordValidators } = require("../../validators/authValidator");

const router = express.Router();

const forgotPasswordLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const email = req.body.email ? req.body.email.toLowerCase() : "anon";
    return `forgot:${req.ip}:${email}`;
  },
});

const resetPasswordLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const token = req.body.token || "sem-token";
    return `reset:${req.ip}:${token}`;
  },
});

const registerLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const email = req.body.email ? req.body.email.toLowerCase() : "anon";
    return `register:${req.ip}:${email}`;
  },
});

// ===========================================================
// ✅ POST /register — Cadastro com CPF obrigatório
// ===========================================================
router.post("/register", registerLimiter, registerValidators, async (req, res) => {
  const { nome, email, senha, cpf } = req.body || {};

  const cpfLimpo = sanitizeCPF(cpf);

  try {
    // verifica se já existe usuário com mesmo email OU mesmo CPF
    const [rows] = await pool.execute(
      "SELECT id, email, cpf FROM usuarios WHERE email = ? OR cpf = ?",
      [email, cpfLimpo]
    );

    if (rows.length > 0) {
      const jaEmail = rows.some((u) => u.email === email);
      const jaCpf = rows.some((u) => u.cpf === cpfLimpo);

      if (jaEmail && jaCpf) {
        return res
          .status(400)
          .json({ mensagem: "E-mail e CPF já cadastrados." });
      }
      if (jaEmail) {
        return res
          .status(400)
          .json({ mensagem: "Este e-mail já está cadastrado." });
      }
      if (jaCpf) {
        return res
          .status(400)
          .json({ mensagem: "Este CPF já está cadastrado." });
      }
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    await pool.execute(
      "INSERT INTO usuarios (nome, email, senha, cpf) VALUES (?, ?, ?, ?)",
      [nome, email, senhaHash, cpfLimpo]
    );

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
 *       Cria uma nova conta de usuário com nome, email, senha e CPF.
 *       (Versão simplificada estilo e-commerce profissional)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, senha, cpf]
 *             properties:
 *               nome: { type: string, example: "João da Silva" }
 *               email: { type: string, example: "joao@email.com" }
 *               senha: { type: string, example: "123456" }
 *               cpf:   { type: string, example: "111.111.111-11" }
 *     responses:
 *       201:
 *         description: Conta criada com sucesso
 *       400:
 *         description: Dados inválidos ou e-mail/CPF duplicados
 *       500:
 *         description: Erro interno
 */

// ===========================================================
// ✅ POST /forgot-password — Enviar link de redefinição de senha
// ===========================================================
router.post("/forgot-password", forgotPasswordLimiter, forgotPasswordValidators, (req, res) =>
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
router.post("/reset-password", resetPasswordLimiter, resetPasswordValidators, (req, res) =>
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

module.exports = router;
