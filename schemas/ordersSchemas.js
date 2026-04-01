// schemas/ordersSchemas.js
// Zod schemas para mutações do módulo de pedidos admin.
// Aplicados via validate(schema) em routes/admin/adminPedidos.js.

"use strict";

const { z } = require("zod");

const updatePaymentStatusSchema = z.object({
  status_pagamento: z.enum(["pendente", "pago", "falhou", "estornado"], {
    errorMap: () => ({
      message: "status_pagamento inválido. Use: pendente, pago, falhou ou estornado.",
    }),
  }),
});

const updateDeliveryStatusSchema = z.object({
  status_entrega: z.enum(
    ["em_separacao", "processando", "enviado", "entregue", "cancelado"],
    {
      errorMap: () => ({
        message:
          "status_entrega inválido. Use: em_separacao, processando, enviado, entregue ou cancelado.",
      }),
    }
  ),
});

module.exports = { updatePaymentStatusSchema, updateDeliveryStatusSchema };
