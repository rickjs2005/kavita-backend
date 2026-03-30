"use strict";
// services/promocoesService.js
//
// Lógica de negócio para o módulo público de promoções de produtos.
// Responsabilidades:
//   - delegar queries ao repository
//   - lançar NOT_FOUND quando não houver promoção ativa para um produto

const repo = require("../repositories/promocoesRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/**
 * Retorna todas as promoções ativas.
 * @returns {Promise<object[]>}
 */
async function listPromocoes() {
  return repo.findActivePromocoes();
}

/**
 * Retorna a promoção ativa de um produto específico.
 * Lança NOT_FOUND se não houver promoção ativa para o produto.
 *
 * @param {number} productId
 * @returns {Promise<object>}
 */
async function getPromocaoByProductId(productId) {
  const row = await repo.findActivePromocaoByProductId(productId);
  if (!row) {
    throw new AppError(
      "Nenhuma promoção ativa para este produto.",
      ERROR_CODES.NOT_FOUND,
      404
    );
  }
  return row;
}

module.exports = {
  listPromocoes,
  getPromocaoByProductId,
};
