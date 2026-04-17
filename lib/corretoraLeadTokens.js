// lib/corretoraLeadTokens.js
//
// Tokens determinísticos para o link de "lote vendido" enviado ao
// produtor. HMAC-SHA256(lead_id, JWT_SECRET) — sem necessidade de
// tabela extra, mas inadivinhável sem o secret.
//
// Esta abordagem é correta para esta finalidade porque:
//   - Não há necessidade de revogação manual (o token expira
//     quando lote_disponivel passa a 0).
//   - Idempotente: clicar 2x no link não causa estado divergente.
//   - Lote vendido por engano? Admin pode reverter via SQL — feature
//     pouco usada, não justifica tabela.
"use strict";

const crypto = require("node:crypto");

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error("JWT_SECRET ausente — necessário para tokens de lote.");
  }
  return s;
}

/** Gera token determinístico para um lead. */
function generateLoteToken(leadId) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`lote:${leadId}`)
    .digest("hex")
    .slice(0, 24); // 24 chars suficientes — ~144 bits, sem timing-safe issue
}

/** Valida token contra leadId. Retorna true/false em comparação constant-time. */
function verifyLoteToken(leadId, token) {
  if (typeof token !== "string" || token.length !== 24) return false;
  const expected = generateLoteToken(leadId);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(token, "utf8"),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sprint 7 — Token de status do lead (produtor consulta o próprio)
// ---------------------------------------------------------------------------
//
// Namespace distinto ("status:" em vez de "lote:") para que o token
// vazado de um fluxo não sirva no outro. Mesma propriedade: determinístico,
// sem tabela de revogação — o status muda quando a corretora age, não
// quando o produtor recarrega a página.

function generateStatusToken(leadId) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`status:${leadId}`)
    .digest("hex")
    .slice(0, 24);
}

function verifyStatusToken(leadId, token) {
  if (typeof token !== "string" || token.length !== 24) return false;
  const expected = generateStatusToken(leadId);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(token, "utf8"),
    );
  } catch {
    return false;
  }
}

module.exports = {
  generateLoteToken,
  verifyLoteToken,
  generateStatusToken,
  verifyStatusToken,
};
