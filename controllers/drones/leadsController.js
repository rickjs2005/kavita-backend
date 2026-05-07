"use strict";

const dronesService = require("../../services/dronesService");
const adminAudit = require("../../services/adminAuditService");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const { response } = require("../../lib");
const {
  updateLeadAdminSchema,
  formatDronesErrors,
} = require("../../schemas/dronesSchemas");

async function listLeads(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const status = req.query.status ? String(req.query.status).trim() : undefined;
    const modelo_interesse = req.query.modelo_interesse
      ? String(req.query.modelo_interesse).trim()
      : undefined;
    const busca = req.query.busca ? String(req.query.busca).trim() : undefined;

    const result = await dronesService.listLeadsAdmin({
      page,
      limit,
      status,
      modelo_interesse,
      busca,
    });
    return response.ok(res, result);
  } catch (e) {
    console.error("[drones/admin] listLeads error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao listar leads.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function getLead(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const lead = await dronesService.getLeadById(id);
    if (!lead) throw new AppError("Lead não encontrado.", ERROR_CODES.NOT_FOUND, 404);

    return response.ok(res, lead);
  } catch (e) {
    console.error("[drones/admin] getLead error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao buscar lead.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function updateLead(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const bodyResult = updateLeadAdminSchema.safeParse(req.body || {});
    if (!bodyResult.success) {
      throw new AppError("Dados inválidos.", ERROR_CODES.VALIDATION_ERROR, 400, {
        fields: formatDronesErrors(bodyResult.error),
      });
    }

    const affected = await dronesService.updateLead(id, bodyResult.data);
    if (!affected) {
      throw new AppError("Lead não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    adminAudit.record({
      req,
      action: "drones.lead.updated",
      targetType: "drones_lead",
      targetId: id,
      meta: { changed_fields: Object.keys(bodyResult.data) },
    });

    return response.ok(res, { id }, "Lead atualizado.");
  } catch (e) {
    console.error("[drones/admin] updateLead error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao atualizar lead.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function deleteLead(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const affected = await dronesService.deleteLead(id);
    if (!affected) {
      throw new AppError("Lead não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    adminAudit.record({
      req,
      action: "drones.lead.deleted",
      targetType: "drones_lead",
      targetId: id,
    });

    return response.ok(res, { id }, "Lead removido.");
  } catch (e) {
    console.error("[drones/admin] deleteLead error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao remover lead.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

module.exports = { listLeads, getLead, updateLead, deleteLead };
