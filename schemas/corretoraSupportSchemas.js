"use strict";

const { z } = require("zod");

const sendMessageBodySchema = z
  .object({
    body: z
      .string({ required_error: "Mensagem e obrigatoria." })
      .trim()
      .min(2, "Mensagem precisa ter ao menos 2 caracteres.")
      .max(4000, "Mensagem muito longa (max 4000 caracteres)."),
  })
  .strip();

module.exports = { sendMessageBodySchema };
