"use strict";

// utils/phone.js — wrapper compativel sobre lib/waLink.js.
//
// Razao de existir: o briefing operacional do whatsappService da
// corretora pediu "utils/phone.js" como ponto canonico de
// normalizacao/validacao de telefone E.164 + util de mascaramento
// para logs. lib/waLink.js segue intacto (callers historicos do
// modulo Pedidos / motorista continuam usando-o como antes).
//
// Funcoes:
//   - normalizePhoneBR(raw)   re-export direto de lib/waLink (compat).
//   - toE164(raw)             "5533999991234" (sem '+') ou null.
//                             Hoje retorna o mesmo que normalizePhoneBR
//                             porque o destino Meta espera "5533..."
//                             sem o '+'. Wrapper exposto para o caso
//                             de futuro adapter que exija '+'.
//   - validateBR(raw)         boolean (true se virou E.164 BR valido).
//   - maskPhone(raw)          retorna versao mascarada para log:
//                             "5533*****1234"; null se invalido.

const { normalizePhoneBR } = require("../lib/waLink");

/**
 * @param {string|null|undefined} raw
 * @returns {string|null} E.164 brasileiro sem o "+", ex: "5533999991234".
 */
function toE164(raw) {
  // normalizePhoneBR ja' retorna sem o "+", validando 12-13 digitos
  // com prefixo 55. Aliasing explicito porque o termo "E.164" e' o
  // que aparece no service e no contrato Meta — facilita pesquisar.
  return normalizePhoneBR(raw);
}

/**
 * @param {string|null|undefined} raw
 * @returns {boolean}
 */
function validateBR(raw) {
  return Boolean(normalizePhoneBR(raw));
}

/**
 * Mascaramento para logs estruturados. Nao retorna o numero completo
 * para evitar PII em ferramentas de observabilidade (Sentry, log
 * archive, etc). Mantem o codigo do pais e os ultimos 4 digitos para
 * permitir correlacao operacional (suporte cruzar com cliente)
 * sem expor o numero inteiro.
 *
 * Exemplo:
 *   "(33) 9 9999-1234" -> "5533*****1234"
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function maskPhone(raw) {
  const e164 = normalizePhoneBR(raw);
  if (!e164) return null;
  // Mantem 4 primeiros (55 + DDD) + 4 ultimos.
  const head = e164.slice(0, 4);
  const tail = e164.slice(-4);
  const middle = "*".repeat(Math.max(0, e164.length - head.length - tail.length));
  return `${head}${middle}${tail}`;
}

module.exports = {
  normalizePhoneBR,
  toE164,
  validateBR,
  maskPhone,
};
