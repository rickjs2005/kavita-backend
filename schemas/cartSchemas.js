"use strict";
// schemas/cartSchemas.js
// Zod schemas para validação das rotas de carrinho do usuário (ecommerce).
// Não confundir com schemas/cartsSchemas.js — esse é para carrinhos abandonados (admin).

const { z } = require("zod");

const QTY_MIN = 1;
const QTY_MAX = 10000;
const QTY_MSG = `quantidade deve ser um inteiro entre ${QTY_MIN} e ${QTY_MAX}.`;

// ---------------------------------------------------------------------------
// POST /api/cart/items  e  PATCH /api/cart/items
// ---------------------------------------------------------------------------

const PRODUTO_ID_MSG = "produto_id é obrigatório e deve ser válido.";

// z.custom() produces a single uniform message for all failure modes (NaN,
// wrong type, out-of-range, non-integer). This is necessary because Zod 4
// no longer routes invalid_type_error through NaN coercion paths.
const CartItemBodySchema = z.object({
  produto_id: z
    .custom(
      (v) => {
        const n = Number(v);
        return Number.isFinite(n) && Number.isInteger(n) && n >= 1;
      },
      PRODUTO_ID_MSG
    )
    .transform(Number),
  quantidade: z
    .custom(
      (v) => {
        const n = Number(v);
        return Number.isFinite(n) && Number.isInteger(n) && n >= QTY_MIN && n <= QTY_MAX;
      },
      QTY_MSG
    )
    .transform(Number),
});

// ---------------------------------------------------------------------------
// DELETE /api/cart/items/:produtoId
// ---------------------------------------------------------------------------

/**
 * Valida que o parâmetro de rota :produtoId é um inteiro positivo.
 * Usa regex + transform em vez de z.coerce.number() para garantir
 * que qualquer input inválido ("abc", "0", "-1") produza "produtoId inválido."
 */
const CartItemParamSchema = z.object({
  produtoId: z
    .string({ required_error: "produtoId inválido." })
    .regex(/^[1-9]\d*$/, "produtoId inválido.")
    .transform(Number),
});

module.exports = { CartItemBodySchema, CartItemParamSchema, QTY_MIN, QTY_MAX };
