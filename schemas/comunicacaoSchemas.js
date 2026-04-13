"use strict";
// schemas/comunicacaoSchemas.js
// Validação Zod para o CRUD admin de comunicações transacionais.

const { z } = require("zod");

const TEMPLATE_IDS = [
  "confirmacao_pedido",
  "pagamento_aprovado",
  "pedido_enviado",
  "ocorrencia_confirmacao",
  "ocorrencia_solicitar_dados",
  "ocorrencia_taxa_extra",
  "ocorrencia_correcao_concluida",
  "ocorrencia_resolvida",
];

const templateField = z.enum(TEMPLATE_IDS, {
  errorMap: () => ({
    message: `template deve ser um de: ${TEMPLATE_IDS.join(", ")}.`,
  }),
});

const pedidoIdField = z
  .union([z.string(), z.number()])
  .transform((v) => Number(v))
  .refine((v) => Number.isInteger(v) && v > 0, {
    message: "pedidoId deve ser um inteiro positivo.",
  });

// ---------------------------------------------------------------------------
// POST /api/admin/comunicacao/email
// ---------------------------------------------------------------------------

const enviarEmailSchema = z.object({
  template:      templateField,
  pedidoId:      pedidoIdField,
  emailOverride: z.string().email("emailOverride deve ser um e-mail válido.").optional(),
});

// ---------------------------------------------------------------------------
// POST /api/admin/comunicacao/whatsapp
// ---------------------------------------------------------------------------

const enviarWhatsappSchema = z.object({
  template:         templateField,
  pedidoId:         pedidoIdField,
  telefoneOverride: z
    .string()
    .regex(/^\d{10,11}$/, "telefoneOverride deve conter 10 ou 11 dígitos (com DDD).")
    .optional(),
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  enviarEmailSchema,
  enviarWhatsappSchema,
};
