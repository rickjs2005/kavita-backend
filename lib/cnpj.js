"use strict";

// Helpers de validacao e formatacao de CNPJ.
//
// Regras canonicas do CNPJ brasileiro:
//   - 14 digitos
//   - 12 digitos base + 2 digitos verificadores (DV1, DV2)
//   - DV1 e DV2 calculados via algoritmo modulo 11 com pesos
//     decrescentes (5,4,3,2,9,8,7,6,5,4,3,2 para DV1)
//
// Aplicacao: corretoras informam CNPJ via formulario; backend
// valida ANTES de chamar o provedor de KYC pra economizar request
// e devolver erro humano imediato.

/** Remove tudo que nao for digito. "12.345.678/0001-90" -> "12345678000190". */
function normalizeCnpj(input) {
  if (input == null) return null;
  return String(input).replace(/\D/g, "");
}

/**
 * Valida CNPJ via algoritmo dos digitos verificadores.
 *
 * Aceita string normalizada (so digitos) ou formatada com mascara.
 * Rejeita:
 *   - tamanho diferente de 14 digitos
 *   - sequencias unicas (00000000000000, 11111111111111, etc) que
 *     passam no calculo dos DV mas sao oficialmente invalidas
 *   - DV1 ou DV2 incorretos
 */
function isValidCnpj(input) {
  const cnpj = normalizeCnpj(input);
  if (!cnpj || cnpj.length !== 14) return false;
  // Sequencias repetidas sao validas pelo calculo mas a Receita
  // rejeita. Ex: "11111111111111" passa no DV mas nao e' CNPJ real.
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const calcDv = (base, weights) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * weights[i];
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const base = cnpj.slice(0, 12);
  const dv1 = calcDv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = calcDv(base + dv1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return cnpj === base + String(dv1) + String(dv2);
}

/** Formata para exibicao: "12345678000190" -> "12.345.678/0001-90". */
function formatCnpj(input) {
  const cnpj = normalizeCnpj(input);
  if (!cnpj || cnpj.length !== 14) return null;
  return cnpj.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

/**
 * Mascara CNPJ pra log/audit — preserva so primeiros 4 + ultimos 2
 * digitos. "12345678000190" -> "1234********90".
 *
 * Uso: logs estruturados nao podem vazar CNPJ inteiro (ainda que
 * publico, e' boa pratica masking em telemetria por defesa em
 * profundidade).
 */
function maskCnpj(input) {
  const cnpj = normalizeCnpj(input);
  if (!cnpj || cnpj.length !== 14) return null;
  return cnpj.slice(0, 4) + "********" + cnpj.slice(12);
}

module.exports = {
  normalizeCnpj,
  isValidCnpj,
  formatCnpj,
  maskCnpj,
};
