"use strict";
// routes/admin/adminSupportConfig.js
//
// Rota magra — so wiring.
// verifyAdmin + validateCSRF ja aplicados pelo mount() em adminRoutes.js.

const router = require("express").Router();
const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/supportConfigController");
const { UpdateSupportConfigSchema } = require("../../schemas/supportConfigSchemas");

router.get("/", ctrl.getConfig);
router.put("/", validate(UpdateSupportConfigSchema), ctrl.updateConfig);

module.exports = router;
