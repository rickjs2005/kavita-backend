"use strict";
// schemas/promocoesSchemas.js
//
// Zod schemas para validação das rotas de promoções (públicas e admin).
// Aplicados via middleware/validate.js.
//
// Schemas exportados:
//   ProductIdParamSchema          — GET /:productId (público)
//   createPromocaoBodySchema      — POST /admin/marketing/promocoes
//   updatePromocaoBodySchema      — PUT /admin/marketing/promocoes/:id
//   promocaoParamSchema           — params :id (admin)

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

const ProductIdParamSchema = z.object({
  productId: z
    .string({ required_error: "ID de produto inválido." })
    .regex(/^[1-9]\d*$/, "ID de produto inválido.")
    .transform(Number),
});

// ---------------------------------------------------------------------------
// Admin — CRUD de promoções
// ---------------------------------------------------------------------------

const createPromocaoBodySchema = z
  .object({
    product_id: z.coerce
      .number({ required_error: "ID do produto é obrigatório." })
      .int()
      .positive({ message: "ID do produto inválido." }),
    title: z.string().trim().nullable().optional().default(null),
    type: z.enum(["PROMOCAO", "FLASH"]).default("PROMOCAO"),
    discount_percent: z.coerce.number().min(0).max(100).nullable().optional().default(null),
    promo_price: z.coerce.number().positive().nullable().optional().default(null),
    start_at: z.string().nullable().optional().default(null),
    end_at: z.string().nullable().optional().default(null),
    is_active: z
      .union([z.boolean(), z.literal(0), z.literal(1)])
      .optional()
      .default(true)
      .transform((v) => (v ? 1 : 0)),
  })
  .refine(
    (data) => data.discount_percent !== null || data.promo_price !== null,
    { message: "Informe discount_percent ou promo_price para criar uma promoção." }
  );

const updatePromocaoBodySchema = z
  .object({
    title: z.string().trim().nullable().optional(),
    type: z.enum(["PROMOCAO", "FLASH"]).optional(),
    discount_percent: z.coerce.number().min(0).max(100).nullable().optional(),
    promo_price: z.coerce.number().positive().nullable().optional(),
    start_at: z.string().nullable().optional(),
    end_at: z.string().nullable().optional(),
    is_active: z
      .union([z.boolean(), z.literal(0), z.literal(1)])
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? 1 : 0)),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: "Nenhum campo para atualizar." }
  );

const promocaoParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: "ID inválido." })
    .int()
    .positive({ message: "ID inválido." }),
});

module.exports = {
  ProductIdParamSchema,
  createPromocaoBodySchema,
  updatePromocaoBodySchema,
  promocaoParamSchema,
};
