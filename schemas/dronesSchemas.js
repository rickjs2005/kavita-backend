// schemas/dronesSchemas.js
// Zod schemas for the drones admin module.
// Used directly in controllers — validates and coerces request bodies
// before business logic runs.

"use strict";

const { z } = require("zod");

const MODEL_KEY_RE = /^[a-z0-9_]{2,20}$/;
const PHONE_DIGITS_RE = /^\d{10,13}$/;

/**
 * Formats Zod issues into the standard error convention: [{ field, message }].
 */
function formatDronesErrors(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join(".") || "body",
    message: issue.message,
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

// ─── Leads ──────────────────────────────────────────────────────────────────

const LEAD_STATUS_VALUES = [
  "NOVO",
  "EM_CONTATO",
  "NEGOCIACAO",
  "CONVERTIDO",
  "PERDIDO",
];

/**
 * POST /api/public/drones/leads — captura pública (sem auth).
 * telefone vem do form do visitante; aceita formatado, normaliza para
 * dígitos. Demais campos são opcionais — só nome + telefone obrigatórios
 * para permitir contato posterior.
 */
const createLeadPublicSchema = z.object({
  nome: z.string().trim().min(1, "obrigatório").max(120),
  telefone: z.preprocess(
    (v) => String(v || "").replace(/\D/g, ""),
    z.string().regex(PHONE_DIGITS_RE, "telefone deve ter 10-13 dígitos"),
  ),
  cidade: z.string().trim().max(80).nullish(),
  uf: z.preprocess(
    (v) => (v == null ? null : String(v).trim().toUpperCase() || null),
    z.string().max(2).nullish(),
  ),
  modelo_interesse: z.preprocess(
    (v) => (v == null ? null : String(v).trim().toLowerCase() || null),
    z.string().max(40).nullish(),
  ),
  mensagem: z.string().trim().max(1000).nullish(),
  origem: z.string().trim().max(60).nullish(),
});

/**
 * PUT /api/admin/drones/leads/:id — atualização parcial pelo admin.
 * Campos ausentes são removidos pelo Zod, então o service só aplica
 * o que veio. Status só aceita valores do enum do banco.
 */
const updateLeadAdminSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  telefone: z
    .preprocess(
      (v) => String(v || "").replace(/\D/g, ""),
      z.string().regex(PHONE_DIGITS_RE, "telefone deve ter 10-13 dígitos"),
    )
    .optional(),
  cidade: z.string().trim().max(80).nullish(),
  uf: z.preprocess(
    (v) => (v == null ? null : String(v).trim().toUpperCase() || null),
    z.string().max(2).nullish(),
  ),
  modelo_interesse: z.preprocess(
    (v) => (v == null ? null : String(v).trim().toLowerCase() || null),
    z.string().max(40).nullish(),
  ),
  mensagem: z.string().trim().max(1000).nullish(),
  origem: z.string().trim().max(60).nullish(),
  status: z
    .preprocess(
      (v) => String(v || "").trim().toUpperCase(),
      z.enum(LEAD_STATUS_VALUES),
    )
    .optional(),
  assigned_to: z
    .preprocess((v) => (v == null || v === "" ? null : Number(v)), z.number().int().nullish())
    .optional(),
});

// ─── FAQ ────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/drones/faq — criar item de FAQ.
 * answer aceita até 5000 chars (texto longo). question é título do item.
 */
const createFaqSchema = z.object({
  question: z.string().trim().min(1, "obrigatório").max(255),
  answer: z.string().trim().min(1, "obrigatório").max(5000),
  sort_order: z
    .preprocess((v) => Number(v) || 0, z.number().int().min(0).max(999999))
    .optional(),
  is_active: z
    .preprocess(
      (v) => (v === undefined ? 1 : Number(v) ? 1 : 0),
      z.union([z.literal(0), z.literal(1)]),
    )
    .optional(),
});

/**
 * PUT /api/admin/drones/faq/:id — atualização parcial de item de FAQ.
 */
const updateFaqSchema = z.object({
  question: z.string().trim().min(1).max(255).optional(),
  answer: z.string().trim().min(1).max(5000).optional(),
  sort_order: z
    .preprocess((v) => Number(v) || 0, z.number().int().min(0).max(999999))
    .optional(),
  is_active: z
    .preprocess(
      (v) => (Number(v) ? 1 : 0),
      z.union([z.literal(0), z.literal(1)]),
    )
    .optional(),
});

// ─── Cases ──────────────────────────────────────────────────────────────────

/**
 * Body comum de cases (create + update parcial). Como o controller usa
 * multipart (upload de imagens), todos os campos vêm como string. O
 * preprocess força tipos numéricos / boolean apropriados.
 *
 * Imagens NÃO entram no schema — são tratadas pelo controller via
 * mediaService antes de delegar ao service.
 */
