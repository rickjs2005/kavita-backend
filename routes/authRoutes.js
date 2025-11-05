const express = require('express');
const { forgotPassword, resetPassword } = require('../controllers/authController'); 
// Importa as funções responsáveis por lidar com a lógica de recuperação de senha

const router = express.Router(); // Cria um roteador Express para definir rotas relacionadas à autenticação

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

// 🔐 POST /forgot-password — Envia link de redefinição de senha para o email do usuário
router.post('/forgot-password', forgotPassword);
// Exemplo: o usuário informa o email, e a aplicação envia um email com link de redefinição (com token)

// 🔐 POST /reset-password — Atualiza a senha usando o token recebido no email
router.post('/reset-password', resetPassword);
// Exemplo: o frontend envia nova senha + token, e a senha é atualizada no banco de dados

module.exports = router; // Exporta o roteador para uso no app principal
