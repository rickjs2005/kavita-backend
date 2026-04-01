// controllers/publicProductsController.js
//
// Handlers para os endpoints públicos de produtos.
//
// ⚠️  CONTRATO DIVERGENTE — requer coordenação com o frontend antes de migrar.
//
// Formato atual de SUCESSO (não alterar sem alinhar com o frontend):
//
//   GET /api/products
//     { data: Product[], page, limit, total, totalPages, sort, order }
//
//   GET /api/products/search
//     { products: Product[], pagination: { page, limit, total, totalPages } }
//
//   GET /api/products/:id
//     { ...product, images: string[] }   ← bare object, sem wrapper ok/data
//
// Formato atual de ERRO (não alterar sem alinhar com o frontend):
//   HTTP 4xx/5xx  →  { message: "..." }       ← sem ok: false, sem code
//
// Formato-alvo quando migrar (requer mudança coordenada no frontend):
//   Sucesso  →  response.ok(res, data) ou response.paginated(res, {...})
//   Erro     →  next(new AppError(...))  →  errorHandler produz { ok: false, code, message }
//
// Pré-condições para migrar:
//   1. Frontend atualizado para ler result.data (array) em vez de result diretamente
//   2. Frontend atualizado para ler result.data.pagination em busca, em vez de result.pagination
//   3. Frontend atualizado para ler result.data em /:id em vez de result diretamente
//   4. Testes de integração cobrindo os três endpoints

"use strict";

const productService = require("../services/productService");
const productRepo = require("../repositories/productRepository");
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

/**
 * GET /api/products/:id
 * Params: id (integer)
 * Response: { ...product, images: string[] }
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
