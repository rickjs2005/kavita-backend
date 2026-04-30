"use strict";
// routes/auth/userRegister.js
//
// Rotas de autenticação montadas em /users:
//   POST /users/register        — cadastro de novo usuário (com CPF)
//   POST /users/forgot-password — envio de link de redefinição de senha
//   POST /users/reset-password  — redefinição de senha com token
//
// Sem CSRF — são pontos de entrada sem sessão autenticada.
// Referência canônica de padrão: routes/auth/authRoutes.js

const express = require("express");
const createAdaptiveRateLimiter = require("../../middleware/adaptiveRateLimiter");
const { registerLimiter: absoluteRegisterLimiter } = require("../../middleware/absoluteRateLimit");
const { register, forgotPassword, resetPassword } = require("../../controllers/authController");
const { validate } = require("../../middleware/validate");
const {
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../../schemas/authSchemas");

const router = express.Router();

const registerLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const email = req.body.email ? req.body.email.toLowerCase() : "anon";
    return `register:${req.ip}:${email}`;
  },
});

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
 *             required: [nome, email, senha, cpf]
 *             properties:
 *               nome:  { type: string, example: "João da Silva" }
 *               email: { type: string, example: "joao@email.com" }
 *               senha: { type: string, example: "minha_senha" }
 *               cpf:   { type: string, example: "111.444.777-35" }
 *     responses:
 *       201:
 *         description: Conta criada com sucesso
 *       400:
 *         description: Dados inválidos
 *       409:
 *         description: E-mail ou CPF já cadastrado
 */
router.post("/register", absoluteRegisterLimiter, registerLimiter, validate(registerSchema), register);

/**
 * @openapi
 * /api/users/forgot-password:
 *   post:
 *     tags: [Public, Usuários]
 *     summary: Envia link de redefinição de senha
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
 *         description: Link de redefinição enviado (resposta neutra por segurança)
 */
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  forgotPassword
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
 *               token:    { type: string }
 *               novaSenha: { type: string }
 *     responses:
 *       200:
 *         description: Senha redefinida com sucesso
 *       401:
 *         description: Token inválido ou expirado
 */
router.post(
  "/reset-password",
  resetPasswordLimiter,
  validate(resetPasswordSchema),
  resetPassword
);

module.exports = router;
