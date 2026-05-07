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
const {
  verifyCnpjSchema,
} = require("../../schemas/corretoraKycSchemas");

function _validate(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      "Dados invalidos.",
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

async function getMyKycStatus(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const data = await kycService.getStatus(corretoraId);
    const cnpjStatus = await kycService.getCnpjStatus(corretoraId);

    // Retorna projeção mínima — a corretora não precisa ver QSA
    // completo nem notes internos do admin.
    return response.ok(res, {
      kyc_status: data.kyc_status,
      kyc_verified_at: data.kyc_verified_at,
      cnpj: cnpjStatus?.cnpj ?? data.snapshot?.cnpj ?? null,
      razao_social:
        cnpjStatus?.razao_social ?? data.snapshot?.razao_social ?? null,
      cnpj_verification_status:
        cnpjStatus?.cnpj_verification_status || "not_informed",
      cnpj_verified_at: cnpjStatus?.cnpj_verified_at ?? null,
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

/**
 * Self-service: corretora informa proprio CNPJ. Backend valida +
 * consulta provider + auto-decide (verified se ATIVA, invalid se nao).
 *
 * POST /api/corretora/profile/cnpj/verify
 * Body: { cnpj: "..." }
 */
async function verifyMyCnpj(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const { cnpj } = _validate(verifyCnpjSchema, req.body);
    const data = await kycService.verifyCnpjAndDecide({
      corretoraId,
      cnpj,
      actorType: "corretora_user",
      actorId: req.corretoraUser?.id ?? null,
    });
    return response.ok(res, data, data.message);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao verificar CNPJ.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { getMyKycStatus, verifyMyCnpj };
