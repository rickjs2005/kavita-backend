"use strict";
// routes/admin/adminHeroSlides.js

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/heroSlidesController");
const mediaService = require("../../services/mediaService");
const upload = mediaService.upload;

const jsonParser = express.json({ limit: "2mb" });

const uploadFields = upload.fields([
  { name: "heroVideo", maxCount: 1 },
  { name: "heroImage", maxCount: 1 },
  { name: "heroImageFallback", maxCount: 1 },
]);

router.get("/", ctrl.listAdminSlides);
router.get("/:id", ctrl.getSlide);
router.post("/", uploadFields, ctrl.createSlide);
router.put("/:id", uploadFields, ctrl.updateSlide);
router.patch("/:id/toggle", jsonParser, ctrl.toggleSlide);
router.delete("/:id", ctrl.deleteSlide);

module.exports = router;
