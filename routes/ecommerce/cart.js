"use strict";

// routes/ecommerce/cart.js
// =============================================================================
// ⚠️  CONTRATO CONGELADO — controller retorna { success: true }, não { ok: true }
// =============================================================================
// Rota magra: middleware + wiring de handlers.
// Lógica de negócio: services/cartService.js
// Handlers:         controllers/cartController.js
//
// O cartController tem contrato congelado por dependência de frontend.
// NÃO copie este padrão. NÃO altere shapes sem coordenar com frontend.
// Ver CLAUDE.md § "Contratos de resposta" e header de cartController.js.
// =============================================================================

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
