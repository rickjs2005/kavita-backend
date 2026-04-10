// controllers/corretoraPanel/leadsCorretoraController.js
//
// Endpoints do painel para a corretora gerenciar os próprios leads.
// Todas as operações escopam por req.corretoraUser.corretora_id.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const leadsService = require("../../services/corretoraLeadsService");
const { listLeadsQuerySchema } = require("../../schemas/corretoraAuthSchemas");

/**
 * GET /api/corretora/leads
 */
async function listMine(req, res, next) {
  try {
    const parsed = listLeadsQuerySchema.safeParse(req.query);
    const q = parsed.success ? parsed.data : { page: 1, limit: 20 };

    const result = await leadsService.listLeadsForCorretora(
      req.corretoraUser.corretora_id,
      q
    );
    return response.paginated(res, result);
  } catch (err) {
    return next(
      new AppError("Erro ao listar leads.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
}

/**
 * GET /api/corretora/leads/summary
 */
async function getSummary(req, res, next) {
  try {
    const summary = await leadsService.getSummary(
      req.corretoraUser.corretora_id
    );
    return response.ok(res, summary);
  } catch (err) {
    return next(
      new AppError(
        "Erro ao carregar resumo de leads.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }
}

/**
 * PATCH /api/corretora/leads/:id
 * Body validado por validate(updateLeadSchema).
 */
async function updateLead(req, res, next) {
  try {
    const leadId = Number(req.params.id);
    const updated = await leadsService.updateLead(
      leadId,
      req.corretoraUser.corretora_id,
      req.body
    );
    return response.ok(res, updated, "Lead atualizado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao atualizar lead.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
}

module.exports = { listMine, getSummary, updateLead };
