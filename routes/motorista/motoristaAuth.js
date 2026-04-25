"use strict";
// routes/motorista/motoristaAuth.js
//
// Endpoints publicos de auth do motorista (magic-link + consume + logout).
// Mountado em /api/public/motorista via motoristaRoutes.js. Sem CSRF.

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const ctrl = require("../../controllers/motorista/motoristaAuthController");
const {
  requestMagicLinkSchema,
  consumeMagicLinkSchema,
} = require("../../schemas/motoristasSchemas");

router.post(
  "/magic-link",
  validate(requestMagicLinkSchema),
  ctrl.requestMagicLink,
);
router.post(
  "/consume-token",
  validate(consumeMagicLinkSchema),
  ctrl.consumeMagicLink,
);
router.post("/logout", ctrl.logout);

module.exports = router;
