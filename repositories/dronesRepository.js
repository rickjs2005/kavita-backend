"use strict";

const pool = require("../config/pool");

// ─── Schema introspection ───────────────────────────────────────────────────

async function columnExists(table, col) {
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

async function tableRowCount(table) {
  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM ${table}`);
  return Number(rows?.[0]?.total || 0);
}

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

// ─── drone_page_settings ───────────────────────────────────────────────────

async function findPageSettings() {
  const [rows] = await pool.query(
    `SELECT * FROM drone_page_settings ORDER BY id DESC LIMIT 1`
  );
  return rows[0] ?? null;
}

async function insertPageSettings(vals) {
  const [result] = await pool.query(
    `INSERT INTO drone_page_settings
     (hero_title, hero_subtitle, hero_video_path, hero_image_fallback_path,
      cta_title, cta_message_template, cta_button_label,
      specs_title, specs_items_json,
      features_title, features_items_json,
      benefits_title, benefits_items_json,
      sections_order_json, models_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    vals
  );
  return result.insertId;
}

async function updatePageSettings(id, vals) {
  const [result] = await pool.query(
    `UPDATE drone_page_settings
     SET hero_title=?, hero_subtitle=?, hero_video_path=?, hero_image_fallback_path=?,
         cta_title=?, cta_message_template=?, cta_button_label=?,
         specs_title=?, specs_items_json=?,
         features_title=?, features_items_json=?,
         benefits_title=?, benefits_items_json=?,
         sections_order_json=?, models_json=?
     WHERE id=?`,
    [...vals, id]
  );
  return result.affectedRows || 0;
}

async function updatePageModelsJson(id, modelsJson) {
  const [result] = await pool.query(
    "UPDATE drone_page_settings SET models_json=? WHERE id=?",
    [modelsJson, id]
  );
  return result.affectedRows || 0;
}

// ─── drone_models ──────────────────────────────────────────────────────────

async function listModels(where, params) {
  const [rows] = await pool.query(
    `SELECT id, \`key\`, label, is_active, sort_order, created_at, updated_at
     FROM drone_models ${where} ORDER BY sort_order ASC, id ASC`,
    params
  );
  return rows;
}

async function findModelByKey(key) {
  const [rows] = await pool.query(
    `SELECT id, \`key\`, label, is_active, sort_order, created_at, updated_at
     FROM drone_models WHERE \`key\` = ? LIMIT 1`,
    [key]
  );
  return rows[0] ?? null;
}

async function insertModel(key, label, isActive, sortOrder) {
  const [result] = await pool.query(
    "INSERT INTO drone_models (`key`, label, is_active, sort_order) VALUES (?, ?, ?, ?)",
    [key, label, isActive, sortOrder]
  );
  return result.insertId;
}

async function updateModel(id, sets, params) {
  const [result] = await pool.query(
    `UPDATE drone_models SET ${sets.join(", ")} WHERE id=?`,
    [...params, id]
  );
  return result.affectedRows || 0;
}

async function deleteModel(id) {
  const [result] = await pool.query("DELETE FROM drone_models WHERE id=?", [id]);
  return result.affectedRows || 0;
}

// ─── drone_model_media_selections ─────────────────────────────────────────

async function findModelSelections(modelKey) {
  const [rows] = await pool.query(
    "SELECT target, media_id FROM drone_model_media_selections WHERE model_key = ?",
    [modelKey]
  );
  return rows;
}

async function upsertModelSelection(modelKey, target, mediaId) {
  const [result] = await pool.query(
    `INSERT INTO drone_model_media_selections (model_key, target, media_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE media_id = VALUES(media_id)`,
    [modelKey, target, mediaId]
  );
  return result.affectedRows || 0;
}

async function findSelectionsForModels(keys) {
  const [rows] = await pool.query(
    "SELECT model_key, target, media_id FROM drone_model_media_selections WHERE model_key IN (?)",
    [keys]
  );
  return rows;
}

// ─── drone_gallery_items ───────────────────────────────────────────────────

async function countGallery(where, params) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM drone_gallery_items ${where}`,
    params
  );
  return Number(row?.total || 0);
}

async function listGallery(where, params, selectTitle, limit, offset) {
  const [rows] = await pool.query(
    `SELECT id, model_key, media_type, media_path, sort_order, is_active, created_at, updated_at
     ${selectTitle}
     FROM drone_gallery_items
     ${where}
     ORDER BY sort_order ASC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

async function insertGalleryItem(cols, vals) {
  const placeholders = cols.map(() => "?").join(", ");
  const [result] = await pool.query(
    `INSERT INTO drone_gallery_items (${cols.join(", ")}) VALUES (${placeholders})`,
    vals
  );
  return result.insertId;
}

async function updateGalleryItem(id, sets, params) {
  const [result] = await pool.query(
    `UPDATE drone_gallery_items SET ${sets.join(", ")} WHERE id=?`,
    [...params, id]
  );
  return result.affectedRows || 0;
}

async function deleteGalleryItem(id) {
  const [result] = await pool.query("DELETE FROM drone_gallery_items WHERE id=?", [id]);
  return result.affectedRows || 0;
}

async function findGalleryItemsByIds(ids) {
  const [rows] = await pool.query(
    `SELECT id, model_key, media_type, media_path, is_active
     FROM drone_gallery_items WHERE id IN (?) LIMIT 5000`,
    [ids]
  );
  return rows;
}

// ─── drone_comments ────────────────────────────────────────────────────────

async function countComments(where, params) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM drone_comments ${where}`,
    params
  );
  return Number(row?.total || 0);
}

async function listCommentRows(where, params, cols, limit, offset) {
  const [rows] = await pool.query(
    `SELECT ${cols}
     FROM drone_comments ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

async function findCommentById(id) {
  const [rows] = await pool.query(
    `SELECT id, model_key, display_name, comment_text, status, ip_hash, user_agent, created_at, updated_at
     FROM drone_comments WHERE id=? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

async function findCommentMedia(commentId) {
  const [rows] = await pool.query(
    `SELECT id, media_type, media_path, created_at FROM drone_comment_media
     WHERE comment_id=? ORDER BY id ASC`,
    [commentId]
  );
  return rows;
}

async function findCommentMediaByCommentIds(ids) {
  const [rows] = await pool.query(
    `SELECT comment_id, media_type, media_path, created_at
     FROM drone_comment_media
     WHERE comment_id IN (?) ORDER BY id ASC`,
    [ids]
  );
  return rows;
}

async function countMediaByCommentIds(ids) {
  const [rows] = await pool.query(
    `SELECT comment_id, COUNT(*) AS total FROM drone_comment_media
     WHERE comment_id IN (?) GROUP BY comment_id`,
    [ids]
  );
  return rows;
}

async function insertComment(cols, vals) {
  const placeholders = cols.map(() => "?").join(", ");
  const [result] = await pool.query(
    `INSERT INTO drone_comments (${cols.join(", ")}) VALUES (${placeholders})`,
    vals
  );
  return result.insertId;
}

async function insertCommentMedia(values) {
  await pool.query(
    "INSERT INTO drone_comment_media (comment_id, media_type, media_path) VALUES ?",
    [values]
  );
}

async function deleteComment(id) {
  const [result] = await pool.query("DELETE FROM drone_comments WHERE id=?", [id]);
  return result.affectedRows || 0;
}

async function setCommentStatus(id, status) {
  const [result] = await pool.query(
    "UPDATE drone_comments SET status=? WHERE id=?",
    [status, id]
  );
  return result.affectedRows || 0;
}

// ─── drone_representatives ─────────────────────────────────────────────────

async function countRepresentatives(where, params) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM drone_representatives ${where}`,
    params
  );
  return Number(row?.total || 0);
}

async function listRepresentativeRows(where, params, orderBy, orderDir, limit, offset) {
  const [rows] = await pool.query(
    `SELECT * FROM drone_representatives ${where}
     ORDER BY ${orderBy} ${orderDir}, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

async function insertRepresentative(vals) {
  const [result] = await pool.query(
    `INSERT INTO drone_representatives
     (name, whatsapp, cnpj, instagram_url,
      address_street, address_number, address_complement,
      address_neighborhood, address_city, address_uf, address_cep,
      notes, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    vals
  );
  return result.insertId;
}

async function updateRepresentative(id, sets, params) {
  const [result] = await pool.query(
    `UPDATE drone_representatives SET ${sets.join(", ")} WHERE id=?`,
    [...params, id]
  );
  return result.affectedRows || 0;
}

async function deleteRepresentative(id) {
  const [result] = await pool.query("DELETE FROM drone_representatives WHERE id=?", [id]);
  return result.affectedRows || 0;
}

module.exports = {
  // Schema
  columnExists,
  tableRowCount,
  tableExists,
  // Page settings
  findPageSettings,
  insertPageSettings,
  updatePageSettings,
  updatePageModelsJson,
  // Models
  listModels,
  findModelByKey,
  insertModel,
  updateModel,
  deleteModel,
  // Model media selections
  findModelSelections,
  upsertModelSelection,
  findSelectionsForModels,
  // Gallery
  countGallery,
  listGallery,
  insertGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
  findGalleryItemsByIds,
  // Comments
  countComments,
  listCommentRows,
  findCommentById,
  findCommentMedia,
  findCommentMediaByCommentIds,
  countMediaByCommentIds,
  insertComment,
  insertCommentMedia,
  deleteComment,
  setCommentStatus,
  // Representatives
  countRepresentatives,
  listRepresentativeRows,
  insertRepresentative,
  updateRepresentative,
  deleteRepresentative,
};
