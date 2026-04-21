// controllers/producer/producerPrivacyController.js
//
// Direitos LGPD do produtor — endpoints autenticados.
// Escopo: req.producer.{id,email} injetado por verifyProducer.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const service = require("../../services/producerPrivacyService");
const logger = require("../../lib/logger");

function _extractMeta(req) {
  return {
    ip: req.ip ?? null,
    user_agent: (req.get("user-agent") || "").slice(0, 500),
    requested_from: "self-service-panel",
  };
}

/**
 * GET /api/produtor/privacidade/meus-dados
 * Retorna snapshot do que o Kavita trata sobre o titular.
 */
async function getMyData(req, res, next) {
  try {
    const data = await service.getMyData(req.producer.id);
    return response.ok(res, data);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar seus dados.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/produtor/privacidade/exportar
 * Download imediato do pacote JSON de dados (art. 18 II + V).
 * Também registra a solicitação em privacy_requests (auditoria).
 */
async function exportMyData(req, res, next) {
  try {
    // Registra a solicitação para fins de auditoria/ANPD.
    await service.createExportRequest({
      producerId: req.producer.id,
      meta: _extractMeta(req),
    });

    const payload = await service.buildExportPayload(req.producer.id);

    // Sanidade — bloqueia vazamento acidental de campos sensíveis.
    // Varre o JSON stringificado atrás de strings proibidas.
    const jsonString = JSON.stringify(payload);
    for (const forbidden of [
      "password_hash",
      "senha_hash",
      "totp_secret",
      "reset_token",
      "cpf_hash",
    ]) {
      if (jsonString.includes(forbidden)) {
        logger.error(
          { producerId: req.producer.id, forbidden },
          "privacy.export.leak_check_failed",
        );
        throw new AppError(
          "Erro ao gerar exportação.",
          ERROR_CODES.SERVER_ERROR,
          500,
        );
      }
    }

    const filename = `kavita-meus-dados-${req.producer.id}-${Date.now()}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    return res.send(jsonString);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao exportar seus dados.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * POST /api/produtor/privacidade/solicitar-exclusao
 * Body opcional: { motivo?: string }
 */
async function requestDeletion(req, res, next) {
  try {
    const motivo = (req.body?.motivo ?? "").toString().trim().slice(0, 500);
    const result = await service.createDeleteRequest({
      producerId: req.producer.id,
      reason: motivo || null,
      meta: _extractMeta(req),
    });
    return response.created(res, result, "Pedido de exclusão registrado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao solicitar exclusão.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * POST /api/produtor/privacidade/cancelar-exclusao
 * Sem body — cancela o pedido ativo do titular autenticado.
 */
async function cancelDeletion(req, res, next) {
  try {
    const result = await service.cancelDeleteRequest({
      producerId: req.producer.id,
    });
    return response.ok(res, result, "Exclusão cancelada.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao cancelar exclusão.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = {
  getMyData,
  exportMyData,
  requestDeletion,
  cancelDeletion,
};
