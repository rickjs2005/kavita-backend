"use strict";
// routes/admin/adminMarketingPromocoes.js
// ✅ Padrão moderno — rota magra.
// verifyAdmin + validateCSRF aplicados no mount em adminRoutes.js.

const express = require("express");
const router = express.Router();
const { validate } = require("../../middleware/validate");
const {
  createPromocaoBodySchema,
  updatePromocaoBodySchema,
  promocaoParamSchema,
} = require("../../schemas/promocoesSchemas");
const ctrl = require("../../controllers/promocoesAdminController");

router.get("/", ctrl.list);
router.post("/", validate(createPromocaoBodySchema), ctrl.create);
router.put("/:id", validate(promocaoParamSchema, "params"), validate(updatePromocaoBodySchema), ctrl.update);
router.delete("/:id", validate(promocaoParamSchema, "params"), ctrl.remove);

module.exports = router;
