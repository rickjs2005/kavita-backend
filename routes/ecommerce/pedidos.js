"use strict";
// routes/ecommerce/pedidos.js
//
// Rota magra — apenas wiring.
// authenticateToken + validateCSRF aplicados pelo ecommerceRoutes.js.

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/pedidosUserController");

// GET /api/pedidos
router.get("/", ctrl.listPedidos);

// GET /api/pedidos/:id
router.get("/:id", ctrl.getPedidoById);

module.exports = router;
