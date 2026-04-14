// routes/corretoraPanel/corretoraTeam.js
//
// Rotas de gestão de equipe da corretora (Sprint 6A).
// verifyCorretora + validateCSRF aplicados no mount em corretoraPanelRoutes.
// Cada endpoint exige capability específica via requireCapability.
"use strict";

const express = require("express");
const router = express.Router();

const { validate } = require("../../middleware/validate");
const { requireCapability } = require("../../lib/corretoraPermissions");
const {
  inviteMemberSchema,
  changeRoleSchema,
} = require("../../schemas/corretoraTeamSchemas");
const ctrl = require("../../controllers/corretoraPanel/teamCorretoraController");

router.get("/", requireCapability("team.view"), ctrl.listTeam);

router.post(
  "/",
  requireCapability("team.invite"),
  validate(inviteMemberSchema),
  ctrl.inviteMember,
);

router.patch(
  "/:id/role",
  requireCapability("team.change_role"),
  validate(changeRoleSchema),
  ctrl.changeRole,
);

router.delete("/:id", requireCapability("team.remove"), ctrl.removeMember);

module.exports = router;
