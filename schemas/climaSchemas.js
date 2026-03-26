"use strict";

// schemas/climaSchemas.js
// Zod schemas for the news_clima admin CRUD.
// Used with middleware/validate.js.

const { z } = require("zod");

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UF_RE = /^[A-Z]{2}$/;
const STATION_CODE_RE = /^([A-Z]\d{3}|\d{4,7})$/;
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
    return Number.isFinite(n) ? n : v; // pass invalid through → fails z.number()
  },
  z.number().nullable().optional()
);

// Nullable optional string with max length.
// - absent → undefined → key absent
// - "" or null → null
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

const createClimaBodySchema = z.object({
  city_name: z.string().trim().min(1, "obrigatório").max(120, "máx 120 caracteres"),

  slug: z.preprocess(
    (v) => String(v || "").trim().toLowerCase(),
    z.string().min(1, "obrigatório").regex(SLUG_RE, "slug inválido (use letras, números e hífens)")
  ),

  uf: z.preprocess(
    (v) => String(v || "").trim().toUpperCase(),
    z.string().regex(UF_RE, "uf inválido (use 2 letras maiúsculas)")
  ),

  ibge_id: z.preprocess(
    (v) => {
      if (v === undefined || v === "" || v === null) return null;
      const n = Number.parseInt(String(v), 10);
      return Number.isNaN(n) ? v : n;
    },
    z.number().int().min(1, "ibge_id inválido (inteiro > 0)").nullable().optional()
  ),

  station_code: z.preprocess(
    (v) => {
      if (v === undefined || v === "" || v === null) return null;
      return String(v).trim().toUpperCase();
    },
    z
      .string()
      .max(10, "máx 10 caracteres")
      .regex(STATION_CODE_RE, "station_code inválido (ex.: A827 ou 83692)")
      .nullable()
      .optional()
  ),

  station_name: optionalStr(120),
  station_uf: z.preprocess(
    (v) => {
      if (v === undefined || v === "" || v === null) return null;
      return String(v).trim().toUpperCase();
    },
    z.string().regex(UF_RE, "station_uf inválido (2 letras maiúsculas)").nullable().optional()
  ),
  station_lat: optionalFloat,
  station_lon: optionalFloat,
  station_distance: optionalFloat,

  ibge_source: optionalStr(120),
  station_source: optionalStr(120),
  source: optionalStr(120),

  mm_24h: optionalFloat,
  mm_7d: optionalFloat,

  last_update_at: optionalDatetime,
  last_sync_observed_at: optionalDatetime,
  last_sync_forecast_at: optionalDatetime,

  ativo: boolTiny,
});

/* ─── UPDATE (partial — only sent fields are validated and forwarded) ────── */

const updateClimaBodySchema = z.object({
  city_name: z.string().trim().max(120, "máx 120 caracteres").nullable().optional(),

  slug: z.preprocess(
    (v) => {
      if (v === undefined) return undefined;
      if (v === "" || v === null) return null;
      return String(v).trim().toLowerCase();
    },
    z.string().regex(SLUG_RE, "slug inválido (use letras, números e hífens)").nullable().optional()
  ),

  uf: z.preprocess(
    (v) => {
      if (v === undefined) return undefined;
      if (v === "" || v === null) return null;
      return String(v).trim().toUpperCase();
    },
    z.string().regex(UF_RE, "uf inválido (use 2 letras maiúsculas)").nullable().optional()
  ),

  ibge_id: z.preprocess(
    (v) => {
      if (v === undefined || v === "" || v === null) return null;
      const n = Number.parseInt(String(v), 10);
      return Number.isNaN(n) ? v : n;
    },
    z.number().int().min(1, "ibge_id inválido (inteiro > 0)").nullable().optional()
  ),

  station_code: z.preprocess(
    (v) => {
      if (v === undefined) return undefined;
      if (v === "" || v === null) return null;
      return String(v).trim().toUpperCase();
    },
    z
      .string()
      .max(10, "máx 10 caracteres")
      .regex(STATION_CODE_RE, "station_code inválido (ex.: A827 ou 83692)")
      .nullable()
      .optional()
  ),

  station_name: optionalStr(120),
  station_uf: z.preprocess(
    (v) => {
      if (v === undefined) return undefined;
      if (v === "" || v === null) return null;
      return String(v).trim().toUpperCase();
    },
    z.string().regex(UF_RE, "station_uf inválido (2 letras maiúsculas)").nullable().optional()
  ),
  station_lat: optionalFloat,
  station_lon: optionalFloat,
  station_distance: optionalFloat,

  ibge_source: optionalStr(120),
  station_source: optionalStr(120),
  source: optionalStr(120),

  mm_24h: optionalFloat,
  mm_7d: optionalFloat,

  last_update_at: optionalDatetime,
  last_sync_observed_at: optionalDatetime,
  last_sync_forecast_at: optionalDatetime,

  ativo: boolTiny.optional(),
});

module.exports = { createClimaBodySchema, updateClimaBodySchema };
