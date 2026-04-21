// routes/public/publicPrivacyContact.js
//
// Canal público de privacidade (Fase 10.3). Sem auth, com rate
// limit agressivo (é endpoint de flood potencial). O controller
// valida Zod + repassa ao contatoService, que já persiste em
// mensagens_contato com rate limit por IP (MAX_PER_HOUR=3).
"use strict";

const express = require("express");
const router = express.Router();

// O módulo exporta o factory como default (module.exports = factory).
const createAdaptiveRateLimiter = require("../../middleware/adaptiveRateLimiter");
const ctrl = require("../../controllers/public/publicPrivacyContactController");

const privacyContactLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => `privacy_contact:${req.ip}`,
});

router.post("/", privacyContactLimiter, ctrl.sendPrivacyContact);

module.exports = router;
