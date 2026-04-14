// lib/phoneNormalize.js
//
// Normalização BR de telefone para uso como CHAVE de broadcast de
// lote vendido. Aceita formatos comuns:
//   "(33) 99999-9999", "+55 33 99999-9999", "33999999999"
// Retorna sempre prefixo 55 + dígitos.
//
// Importante: normalização é AGRESSIVA (só dígitos). Se o produtor
// digitar telefone errado em corretoras diferentes, broadcast não
// vai pegar — fricção aceitável no MVP.
"use strict";

function normalizePhone(raw) {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  // Fallback: retorna como veio (não bloqueia salvar lead).
  return digits;
}

module.exports = { normalizePhone };
