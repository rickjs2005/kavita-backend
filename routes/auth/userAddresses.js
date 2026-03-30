"use strict";
// routes/auth/userAddresses.js
// ✅ Padrão moderno — rota magra.
// validateCSRF é aplicado no mount em routes/index.js.
//
// authenticateToken é aplicado aqui (não no mount level) porque
// routes/index.js só adiciona validateCSRF para este grupo.
// Ver routes/index.js linha ~113 para contexto do mount.

const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/authenticateToken");
const { validate } = require("../../middleware/validate");
const { AddressBodySchema, AddressParamSchema } = require("../../schemas/userAddressSchemas");
const ctrl = require("../../controllers/userAddressController");

// Todas as rotas exigem usuário autenticado
router.use(authenticateToken);

// GET /api/users/addresses
router.get("/", ctrl.list);

// POST /api/users/addresses
router.post("/", validate(AddressBodySchema), ctrl.create);

// PUT /api/users/addresses/:id
router.put("/:id", validate(AddressParamSchema, "params"), validate(AddressBodySchema), ctrl.update);

// DELETE /api/users/addresses/:id
router.delete("/:id", validate(AddressParamSchema, "params"), ctrl.remove);

module.exports = router;
