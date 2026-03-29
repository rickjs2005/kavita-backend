// routes/admin/adminCategorias.js
// ✅ Padrão moderno — rota magra.
// verifyAdmin + validateCSRF são aplicados no mount em routes/index.js.
"use strict";

const express = require("express");
const router = express.Router();
const { validate } = require("../../middleware/validate");
const {
  CategoryIdParamSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  UpdateStatusSchema,
} = require("../../schemas/categoriasSchemas");
const ctrl = require("../../controllers/categoriasController");

/**
 * @openapi
 * tags:
 *   - name: AdminCategorias
 *     description: Gestão de categorias de produto no painel admin
 */

// GET /api/admin/categorias
router.get("/", ctrl.list);

// POST /api/admin/categorias
router.post("/", validate(CreateCategorySchema), ctrl.create);

// PUT /api/admin/categorias/:id
router.put(
  "/:id",
  validate(CategoryIdParamSchema, "params"),
  validate(UpdateCategorySchema),
  ctrl.update
);

// PATCH /api/admin/categorias/:id/status
router.patch(
  "/:id/status",
  validate(CategoryIdParamSchema, "params"),
  validate(UpdateStatusSchema),
  ctrl.updateStatus
);

// DELETE /api/admin/categorias/:id
router.delete(
  "/:id",
  validate(CategoryIdParamSchema, "params"),
  ctrl.remove
);

module.exports = router;
