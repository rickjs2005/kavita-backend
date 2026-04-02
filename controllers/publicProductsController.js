// controllers/publicProductsController.js
// =============================================================================
// ⚠️  CONTRATO MISTO — getProductById NÃO É REFERÊNCIA PARA CÓDIGO NOVO
// =============================================================================
// listProducts e searchProducts: padrão A ✅ (response.paginated)
// getProductById: contrato CONGELADO — bare object, migração pendente.
//
// Ao tocar getProductById:
//   - PRESERVE o formato bare { ...product, images }
//   - NÃO copie este padrão em código novo
//   - Para migrar: coordenar com frontend público (ver CLAUDE.md § Contratos)
//
// Shapes por endpoint:
//   GET /api/products        → { ok: true, data: [...], meta: { total, page, limit, pages } } ✅
//   GET /api/products/search → { ok: true, data: [...], meta: { total, page, limit, pages } } ✅
//   GET /api/products/:id    → { ...product, images: string[] }  ← CONGELADO
//   Erros (list/search)      → { ok: false, code, message } via AppError ✅
//   Erros (getById)          → { message: "..." }  ← CONGELADO
// =============================================================================

"use strict";

const { response } = require("../lib");
const productService = require("../services/productService");
const productRepo = require("../repositories/productPublicRepository");
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
 * Response: { ...product, images: string[] }   (contrato legado — não migrado)
 */
async function getProductById(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const produto = await productRepo.findProductById(id);
    if (!produto) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }

    const imageRows = await productRepo.findProductImages([id]);
    const images = imageRows.map((r) => r.image_url);

    return res.json({ ...produto, images });
  } catch (err) {
    console.error("[GET /api/products/:id] Erro:", err);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
}

module.exports = { listProducts, searchProducts, getProductById };
