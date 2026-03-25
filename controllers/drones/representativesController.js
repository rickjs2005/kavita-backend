"use strict";

const dronesService = require("../../services/dronesService");
const AppError = require("../../errors/AppError");
const { sendError } = require("./helpers");

function normalizePhoneDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function validateRepresentativePayload(body = {}) {
  const errors = [];

  if (!body.name || !String(body.name).trim()) {
    errors.push({ field: "name", reason: "obrigatório" });
  }

  const digits = normalizePhoneDigits(body.whatsapp || "");
  if (!digits) {
    errors.push({ field: "whatsapp", reason: "obrigatório" });
  } else if (digits.length < 10 || digits.length > 13) {
    errors.push({ field: "whatsapp", reason: "deve ter 10-13 dígitos" });
  }

  if (!body.cnpj || !String(body.cnpj).trim()) {
    errors.push({ field: "cnpj", reason: "obrigatório" });
  }

  return { valid: errors.length === 0, errors };
}

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
    const body = req.body || {};
    const { valid, errors } = validateRepresentativePayload(body);

    if (!valid) {
      throw new AppError("Dados inválidos.", 400, "VALIDATION_ERROR", { fields: errors });
    }

    const id = await dronesService.createRepresentative({
      ...body,
      whatsapp: normalizePhoneDigits(body.whatsapp || ""),
    });

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

    const body = req.body || {};
    const patch = { ...body };

    if (patch.whatsapp !== undefined) {
      patch.whatsapp = normalizePhoneDigits(patch.whatsapp || "");
    }

    const affected = await dronesService.updateRepresentative(id, patch);
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
