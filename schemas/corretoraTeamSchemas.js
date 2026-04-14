// schemas/corretoraTeamSchemas.js
"use strict";

const { z } = require("zod");

const inviteMemberSchema = z.object({
  nome: z
    .string({ required_error: "Nome é obrigatório." })
    .min(3, "Mínimo 3 caracteres.")
    .max(150)
    .transform((v) => v.trim()),
  email: z
    .string({ required_error: "E-mail é obrigatório." })
    .email("E-mail inválido.")
    .max(200)
    .transform((v) => v.trim().toLowerCase()),
  role: z.enum(["owner", "manager", "sales", "viewer"], {
    required_error: "Role é obrigatória.",
  }),
});

const changeRoleSchema = z.object({
  role: z.enum(["owner", "manager", "sales", "viewer"], {
    required_error: "Role é obrigatória.",
  }),
});

module.exports = {
  inviteMemberSchema,
  changeRoleSchema,
};
