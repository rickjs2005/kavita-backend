// controllers/admin/corretoraKycAdminController.js
//
// Admin executa consulta ao provedor + aprovação/rejeição manual
// do KYC da corretora (Fase 10.2).
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const kycService = require("../../services/corretoraKycService");
const {
  runProviderCheckSchema,
  approveManualSchema,
  rejectSchema,
} = require("../../schemas/corretoraKycSchemas");

function _parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  return id;
}

function _validate(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      "Dados inválidos.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
      {
        fields: parsed.error.issues.map((i) => ({
          field: i.path.join(".") || "body",
          message: i.message,
        })),
      },
    );
  }
  return parsed.data;
}

async function getStatus(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const data = await kycService.getStatus(id);
    return response.ok(res, data);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao ler KYC.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function runCheck(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const { cnpj } = _validate(runProviderCheckSchema, req.body);
    const data = await kycService.runProviderCheck({
      corretoraId: id,
      cnpj,
      adminUserId: req.admin?.id ?? null,
    });
    return response.ok(res, data, "Consulta KYC concluída.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao executar consulta KYC.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

async function approve(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const { notes } = _validate(approveManualSchema, req.body ?? {});
    const data = await kycService.approve({
      corretoraId: id,
      adminUserId: req.admin?.id ?? null,
      manual: false,
      notes,
    });
    return response.ok(res, data, "KYC aprovado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao aprovar.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function approveManual(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const { notes } = _validate(approveManualSchema, req.body ?? {});
    const data = await kycService.approve({
      corretoraId: id,
      adminUserId: req.admin?.id ?? null,
      manual: true,
      notes,
    });
    return response.ok(res, data, "KYC aprovado manualmente.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao aprovar manualmente.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

async function reject(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const { reason } = _validate(rejectSchema, req.body);
    const data = await kycService.reject({
      corretoraId: id,
      adminUserId: req.admin?.id ?? null,
      reason,
    });
    return response.ok(res, data, "KYC rejeitado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao rejeitar.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

module.exports = {
  getStatus,
  runCheck,
  approve,
  approveManual,
  reject,
};
