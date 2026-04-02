"use strict";
// schemas/userProfileSchemas.js
// Zod schemas for user profile endpoints (GET/PUT /me, GET/PUT /admin/:id).
// Applied via middleware/validate.js.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Trims string, returns null if empty (used to clear fields). */
const optionalString = (maxLen) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z.string().max(maxLen, { message: `Máximo de ${maxLen} caracteres.` })
    )
    .nullable()
    .optional();

// ---------------------------------------------------------------------------
// PUT /me and PUT /admin/:id — body
// ---------------------------------------------------------------------------

const updateProfileBodySchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(1, { message: "Nome é obrigatório." })
      .max(100, { message: "Máximo de 100 caracteres." })
      .optional(),
    telefone: optionalString(30),
    endereco: optionalString(255),
    cidade: optionalString(100),
    estado: optionalString(50),
    cep: optionalString(20),
    pais: optionalString(80),
    ponto_referencia: optionalString(200),
    cpf: z
      .string()
      .trim()
      .nullable()
      .optional(),
  })
  .strict({ message: "Campos desconhecidos não são permitidos." })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "Nada para atualizar." }
  );

// ---------------------------------------------------------------------------
// GET/PUT /admin/:id — params
// ---------------------------------------------------------------------------

const adminUserParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: "ID inválido." })
    .int({ message: "ID deve ser inteiro." })
    .positive({ message: "ID inválido." }),
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  updateProfileBodySchema,
  adminUserParamSchema,
};
