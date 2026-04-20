// controllers/producer/producerContratosController.js
//
// Endpoints de contratos do painel do produtor (Fase 10.1 - PR 4).
// Escopo: req.producer.email injetado pelo middleware verifyProducer.
"use strict";

const fs = require("fs");
const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const service = require("../../services/producerContratosService");
const logger = require("../../lib/logger");

function _parseIdParam(param) {
  const id = Number(param);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  return id;
}

function _extractVariant(q) {
  const v = String(q?.variant ?? "auto").toLowerCase();
  if (v === "signed" || v === "draft" || v === "auto") return v;
  return "auto";
}

/**
 * GET /api/produtor/contratos
 * Lista contratos em que o produtor autenticado é signatário.
 */
async function list(req, res, next) {
  try {
    const items = await service.listForProducer(req.producer.email);
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
 * GET /api/produtor/contratos/:id/pdf[?variant=signed|draft|auto]
 * Stream do PDF. Escopado pelo email da sessão.
 */
async function downloadPdf(req, res, next) {
  try {
    const id = _parseIdParam(req.params.id);
    const variant = _extractVariant(req.query);
    const { absPath, contrato } = await service.getPdfPathForProducer({
      id,
      producerEmail: req.producer.email,
      variant,
    });

    if (!fs.existsSync(absPath)) {
      logger.error(
        { contratoId: id, absPath, variant },
        "producer.contrato.pdf_missing_on_disk",
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
      `inline; filename="contrato-${contrato.id}${variant === "signed" || (variant === "auto" && contrato.signed_pdf_url) ? "-assinado" : ""}.pdf"`,
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

module.exports = { list, downloadPdf };
