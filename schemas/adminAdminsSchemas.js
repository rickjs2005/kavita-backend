"use strict";
const { z } = require("zod");

const idParamSchema = z.object({ id: z.coerce.number().int().positive("ID inválido.") });

const createAdminSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório.").max(100),
  email: z.string().email("Email inválido.").transform((s) => s.trim().toLowerCase()),
  senha: z.string().min(6, "Senha deve ter pelo menos 6 caracteres."),
  role: z.string().min(1, "Role é obrigatório.").transform((s) => s.trim().toLowerCase()),
});

const updateAdminSchema = z.object({
  role: z.string().min(1).transform((s) => s.trim().toLowerCase()).optional(),
  ativo: z.union([z.boolean(), z.number()]).optional(),
}).refine((d) => d.role !== undefined || d.ativo !== undefined, {
  message: "Envie pelo menos role ou ativo para atualizar.",
});

module.exports = { idParamSchema, createAdminSchema, updateAdminSchema };
