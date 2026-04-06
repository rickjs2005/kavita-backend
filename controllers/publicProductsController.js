// controllers/publicProductsController.js
//
// Handlers para os endpoints públicos de produtos.
// Todos os endpoints usam response.ok/paginated + AppError (Formato A).

"use strict";

const { response } = require("../lib");
const productService = require("../services/productService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/**
 * GET /api/products
 * Query: category, search, page, limit, sort, order
 */
async function listProducts(req, res, next) {
  try {
    const result = await productService.listProducts(req.query);
    response.paginated(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/products/search
 * Query: q, categories, category_id, category, minPrice, maxPrice, promo, sort, page, limit
 */
async function searchProducts(req, res, next) {
  try {
    const result = await productService.searchProducts(req.query);
    response.paginated(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/products/:id
 * Params: id (integer)
 */
async function getProductById(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const produto = await productService.getProductById(id);
    return response.ok(res, produto);
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro interno no servidor.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
}

module.exports = { listProducts, searchProducts, getProductById };
