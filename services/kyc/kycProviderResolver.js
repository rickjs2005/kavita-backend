// services/kyc/kycProviderResolver.js
//
// Escolhe o adapter ativo por env `KYC_PROVIDER` (default: mock).
// Se um adapter configurável não tem credenciais (ex.: bigdatacorp
// sem token), cai no mock com aviso no log — evita derrubar ambiente.
"use strict";

const logger = require("../../lib/logger");
const mockAdapter = require("./kycMockAdapter");
const bigdatacorpAdapter = require("./kycBigdatacorpAdapter");

const ADAPTERS = {
  mock: mockAdapter,
  bigdatacorp: bigdatacorpAdapter,
};

function getActiveAdapter() {
  const choice = String(process.env.KYC_PROVIDER || "mock").toLowerCase();
  const adapter = ADAPTERS[choice];

  if (!adapter) {
    logger.warn(
      { choice, fallback: "mock" },
      "kyc.provider.unknown_choice_fallback_mock",
    );
    return mockAdapter;
  }

  if (!adapter.isConfigured()) {
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
