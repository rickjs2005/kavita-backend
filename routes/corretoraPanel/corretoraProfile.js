// routes/corretoraPanel/corretoraProfile.js
//
// Rotas de edição do próprio perfil pela corretora logada.
// verifyCorretora + validateCSRF são aplicados no mount do índice.
"use strict";

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const { requireCapability } = require("../../lib/corretoraPermissions");
const { updateProfileSchema } = require("../../schemas/corretoraAuthSchemas");
const ctrl = require("../../controllers/corretoraPanel/profileCorretoraController");

// GET é livre para qualquer role autenticado (inclusive viewer) — todos
// precisam ver o perfil para contexto. Edição exige profile.edit.
router.get("/", ctrl.getMyProfile);
router.put(
  "/",
  requireCapability("profile.edit"),
  validate(updateProfileSchema),
  ctrl.updateMyProfile,
);

module.exports = router;
