"use strict";

// routes/admin/adminCorretorasMetrics.js

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/admin/adminCorretorasMetricsController");

router.get("/", ctrl.getMetrics);

module.exports = router;
