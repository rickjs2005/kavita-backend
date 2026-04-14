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
const { hasCapability: hasPlanCapability, getPlanContext } = require("../../services/planService");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const usersRepo = require("../../repositories/corretoraUsersRepository");
const {
  inviteMemberSchema,
  changeRoleSchema,
} = require("../../schemas/corretoraTeamSchemas");
const ctrl = require("../../controllers/corretoraPanel/teamCorretoraController");

router.get("/", requireCapability("team.view"), ctrl.listTeam);

// Middleware: valida que o número atual + 1 respeita max_users do plano.
async function enforceUserLimit(req, _res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const ctx = await getPlanContext(corretoraId);
    const maxUsers = ctx.capabilities.max_users ?? 1;
    const current = await usersRepo.countByCorretoraId(corretoraId);
    if (current + 1 > maxUsers) {
      return next(
        new AppError(
          `Seu plano (${ctx.plan.name}) permite até ${maxUsers} usuário${maxUsers > 1 ? "s" : ""}. Atualize para convidar mais membros.`,
          ERROR_CODES.FORBIDDEN,
          403,
          { capability: "max_users", current, max: maxUsers },
        ),
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}

router.post(
  "/",
  requireCapability("team.invite"),
  enforceUserLimit,
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
