// services/kyc/kycMockAdapter.js
//
// Adapter de KYC determinístico — serve de contrato/interface para
// o corretoraKycService sem depender de provedor pago. Substituível
// por `bigdatacorpAdapter` via env `KYC_PROVIDER=bigdatacorp`.
//
// Regras de simulação (por CNPJ informado):
//   - 14 dígitos zeros (00000000000000) → BAIXADA (rejeita)
//   - termina em "0000" → INATIVA (rejeita)
//   - termina em "9999" → SUSPENSA (rejeita)
//   - dígitos repetidos (111...1, 222...2) → dígitos inválidos
//   - qualquer outro CNPJ válido (14 dígitos) → ATIVA + QSA fake
//
// O mock é EXPLÍCITO: sem pretender emular a API real, devolve
// dados que o UI consegue renderizar e o service sabe interpretar.
"use strict";

const PROVIDER = "mock";

function _onlyDigits(str) {
  return String(str ?? "").replace(/\D/g, "");
}

function _isValidCnpjFormat(cnpj) {
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false; // 14 iguais
  return true;
}

function isConfigured() {
  return true; // mock sempre disponível
}

/**
 * Consulta simulada de CNPJ. Retorna shape comum a todos os
 * adapters (ver kycBigdatacorpAdapter.js para docs do shape).
 */
async function verifyCnpj(cnpj) {
  const normalized = _onlyDigits(cnpj);

  if (!_isValidCnpjFormat(normalized)) {
    return {
      ok: false,
      provider: PROVIDER,
      error_code: "INVALID_FORMAT",
      error_message: "CNPJ deve ter 14 dígitos válidos.",
      cnpj: normalized,
      raw_response: null,
    };
  }

  let situacao = "ATIVA";
  if (normalized === "00000000000000") {
    situacao = "BAIXADA";
  } else if (normalized.endsWith("0000")) {
    situacao = "INATIVA";
  } else if (normalized.endsWith("9999")) {
    situacao = "SUSPENSA";
  }

  const razaoSocial = `MOCK — Corretora Teste ${normalized.slice(-4)} LTDA`;
  const qsa = [
    {
      nome: "José da Silva (Mock)",
      cpf_cnpj: "***.***.***-00",
      qualificacao: "Administrador",
      entrada_em: "2020-01-15",
    },
    {
      nome: "Maria Souza (Mock)",
      cpf_cnpj: "***.***.***-11",
      qualificacao: "Sócio",
      entrada_em: "2020-01-15",
    },
  ];

  const riskScore = situacao === "ATIVA" ? 15 : 85;

  const rawResponse = {
    source: "kycMockAdapter",
    cnpj: normalized,
    situacao,
    razao_social: razaoSocial,
    qsa,
    endereco: {
      logradouro: "Rua Mock, 123",
      bairro: "Centro",
      cidade: "Manhuaçu",
      uf: "MG",
      cep: "36900-000",
    },
    natureza_juridica: "206-2 — Sociedade Empresária Limitada",
    generated_at: new Date().toISOString(),
  };

  return {
    ok: true,
    provider: PROVIDER,
    cnpj: normalized,
    razao_social: razaoSocial,
    situacao_cadastral: situacao,
    qsa,
    endereco: rawResponse.endereco,
    natureza_juridica: rawResponse.natureza_juridica,
    risk_score: riskScore,
    raw_response: rawResponse,
  };
}

module.exports = {
  PROVIDER,
  isConfigured,
  verifyCnpj,
  // expostos para teste
  _internals: { _onlyDigits, _isValidCnpjFormat },
};
