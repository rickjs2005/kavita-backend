"use strict";
// routes/ecommerce/favorites.js
//
// Rota magra — apenas wiring.
// validateCSRF é aplicado pelo mount() em ecommerceRoutes.js.
// authenticateToken é aplicado aqui (padrão das rotas ecommerce de usuário).

const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authenticateToken");
const { validate } = require("../../middleware/validate");
const {
  addFavoriteSchema,
  productIdParamSchema,
} = require("../../schemas/favoritesSchemas");
const ctrl = require("../../controllers/favoritesController");

// Todas as rotas de favoritos exigem usuário autenticado
router.use(authenticateToken);

/**
 * @openapi
 * tags:
 *   - name: Favoritos
 *     description: Gestão de produtos favoritos do usuário
 */

// GET  /api/favorites
router.get("/", ctrl.listFavorites);

// POST /api/favorites
router.post(
  "/",
  validate(addFavoriteSchema, "body"),
  ctrl.addFavorite
);

// DELETE /api/favorites/:productId
router.delete(
  "/:productId",
  validate(productIdParamSchema, "params"),
  ctrl.removeFavorite
);

module.exports = router;
