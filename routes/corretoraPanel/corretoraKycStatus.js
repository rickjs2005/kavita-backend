// routes/corretoraPanel/corretoraKycStatus.js
"use strict";

const express = require("express");
const router = express.Router();
const { requireCapability } = require("../../lib/corretoraPermissions");
const ctrl = require("../../controllers/corretoraPanel/kycStatusController");

router.get("/", requireCapability("leads.view"), ctrl.getMyKycStatus);

module.exports = router;
