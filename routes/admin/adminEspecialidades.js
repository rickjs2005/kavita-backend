"use strict";
// routes/admin/adminEspecialidades.js
//
// Rota magra — apenas wiring.
// verifyAdmin + validateCSRF são aplicados pelo mount() em adminRoutes.js.

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/especialidadesController");

// GET /api/admin/especialidades
router.get("/", ctrl.listEspecialidades);

module.exports = router;
