// routes/corretoraPanel/corretoraAccount.js
//
// Rotas de gestão da conta da própria corretora (self-service).
// Hoje cobre apenas encerramento; futuro pode incluir export LGPD,
// transferência de ownership, etc.
"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/corretoraPanel/accountCorretoraController");

router.post("/deactivate", ctrl.deactivateMyAccount);

module.exports = router;
