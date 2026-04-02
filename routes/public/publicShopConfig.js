"use strict";
// routes/public/publicShopConfig.js — rota magra.
const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/shopConfigPublicController");

router.get("/", ctrl.getPublicConfig);

module.exports = router;
