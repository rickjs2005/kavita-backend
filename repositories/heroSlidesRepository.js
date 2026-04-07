"use strict";
// repositories/heroSlidesRepository.js
// Data access for hero_slides table.

const pool = require("../config/pool");

async function findActiveSlides() {
  const [rows] = await pool.query(
    `SELECT * FROM hero_slides
     WHERE is_active = 1
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at > NOW())
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows;
}

async function findAllSlides(includeInactive = true) {
  const where = includeInactive ? "" : "WHERE is_active = 1";
  const [rows] = await pool.query(
    `SELECT * FROM hero_slides ${where} ORDER BY sort_order ASC, id ASC`,
  );
  return rows;
}

async function findSlideById(id) {
  const [rows] = await pool.query("SELECT * FROM hero_slides WHERE id = ?", [id]);
  return rows[0] ?? null;
}

async function insertSlide(fields) {
  const [result] = await pool.query("INSERT INTO hero_slides SET ?", [fields]);
  return result.insertId;
}

async function updateSlide(id, fields) {
  const [result] = await pool.query("UPDATE hero_slides SET ? WHERE id = ?", [fields, id]);
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
