// controllers/corretoraPanel/notificationsCorretoraController.js
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const notificationsRepo = require("../../repositories/corretoraNotificationsRepository");

async function list(req, res, next) {
  try {
    const data = await notificationsRepo.listForUser({
      corretora_id: req.corretoraUser.corretora_id,
      user_id: req.corretoraUser.id,
      limit: 30,
    });
    response.ok(res, data);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar notificações.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const total = await notificationsRepo.countUnreadForUser({
      corretora_id: req.corretoraUser.corretora_id,
      user_id: req.corretoraUser.id,
    });
    response.ok(res, { total });
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao contar não lidas.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

async function markAsRead(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const ok = await notificationsRepo.markAsRead({
      notification_id: id,
      user_id: req.corretoraUser.id,
      corretora_id: req.corretoraUser.corretora_id,
    });
    if (!ok) {
      throw new AppError(
        "Notificação não encontrada.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }
    response.ok(res, null, "Marcada como lida.");
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao marcar como lida.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

async function markAllAsRead(req, res, next) {
  try {
    await notificationsRepo.markAllAsRead({
      corretora_id: req.corretoraUser.corretora_id,
      user_id: req.corretoraUser.id,
    });
    response.ok(res, null, "Todas marcadas como lidas.");
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao marcar todas.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { list, getUnreadCount, markAsRead, markAllAsRead };
