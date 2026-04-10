// routes/auth/corretoraAuth.js
//
// Rotas de autenticação da corretora (Mercado do Café Fase 2).
// Montadas em /api/corretora via authIndex.js.
//
// /login      → público, com rate-limit por IP+email
// /me         → exige verifyCorretora
// /logout     → exige verifyCorretora
"use strict";

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const verifyCorretora = require("../../middleware/verifyCorretora");
const createAdaptiveRateLimiter = require("../../middleware/adaptiveRateLimiter");
const { corretoraLoginSchema } = require("../../schemas/corretoraAuthSchemas");
const ctrl = require("../../controllers/corretoraPanel/authCorretoraController");

const loginRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const email = req.body?.email
      ? String(req.body.email).trim().toLowerCase()
      : "anon";
    return `corretora_login:${req.ip}:${email}`;
  },
});

router.post("/login", loginRateLimiter, validate(corretoraLoginSchema), ctrl.login);
router.get("/me", verifyCorretora, ctrl.getMe);
router.post("/logout", verifyCorretora, ctrl.logout);

module.exports = router;
