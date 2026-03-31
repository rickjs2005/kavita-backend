// routes/ecommerce/payment.js
//
// Rota magra: middleware + wiring de handlers.
// Lógica de negócio: services/paymentService.js, services/paymentWebhookService.js
// Handlers:         controllers/paymentController.js
// Documentação:     docs/swagger/payment.js
//
// Nota: autenticação e CSRF são aplicados por rota (não globalmente), porque
// /webhook não usa cookie de sessão e /methods é público.
"use strict";

const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authenticateToken");
const verifyAdmin = require("../../middleware/verifyAdmin");
const validateMPSignature = require("../../middleware/validateMPSignature");
const { validateCSRF } = require("../../middleware/csrfProtection");

const ctrl = require("../../controllers/paymentController");

// PUBLIC
router.get("/methods", ctrl.listMethods);

// ADMIN — CRUD de métodos de pagamento
router.get("/admin/payment-methods", authenticateToken, verifyAdmin, ctrl.adminListMethods);
router.post("/admin/payment-methods", authenticateToken, verifyAdmin, ctrl.adminCreateMethod);
router.put("/admin/payment-methods/:id", authenticateToken, verifyAdmin, ctrl.adminUpdateMethod);
router.delete("/admin/payment-methods/:id", authenticateToken, verifyAdmin, ctrl.adminDeleteMethod);

// MERCADO PAGO
router.post("/start", authenticateToken, validateCSRF, ctrl.startPayment);
router.post("/webhook", validateMPSignature, ctrl.handleWebhook);

module.exports = router;
