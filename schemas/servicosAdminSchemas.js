"use strict";
// schemas/servicosAdminSchemas.js
// Validação Zod para o CRUD admin de colaboradores/serviços.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const positiveId = z
  .string()
  .regex(/^\d+$/, "ID inválido.")
  .transform(Number);

// ---------------------------------------------------------------------------
// POST /api/admin/servicos
// ---------------------------------------------------------------------------

const createServicoSchema = z.object({
  nome: z.string().min(1, "nome é obrigatório.").max(150),
  whatsapp: z.string().min(1, "whatsapp é obrigatório.").max(30),
  especialidade_id: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v > 0, "especialidade_id inválido."),
  cargo: z.string().max(100).optional().nullable(),
  descricao: z.string().max(2000).optional().nullable(),
});

// ---------------------------------------------------------------------------
// PUT /api/admin/servicos/:id
// ---------------------------------------------------------------------------

const updateServicoBodySchema = z.object({
  nome: z.string().min(1, "nome é obrigatório.").max(150),
  whatsapp: z.string().min(1, "whatsapp é obrigatório.").max(30),
  especialidade_id: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v > 0, "especialidade_id inválido."),
  cargo: z.string().max(100).optional().nullable(),
  descricao: z.string().max(2000).optional().nullable(),
  keepImages: z
    .union([
      z.array(z.string()),
      z
        .string()
        .transform((v) => {
          try {
            const parsed = JSON.parse(v);
            if (!Array.isArray(parsed)) throw new Error();
            return parsed;
          } catch {
            throw new Error("keepImages precisa ser um array JSON.");
          }
        }),
    ])
    .optional()
    .default([]),
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/servicos/:id/verificado
// ---------------------------------------------------------------------------

const setVerificadoSchema = z.object({
  verificado: z.boolean({ required_error: "Campo 'verificado' precisa ser boolean." }),
});

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

const idParamSchema = z.object({ id: positiveId });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createServicoSchema,
  updateServicoBodySchema,
  setVerificadoSchema,
  idParamSchema,
};
