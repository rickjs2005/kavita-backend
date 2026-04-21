// controllers/corretoraPanel/kycStatusController.js
//
// Corretora autenticada consulta o próprio estado KYC — usado pelo
// frontend para decidir se mostra o banner "KYC pendente" e se
// bloqueia o botão "Gerar contrato".
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const kycService = require("../../services/corretoraKycService");

async function getMyKycStatus(req, res, next) {
  try {
    const data = await kycService.getStatus(req.corretoraUser.corretora_id);
    // Retorna projeção mínima — a corretora não precisa ver QSA
    // completo nem notes internos do admin.
    return response.ok(res, {
      kyc_status: data.kyc_status,
      kyc_verified_at: data.kyc_verified_at,
      cnpj: data.snapshot?.cnpj ?? null,
      razao_social: data.snapshot?.razao_social ?? null,
      rejected_reason: data.snapshot?.rejected_reason ?? null,
      can_emit_contracts: data.kyc_status === "verified",
    });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar KYC.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { getMyKycStatus };
