// routes/corretoraPanel/corretoraAnalytics.js
"use strict";

const express = require("express");
const router = express.Router();

const { requireCapability } = require("../../lib/corretoraPermissions");
const ctrl = require("../../controllers/corretoraPanel/analyticsCorretoraController");

// Analytics é leitura — libera para qualquer papel com acesso a leads.
// Não gatear por plano de propósito: a visão básica tem que estar
// disponível para a corretora *decidir* se upgrade vale a pena.
// Comparativos agregados mais ricos podem virar advanced_reports no
// futuro sem mudar o shape da rota.
router.get("/", requireCapability("leads.view"), ctrl.getDashboard);

module.exports = router;
