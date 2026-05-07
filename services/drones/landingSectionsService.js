"use strict";

const dronesRepo = require("../../repositories/dronesRepository");
const { sanitizeText, safeParseJson } = require("./helpers");

const SECTION_KEY_RE = /^[a-z0-9_]{2,40}$/;

function parseItems(raw) {
  return safeParseJson(raw, []);
}

function shapePublic(row) {
  return {
    section_key: row.section_key,
    title: row.title,
    subtitle: row.subtitle,
    items: parseItems(row.items_json),
  };
}

async function listSectionsPublic() {
  const rows = await dronesRepo.listLandingSections({ activeOnly: true });
  return rows.map(shapePublic);
}

async function getSectionPublic(key) {
  if (!key || !SECTION_KEY_RE.test(String(key))) return null;
  const row = await dronesRepo.findLandingSectionByKey(String(key));
  if (!row || !row.is_active) return null;
  return shapePublic(row);
}

async function listSectionsAdmin() {
  const rows = await dronesRepo.listLandingSections({ activeOnly: false });
  return rows.map((r) => ({
    id: r.id,
    section_key: r.section_key,
    title: r.title,
    subtitle: r.subtitle,
    items: parseItems(r.items_json),
    sort_order: r.sort_order,
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

async function getSectionAdmin(key) {
  if (!key || !SECTION_KEY_RE.test(String(key))) {
    const err = new Error("section_key inválida");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const row = await dronesRepo.findLandingSectionByKey(String(key));
  if (!row) return null;
  return {
    id: row.id,
    section_key: row.section_key,
    title: row.title,
    subtitle: row.subtitle,
    items: parseItems(row.items_json),
    sort_order: row.sort_order,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Upsert pela key. Body já validado pelo Zod no controller — aqui só
 * delega ao repository.
 */
async function upsertSection(payload = {}) {
  const key = String(payload.section_key || "").trim().toLowerCase();
  if (!SECTION_KEY_RE.test(key)) {
    const err = new Error("section_key inválida");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  return dronesRepo.upsertLandingSection({
    section_key: key,
    title: sanitizeText(payload.title, 160),
    subtitle: sanitizeText(payload.subtitle, 500),
    items_json: Array.isArray(payload.items) ? payload.items : [],
    sort_order: Number(payload.sort_order) || 0,
    is_active: payload.is_active == null ? 1 : Number(payload.is_active) ? 1 : 0,
  });
}

async function deleteSection(key) {
  if (!key || !SECTION_KEY_RE.test(String(key))) {
    const err = new Error("section_key inválida");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return dronesRepo.deleteLandingSection(String(key));
}

module.exports = {
  listSectionsPublic,
  getSectionPublic,
  listSectionsAdmin,
  getSectionAdmin,
  upsertSection,
  deleteSection,
  SECTION_KEY_RE,
};
