"use strict";
// routes/public/publicCep.js — rota magra.
// Proxy publico de consulta de CEP via ViaCEP.
// Montada em /api/public/cep.

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/cepController");

router.get("/:cep", ctrl.lookupCep);

module.exports = router;
