"use strict";
// schemas/colaboradoresSchemas.js
// Zod schemas for the admin colaboradores module.
//
// Note: POST routes receive multipart/form-data via multer.
// All body fields arrive as strings — z.coerce is used for numeric fields.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Shared param schema — /:id
// ---------------------------------------------------------------------------

const ColaboradorIdParamSchema = z.object({
  id: z
    .string({ required_error: "ID inválido." })
    .regex(/^[1-9]\d*$/, "ID inválido.")
    .transform(Number),
});

// ---------------------------------------------------------------------------
// POST /api/admin/colaboradores/public  and  POST /api/admin/colaboradores
// ---------------------------------------------------------------------------

/**
 * Shared body schema for both creation routes.
 *
 * especialidade_id is coerced because multipart/form-data delivers all fields
 * as strings — "2" must be treated the same as 2.
 */
const CreateColaboradorSchema = z.object({
  nome: z
    .string({ required_error: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório."),
  whatsapp: z
    .string({ required_error: "WhatsApp é obrigatório." })
    .trim()
    .min(1, "WhatsApp é obrigatório."),
  email: z
    .string({ required_error: "E-mail é obrigatório." })
    .email("E-mail inválido."),
  especialidade_id: z.coerce
    .number({ required_error: "Especialidade é obrigatória.", invalid_type_error: "Especialidade inválida." })
    .int("Especialidade deve ser um inteiro.")
    .min(1, "Especialidade inválida."),
  cargo: z.string().trim().optional(),
  descricao: z.string().trim().optional(),
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  ColaboradorIdParamSchema,
  CreateColaboradorSchema,
};
