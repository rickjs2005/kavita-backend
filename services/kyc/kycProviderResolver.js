// services/kyc/kycProviderResolver.js
//
// Escolhe o adapter ativo por env `KYC_PROVIDER` (default: mock).
//
// Em produção (NODE_ENV=production):
//   - O boot (config/env.js) recusa subir com KYC_PROVIDER=mock ou vazio,
//     então este resolver nunca devolve mock em prod.
//   - Se um adapter pago (ex.: bigdatacorp) estiver escolhido mas não
//     configurado, propagamos um erro em vez de cair no mock — KYC
//     silenciosamente fake é vetor de fraude.
//
// Em dev/test:
//   - Fallback para mock continua, com aviso no log.
"use strict";

const logger = require("../../lib/logger");
const mockAdapter = require("./kycMockAdapter");
const bigdatacorpAdapter = require("./kycBigdatacorpAdapter");

const ADAPTERS = {
  mock: mockAdapter,
  bigdatacorp: bigdatacorpAdapter,
};

function getActiveAdapter() {
  const isProduction = process.env.NODE_ENV === "production";
  const choice = String(process.env.KYC_PROVIDER || "mock").toLowerCase();
  const adapter = ADAPTERS[choice];

  if (!adapter) {
    if (isProduction) {
      throw new Error(
        `kyc.provider.unknown_choice: KYC_PROVIDER='${choice}' não é um adapter conhecido em produção.`,
      );
    }
    logger.warn(
      { choice, fallback: "mock" },
      "kyc.provider.unknown_choice_fallback_mock",
    );
    return mockAdapter;
  }

  if (!adapter.isConfigured()) {
    if (isProduction) {
      throw new Error(
        `kyc.provider.not_configured: KYC_PROVIDER='${choice}' está sem credenciais em produção.`,
      );
    }
    logger.warn(
      { choice, fallback: "mock" },
      "kyc.provider.not_configured_fallback_mock",
    );
    return mockAdapter;
  }

  return adapter;
}

module.exports = {
  getActiveAdapter,
  ADAPTERS, // exposto para testes
};
