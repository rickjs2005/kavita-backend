"use strict";

const pool = require("../../config/pool");
const { clampInt, sanitizeText, hasColumn } = require("./helpers");

async function resolveGalleryTitleColumn() {
  const candidates = ["caption", "title", "legenda", "label"];
  for (const c of candidates) {
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
    `SELECT COUNT(*) AS total FROM drone_gallery_items ${where}`,
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
    `SELECT COUNT(*) AS total FROM drone_gallery_items ${where}`,
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

  const [result] = await pool.query(
    `INSERT INTO drone_gallery_items (${cols.join(", ")}) VALUES (${placeholders})`,
    vals
  );
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
    `UPDATE drone_gallery_items SET ${sets.join(", ")} WHERE id=?`,
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

  const [result] = await pool.query("DELETE FROM drone_gallery_items WHERE id=?", [itemId]);
  return result.affectedRows || 0;
}

async function getGalleryItemsByIds(ids = []) {
  const list = Array.isArray(ids)
    ? ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
    : [];

  if (!list.length) return [];

  const [rows] = await pool.query(
    `SELECT id, model_key, media_type, media_path, is_active
     FROM drone_gallery_items WHERE id IN (?) LIMIT 5000`,
    [list]
  );

  return rows || [];
}

module.exports = {
  resolveGalleryTitleColumn,
  listGalleryPublic,
  listGalleryAdmin,
  createGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
  getGalleryItemsByIds,
};
