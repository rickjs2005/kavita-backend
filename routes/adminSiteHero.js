"use strict";

const express = require("express");
const router = express.Router();

const siteHeroController = require("../controllers/siteHeroController");
const mediaService = require("../services/mediaService");
const upload = mediaService.upload;

// GET atual
router.get("/", siteHeroController.getHero);

// PUT atualiza (multipart)
// compat: aceita heroImage OU heroFallbackImage
router.put(
  "/",
  upload.fields([
    { name: "heroVideo", maxCount: 1 },
    { name: "heroImage", maxCount: 1 },
    { name: "heroFallbackImage", maxCount: 1 },
  ]),
  siteHeroController.updateHero
);

module.exports = router;
