"use strict";

const pool = require("../../config/pool");
const { clampInt, safeParseJson, sanitizeText } = require("./helpers");
const { getPageSettings, upsertPageSettings } = require("./pageService");

function jsonToDb(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

// =====================
// Models JSON (Specs/Features/Benefits por modelo)
// =====================

function normalizeModelInfoObject(obj) {
  const safe = obj && typeof obj === "object" ? obj : {};
  const out = {};

  out.specs_title = sanitizeText(safe.specs_title, 120);
  out.features_title = sanitizeText(safe.features_title, 120);
  out.benefits_title = sanitizeText(safe.benefits_title, 120);

  const specs = safeParseJson(safe.specs_items, safe.specs_items);
  const feats = safeParseJson(safe.features_items, safe.features_items);
  const bens = safeParseJson(safe.benefits_items, safe.benefits_items);

  out.specs_items = Array.isArray(specs) ? specs : [];
  out.features_items = Array.isArray(feats) ? feats : [];
  out.benefits_items = Array.isArray(bens) ? bens : [];

  return out;
}

async function getModelsJsonFromPage() {
  const page = await getPageSettings();
  if (!page) return {};
  return safeParseJson(page.models_json, {}) || {};
}

async function getModelInfo(modelKey) {
  const modelsJson = await getModelsJsonFromPage();
  const raw = modelsJson?.[modelKey] || null;

  const page = await getPageSettings();

  if (!raw) {
    return normalizeModelInfoObject({
      specs_title: page?.specs_title || null,
      specs_items: safeParseJson(page?.specs_items_json, []),
      features_title: page?.features_title || null,
      features_items: safeParseJson(page?.features_items_json, []),
      benefits_title: page?.benefits_title || null,
      benefits_items: safeParseJson(page?.benefits_items_json, []),
    });
  }

  return normalizeModelInfoObject(raw);
}

async function upsertModelInfo(modelKey, payload = {}) {
  const page = await getPageSettings();
  if (!page) {
    await upsertPageSettings({ hero_title: "Kavita Drones" });
  }

  const modelsJson = await getModelsJsonFromPage();
  const current = normalizeModelInfoObject(modelsJson?.[modelKey] || {});

  const next = {
    specs_title: Object.prototype.hasOwnProperty.call(payload, "specs_title")
      ? sanitizeText(payload.specs_title, 120)
      : current.specs_title,
    features_title: Object.prototype.hasOwnProperty.call(payload, "features_title")
      ? sanitizeText(payload.features_title, 120)
      : current.features_title,
    benefits_title: Object.prototype.hasOwnProperty.call(payload, "benefits_title")
      ? sanitizeText(payload.benefits_title, 120)
      : current.benefits_title,
    specs_items: Object.prototype.hasOwnProperty.call(payload, "specs_items")
      ? Array.isArray(payload.specs_items)
        ? payload.specs_items
        : safeParseJson(payload.specs_items, [])
      : current.specs_items,
    features_items: Object.prototype.hasOwnProperty.call(payload, "features_items")
      ? Array.isArray(payload.features_items)
        ? payload.features_items
        : safeParseJson(payload.features_items, [])
      : current.features_items,
    benefits_items: Object.prototype.hasOwnProperty.call(payload, "benefits_items")
      ? Array.isArray(payload.benefits_items)
        ? payload.benefits_items
        : safeParseJson(payload.benefits_items, [])
      : current.benefits_items,
  };

  const merged = { ...modelsJson, [modelKey]: next };

  const currentPage = await getPageSettings();
  const [result] = await pool.query(
    "UPDATE drone_page_settings SET models_json=? WHERE id=?",
    [jsonToDb(merged), currentPage.id]
  );

  return result.affectedRows || 0;
}

// =====================
// Seleção de mídia por modelo (HERO/CARD)
// =====================

async function hasSelectionsTable() {
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'drone_model_media_selections'`
    );
    return Number(rows?.[0]?.total || 0) > 0;
  } catch {
    return false;
  }
}

function normalizeTarget(target) {
  const t = String(target || "").trim().toUpperCase();
  return t === "HERO" || t === "CARD" ? t : null;
}

async function getModelSelections(modelKey) {
  const k = sanitizeText(modelKey, 20);
  if (!k) return { HERO: null, CARD: null };

  if (!(await hasSelectionsTable())) return { HERO: null, CARD: null };

  const [rows] = await pool.query(
    "SELECT target, media_id FROM drone_model_media_selections WHERE model_key = ?",
    [k]
  );

  const out = { HERO: null, CARD: null };
  for (const r of rows) {
    const t = normalizeTarget(r.target);
    if (!t) continue;
    out[t] = r.media_id == null ? null : Number(r.media_id);
  }
  return out;
}

async function upsertModelSelection(modelKey, target, mediaId) {
  const k = sanitizeText(modelKey, 20);
  const t = normalizeTarget(target);
  const id = mediaId == null ? null : clampInt(mediaId, null, 1, 999999999);

  if (!k) {
    const err = new Error("modelKey inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  if (!t) {
    const err = new Error("target inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  if (mediaId != null && !id) {
    const err = new Error("media_id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  if (!(await hasSelectionsTable())) {
    const err = new Error("Tabela drone_model_media_selections não existe. Rode a migration.");
    err.code = "MIGRATION_REQUIRED";
    throw err;
  }

  const [result] = await pool.query(
    `INSERT INTO drone_model_media_selections (model_key, target, media_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE media_id = VALUES(media_id)`,
    [k, t, id]
  );

  return result.affectedRows || 0;
}

async function setDroneModelSelection(modelKey, target, mediaId) {
  return upsertModelSelection(modelKey, target, mediaId);
}

async function getSelectionsMapForModels(modelKeys = []) {
  if (!(await hasSelectionsTable())) return {};

  const keys = Array.isArray(modelKeys)
    ? modelKeys.map((x) => sanitizeText(x, 20)).filter(Boolean)
    : [];

  if (!keys.length) return {};

  const [rows] = await pool.query(
    "SELECT model_key, target, media_id FROM drone_model_media_selections WHERE model_key IN (?)",
    [keys]
  );

  return rows.reduce((acc, r) => {
    const mk = String(r.model_key || "").trim();
    const t = normalizeTarget(r.target);
    if (!mk || !t) return acc;
    if (!acc[mk]) acc[mk] = { HERO: null, CARD: null };
    acc[mk][t] = r.media_id == null ? null : Number(r.media_id);
    return acc;
  }, {});
}

// =====================
// Drone Models CRUD
// =====================

async function listDroneModels({ includeInactive } = {}) {
  const inc = Number(includeInactive) ? 1 : 0;
  let where = "WHERE 1=1";
  const params = [];
  if (!inc) where += " AND is_active=1";

  const [rows] = await pool.query(
    `SELECT id, \`key\`, label, is_active, sort_order, created_at, updated_at
     FROM drone_models ${where} ORDER BY sort_order ASC, id ASC`,
    params
  );

  return rows;
}

async function getDroneModelByKey(modelKey) {
  const k = sanitizeText(modelKey, 20);
  if (!k) return null;

  const [rows] = await pool.query(
    `SELECT id, \`key\`, label, is_active, sort_order, created_at, updated_at
     FROM drone_models WHERE \`key\` = ? LIMIT 1`,
    [k]
  );

  return rows[0] || null;
}

async function createDroneModel({ key, label, is_active, sort_order } = {}) {
  const k = sanitizeText(key, 20);
  const l = sanitizeText(label, 120);

  if (!k || !l) {
    const err = new Error("key e label são obrigatórios");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const active = is_active == null ? 1 : Number(is_active) ? 1 : 0;
  const sort = clampInt(sort_order, 0, 0, 999999);

  const [result] = await pool.query(
    "INSERT INTO drone_models (`key`, label, is_active, sort_order) VALUES (?, ?, ?, ?)",
    [k, l, active, sort]
  );

  return result.insertId;
}

async function updateDroneModel(id, payload = {}) {
  const modelId = clampInt(id, null, 1, 999999999);
  if (!modelId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const sets = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(payload, "key")) {
    sets.push("`key`=?");
    params.push(sanitizeText(payload.key, 20));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "label")) {
    sets.push("label=?");
    params.push(sanitizeText(payload.label, 120));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    sets.push("is_active=?");
    params.push(Number(payload.is_active) ? 1 : 0);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "sort_order")) {
    sets.push("sort_order=?");
    params.push(clampInt(payload.sort_order, 0, 0, 999999));
  }

  if (!sets.length) return 0;

  params.push(modelId);

  const [result] = await pool.query(
    `UPDATE drone_models SET ${sets.join(", ")} WHERE id=?`,
    params
  );

  return result.affectedRows || 0;
}

async function deleteDroneModel(id) {
  const modelId = clampInt(id, null, 1, 999999999);
  if (!modelId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const [result] = await pool.query("DELETE FROM drone_models WHERE id=?", [modelId]);
  return result.affectedRows || 0;
}

module.exports = {
  normalizeModelInfoObject,
  getModelsJsonFromPage,
  getModelInfo,
  upsertModelInfo,
  hasSelectionsTable,
  setDroneModelSelection,
  normalizeTarget,
  getModelSelections,
  upsertModelSelection,
  getSelectionsMapForModels,
  listDroneModels,
  getDroneModelByKey,
  createDroneModel,
  updateDroneModel,
  deleteDroneModel,
};
