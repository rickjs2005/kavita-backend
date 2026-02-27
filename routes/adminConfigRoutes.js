// routes/adminConfigRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * Garante que exista pelo menos 1 registro de configuração
 * (a loja usa um registro único em shop_settings)
 */
async function ensureDefaultSettings() {
  const [rows] = await db.query("SELECT id FROM shop_settings LIMIT 1");

  if (!rows || rows.length === 0) {
    const [result] = await db.query(
      `
      INSERT INTO shop_settings (
        store_name,
        store_slug,
        cnpj,
        main_email,
        main_whatsapp,
        logo_url,

        -- Endereço (Sede)
        address_city,
        address_state,
        address_street,
        address_neighborhood,
        address_zip,

        footer_tagline,
        contact_whatsapp,
        contact_email,
        social_instagram_url,
        social_whatsapp_url,
        footer_partner_cta_enabled,
        footer_partner_cta_title,
        footer_partner_cta_text,
        footer_partner_cta_href,
        footer_links,

        checkout_require_cpf,
        checkout_require_address,
        checkout_allow_pickup,
        checkout_enable_coupons,
        checkout_enable_abandoned_cart,

        payment_pix_enabled,
        payment_card_enabled,
        payment_boleto_enabled,

        mp_public_key,
        mp_access_token,
        mp_auto_return,
        mp_sandbox_mode,

        shipping_flat_enabled,
        shipping_flat_value,
        shipping_free_over,
        shipping_region_text,
        shipping_deadline_text,

        comm_email_enabled,
        comm_whatsapp_enabled,

        seo_title,
        seo_description,
        google_analytics_id,
        facebook_pixel_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        NULL, NULL, NULL, NULL, NULL,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        1, 1, 0, 1, 1,
        1, 1, 0,
        NULL, NULL, 'approved', 1,
        0, 0.00, 0.00, NULL, NULL,
        1, 1,
        NULL, NULL, NULL, NULL
      )
    `,
      [
        "Kavita",
        "kavita-agro",
        null,
        null,
        null,
        null,

        null, // footer_tagline
        null, // contact_whatsapp
        null, // contact_email
        null, // social_instagram_url
        null, // social_whatsapp_url
        1, // footer_partner_cta_enabled
        null, // footer_partner_cta_title
        null, // footer_partner_cta_text
        null, // footer_partner_cta_href
        null, // footer_links (JSON)
      ]
    );

    return result.insertId;
  }

  return rows[0].id;
}

/**
 * Helpers
 */
function safeTrim(v) {
  return typeof v === "string" ? v.trim() : v;
}

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;

  // mysql2 pode retornar string ou objeto, dependendo da config
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

/**
 * Normaliza valores vindos do banco (0/1 -> boolean, DECIMAL -> number etc)
 */
