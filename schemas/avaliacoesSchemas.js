"use strict";
// schemas/avaliacoesSchemas.js
// Zod schemas for product review endpoints.

const { z } = require("zod");

const criarAvaliacaoBodySchema = z.object({
  produto_id: z.coerce
    .number({ required_error: "produto_id é obrigatório.", invalid_type_error: "produto_id deve ser numérico." })
    .int()
    .positive({ message: "produto_id inválido." }),
  nota: z.coerce
    .number({ required_error: "Nota é obrigatória.", invalid_type_error: "Nota deve ser numérica." })
    .int()
    .min(1, { message: "Nota mínima é 1." })
    .max(5, { message: "Nota máxima é 5." }),
  comentario: z
    .string()
    .trim()
    .max(1000, { message: "Máximo de 1000 caracteres." })
    .nullable()
    .optional()
    .transform((v) => v || null),
});

const produtoIdParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: "ID de produto inválido." })
    .int()
    .positive({ message: "ID de produto inválido." }),
});

const buscaProdutosQuerySchema = z.object({
  busca: z
    .string()
    .trim()
    .default(""),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10),
});

module.exports = {
  criarAvaliacaoBodySchema,
  produtoIdParamSchema,
  buscaProdutosQuerySchema,
};
