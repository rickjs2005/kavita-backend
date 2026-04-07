"use strict";
// schemas/heroSlidesSchemas.js
// Zod schemas for hero slides CRUD.

const { z } = require("zod");

const slideTypes = ["promotional", "institutional", "informational"];

const CreateSlideSchema = z.object({
  title: z.string().max(255, "Título máx. 255 caracteres.").default(""),
  subtitle: z.string().max(500, "Subtítulo máx. 500 caracteres.").optional().default(""),
  badge_text: z.string().max(100, "Badge máx. 100 caracteres.").optional().default(""),
  slide_type: z.enum(slideTypes, { message: "Tipo inválido." }).default("institutional"),
  button_label: z.string().max(80, "Label máx. 80 caracteres.").default("Saiba Mais"),
  button_href: z.string().max(255, "Href máx. 255 caracteres.").default("/drones"),
  button_secondary_label: z.string().max(80).optional().default(""),
  button_secondary_href: z.string().max(255).optional().default(""),
  sort_order: z.preprocess((v) => Number(v) || 0, z.number().int().min(0).max(999999)),
  is_active: z.preprocess(
    (v) => (v === undefined ? 1 : Number(v) ? 1 : 0),
    z.union([z.literal(0), z.literal(1)]),
  ),
  starts_at: z.string().optional().default(""),
  ends_at: z.string().optional().default(""),
}).transform((data) => ({
  title: (data.title || "").trim(),
  subtitle: (data.subtitle || "").trim() || null,
  badge_text: (data.badge_text || "").trim() || null,
  slide_type: data.slide_type,
  button_label: (data.button_label || "").trim() || "Saiba Mais",
  button_href: (data.button_href || "").trim() || "/drones",
  button_secondary_label: (data.button_secondary_label || "").trim() || null,
  button_secondary_href: (data.button_secondary_href || "").trim() || null,
  sort_order: data.sort_order,
  is_active: data.is_active,
  starts_at: data.starts_at?.trim() || null,
  ends_at: data.ends_at?.trim() || null,
}));

const UpdateSlideSchema = CreateSlideSchema; // Full schema — frontend sends all fields via FormData

function formatSlideErrors(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join(".") || "body",
    message: issue.message,
  }));
}

module.exports = { CreateSlideSchema, UpdateSlideSchema, formatSlideErrors };
