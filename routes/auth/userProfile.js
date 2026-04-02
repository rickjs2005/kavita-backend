"use strict";
// routes/auth/userProfile.js
// ✅ Padrão moderno — rota magra.
// validateCSRF é aplicado no mount em authIndex.js.
//
// Endpoints:
//   GET  /api/users/me          — perfil do usuário logado
//   PUT  /api/users/me          — atualizar perfil do usuário logado
//   GET  /api/users/admin/:id   — perfil de qualquer usuário (admin)
//   PUT  /api/users/admin/:id   — atualizar qualquer usuário (admin)

const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middleware/authenticateToken");
const verifyAdmin = require("../../middleware/verifyAdmin");
const { validate } = require("../../middleware/validate");
const {
  updateProfileBodySchema,
  adminUserParamSchema,
} = require("../../schemas/userProfileSchemas");
const ctrl = require("../../controllers/userProfileController");

// --- Usuário autenticado ---
router.get("/me", authenticateToken, ctrl.getMe);
router.put("/me", authenticateToken, validate(updateProfileBodySchema), ctrl.updateMe);

// --- Admin ---
router.get(
  "/admin/:id",
  verifyAdmin,
  validate(adminUserParamSchema, "params"),
  ctrl.getAdminUser
);
router.put(
  "/admin/:id",
  verifyAdmin,
  validate(adminUserParamSchema, "params"),
  validate(updateProfileBodySchema),
  ctrl.updateAdminUser
);

module.exports = router;
