"use strict";
// controllers/shopConfigPublicController.js
// Endpoint público de configurações da loja (header/footer).

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const configRepo = require("../repositories/configRepository");

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

function normalizePublicSettings(row) {
  if (!row) {
    return {
      store_name: "Kavita", logo_url: "",
      footer_tagline: "", contact_whatsapp: "", contact_email: "", cnpj: "",
      social_instagram_url: "", social_whatsapp_url: "",
      address_city: "", address_state: "", address_street: "",
      address_neighborhood: "", address_zip: "",
      footer_partner_cta_enabled: true, footer_partner_cta_title: "",
      footer_partner_cta_text: "", footer_partner_cta_href: "",
      footer_links: [],
      footer: {
        tagline: "", contact_whatsapp: "", contact_email: "",
        social_instagram_url: "", social_whatsapp_url: "",
        address_city: "", address_state: "", address_street: "",
        address_neighborhood: "", address_zip: "",
        partner_cta: { enabled: true, title: "", text: "", href: "" },
      },
    };
  }

  const footerLinks = safeJsonParse(row.footer_links, null);

  return {
    store_name: row.store_name || "Kavita",
    logo_url: row.logo_url || "",
    footer_tagline: row.footer_tagline || "",
    contact_whatsapp: row.contact_whatsapp || "",
    contact_email: row.contact_email || "",
    cnpj: row.cnpj || "",
    social_instagram_url: row.social_instagram_url || "",
    social_whatsapp_url: row.social_whatsapp_url || "",
    address_city: row.address_city || "",
    address_state: row.address_state || "",
    address_street: row.address_street || "",
    address_neighborhood: row.address_neighborhood || "",
    address_zip: row.address_zip || "",
    footer_partner_cta_enabled: !!Number(row.footer_partner_cta_enabled),
    footer_partner_cta_title: row.footer_partner_cta_title || "",
    footer_partner_cta_text: row.footer_partner_cta_text || "",
    footer_partner_cta_href: row.footer_partner_cta_href || "",
    footer_links: Array.isArray(footerLinks) ? footerLinks : null,
    // compat legado (frontend suporta ambos: flat + footer aninhado)
    footer: {
      tagline: row.footer_tagline || "",
      contact_whatsapp: row.contact_whatsapp || "",
      contact_email: row.contact_email || "",
      social_instagram_url: row.social_instagram_url || "",
      social_whatsapp_url: row.social_whatsapp_url || "",
      address_city: row.address_city || "",
      address_state: row.address_state || "",
      address_street: row.address_street || "",
      address_neighborhood: row.address_neighborhood || "",
      address_zip: row.address_zip || "",
      partner_cta: {
        enabled: !!Number(row.footer_partner_cta_enabled),
        title: row.footer_partner_cta_title || "",
        text: row.footer_partner_cta_text || "",
        href: row.footer_partner_cta_href || "",
      },
      links: Array.isArray(footerLinks) ? footerLinks : undefined,
    },
  };
}

const getPublicConfig = async (_req, res, next) => {
  try {
    const row = await configRepo.findPublicSettings();
    return response.ok(res, normalizePublicSettings(row));
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao buscar configurações.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { getPublicConfig };
