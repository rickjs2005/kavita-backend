// schemas/dronesSchemas.js
// Zod schemas for the drones admin module.
// Used directly in controllers — validates and coerces request bodies
// before business logic runs.

"use strict";

const { z } = require("zod");

const MODEL_KEY_RE = /^[a-z0-9_]{2,20}$/;
const PHONE_DIGITS_RE = /^\d{10,13}$/;

/**
 * Formats Zod issues into the drones error convention: [{ field, reason }].
 * Keeps the same shape as the pre-Zod validateRepresentativePayload output.
 */
function formatDronesErrors(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join(".") || "body",
    reason: issue.message,
  }));
}

// ─── Models ────────────────────────────────────────────────────────────────

/**
 * POST /admin/drones/models — create a drone model.
 * Coerces key to lowercase, sort_order to int, is_active to 0|1.
 */
const createModelBodySchema = z.object({
  key: z.preprocess(
    (v) => String(v || "").trim().toLowerCase(),
    z.string().min(1, "obrigatório").regex(MODEL_KEY_RE, "use a-z, 0-9, _ (2-20 chars)")
  ),
  label: z.string().trim().min(1, "obrigatório").max(120),
  sort_order: z.preprocess((v) => Number(v) || 0, z.number().int().min(0).max(999999)),
  is_active: z.preprocess(
    (v) => (v === undefined ? 1 : String(v) === "1" ? 1 : 0),
    z.union([z.literal(0), z.literal(1)])
  ),
});

// ─── Media selection ───────────────────────────────────────────────────────

/**
 * PUT /admin/drones/models/:key/media-selection — assign media to HERO|CARD slot.
 * Coerces target to uppercase, media_id to int.
 */
const mediaSelectionBodySchema = z.object({
  target: z.preprocess(
    (v) => String(v || "").trim().toUpperCase(),
    z.enum(["HERO", "CARD"])
  ),
  media_id: z.preprocess(
    (v) => Number(v),
    z.number({ message: "media_id inválido" }).int().min(1, "media_id inválido")
  ),
});

// ─── Representatives ───────────────────────────────────────────────────────

/**
 * POST /admin/drones/representantes — create a representative.
 * whatsapp is preprocessed to digits-only.
 * All optional address fields accept null/empty (service sanitizes to null).
 */
const createRepresentativeBodySchema = z.object({
  name: z.string().trim().min(1, "obrigatório").max(120),
  whatsapp: z.preprocess(
    (v) => String(v || "").replace(/\D/g, ""),
    z.string().regex(PHONE_DIGITS_RE, "deve ter 10-13 dígitos")
  ),
  cnpj: z.string().trim().min(1, "obrigatório").max(20),
  instagram_url: z.string().trim().max(255).nullish(),
  address_street: z.string().trim().max(120).nullish(),
  address_number: z.string().trim().max(30).nullish(),
  address_complement: z.string().trim().max(80).nullish(),
  address_neighborhood: z.string().trim().max(80).nullish(),
  address_city: z.string().trim().max(80).nullish(),
  address_uf: z.string().trim().max(2).nullish(),
  address_cep: z.string().trim().max(15).nullish(),
  notes: z.string().trim().max(255).nullish(),
  sort_order: z.preprocess((v) => Number(v) || 0, z.number().int().min(0).max(999999)),
  is_active: z.preprocess(
    (v) => (v === undefined ? 1 : Number(v) ? 1 : 0),
    z.union([z.literal(0), z.literal(1)])
  ),
});

/**
 * PUT /admin/drones/representantes/:id — partial update.
 * All fields are optional. Absent fields are stripped by Zod, so the
 * service's hasOwnProperty checks correctly skip unset fields.
 * whatsapp, sort_order, is_active use .optional() wrappers so the
 * preprocess is not called for absent fields.
 */
const updateRepresentativeBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  whatsapp: z.preprocess(
    (v) => String(v || "").replace(/\D/g, ""),
    z.string().regex(PHONE_DIGITS_RE, "deve ter 10-13 dígitos")
  ).optional(),
  cnpj: z.string().trim().min(1).max(20).optional(),
  instagram_url: z.string().trim().max(255).nullish(),
  address_street: z.string().trim().max(120).nullish(),
  address_number: z.string().trim().max(30).nullish(),
  address_complement: z.string().trim().max(80).nullish(),
  address_neighborhood: z.string().trim().max(80).nullish(),
  address_city: z.string().trim().max(80).nullish(),
  address_uf: z.string().trim().max(2).nullish(),
  address_cep: z.string().trim().max(15).nullish(),
  notes: z.string().trim().max(255).nullish(),
  sort_order: z.preprocess((v) => Number(v) || 0, z.number().int().min(0).max(999999)).optional(),
  is_active: z.preprocess(
    (v) => (Number(v) ? 1 : 0),
    z.union([z.literal(0), z.literal(1)])
  ).optional(),
});

module.exports = {
  createModelBodySchema,
  mediaSelectionBodySchema,
  createRepresentativeBodySchema,
  updateRepresentativeBodySchema,
  formatDronesErrors,
};
