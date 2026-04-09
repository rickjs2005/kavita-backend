"use strict";
// services/supportConfigService.js
//
// Logica de negocio para a configuracao da central de atendimento.
// Singleton: garante que 1 row exista antes de ler/atualizar.

const repo = require("../repositories/supportConfigRepository");

function normalizeBool(v) {
  if (typeof v === "boolean") return v;
  return v === 1 || v === "1" || v === true;
}

function parseJson(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v ?? null;
}

function normalize(row) {
  if (!row) return null;
  return {
    ...row,
    show_whatsapp_widget: normalizeBool(row.show_whatsapp_widget),
    show_chatbot: normalizeBool(row.show_chatbot),
    show_faq: normalizeBool(row.show_faq),
    show_form: normalizeBool(row.show_form),
    show_trust: normalizeBool(row.show_trust),
    faq_topics: parseJson(row.faq_topics),
    trust_items: parseJson(row.trust_items),
  };
}

async function getConfig() {
  const id = await repo.ensureConfig();
  const row = await repo.findById(id);
  return normalize(row);
}

async function updateConfig(body) {
  const id = await repo.ensureConfig();
  const current = await repo.findById(id);

  const updateData = {};

  // String fields — null-coalescing merge
  const strFields = [
    "hero_badge", "hero_title", "hero_highlight", "hero_description",
    "hero_cta_primary", "hero_cta_secondary", "hero_sla", "hero_schedule", "hero_status",
    "whatsapp_button_label",
    "form_title", "form_subtitle", "form_success_title", "form_success_message",
    "faq_title", "faq_subtitle",
    "trust_title", "trust_subtitle",
  ];
  for (const f of strFields) {
    if (body[f] !== undefined) {
      updateData[f] = body[f] ?? current[f];
    }
  }

  // Boolean fields
  const boolFields = [
    "show_whatsapp_widget", "show_chatbot",
    "show_faq", "show_form", "show_trust",
  ];
  for (const f of boolFields) {
    if (body[f] !== undefined) {
      updateData[f] = body[f] ? 1 : 0;
    }
  }

  // JSON fields
  if (body.faq_topics !== undefined) {
    updateData.faq_topics = body.faq_topics ? JSON.stringify(body.faq_topics) : null;
  }
  if (body.trust_items !== undefined) {
    updateData.trust_items = body.trust_items ? JSON.stringify(body.trust_items) : null;
  }

  await repo.updateById(id, updateData);
  return normalize(await repo.findById(id));
}

async function getPublicConfig() {
  // Garante que a row existe
  await repo.ensureConfig();
  const row = await repo.findPublicConfig();
  return normalize(row);
}

module.exports = { getConfig, updateConfig, getPublicConfig };
