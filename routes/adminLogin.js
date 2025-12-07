// routes/adminLogin.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/pool");
const logAdminAction = require("../utils/adminLogger");
const verifyAdmin = require("../middleware/verifyAdmin");
require("dotenv").config();

const SECRET_KEY = process.env.JWT_SECRET;

// Verificação de segurança: impede que o servidor rode sem chave JWT definida
if (!SECRET_KEY) {
  throw new Error("❌ JWT_SECRET não definido no .env");
}

const COOKIE_NAME = "adminToken";
const COOKIE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h

/**
 * Carrega as permissões granulares do admin com base no role (slug).
 *
 * @param {number} adminId - ID do administrador
 * @returns {Promise<string[]>} - Lista de chaves de permissão (ex: ["admin.logs.view", "admin.config.edit"])
 */
async function getAdminPermissions(adminId) {
  if (!adminId) return [];

  const [rows] = await pool.query(
    `
      SELECT DISTINCT p.chave
      FROM admins a
      JOIN admin_roles r
        ON r.slug = a.role
      JOIN admin_role_permissions rp
        ON rp.role_id = r.id
      JOIN admin_permissions p
        ON p.id = rp.permission_id
      WHERE a.id = ?
    `,
    [adminId]
  );

  return rows.map((r) => r.chave);
}

/**
 * @openapi
 * /api/admin/login:
 *   post:
 *     tags: [Public, Login]
 *     summary: Realiza login de administrador e gera token JWT
 *     description: |
 *       Autentica um administrador pelo e-mail e senha, gera um token JWT com
 *       **id**, **email**, **role**, **role_id** e **permissions** e o envia em um
 *       **cookie HttpOnly (`adminToken`)**, recomendado para uso no painel admin.
 *
 *       O corpo da resposta ainda traz o campo `token` apenas por compatibilidade,
 *       mas o front-end do painel **não deve armazená-lo** – toda autenticação
 *       deve depender exclusivamente do cookie HttpOnly.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, senha]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "admin@kavita.com"
 *               senha:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login bem-sucedido, retorna token JWT (apenas informativo) e dados do admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Login realizado com sucesso."
 *                 token:
 *                   type: string
 *                   description: Token JWT (também enviado em cookie HttpOnly `adminToken`)
 *                 admin:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     email:
 *                       type: string
 *                       example: "admin@kavita.com"
 *                     nome:
 *                       type: string
 *                       example: "Admin Master"
 *                     role:
 *                       type: string
 *                       example: "master"
 *                     role_id:
 *                       type: integer
 *                       nullable: true
 *                       example: 1
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example:
 *                         - "admin.logs.view"
 *                         - "admin.config.edit"
 *       400:
 *         description: Campos obrigatórios ausentes
 *       404:
 *         description: Admin não encontrado
 *       401:
 *         description: Senha incorreta
 *       500:
 *         description: Erro interno no servidor
 */

