"use strict";
// controllers/solicitacoesController.js
//
// Admin: solicitações de serviço.
// verifyAdmin + validateCSRF aplicados pelo mount() em adminRoutes.js.

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/solicitacoesRepository");

const listSolicitacoes = async (_req, res, next) => {
  try {
    const rows = await repo.findAll();
    return response.ok(res, rows);
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao listar solicitações.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const id = req.params.id; // coerced by Zod idParamSchema
    const { status } = req.body; // validated by Zod updateStatusSchema

    const affected = await repo.updateStatus(id, status);
    if (affected === 0) {
      return next(new AppError("Solicitação não encontrada.", ERROR_CODES.NOT_FOUND, 404));
    }

    if (status === "concluido") {
      await repo.incrementColaboradorServicos(id);
    }

    return response.ok(res, null, "Status atualizado com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao atualizar status.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { listSolicitacoes, updateStatus };
