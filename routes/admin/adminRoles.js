"use strict";
// routes/admin/adminRoles.js
// ✅ Padrão moderno — rota magra.
// verifyAdmin é aplicado no mount em routes/index.js.
//
// requirePermission("roles_manage") é aplicado inline em cada rota porque
// é um gate de permissão específico do módulo, não um concern de mount.

const express = require("express");
const router = express.Router();
const requirePermission = require("../../middleware/requirePermission");
const { validate } = require("../../middleware/validate");
const {
  RoleIdParamSchema,
  CreateRoleSchema,
  UpdateRoleSchema,
} = require("../../schemas/rolesSchemas");
const ctrl = require("../../controllers/rolesController");

const perm = requirePermission("roles_manage");

// GET /api/admin/roles
router.get("/", perm, ctrl.list);

// GET /api/admin/roles/:id
router.get("/:id", perm, validate(RoleIdParamSchema, "params"), ctrl.getById);

// POST /api/admin/roles
router.post("/", perm, validate(CreateRoleSchema), ctrl.create);

// PUT /api/admin/roles/:id
router.put(
  "/:id",
  perm,
  validate(RoleIdParamSchema, "params"),
  validate(UpdateRoleSchema),
  ctrl.update
);

// DELETE /api/admin/roles/:id
router.delete("/:id", perm, validate(RoleIdParamSchema, "params"), ctrl.remove);

module.exports = router;
