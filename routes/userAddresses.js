const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authenticateToken = require("../middleware/authenticateToken");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/* ------------------------------------------------------------------ */
/*                               Swagger                              */
/* ------------------------------------------------------------------ */
/**
 * @openapi
 * tags:
 *   - name: Endereços do Usuário
 *     description: CRUD de endereços do usuário (URBANA e RURAL)
 *
 * components:
 *   schemas:
 *     UserAddress:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 10
 *         apelido:
 *           type: string
 *           nullable: true
 *           example: "Casa"
 *         cep:
 *           type: string
 *           example: "36900070"
 *         endereco:
 *           type: string
 *           nullable: true
 *           example: "Rua das Flores"
 *           description: |
 *             Para URBANA: corresponde ao logradouro/rua.
 *             Aceita aliases no payload: endereco | rua | logradouro (o backend normaliza).
 *         rua:
 *           type: string
 *           nullable: true
 *           example: "Rua das Flores"
 *           description: "Alias aceito no payload (não é salvo separadamente; vira 'endereco')."
 *         logradouro:
 *           type: string
 *           nullable: true
 *           example: "Rua das Flores"
 *           description: "Alias aceito no payload (não é salvo separadamente; vira 'endereco')."
 *         numero:
 *           type: string
 *           nullable: true
 *           example: "288"
 *           description: |
 *             Para URBANA: obrigatório, a menos que sem_numero=true (neste caso salva como 'S/N').
 *         sem_numero:
 *           type: boolean
 *           nullable: true
 *           example: false
 *           description: "Se true, permite endereço sem número (URBANA)."
 *         bairro:
 *           type: string
 *           nullable: true
 *           example: "Centro"
 *         cidade:
 *           type: string
 *           example: "Manhuaçu"
 *         estado:
 *           type: string
 *           example: "MG"
 *         complemento:
 *           type: string
 *           nullable: true
 *           example: "Apto 202"
 *         ponto_referencia:
 *           type: string
 *           nullable: true
 *           example: "Perto da igreja"
 *           description: |
 *             Aceita aliases no payload: ponto_referencia | referencia | complemento (o backend normaliza).
 *         telefone:
 *           type: string
 *           nullable: true
 *           example: "(33) 99999-9999"
 *         is_default:
 *           type: integer
 *           example: 1
 *           description: "1=default, 0=não default"
 *         tipo_localidade:
 *           type: string
 *           enum: [URBANA, RURAL]
 *           example: "URBANA"
 *         comunidade:
 *           type: string
 *           nullable: true
 *           example: "Córrego São José"
 *           description: "Obrigatório quando tipo_localidade=RURAL."
 *         observacoes_acesso:
 *           type: string
 *           nullable: true
 *           example: "Estrada de terra, entrar após a ponte."
 *           description: |
 *             Obrigatório quando tipo_localidade=RURAL.
 *             Pode ser enviado como observacoes_acesso OU via ponto_referencia.
 *
 *     UserAddressCreateRequest:
 *       type: object
 *       required: [cep, cidade, estado]
 *       properties:
 *         apelido: { type: string, example: "Casa" }
 *         cep: { type: string, example: "36900070" }
 *         tipo_localidade:
 *           type: string
 *           enum: [URBANA, RURAL]
 *           example: "URBANA"
 *         endereco:
 *           type: string
 *           example: "Rua das Flores"
 *         rua:
 *           type: string
 *           example: "Rua das Flores"
 *         logradouro:
 *           type: string
 *           example: "Rua das Flores"
 *         bairro:
 *           type: string
 *           example: "Centro"
 *         numero:
 *           type: string
 *           example: "288"
 *         sem_numero:
 *           type: boolean
 *           example: false
 *         complemento:
 *           type: string
 *           example: "Apto 202"
 *         ponto_referencia:
 *           type: string
 *           example: "Perto da igreja"
 *         referencia:
 *           type: string
 *           example: "Perto da igreja"
 *         observacoes_acesso:
 *           type: string
 *           example: "Estrada de terra, entrar após a ponte."
 *         comunidade:
 *           type: string
 *           example: "Córrego São José"
 *         telefone:
 *           type: string
 *           example: "(33) 99999-9999"
 *         is_default:
 *           type: integer
 *           example: 1
 *
 *     ApiSuccess:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 */

/**
 * @openapi
 * /api/users/addresses:
 *   get:
 *     tags: [Endereços do Usuário]
 *     summary: Lista endereços do usuário autenticado (com is_default)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de endereços
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserAddress'
 *       401:
 *         description: Não autenticado
 *
 *   post:
 *     tags: [Endereços do Usuário]
 *     summary: Cria um novo endereço (URBANA ou RURAL)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserAddressCreateRequest'
 *     responses:
 *       201:
 *         description: Criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       400:
 *         description: Validação
 *       401:
 *         description: Não autenticado
 *
 * /api/users/addresses/{id}:
 *   put:
 *     tags: [Endereços do Usuário]
 *     summary: Atualiza um endereço do usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserAddressCreateRequest'
 *     responses:
 *       200:
 *         description: Atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       404:
 *         description: Endereço não encontrado
 *
 *   delete:
 *     tags: [Endereços do Usuário]
 *     summary: Remove um endereço do usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Removido com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccess'
 *       404:
 *         description: Endereço não encontrado
 */

