"use strict";
// schemas/favoritesSchemas.js
// Validação Zod para as rotas de favoritos do usuário.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// POST /api/favorites
// ---------------------------------------------------------------------------

const addFavoriteSchema = z.object({
  productId: z
    .union([z.string(), z.number()])
    .transform(Number)
    .refine((v) => Number.isInteger(v) && v > 0, {
      message: "productId deve ser um inteiro positivo.",
    }),
});

// ---------------------------------------------------------------------------
// DELETE /api/favorites/:productId
// ---------------------------------------------------------------------------

const productIdParamSchema = z.object({
  productId: z
    .string()
    .regex(/^\d+$/, "productId inválido.")
    .transform(Number),
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  addFavoriteSchema,
  productIdParamSchema,
};
