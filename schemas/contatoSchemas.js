"use strict";
// schemas/contatoSchemas.js
//
// Zod schemas para validacao das rotas publicas de contato.
// Aplicados via middleware/validate.js em routes/public/publicContato.js.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// ContatoBodySchema — POST /api/public/contato
// ---------------------------------------------------------------------------

const ContatoBodySchema = z.object({
  nome: z
    .string({ required_error: "Nome e obrigatorio." })
    .trim()
    .min(2, "Nome deve ter pelo menos 2 caracteres.")
    .max(150, "Nome deve ter no maximo 150 caracteres."),
  email: z
    .string({ required_error: "E-mail e obrigatorio." })
    .trim()
    .email("E-mail invalido.")
    .max(255, "E-mail deve ter no maximo 255 caracteres."),
  telefone: z
    .string()
    .trim()
    .max(30, "Telefone deve ter no maximo 30 caracteres.")
    .optional()
    .default(""),
  assunto: z
    .string({ required_error: "Assunto e obrigatorio." })
    .trim()
    .min(3, "Assunto deve ter pelo menos 3 caracteres.")
    .max(200, "Assunto deve ter no maximo 200 caracteres."),
  mensagem: z
    .string({ required_error: "Mensagem e obrigatoria." })
    .trim()
    .min(10, "Mensagem deve ter pelo menos 10 caracteres.")
    .max(5000, "Mensagem deve ter no maximo 5000 caracteres."),
});

// ---------------------------------------------------------------------------
// Admin schemas
// ---------------------------------------------------------------------------

const ContatoIdParamSchema = z.object({
  id: z.coerce.number().int().positive("ID invalido."),
});

const ContatoUpdateStatusSchema = z.object({
  status: z.enum(["nova", "lida", "respondida", "arquivada"], {
    required_error: "Status e obrigatorio.",
    invalid_type_error:
      "Status invalido. Use: nova, lida, respondida, arquivada.",
  }),
});

const ContatoListQuerySchema = z.preprocess(
  (raw) => {
    const q = raw && typeof raw === "object" ? raw : {};
    const rawPage = parseInt(q.page ?? "1", 10);
    const rawLimit = parseInt(q.limit ?? "25", 10);
    return {
      page: Math.max(!Number.isNaN(rawPage) ? rawPage : 1, 1),
      limit: Math.min(Math.max(!Number.isNaN(rawLimit) ? rawLimit : 25, 1), 100),
      status: ["nova", "lida", "respondida", "arquivada"].includes(q.status)
        ? q.status
        : undefined,
    };
  },
  z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    status: z.enum(["nova", "lida", "respondida", "arquivada"]).optional(),
  })
);

// ---------------------------------------------------------------------------
// Analytics schemas
// ---------------------------------------------------------------------------

const ContatoEventSchema = z.object({
  event: z.enum(["faq_topic_view", "faq_search", "form_start", "whatsapp_hero_click"], {
    required_error: "event e obrigatorio.",
  }),
  value: z.string().trim().max(255).optional().default(""),
});

const ContatoAnalyticsQuerySchema = z.preprocess(
  (raw) => {
    const q = raw && typeof raw === "object" ? raw : {};
    const rawDays = parseInt(q.days ?? "30", 10);
    return {
      days: Math.min(Math.max(!Number.isNaN(rawDays) ? rawDays : 30, 1), 365),
    };
  },
  z.object({ days: z.number().int().min(1).max(365) })
);

module.exports = {
  ContatoBodySchema,
  ContatoIdParamSchema,
  ContatoUpdateStatusSchema,
  ContatoListQuerySchema,
  ContatoEventSchema,
  ContatoAnalyticsQuerySchema,
};
