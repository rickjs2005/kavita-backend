"use strict";
// schemas/pedidoOcorrenciasSchemas.js
// Validação Zod para ocorrências de pedido.

const { z } = require("zod");

const createOcorrenciaSchema = z.object({
  motivo: z.enum(
    [
      "numero_errado",
      "complemento_faltando",
      "bairro_incorreto",
      "cep_incorreto",
      "destinatario_incorreto",
      "outro",
    ],
    {
      errorMap: () => ({
        message:
          "Motivo inválido. Use: numero_errado, complemento_faltando, bairro_incorreto, cep_incorreto, destinatario_incorreto ou outro.",
      }),
    }
  ),
  observacao: z
    .string()
    .max(500, "Observação deve ter no máximo 500 caracteres.")
    .optional()
    .default(""),
});

const updateOcorrenciaSchema = z.object({
  status: z.enum(["em_analise", "aguardando_retorno", "resolvida", "rejeitada"], {
    errorMap: () => ({
      message: "Status inválido. Use: em_analise, aguardando_retorno, resolvida ou rejeitada.",
    }),
  }),
  resposta_admin: z
    .string()
    .max(1000, "Resposta deve ter no máximo 1000 caracteres.")
    .optional()
    .default(""),
  taxa_extra: z
    .number()
    .min(0, "Taxa extra não pode ser negativa.")
    .optional()
    .nullable()
    .default(null),
});

module.exports = { createOcorrenciaSchema, updateOcorrenciaSchema };
