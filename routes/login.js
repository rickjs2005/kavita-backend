// routes/login.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/pool");
const { validate, ValidationError } = require("../middleware/common/validation");
const { serialize } = require("../middleware/common/serialization");

const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  console.warn("⚠️ JWT_SECRET não definido - /api/login não poderá gerar tokens");
}

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
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/LoginSuccess'
 *       400:
 *         description: Requisição inválida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 *       401:
 *         description: Senha incorreta
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 *       404:
 *         description: Usuário não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 *       500:
 *         description: Erro interno do servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 */

router.post(
  "/",
  validate({
    body: (body) => {
      if (!body.email) {
        throw new ValidationError("E-mail é obrigatório", { field: "email" });
      }
      if (!body.senha && !body.password) {
        throw new ValidationError("Senha é obrigatória", { field: "senha" });
      }
      return body;
    },
  }),
  serialize(async (req) => {
    const { email, senha, password } = req.body;
    const plain = senha || password;

    if (!plain) {
      const error = new Error("Senha não fornecida");
      error.status = 400;
      throw error;
    }

    try {
      const [rows] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]);
      if (!rows.length) {
        const error = new Error("Usuário não encontrado");
        error.status = 404;
        throw error;
      }

      const user = rows[0];
      const hash = user.senha || user.senha_hash;
      const ok = hash ? await bcrypt.compare(plain, hash) : false;
      if (!ok) {
        const error = new Error("Senha incorreta");
        error.status = 401;
        throw error;
      }

      if (!SECRET) {
        const error = new Error("JWT_SECRET não configurado");
        error.status = 500;
        throw error;
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        SECRET,
        { expiresIn: "1h" }
      );

      return {
        message: "Login bem-sucedido!",
        token,
        user: { id: user.id, nome: user.nome, email: user.email, role: user.role },
      };
    } catch (err) {
      if (err.status) throw err;
      console.error("Erro no login:", err);
      throw Object.assign(new Error("Erro interno do servidor"), { status: 500 });
    }
  })
);


module.exports = router;
