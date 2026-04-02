"use strict";
// repositories/favoritesRepository.js
//
// Escopo: favoritos do usuário (tabela favorites + leitura de products e product_images).
// Tabelas: favorites (escrita), products (leitura), product_images (leitura).
//
// Consumidor: services/favoritesService.js

const pool = require("../config/pool");

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Lista os produtos salvos nos favoritos de um usuário, ordenados pelo mais recente.
 * @param {number} userId
 * @returns {object[]}  Linhas da tabela products
 */
async function findByUserId(userId) {
  const [rows] = await pool.query(
    `SELECT p.*
       FROM favorites f
       JOIN products p ON p.id = f.product_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * Busca imagens de múltiplos produtos em uma única query (evita N+1).
 * @param {number[]} ids
 * @returns {{ product_id: number, image_url: string }[]}
 */
async function findImagesBatch(ids) {
  if (!ids.length) return [];
  const [rows] = await pool.query(
    `SELECT product_id, path AS image_url
       FROM product_images
      WHERE product_id IN (?)
      ORDER BY id ASC`,
    [ids]
  );
  return rows;
}

/**
 * Verifica se o produto existe na tabela products.
 * @param {number} productId
 * @returns {boolean}
 */
async function productExists(productId) {
  const [rows] = await pool.query(
    "SELECT 1 FROM products WHERE id = ? LIMIT 1",
    [productId]
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/**
 * Adiciona produto aos favoritos. INSERT IGNORE → idempotente se já existir.
 * @param {number} userId
 * @param {number} productId
 */
async function addFavorite(userId, productId) {
  await pool.query(
    "INSERT IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)",
    [userId, productId]
  );
}

/**
 * Remove produto dos favoritos do usuário. Silencioso se não existir.
 * @param {number} userId
 * @param {number} productId
 */
async function removeFavorite(userId, productId) {
  await pool.query(
    "DELETE FROM favorites WHERE user_id = ? AND product_id = ?",
    [userId, productId]
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  findByUserId,
  findImagesBatch,
  productExists,
  addFavorite,
  removeFavorite,
};
