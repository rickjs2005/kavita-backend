"use strict";
const { z } = require("zod");

const updateStatusSchema = z.object({
  status: z.enum(["novo", "em_contato", "concluido", "cancelado"], {
    required_error: "Status é obrigatório.",
    invalid_type_error: "Status inválido. Use: novo, em_contato, concluido, cancelado.",
  }),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive("ID inválido."),
});

module.exports = { updateStatusSchema, idParamSchema };
