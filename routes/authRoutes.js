const express = require('express');
const AuthController = require('../controllers/authController');
const createAdaptiveRateLimiter = require('../middleware/adaptiveRateLimiter');

const router = express.Router();

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

/**
 * @openapi
 * /api/forgot-password:
 *   post:
 *     tags: [Public, Autenticação]
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
 *         description: Link de redefinição enviado
 *       400:
 *         description: Email inválido
 *       500:
 *         description: Erro interno
 */
router.post('/forgot-password', forgotPasswordLimiter, (req, res) =>
  AuthController.forgotPassword(req, res)
);

/**
 * @openapi
 * /api/reset-password:
 *   post:
 *     tags: [Public, Autenticação]
 *     summary: Redefine a senha usando o token recebido por email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
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
router.post('/reset-password', resetPasswordLimiter, (req, res) =>
  AuthController.resetPassword(req, res)
);

module.exports = router;
