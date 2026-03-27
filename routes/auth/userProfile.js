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

// routes/userProfile.js
const express = require("express");
const router = express.Router();
const userRepo = require("../../repositories/userRepository");
const { sanitizeCPF, isValidCPF } = require("../../utils/cpf");
const authenticateToken = require("../../middleware/authenticateToken");
const verifyAdmin = require("../../middleware/verifyAdmin");
const { sanitizeText } = require("../../utils/sanitize");

// Campos permitidos para edição com limites de comprimento e sanitização
const EDITABLE = new Set([
  "nome",
  "telefone",
  "endereco",
  "cidade",
  "estado",
  "cep",
  "pais",
  "ponto_referencia",
  "cpf",
]);

// Comprimento máximo por campo (para validação de valor, não só da coluna SQL)
const FIELD_MAX_LENGTH = {
  nome:            100,
  telefone:         30,
  endereco:        255,
  cidade:          100,
  estado:           50,
  cep:              20,
  pais:             80,
  ponto_referencia: 200,
};

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
 *         cpf: { type: string, nullable: true, example: "111.111.111-11" }
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
 *         cpf: { type: string, nullable: true, example: "111.111.111-11" }
 *         endereco: { type: string, nullable: true, example: "Av. Brasil, 500 - Centro" }
 *         cidade: { type: string, nullable: true, example: "São Paulo" }
 *         estado: { type: string, nullable: true, example: "SP" }
 *         cep: { type: string, nullable: true, example: "01010-000" }
 *         pais: { type: string, nullable: true, example: "Brasil" }
 *         ponto_referencia: { type: string, nullable: true, example: "Ao lado do mercado" }
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
 *     description: Endpoints para o próprio usuário ver/atualizar seus dados (usa JWT em cookie HttpOnly ou Bearer)
 *   - name: Admin - Users
 *     description: Endpoints de administração para consultar/editar qualquer usuário
 */

// -----------------------------------------------------
// GET /api/users/me  -> retorna dados do usuário logado
// -----------------------------------------------------
router.get("/me", authenticateToken, async (req, res) => {
  const userId = req.user && req.user.id;
  if (!userId) {
    return res.status(401).json({ mensagem: "Não autenticado." });
  }

  try {
    const user = await userRepo.findProfileById(userId);
    if (!user) {
      return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }
    return res.json(user);
  } catch (e) {
    console.error("GET /me erro:", e);
    return res.status(500).json({ mensagem: "Erro interno." });
  }
});

// -----------------------------------------------------
// PUT /api/users/me  -> atualiza somente os campos enviados
// - string vazia "" limpa o campo (vira NULL)
// - CPF é validado e checado se não está em outro usuário
// -----------------------------------------------------
router.put("/me", authenticateToken, async (req, res) => {
  const userId = req.user && req.user.id;
  if (!userId) {
    return res.status(401).json({ mensagem: "Não autenticado." });
  }

  const body = req.body || {};
  const sets = [];
  const values = [];

  try {
    // trata CPF separado
    if (Object.prototype.hasOwnProperty.call(body, "cpf")) {
      const v = body.cpf;
      if (v === "") {
        sets.push("cpf = NULL");
      } else {
        const cpfLimpo = sanitizeCPF(v);
        if (!isValidCPF(cpfLimpo)) {
          return res.status(400).json({ mensagem: "CPF inválido." });
        }

        if (await userRepo.cpfExistsForOtherUser(cpfLimpo, userId)) {
          return res
            .status(409)
            .json({ mensagem: "CPF já cadastrado para outro usuário." });
        }

        sets.push("cpf = ?");
        values.push(cpfLimpo);
      }
    }

    // demais campos dinâmicos
    for (const k of Object.keys(body)) {
      if (k === "cpf") continue;
      if (!EDITABLE.has(k)) continue;
      const raw = body[k];
      if (raw === "" || raw === null || raw === undefined) {
        sets.push(`${k} = NULL`);
      } else {
        const strVal = String(raw);
        const maxLen = FIELD_MAX_LENGTH[k] || 255;
        if (strVal.length > maxLen) {
          return res.status(400).json({ mensagem: `Campo '${k}' excede o tamanho máximo de ${maxLen} caracteres.` });
        }
        sets.push(`${k} = ?`);
        values.push(sanitizeText(strVal, maxLen));
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ mensagem: "Nada para atualizar." });
    }

    await userRepo.updateUserById(userId, sets, values);

    const updated = await userRepo.findProfileById(userId);
    return res.json(updated);
  } catch (e) {
    console.error("PUT /me erro:", e);
    return res.status(500).json({ mensagem: "Erro interno ao salvar." });
  }
});

// -----------------------------------------------------
// ✅ Rotas de ADMIN (endurecidas)
// GET /api/users/admin/:id
// PUT /api/users/admin/:id
// -----------------------------------------------------
router.get("/admin/:id", verifyAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ mensagem: "ID inválido." });

  try {
    const user = await userRepo.findProfileByIdAdmin(id);
    if (!user) {
      return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }
    return res.json(user);
  } catch (e) {
    console.error("ADMIN GET erro:", e);
    return res.status(500).json({ mensagem: "Erro interno." });
  }
});

router.put("/admin/:id", verifyAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ mensagem: "ID inválido." });

  const body = req.body || {};
  const sets = [];
  const values = [];

  try {
    // CPF com validação e verificação de duplicidade
    if (Object.prototype.hasOwnProperty.call(body, "cpf")) {
      const v = body.cpf;
      if (v === "") {
        sets.push("cpf = NULL");
      } else {
        const cpfLimpo = sanitizeCPF(v);
        if (!isValidCPF(cpfLimpo)) {
          return res.status(400).json({ mensagem: "CPF inválido." });
        }

        if (await userRepo.cpfExistsForOtherUser(cpfLimpo, id)) {
          return res
            .status(409)
            .json({ mensagem: "CPF já cadastrado para outro usuário." });
        }

        sets.push("cpf = ?");
        values.push(cpfLimpo);
      }
    }

    for (const k of Object.keys(body)) {
      if (k === "cpf") continue;
      if (!EDITABLE.has(k)) continue;

      const raw = body[k];
      if (raw === "" || raw === null || raw === undefined) {
        sets.push(`${k} = NULL`);
      } else {
        const strVal = String(raw);
        const maxLen = FIELD_MAX_LENGTH[k] || 255;
        if (strVal.length > maxLen) {
          return res.status(400).json({ mensagem: `Campo '${k}' excede o tamanho máximo de ${maxLen} caracteres.` });
        }
        sets.push(`${k} = ?`);
        values.push(sanitizeText(strVal, maxLen));
      }
    }

    if (!sets.length) {
      return res.status(400).json({ mensagem: "Nada para atualizar." });
    }

    await userRepo.updateUserById(id, sets, values);

    const updated = await userRepo.findProfileByIdAdmin(id);
    if (!updated) {
      return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }
    return res.json(updated);
  } catch (e) {
    console.error("ADMIN PUT erro:", e);
    return res.status(500).json({ mensagem: "Erro interno." });
  }
});

module.exports = router;
