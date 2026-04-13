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

const updateOrderAddressSchema = z.object({
  cep: z.string().regex(/^\d{8}$/, "CEP deve conter 8 dígitos."),
  rua: z.string().min(1, "Rua é obrigatório."),
  numero: z.string().min(1, "Número é obrigatório."),
  bairro: z.string().min(1, "Bairro é obrigatório."),
  cidade: z.string().min(1, "Cidade é obrigatório."),
  estado: z.string().length(2, "Estado deve ter 2 caracteres."),
  complemento: z.string().optional().default(""),
  ponto_referencia: z.string().optional().default(""),
});

module.exports = { updatePaymentStatusSchema, updateDeliveryStatusSchema, updateOrderAddressSchema };
