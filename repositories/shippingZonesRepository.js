"use strict";
// repositories/shippingZonesRepository.js
//
// Escopo: CRUD admin de zonas de frete.
// Tabelas: shipping_zones, shipping_zone_cities.
//
// ⚠️  NÃO confundir com shippingRepository.js, que é o domínio PÚBLICO:
//     cálculo de cotação (getZonesByState, getCityMatch, getRateByCep).
//
// Consumidor: services/shippingZonesService.js
//
// Convenção de conexão:
//   Funções de leitura simples: pool.query interno.
//   Funções transacionais: recebem `conn` como 1º argumento.

const pool = require("../config/pool");

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Lista todas as zonas de frete sem filtro de is_active.
 * @returns {object[]}
 */
async function findAll() {
  const [rows] = await pool.query(
    `SELECT id, name, state, all_cities, is_free, price, prazo_dias, is_active, created_at, updated_at
     FROM shipping_zones
     ORDER BY id DESC`
  );
  return rows;
}

/**
 * Busca cidades de múltiplas zonas em uma única query (evita N+1).
 * @param {number[]} ids
 * @returns {{ zone_id: number, city: string }[]}
 */
async function findCitiesBatch(ids) {
  if (!ids.length) return [];
  const [rows] = await pool.query(
    "SELECT zone_id, city FROM shipping_zone_cities WHERE zone_id IN (?)",
    [ids]
  );
  return rows;
}

/**
 * Verifica existência de uma zona. Usa `conn` para operar dentro de transação.
 * @param {import("mysql2").Connection} conn
 * @param {number} id
 * @returns {boolean}
 */
async function existsById(conn, id) {
  const [rows] = await conn.query(
    "SELECT 1 FROM shipping_zones WHERE id = ? LIMIT 1",
    [id]
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Escrita — zonas
// ---------------------------------------------------------------------------

/**
 * Insere nova zona de frete.
 * @param {import("mysql2").Connection} conn
 * @param {{ name, state, all_cities, is_free, price, prazo_dias, is_active }} data
 * @returns {number} insertId
 */
async function insertZone(conn, { name, state, all_cities, is_free, price, prazo_dias, is_active }) {
  const [result] = await conn.query(
    `INSERT INTO shipping_zones (name, state, all_cities, is_free, price, prazo_dias, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, state, all_cities ? 1 : 0, is_free ? 1 : 0, price, prazo_dias, is_active ? 1 : 0]
  );
  return result.insertId;
}

/**
 * Atualiza campos de uma zona.
 * @param {import("mysql2").Connection} conn
 * @param {number} id
 * @param {{ name, state, all_cities, is_free, price, prazo_dias, is_active }} data
 */
async function updateZone(conn, id, { name, state, all_cities, is_free, price, prazo_dias, is_active }) {
  await conn.query(
    `UPDATE shipping_zones
     SET name=?, state=?, all_cities=?, is_free=?, price=?, prazo_dias=?, is_active=?
     WHERE id=?`,
    [name, state, all_cities ? 1 : 0, is_free ? 1 : 0, price, prazo_dias, is_active ? 1 : 0, id]
  );
}

/**
 * Remove zona. Opera diretamente no pool (sem transação).
 * @param {number} id
 */
async function deleteZone(id) {
  await pool.query("DELETE FROM shipping_zones WHERE id=?", [id]);
}

// ---------------------------------------------------------------------------
// Escrita — cidades
// ---------------------------------------------------------------------------

/**
 * Insere cidades para uma zona (INSERT IGNORE — idempotente).
 * @param {import("mysql2").Connection} conn
 * @param {number} zoneId
 * @param {string[]} cities
 */
async function insertCities(conn, zoneId, cities) {
  for (const city of cities) {
    await conn.query(
      "INSERT IGNORE INTO shipping_zone_cities (zone_id, city) VALUES (?, ?)",
      [zoneId, city]
    );
  }
}

/**
 * Remove todas as cidades de uma zona e insere a nova lista.
 * Usado em updates para substituição total.
 * @param {import("mysql2").Connection} conn
 * @param {number} zoneId
 * @param {string[]} cities
 */
async function replaceCities(conn, zoneId, cities) {
  await conn.query("DELETE FROM shipping_zone_cities WHERE zone_id=?", [zoneId]);
  await insertCities(conn, zoneId, cities);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  findAll,
  findCitiesBatch,
  existsById,
  insertZone,
  updateZone,
  deleteZone,
  insertCities,
  replaceCities,
};
