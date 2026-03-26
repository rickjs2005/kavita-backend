"use strict";

const dronesService = require("../../services/dronesService");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const { sendError } = require("./helpers");

async function listComments(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const status = req.query.status ? String(req.query.status).trim().toUpperCase() : undefined;
    const model_key = req.query.model_key ? String(req.query.model_key).trim() : undefined;

    const result = await dronesService.listCommentsAdmin({ page, limit, status, model_key });
    return res.json(result);
  } catch (e) {
    console.error("[drones/admin] listComments error:", e);
    return sendError(res, new AppError("Erro ao listar comentários.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function approveComment(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const affected = await dronesService.setCommentApproval(id, true);
    if (!affected) throw new AppError("Comentário não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    return res.json({ message: "Comentário aprovado.", id });
  } catch (e) {
    console.error("[drones/admin] approveComment error:", e);
    if (e?.code === "STATUS_UNSUPPORTED") {
      return sendError(res, new AppError("STATUS não suportado nesta instância.", "UNPROCESSABLE_ENTITY", 422));
    }
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao aprovar comentário.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function rejectComment(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const affected = await dronesService.setCommentApproval(id, false);
    if (!affected) throw new AppError("Comentário não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    return res.json({ message: "Comentário reprovado.", id });
  } catch (e) {
    console.error("[drones/admin] rejectComment error:", e);
    if (e?.code === "STATUS_UNSUPPORTED") {
      return sendError(res, new AppError("STATUS não suportado nesta instância.", "UNPROCESSABLE_ENTITY", 422));
    }
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao reprovar comentário.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function deleteComment(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const affected = await dronesService.deleteComment(id);
    if (!affected) throw new AppError("Comentário não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    return res.json({ message: "Comentário removido.", id });
  } catch (e) {
    console.error("[drones/admin] deleteComment error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao remover comentário.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

module.exports = { listComments, approveComment, rejectComment, deleteComment };
