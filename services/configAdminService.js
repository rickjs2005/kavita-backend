"use strict";
// services/configAdminService.js
// Regras de negócio para configurações da loja (shop_settings + categories).

const pool = require("../config/pool");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/configRepository");

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function safeTrim(v) {
  return typeof v === "string" ? v.trim() : v;
}

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function normalizeSettings(row) {
  if (!row) return null;

  const toBool = (v) => !!Number(v);
  const toNum = (v) => (v === null || v === undefined ? 0 : Number(v));
  const footerLinks = safeJsonParse(row.footer_links, null);

  return {
    id: row.id,
    store_name: row.store_name || "",
    store_slug: row.store_slug || "",
    cnpj: row.cnpj || "",
    main_email: row.main_email || "",
    main_whatsapp: row.main_whatsapp || "",
    logo_url: row.logo_url || "",
    address_city: row.address_city || "",
    address_state: row.address_state || "",
    address_street: row.address_street || "",
    address_neighborhood: row.address_neighborhood || "",
    address_zip: row.address_zip || "",
    footer_tagline: row.footer_tagline || "",
    contact_whatsapp: row.contact_whatsapp || "",
    contact_email: row.contact_email || "",
    social_instagram_url: row.social_instagram_url || "",
    social_whatsapp_url: row.social_whatsapp_url || "",
    footer_partner_cta_enabled: toBool(row.footer_partner_cta_enabled),
    footer_partner_cta_title: row.footer_partner_cta_title || "",
    footer_partner_cta_text: row.footer_partner_cta_text || "",
    footer_partner_cta_href: row.footer_partner_cta_href || "",
    footer_links: footerLinks,
    checkout_require_cpf: toBool(row.checkout_require_cpf),
    checkout_require_address: toBool(row.checkout_require_address),
    checkout_allow_pickup: toBool(row.checkout_allow_pickup),
    checkout_enable_coupons: toBool(row.checkout_enable_coupons),
    checkout_enable_abandoned_cart: toBool(row.checkout_enable_abandoned_cart),
    payment_pix_enabled: toBool(row.payment_pix_enabled),
    payment_card_enabled: toBool(row.payment_card_enabled),
    payment_boleto_enabled: toBool(row.payment_boleto_enabled),
    mp_public_key: row.mp_public_key || "",
    mp_access_token: row.mp_access_token || "",
    mp_auto_return: row.mp_auto_return || "approved",
    mp_sandbox_mode: toBool(row.mp_sandbox_mode),
    shipping_flat_enabled: toBool(row.shipping_flat_enabled),
    shipping_flat_value: toNum(row.shipping_flat_value),
    shipping_free_over: toNum(row.shipping_free_over),
    shipping_region_text: row.shipping_region_text || "",
    shipping_deadline_text: row.shipping_deadline_text || "",
    comm_email_enabled: toBool(row.comm_email_enabled),
    comm_whatsapp_enabled: toBool(row.comm_whatsapp_enabled),
    seo_title: row.seo_title || "",
    seo_description: row.seo_description || "",
    google_analytics_id: row.google_analytics_id || "",
    facebook_pixel_id: row.facebook_pixel_id || "",
  };
}

function normalizeFooterLinks(input, currentValue) {
  if (input === undefined) return currentValue;
  if (input === null) return null;

  const parsed = typeof input === "string" ? safeJsonParse(input, null) : input;
  if (!Array.isArray(parsed)) return currentValue;

  const cleaned = parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = safeTrim(item.label);
      const href = safeTrim(item.href);
      if (!label || !href) return null;
      return {
        label: String(label).slice(0, 60),
        href: String(href).slice(0, 200),
        ...(item.highlight !== undefined ? { highlight: !!item.highlight } : {}),
      };
    })
    .filter(Boolean);

  return cleaned;
}

// ---------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------

async function getSettings() {
  const id = await repo.ensureSettings(pool);
  const row = await repo.findSettingsById(pool, id);
  return normalizeSettings(row);
}