function normalizeSettings(row) {
  if (!row) return null;

  const toBool = (v) => !!Number(v);
  const toNum = (v) => (v === null || v === undefined ? 0 : Number(v));

  const footerLinks = safeJsonParse(row.footer_links, null);

  return {
    id: row.id,

    // Identidade
    store_name: row.store_name || "",
    store_slug: row.store_slug || "",
    cnpj: row.cnpj || "",
    main_email: row.main_email || "",
    main_whatsapp: row.main_whatsapp || "",
    logo_url: row.logo_url || "",

    // Endereço (Sede)
    address_city: row.address_city || "",
    address_state: row.address_state || "",
    address_street: row.address_street || "",
    address_neighborhood: row.address_neighborhood || "",
    address_zip: row.address_zip || "",

    // Footer config
    footer_tagline: row.footer_tagline || "",
    contact_whatsapp: row.contact_whatsapp || "",
    contact_email: row.contact_email || "",
    social_instagram_url: row.social_instagram_url || "",
    social_whatsapp_url: row.social_whatsapp_url || "",
    footer_partner_cta_enabled: toBool(row.footer_partner_cta_enabled),
    footer_partner_cta_title: row.footer_partner_cta_title || "",
    footer_partner_cta_text: row.footer_partner_cta_text || "",
    footer_partner_cta_href: row.footer_partner_cta_href || "",
    footer_links: footerLinks, // array esperado no frontend

    // Checkout
    checkout_require_cpf: toBool(row.checkout_require_cpf),
    checkout_require_address: toBool(row.checkout_require_address),
    checkout_allow_pickup: toBool(row.checkout_allow_pickup),
    checkout_enable_coupons: toBool(row.checkout_enable_coupons),
    checkout_enable_abandoned_cart: toBool(row.checkout_enable_abandoned_cart),

    // Pagamento (admin-only)
    payment_pix_enabled: toBool(row.payment_pix_enabled),
    payment_card_enabled: toBool(row.payment_card_enabled),
    payment_boleto_enabled: toBool(row.payment_boleto_enabled),

    mp_public_key: row.mp_public_key || "",
    mp_access_token: row.mp_access_token || "",
    mp_auto_return: row.mp_auto_return || "approved",
    mp_sandbox_mode: toBool(row.mp_sandbox_mode),

    // Frete
    shipping_flat_enabled: toBool(row.shipping_flat_enabled),
    shipping_flat_value: toNum(row.shipping_flat_value),
    shipping_free_over: toNum(row.shipping_free_over),
    shipping_region_text: row.shipping_region_text || "",
    shipping_deadline_text: row.shipping_deadline_text || "",

    // Comunicação
    comm_email_enabled: toBool(row.comm_email_enabled),
    comm_whatsapp_enabled: toBool(row.comm_whatsapp_enabled),

    // SEO/Analytics
    seo_title: row.seo_title || "",
    seo_description: row.seo_description || "",
    google_analytics_id: row.google_analytics_id || "",
    facebook_pixel_id: row.facebook_pixel_id || "",
  };
}

/**
 * Validação simples de footer_links (array de {label, href})
 */
