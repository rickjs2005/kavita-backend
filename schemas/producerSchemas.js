// schemas/producerSchemas.js
"use strict";

const { z } = require("zod");

function trimOrNull(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

const magicLinkRequestSchema = z.object({
  email: z
    .string({ required_error: "E-mail é obrigatório." })
    .email("E-mail inválido.")
    .max(200)
    .transform((v) => v.trim().toLowerCase()),
});

const magicLinkConsumeSchema = z.object({
  token: z
    .string({ required_error: "Token é obrigatório." })
    .min(20)
    .max(128),
});

const updateProducerProfileSchema = z.object({
  nome: z.string().min(2).max(150).optional().nullable().transform(trimOrNull),
  cidade: z.string().max(100).optional().nullable().transform(trimOrNull),
  telefone: z.string().max(30).optional().nullable().transform(trimOrNull),
});

const createAlertSubscriptionSchema = z.object({
  type: z
    .string({ required_error: "Tipo de alerta é obrigatório." })
    .min(3)
    .max(60),
  params: z.record(z.unknown()).optional().nullable(),
});

module.exports = {
  magicLinkRequestSchema,
  magicLinkConsumeSchema,
  updateProducerProfileSchema,
  createAlertSubscriptionSchema,
};