// 📌 POST /api/admin/login — realiza login do administrador
router.post("/login", async (req, res) => {
  const { email, senha } = req.body || {};

  // Rate limiter vindo do middleware global (fallback vazio para não quebrar)
  const rateLimit = req.rateLimit || { fail: () => {}, reset: () => {} };

  // 1. Validação básica
  if (!email || !senha) {
    rateLimit.fail();
    return res
      .status(400)
      .json({ message: "Email e senha são obrigatórios." });
  }

  const emailNormalizado = String(email).trim().toLowerCase();

  try {
    console.log("🔐 Tentativa de login de admin:", emailNormalizado);

    // 2. Busca o admin no banco de dados pelo email + role_id via admin_roles
    const [rows] = await pool.query(
      `
        SELECT
          a.id,
          a.nome,
          a.email,
          a.senha,
          a.role,
          r.id AS role_id
        FROM admins a
        LEFT JOIN admin_roles r
          ON r.slug = a.role
        WHERE a.email = ?
      `,
      [emailNormalizado]
    );

    if (!rows || rows.length === 0) {
      rateLimit.fail();
      console.warn("⚠️ Admin não encontrado:", emailNormalizado);
      return res.status(404).json({ message: "Admin não encontrado." });
    }

    const admin = rows[0];

    // 3. Compara a senha informada com a hash armazenada no banco
    const senhaCorreta = await bcrypt.compare(String(senha), admin.senha);

    if (!senhaCorreta) {
      rateLimit.fail();
      console.warn("⚠️ Senha incorreta para:", emailNormalizado);
      return res.status(401).json({ message: "Senha incorreta." });
    }

    // 4. Sucesso: reseta contador de falhas
    rateLimit.reset();

    // 5. Carrega permissões corporativas para esse admin
    const permissions = await getAdminPermissions(admin.id);

    // 6. Gera o token JWT com role_id, role e permissions (2h de duração)
    const tokenPayload = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      role_id: admin.role_id || null,
      permissions, // array de strings (chaves)
    };

    const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: "2h" });

    // 6.1 Atualiza último login no banco
    try {
      await pool.query(
        "UPDATE admins SET ultimo_login = NOW() WHERE id = ?",
        [admin.id]
      );
    } catch (updateErr) {
      console.warn(
        "⚠️ Não foi possível atualizar ultimo_login para admin:",
        admin.id,
        updateErr
      );
      // não quebra o fluxo de login por causa disso
    }

    console.log("✅ Login bem-sucedido:", admin.email);

    // 7. Registra log de auditoria
    logAdminAction({
      adminId: admin.id,
      acao: "login_sucesso",
      entidade: "admin",
      entidadeId: admin.id,
    });

    // 8. Define cookie HttpOnly com o token JWT
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    };

    res.cookie(COOKIE_NAME, token, cookieOptions);

    // 9. Retorna token e dados do admin (token é apenas informativo para outros clientes)
    return res.status(200).json({
      message: "Login realizado com sucesso.",
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        nome: admin.nome,
        role: admin.role,
        role_id: admin.role_id || null,
        permissions,
      },
    });
  } catch (err) {
    // Em caso de erro interno também conta como falha para o rate limit
    rateLimit.fail();
    console.error("❌ Erro no login do admin:", err);
    return res
      .status(500)
      .json({ message: "Erro interno no servidor ao fazer login." });
  }
});

/**
 * @openapi
 * /api/admin/me:
 *   get:
 *     tags: [Admin]
 *     summary: Retorna o administrador autenticado (perfil atual)
 *     description: >
 *       Retorna os dados do administrador autenticado com base no token JWT
 *       enviado em cookie HttpOnly (`adminToken`) ou no header Authorization.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do administrador autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 nome:
 *                   type: string
 *                   example: "Admin Master"
 *                 email:
 *                   type: string
 *                   example: "admin@kavita.com"
 *                 role:
 *                   type: string
 *                   example: "master"
 *                 role_id:
 *                   type: integer
 *                   nullable: true
 *                   example: 1
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example:
 *                     - "admin.logs.view"
 *                     - "admin.config.edit"
 *       401:
 *         description: Token ausente ou inválido
 *       404:
 *         description: Admin não encontrado
 *       500:
 *         description: Erro interno no servidor
 */

// 📌 GET /api/admin/me — retorna o administrador logado
router.get("/me", verifyAdmin, async (req, res) => {
  try {
    const adminId = req.admin && req.admin.id;

    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Token inválido ou administrador não autenticado." });
    }

    const [rows] = await pool.query(
      `
        SELECT
          a.id,
          a.nome,
          a.email,
          a.role,
          r.id AS role_id
        FROM admins a
        LEFT JOIN admin_roles r
          ON r.slug = a.role
        WHERE a.id = ?
      `,
      [adminId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Admin não encontrado" });
    }

    const admin = rows[0];

    // Recarrega as permissões para garantir que estejam atualizadas
    const permissions = await getAdminPermissions(admin.id);

    return res.status(200).json({
      id: admin.id,
      nome: admin.nome,
      email: admin.email,
      role: admin.role,
      role_id: admin.role_id || null,
      permissions,
    });
  } catch (err) {
    console.error("❌ Erro ao carregar perfil do admin (/me):", err);
    return res
      .status(500)
      .json({ message: "Erro interno ao carregar perfil do admin." });
  }
});

/**
 * @openapi
 * /api/admin/logout:
 *   post:
 *     tags: [Admin]
 *     summary: Faz logout do administrador
 *     description: >
 *       Limpa o cookie HttpOnly (`adminToken`) e encerra a sessão do administrador.
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso.
 */
router.post("/logout", (req, res) => {
  const clearOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  };

  res.clearCookie(COOKIE_NAME, clearOptions);

  return res.status(200).json({
    message: "Logout realizado com sucesso.",
  });
});

module.exports = router;
