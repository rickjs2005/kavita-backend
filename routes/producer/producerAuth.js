// routes/producer/producerAuth.js
//
// Rotas públicas de autenticação do produtor (magic link).
// Sem CSRF, mas com rate-limit agressivo (evita abuso de envio
// de email por spam bot).
"use strict";

const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/producerController");
const { validate } = require("../../middleware/validate");
const {
  magicLinkRequestSchema,
  magicLinkConsumeSchema,
} = require("../../schemas/producerSchemas");
const createAdaptiveRateLimiter = require("../../middleware/adaptiveRateLimiter");

const magicRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) =>
    `producer_magic:${req.ip}:${String(req.body?.email || "").toLowerCase()}`,
});

router.post(
  "/magic-link",
  magicRateLimiter,
  validate(magicLinkRequestSchema),
  ctrl.requestMagicLink,
);

router.post(
  "/consume-token",
  validate(magicLinkConsumeSchema),
  ctrl.consumeMagicLink,
);

module.exports = router;