/* =========================================================
   Helpers
========================================================= */

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function asStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function upper(v, fallback = "") {
  const s = asStr(v);
  return s ? s.toUpperCase() : fallback;
}

function onlyDigits(s) {
  return String(s || "").replace(/\D+/g, "");
}

function normalizeCep(cep) {
  const d = onlyDigits(cep);
  // aceita 8 dígitos como padrão BR; se vier outro tamanho, ainda salva como string (não quebra),
  // mas valida presença.
  return d || asStr(cep);
}

function normalizeTipoLocalidade(raw) {
  const t = upper(raw, "URBANA");
  return t === "RURAL" ? "RURAL" : "URBANA";
}

/**
 * Normaliza payload de endereço para ficar compatível com o contrato do checkout:
 * - logradouro/rua -> endereco
 * - referencia -> ponto_referencia
 * - complemento pode ser usado como referencia (compatibilidade)
 * - sem_numero permite numero ausente (URBANA) e salva como "S/N"
 * - RURAL exige comunidade e observacoes_acesso OU ponto_referencia
 * - Para manter compatibilidade com DB antigo: se campos clássicos vierem vazios em RURAL,
 *   preenche placeholders ("RURAL", "S/N", etc.) para evitar NOT NULL quebrando.
 */
function normalizeUserAddressInput(raw) {
  const b = raw && typeof raw === "object" ? raw : {};

  const tipo_localidade = normalizeTipoLocalidade(b.tipo_localidade);

  const endereco =
    asStr(b.endereco) || asStr(b.rua) || asStr(b.logradouro) || "";

  const ponto_referencia =
    asStr(b.ponto_referencia) || asStr(b.referencia) || asStr(b.complemento) || "";

  const observacoes_acesso = asStr(b.observacoes_acesso);
  const comunidade = asStr(b.comunidade);

  const sem_numero =
    b.sem_numero === true ||
    String(b.sem_numero).toLowerCase() === "true" ||
    String(b.sem_numero) === "1";

  let numero = asStr(b.numero);
  if (!numero && sem_numero) numero = "S/N";

  const bairro = asStr(b.bairro);
  const cidade = asStr(b.cidade);
  const estado = upper(b.estado);
  const cep = normalizeCep(b.cep);

  const complemento = asStr(b.complemento);
  const telefone = asStr(b.telefone);
  const apelido = asStr(b.apelido);

  const is_default =
    b.is_default === 1 ||
    b.is_default === true ||
    String(b.is_default) === "1" ||
    String(b.is_default).toLowerCase() === "true";

  // Regras:
  const errors = [];

  // comuns
  if (!isNonEmptyString(cep)) errors.push("cep é obrigatório.");
  if (!isNonEmptyString(cidade)) errors.push("cidade é obrigatória.");
  if (!isNonEmptyString(estado)) errors.push("estado é obrigatório.");

  if (tipo_localidade === "URBANA") {
    if (!isNonEmptyString(endereco)) errors.push("endereco (ou rua/logradouro) é obrigatório para URBANA.");
    if (!isNonEmptyString(bairro)) errors.push("bairro é obrigatório para URBANA.");

    // número obrigatório, exceto sem_numero
    if (!isNonEmptyString(numero)) {
      errors.push("numero é obrigatório para URBANA (ou use sem_numero=true).");
    }
  } else {
    // RURAL
    if (!isNonEmptyString(comunidade)) errors.push("comunidade é obrigatória para RURAL.");

    const ref = observacoes_acesso || ponto_referencia;
    if (!isNonEmptyString(ref)) {
      errors.push("observacoes_acesso (ou ponto_referencia/referencia) é obrigatório para RURAL.");
    }
  }

  // Placeholders (defensivo para banco legado com NOT NULL em colunas clássicas)
  // Sem isso, pode quebrar se tabela ainda exigir endereco/bairro/numero sempre.
  let enderecoDb = endereco;
  let bairroDb = bairro;
  let numeroDb = numero;

  if (tipo_localidade === "RURAL") {
    if (!isNonEmptyString(enderecoDb)) enderecoDb = comunidade || "RURAL";
    if (!isNonEmptyString(bairroDb)) bairroDb = "RURAL";
    if (!isNonEmptyString(numeroDb)) numeroDb = "S/N";
  }

  return {
    ok: errors.length === 0,
    errors,
    data: {
      apelido: apelido || null,
      cep,
      endereco: enderecoDb || null,
      numero: numeroDb || null,
      bairro: bairroDb || null,
      cidade,
      estado,
      complemento: complemento || null,
      ponto_referencia: ponto_referencia || null,
      telefone: telefone || null,
      is_default: is_default ? 1 : 0,
      tipo_localidade,
      comunidade: tipo_localidade === "RURAL" ? (comunidade || null) : null,
      observacoes_acesso:
        tipo_localidade === "RURAL"
          ? (observacoes_acesso || ponto_referencia || null)
          : null,
    },
  };
}

