"use strict";
// routes/admin/adminAdmins.js — rota magra.
const express = require("express");
const router = express.Router();
const { validate } = require("../../middleware/validate");
const { idParamSchema, createAdminSchema, updateAdminSchema } = require("../../schemas/adminAdminsSchemas");
const ctrl = require("../../controllers/adminAdminsController");

router.get("/", ctrl.listAdmins);
router.post("/", validate(createAdminSchema, "body"), ctrl.createAdmin);
router.put("/:id", validate(idParamSchema, "params"), validate(updateAdminSchema, "body"), ctrl.updateAdmin);
router.delete("/:id", validate(idParamSchema, "params"), ctrl.deleteAdmin);

module.exports = router;
