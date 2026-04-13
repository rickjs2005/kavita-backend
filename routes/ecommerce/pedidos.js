"use strict";
// routes/ecommerce/pedidos.js
//
// Rota magra — apenas wiring.
// authenticateToken aplicado via router.use().
// validateCSRF aplicado no mount em ecommerceRoutes.js.

const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/authenticateToken");
const ctrl = require("../../controllers/pedidosUserController");

router.use(authenticateToken);

// GET /api/pedidos
router.get("/", ctrl.listPedidos);

// GET /api/pedidos/:id
router.get("/:id", ctrl.getPedidoById);

module.exports = router;
