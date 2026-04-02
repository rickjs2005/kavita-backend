"use strict";
// services/favoritesService.js
//
// Regras de negócio para favoritos do usuário.
// Consumidor: controllers/favoritesController.js

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/favoritesRepository");

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Lista os produtos favoritos de um usuário com imagens anexadas.
 * @param {number} userId
 * @returns {object[]}
 */
async function listFavorites(userId) {
  const products = await repo.findByUserId(userId);
  if (!products.length) return products;

  const ids = products.map((p) => p.id);
  const imageRows = await repo.findImagesBatch(ids);

  const bucket = imageRows.reduce((acc, r) => {
    (acc[r.product_id] ||= []).push(r.image_url);
    return acc;
  }, {});

  return products.map((p) => ({
    ...p,
    images: bucket[p.id] || [],
  }));
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/**
 * Adiciona produto aos favoritos do usuário.
 * Lança NOT_FOUND se o produto não existir.
 * Operação é idempotente — adicionar novamente não gera erro.
 *
 * @param {number} userId
 * @param {number} productId
 */
async function addFavorite(userId, productId) {
  const exists = await repo.productExists(productId);
  if (!exists) {
    throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  await repo.addFavorite(userId, productId);
}

/**
 * Remove produto dos favoritos do usuário.
 * Silencioso se o produto não estiver nos favoritos.
 *
 * @param {number} userId
 * @param {number} productId
 */
async function removeFavorite(userId, productId) {
  await repo.removeFavorite(userId, productId);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listFavorites,
  addFavorite,
  removeFavorite,
};
