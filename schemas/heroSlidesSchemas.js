"use strict";
// schemas/heroSlidesSchemas.js
// Zod schemas for hero slides CRUD.
//
// CMS fields (Sprint 5 / 2026-05-09):
//   - badge_icon, features (up to 4), quick_links (up to 5).
//   - Icon keys must match the frontend catalog in
//     kavita-frontend/src/lib/heroIcons.tsx — keep in sync.

const { z } = require("zod");

const slideTypes = ["promotional", "institutional", "informational"];

const HERO_ICON_KEYS = [
  "leaf",
  "news",
  "chart-line",
  "drone",
  "bell",
  "shield",
  "cloud",
  "pie-chart",
  "truck",
  "wallet",
  "messages",
  "clock",
];

// Aceita string vazia/null e devolve null. Permite que admin "limpe"
// um campo deixando vazio sem precisar enviar literal null.
const optionalIcon = z
  .union([z.literal(""), z.enum(HERO_ICON_KEYS, { message: "Ícone inválido." })])
  .optional()
  .nullable()
  .transform((v) => (v && HERO_ICON_KEYS.includes(v) ? v : null));

const requiredIcon = z.enum(HERO_ICON_KEYS, {
  message: "Selecione um ícone do catálogo.",
});

const FeatureSchema = z.object({
  icon: requiredIcon,
  title: z.string().min(1, "Título do feature é obrigatório.").max(60, "Título máx. 60."),
  subtitle: z.string().max(80, "Subtítulo máx. 80.").optional().default(""),
});

const QuickLinkSchema = z.object({
  icon: requiredIcon,
  kicker: z.string().min(1, "Kicker é obrigatório.").max(40, "Kicker máx. 40."),
  title: z.string().min(1, "Título do link é obrigatório.").max(80, "Título máx. 80."),
  description: z.string().max(160, "Descrição máx. 160.").optional().default(""),
  href: z.string().max(255).optional().default(""),
});

// Multipart envia arrays como string JSON ("[]" ou "[{...}]").
// Aceitamos string (parse aqui) ou array (já parseado por outro consumer).
function preparseJsonArray(raw) {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const CreateSlideSchema = z.object({
  title: z.string().max(255, "Título máx. 255 caracteres.").default(""),
  subtitle: z.string().max(500, "Subtítulo máx. 500 caracteres.").optional().default(""),
  badge_text: z.string().max(100, "Badge máx. 100 caracteres.").optional().default(""),
  badge_icon: optionalIcon,
  slide_type: z.enum(slideTypes, { message: "Tipo inválido." }).default("institutional"),
  button_label: z.string().max(80, "Label máx. 80 caracteres.").default("Saiba Mais"),
  button_href: z.string().max(255, "Href máx. 255 caracteres.").default("/drones"),
  button_secondary_label: z.string().max(80).optional().default(""),
  button_secondary_href: z.string().max(255).optional().default(""),
  features: z
    .preprocess(preparseJsonArray, z.array(FeatureSchema).max(4, "Máximo 4 features."))
    .optional()
    .default([]),
  quick_links: z
    .preprocess(preparseJsonArray, z.array(QuickLinkSchema).max(5, "Máximo 5 quick links."))
    .optional()
    .default([]),
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
  badge_icon: data.badge_icon || null,
  slide_type: data.slide_type,
  button_label: (data.button_label || "").trim() || "Saiba Mais",
  button_href: (data.button_href || "").trim() || "/drones",
  button_secondary_label: (data.button_secondary_label || "").trim() || null,
  button_secondary_href: (data.button_secondary_href || "").trim() || null,
  // MySQL JSON aceita o array direto (driver mysql2 serializa). Salvamos
  // null quando vazio para deixar slides "sem CMS" explícitos no banco.
  features: Array.isArray(data.features) && data.features.length
    ? data.features.map((f) => ({
        icon: f.icon,
        title: f.title.trim(),
        subtitle: (f.subtitle || "").trim(),
      }))
    : null,
  quick_links: Array.isArray(data.quick_links) && data.quick_links.length
    ? data.quick_links.map((q) => ({
        icon: q.icon,
        kicker: q.kicker.trim(),
        title: q.title.trim(),
        description: (q.description || "").trim(),
        href: (q.href || "").trim() || null,
      }))
    : null,
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

module.exports = {
  CreateSlideSchema,
  UpdateSlideSchema,
  formatSlideErrors,
  HERO_ICON_KEYS,
};
