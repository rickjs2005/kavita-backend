// routes/public/publicProducts.js
//
// Ponto único de montagem do namespace /api/products.
// Prefixo montado: /api/products  (apenas aqui — não duplicar em routes/index.js)
//
// Endpoints deste arquivo (padrão MODERNO):
//   GET /api/products          — listagem paginada (categoria, busca, ordenação)
//   GET /api/products/search   — busca avançada (promoções, faixa de preço, filtros)
//
// Endpoints delegados ao legado (ver ao final deste arquivo):
//   GET /api/products/:id      — detalhe por ID  →  ./_legacy/publicProductById.js
//
// NÃO contém avaliações de produto. Para avaliações: routes/public/_legacy/publicProdutos.js

const express = require("express");
const router = express.Router();
const controller = require("../../controllers/publicProductsController");

router.get("/", controller.listProducts);

/**
 * @openapi
 * /api/products/search:
 *   get:
 *     tags:
 *       - Produtos
 *     summary: Busca avançada de produtos
 *     description: Busca por termo (nome/descrição) e filtra por categorias, preço e promoções, com paginação.
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Termo de busca aplicado em name e description.
 *         example: fertilizante
 *       - in: query
 *         name: categories
 *         schema:
 *           type: string
 *         description: Lista CSV de IDs de categorias (exemplo 1,2,3).
 *         example: 3
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: integer
 *         description: Alternativa compatível para filtrar por uma categoria.
 *         example: 3
 *       - in: query
 *         name: category
 *         schema:
 *           type: integer
 *         description: Alternativa compatível para filtrar por uma categoria.
 *         example: 3
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Preço mínimo (aplicado sobre final_price).
 *         example: 10
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Preço máximo (aplicado sobre final_price).
 *         example: 200
 *       - in: query
 *         name: promo
 *         schema:
 *           type: boolean
 *         description: Se true, retorna apenas produtos com promoção ativa.
 *         example: true
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, price_asc, price_desc, discount, best_sellers]
 *         description: Ordenação (whitelist).
 *         example: newest
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Página.
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 60
 *           default: 12
 *         description: Itens por página.
 *         example: 12
 *     responses:
 *       200:
 *         description: Lista paginada de produtos
 *       400:
 *         description: Parâmetros inválidos
 *       500:
 *         description: Erro interno
 */
router.get("/search", controller.searchProducts);

// Delega GET /:id ao módulo legado.
// Rota paramétrica registrada após as literais (/ e /search) — sem risco de sombra.
router.use(require("./_legacy/publicProductById"));

module.exports = router;
