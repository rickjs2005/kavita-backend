"use strict";
// repositories/configRepository.js
// Acesso a dados para shop_settings e categories (painel admin).

const DEFAULT_VALUES = [
  "Kavita",       // store_name
  "kavita-agro",  // store_slug
  null,           // cnpj
  null,           // main_email
  null,           // main_whatsapp
  null,           // logo_url
  null,           // footer_tagline
  null,           // contact_whatsapp
  null,           // contact_email
  null,           // social_instagram_url
  null,           // social_whatsapp_url
  1,              // footer_partner_cta_enabled
  null,           // footer_partner_cta_title
  null,           // footer_partner_cta_text
  null,           // footer_partner_cta_href
  null,           // footer_links
];

async function ensureSettings(pool) {
  const [rows] = await pool.query("SELECT id FROM shop_settings LIMIT 1");
  if (rows && rows.length > 0) return rows[0].id;

  const [result] = await pool.query(
    `
    INSERT INTO shop_settings (
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
      seo_title, seo_description, google_analytics_id, facebook_pixel_id
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
    DEFAULT_VALUES
  );
  return result.insertId;
}

async function findSettingsById(pool, id) {
  const [rows] = await pool.query("SELECT * FROM shop_settings WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

async function updateSettingsById(pool, id, data) {
  await pool.query("UPDATE shop_settings SET ? WHERE id = ?", [data, id]);
}

async function findAllCategories(pool) {
  const [rows] = await pool.query(
    "SELECT id, nome, slug, ativo FROM categories ORDER BY nome ASC"
  );
  return rows;
}

async function insertCategory(pool, nome, slug, ativo) {
  const [result] = await pool.query(
    "INSERT INTO categories (nome, slug, ativo) VALUES (?, ?, ?)",
    [nome.trim(), slug || null, ativo ? 1 : 0]
  );
  return result.insertId;
}

async function updateCategoryById(pool, id, nome, slug, ativo) {
  const [result] = await pool.query(
    "UPDATE categories SET nome = ?, slug = ?, ativo = ? WHERE id = ?",
    [nome || null, slug || null, ativo ? 1 : 0, id]
  );
  return result.affectedRows;
}

module.exports = {
  ensureSettings,
  findSettingsById,
  updateSettingsById,
  findAllCategories,
  insertCategory,
  updateCategoryById,
};
