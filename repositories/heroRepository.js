"use strict";

const pool = require("../config/pool");

// ─── site_hero_settings ────────────────────────────────────────────────────

async function findHeroId() {
  const [rows] = await pool.query("SELECT id FROM site_hero_settings LIMIT 1");
  return rows?.[0]?.id ?? null;
}

async function insertDefaultHeroRow() {
  const [result] = await pool.query(
    "INSERT INTO site_hero_settings (button_label, button_href) VALUES (?, ?)",
    ["Saiba Mais", "/drones"]
  );
  return result.insertId;
}

async function findHeroSettings() {
  const [rows] = await pool.query(
    `SELECT
        hero_video_url, hero_video_path,
        hero_image_url, hero_image_path,
        title, subtitle,
        button_label, button_href,
        updated_at, created_at
     FROM site_hero_settings
     ORDER BY id ASC
     LIMIT 1`
  );
  return rows?.[0] ?? null;
}

async function updateHeroSettings(id, fields) {
  await pool.query("UPDATE site_hero_settings SET ? WHERE id = ?", [fields, id]);
}

module.exports = {
  findHeroId,
  insertDefaultHeroRow,
  findHeroSettings,
  updateHeroSettings,
};
