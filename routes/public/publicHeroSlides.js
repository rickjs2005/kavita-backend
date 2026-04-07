"use strict";
// routes/public/publicHeroSlides.js

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/heroSlidesController");

router.get("/", ctrl.listPublicSlides);

module.exports = router;
