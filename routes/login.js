// routes/login.js
const express = require("express");
const router = express.Router();
const { login } = require("../controllers/authController");

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

router.post("/", login);

router.__getRouteHandler = (method, path) => {
  const layer = router.stack.find(
    (entry) => entry.route && entry.route.path === path && entry.route.methods[method]
  );
  return layer?.route?.stack?.at(-1)?.handle;
};

module.exports = router;