/* =========================================================
   Todas as rotas exigem autenticação
========================================================= */
router.use(authenticateToken);

/* =========================================================
   GET /api/users/addresses
   Lista endereços do usuário (com is_default)
========================================================= */
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;

    const [rows] = await pool.query(
      `
      SELECT
        id,
        apelido,
        cep,
        endereco,
        numero,
        bairro,
        cidade,
        estado,
        complemento,
        ponto_referencia,
        telefone,
        is_default,
        tipo_localidade,
        comunidade,
        observacoes_acesso
      FROM enderecos_usuario
      WHERE usuario_id = ?
      ORDER BY is_default DESC, id DESC
      `,
      [userId]
    );

    return res.json(rows);
  } catch (err) {
    return next(
      new AppError("Erro ao listar endereços.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
});

/* =========================================================
   POST /api/users/addresses
   Cria novo endereço (alinhado com checkout)
========================================================= */
router.post("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;

    const norm = normalizeUserAddressInput(req.body || {});
    if (!norm.ok) {
      return next(
        new AppError(
          norm.errors.join(" "),
          ERROR_CODES.VALIDATION_ERROR,
          400
        )
      );
    }

    const {
      apelido,
      cep,
      endereco,
      numero,
      bairro,
      cidade,
      estado,
      complemento,
      ponto_referencia,
      telefone,
      is_default,
      tipo_localidade,
      comunidade,
      observacoes_acesso,
    } = norm.data;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Se marcar como default, desmarca os outros
      if (is_default) {
        await connection.query(
          "UPDATE enderecos_usuario SET is_default = 0 WHERE usuario_id = ?",
          [userId]
        );
      }

      await connection.query(
        `
        INSERT INTO enderecos_usuario (
          usuario_id,
          apelido,
          cep,
          endereco,
          numero,
          bairro,
          cidade,
          estado,
          complemento,
          ponto_referencia,
          telefone,
          is_default,
          tipo_localidade,
          comunidade,
          observacoes_acesso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          userId,
          apelido,
          cep,
          endereco,
          numero,
          bairro,
          cidade,
          estado,
          complemento,
          ponto_referencia,
          telefone,
          is_default,
          tipo_localidade,
          comunidade,
          observacoes_acesso,
        ]
      );

      await connection.commit();
      return res.status(201).json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao criar endereço.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
});

/* =========================================================
   PUT /api/users/addresses/:id
   Atualiza endereço (alinhado com checkout)
========================================================= */
router.put("/:id", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const addressId = Number(req.params.id);

    if (!addressId) {
      return next(
        new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400)
      );
    }

    const norm = normalizeUserAddressInput(req.body || {});
    if (!norm.ok) {
      return next(
        new AppError(
          norm.errors.join(" "),
          ERROR_CODES.VALIDATION_ERROR,
          400
        )
      );
    }

    const {
      apelido,
      cep,
      endereco,
      numero,
      bairro,
      cidade,
      estado,
      complemento,
      ponto_referencia,
      telefone,
      is_default,
      tipo_localidade,
      comunidade,
      observacoes_acesso,
    } = norm.data;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      if (is_default) {
        await connection.query(
          "UPDATE enderecos_usuario SET is_default = 0 WHERE usuario_id = ?",
          [userId]
        );
      }

      const [result] = await connection.query(
        `
        UPDATE enderecos_usuario
        SET
          apelido = ?,
          cep = ?,
          endereco = ?,
          numero = ?,
          bairro = ?,
          cidade = ?,
          estado = ?,
          complemento = ?,
          ponto_referencia = ?,
          telefone = ?,
          is_default = ?,
          tipo_localidade = ?,
          comunidade = ?,
          observacoes_acesso = ?
        WHERE id = ? AND usuario_id = ?
        `,
        [
          apelido,
          cep,
          endereco,
          numero,
          bairro,
          cidade,
          estado,
          complemento,
          ponto_referencia,
          telefone,
          is_default,
          tipo_localidade,
          comunidade,
          observacoes_acesso,
          addressId,
          userId,
        ]
      );

      if (result.affectedRows === 0) {
        throw new AppError(
          "Endereço não encontrado.",
          ERROR_CODES.NOT_FOUND,
          404
        );
      }

      await connection.commit();
      return res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao atualizar endereço.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
});

/* =========================================================
   DELETE /api/users/addresses/:id
========================================================= */
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const addressId = Number(req.params.id);

    const [result] = await pool.query(
      "DELETE FROM enderecos_usuario WHERE id = ? AND usuario_id = ?",
      [addressId, userId]
    );

    if (result.affectedRows === 0) {
      return next(
        new AppError("Endereço não encontrado.", ERROR_CODES.NOT_FOUND, 404)
      );
    }

    return res.json({ success: true });
  } catch (err) {
    return next(
      new AppError("Erro ao remover endereço.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
});

module.exports = router;
