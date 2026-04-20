// controllers/corretoraPanel/contratosCorretoraController.js
//
// Endpoints do painel da corretora para ciclo de vida do contrato
// (Fase 10.1). Escopo: req.corretoraUser.corretora_id em tudo.
"use strict";

const fs = require("fs");
const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const contratoService = require("../../services/contratoService");
const {
  createContratoBaseSchema,
  cancelContratoSchema,
} = require("../../schemas/contratoSchemas");
const logger = require("../../lib/logger");

function _parseIdParam(param) {
  const id = Number(param);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  return id;
}

/**
 * POST /api/corretora/contratos
 * Body: { lead_id, tipo, data_fields }
 */
async function createContrato(req, res, next) {
  try {
    const parsed = createContratoBaseSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      }));
      throw new AppError(
        "Dados inválidos.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
        { fields },
      );
    }

    const { lead_id, tipo, data_fields } = parsed.data;

    const result = await contratoService.gerarContrato({
      leadId: lead_id,
      corretoraId: req.corretoraUser.corretora_id,
      tipo,
      dataFields: data_fields,
      createdByUserId: req.corretoraUser.id,
    });

    return response.created(res, result, "Contrato gerado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao gerar contrato.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * POST /api/corretora/contratos/:id/enviar
 */
async function enviarContrato(req, res, next) {
  try {
    const id = _parseIdParam(req.params.id);
    const result = await contratoService.enviarParaAssinatura({
      id,
      corretoraId: req.corretoraUser.corretora_id,
      actor: { userId: req.corretoraUser.id },
    });
    return response.ok(res, result, "Contrato enviado para assinatura.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao enviar contrato.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * POST /api/corretora/contratos/:id/cancelar
 */
async function cancelarContrato(req, res, next) {
  try {
    const id = _parseIdParam(req.params.id);
    const parsed = cancelContratoSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      }));
      throw new AppError(
        "Dados inválidos.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
        { fields },
      );
    }

    const result = await contratoService.cancelar({
      id,
      corretoraId: req.corretoraUser.corretora_id,
      motivo: parsed.data.motivo,
      actor: { userId: req.corretoraUser.id },
    });
    return response.ok(res, result, "Contrato cancelado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao cancelar contrato.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/corretora/contratos?lead_id=123
 */
async function listContratosPorLead(req, res, next) {
  try {
    const leadId = Number(req.query.lead_id);
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new AppError(
        "Parâmetro lead_id inválido.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const items = await contratoService.listByLead({
      leadId,
      corretoraId: req.corretoraUser.corretora_id,
    });
    return response.ok(res, { items });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar contratos.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/corretora/contratos/:id/pdf
 * Stream do PDF. Escopado pela corretora.
 */
async function baixarPdf(req, res, next) {
  try {
    const id = _parseIdParam(req.params.id);
    const { absPath, contrato } = await contratoService.getPdfPathForCorretora({
      id,
      corretoraId: req.corretoraUser.corretora_id,
    });

    // Sanidade: PDF foi gerado no draft; em casos extremos (disco corrompido,
    // migração mal feita) pode sumir. Erramos explícito em vez de 404 genérico.
    if (!fs.existsSync(absPath)) {
      logger.error(
        { contratoId: id, absPath },
        "contrato.pdf_missing_on_disk",
      );
      throw new AppError(
        "Arquivo do contrato indisponível.",
        ERROR_CODES.SERVER_ERROR,
        500,
      );
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="contrato-${contrato.id}.pdf"`,
    );
    return fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao baixar contrato.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = {
  createContrato,
  enviarContrato,
  cancelarContrato,
  listContratosPorLead,
  baixarPdf,
};
