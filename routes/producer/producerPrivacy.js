// routes/producer/producerPrivacy.js
//
// Endpoints LGPD do produtor (Fase 10.3). verifyProducer +
// validateCSRF aplicados no mount parent.
"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/producer/producerPrivacyController");

router.get("/meus-dados", ctrl.getMyData);
router.get("/exportar", ctrl.exportMyData);
router.post("/solicitar-exclusao", ctrl.requestDeletion);
router.post("/cancelar-exclusao", ctrl.cancelDeletion);

module.exports = router;
