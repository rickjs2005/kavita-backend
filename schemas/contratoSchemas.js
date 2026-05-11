// schemas/contratoSchemas.js
//
// Zod schemas dos endpoints de contrato (Fase 10.1). Os campos do
// contrato em si são semi-livres porque o rito jurídico evolui — o
// service valida regra de negócio. Aqui garantimos apenas o shape
// mínimo do payload para não deixar passar lixo.
"use strict";

const { z } = require("zod");

function trimOrNull(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Campos comuns aos dois tipos de contrato. Strings curtas são
// trimadas; números são coeridos (aceita "120" e 120).
const baseDataFields = {
  quantidade_sacas: z
    .coerce.number({ invalid_type_error: "Quantidade inválida." })
    .int("Quantidade deve ser inteira.")
    .positive("Quantidade deve ser maior que zero.")
    .max(100000, "Quantidade acima do razoável — confira os dígitos."),
  bebida_laudo: z
    .string()
    .min(2, "Informe a bebida do laudo.")
    .max(80)
    .transform((v) => v.trim()),
  safra: z
    .string()
    .min(4, "Informe a safra (ex.: 2025/2026).")
    .max(20)
    .transform((v) => v.trim()),
  nome_armazem_ou_fazenda: z
    .string()
    .min(2, "Informe o local de entrega.")
    .max(200)
    .transform((v) => v.trim()),
  id_amostra: z
    .string()
    .max(60)
    .optional()
    .nullable()
    .transform(trimOrNull),
  observacoes: z
    .string()
    .max(1000)
    .optional()
    .nullable()
    .transform(trimOrNull),
};

// Disponível: preço fixo por saca + prazo de pagamento
const disponivelDataFields = z.object({
  ...baseDataFields,
  preco_saca: z
    .coerce.number({ invalid_type_error: "Preço inválido." })
    .positive("Preço por saca deve ser maior que zero.")
    .max(100000, "Preço acima do razoável — confira."),
  prazo_pagamento_dias: z
    .coerce.number()
    .int()
    .min(0, "Prazo não pode ser negativo.")
    .max(180, "Prazo acima de 180 dias — revise."),
});

// Entrega futura: diferencial (basis) sobre CEPEA + data de referência
const entregaFuturaDataFields = z.object({
  ...baseDataFields,
  diferencial_basis: z
    .coerce.number({ invalid_type_error: "Diferencial inválido." })
    .min(-1000, "Basis fora da faixa razoável.")
    .max(1000, "Basis fora da faixa razoável."),
  data_referencia_cepea: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use formato AAAA-MM-DD."),
  safra_futura: z
    .string()
    .min(4, "Informe a safra futura.")
    .max(20)
    .transform((v) => v.trim()),
});

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

// POST /api/corretora/contratos
//   body: { lead_id, tipo, data_fields }
// O data_fields é discriminado pelo tipo — validamos após conhecer o tipo.
const createContratoBaseSchema = z.object({
  lead_id: z.coerce.number().int().positive(),
  tipo: z.enum(["disponivel", "entrega_futura"]),
  // O middleware valida estrutura mínima; o service faz o parse
  // discriminado final (ver contratoService.gerarContrato).
  // Zod v4 exige (keySchema, valueSchema) em z.record.
  data_fields: z.record(z.string(), z.any()),
});

function parseDataFieldsByTipo(tipo, data_fields) {
  if (tipo === "disponivel") {
    return disponivelDataFields.parse(data_fields);
  }
  if (tipo === "entrega_futura") {
    return entregaFuturaDataFields.parse(data_fields);
  }
  throw new Error("Tipo de contrato desconhecido.");
}

// POST /api/corretora/contratos/:id/cancelar
const cancelContratoSchema = z.object({
  motivo: z
    .string()
    .min(3, "Informe o motivo do cancelamento.")
    .max(300)
    .transform((v) => v.trim()),
});

// POST /api/admin/contratos/:id/simular-assinatura
// Body vazio, mas mantemos schema pra satisfazer validate() se usado.
const simularAssinaturaSchema = z.object({}).passthrough();

// GET /api/admin/contratos — listagem admin paginada com filtros.
// Todos os campos são opcionais; o repository monta WHERE dinâmico.
const adminListContratosQuerySchema = z
  .object({
    status: z
      .enum(["draft", "sent", "signed", "cancelled", "expired"])
      .optional(),
    tipo: z.enum(["disponivel", "entrega_futura"]).optional(),
    corretora_id: z.coerce.number().int().positive().optional(),
    lead_id: z.coerce.number().int().positive().optional(),
    q: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .transform((v) => (v ? v : undefined)),
    // Datas YYYY-MM-DD. O service/repo converte para boundary
    // (start: 00:00:00, end: 23:59:59) para casar com DATETIME.
    date_from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use formato AAAA-MM-DD.")
      .optional(),
    date_to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use formato AAAA-MM-DD.")
      .optional(),
    page: z.coerce.number().int().min(1).max(10000).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strip();

module.exports = {
  createContratoBaseSchema,
  cancelContratoSchema,
  simularAssinaturaSchema,
  adminListContratosQuerySchema,
  parseDataFieldsByTipo,
  // Exportados para testes
  disponivelDataFields,
  entregaFuturaDataFields,
};
