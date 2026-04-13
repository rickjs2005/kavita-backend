"use strict";
// schemas/cuponsSchemas.js
// Zod schemas for admin coupon CRUD.

const { z } = require("zod");

const restricaoSchema = z.object({
  tipo: z.enum(["categoria", "produto"], {
    errorMap: () => ({ message: "Tipo de restrição inválido. Use 'categoria' ou 'produto'." }),
  }),
  target_id: z.coerce
    .number({ invalid_type_error: "ID do alvo deve ser numérico." })
    .int()
    .positive({ message: "ID do alvo deve ser positivo." }),
});

const cupomBodySchema = z.object({
  codigo: z
    .string({ required_error: "Código é obrigatório." })
    .trim()
    .min(1, { message: "Código é obrigatório." })
    .max(50, { message: "Máximo de 50 caracteres." }),
  tipo: z.enum(["percentual", "valor"], {
    errorMap: () => ({ message: "Tipo inválido. Use 'percentual' ou 'valor'." }),
  }),
  valor: z.coerce
    .number({ required_error: "Valor é obrigatório.", invalid_type_error: "Valor deve ser numérico." })
    .positive({ message: "Valor deve ser maior que zero." }),
  minimo: z.coerce
    .number()
    .min(0)
    .default(0),
  expiracao: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v ?? null)),
  max_usos: z
    .union([z.coerce.number().int().positive(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
  max_usos_por_usuario: z
    .union([z.coerce.number().int().positive(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
  ativo: z
    .union([z.boolean(), z.literal(0), z.literal(1)])
    .optional()
    .default(true)
    .transform((v) => (v === false || v === 0 ? 0 : 1)),
  restricoes: z
    .array(restricaoSchema)
    .optional()
    .default([]),
});

const cupomParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: "ID inválido." })
    .int()
    .positive({ message: "ID inválido." }),
});

module.exports = {
  cupomBodySchema,
  cupomParamSchema,
};
