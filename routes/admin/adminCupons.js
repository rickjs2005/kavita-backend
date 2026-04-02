"use strict";
// routes/admin/adminCupons.js
// ✅ Padrão moderno — rota magra.
// verifyAdmin + validateCSRF aplicados no mount em adminRoutes.js.

const express = require("express");
const router = express.Router();
const { validate } = require("../../middleware/validate");
const { cupomBodySchema, cupomParamSchema } = require("../../schemas/cuponsSchemas");
const ctrl = require("../../controllers/cuponsController");

router.get("/", ctrl.list);
router.post("/", validate(cupomBodySchema), ctrl.create);
router.put("/:id", validate(cupomParamSchema, "params"), validate(cupomBodySchema), ctrl.update);
router.delete("/:id", validate(cupomParamSchema, "params"), ctrl.remove);

module.exports = router;
