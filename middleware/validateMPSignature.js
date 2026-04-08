// middleware/validateMPSignature.js
"use strict";

const crypto = require("crypto");
const logger = require("../lib/logger");

/**
 * Middleware: validates Mercado Pago webhook signature (Layer 1 security).
 *
 * Official Mercado Pago HMAC-SHA256 format:
 *   Header x-signature: "ts={timestamp},v1={hmac_hex}"
 *   Header x-request-id: UUID (optional)
 *   Signed manifest: "id:{data.id};request-id:{x-request-id};ts:{ts};"
 *
 * Returns 401 if signature is absent, malformed, or invalid.
 * Returns 401 (fail-closed) when MP_WEBHOOK_SECRET is not configured — in any environment.
 */
function validateMPSignature(req, res, next) {
  const signatureHeader = req.get("x-signature");
  const requestId = req.get("x-request-id") || "";
  const secret = process.env.MP_WEBHOOK_SECRET;

  const unauthorized = () => res.status(401).json({ ok: false });

  if (!signatureHeader) {
    logger.warn("webhook: x-signature header missing");
    return unauthorized();
  }

  if (!secret) {
    logger.error("webhook: MP_WEBHOOK_SECRET not configured — rejecting (fail-closed)");
    // Fail-closed: sem segredo configurado, não processamos webhooks em nenhum ambiente.
    // Retornar 200 (fail-open) em produção permitiria aceitar webhooks sem validação.
    return unauthorized();
  }

  // Parse "ts=1234567890,v1=abcdef..." into { ts, v1 }
  const parts = signatureHeader
    .split(",")
    .map((p) => p.trim().split("="))
    .reduce((acc, [key, val]) => {
      if (key && val !== undefined) acc[key.trim()] = val.trim();
      return acc;
    }, {});

  const ts = parts.ts;
  const v1 = parts.v1;

  if (!ts || !v1) {
    logger.warn("webhook: invalid signature format");
    return unauthorized();
  }

  // Build the official Mercado Pago manifest string
  const dataId = req.body?.data?.id ?? "";
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  const bufA = Buffer.from(expected, "utf8");
  const bufB = Buffer.from(v1, "utf8");

  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    logger.warn("webhook: signature mismatch");
    return unauthorized();
  }

  // Pass validated metadata downstream
  req.mpSignature = { ts, v1, requestId };
  next();
}

module.exports = validateMPSignature;
