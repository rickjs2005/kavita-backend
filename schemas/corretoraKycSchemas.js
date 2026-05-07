// schemas/corretoraKycSchemas.js
"use strict";

const { z } = require("zod");
const { isValidCnpj } = require("../lib/cnpj");

const cnpjSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 14, "CNPJ deve ter 14 dígitos.")
  // Valida algoritmo dos dígitos verificadores. Rejeita sequências
  // repetidas (000…0, 111…1) que passam no tamanho mas não são CNPJs
  // reais. Falha aqui evita request ao provedor pago.
  .refine(isValidCnpj, "CNPJ inválido. Verifique os dígitos.");

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

// Self-service de verificação de CNPJ (admin OU painel da corretora).
// Body identico ao runProviderCheckSchema; alias semantico pra deixar
// claro que e' o fluxo "verify-and-decide" auto-aprovador.
const verifyCnpjSchema = z.object({
  cnpj: cnpjSchema,
});

module.exports = {
  cnpjSchema,
  runProviderCheckSchema,
  approveManualSchema,
  rejectSchema,
  verifyCnpjSchema,
};