function normalizeFooterLinks(input, currentValue) {
  if (input === undefined) return currentValue;

  // permite null para “limpar”
  if (input === null) return null;

  // se vier como string JSON, tenta parse
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

/* ====================================================================== */
/*                            ROTAS PRINCIPAIS                            */
/* ====================================================================== */

/**
 * @openapi
 * /api/admin/config:
 *   get:
 *     tags: [Admin, Configurações]
 *     summary: Retorna as configurações da loja (registro único)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Configurações retornadas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 store_name: { type: string }
 *                 store_slug: { type: string }
 *                 cnpj: { type: string }
 *                 main_email: { type: string }
 *                 main_whatsapp: { type: string }
 *                 logo_url: { type: string }
 *
 *                 address_city: { type: string }
 *                 address_state: { type: string, description: "UF (2 caracteres)" }
 *                 address_street: { type: string }
 *                 address_neighborhood: { type: string }
 *                 address_zip: { type: string, description: "CEP (com ou sem hífen)" }
 *
 *                 footer_tagline: { type: string }
 *                 contact_whatsapp: { type: string }
 *                 contact_email: { type: string }
 *                 social_instagram_url: { type: string }
 *                 social_whatsapp_url: { type: string }
 *                 footer_partner_cta_enabled: { type: boolean }
 *                 footer_partner_cta_title: { type: string }
 *                 footer_partner_cta_text: { type: string }
 *                 footer_partner_cta_href: { type: string }
 *                 footer_links:
 *                   type: array
 *                   nullable: true
 *                   items:
 *                     type: object
 *                     properties:
 *                       label: { type: string }
 *                       href: { type: string }
 *                       highlight: { type: boolean }
 *
 *                 checkout_require_cpf: { type: boolean }
 *                 checkout_require_address: { type: boolean }
 *                 checkout_allow_pickup: { type: boolean }
 *                 checkout_enable_coupons: { type: boolean }
 *                 checkout_enable_abandoned_cart: { type: boolean }
 *
 *                 payment_pix_enabled: { type: boolean }
 *                 payment_card_enabled: { type: boolean }
 *                 payment_boleto_enabled: { type: boolean }
 *                 mp_public_key: { type: string }
 *                 mp_access_token: { type: string }
 *                 mp_auto_return: { type: string }
 *                 mp_sandbox_mode: { type: boolean }
 *
 *                 shipping_flat_enabled: { type: boolean }
 *                 shipping_flat_value: { type: number, format: float }
 *                 shipping_free_over: { type: number, format: float }
 *                 shipping_region_text: { type: string }
 *                 shipping_deadline_text: { type: string }
 *
 *                 comm_email_enabled: { type: boolean }
 *                 comm_whatsapp_enabled: { type: boolean }
 *
 *                 seo_title: { type: string }
 *                 seo_description: { type: string }
 *                 google_analytics_id: { type: string }
 *                 facebook_pixel_id: { type: string }
 *       401:
 *         description: Token de admin ausente ou inválido
 *       500:
 *         description: Erro interno ao buscar as configurações
 */
router.get("/", verifyAdmin, async (req, res, next) => {
  try {
    const id = await ensureDefaultSettings();

    const [rows] = await db.query("SELECT * FROM shop_settings WHERE id = ? LIMIT 1", [id]);

    const row = rows[0] || null;
    res.json(normalizeSettings(row));
  } catch (err) {
    console.error("Erro ao buscar configurações:", err);
    next(err);
  }
});

/**
 * @openapi
 * /api/admin/config:
 *   put:
 *     tags: [Admin, Configurações]
 *     summary: Atualiza as configurações principais da loja
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               store_name: { type: string }
 *               store_slug: { type: string }
 *               cnpj: { type: string }
 *               main_email: { type: string }
 *               main_whatsapp: { type: string }
 *               logo_url: { type: string }
 *
 *               address_city: { type: string }
 *               address_state: { type: string, description: "UF (2 caracteres)" }
 *               address_street: { type: string }
 *               address_neighborhood: { type: string }
 *               address_zip: { type: string }
 *
 *               footer_tagline: { type: string }
 *               contact_whatsapp: { type: string }
 *               contact_email: { type: string }
 *               social_instagram_url: { type: string }
 *               social_whatsapp_url: { type: string }
 *               footer_partner_cta_enabled: { type: boolean }
 *               footer_partner_cta_title: { type: string }
 *               footer_partner_cta_text: { type: string }
 *               footer_partner_cta_href: { type: string }
 *               footer_links:
 *                 type: array
 *                 nullable: true
 *                 items:
 *                   type: object
 *                   properties:
 *                     label: { type: string }
 *                     href: { type: string }
 *                     highlight: { type: boolean }
 *
 *               checkout_require_cpf: { type: boolean }
 *               checkout_require_address: { type: boolean }
 *               checkout_allow_pickup: { type: boolean }
 *               checkout_enable_coupons: { type: boolean }
 *               checkout_enable_abandoned_cart: { type: boolean }
 *
 *               payment_pix_enabled: { type: boolean }
 *               payment_card_enabled: { type: boolean }
 *               payment_boleto_enabled: { type: boolean }
 *               mp_public_key: { type: string }
 *               mp_access_token: { type: string }
 *               mp_auto_return: { type: string }
 *               mp_sandbox_mode: { type: boolean }
 *
 *               shipping_flat_enabled: { type: boolean }
 *               shipping_flat_value: { type: number }
 *               shipping_free_over: { type: number }
 *               shipping_region_text: { type: string }
 *               shipping_deadline_text: { type: string }
 *
 *               comm_email_enabled: { type: boolean }
 *               comm_whatsapp_enabled: { type: boolean }
 *
 *               seo_title: { type: string }
 *               seo_description: { type: string }
 *               google_analytics_id: { type: string }
 *               facebook_pixel_id: { type: string }
 *     responses:
 *       200:
 *         description: Configurações atualizadas com sucesso
 *       400:
 *         description: Dados inválidos enviados no corpo
 *       401:
 *         description: Token de admin ausente ou inválido
 *       500:
 *         description: Erro interno ao atualizar as configurações
 */
router.put("/", verifyAdmin, async (req, res, next) => {
  try {
    const id = await ensureDefaultSettings();

    const [rows] = await db.query("SELECT * FROM shop_settings WHERE id = ? LIMIT 1", [id]);
    const current = rows[0] || {};

    const {
      store_name,
      store_slug,
      cnpj,
      main_email,
      main_whatsapp,
      logo_url,

      // Endereço (Sede)
      address_city,
      address_state,
      address_street,
      address_neighborhood,
      address_zip,

      // Footer
      footer_tagline,
      contact_whatsapp,
      contact_email,
      social_instagram_url,
      social_whatsapp_url,
      footer_partner_cta_enabled,
      footer_partner_cta_title,
      footer_partner_cta_text,
      footer_partner_cta_href,
      footer_links,

      checkout_require_cpf,
      checkout_require_address,
      checkout_allow_pickup,
      checkout_enable_coupons,
      checkout_enable_abandoned_cart,

      payment_pix_enabled,
      payment_card_enabled,
      payment_boleto_enabled,

      mp_public_key,
      mp_access_token,
      mp_auto_return,
      mp_sandbox_mode,

      shipping_flat_enabled,
      shipping_flat_value,
      shipping_free_over,
      shipping_region_text,
      shipping_deadline_text,

      comm_email_enabled,
      comm_whatsapp_enabled,

      seo_title,
      seo_description,
      google_analytics_id,
      facebook_pixel_id,
    } = req.body;

    const boolOrCurrent = (val, curr) => (typeof val === "boolean" ? (val ? 1 : 0) : curr);
    const numOrCurrent = (val, curr) => (typeof val === "number" ? val : curr);

    const normalizedFooterLinks = normalizeFooterLinks(footer_links, current.footer_links);

    const updateData = {
      store_name: store_name ?? current.store_name,
      store_slug: store_slug ?? current.store_slug,
      cnpj: cnpj ?? current.cnpj,
      main_email: main_email ?? current.main_email,
      main_whatsapp: main_whatsapp ?? current.main_whatsapp,
      logo_url: logo_url ?? current.logo_url,

      // Endereço (Sede)
      address_city: address_city ?? current.address_city,
      address_state: address_state ?? current.address_state,
      address_street: address_street ?? current.address_street,
      address_neighborhood: address_neighborhood ?? current.address_neighborhood,
      address_zip: address_zip ?? current.address_zip,

      // Footer
      footer_tagline: footer_tagline ?? current.footer_tagline,
      contact_whatsapp: contact_whatsapp ?? current.contact_whatsapp,
      contact_email: contact_email ?? current.contact_email,
      social_instagram_url: social_instagram_url ?? current.social_instagram_url,
      social_whatsapp_url: social_whatsapp_url ?? current.social_whatsapp_url,
      footer_partner_cta_enabled: boolOrCurrent(
        footer_partner_cta_enabled,
        current.footer_partner_cta_enabled
      ),
      footer_partner_cta_title: footer_partner_cta_title ?? current.footer_partner_cta_title,
      footer_partner_cta_text: footer_partner_cta_text ?? current.footer_partner_cta_text,
      footer_partner_cta_href: footer_partner_cta_href ?? current.footer_partner_cta_href,
      footer_links:
        normalizedFooterLinks === undefined
          ? current.footer_links
          : normalizedFooterLinks === null
            ? null
            : JSON.stringify(normalizedFooterLinks),

      // Checkout
      checkout_require_cpf: boolOrCurrent(checkout_require_cpf, current.checkout_require_cpf),
      checkout_require_address: boolOrCurrent(
        checkout_require_address,
        current.checkout_require_address
      ),
      checkout_allow_pickup: boolOrCurrent(checkout_allow_pickup, current.checkout_allow_pickup),
      checkout_enable_coupons: boolOrCurrent(
        checkout_enable_coupons,
        current.checkout_enable_coupons
      ),
      checkout_enable_abandoned_cart: boolOrCurrent(
        checkout_enable_abandoned_cart,
        current.checkout_enable_abandoned_cart
      ),

      // Pagamento (admin-only)
      payment_pix_enabled: boolOrCurrent(payment_pix_enabled, current.payment_pix_enabled),
      payment_card_enabled: boolOrCurrent(payment_card_enabled, current.payment_card_enabled),
      payment_boleto_enabled: boolOrCurrent(payment_boleto_enabled, current.payment_boleto_enabled),

      mp_public_key: mp_public_key ?? current.mp_public_key,
      mp_access_token: mp_access_token ?? current.mp_access_token,
      mp_auto_return: mp_auto_return ?? current.mp_auto_return,
      mp_sandbox_mode: boolOrCurrent(mp_sandbox_mode, current.mp_sandbox_mode),

      // Frete
      shipping_flat_enabled: boolOrCurrent(shipping_flat_enabled, current.shipping_flat_enabled),
      shipping_flat_value: numOrCurrent(shipping_flat_value, current.shipping_flat_value),
      shipping_free_over: numOrCurrent(shipping_free_over, current.shipping_free_over),
      shipping_region_text: shipping_region_text ?? current.shipping_region_text,
      shipping_deadline_text: shipping_deadline_text ?? current.shipping_deadline_text,

      // Comunicação
      comm_email_enabled: boolOrCurrent(comm_email_enabled, current.comm_email_enabled),
      comm_whatsapp_enabled: boolOrCurrent(comm_whatsapp_enabled, current.comm_whatsapp_enabled),

      // SEO/Analytics
      seo_title: seo_title ?? current.seo_title,
      seo_description: seo_description ?? current.seo_description,
      google_analytics_id: google_analytics_id ?? current.google_analytics_id,
      facebook_pixel_id: facebook_pixel_id ?? current.facebook_pixel_id,
    };

    await db.query("UPDATE shop_settings SET ? WHERE id = ?", [updateData, id]);

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao atualizar configurações:", err);
    next(err);
  }
});

/* ====================================================================== */
/*                    CONFIGURAÇÃO DE CATEGORIAS (JÁ EXISTE)              */
/* ====================================================================== */

router.get("/categories", verifyAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      "SELECT id, nome, slug, ativo FROM categories ORDER BY nome ASC"
    );

    const lista = rows.map((c) => ({
      id: c.id,
      nome: c.nome,
      slug: c.slug,
      ativo: !!c.ativo,
    }));

    res.json(lista);
  } catch (err) {
    console.error("Erro ao listar categorias de config:", err);
    next(err);
  }
});

router.post("/categories", verifyAdmin, async (req, res, next) => {
  try {
    const { nome, slug, ativo } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({ message: "Nome da categoria é obrigatório." });
    }

    const [result] = await db.query(
      "INSERT INTO categories (nome, slug, ativo) VALUES (?, ?, ?)",
      [nome.trim(), slug || null, ativo ? 1 : 0]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("Erro ao criar categoria de config:", err);
    next(err);
  }
});

router.put("/categories/:id", verifyAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nome, slug, ativo } = req.body;

    const [result] = await db.query(
      "UPDATE categories SET nome = ?, slug = ?, ativo = ? WHERE id = ?",
      [nome || null, slug || null, ativo ? 1 : 0, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Categoria não encontrada." });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao atualizar categoria de config:", err);
    next(err);
  }
});

module.exports = router;
