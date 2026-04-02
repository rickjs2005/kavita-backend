"use strict";
const { z } = require("zod");

const idParamSchema = z.object({
  id: z.coerce.number().int().positive("ID inválido."),
});

const blockUserSchema = z.object({
  status_conta: z.enum(["ativo", "bloqueado"], {
    required_error: "status_conta é obrigatório.",
    invalid_type_error: "status_conta deve ser 'ativo' ou 'bloqueado'.",
  }),
});

module.exports = { idParamSchema, blockUserSchema };
