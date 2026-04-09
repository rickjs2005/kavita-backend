"use strict";
// routes/public/publicContato.js
//
// Rota magra — so wiring.
// Endpoint:
//   POST /  → createMensagem

const router = require("express").Router();
const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/contatoController");
const { ContatoBodySchema } = require("../../schemas/contatoSchemas");

router.post("/", validate(ContatoBodySchema), ctrl.createMensagem);

module.exports = router;
