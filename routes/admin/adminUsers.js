"use strict";
// routes/admin/adminUsers.js
//
// Rota magra — apenas wiring.
// verifyAdmin + validateCSRF + requirePermission("usuarios.ver") pelo mount() em adminRoutes.js.

const express = require("express");
const router = express.Router();
const { validate } = require("../../middleware/validate");
const { idParamSchema, blockUserSchema } = require("../../schemas/adminUsersSchemas");
const ctrl = require("../../controllers/adminUsersController");

// GET /api/admin/users
router.get("/", ctrl.listUsers);

// PUT /api/admin/users/:id/block
router.put(
  "/:id/block",
  validate(idParamSchema, "params"),
  validate(blockUserSchema, "body"),
  ctrl.blockUser
);

// DELETE /api/admin/users/:id
router.delete(
  "/:id",
  validate(idParamSchema, "params"),
  ctrl.deleteUser
);

module.exports = router;
