"use strict";
// schemas/cartsSchemas.js
// Zod schemas para validação das rotas de carrinhos abandonados (admin).

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Params compartilhado — /:id
// ---------------------------------------------------------------------------

/**
 * Valida que o parâmetro de rota :id é um inteiro positivo.
 * Usa regex + transform em vez de z.coerce.number() para garantir
 * que qualquer input inválido ("abc", "0", "-1") produza "ID inválido."
 * O controller recebe req.params.id já como número após o transform.
 */
const CartIdParamSchema = z.object({
  id: z
    .string({ required_error: "ID inválido." })
    .regex(/^[1-9]\d*$/, "ID inválido.")
    .transform(Number),
});

// ---------------------------------------------------------------------------
// POST /api/admin/carrinhos/scan
// ---------------------------------------------------------------------------

/**
 * horas é opcional — sem ele o service usa ABANDON_CART_HOURS do env.
 * z.coerce garante que "2" (query string) seja tratado igual a 2 (JSON).
 */
const ScanBodySchema = z.object({
  horas: z.coerce
    .number({ invalid_type_error: "horas deve ser um número." })
    .int("horas deve ser um inteiro.")
    .min(1, "horas deve ser no mínimo 1.")
    .max(720, "horas deve ser no máximo 720 (30 dias).")
    .optional(),
});

// ---------------------------------------------------------------------------
// POST /api/admin/carrinhos/:id/notificar
// ---------------------------------------------------------------------------

const NotifyBodySchema = z.object({
  tipo: z.enum(["whatsapp", "email"], {
    errorMap: () => ({ message: "tipo deve ser 'whatsapp' ou 'email'." }),
  }),
});

module.exports = {
  CartIdParamSchema,
  ScanBodySchema,
  NotifyBodySchema,
};