async function updateSettings(body) {
  const id = await repo.ensureSettings(pool);
  const row = await repo.findSettingsById(pool, id);
  const current = row || {};

  const {
    store_name, store_slug, cnpj, main_email, main_whatsapp, logo_url,
    address_city, address_state, address_street, address_neighborhood, address_zip,
    footer_tagline, contact_whatsapp, contact_email,
    social_instagram_url, social_whatsapp_url,
    footer_partner_cta_enabled, footer_partner_cta_title,
    footer_partner_cta_text, footer_partner_cta_href, footer_links,
    checkout_require_cpf, checkout_require_address, checkout_allow_pickup,
    checkout_enable_coupons, checkout_enable_abandoned_cart,
    payment_pix_enabled, payment_card_enabled, payment_boleto_enabled,
    mp_public_key, mp_access_token, mp_auto_return, mp_sandbox_mode,
    shipping_flat_enabled, shipping_flat_value, shipping_free_over,
    shipping_region_text, shipping_deadline_text,
    comm_email_enabled, comm_whatsapp_enabled,
    seo_title, seo_description, google_analytics_id, facebook_pixel_id,
  } = body;

  const boolOrCurrent = (val, curr) => (typeof val === "boolean" ? (val ? 1 : 0) : curr);
  const numOrCurrent = (val, curr) => (typeof val === "number" ? val : curr);
  const normalizedLinks = normalizeFooterLinks(footer_links, current.footer_links);

  const updateData = {
    store_name: store_name ?? current.store_name,
    store_slug: store_slug ?? current.store_slug,
    cnpj: cnpj ?? current.cnpj,
    main_email: main_email ?? current.main_email,
    main_whatsapp: main_whatsapp ?? current.main_whatsapp,
    logo_url: logo_url ?? current.logo_url,
    address_city: address_city ?? current.address_city,
    address_state: address_state ?? current.address_state,
    address_street: address_street ?? current.address_street,
    address_neighborhood: address_neighborhood ?? current.address_neighborhood,
    address_zip: address_zip ?? current.address_zip,
    footer_tagline: footer_tagline ?? current.footer_tagline,
    contact_whatsapp: contact_whatsapp ?? current.contact_whatsapp,
    contact_email: contact_email ?? current.contact_email,
    social_instagram_url: social_instagram_url ?? current.social_instagram_url,
    social_whatsapp_url: social_whatsapp_url ?? current.social_whatsapp_url,
    footer_partner_cta_enabled: boolOrCurrent(footer_partner_cta_enabled, current.footer_partner_cta_enabled),
    footer_partner_cta_title: footer_partner_cta_title ?? current.footer_partner_cta_title,
    footer_partner_cta_text: footer_partner_cta_text ?? current.footer_partner_cta_text,
    footer_partner_cta_href: footer_partner_cta_href ?? current.footer_partner_cta_href,
    footer_links:
      normalizedLinks === undefined
        ? current.footer_links
        : normalizedLinks === null
          ? null
          : JSON.stringify(normalizedLinks),
    checkout_require_cpf: boolOrCurrent(checkout_require_cpf, current.checkout_require_cpf),
    checkout_require_address: boolOrCurrent(checkout_require_address, current.checkout_require_address),
    checkout_allow_pickup: boolOrCurrent(checkout_allow_pickup, current.checkout_allow_pickup),
    checkout_enable_coupons: boolOrCurrent(checkout_enable_coupons, current.checkout_enable_coupons),
    checkout_enable_abandoned_cart: boolOrCurrent(checkout_enable_abandoned_cart, current.checkout_enable_abandoned_cart),
    payment_pix_enabled: boolOrCurrent(payment_pix_enabled, current.payment_pix_enabled),
    payment_card_enabled: boolOrCurrent(payment_card_enabled, current.payment_card_enabled),
    payment_boleto_enabled: boolOrCurrent(payment_boleto_enabled, current.payment_boleto_enabled),
    mp_public_key: mp_public_key ?? current.mp_public_key,
    mp_access_token: mp_access_token ?? current.mp_access_token,
    mp_auto_return: mp_auto_return ?? current.mp_auto_return,
    mp_sandbox_mode: boolOrCurrent(mp_sandbox_mode, current.mp_sandbox_mode),
    shipping_flat_enabled: boolOrCurrent(shipping_flat_enabled, current.shipping_flat_enabled),
    shipping_flat_value: numOrCurrent(shipping_flat_value, current.shipping_flat_value),
    shipping_free_over: numOrCurrent(shipping_free_over, current.shipping_free_over),
    shipping_region_text: shipping_region_text ?? current.shipping_region_text,
    shipping_deadline_text: shipping_deadline_text ?? current.shipping_deadline_text,
    comm_email_enabled: boolOrCurrent(comm_email_enabled, current.comm_email_enabled),
    comm_whatsapp_enabled: boolOrCurrent(comm_whatsapp_enabled, current.comm_whatsapp_enabled),
    seo_title: seo_title ?? current.seo_title,
    seo_description: seo_description ?? current.seo_description,
    google_analytics_id: google_analytics_id ?? current.google_analytics_id,
    facebook_pixel_id: facebook_pixel_id ?? current.facebook_pixel_id,
  };

  await repo.updateSettingsById(pool, id, updateData);
  return { success: true };
}

async function listCategories() {
  const rows = await repo.findAllCategories(pool);
  return rows.map((c) => ({
    id: c.id,
    nome: c.nome,
    slug: c.slug,
    ativo: !!c.ativo,
  }));
}

async function createCategory(body) {
  const { nome, slug, ativo } = body;
  if (!nome || !String(nome).trim()) {
    throw new AppError("Nome da categoria é obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  const id = await repo.insertCategory(pool, nome, slug, ativo);
  return { id };
}

async function updateCategory(categoryId, body) {
  const { nome, slug, ativo } = body;
  const affected = await repo.updateCategoryById(pool, categoryId, nome, slug, ativo);
  if (affected === 0) {
    throw new AppError("Categoria não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
}

module.exports = {
  getSettings,
  updateSettings,
  listCategories,
  createCategory,
  updateCategory,
};
