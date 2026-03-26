"use strict";

// schemas/cotacoesSchemas.js
// Zod schemas for the news_cotacoes admin CRUD.
// Used with middleware/validate.js.

const { z } = require("zod");

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

// Nullable optional float.
// - absent → undefined → optional() keeps key absent (for UPDATE compatibility)
// - "" or null → null
// - numeric string → coerced to number
const optionalFloat = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v === "" || v === null) return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : v;
  },
  z.number().nullable().optional()
);

// Nullable optional string with max length.
function optionalStr(max) {
  return z.preprocess(
    (v) => {
      if (v === undefined) return undefined;
      if (v === "" || v === null) return null;
      return v;
    },
    z.string().trim().max(max, `máx ${max} caracteres`).nullable().optional()
  );
}

// Nullable optional datetime string (YYYY-MM-DD or YYYY-MM-DD HH:mm:ss).
const optionalDatetime = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v === "" || v === null) return null;
    return v;
  },
  z.string().regex(DATETIME_RE, "formato inválido (YYYY-MM-DD HH:mm:ss)").nullable().optional()
);

// Coerce to 0|1 tinyint. Defaults to 1 when absent.
const boolTiny = z.preprocess(
  (v) => {
    if (v === undefined) return 1;
    const n = Number(v);
    return Number.isFinite(n) ? (n ? 1 : 0) : (v ? 1 : 0);
  },
  z.union([z.literal(0), z.literal(1)])
);

/* ─── CREATE ─────────────────────────────────────────────────────────────── */

const createCotacaoBodySchema = z.object({
  name: z.string().trim().min(1, "obrigatório").max(120, "máx 120 caracteres"),

  slug: z.preprocess(
    (v) => String(v || "").trim().toLowerCase(),
    z.string().min(1, "obrigatório").regex(SLUG_RE, "slug inválido (use letras, números e hífens)")
  ),

  type: z.string().trim().min(1, "obrigatório").max(60, "máx 60 caracteres"),

  price: optionalFloat,
  variation_day: optionalFloat,

  unit: optionalStr(120),
  market: optionalStr(120),
  source: optionalStr(120),

  last_update_at: optionalDatetime,

  ativo: boolTiny,
});

/* ─── UPDATE (partial — only sent fields are validated and forwarded) ────── */

const updateCotacaoBodySchema = z.object({
  name: z.string().trim().max(120, "máx 120 caracteres").nullable().optional(),

  slug: z.preprocess(
    (v) => {
      if (v === undefined) return undefined;
      if (v === "" || v === null) return null;
      return String(v).trim().toLowerCase();
    },
    z.string().regex(SLUG_RE, "slug inválido (use letras, números e hífens)").nullable().optional()
  ),

  type: z.string().trim().max(60, "máx 60 caracteres").nullable().optional(),

  price: optionalFloat,
  variation_day: optionalFloat,

  unit: optionalStr(120),
  market: optionalStr(120),
  source: optionalStr(120),

  last_update_at: optionalDatetime,

  ativo: boolTiny.optional(),
});

module.exports = { createCotacaoBodySchema, updateCotacaoBodySchema };
