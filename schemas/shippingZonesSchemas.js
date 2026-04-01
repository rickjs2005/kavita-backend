"use strict";
// schemas/shippingZonesSchemas.js
// Validação Zod para o CRUD admin de zonas de frete.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const positiveId = z
  .string()
  .regex(/^\d+$/, "ID inválido.")
  .transform(Number);

/**
 * Normaliza prazo_dias:
 *   null / undefined / "" → null
 *   número string → inteiro >= 1
 */
const prazoField = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    return Math.floor(Number(v));
  })
  .refine((v) => v === null || (Number.isFinite(v) && v >= 1), {
    message: "Prazo deve ser um número >= 1 ou vazio.",
  })
  .optional()
  .default(null);

// ---------------------------------------------------------------------------
// Corpo compartilhado entre POST e PUT
// ---------------------------------------------------------------------------

const zoneBodySchema = z
  .object({
    name: z.string().min(1, "Informe um nome para a regra.").max(150).transform((s) => s.trim()),
    state: z
      .string()
      .min(1, "Informe o estado (UF) com 2 letras.")
      .transform((s) => s.trim().toUpperCase())
      .refine((s) => s.length === 2, { message: "Informe o estado (UF) com 2 letras." }),
    all_cities: z.boolean().optional().default(false),
    is_free: z.boolean().optional().default(false),
    price: z
      .union([z.number(), z.string()])
      .transform((v) => Number(v || 0))
      .optional()
      .default(0),
    prazo_dias: prazoField,
    is_active: z.boolean().optional().default(true),
    cities: z.array(z.string()).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (!data.is_free) {
      if (!Number.isFinite(data.price) || data.price <= 0) {
        ctx.addIssue({
          path: ["price"],
          code: z.ZodIssueCode.custom,
          message: "Informe um preço válido (ou marque frete grátis).",
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    // Se grátis, força price = 0
    price: data.is_free ? 0 : data.price,
    // Deduplica e normaliza cidades
    cities: Array.from(
      new Set(data.cities.map((c) => c.trim()).filter(Boolean))
    ),
  }));

// ---------------------------------------------------------------------------
// Schemas exportados
// ---------------------------------------------------------------------------

const createZoneSchema = zoneBodySchema;

const updateZoneSchema = zoneBodySchema;

const idParamSchema = z.object({ id: positiveId });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createZoneSchema,
  updateZoneSchema,
  idParamSchema,
};
