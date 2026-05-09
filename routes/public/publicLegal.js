"use strict";

// routes/public/publicLegal.js
//
// Endpoint público de leitura das versões correntes dos termos legais.
// Sem auth, sem CSRF — é metadata pública (igual ao seria um link estático
// para /termos.html). Cacheável.

const express = require("express");
const router = express.Router();

const { getVersions } = require("../../controllers/publicLegalController");

router.get("/versions", getVersions);

module.exports = router;
