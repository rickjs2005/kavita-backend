// schemas/corretoraKycSchemas.js
"use strict";

const { z } = require("zod");

const cnpjSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 14, "CNPJ deve ter 14 dígitos.");

const runProviderCheckSchema = z.object({
  cnpj: cnpjSchema,
});

const approveManualSchema = z.object({
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Motivo precisa de pelo menos 5 caracteres.")
    .max(1000),
});

module.exports = {
  runProviderCheckSchema,
  approveManualSchema,
  rejectSchema,
};
