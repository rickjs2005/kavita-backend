"use strict";
// lib/waLink.js
//
// Helpers para normalização de telefone brasileiro e construção de
// link wa.me. Reusado pelo backend (services/whatsapp) e pode ser
// consumido também por testes ou jobs futuros.
//
// Convenção do projeto:
//   - Telefone armazenado em usuarios.telefone como varchar(20),
//     formato livre (ex: "(33) 9 9999-9999").
//   - Para wa.me precisamos só de dígitos com código do país: 55 + DDD + número.
//   - Se o telefone original já começa com 55, usa como está.
//   - Se não tem 55, prefixamos.

/**
 * Remove tudo que não é dígito e garante prefixo 55 (Brasil).
 * Retorna null se ficar vazio ou claramente inválido.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function normalizePhoneBR(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  // Telefone válido tem entre 10 (fixo+DDD) e 13 (55+DDD+9 dígitos).
  // Tudo fora disso ignoramos para não vazar links quebrados.
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  if (withCountry.length < 12 || withCountry.length > 13) return null;
  return withCountry;
}

/**
 * Constrói URL https://wa.me/{numero}?text={mensagem}.
 * Retorna null se o telefone for inválido ou se a mensagem for vazia.
 *
 * @param {{ telefone: string|null|undefined, mensagem: string }} args
 * @returns {string|null}
 */
function buildWaMeLink({ telefone, mensagem }) {
  const numero = normalizePhoneBR(telefone);
  if (!numero) return null;
  const txt = String(mensagem || "").trim();
  if (!txt) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(txt)}`;
}

module.exports = {
  normalizePhoneBR,
  buildWaMeLink,
};
