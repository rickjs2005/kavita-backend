"use strict";
// routes/admin/adminPermissions.js — rota magra.
const express = require("express");
const router = express.Router();
const { validate } = require("../../middleware/validate");
const { idParamSchema, createPermissionSchema, updatePermissionSchema } = require("../../schemas/permissionsSchemas");
const ctrl = require("../../controllers/permissionsController");

router.get("/", ctrl.listPermissions);
router.post("/", validate(createPermissionSchema, "body"), ctrl.createPermission);
router.put("/:id", validate(idParamSchema, "params"), validate(updatePermissionSchema, "body"), ctrl.updatePermission);
router.delete("/:id", validate(idParamSchema, "params"), ctrl.deletePermission);

module.exports = router;
