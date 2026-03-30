"use strict";
// schemas/servicosSchemas.js
//
// Zod schemas para validação das rotas públicas de serviços.
// Aplicados via middleware/validate.js em routes/public/publicServicos.js.
//
// Schemas exportados:
//   ServicosQuerySchema      — GET /api/public/servicos (query params)
//   ServicoIdParamSchema     — /:id (GET, POST /:id/view, POST /:id/whatsapp, GET /:id/avaliacoes)
//   SolicitacaoBodySchema    — POST /api/public/servicos/solicitacoes
//   AvaliacaoBodySchema      — POST /api/public/servicos/avaliacoes
//   TrabalheConoscoBodySchema — POST /api/public/servicos/trabalhe-conosco

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Campo de texto obrigatório não-vazio.
 * Usa z.custom() porque Zod 4 não honra required_error para campos ausentes.
 */
function nonEmptyStr(msg) {
  return z.custom((v) => typeof v === "string" && v.trim().length > 0, msg);
}

/**
 * Inteiro positivo (>= 1) — aceita number ou string numérica.
 * Usa z.custom() com .transform() para produzir mensagem uniforme.
 */
function positiveInt(msg) {
  return z
    .custom((v) => {
      const n = Number(v);
      return Number.isFinite(n) && Number.isInteger(n) && n >= 1;
    }, msg)
    .transform(Number);
}

// Chaves de ordenação aceitas (espelhadas em SORT_MAP do repository)
const SORT_KEYS = ["id", "nome", "cargo", "especialidade"];

// ---------------------------------------------------------------------------
// ServicosQuerySchema — GET /api/public/servicos
// ---------------------------------------------------------------------------

/**
 * Normaliza todos os query params antes da validação:
 *   - page/limit: parseInt com fallback seguro, dentro dos bounds
 *   - sort: whitelist de colunas válidas, fallback para "id"
 *   - order: case-insensitive, fallback para "DESC"
 *   - busca: trim ou string vazia
 *   - especialidade: coerce para número positivo ou null
 *
 * Este schema NUNCA rejeita uma requisição GET / com 400 — normaliza e segue.
 * Isso espelha o comportamento do arquivo legado onde parâmetros inválidos
 * eram silenciosamente ignorados.
 */
const ServicosQuerySchema = z.preprocess(
  (raw) => {
    const q = raw && typeof raw === "object" ? raw : {};

    const rawPage = parseInt(q.page ?? "1", 10);
    const rawLimit = parseInt(q.limit ?? "12", 10);
    const pageNum = Math.max(!Number.isNaN(rawPage) ? rawPage : 1, 1);
    const limitNum = Math.min(Math.max(!Number.isNaN(rawLimit) ? rawLimit : 12, 1), 100);

    const sortKey = SORT_KEYS.includes(String(q.sort ?? "").toLowerCase())
      ? String(q.sort).toLowerCase()
      : "id";
    const orderDir =
      String(q.order ?? "").toUpperCase() === "ASC" ? "ASC" : "DESC";

    let especialidade = null;
    if (q.especialidade !== undefined && q.especialidade !== "") {
      const n = Number(q.especialidade);
      if (Number.isFinite(n) && n > 0) especialidade = n;
    }

    return {
      page: pageNum,
      limit: limitNum,
      sort: sortKey,
      order: orderDir,
      busca: typeof q.busca === "string" ? q.busca.trim() : "",
      especialidade,
    };
  },
  z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    sort: z.enum(["id", "nome", "cargo", "especialidade"]),
    order: z.enum(["ASC", "DESC"]),
    busca: z.string(),
    especialidade: z.number().int().positive().nullable(),
  })
);

// ---------------------------------------------------------------------------
// ServicoIdParamSchema — /:id
// ---------------------------------------------------------------------------

/**
 * Valida que o parâmetro de rota :id é um inteiro positivo.
 * Mesma convenção de CartIdParamSchema e AddressParamSchema.
 */
const ServicoIdParamSchema = z.object({
  id: z
    .string({ required_error: "ID inválido." })
    .regex(/^[1-9]\d*$/, "ID inválido.")
    .transform(Number),
});

// ---------------------------------------------------------------------------
// SolicitacaoBodySchema — POST /solicitacoes
// ---------------------------------------------------------------------------

const SolicitacaoBodySchema = z.object({
  colaborador_id: positiveInt(
    "colaborador_id é obrigatório e deve ser um inteiro positivo."
  ),
  nome_contato: nonEmptyStr("nome_contato é obrigatório."),
  whatsapp: nonEmptyStr("whatsapp é obrigatório."),
  descricao: nonEmptyStr("descricao é obrigatória."),
  origem: z.string().trim().optional(),
});

// ---------------------------------------------------------------------------
// AvaliacaoBodySchema — POST /avaliacoes
// ---------------------------------------------------------------------------

const AvaliacaoBodySchema = z.object({
  colaborador_id: positiveInt(
    "colaborador_id é obrigatório e deve ser um inteiro positivo."
  ),
  nota: z
    .custom((v) => {
      const n = Number(v);
      return Number.isFinite(n) && Number.isInteger(n) && n >= 1 && n <= 5;
    }, "nota deve ser um inteiro entre 1 e 5.")
    .transform(Number),
  comentario: z.string().trim().optional(),
  autor_nome: z.string().trim().optional(),
});

// ---------------------------------------------------------------------------
// TrabalheConoscoBodySchema — POST /trabalhe-conosco
// ---------------------------------------------------------------------------

/**
 * especialidade_id: opcional; se presente deve ser inteiro positivo.
 * Retorna undefined quando ausente/nulo — o service normaliza para null.
 */
const TrabalheConoscoBodySchema = z.object({
  nome: nonEmptyStr("nome é obrigatório."),
  whatsapp: nonEmptyStr("whatsapp é obrigatório."),
  cargo: z.string().trim().optional(),
  descricao: z.string().trim().optional(),
  especialidade_id: z
    .custom(
      (v) => {
        if (v === undefined || v === null || v === "") return true;
        const n = Number(v);
        return Number.isFinite(n) && Number.isInteger(n) && n >= 1;
      },
      "especialidade_id deve ser um inteiro positivo."
    )
    .optional(),
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  ServicosQuerySchema,
  ServicoIdParamSchema,
  SolicitacaoBodySchema,
  AvaliacaoBodySchema,
  TrabalheConoscoBodySchema,
};
