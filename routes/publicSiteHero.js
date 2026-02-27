"use strict";

const express = require("express");
const router = express.Router();

const siteHeroController = require("../controllers/siteHeroController");

router.get("/", siteHeroController.getHeroPublic);

module.exports = router;
