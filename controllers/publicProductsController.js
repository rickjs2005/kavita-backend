// controllers/publicProductsController.js
//
// Handlers para os endpoints públicos de produtos.
// Delegam ao productService e retornam o resultado bruto.
//
// ⚠️  CONTRATO DIVERGENTE — não normalizado ainda.
// Ambos os handlers retornam o objeto direto do service (sem wrapper ok/data)
// e erros como { message } (sem ok: false / code). O frontend depende desse
// formato. Migrar para lib/response.js + AppError ao alinhar com o frontend.
// Rastrear em: CLAUDE.md → "Migração de contrato de resposta"

"use strict";

const productService = require("../services/productService");
const AppError = require("../errors/AppError");

/**
 * GET /api/products
 * Query: category, search, page, limit, sort, order
 */
async function listProducts(req, res) {
  try {
    const result = await productService.listProducts(req.query);
    return res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error("[GET /api/products] Erro:", err);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
}

/**
 * GET /api/products/search
 * Query: q, categories, category_id, category, minPrice, maxPrice, promo, sort, page, limit
 */
async function searchProducts(req, res) {
  try {
    const result = await productService.searchProducts(req.query);
    return res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error("[GET /api/products/search] Erro:", err);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
}

module.exports = { listProducts, searchProducts };
