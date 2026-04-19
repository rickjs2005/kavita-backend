// lib/broadcastPreviewTokens.js
//
// Bloco 5 — tokens HMAC para forçar o fluxo 2-passos em broadcast de
// capabilities. Fluxo:
//
//   1. admin chama GET /plans/:id/broadcast-preview
//      → backend calcula capabilities atuais e assinaturas afetadas
//      → emite token `{planId}.{issuedMs}.{hashCaps}.{sig}` (base64url)
//   2. admin inspeciona impacto e clica "aplicar"
//   3. frontend envia PUT /plans/:id com
//      apply_to_active_subscriptions=true + broadcast_confirmation_token
//   4. backend exige token válido, dentro do TTL (10min) e com hash
//      batendo com as capabilities vigentes no exato momento do apply
//
// Se as capabilities mudaram entre preview e apply (outro admin
// editou, ou o mesmo admin editou dentro do mesmo PUT), o hash não
// bate → 409 CONFLICT → frontend pede novo preview.
//
// O token NÃO persiste no banco; a integridade vem da assinatura +
// hash das capabilities, e a "revogação" implícita é o rebuild do
// hash quando o plano muda.

"use strict";

const crypto = require("node:crypto");

const TTL_MS = 10 * 60 * 1000; // 10 minutos

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error(
      "JWT_SECRET ausente — necessário para tokens de broadcast preview.",
    );
  }
  return s;
}

// Hash canônico das capabilities do plano. Objeto é ordenado por
// chave antes de stringificar para evitar flakiness da ordem.
function hashCapabilities(caps) {
  const obj = caps && typeof caps === "object" ? caps : {};
  const keys = Object.keys(obj).sort();
  const canonical = keys.map((k) => [k, obj[k]]);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")
    .slice(0, 16);
}

function sign(planId, issuedMs, hashCaps) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`broadcast:${planId}:${issuedMs}:${hashCaps}`)
    .digest("hex")
    .slice(0, 24);
}

function generateToken(planId, capabilities) {
  const issuedMs = Date.now();
  const hashCaps = hashCapabilities(capabilities);
  const sig = sign(planId, issuedMs, hashCaps);
  const raw = `${planId}.${issuedMs}.${hashCaps}.${sig}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

/**
 * Verifica token contra planId + capabilities correntes.
 * Retorna `{ ok: true }` ou `{ ok: false, reason }`.
 */
function verifyToken(token, planId, capabilities) {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "missing" };
  }
  let decoded;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const parts = decoded.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };
  const [pidStr, issuedStr, hashFromToken, sigFromToken] = parts;
  const tokenPlanId = Number(pidStr);
  const issuedMs = Number(issuedStr);
  if (!Number.isFinite(tokenPlanId) || !Number.isFinite(issuedMs)) {
    return { ok: false, reason: "malformed" };
  }
  if (tokenPlanId !== Number(planId)) {
    return { ok: false, reason: "plan_mismatch" };
  }
  if (Date.now() - issuedMs > TTL_MS) {
    return { ok: false, reason: "expired" };
  }
  const expectedSig = sign(tokenPlanId, issuedMs, hashFromToken);
  try {
    const a = Buffer.from(expectedSig, "utf8");
    const b = Buffer.from(sigFromToken, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: "bad_signature" };
    }
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  // Hash das capabilities precisa bater com o estado atual.
  const currentHash = hashCapabilities(capabilities);
  if (currentHash !== hashFromToken) {
    return { ok: false, reason: "plan_changed" };
  }
  return { ok: true };
}

module.exports = {
  generateToken,
  verifyToken,
  hashCapabilities,
  TTL_MS,
};
