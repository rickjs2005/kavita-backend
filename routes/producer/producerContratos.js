// routes/producer/producerContratos.js
//
// Rotas autenticadas de contratos para o painel do produtor (Fase 10.1 PR 4).
// verifyProducer + validateCSRF aplicados via mount em producerRoutes.js.
"use strict";

const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/producer/producerContratosController");

router.get("/", ctrl.list);
router.get("/:id/pdf", ctrl.downloadPdf);

module.exports = router;
