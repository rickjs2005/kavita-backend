// repositories/cityPromotionsRepository.js
"use strict";

const pool = require("../config/pool");

async function listActiveForCity(cityName) {
  const [rows] = await pool.query(
    `SELECT p.*,
            c.name AS corretora_name, c.slug AS corretora_slug
     FROM corretora_city_promotions p
     JOIN corretoras c ON c.id = p.corretora_id
     WHERE p.is_active = 1
       AND p.ends_at > NOW()
       AND LOWER(p.city) = LOWER(?)
     ORDER BY p.created_at DESC`,
    [cityName],
  );
  return rows;
}

async function listAllActive() {
  const [rows] = await pool.query(
    `SELECT p.*,
            c.name AS corretora_name, c.slug AS corretora_slug
     FROM corretora_city_promotions p
     JOIN corretoras c ON c.id = p.corretora_id
     WHERE p.is_active = 1 AND p.ends_at > NOW()
     ORDER BY p.ends_at ASC`,
  );
  return rows;
}

async function listForCorretora(corretoraId) {
  const [rows] = await pool.query(
    `SELECT * FROM corretora_city_promotions
     WHERE corretora_id = ?
     ORDER BY created_at DESC`,
    [corretoraId],
  );
  return rows;
}

async function create(data) {
  const [result] = await pool.query(
    `INSERT INTO corretora_city_promotions
       (corretora_id, city, starts_at, ends_at, is_active, price_cents,
        provider, provider_payment_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.corretora_id,
      data.city,
      data.starts_at ?? new Date(),
      data.ends_at,
      data.is_active === false ? 0 : 1,
      data.price_cents ?? 0,
      data.provider ?? null,
      data.provider_payment_id ?? null,
    ],
  );
  return result.insertId;
}

async function deactivate(id) {
  const [result] = await pool.query(
    `UPDATE corretora_city_promotions SET is_active = 0 WHERE id = ?`,
    [id],
  );
  return result.affectedRows;
}

async function corretoraHasActiveInCity(corretoraId, cityName) {
  const [[row]] = await pool.query(
    `SELECT 1 FROM corretora_city_promotions
     WHERE corretora_id = ?
       AND LOWER(city) = LOWER(?)
       AND is_active = 1
       AND ends_at > NOW()
     LIMIT 1`,
    [corretoraId, cityName],
  );
  return Boolean(row);
}

module.exports = {
  listActiveForCity,
  listAllActive,
  listForCorretora,
  create,
  deactivate,
  corretoraHasActiveInCity,
};