function caseFieldsBase(extend = {}) {
  return {
    title: z.string().trim().min(1).max(160),
    farm_name: z.string().trim().min(1).max(160),
    producer_name: z.string().trim().max(120).nullish(),
    city: z.string().trim().max(80).nullish(),
    uf: z
      .preprocess(
        (v) => (v == null ? null : String(v).trim().toUpperCase() || null),
        z.string().max(2).nullish(),
      ),
    hectares: z
      .preprocess(
        (v) =>
          v == null || v === ""
            ? null
            : Number.isFinite(Number(v))
              ? Number(v)
              : null,
        z.number().min(0).max(99999999).nullish(),
      ),
    model_key: z
      .preprocess(
        (v) => (v == null ? null : String(v).trim().toLowerCase() || null),
        z.string().max(20).nullish(),
      ),
    summary: z.string().trim().max(500).nullish(),
    testimonial: z.string().trim().max(5000).nullish(),
    // Storytelling labels do antes/depois (texto curto sob cada imagem)
    before_label: z.string().trim().max(160).nullish(),
    after_label: z.string().trim().max(160).nullish(),
    // Métricas: array opcional de { label, value, hint? }. Vem de
    // multipart como JSON string; preprocess converte para array.
    metrics: z
      .preprocess(
        (v) => {
          if (v == null || v === "") return null;
          if (Array.isArray(v)) return v;
          if (typeof v === "string") {
            try {
              const parsed = JSON.parse(v);
              return Array.isArray(parsed) ? parsed : null;
            } catch {
              return null;
            }
          }
          return null;
        },
        z
          .array(
            z.object({
              label: z.string().trim().max(60).nullish(),
              value: z.string().trim().max(40).nullish(),
              hint: z.string().trim().max(80).nullish(),
            }),
          )
          .max(6)
          .nullish(),
      )
      .optional(),
    permission_to_use: z
      .preprocess(
        (v) => (v === undefined ? 0 : Number(v) ? 1 : 0),
        z.union([z.literal(0), z.literal(1)]),
      )
      .optional(),
    sort_order: z
      .preprocess((v) => Number(v) || 0, z.number().int().min(0).max(999999))
      .optional(),
    is_active: z
      .preprocess(
        (v) => (v === undefined ? 1 : Number(v) ? 1 : 0),
        z.union([z.literal(0), z.literal(1)]),
      )
      .optional(),
    ...extend,
  };
}

const createCaseSchema = z.object(caseFieldsBase());

// Para update, os campos obrigatórios viram opcionais — admin pode
// editar parcialmente.
const updateCaseSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  farm_name: z.string().trim().min(1).max(160).optional(),
  producer_name: z.string().trim().max(120).nullish(),
  city: z.string().trim().max(80).nullish(),
  uf: z.preprocess(
    (v) => (v == null ? null : String(v).trim().toUpperCase() || null),
    z.string().max(2).nullish(),
  ),
  hectares: z.preprocess(
    (v) =>
      v == null || v === ""
        ? null
        : Number.isFinite(Number(v))
          ? Number(v)
          : null,
    z.number().min(0).max(99999999).nullish(),
  ),
  model_key: z.preprocess(
    (v) => (v == null ? null : String(v).trim().toLowerCase() || null),
    z.string().max(20).nullish(),
  ),
  summary: z.string().trim().max(500).nullish(),
  testimonial: z.string().trim().max(5000).nullish(),
  before_label: z.string().trim().max(160).nullish(),
  after_label: z.string().trim().max(160).nullish(),
  metrics: z
    .preprocess(
      (v) => {
        if (v == null || v === "") return null;
        if (Array.isArray(v)) return v;
        if (typeof v === "string") {
          try {
            const parsed = JSON.parse(v);
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        }
        return null;
      },
      z
        .array(
          z.object({
            label: z.string().trim().max(60).nullish(),
            value: z.string().trim().max(40).nullish(),
            hint: z.string().trim().max(80).nullish(),
          }),
        )
        .max(6)
        .nullish(),
    )
    .optional(),
  permission_to_use: z
    .preprocess(
      (v) => (Number(v) ? 1 : 0),
      z.union([z.literal(0), z.literal(1)]),
    )
    .optional(),
  sort_order: z
    .preprocess((v) => Number(v) || 0, z.number().int().min(0).max(999999))
    .optional(),
  is_active: z
    .preprocess(
      (v) => (Number(v) ? 1 : 0),
      z.union([z.literal(0), z.literal(1)]),
    )
    .optional(),
});

// ─── Landing sections (why/who/how/trust) ──────────────────────────────────

const SECTION_KEY_RE = /^[a-z0-9_]{2,40}$/;

/**
 * Item de uma seção da landing. Shape comum, alguns campos opcionais
 * porque cada seção (why/who/how/trust) usa um subconjunto.
 */
const sectionItemSchema = z.object({
  icon: z.string().trim().max(40).nullish(),
  title: z.string().trim().max(160).nullish(),
  text: z.string().trim().max(1000).nullish(),
  badge: z.string().trim().max(60).nullish(),
});

/**
 * PUT /api/admin/drones/sections/:key — upsert da seção pela key.
 * O service preenche section_key a partir do params, mas aceitamos
 * também no body para compatibilidade.
 */
const upsertLandingSectionSchema = z.object({
  section_key: z.preprocess(
    (v) => String(v || "").trim().toLowerCase(),
    z.string().regex(SECTION_KEY_RE, "use a-z, 0-9, _ (2-40 chars)"),
  ),
  title: z.string().trim().max(160).nullish(),
  subtitle: z.string().trim().max(500).nullish(),
  items: z.array(sectionItemSchema).max(50).optional().default([]),
  sort_order: z
    .preprocess((v) => Number(v) || 0, z.number().int().min(0).max(999999))
    .optional(),
  is_active: z
    .preprocess(
      (v) => (v === undefined ? 1 : Number(v) ? 1 : 0),
      z.union([z.literal(0), z.literal(1)]),
    )
    .optional(),
});

module.exports = {
  createModelBodySchema,
  mediaSelectionBodySchema,
  createRepresentativeBodySchema,
  updateRepresentativeBodySchema,
  createLeadPublicSchema,
  updateLeadAdminSchema,
  LEAD_STATUS_VALUES,
  createFaqSchema,
  updateFaqSchema,
  createCaseSchema,
  updateCaseSchema,
  upsertLandingSectionSchema,
  SECTION_KEY_RE,
  formatDronesErrors,
};
