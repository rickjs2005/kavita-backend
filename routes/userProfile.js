// routes/userProfile.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

// -----------------------------------------------------
// Origem do userId (cookie, header ou query)
//  - Em produção, troque por autenticação real (JWT/cookie HttpOnly)
// -----------------------------------------------------
function getUserId(req) {
  const h = req.headers || {};
  const cookie = (h.cookie || "").match(/(?:^|;\s*)userId=([^;]+)/i)?.[1];
  return (
    Number(h["x-user-id"]) || // enviado pelo frontend
    Number(req.query.userId) ||
    Number(cookie) ||
    null
  );
}

// Campos permitidos para edição
const EDITABLE = new Set([
  "nome",
  "telefone",
  "endereco",
  "cidade",
  "estado",
  "cep",
  "pais",
  "ponto_referencia",
]);
/**
 * @openapi
 * components:
 *   schemas:
 *     UserProfile:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 12 }
 *         nome: { type: string, example: "Lucifer" }
 *         email: { type: string, format: email, example: "lucifer@gmail.com" }
 *         telefone: { type: string, nullable: true, example: "+55 31 98888-7777" }
 *         endereco: { type: string, nullable: true, example: "Rua das Flores, 123 - Centro" }
 *         cidade: { type: string, nullable: true, example: "Belo Horizonte" }
 *         estado: { type: string, nullable: true, example: "MG" }
 *         cep: { type: string, nullable: true, example: "30140-120" }
 *         pais: { type: string, nullable: true, example: "Brasil" }
 *         ponto_referencia: { type: string, nullable: true, example: "Próximo à praça" }
 *
 *     UserProfileUpdate:
 *       type: object
 *       description: Envie apenas campos que deseja alterar. String vazia ("") zera o campo (vira NULL).
 *       properties:
 *         nome: { type: string, example: "Rick" }
 *         telefone: { type: string, nullable: true, example: "" }
 *         endereco: { type: string, nullable: true, example: "Av. Brasil, 500 - Centro" }
 *         cidade: { type: string, nullable: true, example: "São Paulo" }
 *         estado: { type: string, nullable: true, example: "SP" }
 *         cep: { type: string, nullable: true, example: "01010-000" }
 *         pais: { type: string, nullable: true, example: "Brasil" }
 *         ponto_referencia: { type: string, nullable: true, example: "Ao lado do mercado" }
 *
 *   parameters:
 *     XUserId:
 *       in: header
 *       name: x-user-id
 *       description: ID do usuário autenticado (neste projeto, o front envia esse header após o login).
 *       required: true
 *       schema: { type: integer, example: 12 }
 *
 *   responses:
 *     Unauthorized:
 *       description: Não autenticado.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mensagem: { type: string, example: "Não autenticado." }
 *
 *     NotFoundUser:
 *       description: Usuário não encontrado.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mensagem: { type: string, example: "Usuário não encontrado." }
 *
 * tags:
 *   - name: User Profile
 *     description: Endpoints para o próprio usuário ver/atualizar seus dados (usa header x-user-id)
 *   - name: Admin - Users
 *     description: Endpoints de administração para consultar/editar qualquer usuário
 */

// -----------------------------------------------------
// GET /api/users/me  -> retorna dados do usuário logado
// -----------------------------------------------------
router.get("/me", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ mensagem: "Não autenticado." });

  try {
    const [rows] = await pool.query(
      `SELECT id, nome, email, telefone, endereco, cidade, estado, cep, pais, ponto_referencia
       FROM usuarios
       WHERE id = ?`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ mensagem: "Usuário não encontrado." });
    // Retorna nulos para campos não preenchidos (compatível com a sua UI)
    return res.json(rows[0]);
  } catch (e) {
    console.error("GET /me erro:", e);
    return res.status(500).json({ mensagem: "Erro interno." });
  }
});

// -----------------------------------------------------
// PUT /api/users/me  -> atualiza somente os campos enviados
// - string vazia "" limpa o campo (vira NULL)
// -----------------------------------------------------
router.put("/me", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ mensagem: "Não autenticado." });

  const body = req.body || {};
  const sets = [];
  const values = [];

  Object.keys(body).forEach((k) => {
    if (!EDITABLE.has(k)) return;
    const v = body[k];
    // "" -> NULL ; demais valores mantidos
    if (v === "") {
      sets.push(`${k} = NULL`);
    } else {
      sets.push(`${k} = ?`);
      values.push(v);
    }
  });

  if (sets.length === 0) {
    return res.status(400).json({ mensagem: "Nada para atualizar." });
  }

  try {
    await pool.query(`UPDATE usuarios SET ${sets.join(", ")} WHERE id = ?`, [
      ...values,
      userId,
    ]);

    const [rows] = await pool.query(
      `SELECT id, nome, email, telefone, endereco, cidade, estado, cep, pais, ponto_referencia
       FROM usuarios
       WHERE id = ?`,
      [userId]
    );

    return res.json(rows[0]);
  } catch (e) {
    console.error("PUT /me erro:", e);
    return res.status(500).json({ mensagem: "Erro interno ao salvar." });
  }
});

// -----------------------------------------------------
// (Opcional) Rotas de ADMIN para editar qualquer usuário
// GET /api/admin/users/:id
// PUT /api/admin/users/:id
// -----------------------------------------------------
router.get("/admin/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ mensagem: "ID inválido." });
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, email, telefone, endereco, cidade, estado, cep, pais, ponto_referencia
       FROM usuarios WHERE id = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ mensagem: "Usuário não encontrado." });
    return res.json(rows[0]);
  } catch (e) {
    console.error("ADMIN GET erro:", e);
    return res.status(500).json({ mensagem: "Erro interno." });
  }
});

router.put("/admin/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ mensagem: "ID inválido." });

  const body = req.body || {};
  const sets = [];
  const values = [];
  Object.keys(body).forEach((k) => {
    if (!EDITABLE.has(k)) return;
    const v = body[k];
    if (v === "") {
      sets.push(`${k} = NULL`);
    } else {
      sets.push(`${k} = ?`);
      values.push(v);
    }
  });

  if (!sets.length) return res.status(400).json({ mensagem: "Nada para atualizar." });

  try {
    await pool.query(`UPDATE usuarios SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
    const [rows] = await pool.query(
      `SELECT id, nome, email, telefone, endereco, cidade, estado, cep, pais, ponto_referencia
       FROM usuarios WHERE id = ?`,
      [id]
    );
    return res.json(rows[0]);
  } catch (e) {
    console.error("ADMIN PUT erro:", e);
    return res.status(500).json({ mensagem: "Erro interno." });
  }
});

module.exports = router;
