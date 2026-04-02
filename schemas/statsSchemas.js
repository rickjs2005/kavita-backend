"use strict";
// schemas/statsSchemas.js
// Zod schemas for admin stats query params.

const { z } = require("zod");

const vendasQuerySchema = z.object({
  range: z.coerce
    .number()
    .int()
    .min(1)
    .max(90)
    .default(7),
});

const topProdutosQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5),
});

module.exports = {
  vendasQuerySchema,
  topProdutosQuerySchema,
};
