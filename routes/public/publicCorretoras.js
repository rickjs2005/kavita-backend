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

// Rate-limit para submissão pública de cadastro de corretora.
// Protege contra abuso do upload (logo) e flood de submissions pendentes.
const submitRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => `corretora_submit:${req.ip}`,
});

// Rate-limit específico do status público de lead. Chave composta por
// token + IP: produtor legítimo abre o link do e-mail algumas vezes por
// dia, enquanto polling abusivo é capturado por IP. Evita usar o
// leadsRateLimiter genérico (que conta submits + status no mesmo balde).
const statusRateLimiter = createAdaptiveRateLimiter({
  keyGenerator: (req) => `corretora_lead_status:${req.params.token}:${req.ip}`,
});

// Listagem pública de corretoras ativas
router.get("/", ctrl.listCorretoras);

// Lista de cidades disponíveis (para filtro)
router.get("/cities", ctrl.listCities);

// Submissão pública de cadastro (multipart para logo).
// Rate limit vem ANTES do upload — caso o IP esteja bloqueado, não
// gastamos disco/I/O recebendo o multipart antes de rejeitar.
// Turnstile também vem antes do multer: o frontend envia o token no
// header X-Turnstile-Token, então não precisamos do body parsed para
// validar e evitamos orfanizar o logo em caso de fail-closed.
router.post(
  "/submit",
  submitRateLimiter,
  verifyTurnstile,
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

// Sprint 7 — Status público do lead. Produtor consulta via link
// enviado no e-mail de confirmação. Rate-limit dedicado por
// token+IP — não compartilha balde com submits, e bloqueia polling
// abusivo do mesmo token sem punir o produtor que abre o link
// algumas vezes por dia.
router.get(
  "/leads/:id/status/:token",
  statusRateLimiter,
  leadsCtrl.getLeadStatus,
);

// Detalhe por slug (deve vir depois das rotas nomeadas)
router.get("/:slug", ctrl.getBySlug);

module.exports = router;
