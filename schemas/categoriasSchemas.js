"use strict";
// schemas/categoriasSchemas.js
// Zod schemas for the admin categories module.
//
// Consumed by routes/admin/adminCategorias.js via middleware/validate.js.
// On success, validate() replaces req[source] with the parsed/coerced data so
// controllers and services receive clean, typed values.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Shared param schema — /:id
// ---------------------------------------------------------------------------

/**
 * Validates that the :id route param is a positive integer.
 * Regex + transform ensures "abc", "0", "-1" all produce a clean 400.
 */
const CategoryIdParamSchema = z.object({
  id: z
    .string({ required_error: "ID inválido." })
    .regex(/^[1-9]\d*$/, "ID inválido.")
    .transform(Number),
});

// ---------------------------------------------------------------------------
// POST /api/admin/categorias
// ---------------------------------------------------------------------------

/**
 * name is required, trimmed, and must be non-empty after trimming.
 * slug is optional; when absent or empty the service derives it from name.
 * sort_order is optional; coerced so "3" (query/form) works the same as 3 (JSON).
 */
const CreateCategorySchema = z.object({
  name: z
    .string({ required_error: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório."),
  slug: z.string().trim().optional().default(""),
  sort_order: z.coerce
    .number({ invalid_type_error: "sort_order deve ser um número." })
    .int("sort_order deve ser um inteiro.")
    .min(0, "sort_order deve ser maior ou igual a 0.")
    .optional()
    .default(0),
});

// ---------------------------------------------------------------------------
// PUT /api/admin/categorias/:id
// ---------------------------------------------------------------------------

/**
 * All fields optional — callers can update any subset.
 * sort_order is coerced for the same reason as above.
 */
const UpdateCategorySchema = z
  .object({
    name: z.string().trim().min(1, "Nome deve ter ao menos 1 caractere."),
    slug: z.string().trim(),
    sort_order: z.coerce
      .number({ invalid_type_error: "sort_order deve ser um número." })
      .int("sort_order deve ser um inteiro.")
      .min(0, "sort_order deve ser maior ou igual a 0."),
  })
  .partial();

// ---------------------------------------------------------------------------
// PATCH /api/admin/categorias/:id/status
// ---------------------------------------------------------------------------

/**
 * is_active must be an explicit boolean (true/false).
 * z.boolean() rejects numbers (0/1) intentionally — callers must send a JSON boolean.
 */
const UpdateStatusSchema = z.object({
  is_active: z.boolean({ required_error: "is_active é obrigatório." }),
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  CategoryIdParamSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  UpdateStatusSchema,
};
