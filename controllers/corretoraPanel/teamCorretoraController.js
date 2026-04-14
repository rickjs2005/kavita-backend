// controllers/corretoraPanel/teamCorretoraController.js
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const teamService = require("../../services/corretoraTeamService");

async function listTeam(req, res, next) {
  try {
    const data = await teamService.listTeam(req.corretoraUser.corretora_id);
    response.ok(res, data);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar equipe.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

async function inviteMember(req, res, next) {
  try {
    const data = await teamService.inviteMember({
      corretoraId: req.corretoraUser.corretora_id,
      nome: req.body.nome,
      email: req.body.email,
      role: req.body.role,
      invitedBy: req.corretoraUser.id,
    });
    response.created(res, data, "Convite enviado por e-mail.");
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao convidar membro.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

async function changeRole(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const data = await teamService.changeRole({
      corretoraId: req.corretoraUser.corretora_id,
      userId,
      newRole: req.body.role,
      actorId: req.corretoraUser.id,
    });
    response.ok(res, data, "Perfil atualizado.");
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao alterar perfil.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

async function removeMember(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const data = await teamService.removeMember({
      corretoraId: req.corretoraUser.corretora_id,
      userId,
      actorId: req.corretoraUser.id,
    });
    response.ok(res, data, "Usuário removido.");
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao remover usuário.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { listTeam, inviteMember, changeRole, removeMember };
