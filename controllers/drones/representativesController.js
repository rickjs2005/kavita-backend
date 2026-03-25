"use strict";

const dronesService = require("../../services/dronesService");
const AppError = require("../../errors/AppError");
const { sendError } = require("./helpers");
const {
  createRepresentativeBodySchema,
  updateRepresentativeBodySchema,
  formatDronesErrors,
} = require("../../schemas/dronesSchemas");

async function listRepresentatives(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const busca = req.query.busca ? String(req.query.busca).trim() : undefined;
    const includeInactive = String(req.query.includeInactive || "0") === "1";

    const result = await dronesService.listRepresentativesAdmin({ page, limit, busca, includeInactive });
    return res.json(result);
  } catch (e) {
    console.error("[drones/admin] listRepresentatives error:", e);
    return sendError(res, new AppError("Erro ao listar representantes.", 500, "SERVER_ERROR"));
  }
}

async function createRepresentative(req, res) {
  try {
    const bodyResult = createRepresentativeBodySchema.safeParse(req.body || {});
    if (!bodyResult.success) {
      throw new AppError("Dados inválidos.", 400, "VALIDATION_ERROR", { fields: formatDronesErrors(bodyResult.error) });
    }

    const id = await dronesService.createRepresentative(bodyResult.data);

    return res.status(201).json({ message: "Representante criado.", id });
  } catch (e) {
    console.error("[drones/admin] createRepresentative error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao criar representante.", 500, "SERVER_ERROR"));
  }
}

async function updateRepresentative(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", 400, "VALIDATION_ERROR");

    const bodyResult = updateRepresentativeBodySchema.safeParse(req.body || {});
    if (!bodyResult.success) {
      throw new AppError("Dados inválidos.", 400, "VALIDATION_ERROR", { fields: formatDronesErrors(bodyResult.error) });
    }

    const affected = await dronesService.updateRepresentative(id, bodyResult.data);
    if (!affected) throw new AppError("Representante não encontrado.", 404, "NOT_FOUND");

    return res.json({ message: "Representante atualizado.", id });
  } catch (e) {
    console.error("[drones/admin] updateRepresentative error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao atualizar representante.", 500, "SERVER_ERROR"));
  }
}

async function deleteRepresentative(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", 400, "VALIDATION_ERROR");

    const affected = await dronesService.deleteRepresentative(id);
    if (!affected) throw new AppError("Representante não encontrado.", 404, "NOT_FOUND");

    return res.json({ message: "Representante removido.", id });
  } catch (e) {
    console.error("[drones/admin] deleteRepresentative error:", e);
    return sendError(res, e instanceof AppError ? e : new AppError("Erro ao remover representante.", 500, "SERVER_ERROR"));
  }
}

module.exports = {
  listRepresentatives,
  createRepresentative,
  updateRepresentative,
  deleteRepresentative,
};
