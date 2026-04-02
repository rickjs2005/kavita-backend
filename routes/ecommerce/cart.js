"use strict";
// routes/ecommerce/cart.js
// ✅ Padrão moderno — rota magra.
// authenticateToken aplicado via router.use().
// validateCSRF aplicado no mount em ecommerceRoutes.js.

const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authenticateToken");
const { validate } = require("../../middleware/validate");
const { CartItemBodySchema, CartItemParamSchema } = require("../../schemas/cartSchemas");
const ctrl = require("../../controllers/cartController");

router.use(authenticateToken);

router.get("/", ctrl.getCart);
router.post("/items", validate(CartItemBodySchema), ctrl.addItem);
router.patch("/items", validate(CartItemBodySchema), ctrl.updateItem);
router.delete("/items/:produtoId", validate(CartItemParamSchema, "params"), ctrl.removeItem);
router.delete("/", ctrl.clearCart);

module.exports = router;
