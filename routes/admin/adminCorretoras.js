// routes/admin/adminCorretoras.js
//
// Admin routes for Mercado do Café / Corretoras.
// Protected by verifyAdmin + validateCSRF via mount() in adminRoutes.js.
"use strict";

const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/corretorasAdminController");
const regionalStats = require("../../controllers/corretoraRegionalStatsController");
const reviewsAdmin = require("../../controllers/corretoraReviewsAdminController");
const mediaService = require("../../services/mediaService");
const upload = mediaService.upload;
const { validate } = require("../../middleware/validate");
const {
  createCorretoraSchema,
  updateCorretoraSchema,
  statusSchema,
  featuredSchema,
  rejectSubmissionSchema,
} = require("../../schemas/corretorasSchemas");
const {
  inviteCorretoraUserSchema,
} = require("../../schemas/corretoraAuthSchemas");
const {
  moderateReviewSchema,
  listReviewsAdminQuerySchema,
} = require("../../schemas/corretoraReviewsSchemas");

// ─── Corretoras CRUD ────────────────────────────────────────────────────────

router.get("/", ctrl.listCorretoras);
router.get("/corretoras/:id", ctrl.getById);

router.post(
  "/corretoras",
  upload.single("logo"),
  validate(createCorretoraSchema),
  ctrl.createCorretora
);

router.put(
  "/corretoras/:id",
  upload.single("logo"),
  validate(updateCorretoraSchema),
  ctrl.updateCorretora
);

router.patch(
  "/corretoras/:id/status",
  validate(statusSchema),
  ctrl.toggleStatus
);

router.patch(
  "/corretoras/:id/featured",
  validate(featuredSchema),
  ctrl.toggleFeatured
);

// Convite de primeiro acesso da corretora (Fase 2 / Bloco A).
// Cria o usuário em estado pendente (password_hash NULL) e envia
// e-mail com link de primeiro acesso. Idempotente: reenviar para uma
// corretora com convite pendente apenas gera um novo token e reenvia.
router.post(
  "/corretoras/:id/users/invite",
  validate(inviteCorretoraUserSchema),
  ctrl.inviteCorretoraUser
);

// ─── Submissions ────────────────────────────────────────────────────────────

router.get("/submissions", ctrl.listSubmissions);
router.get("/submissions/pending-count", ctrl.getPendingCount);
router.get("/submissions/:id", ctrl.getSubmissionById);

router.post("/submissions/:id/approve", ctrl.approveSubmission);

router.post(
  "/submissions/:id/reject",
  validate(rejectSubmissionSchema),
  ctrl.rejectSubmission
);

// ─── Dashboard regional (Sprint 3) ──────────────────────────────────────────
// Read-only aggregates. Admin pode monitorar SLA, ranking e saúde
// operacional do módulo na Zona da Mata.
router.get("/stats/regional", regionalStats.getRegionalKpis);
router.get("/stats/leads-por-cidade", regionalStats.getLeadsPorCidade);
router.get(
  "/stats/corretoras-performance",
  regionalStats.getCorretorasPerformance,
);
router.get("/stats/leads-pendurados", regionalStats.getLeadsPendurados);
router.get("/stats/cidade/:cidade", regionalStats.getCidadeSnapshot);

// ─── Reviews — moderação (Sprint 4) ─────────────────────────────────────────
router.get("/reviews/pending-count", reviewsAdmin.getPendingCount);
router.get(
  "/reviews",
  validate(listReviewsAdminQuerySchema, "query"),
  reviewsAdmin.listReviews,
);
router.post(
  "/reviews/:id/moderate",
  validate(moderateReviewSchema),
  reviewsAdmin.moderateReview,
);

module.exports = router;
