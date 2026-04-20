// controllers/admin/adminContratosController.js
//
// Stub administrativo para simular a assinatura do contrato enquanto
// o provedor real (ClickSign) não está ligado. Só funciona quando
// CONTRATO_SIGNER_PROVIDER=stub. Usado para validar UX ponta a ponta
// com corretora real em staging sem queimar token.
//
// O service rejeita a chamada se o provedor estiver em 'clicksign',
// então esse endpoint fica inerte em produção mesmo se exposto.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const contratoService = require("../../services/contratoService");

async function simularAssinatura(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const result = await contratoService.simularAssinatura({
      id,
      actor: { id: req.admin?.id ?? null },
    });

    return response.ok(res, result, "Assinatura simulada com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao simular assinatura.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { simularAssinatura };
