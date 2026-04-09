"use strict";
// schemas/contatoSchemas.js
//
// Zod schemas para validacao das rotas publicas de contato.
// Aplicados via middleware/validate.js em routes/public/publicContato.js.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// ContatoBodySchema — POST /api/public/contato
// ---------------------------------------------------------------------------

const ContatoBodySchema = z.object({
  nome: z
    .string({ required_error: "Nome e obrigatorio." })
    .trim()
    .min(2, "Nome deve ter pelo menos 2 caracteres.")
    .max(150, "Nome deve ter no maximo 150 caracteres."),
  email: z
    .string({ required_error: "E-mail e obrigatorio." })
    .trim()
    .email("E-mail invalido.")
    .max(255, "E-mail deve ter no maximo 255 caracteres."),
  telefone: z
    .string()
    .trim()
    .max(30, "Telefone deve ter no maximo 30 caracteres.")
    .optional()
    .default(""),
  assunto: z
    .string({ required_error: "Assunto e obrigatorio." })
    .trim()
    .min(3, "Assunto deve ter pelo menos 3 caracteres.")
    .max(200, "Assunto deve ter no maximo 200 caracteres."),
  mensagem: z
    .string({ required_error: "Mensagem e obrigatoria." })
    .trim()
    .min(10, "Mensagem deve ter pelo menos 10 caracteres.")
    .max(5000, "Mensagem deve ter no maximo 5000 caracteres."),
});

module.exports = { ContatoBodySchema };
