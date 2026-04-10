// routes/corretoraPanel/corretoraProfile.js
//
// Rotas de edição do próprio perfil pela corretora logada.
// verifyCorretora + validateCSRF são aplicados no mount do índice.
"use strict";

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const { updateProfileSchema } = require("../../schemas/corretoraAuthSchemas");
const ctrl = require("../../controllers/corretoraPanel/profileCorretoraController");

router.get("/", ctrl.getMyProfile);
router.put("/", validate(updateProfileSchema), ctrl.updateMyProfile);

module.exports = router;
