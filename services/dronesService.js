"use strict";

const pool = require("../config/pool");

/**
 * Observações importantes (alinhado com seu BD):
 *
 * Tabelas:
 * - drone_page_settings (JSON em *_items_json, models_json)
 * - drone_models (key, label, is_active, sort_order)
 * - drone_gallery_items (caption em vez de title)
 * - drone_comments (status='PENDENTE'|'APROVADO'|'REPROVADO' — não existe is_approved)
 * - drone_comment_media (FK comment_id -> drone_comments.id)
 * - drone_representatives (não tem model_key)
 */

// =====================
// Helpers
// =====================
function clampInt(val, def, min, max) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return def;
  if (typeof min === "number" && n < min) return min;
  if (typeof max === "number" && n > max) return max;
  return n;
}

function safeParseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === "object") return v; // mysql2 pode retornar JSON já parseado
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  if (!t) return fallback;
  try {
    return JSON.parse(t);
  } catch {
    return fallback;
  }
}

function sanitizeText(v, maxLen) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (maxLen && s.length > maxLen) return s.slice(0, maxLen);
  return s;
}

async function hasColumn(table, col) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, col]
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function getTableRowCount(table) {
  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM ${table}`);
  return Number(rows?.[0]?.total || 0);
}

// =====================
// Page Settings (Landing)
// =====================
async function getPageSettings() {
  const [rows] = await pool.query(
    `SELECT *
     FROM drone_page_settings
     ORDER BY id DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

function jsonToDb(v) {
  // aceita array/obj e serializa; string já vai como string
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

async function upsertPageSettings(payload = {}) {
  const current = (await getPageSettings()) || null;

  const valueOrCurrent = (key, fallback = null) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return payload[key];
    if (current && Object.prototype.hasOwnProperty.call(current, key)) return current[key];
    return fallback;
  };

  const hero_title = sanitizeText(valueOrCurrent("hero_title"), 120) || "Kavita Drones";
  const hero_subtitle = sanitizeText(valueOrCurrent("hero_subtitle"), 255);
  const hero_video_path = sanitizeText(valueOrCurrent("hero_video_path"), 255);
  const hero_image_fallback_path = sanitizeText(valueOrCurrent("hero_image_fallback_path"), 255);

  const cta_title = sanitizeText(valueOrCurrent("cta_title"), 120);
  const cta_message_template = sanitizeText(valueOrCurrent("cta_message_template"), 500);
  const cta_button_label = sanitizeText(valueOrCurrent("cta_button_label"), 60);

  // Mantidos por compat, mesmo que Modelos use models_json
  const specs_title = sanitizeText(valueOrCurrent("specs_title"), 120);
  const specs_items_json = jsonToDb(valueOrCurrent("specs_items_json"));
  const features_title = sanitizeText(valueOrCurrent("features_title"), 120);
  const features_items_json = jsonToDb(valueOrCurrent("features_items_json"));
  const benefits_title = sanitizeText(valueOrCurrent("benefits_title"), 120);
  const benefits_items_json = jsonToDb(valueOrCurrent("benefits_items_json"));
  const sections_order_json = jsonToDb(valueOrCurrent("sections_order_json"));

  // NOVO (por modelo)
  const models_json = jsonToDb(valueOrCurrent("models_json"));

  if (!current) {
    const [result] = await pool.query(
      `INSERT INTO drone_page_settings
       (hero_title, hero_subtitle, hero_video_path, hero_image_fallback_path,
        cta_title, cta_message_template, cta_button_label,
        specs_title, specs_items_json,
        features_title, features_items_json,
        benefits_title, benefits_items_json,
        sections_order_json,
        models_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hero_title,
        hero_subtitle,
        hero_video_path,
        hero_image_fallback_path,
        cta_title,
        cta_message_template,
        cta_button_label,
        specs_title,
        specs_items_json,
        features_title,
        features_items_json,
        benefits_title,
        benefits_items_json,
        sections_order_json,
        models_json,
      ]
    );
    return result.insertId;
  }

  const [result] = await pool.query(
    `UPDATE drone_page_settings
     SET hero_title=?,
         hero_subtitle=?,
         hero_video_path=?,
         hero_image_fallback_path=?,
         cta_title=?,
         cta_message_template=?,
         cta_button_label=?,
         specs_title=?,
         specs_items_json=?,
         features_title=?,
         features_items_json=?,
         benefits_title=?,
         benefits_items_json=?,
         sections_order_json=?,
         models_json=?
     WHERE id=?`,
    [
      hero_title,
      hero_subtitle,
      hero_video_path,
      hero_image_fallback_path,
      cta_title,
      cta_message_template,
      cta_button_label,
      specs_title,
      specs_items_json,
      features_title,
      features_items_json,
      benefits_title,
      benefits_items_json,
      sections_order_json,
      models_json,
      current.id,
    ]
  );

  return result.affectedRows || 0;
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

  // aceitar array ou string json
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

  // fallback para legado (campos globais na page_settings)
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
    // cria uma linha base se não existir
    await upsertPageSettings({ hero_title: "Kavita Drones" });
  }

  const modelsJson = await getModelsJsonFromPage();
  const current = normalizeModelInfoObject(modelsJson?.[modelKey] || {});

  const next = {
    specs_title: Object.prototype.hasOwnProperty.call(payload, "specs_title") ? sanitizeText(payload.specs_title, 120) : current.specs_title,
    features_title: Object.prototype.hasOwnProperty.call(payload, "features_title") ? sanitizeText(payload.features_title, 120) : current.features_title,
    benefits_title: Object.prototype.hasOwnProperty.call(payload, "benefits_title") ? sanitizeText(payload.benefits_title, 120) : current.benefits_title,
    specs_items: Object.prototype.hasOwnProperty.call(payload, "specs_items") ? (Array.isArray(payload.specs_items) ? payload.specs_items : safeParseJson(payload.specs_items, [])) : current.specs_items,
    features_items: Object.prototype.hasOwnProperty.call(payload, "features_items") ? (Array.isArray(payload.features_items) ? payload.features_items : safeParseJson(payload.features_items, [])) : current.features_items,
    benefits_items: Object.prototype.hasOwnProperty.call(payload, "benefits_items") ? (Array.isArray(payload.benefits_items) ? payload.benefits_items : safeParseJson(payload.benefits_items, [])) : current.benefits_items,
  };

  const merged = { ...modelsJson, [modelKey]: next };

  // salva no page_settings.models_json
  const currentPage = await getPageSettings();
  const [result] = await pool.query(
    `UPDATE drone_page_settings
     SET models_json=?
     WHERE id=?`,
    [jsonToDb(merged), currentPage.id]
  );

  return result.affectedRows || 0;
}

// =====================
// Gallery
// =====================
async function resolveGalleryTitleColumn() {
  // Prioriza caption (é o seu schema atual)
  const candidates = ["caption", "title", "legenda", "label"];
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await hasColumn("drone_gallery_items", c)) return c;
  }
  return null;
}

async function listGalleryPublic({ page, limit, model_key } = {}) {
  const p = clampInt(page, 1, 1, 999999);
  const l = clampInt(limit, 12, 1, 50);
  const offset = (p - 1) * l;

  const titleCol = await resolveGalleryTitleColumn();
  const supportsModel = await hasColumn("drone_gallery_items", "model_key");

  let where = "WHERE is_active=1";
  const params = [];

  if (supportsModel && model_key) {
    where += " AND model_key=?";
    params.push(String(model_key));
  }

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM drone_gallery_items
     ${where}`,
    params
  );

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const selectTitle = titleCol ? `, ${titleCol} AS title` : ", NULL AS title";

  const [rows] = await pool.query(
    `SELECT id, model_key, media_type, media_path, sort_order, is_active, created_at, updated_at
     ${selectTitle}
     FROM drone_gallery_items
     ${where}
     ORDER BY sort_order ASC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, l, offset]
  );

  return { items: rows, page: p, limit: l, total, totalPages };
}

async function listGalleryAdmin({ page, limit, model_key } = {}) {
  const p = clampInt(page, 1, 1, 999999);
  const l = clampInt(limit, 20, 1, 100);
  const offset = (p - 1) * l;

  const titleCol = await resolveGalleryTitleColumn();
  const supportsModel = await hasColumn("drone_gallery_items", "model_key");

  let where = "WHERE 1=1";
  const params = [];

  if (supportsModel && model_key) {
    where += " AND model_key=?";
    params.push(String(model_key));
  }

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM drone_gallery_items
     ${where}`,
    params
  );

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const selectTitle = titleCol ? `, ${titleCol} AS title` : ", NULL AS title";

  const [rows] = await pool.query(
    `SELECT id, model_key, media_type, media_path, sort_order, is_active, created_at, updated_at
     ${selectTitle}
     FROM drone_gallery_items
     ${where}
     ORDER BY sort_order ASC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, l, offset]
  );

  return { items: rows, page: p, limit: l, total, totalPages };
}

async function createGalleryItem({ model_key = null, media_type, media_path, title, sort_order, is_active } = {}) {
  const titleCol = await resolveGalleryTitleColumn();
  const supportsModel = await hasColumn("drone_gallery_items", "model_key");

  const mType = String(media_type || "").toUpperCase() === "VIDEO" ? "VIDEO" : "IMAGE";
  const pathSan = sanitizeText(media_path, 255);
  if (!pathSan) {
    const err = new Error("media_path obrigatório");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const titleSan = sanitizeText(title, 160);
  const sort = clampInt(sort_order, 0, 0, 999999);
  const active = is_active == null ? 1 : Number(is_active) ? 1 : 0;

  const cols = [];
  const vals = [];

  if (supportsModel) {
    cols.push("model_key");
    vals.push(model_key ? String(model_key) : null);
  }

  cols.push("media_type");
  vals.push(mType);

  cols.push("media_path");
  vals.push(pathSan);

  if (titleCol) {
    cols.push(titleCol);
    vals.push(titleSan);
  }

  cols.push("sort_order");
  vals.push(sort);

  cols.push("is_active");
  vals.push(active);

  const placeholders = cols.map(() => "?").join(", ");

  const [result] = await pool.query(`INSERT INTO drone_gallery_items (${cols.join(", ")}) VALUES (${placeholders})`, vals);
  return result.insertId;
}

async function updateGalleryItem(id, payload = {}) {
  const itemId = clampInt(id, null, 1, 999999999);
  if (!itemId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const titleCol = await resolveGalleryTitleColumn();
  const supportsModel = await hasColumn("drone_gallery_items", "model_key");

  const sets = [];
  const params = [];

  if (supportsModel && Object.prototype.hasOwnProperty.call(payload, "model_key")) {
    sets.push("model_key=?");
    params.push(payload.model_key ? String(payload.model_key) : null);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "media_type")) {
    const mType = String(payload.media_type || "").toUpperCase() === "VIDEO" ? "VIDEO" : "IMAGE";
    sets.push("media_type=?");
    params.push(mType);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "media_path")) {
    sets.push("media_path=?");
    params.push(sanitizeText(payload.media_path, 255));
  }

  if (titleCol && Object.prototype.hasOwnProperty.call(payload, "title")) {
    sets.push(`${titleCol}=?`);
    params.push(sanitizeText(payload.title, 160));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "sort_order")) {
    sets.push("sort_order=?");
    params.push(clampInt(payload.sort_order, 0, 0, 999999));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    sets.push("is_active=?");
    params.push(Number(payload.is_active) ? 1 : 0);
  }

  if (!sets.length) return 0;

  params.push(itemId);

  const [result] = await pool.query(
    `UPDATE drone_gallery_items
     SET ${sets.join(", ")}
     WHERE id=?`,
    params
  );

  return result.affectedRows || 0;
}

async function deleteGalleryItem(id) {
  const itemId = clampInt(id, null, 1, 999999999);
  if (!itemId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const [result] = await pool.query(`DELETE FROM drone_gallery_items WHERE id=?`, [itemId]);
  return result.affectedRows || 0;
}

// =====================
// Representatives
// =====================
async function listRepresentativesPublic({ page, limit, busca, orderBy, orderDir } = {}) {
  const p = clampInt(page, 1, 1, 999999);
  const l = clampInt(limit, 12, 1, 50);
  const offset = (p - 1) * l;

  const q = sanitizeText(busca, 120);

  const allowedOrderBy = new Set(["sort_order", "name", "address_city", "created_at"]);
  const ob = allowedOrderBy.has(orderBy) ? orderBy : "sort_order";
  const od = String(orderDir || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";

  let where = "WHERE is_active=1";
  const params = [];

  if (q) {
    where += " AND (name LIKE ? OR address_city LIKE ? OR address_uf LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM drone_representatives
     ${where}`,
    params
  );

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const [rows] = await pool.query(
    `SELECT *
     FROM drone_representatives
     ${where}
     ORDER BY ${ob} ${od}, id DESC
     LIMIT ? OFFSET ?`,
    [...params, l, offset]
  );

  return { items: rows, page: p, limit: l, total, totalPages };
}

async function listRepresentativesAdmin({ page, limit, busca, includeInactive } = {}) {
  const p = clampInt(page, 1, 1, 999999);
  const l = clampInt(limit, 20, 1, 100);
  const offset = (p - 1) * l;

  const q = sanitizeText(busca, 120);
  const inc = Number(includeInactive) ? 1 : 0;

  let where = "WHERE 1=1";
  const params = [];

  if (!inc) where += " AND is_active=1";

  if (q) {
    where += " AND (name LIKE ? OR address_city LIKE ? OR address_uf LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM drone_representatives
     ${where}`,
    params
  );

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const [rows] = await pool.query(
    `SELECT *
     FROM drone_representatives
     ${where}
     ORDER BY sort_order ASC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, l, offset]
  );

  return { items: rows, page: p, limit: l, total, totalPages };
}

async function createRepresentative(payload = {}) {
  const name = sanitizeText(payload.name, 120);
  const whatsapp = sanitizeText(payload.whatsapp, 30);
  const cnpj = sanitizeText(payload.cnpj, 20);

  if (!name || !whatsapp || !cnpj) {
    const err = new Error("name, whatsapp e cnpj são obrigatórios");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const instagram_url = sanitizeText(payload.instagram_url, 255);
  const address_street = sanitizeText(payload.address_street, 120);
  const address_number = sanitizeText(payload.address_number, 30);
  const address_complement = sanitizeText(payload.address_complement, 80);
  const address_neighborhood = sanitizeText(payload.address_neighborhood, 80);
  const address_city = sanitizeText(payload.address_city, 80);
  const address_uf = sanitizeText(payload.address_uf, 2);
  const address_cep = sanitizeText(payload.address_cep, 15);
  const notes = sanitizeText(payload.notes, 255);
  const sort_order = clampInt(payload.sort_order, 0, 0, 999999);
  const is_active = payload.is_active == null ? 1 : Number(payload.is_active) ? 1 : 0;

  const [result] = await pool.query(
    `INSERT INTO drone_representatives
     (name, whatsapp, cnpj, instagram_url,
      address_street, address_number, address_complement,
      address_neighborhood, address_city, address_uf, address_cep,
      notes, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      whatsapp,
      cnpj,
      instagram_url,
      address_street || "",
      address_number || "",
      address_complement,
      address_neighborhood,
      address_city,
      address_uf,
      address_cep,
      notes,
      sort_order,
      is_active,
    ]
  );

  return result.insertId;
}

async function updateRepresentative(id, payload = {}) {
  const repId = clampInt(id, null, 1, 999999999);
  if (!repId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const sets = [];
  const params = [];

  const map = [
    ["name", 120],
    ["whatsapp", 30],
    ["cnpj", 20],
    ["instagram_url", 255],
    ["address_street", 120],
    ["address_number", 30],
    ["address_complement", 80],
    ["address_neighborhood", 80],
    ["address_city", 80],
    ["address_uf", 2],
    ["address_cep", 15],
    ["notes", 255],
  ];

  for (const [k, maxLen] of map) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) {
      sets.push(`${k}=?`);
      params.push(sanitizeText(payload[k], maxLen));
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "sort_order")) {
    sets.push("sort_order=?");
    params.push(clampInt(payload.sort_order, 0, 0, 999999));
  }

  if (Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    sets.push("is_active=?");
    params.push(Number(payload.is_active) ? 1 : 0);
  }

  if (!sets.length) return 0;

  params.push(repId);

  const [result] = await pool.query(
    `UPDATE drone_representatives
     SET ${sets.join(", ")}
     WHERE id=?`,
    params
  );

  return result.affectedRows || 0;
}

async function deleteRepresentative(id) {
  const repId = clampInt(id, null, 1, 999999999);
  if (!repId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const [result] = await pool.query(`DELETE FROM drone_representatives WHERE id=?`, [repId]);
  return result.affectedRows || 0;
}

/* =====================
 * COMMENTS (public/admin)
 * ===================== */

function sha256Hex(v) {
  try {
    return require("crypto").createHash("sha256").update(String(v || "")).digest("hex");
  } catch {
    return null;
  }
}

async function listApprovedComments({ page, limit, model_key } = {}) {
  const p = clampInt(page, 1, 1, 999999);
  const l = clampInt(limit, 10, 1, 50);
  const offset = (p - 1) * l;

  const supportsModelKey = await hasColumn("drone_comments", "model_key");

  let where = "WHERE status='APROVADO'";
  const params = [];

  if (supportsModelKey && model_key) {
    where += " AND model_key=?";
    params.push(String(model_key));
  }

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM drone_comments
     ${where}`,
    params
  );

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const [rows] = await pool.query(
    `SELECT id, model_key, display_name, comment_text, status, created_at
     FROM drone_comments
     ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, l, offset]
  );

  const ids = rows.map((r) => r.id).filter(Boolean);
  let mediaByComment = {};
  if (ids.length) {
    const [mediaRows] = await pool.query(
      `SELECT comment_id, media_type, media_path, created_at
       FROM drone_comment_media
       WHERE comment_id IN (?)
       ORDER BY id ASC`,
      [ids]
    );
    mediaByComment = mediaRows.reduce((acc, m) => {
      const k = String(m.comment_id);
      if (!acc[k]) acc[k] = [];
      acc[k].push({
        media_type: m.media_type,
        media_path: m.media_path,
        created_at: m.created_at,
      });
      return acc;
    }, {});
  }

  const items = rows.map((r) => ({
    id: r.id,
    model_key: r.model_key ?? null,
    display_name: r.display_name ?? null,
    comment_text: r.comment_text,
    status: r.status,
    created_at: r.created_at,
    media: mediaByComment[String(r.id)] || [],
  }));

  return { items, page: p, limit: l, total, totalPages };
}

async function listCommentsAdmin({ page, limit, status, model_key } = {}) {
  const p = clampInt(page, 1, 1, 999999);
  const l = clampInt(limit, 20, 1, 100);
  const offset = (p - 1) * l;

  const supportsModelKey = await hasColumn("drone_comments", "model_key");
  const supportsStatus = await hasColumn("drone_comments", "status");

  let where = "WHERE 1=1";
  const params = [];

  if (supportsStatus && status) {
    where += " AND status=?";
    params.push(String(status));
  }

  if (supportsModelKey && model_key) {
    where += " AND model_key=?";
    params.push(String(model_key));
  }

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM drone_comments
     ${where}`,
    params
  );

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const [rows] = await pool.query(
    `SELECT id, model_key, display_name, comment_text, status, ip_hash, user_agent, created_at, updated_at
     FROM drone_comments
     ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, l, offset]
  );

  const ids = rows.map((r) => r.id).filter(Boolean);
  let mediaCounts = {};
  if (ids.length) {
    const [mrows] = await pool.query(
      `SELECT comment_id, COUNT(*) AS total
       FROM drone_comment_media
       WHERE comment_id IN (?)
       GROUP BY comment_id`,
      [ids]
    );
    mediaCounts = mrows.reduce((acc, r) => {
      acc[String(r.comment_id)] = Number(r.total || 0);
      return acc;
    }, {});
  }

  const items = rows.map((r) => ({
    ...r,
    media_count: mediaCounts[String(r.id)] || 0,
  }));

  return { items, page: p, limit: l, total, totalPages };
}

async function getCommentById(id) {
  const commentId = clampInt(id, null, 1, 999999999);
  if (!commentId) return null;

  const [rows] = await pool.query(
    `SELECT id, model_key, display_name, comment_text, status, ip_hash, user_agent, created_at, updated_at
     FROM drone_comments
     WHERE id=? LIMIT 1`,
    [commentId]
  );

  const row = rows[0];
  if (!row) return null;

  const [media] = await pool.query(
    `SELECT id, media_type, media_path, created_at
     FROM drone_comment_media
     WHERE comment_id=?
     ORDER BY id ASC`,
    [commentId]
  );

  return { ...row, media };
}

async function createComment({ model_key = null, display_name, comment_text, status, ip, user_agent, mediaItems } = {}) {
  const textSan = sanitizeText(comment_text, 1000);
  if (!textSan) {
    const err = new Error("comment_text obrigatório");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const nameSan = display_name ? sanitizeText(display_name, 80) : null;

  const supportsModelKey = await hasColumn("drone_comments", "model_key");
  const supportsStatus = await hasColumn("drone_comments", "status");

  const st = supportsStatus ? String(status || "APROVADO") : null;

  const ipHash = ip ? sha256Hex(ip) : null;
  const ua = user_agent ? sanitizeText(user_agent, 255) : null;

  const cols = [];
  const vals = [];

  if (supportsModelKey) {
    cols.push("model_key");
    vals.push(model_key ? String(model_key) : null);
  }

  cols.push("display_name");
  vals.push(nameSan);

  cols.push("comment_text");
  vals.push(textSan);

  if (supportsStatus) {
    cols.push("status");
    vals.push(st);
  }

  cols.push("ip_hash");
  vals.push(ipHash);

  cols.push("user_agent");
  vals.push(ua);

  const placeholders = cols.map(() => "?").join(", ");

  const [result] = await pool.query(
    `INSERT INTO drone_comments (${cols.join(", ")})
     VALUES (${placeholders})`,
    vals
  );

  const commentId = result.insertId;

  if (Array.isArray(mediaItems) && mediaItems.length) {
    const clean = mediaItems
      .map((m) => ({
        media_type: m?.media_type === "VIDEO" ? "VIDEO" : "IMAGE",
        media_path: m?.media_path ? String(m.media_path) : null,
      }))
      .filter((m) => m.media_path);

    if (clean.length) {
      const values = clean.map((m) => [commentId, m.media_type, m.media_path]);
      await pool.query(
        `INSERT INTO drone_comment_media (comment_id, media_type, media_path)
         VALUES ?`,
        [values]
      );
    }
  }

  return commentId;
}

async function deleteComment(id) {
  const commentId = clampInt(id, null, 1, 999999999);
  if (!commentId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const [result] = await pool.query(`DELETE FROM drone_comments WHERE id=?`, [commentId]);
  return result.affectedRows || 0;
}

async function setCommentStatus(id, status) {
  const commentId = clampInt(id, null, 1, 999999999);
  if (!commentId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const st = String(status || "").toUpperCase();
  const allowed = new Set(["PENDENTE", "APROVADO", "REPROVADO"]);
  if (!allowed.has(st)) {
    const err = new Error("status inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const supportsStatus = await hasColumn("drone_comments", "status");
  if (!supportsStatus) {
    const err = new Error("STATUS_UNSUPPORTED");
    err.code = "STATUS_UNSUPPORTED";
    throw err;
  }

  const [result] = await pool.query(`UPDATE drone_comments SET status=? WHERE id=?`, [st, commentId]);
  return result.affectedRows || 0;
}

async function setCommentApproval(id, isApproved) {
  return setCommentStatus(id, isApproved ? "APROVADO" : "REPROVADO");
}

/* =====================
 * MODELS
 * ===================== */

async function listDroneModels({ includeInactive } = {}) {
  const inc = Number(includeInactive) ? 1 : 0;

  let where = "WHERE 1=1";
  const params = [];

  if (!inc) {
    where += " AND is_active=1";
  }

  const [rows] = await pool.query(
    `SELECT id, \`key\`, label, is_active, sort_order, created_at, updated_at
     FROM drone_models
     ${where}
     ORDER BY sort_order ASC, id ASC`,
    params
  );

  return rows;
}

async function getDroneModelByKey(modelKey) {
  const k = sanitizeText(modelKey, 20);
  if (!k) return null;

  // ✅ CORREÇÃO: `key` precisa fechar a crase e usar placeholder direito
  const [rows] = await pool.query(
    `SELECT id, \`key\`, label, is_active, sort_order, created_at, updated_at
     FROM drone_models
     WHERE \`key\` = ?
     LIMIT 1`,
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
    `INSERT INTO drone_models (\`key\`, label, is_active, sort_order)
     VALUES (?, ?, ?, ?)`,
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
    `UPDATE drone_models
     SET ${sets.join(", ")}
     WHERE id=?`,
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

  const [result] = await pool.query(`DELETE FROM drone_models WHERE id=?`, [modelId]);
  return result.affectedRows || 0;
}

// =====================
// Export
// =====================
module.exports = {
  // helpers usados pelos controllers
  clampInt,
  sanitizeText,
  safeParseJson,

  // page settings
  getPageSettings,
  upsertPageSettings,

  // models json (por modelo)
  getModelsJsonFromPage,
  getModelInfo,
  upsertModelInfo,

  // gallery
  listGalleryPublic,
  listGalleryAdmin,
  createGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,

  // reps
  listRepresentativesPublic,
  listRepresentativesAdmin,
  createRepresentative,
  updateRepresentative,
  deleteRepresentative,

  // comments
  listApprovedComments,
  listCommentsAdmin,
  getCommentById,
  createComment,
  deleteComment,
  setCommentApproval,
  setCommentStatus,

  // drone models
  listDroneModels,
  getDroneModelByKey,
  createDroneModel,
  updateDroneModel,
  deleteDroneModel,

  // util
  hasColumn,
  getTableRowCount,
};
