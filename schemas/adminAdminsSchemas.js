"use strict";
const { z } = require("zod");

const idParamSchema = z.object({ id: z.coerce.number().int().positive("ID inválido.") });

/**
 * Política de senha de admin (P3 da auditoria 2026-05-09).
 * Mínimo 8 caracteres + ao menos 1 minúscula + 1 maiúscula + 1 dígito.
 *
 * Importante: aplicada APENAS na criação. Admins existentes mantêm o hash
 * atual sem migração forçada — a política nova só obriga em senhas novas.
 */
const senhaForteSchema = z
  .string()
  .min(8, "Senha deve ter pelo menos 8 caracteres.")
  .regex(/[a-z]/, "Senha precisa ter pelo menos 1 letra minúscula.")
  .regex(/[A-Z]/, "Senha precisa ter pelo menos 1 letra maiúscula.")
  .regex(/\d/, "Senha precisa ter pelo menos 1 número.");

const createAdminSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório.").max(100),
  email: z.string().email("Email inválido.").transform((s) => s.trim().toLowerCase()),
  senha: senhaForteSchema,
  role: z.string().min(1, "Role é obrigatório.").transform((s) => s.trim().toLowerCase()),
});

const updateAdminSchema = z.object({
  role: z.string().min(1).transform((s) => s.trim().toLowerCase()).optional(),
  ativo: z.union([z.boolean(), z.number()]).optional(),
}).refine((d) => d.role !== undefined || d.ativo !== undefined, {
  message: "Envie pelo menos role ou ativo para atualizar.",
});

module.exports = {
  idParamSchema,
  createAdminSchema,
  updateAdminSchema,
  // exportado para reuso em fluxos futuros (ex: change-password)
  senhaForteSchema,
};
