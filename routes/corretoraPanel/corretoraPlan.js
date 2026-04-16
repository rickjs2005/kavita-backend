// routes/corretoraPanel/corretoraPlan.js
"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/corretoraPanel/planCorretoraController");

router.get("/", ctrl.getMyPlan);
router.get("/available", ctrl.listAvailablePlans);
router.post("/upgrade", ctrl.requestUpgrade);

module.exports = router;
