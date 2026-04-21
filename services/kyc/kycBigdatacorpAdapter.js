// services/kyc/kycBigdatacorpAdapter.js
//
// STUB — integração real com BigDataCorp (RF Receita + QSA) a ser
// plugada quando credenciais (env `BIGDATACORP_ACCESS_TOKEN`
// e `BIGDATACORP_TOKEN_ID`) estiverem disponíveis.
//
// Enquanto `isConfigured()` retornar false, o kycService cai no
// mockAdapter (degradação graciosa). Quando entrar, basta setar
// KYC_PROVIDER=bigdatacorp + as duas envs e a troca é atômica.
//
// Referência da API (pendente de revisão em produção):
//   POST https://plataforma.bigdatacorp.com.br/empresas
//   headers: AccessToken, TokenId, Content-Type: application/json
//   body: { Datasets: "registration_data", q: "doc{CNPJ}" }
//
// Esta stub serve para **documentar o contrato** do shape retornado
// (mesmo que o mockAdapter). Quando ligar de verdade, mapear o
// payload cru da BigDataCorp para esse shape.
"use strict";

const PROVIDER = "bigdatacorp";

function isConfigured() {
  return (
    Boolean(process.env.BIGDATACORP_ACCESS_TOKEN) &&
    Boolean(process.env.BIGDATACORP_TOKEN_ID)
  );
}

/**
 * Shape comum a todos os adapters:
 *
 *   Sucesso → {
 *     ok: true,
 *     provider: "bigdatacorp",
 *     cnpj: "14 dígitos",
 *     razao_social: string,
 *     situacao_cadastral: "ATIVA"|"INATIVA"|"BAIXADA"|"SUSPENSA"|"INAPTA",
 *     qsa: [{ nome, cpf_cnpj, qualificacao, entrada_em }, ...],
 *     endereco: { logradouro, bairro, cidade, uf, cep },
 *     natureza_juridica: string,
 *     risk_score: number 0-100,
 *     raw_response: object  // payload cru do provedor
 *   }
 *
 *   Erro validação → {
 *     ok: false, provider, error_code: "INVALID_FORMAT",
 *     error_message, cnpj
 *   }
 *
 *   Erro externo → throw ou ok:false com error_code="PROVIDER_ERROR"
 */
async function verifyCnpj(_cnpj) {
  throw new Error(
    "BigDataCorp adapter ainda não implementado. " +
      "Setar KYC_PROVIDER=mock até credenciais estarem disponíveis. " +
      "Mapear payload em https://plataforma.bigdatacorp.com.br/empresas",
  );
}

module.exports = {
  PROVIDER,
  isConfigured,
  verifyCnpj,
};
