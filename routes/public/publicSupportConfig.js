"use strict";
// routes/public/publicSupportConfig.js

const router = require("express").Router();
const ctrl = require("../../controllers/supportConfigController");

router.get("/", ctrl.getPublicConfig);

module.exports = router;
