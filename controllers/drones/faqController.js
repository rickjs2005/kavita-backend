"use strict";

const dronesService = require("../../services/dronesService");
const adminAudit = require("../../services/adminAuditService");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const { response } = require("../../lib");
const {
  createFaqSchema,
  updateFaqSchema,
  formatDronesErrors,
} = require("../../schemas/dronesSchemas");

async function listFaqAdmin(req, res, next) {
  try {
    const items = await dronesService.listFaqAdmin();
    return response.ok(res, { items });
  } catch (e) {
    console.error("[drones/admin] listFaqAdmin error:", e);
    return next(
      new AppError("Erro ao listar FAQ.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function createFaq(req, res, next) {
  try {
    const bodyResult = createFaqSchema.safeParse(req.body || {});
    if (!bodyResult.success) {
      throw new AppError("Dados inválidos.", ERROR_CODES.VALIDATION_ERROR, 400, {
        fields: formatDronesErrors(bodyResult.error),
      });
    }
    const id = await dronesService.createFaq(bodyResult.data);
    adminAudit.record({
      req,
      action: "drones.faq.created",
      targetType: "drones_faq",
      targetId: id,
    });
    return response.created(res, { id }, "Item de FAQ criado.");
  } catch (e) {
    console.error("[drones/admin] createFaq error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao criar FAQ.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function updateFaq(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const bodyResult = updateFaqSchema.safeParse(req.body || {});
    if (!bodyResult.success) {
      throw new AppError("Dados inválidos.", ERROR_CODES.VALIDATION_ERROR, 400, {
        fields: formatDronesErrors(bodyResult.error),
      });
    }
    const affected = await dronesService.updateFaq(id, bodyResult.data);
    if (!affected) {
      throw new AppError("FAQ não encontrada.", ERROR_CODES.NOT_FOUND, 404);
    }
    adminAudit.record({
      req,
      action: "drones.faq.updated",
      targetType: "drones_faq",
      targetId: id,
      meta: { changed_fields: Object.keys(bodyResult.data) },
    });
    return response.ok(res, { id }, "FAQ atualizada.");
  } catch (e) {
    console.error("[drones/admin] updateFaq error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao atualizar FAQ.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function deleteFaq(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);

    const affected = await dronesService.deleteFaq(id);
    if (!affected) {
      throw new AppError("FAQ não encontrada.", ERROR_CODES.NOT_FOUND, 404);
    }
    adminAudit.record({
      req,
      action: "drones.faq.deleted",
      targetType: "drones_faq",
      targetId: id,
    });
    return response.ok(res, { id }, "FAQ removida.");
  } catch (e) {
    console.error("[drones/admin] deleteFaq error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao remover FAQ.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function listFaqPublic(req, res, next) {
  try {
    const items = await dronesService.listFaqPublic();
    return response.ok(res, { items });
  } catch (e) {
    console.error("[drones/public] listFaqPublic error:", e);
    return next(
      new AppError("Erro ao carregar FAQ.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

module.exports = {
  listFaqAdmin,
  createFaq,
  updateFaq,
  deleteFaq,
  listFaqPublic,
};
