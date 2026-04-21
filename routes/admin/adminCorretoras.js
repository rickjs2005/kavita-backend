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
  bulkApproveSubmissionsSchema,
  bulkRejectSubmissionsSchema,
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
router.get("/corretoras/:id/audit-logs", ctrl.getCorretoraAuditLogs);
router.get(
  "/corretoras/:id/subscription-events",
  ctrl.getCorretoraSubscriptionEvents,
);

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

// Impersonação (Sprint 2 P1): admin recebe um corretoraToken curto
// (30 min) com claim de impersonação para acessar o painel em modo
// suporte. Sessão real da corretora não é invalidada.
router.post("/corretoras/:id/impersonate", ctrl.impersonateCorretora);

// Soft delete (Sprint 3): preserva histórico, tira da vitrine e da
// listagem admin padrão. Reversível via restore.
router.post("/corretoras/:id/archive", ctrl.archiveCorretora);
router.post("/corretoras/:id/restore", ctrl.restoreCorretora);
// Cancela a assinatura ativa sem arquivar a corretora (volta pro FREE).
router.post(
  "/corretoras/:id/cancel-subscription",
  ctrl.cancelCorretoraSubscription,
);

// Fase 7 — notas internas admin (privadas, nunca expostas à corretora)
router.get("/corretoras/:id/admin-notes", ctrl.listAdminNotes);
router.post("/corretoras/:id/admin-notes", ctrl.createAdminNote);
router.delete("/corretoras/:id/admin-notes/:noteId", ctrl.deleteAdminNote);

// ETAPA 3.4 — backfill regional: corretoras com perfil incompleto
const backfillCtrl = require("../../controllers/admin/adminRegionalBackfillController");
router.get("/backfill-regional", backfillCtrl.listIncomplete);
router.post("/backfill-regional/invite/:id", backfillCtrl.sendInvite);

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

// Bulk actions (Sprint 3) — aprovação/rejeição em lote. Rotas ficam
// antes do `:id/reject` seria ambíguo, então usamos paths nomeados.
router.post(
  "/submissions/bulk-approve",
  validate(bulkApproveSubmissionsSchema),
  ctrl.bulkApproveSubmissions,
);
router.post(
  "/submissions/bulk-reject",
  validate(bulkRejectSubmissionsSchema),
  ctrl.bulkRejectSubmissions,
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
router.get("/stats/corretora/:id", regionalStats.getCorretoraDossie);
router.get("/stats/corregos-ativos", regionalStats.getCorregosAtivos);

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

// ─── Fase 10.2 — KYC das corretoras ────────────────────────────
// Montado em /corretoras/:id/kyc. O sub-router usa mergeParams
// para receber req.params.id vindo daqui.
router.use("/corretoras/:id/kyc", require("./adminCorretoraKyc"));

module.exports = router;
