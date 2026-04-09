"use strict";
// controllers/contatoAdminController.js
//
// Admin: gestao de mensagens de contato recebidas pelo formulario publico.
// verifyAdmin + validateCSRF aplicados pelo mount() em adminRoutes.js.
//
// Contrato:
//   GET    /             → { ok: true, data: [...], meta: { total, page, limit, pages } }
//   GET    /stats        → { ok: true, data: { nova, lida, respondida, arquivada, total } }
//   GET    /:id          → { ok: true, data: { ... } }
//   PATCH  /:id/status   → { ok: true, message }
//   DELETE /:id          → 204

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/contatoRepository");

const listMensagens = async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;
    const offset = (page - 1) * limit;

    const { rows, total } = await repo.findAll({ status, limit, offset });

    return response.ok(res, rows, null, {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao listar mensagens.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const getStats = async (_req, res, next) => {
  try {
    const rows = await repo.countByStatus();
    const stats = { nova: 0, lida: 0, respondida: 0, arquivada: 0, total: 0 };
    for (const r of rows) {
      stats[r.status] = r.total;
      stats.total += r.total;
    }
    return response.ok(res, stats);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao obter estatisticas.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const getMensagem = async (req, res, next) => {
  try {
    const msg = await repo.findById(req.params.id);
    if (!msg) {
      return next(
        new AppError("Mensagem nao encontrada.", ERROR_CODES.NOT_FOUND, 404)
      );
    }
    return response.ok(res, msg);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao buscar mensagem.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const affected = await repo.updateStatus(req.params.id, req.body.status);
    if (affected === 0) {
      return next(
        new AppError("Mensagem nao encontrada.", ERROR_CODES.NOT_FOUND, 404)
      );
    }
    return response.ok(res, null, "Status atualizado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar status.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const deleteMensagem = async (req, res, next) => {
  try {
    const affected = await repo.deleteById(req.params.id);
    if (affected === 0) {
      return next(
        new AppError("Mensagem nao encontrada.", ERROR_CODES.NOT_FOUND, 404)
      );
    }
    return response.noContent(res);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao remover mensagem.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { listMensagens, getStats, getMensagem, updateStatus, deleteMensagem };
