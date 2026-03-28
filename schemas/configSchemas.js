"use strict";
// schemas/configSchemas.js
// Zod schemas para validação das rotas de configuração da loja.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const optionalString = z.string().optional();

const footerLinkSchema = z.object({
  label: z.string().min(1).max(60),
  href: z.string().min(1).max(200),
  highlight: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// PUT /api/admin/config  (atualização parcial — todos os campos opcionais)
// ---------------------------------------------------------------------------

const UpdateSettingsSchema = z
  .object({
    store_name: optionalString,
    store_slug: optionalString,
    cnpj: optionalString,
    main_email: z.string().email("E-mail inválido.").optional(),
    main_whatsapp: optionalString,
    logo_url: optionalString,
    address_city: optionalString,
    address_state: optionalString,
    address_street: optionalString,
    address_neighborhood: optionalString,
    address_zip: optionalString,
    footer_tagline: optionalString,
    contact_whatsapp: optionalString,
    contact_email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
    social_instagram_url: optionalString,
    social_whatsapp_url: optionalString,
    footer_partner_cta_enabled: z.boolean().optional(),
    footer_partner_cta_title: optionalString,
    footer_partner_cta_text: optionalString,
    footer_partner_cta_href: optionalString,
    footer_links: z.array(footerLinkSchema).nullable().optional(),
    checkout_require_cpf: z.boolean().optional(),
    checkout_require_address: z.boolean().optional(),
    checkout_allow_pickup: z.boolean().optional(),
    checkout_enable_coupons: z.boolean().optional(),
    checkout_enable_abandoned_cart: z.boolean().optional(),
    payment_pix_enabled: z.boolean().optional(),
    payment_card_enabled: z.boolean().optional(),
    payment_boleto_enabled: z.boolean().optional(),
    mp_public_key: optionalString,
    mp_access_token: optionalString,
    mp_auto_return: z.enum(["approved", "all"]).optional(),
    mp_sandbox_mode: z.boolean().optional(),
    shipping_flat_enabled: z.boolean().optional(),
    shipping_flat_value: z.number().min(0).optional(),
    shipping_free_over: z.number().min(0).optional(),
    shipping_region_text: optionalString,
    shipping_deadline_text: optionalString,
    comm_email_enabled: z.boolean().optional(),
    comm_whatsapp_enabled: z.boolean().optional(),
    seo_title: optionalString,
    seo_description: optionalString,
    google_analytics_id: optionalString,
    facebook_pixel_id: optionalString,
  })
  .strict();

// ---------------------------------------------------------------------------
// POST /api/admin/config/categories
// ---------------------------------------------------------------------------

const CreateCategorySchema = z.object({
  nome: z.string({ required_error: "Nome é obrigatório." }).min(1, "Nome é obrigatório.").max(100),
  slug: z.string().max(120).optional(),
  ativo: z.boolean().optional().default(true),
});

// ---------------------------------------------------------------------------
// PUT /api/admin/config/categories/:id — body
// ---------------------------------------------------------------------------

const UpdateCategorySchema = z.object({
  nome: z.string().min(1, "Nome não pode ser vazio.").max(100).optional(),
  slug: z.string().max(120).optional(),
  ativo: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Params compartilhado — /categories/:id
// ---------------------------------------------------------------------------

const CategoryIdParamSchema = z.object({
  id: z
    .string({ required_error: "ID inválido." })
    .regex(/^[1-9]\d*$/, "ID inválido.")
    .transform(Number),
});

module.exports = {
  UpdateSettingsSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  CategoryIdParamSchema,
};
