"use strict";

const pool = require("../../config/pool");
const { sanitizeText } = require("./helpers");

// =====================
// Internal serializer
// =====================

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

  const specs_title = sanitizeText(valueOrCurrent("specs_title"), 120);
  const specs_items_json = jsonToDb(valueOrCurrent("specs_items_json"));
  const features_title = sanitizeText(valueOrCurrent("features_title"), 120);
  const features_items_json = jsonToDb(valueOrCurrent("features_items_json"));
  const benefits_title = sanitizeText(valueOrCurrent("benefits_title"), 120);
  const benefits_items_json = jsonToDb(valueOrCurrent("benefits_items_json"));
  const sections_order_json = jsonToDb(valueOrCurrent("sections_order_json"));

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

module.exports = { getPageSettings, upsertPageSettings };
