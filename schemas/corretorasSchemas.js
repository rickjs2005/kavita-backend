// schemas/corretorasSchemas.js
// Zod schemas for the Mercado do Café / Corretoras module.
// Applied via validate() middleware in route files.

"use strict";

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function trimOrNull(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

const CONTACT_FIELDS = [
  "phone",
  "whatsapp",
  "email",
  "website",
  "instagram",
  "facebook",
];

/**
 * Refine: at least one contact channel must be provided.
 */
function atLeastOneContact(data) {
  return CONTACT_FIELDS.some((f) => {
    const v = data[f];
    return typeof v === "string" && v.trim().length > 0;
  });
}

const AT_LEAST_ONE_CONTACT_MSG =
  "Informe pelo menos um meio de contato ou presença pública (telefone, WhatsApp, e-mail, site, Instagram ou Facebook).";

// ---------------------------------------------------------------------------
// Base shape — reused by submission, admin create, and admin update
// ---------------------------------------------------------------------------

const baseFields = {
  name: z
    .string({ required_error: "Nome da empresa é obrigatório." })
    .min(3, "Nome deve ter pelo menos 3 caracteres.")
    .max(200, "Nome deve ter no máximo 200 caracteres.")
    .transform((v) => v.trim()),

  contact_name: z
    .string({ required_error: "Nome do responsável é obrigatório." })
    .min(3, "Nome do responsável deve ter pelo menos 3 caracteres.")
    .max(150, "Nome do responsável deve ter no máximo 150 caracteres.")
    .transform((v) => v.trim()),

  city: z
    .string({ required_error: "Cidade é obrigatória." })
    .min(2, "Cidade deve ter pelo menos 2 caracteres.")
    .max(100, "Cidade deve ter no máximo 100 caracteres.")
    .transform((v) => v.trim()),

  state: z
    .string({ required_error: "Estado é obrigatório." })
    .length(2, "Estado deve ter exatamente 2 caracteres.")
    .transform((v) => v.trim().toUpperCase()),

  description: z
    .string()
    .max(2000, "Descrição deve ter no máximo 2000 caracteres.")
    .optional()
    .nullable()
    .transform(trimOrNull),

  region: z
    .string()
    .max(100, "Região deve ter no máximo 100 caracteres.")
    .optional()
    .nullable()
    .transform(trimOrNull),

  phone: z
    .string()
    .max(20)
    .optional()
    .nullable()
    .transform(trimOrNull),

  whatsapp: z
    .string()
    .max(20)
    .optional()
    .nullable()
    .transform(trimOrNull),

  email: z
    .string()
    .email("E-mail inválido.")
    .max(200)
    .optional()
    .nullable()
    .transform(trimOrNull),

  website: z
    .string()
    .url("URL do site inválida.")
    .max(500)
    .optional()
    .nullable()
    .transform(trimOrNull),

  instagram: z
    .string()
    .max(200)
    .optional()
    .nullable()
    .transform(trimOrNull),

  facebook: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform(trimOrNull),
};

// ---------------------------------------------------------------------------
// Public submission schema (POST /api/public/corretoras/submit)
// ---------------------------------------------------------------------------

const submitCorretoraSchema = z
  .object(baseFields)
  .refine(atLeastOneContact, {
    message: AT_LEAST_ONE_CONTACT_MSG,
    path: ["_contacts"],
  });

// ---------------------------------------------------------------------------
// Admin create schema (POST /api/admin/corretoras)
// ---------------------------------------------------------------------------

const createCorretoraSchema = z
  .object({
    ...baseFields,
    status: z.enum(["active", "inactive"]).optional().default("active"),
    is_featured: z
      .union([z.boolean(), z.number()])
      .optional()
      .default(false)
      .transform((v) => (v ? 1 : 0)),
    sort_order: z.coerce.number().int().optional().default(0),
  })
  .refine(atLeastOneContact, {
    message: AT_LEAST_ONE_CONTACT_MSG,
    path: ["_contacts"],
  });

// ---------------------------------------------------------------------------
// Admin update schema (PUT /api/admin/corretoras/:id)
// ---------------------------------------------------------------------------

const updateCorretoraSchema = z
  .object({
    ...baseFields,
    status: z.enum(["active", "inactive"]).optional(),
    is_featured: z
      .union([z.boolean(), z.number()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? 1 : 0)),
    sort_order: z.coerce.number().int().optional(),
  })
  .refine(atLeastOneContact, {
    message: AT_LEAST_ONE_CONTACT_MSG,
    path: ["_contacts"],
  });

// ---------------------------------------------------------------------------
// Admin status toggle (PATCH /api/admin/corretoras/:id/status)
// ---------------------------------------------------------------------------

const statusSchema = z.object({
  status: z.enum(["active", "inactive"], {
    required_error: "Status é obrigatório.",
  }),
});

// ---------------------------------------------------------------------------
// Admin featured toggle (PATCH /api/admin/corretoras/:id/featured)
// ---------------------------------------------------------------------------

const featuredSchema = z.object({
  is_featured: z
    .union([z.boolean(), z.number()])
    .transform((v) => (v ? 1 : 0)),
});

// ---------------------------------------------------------------------------
// Admin reject submission (POST /api/admin/corretora-submissions/:id/reject)
// ---------------------------------------------------------------------------

const rejectSubmissionSchema = z.object({
  reason: z
    .string({ required_error: "Motivo da rejeição é obrigatório." })
    .min(10, "Motivo deve ter pelo menos 10 caracteres.")
    .max(2000, "Motivo deve ter no máximo 2000 caracteres.")
    .transform((v) => v.trim()),
});

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

const listPublicQuerySchema = z.object({
  city: z.string().optional(),
  featured: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const listAdminQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  city: z.string().optional(),
  is_featured: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const listSubmissionsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional().default("pending"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  submitCorretoraSchema,
  createCorretoraSchema,
  updateCorretoraSchema,
  statusSchema,
  featuredSchema,
  rejectSubmissionSchema,
  listPublicQuerySchema,
  listAdminQuerySchema,
  listSubmissionsQuerySchema,
};
