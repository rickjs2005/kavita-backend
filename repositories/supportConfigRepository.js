"use strict";
// repositories/supportConfigRepository.js
//
// Singleton config para central de atendimento.
// Mesma abordagem de shop_settings: 1 row, upsert on first read.

const pool = require("../config/pool");

async function ensureConfig() {
  const [rows] = await pool.query("SELECT id FROM support_config LIMIT 1");
  if (rows.length) return rows[0].id;

  const [result] = await pool.query("INSERT INTO support_config () VALUES ()");
  return result.insertId;
}

async function findById(id) {
  const [rows] = await pool.query("SELECT * FROM support_config WHERE id = ?", [id]);
  return rows[0] || null;
}

async function updateById(id, data) {
  if (!Object.keys(data).length) return;
  await pool.query("UPDATE support_config SET ? WHERE id = ?", [data, id]);
}

/**
 * Subset publico — exclui campos internos e retorna tudo que o frontend precisa.
 */
async function findPublicConfig() {
  const [rows] = await pool.query(
    `SELECT
       hero_badge, hero_title, hero_highlight, hero_description,
       hero_cta_primary, hero_cta_secondary, hero_sla, hero_schedule, hero_status,
       whatsapp_button_label, show_whatsapp_widget, show_chatbot,
       show_faq, show_form, show_trust,
       form_title, form_subtitle, form_success_title, form_success_message,
       faq_title, faq_subtitle, faq_topics,
       trust_title, trust_subtitle, trust_items
     FROM support_config LIMIT 1`
  );
  return rows[0] || null;
}

module.exports = { ensureConfig, findById, updateById, findPublicConfig };
