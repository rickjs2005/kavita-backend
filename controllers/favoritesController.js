"use strict";
// controllers/favoritesController.js
//
// Extrai dados de req, delega ao service, responde com lib/response.js.
// Consumidor: routes/ecommerce/favorites.js

const { response } = require("../lib");
const service = require("../services/favoritesService");

// ---------------------------------------------------------------------------
// GET /api/favorites
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/favorites:
 *   get:
 *     tags: [Favoritos]
 *     summary: Lista produtos favoritos do usuário autenticado
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Lista de produtos favoritos
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro interno
 */
const listFavorites = async (req, res, next) => {
  try {
    const data = await service.listFavorites(req.user.id);
    response.ok(res, data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/favorites
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/favorites:
 *   post:
 *     tags: [Favoritos]
 *     summary: Adiciona produto aos favoritos do usuário
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: integer }
 *     responses:
 *       201:
 *         description: Produto adicionado aos favoritos
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Produto não encontrado
 *       500:
 *         description: Erro interno
 */
const addFavorite = async (req, res, next) => {
  try {
    await service.addFavorite(req.user.id, req.body.productId);
    response.created(res, null);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/favorites/:productId
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/favorites/{productId}:
 *   delete:
 *     tags: [Favoritos]
 *     summary: Remove produto dos favoritos do usuário
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Favorito removido
 *       400:
 *         description: productId inválido
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro interno
 */
const removeFavorite = async (req, res, next) => {
  try {
    await service.removeFavorite(req.user.id, req.params.productId);
    response.noContent(res);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listFavorites,
  addFavorite,
  removeFavorite,
};
