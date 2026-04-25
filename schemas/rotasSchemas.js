"use strict";
const { z } = require("zod");

const trimOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

const createRotaSchema = z.object({
  data_programada: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD."),
  motorista_id: z.number().int().positive().optional().nullable(),
  veiculo: z.string().max(60).optional().nullable().transform(trimOrNull),
  regiao_label: z.string().max(120).optional().nullable().transform(trimOrNull),
  observacoes: z.string().max(2000).optional().nullable().transform(trimOrNull),
  km_estimado: z.number().nonnegative().max(99999.99).optional().nullable(),
});

const updateRotaSchema = z.object({
  motorista_id: z.number().int().positive().nullable().optional(),
  veiculo: z.string().max(60).nullable().optional().transform(trimOrNull),
  regiao_label: z.string().max(120).nullable().optional().transform(trimOrNull),
  observacoes: z.string().max(2000).nullable().optional().transform(trimOrNull),
  km_estimado: z.number().nonnegative().max(99999.99).nullable().optional(),
});

const updateRotaStatusSchema = z.object({
  status: z.enum(["rascunho", "pronta", "em_rota", "finalizada", "cancelada"]),
  km_real: z.number().nonnegative().max(99999.99).optional().nullable(),
});

const adicionarParadaSchema = z.object({
  pedido_id: z.number().int().positive(),
});

const reordenarParadasSchema = z.object({
  ordens: z
    .array(
      z.object({
        pedido_id: z.number().int().positive(),
        ordem: z.number().int().nonnegative().max(9999),
      }),
    )
    .min(1, "Lista vazia."),
});

const finalizarRotaSchema = z.object({
  km_real: z.number().nonnegative().max(99999.99).optional().nullable(),
});

const reportarProblemaSchema = z.object({
  tipo: z.enum([
    "endereco_incorreto",
    "cliente_ausente",
    "estrada_intransitavel",
    "pagamento_pendente_na_entrega",
    "produto_avariado",
    "outro_motivo",
  ]),
  observacao: z.string().max(1000).optional().nullable().transform(trimOrNull),
});

const marcarEntregueSchema = z.object({
  observacao: z.string().max(1000).optional().nullable().transform(trimOrNull),
});

const fixarPosicaoSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

module.exports = {
  createRotaSchema,
  updateRotaSchema,
  updateRotaStatusSchema,
  adicionarParadaSchema,
  reordenarParadasSchema,
  finalizarRotaSchema,
  reportarProblemaSchema,
  marcarEntregueSchema,
  fixarPosicaoSchema,
};
