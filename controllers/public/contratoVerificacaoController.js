// controllers/public/contratoVerificacaoController.js
//
// Endpoint público de verificação de autenticidade do contrato
// (Fase 10.1). Acessado via QR Code impresso no rodapé do PDF.
// Retorna projeção segura — NÃO vaza telefone/email/valor fechado.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const contratoService = require("../../services/contratoService");

// UUID v4 canônico: 8-4-4-4-12 hexadecimais, versão 4, variante 8/9/a/b
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/public/verificar-contrato/:token
 */
async function verificar(req, res, next) {
  try {
    const token = String(req.params.token || "").trim();
    if (!UUID_V4_RE.test(token)) {
      throw new AppError(
        "Token inválido.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const payload = await contratoService.getByVerificationToken(token);
    if (!payload) {
      throw new AppError(
        "Contrato não encontrado.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }

    return response.ok(res, payload);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao verificar contrato.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { verificar };
