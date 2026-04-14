"use strict";

// lib/unsubscribeTokens.js
//
// Tokens determinísticos para one-click unsubscribe em emails de
// marketing (follow-up, digest, alertas). HMAC-SHA256(email, scope, JWT_SECRET).
//
// Sem tabela: determinístico + timing-safe. Um único link por email
// vale para sempre — CAN-SPAM exige que o opt-out permaneça válido.

const crypto = require("node:crypto");

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET ausente.");
  return s;
}

/** Gera token para (email, scope). Scope default: "marketing". */
function generateUnsubToken(email, scope = "marketing") {
  const normalized = String(email).trim().toLowerCase();
  return crypto
    .createHmac("sha256", getSecret())
    .update(`unsub:${scope}:${normalized}`)
    .digest("hex")
    .slice(0, 32);
}

/** Valida token. Retorna true/false em comparação timing-safe. */
function verifyUnsubToken(email, scope, token) {
  if (typeof token !== "string" || token.length !== 32) return false;
  const expected = generateUnsubToken(email, scope);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(token, "utf8"),
    );
  } catch {
    return false;
  }
}

module.exports = { generateUnsubToken, verifyUnsubToken };
