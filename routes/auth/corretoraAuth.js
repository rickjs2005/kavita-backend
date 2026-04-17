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
const verifyTurnstile = require("../../middleware/verifyTurnstile");
const createAdaptiveRateLimiter = require("../../middleware/adaptiveRateLimiter");
const {
  corretoraLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../../schemas/corretoraAuthSchemas");
const ctrl = require("../../controllers/corretoraPanel/authCorretoraController");
const resetCtrl = require("../../controllers/corretoraPanel/passwordResetCorretoraController");

const loginRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const email = req.body?.email
      ? String(req.body.email).trim().toLowerCase()
      : "anon";
    return `corretora_login:${req.ip}:${email}`;
  },
});

// Rate limit mais agressivo para forgot-password — evita abuso de
// enumeração e flooding de e-mail transacional.
const forgotRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => {
    const email = req.body?.email
      ? String(req.body.email).trim().toLowerCase()
      : "anon";
    return `corretora_forgot:${req.ip}:${email}`;
  },
});

// Reset-password: chave por IP (o token já é chave primária de segurança).
const resetRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => `corretora_reset:${req.ip}`,
});

// Ordem do middleware em rotas sensíveis: rate-limit (barato) →
// Turnstile (1 round-trip à Cloudflare) → Zod → controller.
// Fail-closed do Turnstile protege contra credential stuffing e
// enumeração em cenários em que o rate-limit por IP não basta
// (rotação de IP, botnets). Em dev sem TURNSTILE_SECRET_KEY, o
// middleware é bypass silencioso.
router.post(
  "/login",
  loginRateLimiter,
  verifyTurnstile,
  validate(corretoraLoginSchema),
  ctrl.login,
);
router.get("/me", verifyCorretora, ctrl.getMe);
router.post("/logout", verifyCorretora, ctrl.logout);
// Sair de impersonação — só responde se a sessão atual é impersonada.
// Não precisa de Turnstile: o cookie já foi validado como legítimo.
router.post(
  "/exit-impersonation",
  verifyCorretora,
  ctrl.exitImpersonation,
);

// Recuperação de senha (Fase 2) — rotas públicas, sem CSRF.
router.post(
  "/forgot-password",
  forgotRateLimiter,
  verifyTurnstile,
  validate(forgotPasswordSchema),
  resetCtrl.forgotPassword,
);
router.post(
  "/reset-password",
  resetRateLimiter,
  verifyTurnstile,
  validate(resetPasswordSchema),
  resetCtrl.resetPassword,
);

module.exports = router;
