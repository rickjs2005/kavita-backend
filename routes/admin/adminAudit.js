// routes/admin/adminAudit.js
"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/admin/adminAuditController");

router.get("/", ctrl.listAudit);

module.exports = router;
