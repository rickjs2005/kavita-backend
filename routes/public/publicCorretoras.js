// routes/public/publicCorretoras.js
//
// Public routes for Mercado do Café / Corretoras.
// No auth, no CSRF. Mounted at /api/public/corretoras via publicRoutes.js.
"use strict";

const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/corretorasPublicController");
const leadsCtrl = require("../../controllers/corretorasLeadsPublicController");
const reviewsCtrl = require("../../controllers/corretoraReviewsPublicController");
const mediaService = require("../../services/mediaService");
const upload = mediaService.upload;
const { validate } = require("../../middleware/validate");
const { submitCorretoraSchema } = require("../../schemas/corretorasSchemas");
const { createLeadSchema } = require("../../schemas/corretoraAuthSchemas");
const { createReviewSchema } = require("../../schemas/corretoraReviewsSchemas");
const createAdaptiveRateLimiter = require("../../middleware/adaptiveRateLimiter");
const verifyTurnstile = require("../../middleware/verifyTurnstile");

// Rate-limit por IP para captura de leads — evita spam massivo.
// Usa o schedule default do adaptiveRateLimiter.
const leadsRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => `corretora_lead:${req.ip}`,
});

// Listagem pública de corretoras ativas
router.get("/", ctrl.listCorretoras);

// Lista de cidades disponíveis (para filtro)
router.get("/cities", ctrl.listCities);

// Submissão pública de cadastro (multipart para logo)
router.post(
  "/submit",
  upload.single("logo"),
  validate(submitCorretoraSchema),
  ctrl.submitCorretora
);

// Captura de lead (Fase 2) — rate-limited + Turnstile, sem CSRF (rota pública anônima)
// Ordem: rate-limit (barato) → Turnstile (1 round-trip) → Zod → controller.
router.post(
  "/:slug/leads",
  leadsRateLimiter,
  verifyTurnstile,
  validate(createLeadSchema),
  leadsCtrl.submitLead
);

// ─── Reviews públicas (Sprint 4) ──────────────────────────────────
// Rate-limiter próprio para reviews (previne spam de avaliações).
const reviewsRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => `corretora_review:${req.ip}`,
});

// Listagem pública (só approved) — GET, sem rate-limit.
router.get("/:slug/reviews", reviewsCtrl.listPublicReviews);

// Submissão de nova review — rate-limit + Turnstile + validação.
router.post(
  "/:slug/reviews",
  reviewsRateLimiter,
  verifyTurnstile,
  validate(createReviewSchema),
  reviewsCtrl.submitReview,
);

// Sprint 7 — Confirmação pública de "lote vendido" pelo produtor.
// Rate-limit reusado do leadsRateLimiter (mesma família de risco).
// Token é HMAC, então auth é o próprio path.
router.post(
  "/lote-vendido/:id/:token",
  leadsRateLimiter,
  leadsCtrl.confirmLoteVendido,
);

// Detalhe por slug (deve vir depois das rotas nomeadas)
router.get("/:slug", ctrl.getBySlug);

module.exports = router;
