"use strict";
// routes/admin/adminLogs.js — rota magra.
const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/logsController");

router.get("/", ctrl.listLogs);
router.get("/:id", ctrl.getLogById);

module.exports = router;
