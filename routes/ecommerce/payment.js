// routes/ecommerce/payment.js
// =============================================================================
// MOUNT HÍBRIDO — rotas admin de payment-methods estão aqui (não em adminRoutes)
// =============================================================================
// Esta rota é moderna e magra (puro wiring), mas monta TANTO endpoints públicos/
// user quanto endpoints admin (/admin/payment-methods) no mesmo arquivo.
// Motivo: o webhook do Mercado Pago e /methods não usam cookie de sessão,
// então auth e CSRF são aplicados por rota, não pelo mount() global de adminRoutes.
//
// O controller (paymentController.js) tem CONTRATOS CONGELADOS — ver header dele.
// NÃO copie os shapes de resposta ({ methods }, { method }) em código novo.
//
// Lógica de negócio: services/paymentService.js, services/paymentWebhookService.js
// Handlers:         controllers/paymentController.js
// =============================================================================
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
