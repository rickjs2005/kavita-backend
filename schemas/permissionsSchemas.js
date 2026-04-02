"use strict";
const { z } = require("zod");

const idParamSchema = z.object({ id: z.coerce.number().int().positive("ID inválido.") });

const createPermissionSchema = z.object({
  chave: z.string().min(1, "chave é obrigatória.").max(100).transform((s) => s.trim().toLowerCase()),
  grupo: z.string().min(1, "grupo é obrigatório.").max(100).transform((s) => s.trim()),
  descricao: z.string().max(255).nullable().optional().default(null),
});

const updatePermissionSchema = z.object({
  chave: z.string().min(1).max(100).transform((s) => s.trim().toLowerCase()).optional(),
  grupo: z.string().min(1).max(100).transform((s) => s.trim()).optional(),
  descricao: z.string().max(255).nullable().optional(),
}).refine((d) => d.chave || d.grupo || d.descricao !== undefined, {
  message: "Envie pelo menos um campo para atualizar.",
});

module.exports = { idParamSchema, createPermissionSchema, updatePermissionSchema };
