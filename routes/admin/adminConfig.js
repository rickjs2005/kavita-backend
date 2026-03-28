// routes/admin/adminConfig.js
const express = require("express");
const router = express.Router();
const verifyAdmin = require("../../middleware/verifyAdmin");
const { validate } = require("../../middleware/validate");
const {
  UpdateSettingsSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
} = require("../../schemas/configSchemas");
const ctrl = require("../../controllers/configController");

// GET /api/admin/config
router.get("/", verifyAdmin, ctrl.getSettings);

// PUT /api/admin/config
router.put("/", verifyAdmin, validate(UpdateSettingsSchema), ctrl.updateSettings);

// GET /api/admin/config/categories
router.get("/categories", verifyAdmin, ctrl.listCategories);

// POST /api/admin/config/categories
router.post("/categories", verifyAdmin, validate(CreateCategorySchema), ctrl.createCategory);

// PUT /api/admin/config/categories/:id
router.put(
  "/categories/:id",
  verifyAdmin,
  validate(UpdateCategorySchema),
  ctrl.updateCategory
);

module.exports = router;
