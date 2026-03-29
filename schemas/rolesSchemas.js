"use strict";
// schemas/rolesSchemas.js
// Zod schemas for the admin roles module.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Param — /:id
// ---------------------------------------------------------------------------

const RoleIdParamSchema = z.object({
  id: z
    .string({ required_error: "ID inválido." })
    .regex(/^[1-9]\d*$/, "ID inválido.")
    .transform(Number),
});

// ---------------------------------------------------------------------------
// POST /api/admin/roles
// ---------------------------------------------------------------------------

const CreateRoleSchema = z.object({
  nome: z
    .string({ required_error: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório."),
  slug: z
    .string({ required_error: "Slug é obrigatório." })
    .trim()
    .min(1, "Slug é obrigatório."),
  descricao: z.string().trim().optional(),
});

// ---------------------------------------------------------------------------
// PUT /api/admin/roles/:id
// ---------------------------------------------------------------------------

const UpdateRoleSchema = z.object({
  nome: z.string().trim().min(1, "Nome não pode ser vazio.").optional(),
  descricao: z.string().nullable().optional(),
  permissions: z.array(z.string().min(1)).optional(),
});

module.exports = { RoleIdParamSchema, CreateRoleSchema, UpdateRoleSchema };
