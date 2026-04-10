// routes/admin/adminCorretoras.js
//
// Admin routes for Mercado do Café / Corretoras.
// Protected by verifyAdmin + validateCSRF via mount() in adminRoutes.js.
"use strict";

const express = require("express");
const router = express.Router();

const ctrl = require("../../controllers/corretorasAdminController");
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
  createCorretoraUserSchema,
} = require("../../schemas/corretoraAuthSchemas");

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

// Provisionamento do usuário de login da corretora (Fase 2)
router.post(
  "/corretoras/:id/users",
  validate(createCorretoraUserSchema),
  ctrl.createCorretoraUser
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

module.exports = router;
