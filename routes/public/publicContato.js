"use strict";
// routes/public/publicContato.js
//
// Rota magra — so wiring.
// Endpoint:
//   POST /  → createMensagem

const router = require("express").Router();
const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/contatoController");
const { ContatoBodySchema, ContatoEventSchema } = require("../../schemas/contatoSchemas");

router.post("/", validate(ContatoBodySchema), ctrl.createMensagem);
router.post("/event", validate(ContatoEventSchema), ctrl.trackEvent);
router.get("/metrics", ctrl.getMetrics);

module.exports = router;
