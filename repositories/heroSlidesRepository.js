"use strict";
// repositories/heroSlidesRepository.js
// Data access for hero_slides table.
//
// JSON columns (Sprint 5 / 2026-05-09):
//   - features, quick_links são MySQL JSON. O driver mysql2 devolve
//     a coluna já parseada como array/objeto JS quando o tipo é JSON.
//     No INSERT/UPDATE, o driver serializa automaticamente arrays JS
//     para JSON ao usar `SET ?`. Se em algum ambiente o driver não
//     fizer isso (versões antigas), o normalize() abaixo garante shape.

const pool = require("../config/pool");

function parseJsonField(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeRow(row) {
  if (!row) return row;
  return {
    ...row,
    features: parseJsonField(row.features),
    quick_links: parseJsonField(row.quick_links),
  };
}

function normalizeFieldsForWrite(fields) {
  // MySQL JSON aceita string OU objeto via driver. Para máxima
  // compatibilidade, serializamos manualmente quando o valor é array.
  // Null permanece null (coluna explicitamente vazia).
  const out = { ...fields };
  if ("features" in out) {
    out.features =
      out.features === null || out.features === undefined
        ? null
        : JSON.stringify(out.features);
  }
  if ("quick_links" in out) {
    out.quick_links =
      out.quick_links === null || out.quick_links === undefined
        ? null
        : JSON.stringify(out.quick_links);
  }
  return out;
}

async function findActiveSlides() {
  const [rows] = await pool.query(
    `SELECT * FROM hero_slides
     WHERE is_active = 1
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at > NOW())
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(normalizeRow);
}

async function findAllSlides(includeInactive = true) {
  const where = includeInactive ? "" : "WHERE is_active = 1";
  const [rows] = await pool.query(
    `SELECT * FROM hero_slides ${where} ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(normalizeRow);
}

async function findSlideById(id) {
  const [rows] = await pool.query("SELECT * FROM hero_slides WHERE id = ?", [id]);
  return rows[0] ? normalizeRow(rows[0]) : null;
}

async function insertSlide(fields) {
  const [result] = await pool.query("INSERT INTO hero_slides SET ?", [
    normalizeFieldsForWrite(fields),
  ]);
  return result.insertId;
}

async function updateSlide(id, fields) {
  const [result] = await pool.query("UPDATE hero_slides SET ? WHERE id = ?", [
    normalizeFieldsForWrite(fields),
    id,
  ]);
  return result.affectedRows;
}

async function deleteSlide(id) {
  const [result] = await pool.query("DELETE FROM hero_slides WHERE id = ?", [id]);
  return result.affectedRows;
}

module.exports = {
  findActiveSlides,
  findAllSlides,
  findSlideById,
  insertSlide,
  updateSlide,
  deleteSlide,
};
