// routes/publicShopConfigRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../config/pool");

/**
 * Helpers
 */
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

function normalizePublicSettings(row) {
  if (!row) {
    return {
      store_name: "Kavita",
      logo_url: "",

      footer_tagline: "",
      contact_whatsapp: "",
      contact_email: "",
      cnpj: "",
      social_instagram_url: "",
      social_whatsapp_url: "",

      // Endereço (Sede)
      address_city: "",
      address_state: "",
      address_street: "",
      address_neighborhood: "",
      address_zip: "",

      footer_partner_cta_enabled: true,
      footer_partner_cta_title: "",
      footer_partner_cta_text: "",
      footer_partner_cta_href: "",
      footer_links: [],
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

    // Endereço (Sede)
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

    // compat legado (seu frontend suporta; devolvemos "flat" e também um footer compat)
    footer: {
      tagline: row.footer_tagline || "",
      contact_whatsapp: row.contact_whatsapp || "",
      contact_email: row.contact_email || "",
      social_instagram_url: row.social_instagram_url || "",
      social_whatsapp_url: row.social_whatsapp_url || "",

      // Endereço (compat)
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

/**
 * @openapi
 * /api/config:
 *   get:
 *     tags: [Configurações Públicas]
 *     summary: Retorna configurações públicas da loja (para Header/Footer)
 *     description: Endpoint público usado pelo frontend SSR/ISR. Não expõe credenciais sensíveis.
 *     responses:
 *       200:
 *         description: Configurações públicas retornadas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 store_name: { type: string }
 *                 logo_url: { type: string }
 *
 *                 footer_tagline: { type: string }
 *                 contact_whatsapp: { type: string }
 *                 contact_email: { type: string }
 *                 cnpj: { type: string }
 *                 social_instagram_url: { type: string }
 *                 social_whatsapp_url: { type: string }
 *
 *                 address_city: { type: string }
 *                 address_state: { type: string, description: "UF (2 caracteres)" }
 *                 address_street: { type: string }
 *                 address_neighborhood: { type: string }
 *                 address_zip: { type: string }
 *
 *                 footer_partner_cta_enabled: { type: boolean }
 *                 footer_partner_cta_title: { type: string }
 *                 footer_partner_cta_text: { type: string }
 *                 footer_partner_cta_href: { type: string }
 *                 footer_links:
 *                   oneOf:
 *                     - type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           label: { type: string }
 *                           href: { type: string }
 *                           highlight: { type: boolean }
 *                     - type: "null"
 *                 footer:
 *                   type: object
 *                   description: "Compat legado (estrutura aninhada)"
 *       500:
 *         description: Erro interno ao buscar configurações
 */
router.get("/", async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT * FROM shop_settings ORDER BY id ASC LIMIT 1");
    const row = rows?.[0] || null;

    res.json(normalizePublicSettings(row));
  } catch (err) {
    console.error("Erro ao buscar /api/config:", err);
    next(err);
  }
});

module.exports = router;
