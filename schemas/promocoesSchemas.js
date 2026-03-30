"use strict";
// schemas/promocoesSchemas.js
//
// Zod schemas para validação das rotas públicas de promoções.
// Aplicados via middleware/validate.js em routes/public/publicPromocoes.js.
//
// Schemas exportados:
//   ProductIdParamSchema — GET /:productId

const { z } = require("zod");

/**
 * Valida que o parâmetro de rota :productId é um inteiro positivo.
 * Mesma convenção de ServicoIdParamSchema e CartIdParamSchema.
 */
const ProductIdParamSchema = z.object({
  productId: z
    .string({ required_error: "ID de produto inválido." })
    .regex(/^[1-9]\d*$/, "ID de produto inválido.")
    .transform(Number),
});

module.exports = {
  ProductIdParamSchema,
};
