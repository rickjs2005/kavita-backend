// schemas/newsWhatsappSchemas.js
//
// Zod schema for POST /api/news/whatsapp-subscribe.
//
// Owns normalization (strip non-digits) and validation (10 or 11 digits
// for Brazilian phones with DDD; 9 in front is optional for mobile).
// Applied via middleware/validate.js on the public route.

"use strict";

const { z } = require("zod");

/** Remove tudo que não for dígito. Aceita máscara, espaços, parênteses. */
function digitsOnly(v) {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * Telefone brasileiro:
 *   - 10 dígitos: DDD (2) + fixo (8)
 *   - 11 dígitos: DDD (2) + 9 + celular (8)
 * Não aceitamos DDI (55) — ele é adicionado no momento de envio se preciso.
 */
const phoneSchema = z
  .string({ required_error: "Telefone é obrigatório." })
  .transform((v) => digitsOnly(v))
  .refine((d) => d.length === 10 || d.length === 11, {
    message: "Informe um telefone válido com DDD (10 ou 11 dígitos).",
  })
  .refine(
    (d) => {
      // DDD válido: 11..99 (descartar 00..10 que não existem como DDD)
      const ddd = Number(d.slice(0, 2));
      return ddd >= 11 && ddd <= 99;
    },
    { message: "DDD inválido." },
  );

const subscribeBodySchema = z.object({
  phone: phoneSchema,
  source: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "home_news")),
});

/** Token opaco gerado por crypto.randomBytes(32).toString("hex") = 64 hex chars. */
const confirmTokenSchema = z
  .string({ required_error: "Token é obrigatório." })
  .trim()
  .regex(/^[a-f0-9]{64}$/i, "Token inválido.");

const confirmBodySchema = z.object({
  token: confirmTokenSchema,
});

const unsubscribeBodySchema = z.object({
  token: confirmTokenSchema,
});

const adminSubscriberIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const adminUpdateStatusBodySchema = z.object({
  status: z.enum(["pending", "active", "unsubscribed"]),
});

const listSubscribersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  status: z.enum(["pending", "active", "unsubscribed"]).optional(),
});

module.exports = {
  subscribeBodySchema,
  confirmBodySchema,
  unsubscribeBodySchema,
  adminSubscriberIdParamSchema,
  adminUpdateStatusBodySchema,
  listSubscribersQuerySchema,
  // export helper para uso em testes
  digitsOnly,
};
