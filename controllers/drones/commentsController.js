"use strict";

const dronesService = require("../../services/dronesService");
const AppError = require("../../errors/AppError");
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
    return sendError(res, new AppError("Erro ao listar comentários.", 500, "SERVER_ERROR"));
  }
}

async function approveComment(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", 400, "VALIDATION_ERROR");

    const affected = await dronesService.setCommentApproval(id, true);
    if (!affected) throw new AppError("Comentário não encontrado.", 404, "NOT_FOUND");

    return res.json({ message: "Comentário aprovado.", id });
  } catch (e) {
    console.error("[drones/admin] approveComment error:", e);
    if (e?.code === "STATUS_UNSUPPORTED") {
      return sendError(res, new AppError("STATUS não suportado nesta instância.", 422, "UNPROCESSABLE_ENTITY"));
    }
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao aprovar comentário.", 500, "SERVER_ERROR"));
  }
}

async function rejectComment(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", 400, "VALIDATION_ERROR");

    const affected = await dronesService.setCommentApproval(id, false);
    if (!affected) throw new AppError("Comentário não encontrado.", 404, "NOT_FOUND");

    return res.json({ message: "Comentário reprovado.", id });
  } catch (e) {
    console.error("[drones/admin] rejectComment error:", e);
    if (e?.code === "STATUS_UNSUPPORTED") {
      return sendError(res, new AppError("STATUS não suportado nesta instância.", 422, "UNPROCESSABLE_ENTITY"));
    }
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao reprovar comentário.", 500, "SERVER_ERROR"));
  }
}

async function deleteComment(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", 400, "VALIDATION_ERROR");

    const affected = await dronesService.deleteComment(id);
    if (!affected) throw new AppError("Comentário não encontrado.", 404, "NOT_FOUND");

    return res.json({ message: "Comentário removido.", id });
  } catch (e) {
    console.error("[drones/admin] deleteComment error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao remover comentário.", 500, "SERVER_ERROR"));
  }
}

module.exports = { listComments, approveComment, rejectComment, deleteComment };
